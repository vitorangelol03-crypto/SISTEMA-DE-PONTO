# Edge Functions — Sistema de Ponto

> Referência canônica das edge functions ACTIVE em produção (Supabase project `flcncdidxmmornkgkfbb`).
> Última atualização: 2026-05-12 (sub-fase 12.3).

---

## Visão geral

| Slug | Versão | `verify_jwt` | Função | SHA256 |
|---|---|---|---|---|
| [`auth-login`](#1-auth-login) | v9 | `false` | Emite JWT custom HS256 (login) | `f043db381858c3643004637dc0283162f678c1f83dc8bcb4482f77234b1baca3` |
| [`clock-in-validated`](#2-clock-in-validated) | v8 | `true` | Validação geo + INSERT/UPDATE attendance | `ca2a083148e5c76ae7aa2f5e63bd77c30c12b8e68b4ad4711d363682965021be` |
| [`create-user`](#3-create-user) | v1 | `true` | Bcrypt + INSERT supervisor em `users` | `482bad832a186ca2b857fcd3df680bc6fba22176a05d6f51e4a61c5de788ea06` |

### Stack e convenções comuns

- **Runtime:** Deno (Supabase Edge Runtime).
- **Auth-login** é o **único** com `verify_jwt:false` (emite tokens — precisa aceitar requests anônimos com apenas anon key). As demais aceitam apenas requests autenticadas com JWT custom HS256 emitido pelo `auth-login`.
- **CORS** aberto (`Access-Control-Allow-Origin: *`) em todas — frontend rodando em outros domínios funciona out-of-the-box.
- **Service Role:** todas usam `SUPABASE_SERVICE_ROLE_KEY` injetada automaticamente pelo Supabase pra bypassar RLS quando necessário (insert em tabelas multi-tenant, fetch users por ID, etc.).
- **Bcrypt:** `auth-login` e `create-user` usam `https://esm.sh/bcryptjs@2.4.3` (pure JS, sem deps nativas, compatível com Deno).
- **Erro padrão:** `{ "error": "string", "details"?: "string" }` com status HTTP apropriado.

### Variáveis de ambiente (Edge Function Secrets)

Configuradas via Supabase Dashboard → Settings → Edge Functions → Secrets:

| Var | Necessária por | Setup |
|---|---|---|
| `JWT_SECRET` | `auth-login` | Manual — copiar de Settings → API → "JWT Settings" → JWT Secret (Reveal). Sem prefixo `SUPABASE_`. |
| `SUPABASE_URL` | todas | Injetada automaticamente |
| `SUPABASE_SERVICE_ROLE_KEY` | todas | Injetada automaticamente |

---

## 1. `auth-login`

### Propósito

Login por ID + senha (sem email). Valida via bcrypt e emite JWT custom HS256 de 24h, assinado com o JWT Secret oficial do projeto Supabase. O JWT é aceito pelas RLS policies do Postgres (`auth.jwt() ->> 'company_id'`, `auth.jwt() ->> 'sub'`).

### Endpoint

```
POST {SUPABASE_URL}/functions/v1/auth-login
```

### Headers

```http
Content-Type: application/json
apikey: {VITE_SUPABASE_ANON_KEY}
Authorization: Bearer {VITE_SUPABASE_ANON_KEY}
```

(verify_jwt=false → anon key basta. Não enviar JWT custom; quem chama é cliente anônimo.)

### Request body

```json
{
  "id": "9999",
  "password": "684171"
}
```

### Response 200 (sucesso)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OTk5...",
  "user": {
    "id": "9999",
    "company_id": "6583bb2a-e334-41a7-b69c-7d98f3b46dfc"
  }
}
```

### JWT payload (decodificado)

```json
{
  "sub": "9999",                                              // users.id
  "role": "authenticated",                                    // hardcoded
  "aud": "authenticated",
  "company_id": "6583bb2a-e334-41a7-b69c-7d98f3b46dfc",      // users.company_id
  "iat": 1778605078,                                          // issued at (unix)
  "exp": 1778691478                                           // 24h depois
}
```

Assinatura: HMAC-SHA256(`base64url(header).base64url(payload)`, `JWT_SECRET`).

### Erros

| Status | Body | Causa |
|---|---|---|
| 400 | `{"error":"Missing id or password"}` | Body faltando campos |
| 401 | `{"error":"Invalid credentials"}` | User não existe OU bcrypt.compare = false OU password_hash null |
| 405 | `{"error":"Method not allowed"}` | Method ≠ POST |
| 500 | `{"error":"Server misconfigured","details":"JWT_SECRET missing"}` | JWT_SECRET não configurado |
| 500 | `{"error":"Database error","details":"..."}` | Erro Postgres no SELECT users |
| 500 | `{"error":"Internal server error","details":"..."}` | Exceção não tratada |

### Side effects

- **Read-only.** Não escreve em nenhuma tabela. Só faz SELECT users via service_role.

### Cold start / latência

- **Warm:** ~0.3-0.5s
- **Cold:** ~1.1-1.5s (uso frequente mantém warm)

### Exemplo de invocação (frontend)

```typescript
// src/services/database.ts:loginUser
const resp = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  },
  body: JSON.stringify({ id, password }),
});
const data = await resp.json();
if (!resp.ok || !data?.token) throw new Error('Credenciais inválidas');
setAuthToken(data.token);   // src/lib/supabase.ts recria client com header
```

### curl

```bash
curl -X POST "$SUPABASE_URL/functions/v1/auth-login" \
  -H "Content-Type: application/json" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -d '{"id":"9999","password":"684171"}'
```

### Source

`supabase/functions/auth-login/index.ts`

---

## 2. `clock-in-validated`

### Propósito

Recebe marcações de ponto do app funcionário (`EmployeeClockIn`). Faz **validação real de geolocalização** contra config da empresa (centro + raio), captura tentativas de fraude, cria/atualiza `attendance` row, e bloqueia bonificação semanal se fora da área.

Suporta dois protocolos:
- **Legacy**: `clock_type: 'entry' | 'exit'` (1 entrada + 1 saída por dia)
- **Novo** (multi-marcação): `marking_position: 1 | 2 | 3 | 4` (4 marcações: entrada, saída-almoço, retorno-almoço, saída-final)

### Endpoint

```
POST {SUPABASE_URL}/functions/v1/clock-in-validated
```

### Headers

```http
Content-Type: application/json
apikey: {VITE_SUPABASE_ANON_KEY}
Authorization: Bearer {JWT_CUSTOM}     # opcional na prática — verify_jwt:true mas anon key passa
```

⚠️ **Nota:** apesar de `verify_jwt:true`, o ANON_KEY também é um JWT válido (assinado pelo Supabase). O fluxo não exige JWT custom de supervisor logado — o app funcionário é tipicamente público (URL `/clock`). A segurança vem do **CPF check** dentro da função.

### Request body

```json
{
  "employee_id": "uuid-do-funcionario",
  "cpf": "12345678900",
  "clock_type": "entry",
  "latitude": -19.7905,
  "longitude": -42.1390,
  "accuracy": 12.5,
  "company_id": "6583bb2a-...",        // opcional — se enviado, deve bater com emp.company_id
  "marking_position": 1                 // opcional — cliente novo
}
```

### Response 200 (sucesso geo OK)

```json
{
  "success": true,
  "fraud": false,
  "distance_meters": 47,
  "attendance": {
    "id": "uuid",
    "employee_id": "uuid",
    "company_id": "uuid",
    "date": "2026-05-12",
    "status": "present",
    "entry_time": "2026-05-12T11:00:00.000Z",
    "entry_1_time": "2026-05-12T11:00:00.000Z",   // se cliente novo
    "entry_latitude": -19.7905,
    "entry_longitude": -42.1390,
    "geo_valid": true,
    "geo_distance_meters": 47,
    "approval_status": "pending"
    // ... outros campos
  }
}
```

### Response 200 (geo fraude detectada — fluxo bloqueado)

```json
{
  "success": false,
  "fraud": true,
  "distance_meters": 850,
  "message": "Fora da área permitida (850m)"
}
```

Side effects:
- INSERT em `geo_fraud_attempts` (auditoria)
- UPSERT em `bonus_blocks` (semana toda perde bônus)
- Se `isFirstEntry`: também faz UPSERT em `attendance` com `geo_valid: false, approval_status: 'pending'`

### Erros

| Status | Body | Causa |
|---|---|---|
| 400 | `{"error":"employee_id, cpf e clock_type obrigatórios"}` | Body incompleto |
| 400 | `{"error":"clock_type deve ser 'entry' ou 'exit'"}` | clock_type inválido |
| 400 | `{"error":"marking_position deve ser 1, 2, 3 ou 4"}` | Posição inválida |
| 400 | `{"error":"marking_position=N requer clock_type='entry|exit'"}` | Incoerência clock_type ↔ marking_position |
| 400 | `{"error":"Nenhuma entrada (posição 1) registrada hoje"}` | Marcação 2/3/4 sem entry prévia |
| 400 | `{"error":"Nenhuma entrada registrada hoje"}` | Legacy exit sem entry |
| 403 | `{"error":"CPF não confere"}` | CPF body ≠ employees.cpf |
| 403 | `{"error":"Funcionário não pertence à empresa selecionada"}` | body.company_id ≠ emp.company_id |
| 404 | `{"error":"Funcionário não encontrado"}` | employee_id não existe |
| 500 | `{"error":"Configuração de geolocalização da empresa não encontrada"}` | companies.default_geo_lat/lng nulo |
| 500 | `{"error":"<pg error>"}` | Erro UPSERT/UPDATE attendance |

### Side effects

- **`attendance`** (UPSERT em `employee_id,date`): cria row com entry ou atualiza com exit/hours/night_additional.
- **`geo_fraud_attempts`** (INSERT): toda vez que `geoValid = false`.
- **`bonus_blocks`** (UPSERT em `employee_id,week_start`): se `isFirstEntry && !geoValid`.
- **`error_logs`** (INSERT best-effort): se algum dos 4 writes auxiliares acima falhar, persiste o erro pra auditoria multi-empresa (sub-fase 8.4, TECH_DEBT 6.12 resolvido).

### Configuração de geolocalização

Resolve em 2 camadas:
1. **Base**: `companies.default_geo_lat`, `default_geo_lng`, `default_geo_radius`
2. **Override por empresa**: `geolocation_config.latitude/longitude/allowed_radius_meters/block_outside`

Se base nulo → 500. Override nulo → usa base.

### Cold start / latência

- **Warm:** ~0.2-0.4s
- **Cold:** ~1.1-1.5s

### Source

`supabase/functions/clock-in-validated/index.ts`

---

## 3. `create-user`

### Propósito

Cria novo supervisor com bcrypt server-side. Substitui o INSERT direto frontend (que tentava INSERT em `users.password` plain — coluna dropada na sub-fase 11.1). Implementado na **sub-fase 11.7**.

### Endpoint

```
POST {SUPABASE_URL}/functions/v1/create-user
```

### Headers

```http
Content-Type: application/json
apikey: {VITE_SUPABASE_ANON_KEY}
Authorization: Bearer {JWT_CUSTOM_DO_ADMIN}    # obrigatório — JWT do auth-login
```

### Request body

```json
{
  "id": "1234",
  "password": "supervisor-pw",
  "role": "supervisor",
  "companyId": "6583bb2a-e334-41a7-b69c-7d98f3b46dfc"
}
```

### Response 200 (sucesso)

```json
{
  "ok": true,
  "user": {
    "id": "1234",
    "role": "supervisor",
    "company_id": "6583bb2a-e334-41a7-b69c-7d98f3b46dfc"
  }
}
```

Side effect: INSERT em `users` com:
- `id`: do body
- `password_hash`: `bcryptjs.hash(password, 10)` — `$2a$10$...` (60 chars)
- `role`: `'supervisor'`
- `created_by`: `sub` extraído do JWT do caller
- `company_id`: do body

### Erros

| Status | Body | Causa |
|---|---|---|
| 400 | `{"error":"Invalid JSON body"}` | Body não-JSON |
| 400 | `{"error":"Missing required fields: id, password, role, companyId"}` | Campo faltando |
| 400 | `{"error":"Invalid id"}` | id vazio após trim |
| 400 | `{"error":"Password must be at least 6 chars"}` | password < 6 chars |
| 400 | `{"error":"Invalid role — only supervisor can be created"}` | role ≠ 'supervisor' |
| 400 | `{"error":"Invalid companyId"}` | companyId vazio |
| 401 | `{"error":"Missing Authorization"}` | Sem header Authorization |
| 401 | `{"error":"Invalid JWT"}` | JWT mal-formado OU sem `sub` no payload |
| 403 | `{"error":"Forbidden — sem permissão users.create"}` | Caller não é admin '9999' E não tem `permissions.users.create=true` |
| 405 | `{"error":"Method not allowed"}` | Method ≠ POST |
| 409 | `{"error":"ID já existe"}` | UNIQUE violation (Postgres code `23505`) |
| 500 | `{"error":"Database error","details":"..."}` | Falha SELECT users (caller fetch) |
| 500 | `{"error":"Hash error"}` | bcryptjs.hash falhou |
| 500 | `{"error":"Insert failed","details":"..."}` | Falha INSERT users |
| 500 | `{"error":"Internal server error","details":"..."}` | Exceção não tratada |

### Permission check (replica `validatePermission` do frontend)

```typescript
async function callerCanCreateUser(callerId: string): Promise<boolean> {
  if (callerId === '9999') return true;                                  // admin master

  const caller = await SELECT users.role WHERE id = callerId;
  if (!caller) return false;
  if (caller.role === 'admin') return true;                              // qualquer admin

  const permRow = await SELECT user_permissions.permissions WHERE user_id = callerId;
  return Boolean(permRow?.permissions?.users?.create);                    // supervisor com perm
}
```

### Side effects

- **`users`** (INSERT): cria row com bcrypt password_hash.
- Read-only em `user_permissions` (pra permission check).

### Cold start / latência

- **Warm:** ~0.5-0.6s (~0.57s medido)
- **Cold (primeira chamada pós-deploy):** **até 150s (IDLE_TIMEOUT)** — depende de `https://esm.sh/bcryptjs@2.4.3` + `jsr:@supabase/supabase-js@2` download. Característica conhecida, vide [TECH_DEBT 6.13](../TECH_DEBT.md#613--cold-start-latency-edge-functions). UI deve mostrar spinner com aviso "pode levar até 2 minutos no primeiro uso".

### Exemplo de invocação (frontend)

```typescript
// src/services/database.ts:createUser
const token = getAuthToken();      // sessionStorage('sb-custom-token')
if (!token) throw new Error('Sessão inválida');

const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ id, password, role, companyId }),
});
const data = await resp.json();
if (!resp.ok) {
  if (resp.status === 409) throw new Error('ID já existe');
  throw new Error(data?.error || 'Falha ao criar usuário');
}
```

### curl

```bash
# 1. Login admin
JWT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/auth-login" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -d '{"id":"9999","password":"684171"}' | jq -r .token)

# 2. Cria supervisor
curl -X POST "$SUPABASE_URL/functions/v1/create-user" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $JWT" \
  -d '{"id":"1234","password":"supervisor-pw","role":"supervisor","companyId":"6583bb2a-e334-41a7-b69c-7d98f3b46dfc"}'
```

### Source

`supabase/functions/create-user/index.ts`

---

## Operações comuns

### Deploy de uma edge fn

Via MCP no Claude Code:
```typescript
mcp__claude_ai_Supabase__deploy_edge_function({
  project_id: 'flcncdidxmmornkgkfbb',
  name: 'create-user',
  entrypoint_path: 'index.ts',
  verify_jwt: true,
  files: [{ name: 'index.ts', content: '...' }]
})
```

Via Supabase CLI (local):
```bash
supabase functions deploy create-user --project-ref flcncdidxmmornkgkfbb
```

### Listar edge fns ACTIVE

```typescript
mcp__claude_ai_Supabase__list_edge_functions({ project_id: 'flcncdidxmmornkgkfbb' })
```

### Inspecionar logs

```typescript
mcp__claude_ai_Supabase__get_logs({ project_id: 'flcncdidxmmornkgkfbb', service: 'edge-function' })
```

Via Dashboard: Functions → `<slug>` → Logs tab.

### Re-fetch source da versão ACTIVE

```typescript
mcp__claude_ai_Supabase__get_edge_function({ project_id: 'flcncdidxmmornkgkfbb', function_slug: 'create-user' })
```

---

## Histórico de versões

| Slug | v | Sub-fase | Mudança |
|---|---|---|---|
| `auth-login` | v1-v5 | 11.3 (parcial) | iterações de bcrypt + JWT generation |
| `auth-login` | v6 | 11.3 (parcial) | bcryptjs.compare + fallback plain durante transição |
| `auth-login` | v7 | 11.3 | JWT generation com JWT_SECRET configurado |
| `auth-login` | v8 | 11.1 | post cutover — só bcrypt (sem fallback plain) |
| `auth-login` | **v9** | atual | refactor mínimo (limpeza de logs) |
| `clock-in-validated` | v1-v5 | pre-Fase 8 | versões iniciais sem error handling |
| `clock-in-validated` | v6 | 8.4 | error handling em 4 writes silenciosos (TECH_DEBT 6.12 resolvido) |
| `clock-in-validated` | v7 | 11.4 (parcial) | preparação pra verify_jwt:true |
| `clock-in-validated` | **v8** | 11.4 | `verify_jwt:true` ativado |
| `create-user` | **v1** | 11.7 | criação inicial — bcrypt + permission check |

---

## Cross-references

- **`CHECKPOINT.md`** — estado canônico de sessão, 8 regras, fluxo de auth detalhado
- **`TECH_DEBT.md` 6.13** — cold start latency conhecida
- **`ARCHITECTURE.md`** — diagramas Mermaid do fluxo completo (próxima sub-fase 12.4)
- **`docs/security-baseline-post-rls.md`** — audit RLS pós-Fase 11
- **`README.md`** — overview do sistema
