# CHECKPOINT_BANCO.md — Schema, RLS, Edge Functions, RPCs

> Inventário do estado do banco em prod (Supabase project `flcncdidxmmornkgkfbb`).
> Última atualização: **2026-05-13**.

---

## 1. Edge Functions ACTIVE em prod (4)

| Slug | Versão | `verify_jwt` | Função |
|---|---|---|---|
| `auth-login` | **v9** | `false` (emite tokens) | POST `{id, password}` → JWT custom HS256 `{sub, role:'authenticated', aud, company_id, exp:24h}` |
| `clock-in-validated` | **v8** | `true` | Validação real de geolocalização + criação/update attendance + logging em error_logs |
| `create-user` | **v1** | `true` | POST `{id, password, role, companyId}` → bcrypt server-side + INSERT `users.password_hash`. Admin `9999` OK; supervisor precisa `permissions.users.create` em `user_permissions`. |
| `employee-public-api` | **v2** | `false` | 11 actions cobrindo fluxo público do funcionário pós-RLS (ver §4) |

### Variáveis de ambiente (Edge Functions Secrets)
- `JWT_SECRET` — JWT Secret oficial do projeto (Settings → API → JWT Settings). **NÃO** pode ter prefixo `SUPABASE_*`.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — automáticos.

---

## 2. RPCs SECURITY DEFINER ativos

| RPC | Args | Auth | Função |
|---|---|---|---|
| `verify_admin_secret(p_password text)` | 1 | anon OK (validação pré-login) | Valida admin via bcrypt → boolean |
| `update_admin_secret(p_new_password text)` | 1 | autenticado | Atualiza admin via bcrypt → void |
| `apply_bank_hours_to_payment(...21 args...)` | 21 | autenticado (anon revoked em 11.5) | Apply transacional bank hours → uuid |

---

## 3. Tabelas com RLS ativo (48)

### 33 core Sistema de Ponto (policies via `auth.jwt() ->> 'company_id'`)

**Cat A — `company_id NOT NULL` (22):**
`admin_cleanup_config`, `attendance`, `bank_hours_application_log`, `bank_hours_overrides`, `bonus_blocks`, `bonus_removals`, `bonus_types`, `bonuses`, `employees`, `error_records`, `face_auth_attempts`, `face_recognition_config`, `geo_fraud_attempts`, `geolocation_config`, `payment_period_config`, `payment_periods`, `payments`, `triage_distribution_employees`, `triage_error_distributions`, `triage_errors`, `user_permissions`, `users`

**Special:**
- `error_logs` (NULLABLE company_id, policy especial)
- `companies` (SELECT TO public USING(true); modify só admin)
- `admin_secret` (DENY ALL — só RPC verify/update)

**Cat B — Admin-only (7):**
`activity_logs`, `admin_cleanup_logs`, `audit_logs`, `auto_cleanup_config`, `cleanup_logs`, `data_retention_settings`, `permission_logs`

**Cat C — Adicionadas em 14.4.5 (2):**
- `feature_versions` (versionamento de features, used por TutorialService)
- `monitoring_settings` (seed `error_tracking_enabled=true`)

### 15 legado (não mexer — outro projeto)
`drivers`, `lost_*`, `routes`, `ai_reports`, etc. — "objetos perdidos".

---

## 4. Edge fn `employee-public-api` — 11 actions

Fluxo público funcionário (`/clock` + `/erros`) — todas anon (verify_jwt: false). Edge fn usa **service_role** internamente pra bypass RLS após validar CPF/PIN.

| Action | Input | Output | Uso |
|---|---|---|---|
| `lookup-companies-by-cpf` | `{cpf}` | `[{companyId, companyName}]` | Multi-tenant CPF: descobre empresas |
| `lookup-employee` | `{cpf, companyId}` | `{employeeId, name, pin_configured, ...}` | Busca employee |
| `verify-pin` | `{employeeId, pin}` | `{ok}` | Login funcionário |
| `set-pin` | `{employeeId, pin}` | `{ok}` | Primeira vez: configurar PIN |
| `today-attendance` | `{employeeId}` | `attendance row` | Status do dia |
| `attendance-history` | `{employeeId, startDate, endDate}` | `attendance[]` | Histórico |
| `face-config` | `{companyId}` | `{enabled, threshold, ...}` | Config facial empresa |
| `face-descriptor` | `{employeeId}` | `{descriptor[], photoUrl}` | Descriptor armazenado |
| `save-face` | `{employeeId, descriptor[], photoUrl}` | `{ok}` | Cadastra rosto |
| `log-face-attempt` | `{employeeId, success, confidence, clockType}` | `{ok}` | Audit trail facial |
| `employee-errors-by-period` | `{employeeId, periodId}` | `errors[]` | Erros do funcionário num período |

---

## 5. Migrations relevantes (últimas 14)

```
20260513095800_create_monitoring_settings_table.sql
20260513093720_create_feature_versions_table.sql
20260512_revoke_anon_apply_bank_hours.sql                 (11.5)
20260512_atomic_rls_enable_drop_password.sql              (11.1)
20260512_create_rls_policies_dormant.sql                  (11.2)
20260511_drop_backup_tables.sql                           (11.0)
20260510_error_logs_add_company_id.sql                    (7.4 — D5)
20260509_drop_bonus_defaults.sql                          (7.3 — D6)
20260509_admin_cleanup_config_unique.sql                  (7.2)
20260508_nighttime_to_night_credit_minutes.sql            (8.3 — D1)
```

Total: **57 migrations** aplicadas.

---

## 6. Companies em prod

| Company | UUID | Admin local | Employees | Data atual |
|---|---|---|---|---|
| **Caratinga** (CLAYTON B DOS SANTOS) | `6583bb2a-e334-41a7-b69c-7d98f3b46dfc` | 9999 (master) | ~30 | 3130+ attendances, 1722+ payments |
| **Ponte Nova** (CD LOGISTICA LTDA) | `2b2abc4b-084c-4cf0-b5f1-02792513241d` | 8888 | 0 | Onboarding pendente |

---

## 7. Schema crítico — `users`

```sql
CREATE TABLE users (
  id text PRIMARY KEY,                  -- numérico mas armazenado como text ('9999', '8888', '97001', ...)
  password_hash text NOT NULL,          -- bcrypt $2a$10$... 60 chars
  role text NOT NULL,                   -- 'admin' | 'supervisor'
  name text,
  company_id uuid REFERENCES companies(id),
  created_by text REFERENCES users(id), -- FK pra outro user (9999 cria os outros)
  created_at timestamptz DEFAULT now()
);
-- RLS ON; policies: visibilidade só users da própria company OU admin master.
```

**Importante:** coluna `password` plain text foi **DROPADA em 11.1**. Único campo de senha é `password_hash`.

---

## 8. Schema crítico — `employees`

```sql
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  cpf text NOT NULL,                     -- sem máscara, só dígitos
  pix_key text,
  pix_type text,                          -- 'CPF' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA'
  employment_type text,                   -- 'Diarista' | 'CLT' | etc.
  pin text,                               -- ainda plain (sub-fase 11.9 pendente)
  pin_configured boolean DEFAULT false,
  face_registered boolean DEFAULT false,
  face_descriptor float[128],
  face_photo_url text,
  face_registered_at timestamptz,
  face_reset_requested boolean DEFAULT false,
  -- + endereço, função, escala, etc.
  created_by text REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);
-- RLS ON; policies: company_id match.
-- UNIQUE constraint: (company_id, cpf).
```

---

## 9. Schema crítico — `payments`

```sql
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id),
  date date NOT NULL,
  daily_rate numeric NOT NULL,
  bonus_b numeric DEFAULT 0,
  bonus_c1 numeric DEFAULT 0,
  bonus_c2 numeric DEFAULT 0,
  total numeric NOT NULL,
  -- Banco de horas
  bank_hours_amount numeric DEFAULT 0,
  bank_hours_minutes integer DEFAULT 0,
  bank_hours_applied_at timestamptz,
  -- Cálculos
  payment_period_id uuid REFERENCES payment_periods(id)
);
```

---

## 10. JWT_SECRET — configuração crítica

Localização: **Supabase Dashboard → Settings → Edge Functions → Secrets → `JWT_SECRET`**.

**Valor:** JWT Secret oficial do projeto (visível em Settings → API → JWT Settings → Reveal).

**NÃO** pode usar prefixo `SUPABASE_*` (rejeitado pela API). Por isso o nome é `JWT_SECRET`, não `SUPABASE_JWT_SECRET`.

Se rotacionar JWT Secret no Dashboard → **atualizar a var custom também** ou TODOS os JWTs custom param de funcionar.

---

## 11. Security advisors (estado atual)

- **0 ERRORs** (Sistema de Ponto) ✅
- **6 WARNs** persistentes intencionais:
  - 3 SECURITY DEFINER nossas (verify_admin_secret, update_admin_secret, apply_bank_hours_to_payment)
  - 16 WARNs legado (não mexer)

Pre/post-RLS baselines: `docs/security-baseline-pre-rls.md` + `docs/security-baseline-post-rls.md`.
