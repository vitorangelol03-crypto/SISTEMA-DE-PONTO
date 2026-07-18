# CHECKPOINT_BANCO.md — Schema, RLS, Edge Functions, RPCs

> Inventário do estado do banco em prod (Supabase project `flcncdidxmmornkgkfbb`).
> Última atualização: **2026-05-19**.

---

## 1. Edge Functions ACTIVE em prod (6)

| Slug | Versão | `verify_jwt` | Função |
|---|---|---|---|
| `auth-login` | **v9** | `false` (emite tokens) | POST `{id, password}` → JWT custom HS256 `{sub, role:'authenticated', aud, company_id, exp:24h}` |
| `clock-in-validated` | **v8** | `true` | Validação real de geolocalização + criação/update attendance + logging em error_logs |
| `create-user` | **v1** | `true` | POST `{id, password, role, companyId}` → bcrypt server-side + INSERT `users.password_hash`. Admin `9999` OK; supervisor precisa `permissions.users.create` em `user_permissions`. |
| `employee-public-api` | **v3** | `false` | 12 actions cobrindo fluxo público + **dual-mode bcrypt PIN (sub-fase 11.9)** — ver §4 |

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

Total: **64 migrations** aplicadas (incluindo migração 11.9 PIN bcrypt + 14.12 PN payment_period_config).

---

## 6. Companies em prod

| Company | UUID | Admin local | Employees | Data atual |
|---|---|---|---|---|
| **Caratinga** (CLAYTON B DOS SANTOS) | `6583bb2a-e334-41a7-b69c-7d98f3b46dfc` | 9999 (master) | 30 | 3130 attendances, 1726 payments, **26/26 PINs bcrypt** |
| **Ponte Nova** (CD LOGISTICA LTDA) | `2b2abc4b-084c-4cf0-b5f1-02792513241d` | 8888 | 0 | Setup 90% (geo + bonus_types + payment_config); aguarda planilha 30 funcionários |

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

## 8. Schema crítico — `employees.pin_hash` (sub-fase 11.9)

```sql
ALTER TABLE employees ADD COLUMN pin_hash text;
-- bcrypt $2a$10$... (60 chars)
```

Migração massa executada em 14.11.3: 26/26 PINs Caratinga migrados via pgcrypto `crypt(pin, gen_salt('bf', 10))`. Coluna `pin` plain agora NULL pra esses 26.

Edge fn `employee-public-api` v3 dual-mode:
- `verify-pin`: tenta `bcrypt.compare(pin, pin_hash)` → fallback `pin === pin` se `pin_hash IS NULL`
- `set-pin`: grava `pin_hash` (bcryptjs.hash) + `pin = NULL`

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

---

## 12. Queries novas (sub-fase 18.3, 2026-05-18)

### `getFunctionRoles(companyId): Promise<string[]>` — src/services/database.ts

DISTINCT de `function_role` por empresa, ordenado pt-BR. Lista zero migration.
Usada por `FunctionRoleInput` (combobox autocomplete em EmployeesTab) e
`FunctionRoleFilter` (dropdown no Financeiro).

```sql
SELECT function_role FROM employees
WHERE company_id=$1 AND function_role IS NOT NULL;
-- DISTINCT + sort no client (Set + Array.sort com locale='pt-BR')
```

Em Caratinga hoje: **1 função distinta** ("Auxiliar Administrativo" em 5 employees, 26 sem function_role).
Em Ponte Nova: **8 funções distintas** (Demo PN seed).

---

## 13. Mudanças DB-only desta sessão (2026-05-18/19, sem commit)

### DELETE row em `user_permissions` do supervisor 01

Causa: alguém via UI zerou múltiplos módulos (`errors.view`, `reports.view`,
`users.view`, `settings.view`, `c6payment.view`, `datamanagement.view`),
deixando supervisor sem abas Erros + Relatórios. Spec 100 A3 começou a falhar.

```sql
DELETE FROM public.user_permissions WHERE user_id = '01';
```

Resultado: `getUserPermissions` cai no `DEFAULT_SUPERVISOR_PERMISSIONS` definido
em `src/types/permissions.ts:113-127` → tabs voltam. Admin pode re-customizar
via UI se quiser restringir depois.

### UPDATE 4 payments REAIS + DELETE row em `bonuses` (incidente polução)

CI rodando spec 100 C2 aplicou bônus B R$10 em massa em Caratinga, afetando
4 funcionários REAIS. Cleanup:

```sql
UPDATE public.payments
SET bonus_b=0, bonus=0, total=daily_rate
WHERE date='2026-05-18'
  AND company_id='6583bb2a-e334-41a7-b69c-7d98f3b46dfc'
  AND employee_id IN (
    SELECT id FROM public.employees
    WHERE company_id='6583bb2a-e334-41a7-b69c-7d98f3b46dfc'
      AND name NOT ILIKE 'PW Test%'
  );

DELETE FROM public.bonuses
WHERE id='7a6461af-f182-4b1d-9be4-13a902802549';
```

Fix permanente em commit `823f45f` (helper `tests/_bonusIsolation.ts` aplicado
em 4 specs). Ver `CHECKPOINT_FASES.md` §18.5.

### INSERT row em `admin_cleanup_config` pra Ponte Nova

Victor pediu equiparar config a Caratinga. Antes: PN sem config (cleanup
desabilitado). Depois:

```sql
INSERT INTO public.admin_cleanup_config
  (id, company_id, enabled, interval_months, next_cleanup_at, updated_at)
VALUES (gen_random_uuid()::text,
        '2b2abc4b-084c-4cf0-b5f1-02792513241d',
        true, 3, now() + interval '3 months', now());
```

Resultado: PN com cleanup automático ativo, interval 3 meses, próxima rodada
**2026-08-18**. Mesma config de Caratinga (next: 2026-07-17).
