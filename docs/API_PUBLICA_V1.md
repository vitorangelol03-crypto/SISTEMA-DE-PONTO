# API Pública v1 — Sistema de Ponto

> **Sub-fase 17.6 (2026-05-16) — MVP READ-ONLY.**
> Endpoint pra integrações externas (ERPs, dashboards de BI, etc.) acessarem
> dados Sistema de Ponto via REST com API key.

---

## Base URL

```
https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/public-api-v1
```

---

## Autenticação

Toda request precisa de **2 headers**:

| Header | Valor | Por quê |
|---|---|---|
| `X-API-Key` | Sua API key (gerada pelo admin via SQL — UI follow-up) | Identifica a empresa e valida scope |
| `apikey` ou `Authorization: Bearer <ANON_KEY>` | Anon key do Supabase | Edge fn verify_jwt=true requer |

**Anon key:** `VITE_SUPABASE_ANON_KEY` do `.env` (pode commitar — RLS bloqueia escrita).

---

## Endpoints

### `GET /` ou `GET /health`

Health check (sem auth).

**Response 200:**
```json
{"status":"ok","version":"v1","endpoints":["GET /employees"]}
```

### `GET /employees?limit=100&offset=0`

Lista todos employees da empresa dona da API key, paginados.

**Scope requerido:** `read:employees`

**Query params:**
- `limit` (default 100, max 500) — registros por página
- `offset` (default 0) — offset pra paginação

**Request:**
```bash
curl -sS -X GET "https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/public-api-v1/employees" \
  -H "X-API-Key: sp_test_key_caratinga_2026" \
  -H "apikey: <ANON_KEY>"
```

**Response 200:**
```json
{
  "employees": [
    {
      "id": "uuid",
      "name": "Funcionário Nome",
      "cpf": "12345678900",
      "employment_type": "Carteira Assinada" | "Diarista" | "PJ" | null,
      "function_role": "Motorista" | null,
      "address": "Rua X, 123" | null,
      "city": "Caratinga" | null,
      "state": "MG" | null,
      "hire_date": "2026-01-01" | null,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "count": 47,
  "limit": 100,
  "offset": 0
}
```

### `GET /attendance?from=YYYY-MM-DD&to=YYYY-MM-DD&employee_id=<uuid>&limit=100&offset=0`

Lista registros de ponto (attendance) da empresa, com filtros opcionais.

**Scope requerido:** `read:attendance`

**Query params:**
- `from`, `to` (opcionais) — range de datas (YYYY-MM-DD)
- `employee_id` (opcional, UUID) — filtra por funcionário específico
- `limit`, `offset` — paginação (max 500)

**Request:**
```bash
curl -sS -X GET "https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/public-api-v1/attendance?from=2026-05-01&to=2026-05-15&limit=50" \
  -H "X-API-Key: <sua key>" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

**Response 200:**
```json
{
  "attendance": [
    {
      "id": "uuid",
      "employee_id": "uuid",
      "date": "2026-05-15",
      "status": "present" | "absent" | "vacation" | "sick" | ...,
      "entry_time": "2026-05-15T08:00:00Z" | null,
      "exit_time": "17:30:00" | null,
      "exit_time_full": "2026-05-15T17:30:00Z" | null,
      "marked_by": "9999" | null,
      "approved_by": "9999" | null,
      "created_at": "2026-05-15T08:00:00Z"
    }
  ],
  "count": 3130,
  "limit": 50,
  "offset": 0,
  "filters": { "from": "2026-05-01", "to": "2026-05-15", "employee_id": null }
}
```

### `GET /payments?period_id=<uuid>&from=&to=&employee_id=&limit=100&offset=0`

Lista pagamentos da empresa, com filtros opcionais.

**Scope requerido:** `read:payments`

**Query params:**
- `period_id` (opcional, UUID) — filtra por payment_period (resolve datas auto)
- `from`, `to` (opcionais) — range de datas
- `employee_id` (opcional) — filtra por funcionário
- `limit`, `offset` — paginação

**Request:**
```bash
curl -sS -X GET "https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/public-api-v1/payments?period_id=<uuid>" \
  -H "X-API-Key: <sua key>" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

**Response 200:**
```json
{
  "payments": [
    {
      "id": "uuid",
      "employee_id": "uuid",
      "date": "2026-05-15",
      "daily_rate": 100.00,
      "bonus_b": 15.00,
      "bonus_c1": 20.00,
      "bonus_c2": 15.00,
      "created_by": "9999",
      "created_at": "2026-05-15T08:00:00Z",
      "updated_at": "2026-05-15T08:00:00Z"
    }
  ],
  "count": 1727,
  "limit": 100,
  "offset": 0,
  "filters": { "period_id": null, "from": null, "to": null, "employee_id": null }
}
```

---

## Códigos de erro

| Code | HTTP | Significado |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing/invalid X-API-Key |
| `FORBIDDEN` | 403 | Key sem scope necessário |
| `NOT_FOUND` | 404 | Endpoint desconhecido |
| `INTERNAL` | 500 | Erro DB ou interno |

---

## Gerar nova API key (manual via SQL)

UI de admin pra gerar keys fica como follow-up. Por agora, gerar via SQL:

```sql
-- 1. Gerar key plain (use algo random — ex: openssl rand -hex 32)
-- 2. Hash via pgcrypto e inserir:

INSERT INTO public.api_keys (key_hash, key_prefix, label, company_id, scopes, created_by, expires_at)
VALUES (
  crypt('sk_minhakey_aqui_random_2026', gen_salt('bf', 10)),  -- ← plain key (mostre UMA vez ao cliente)
  'sk_minha',                                                  -- ← primeiros 8 chars pra display
  'Integração ERP Bling',                                      -- ← descrição humana
  '6583bb2a-e334-41a7-b69c-7d98f3b46dfc',                     -- ← Caratinga ID
  ARRAY['read:employees']::TEXT[],                             -- ← scopes
  '9999',                                                      -- ← admin que criou
  NOW() + INTERVAL '1 year'                                    -- ← expires (opcional, NULL = nunca)
);
```

**Revogar key:**
```sql
UPDATE public.api_keys SET revoked_at = NOW() WHERE label = 'Integração ERP Bling';
```

**Listar keys ativas:**
```sql
SELECT id, key_prefix, label, company_id, scopes, expires_at, last_used_at, call_count
FROM public.api_keys
WHERE revoked_at IS NULL
ORDER BY created_at DESC;
```

---

## Auditoria

Cada chamada autenticada incrementa `call_count` e atualiza `last_used_at`.
Ver via SQL acima.

Tentativas com key inválida não são logadas (privacidade — não confirma se
key existe).

---

## Limitações v1.1

- **Read-only**: sem POST/PUT/DELETE. Write scopes (`write:attendance`,
  `write:employees`) fica como follow-up.
- **Sem rate limiting por key**: cliente pode hammerar. Supabase Edge Functions
  tem rate limit global do projeto (~500/s) — proteção mínima.
- **Sem versionamento de campos**: response shape pode mudar — clientes devem
  ignorar campos desconhecidos.
- **Scopes disponíveis** (sub-fase 17.6.1): `read:employees`, `read:attendance`,
  `read:payments`

---

## Roadmap (follow-ups)

- ✅ ~~`GET /attendance?from=&to=`~~ — implementado em 17.6.1
- ✅ ~~`GET /payments?period_id=`~~ — implementado em 17.6.1
- `POST /clock-in` (write scope) — marcar ponto via integração
- UI admin pra gerar/revogar keys (atualmente via SQL direto)
- Rate limiting por key
- Webhook subscriptions (notificações de eventos)
- Endpoints adicionais: `GET /companies`, `GET /bonus_types`, `GET /error_records`

---

**Versão atual:** `public-api-v1` (Supabase Edge Function v1)
**Status:** ACTIVE
**Última atualização:** 2026-05-16
