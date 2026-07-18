# Architecture — Sistema de Ponto

> Documento de arquitetura canônico. Reflete o estado pós-Fase 11 (multi-tenant RLS + bcrypt + JWT custom).
> Última atualização: 2026-05-12 (sub-fase 12.4).

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Multi-tenancy](#2-multi-tenancy)
3. [Fluxo de autenticação](#3-fluxo-de-autenticação)
4. [Row Level Security](#4-row-level-security)
5. [Edge Functions](#5-edge-functions)
6. [Modelo de dados](#6-modelo-de-dados)
7. [Topologia de deployment](#7-topologia-de-deployment)
8. [Decisões arquiteturais (ADRs)](#8-decisões-arquiteturais-adrs)
9. [Referências cruzadas](#9-referências-cruzadas)

---

## 1. Visão geral

Sistema de controle de ponto **multi-tenant** com 100% do backend em Supabase (PostgreSQL + Edge Functions). Frontend single-page React + TypeScript, deployável em qualquer hosting estático.

### Componentes principais

```mermaid
flowchart LR
    subgraph Cliente
        FE[React SPA<br/>Vite + TypeScript]
        EmpClock[Employee Clock-In<br/>PWA mode /clock]
    end

    subgraph Supabase Edge
        AuthFn["auth-login<br/>(verify_jwt:false)"]
        ClockFn["clock-in-validated<br/>(verify_jwt:true)"]
        CreateFn["create-user<br/>(verify_jwt:true)"]
    end

    subgraph Supabase Postgres
        DB[(PostgreSQL 17.6<br/>47 tabelas com RLS)]
        RLS{RLS Engine}
        RPCs[SECURITY DEFINER RPCs<br/>apply_bank_hours, verify_admin_secret, update_admin_secret]
    end

    FE -->|POST id/password| AuthFn
    AuthFn -->|service_role| DB
    AuthFn -->|JWT HS256 24h| FE

    FE -->|Bearer JWT custom| RLS
    RLS --> DB

    EmpClock -->|anon key| ClockFn
    ClockFn -->|service_role| DB

    FE -->|Bearer JWT custom| CreateFn
    CreateFn -->|service_role| DB

    FE -->|rpc/...| RPCs
    RPCs --> DB
```

### Stack resumo

| Camada | Tecnologia |
|---|---|
| Frontend | React 18.3 + TypeScript 5.5 + Vite 5.4 + Tailwind 3.4 |
| Hosting | Estático (Vercel/Netlify/qualquer) |
| Backend API | Supabase REST (gerado pelo PostgreSQL) |
| Backend lógica custom | Supabase Edge Functions (Deno) |
| Banco | PostgreSQL 17.6 hospedado Supabase sa-east-1 |
| Auth | JWT custom HS256 emitido por edge fn (sem Supabase Auth padrão) |
| Hash de senhas | bcrypt $2a$10$ via `https://esm.sh/bcryptjs@2.4.3` |
| Testes | Vitest 4 (unit, 422 tests) + Playwright 1.59 (E2E, 35+ specs) |

---

## 2. Multi-tenancy

### Modelo

**Soft multi-tenancy** com `company_id` (uuid) em todas as tabelas operacionais. Cada empresa é uma row em `companies`. Não há schemas separados, databases separados ou row partitioning explícito — isolation é puramente lógico via RLS.

### Empresas em produção

| Empresa | UUID | Status |
|---|---|---|
| **Caratinga** (CLAYTON B DOS SANTOS) | `6583bb2a-e334-41a7-b69c-7d98f3b46dfc` | Operação ativa — ~30 employees, ~3130 attendances, ~1722 payments |
| **Ponte Nova** (CD LOGISTICA LTDA) | `2b2abc4b-084c-4cf0-b5f1-02792513241d` | Onboarding — 1 admin user (8888), demais dados pendentes |

### Roles

```mermaid
flowchart TD
    User[users.role]
    User --> Admin["admin<br/>(IDs 9999, 8888, ...)"]
    User --> Supervisor[supervisor]

    Admin -->|admin master '9999'| Master[Bypass RLS em todas as tabelas<br/>via auth.jwt sub = '9999']
    Admin -->|admin local da empresa| LocalAdmin[Vê apenas company_id atrelada<br/>via auth.jwt company_id]
    Supervisor -->|permissions granulares| Perms[user_permissions.permissions jsonb<br/>users.*, employees.*, attendance.*, financial.*,<br/>errors.*, datamanagement.*, etc.]
```

### Switcher de empresa

Apenas admin master pode trocar de empresa em runtime — UI em `CompanySwitcher` (header).

- Persistência: `localStorage['sistema_ponto_company_id']`
- O JWT em si **não** é re-emitido — `auth.jwt() ->> 'company_id'` continua sendo o do login. O switch afeta apenas o UI/state (`CompanyContext`), e como admin master tem bypass nas policies, ele continua vendo todas as tabelas.

Supervisor: empresa atrelada via `users.company_id` (NOT NULL, default Caratinga). Frontend usa o `company_id` retornado do `auth-login`.

---

## 3. Fluxo de autenticação

### Sequence diagram completo

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuário
    participant F as Frontend
    participant SB as Supabase JS Client
    participant AL as Edge fn auth-login
    participant PG as PostgreSQL
    participant RLS as RLS Engine

    U->>F: digita id + senha
    F->>SB: loginUser(id, password)
    SB->>AL: POST /auth-login<br/>{id, password}<br/>Bearer ANON_KEY
    AL->>PG: SELECT users.password_hash<br/>WHERE id=?<br/>(via service_role, bypassa RLS)
    PG-->>AL: { id, company_id, password_hash }
    AL->>AL: bcryptjs.compare(password, hash)
    alt válido
        AL->>AL: signJWT({sub, role:'authenticated',<br/>aud, company_id, exp:24h})<br/>HMAC-SHA256(data, JWT_SECRET)
        AL-->>SB: { token, user: {id, company_id} }
        SB->>SB: setAuthToken(token)<br/>(recria client com<br/>global.headers.Authorization)
        SB->>SB: sessionStorage['sb-custom-token'] = token
        SB->>PG: SELECT * FROM users WHERE id=?<br/>Bearer JWT_CUSTOM
        PG->>RLS: check auth.jwt() ->> 'company_id'
        RLS-->>PG: ok (HS256 verified by JWT_SECRET)
        PG-->>SB: full user row
        SB-->>F: User
        F->>U: redireciona para home
    else inválido
        AL-->>SB: 401 { error: "Invalid credentials" }
        SB-->>F: Error
        F->>U: "Credenciais inválidas"
    end
```

### Detalhes operacionais

- **JWT_SECRET** é o "JWT Secret" oficial do projeto Supabase (Settings → API → JWT Settings). Configurado no Edge Function Secrets pra `auth-login` poder assinar tokens que o PostgreSQL valida nativamente.
- **Persistência de sessão:** `sessionStorage` (não `localStorage`) — token some quando aba fecha. Logout explícito via `clearAuthToken`.
- **Client mutável:** `src/lib/supabase.ts` usa Proxy pra que `import { supabase }` resolva dinamicamente o client atual. Quando `setAuthToken` é chamado, o client subjacente é trocado e todos os imports vêem o novo header.
- **Refresh de token:** não implementado. Expira em 24h — usuário re-faz login. Aceitável pro caso de uso (admin/supervisor não usam o sistema continuamente além de 24h sem fechar aba).

---

## 4. Row Level Security

### Pattern canônico

Todas as 32 tabelas core seguem o mesmo template:

```sql
ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabela>_select" ON public.<tabela>
  FOR SELECT TO public
  USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    OR (auth.jwt() ->> 'sub') = '9999'
  );

CREATE POLICY "<tabela>_insert" ON public.<tabela>
  FOR INSERT TO public
  WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    OR (auth.jwt() ->> 'sub') = '9999'
  );

-- update + delete análogos
```

74 policies dormentes foram criadas na sub-fase 11.2 e ativadas atomicamente na 11.1 (cutover ENABLE RLS + DROP password plain numa migration única — evita janela de incosistência).

### Exceções estruturais

| Tabela | Policy especial | Motivo |
|---|---|---|
| `companies` | `SELECT TO public USING (true)` | Frontend precisa listar empresas pré-login (CompanySelector) |
| `admin_secret` | DENY ALL | Acesso apenas via RPC `verify_admin_secret` / `update_admin_secret` (SECURITY DEFINER) |
| `error_logs` | `company_id IS NULL` aceito | Edge fns podem logar erros sem company_id resolvido ainda |
| 7 admin-only | Sem clause company_id, apenas `sub = '9999'` | activity_logs, audit_logs, cleanup_logs, etc. são globais |

### Garantias

- ✅ Login com supervisor da Caratinga: vê apenas dados Caratinga.
- ✅ Login com supervisor de Ponte Nova: vê apenas dados Ponte Nova.
- ✅ Login com admin master '9999': vê todas as empresas (bypass).
- ✅ Sem login (anon key): vê apenas `companies` SELECT — todas as outras tabelas bloqueadas.

### Validação

Audit trail completo em `docs/security-baseline-post-rls.md`. Specs E2E `25-multi-company-isolation` + `26-multi-company-ui-isolation` validam empiricamente.

---

## 5. Edge Functions

### Topologia

```mermaid
flowchart TB
    subgraph Frontend
        Login[LoginForm]
        Clock[EmployeeClockIn]
        Users[UsersTab]
    end

    subgraph Edge_Runtime[Supabase Edge Runtime - Deno]
        AL[auth-login v9<br/>verify_jwt:false]
        CIV[clock-in-validated v8<br/>verify_jwt:true]
        CU[create-user v1<br/>verify_jwt:true]
    end

    subgraph PG[PostgreSQL]
        Users_T[(users)]
        Att[(attendance)]
        Geo[(geo_fraud_attempts)]
        Bonus[(bonus_blocks)]
        EL[(error_logs)]
        UP[(user_permissions)]
        Comp[(companies)]
        GC[(geolocation_config)]
    end

    Login -->|ANON_KEY| AL
    AL -->|SELECT password_hash<br/>service_role| Users_T

    Clock -->|ANON_KEY| CIV
    CIV -->|service_role| Users_T
    CIV --> Att
    CIV --> Geo
    CIV --> Bonus
    CIV --> EL
    CIV --> Comp
    CIV --> GC

    Users -->|JWT custom| CU
    CU -->|service_role| Users_T
    CU --> UP
```

Detalhes de cada edge fn em [`docs/edge-functions.md`](docs/edge-functions.md).

### Por que edge functions em vez de RPCs PL/pgSQL?

| Edge fn | Por que não RPC? |
|---|---|
| `auth-login` | Precisa de bcrypt — Postgres tem `pgcrypto.crypt`, mas o ecossistema bcryptjs é mais estabelecido + permite migração futura pra outros backends |
| `clock-in-validated` | Lógica geo (Haversine), business rules (entry/exit, marking_position 1-4), múltiplos writes com error logging best-effort |
| `create-user` | bcrypt + permission check em jsonb |

RPCs PL/pgSQL (SECURITY DEFINER) são usadas onde a lógica é puramente SQL:
- `apply_bank_hours_to_payment` — transacional, múltiplos UPDATEs encadeados
- `verify_admin_secret`, `update_admin_secret` — bcrypt via `pgcrypto.crypt(input, hash) = hash`

---

## 6. Modelo de dados

### Diagrama ER simplificado (core)

```mermaid
erDiagram
    companies ||--o{ users : "tem"
    companies ||--o{ employees : "tem"
    companies ||--o{ payment_periods : "tem"

    users ||--o| user_permissions : "tem"
    users ||--o{ permission_logs : "loga mudanças"

    employees ||--o{ attendance : "marca"
    employees ||--o{ payments : "recebe"
    employees ||--o{ bonuses : "ganha"
    employees ||--o{ bonus_removals : "perde"
    employees ||--o{ bonus_blocks : "bloqueado"
    employees ||--o{ error_records : "associado"
    employees ||--o{ face_auth_attempts : "tentativas"
    employees ||--o{ geo_fraud_attempts : "fraudes geo"

    payment_periods ||--o{ payments : "agrupa"
    bonus_types ||--o{ bonuses : "tipifica"
    triage_errors ||--o{ triage_error_distributions : "distribui"
    triage_error_distributions ||--o{ triage_distribution_employees : "atribui a"

    companies {
        uuid id PK
        text name
        text cnpj
        numeric default_geo_lat
        numeric default_geo_lng
        int default_geo_radius
        timestamptz created_at
    }

    users {
        text id PK
        text password_hash
        text role
        text created_by
        uuid company_id FK
        timestamptz created_at
    }

    employees {
        uuid id PK
        text name
        text cpf
        text pin
        text badge_number
        text pis
        text employment_type
        int[] expected_schedule
        uuid company_id FK
        text created_by
        timestamptz created_at
    }

    attendance {
        uuid id PK
        uuid employee_id FK
        uuid company_id FK
        date date
        text status
        timestamptz entry_time
        timestamptz exit_time_full
        timestamptz entry_1_time
        timestamptz exit_1_time
        timestamptz entry_2_time
        timestamptz exit_2_time
        numeric hours_worked
        numeric night_hours
        numeric night_additional
        numeric entry_latitude
        numeric entry_longitude
        boolean geo_valid
        int geo_distance_meters
        text approval_status
        text clock_source
    }
```

### Convenções

- **PK:** uuid (gerada por `gen_random_uuid()` ou `uuid_generate_v4`) — exceto `users.id` que é text (ID numérico user-facing).
- **FK:** `company_id` (uuid) em todas as tabelas operacionais, com default Caratinga pra inserts esquecidos.
- **Timestamps:** `created_at timestamptz DEFAULT now()`. Soft-delete não usado — DELETE é hard.
- **JSONB:** apenas `user_permissions.permissions` (estrutura modular).
- **Constraint single-row per period:** `UNIQUE(employee_id, date)` em attendance; `UNIQUE(employee_id, week_start)` em bonus_blocks; `UNIQUE(company_id)` em admin_cleanup_config (lazy-create pattern, sub-fase 7.2).

### Tabelas legado (15) — isolar

Compartilham o projeto Supabase mas pertencem ao produto "Objetos Perdidos":
`drivers`, `lost_evidence`, `lost_proof_images`, `lost_proof_requests`, `lost_reports`, `route_groups`, `route_mapping`, `routes`, `driver_overrides`, `driver_route_links`, `ai_reports`, `city_cache`, `dashboard_meta`, `search_history`, `tickets`.

**Não tocar** — políticas RLS próprias (RLS-always-true semelhantes a public access), apenas isolated por convenção. Backup_* tables foram dropadas na sub-fase 11.0.

---

## 7. Topologia de deployment

```mermaid
flowchart LR
    Dev[Developer<br/>local machine]
    Repo[(GitHub repo)]
    CI{Build CI<br/>vercel/netlify}
    CDN[CDN edge]
    User[Browser/PWA]
    SBEdge[Supabase Edge<br/>Functions sa-east-1]
    SBPG[Supabase Postgres<br/>sa-east-1]

    Dev -->|git push| Repo
    Repo -->|webhook| CI
    CI -->|build npm run build| CDN
    User -->|HTTPS| CDN
    CDN -->|static assets| User
    User -->|fetch /functions/v1/...| SBEdge
    User -->|fetch /rest/v1/...| SBPG
    SBEdge -->|service_role| SBPG

    Dev -.->|MCP/CLI deploy| SBEdge
    Dev -.->|migrations| SBPG
```

### Variáveis de ambiente

| Local | Variável | Necessária pra |
|---|---|---|
| `.env` (frontend) | `VITE_SUPABASE_URL` | runtime |
| `.env` (frontend) | `VITE_SUPABASE_ANON_KEY` | runtime |
| `.env` (frontend) | `SUPABASE_SERVICE_ROLE_KEY` | apenas testes E2E (`tests/cleanup.ts:getClient`) |
| Supabase Dashboard | `JWT_SECRET` (Edge Function Secret) | `auth-login` assinar tokens |

### Smoke test pós-deploy

```bash
# 1. Frontend serve?
curl -I https://<seu-dominio>/

# 2. Login admin funciona?
curl -X POST "$SUPABASE_URL/functions/v1/auth-login" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -d '{"id":"9999","password":"<senha>"}' | jq

# 3. Lista tabelas via service_role responde?
# (no Supabase Dashboard SQL Editor)
SELECT COUNT(*) FROM companies;
```

---

## 8. Decisões arquiteturais (ADRs)

Decisões D1-D6 foram tomadas durante a refatoração multi-empresa (Fases 7-11). Todas validadas com Victor e implementadas.

### D1 — Cálculo de `nightCreditMinutes` (sub-fase 8.3)

**Contexto:** Antes da Fase 8, `nighttime_minutes` era calculado independentemente de horas worked totais — gerando dupla-contagem em alguns cenários.

**Decisão:** **C — Diurno primeiro** — calcula primeiro `daytimeMinutes` no shift, depois `nighttimeMinutes` é o resíduo após 22:00 e antes de 05:00 BRT.

**Status:** ✅ Implementado em `src/utils/attendanceCalc.ts:computeNighttimeMinutes`. `nightDebitMinutes = 0` (decisão técnica conservadora — não aplica multiplier noturno a débitos).

### D2 — `admin_cleanup_config` strategy (sub-fase 7.2 + 7.2.1)

**Contexto:** Tabela tinha apenas 1 row global, mas sistema virou multi-tenant.

**Decisão:** **ES — Estrutural** — `UNIQUE(company_id)` + lazy-create no primeiro acess via UPSERT. Sem migration de backfill (config default é criada on-demand).

**Status:** ✅ commits `19a72f3`, `0840f9c`.

### D3 — RLS strategy (sub-fase 11.2 + 11.1)

**Contexto:** Sistema usa login custom (não Supabase Auth). RLS policies precisam validar empresa de forma confiável.

**Opções:**
- A — Session-based (`current_setting('app.current_company_id')`)
- B — RPC-only (todas as queries via RPC com `SECURITY INVOKER`)
- **C — JWT custom HS256** assinado com JWT_SECRET oficial

**Decisão:** **C** — JWT custom HS256. Aceito pelo Postgres porque o secret é o JWT Secret oficial. Policies leem `auth.jwt() ->> 'company_id'`.

**Trade-offs aceitos:**
- ➕ Sem mudança no padrão do client supabase-js (`global.headers.Authorization`)
- ➕ Cada request REST trafega o token uma vez
- ➕ Validação nativa do Postgres (sem RPC overhead)
- ➖ JWT_SECRET precisa estar em Edge Function Secrets (manual setup)
- ➖ Re-issue do token via login pra refresh

**Status:** ✅ commits `27b7796`, `23dc365`. JWT_SECRET configurado em 2026-05-12.

### D4 — Hash de senhas (sub-fase 11.3)

**Contexto:** Coluna `users.password` plain text era ERROR de segurança (advisor `sensitive_columns_exposed`).

**Opções:**
- A — `pgcrypto.crypt('bf', 10)` direto no Postgres
- **B — Edge fn `auth-login` com `bcryptjs.compare`**

**Decisão:** **B** — Edge fn com bcryptjs. Mesmo padrão usado depois pelo `create-user` (sub-fase 11.7).

**Razões:**
- Ecossistema bcryptjs amplamente testado
- Edge fn pode validar credentials sem expor o hash via REST
- Permite migração futura pra outros backends

**Status:** ✅ commit `41bd25c`.

### D5 — `error_logs` adicionar `company_id` (sub-fase 7.4)

**Contexto:** `error_logs` herdada do single-tenant não tinha company_id, dificultando auditoria multi-empresa.

**Decisão:** **A — Sim, adicionar** (NULLABLE — edge fns podem logar sem company_id resolvido).

**Status:** ✅ commit `b2a1bbb`.

### D6 — `bonus_defaults` legacy (sub-fase 7.3)

**Contexto:** Tabela legacy com defaults globais de bônus, substituída pela `bonus_types` por empresa.

**Decisão:** **C — Drop após validar callers**. Backup salvo em `docs/bonus_defaults_legacy_dump_2026-05-11.json`.

**Status:** ✅ commit `73d7649`.

### Regras de qualidade (Regras 1-8 do CHECKPOINT)

Regras canônicas que guiam toda mudança técnica. Quebrar = incidente.

1. **Validar tudo real** via MCP (pre + post)
2. **Sem quebra-galhos** (`as any` sem doc, hardcoded company_id, mock sem branch real)
3. **Uma sub-fase = um commit atômico** com co-author
4. **Teste falhou → mostrar Victor antes de "ajustar"**
5. **TECH_DEBT é canônico** — toda descoberta vira entry
6. **Decisões produto/semântica sempre com Victor**
7. **Padrão idiomático** — ID numérico+senha, company_id param, useEffect/useCallback corretos
8. **Qualidade > velocidade** — nunca economizar pre-check; defensa contra "atalho que vira bug latente"

Detalhes em [`CHECKPOINT.md`](.claude-checkpoints/CHECKPOINT.md).

---

## 9. Referências cruzadas

| Arquivo | Conteúdo |
|---|---|
| [`CHECKPOINT.md`](.claude-checkpoints/CHECKPOINT.md) | Estado de retomada, 8 regras, fases concluídas, fluxo de auth detalhado |
| [`TECH_DEBT.md`](TECH_DEBT.md) | Bugs ativos + características aceitas + histórico de resoluções |
| [`PRE-LAUNCH-CHECKLIST.md`](PRE-LAUNCH-CHECKLIST.md) | Checklist pré go-live (sub-fase 13) |
| [`docs/edge-functions.md`](docs/edge-functions.md) | Referência canônica das 3 edge fns |
| [`docs/security-baseline-pre-rls.md`](docs/security-baseline-pre-rls.md) | Snapshot advisors pré-Fase 11 (67 ERRORs) |
| [`docs/security-baseline-post-rls.md`](docs/security-baseline-post-rls.md) | Snapshot advisors pós-Fase 11 (0 ERRORs Sistema de Ponto) |
| [`README.md`](README.md) | Overview, stack, comandos, suporte |

---

*Documento mantido por Victor + Claude Opus 4.7. Última atualização: 2026-05-12 (sub-fase 12.4).*
