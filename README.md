# Sistema de Ponto

Sistema **multi-empresa** de controle de ponto, banco de horas, bonificações e folha-de-pagamento auxiliar. Cada empresa (tenant) tem dados completamente isolados via Row Level Security real no PostgreSQL. Autenticação via ID numérico + senha (sem email), com JWT custom HS256 emitido por edge function própria.

**Versão atual:** `2.0.0-rc.1` (multi-tenant, RLS hardened — Fase 11 completa).
**Branch:** `main` • **Produção:** Supabase (`flcncdidxmmornkgkfbb` — sa-east-1, PG 17.6).

---

## Funcionalidades Principais

### Multi-Empresa (Multi-Tenant)
- 2 empresas em produção: **Caratinga** (CLAYTON B DOS SANTOS, ~30 employees, dados ativos) e **Ponte Nova** (CD LOGISTICA LTDA, em onboarding).
- Isolamento total via RLS — `auth.jwt() ->> 'company_id'` em todas as 32 tabelas core.
- Switcher de empresa no header (admin master '9999'). Supervisor vê só a empresa atrelada.
- DEFAULT_COMPANY_ID = `'6583bb2a-e334-41a7-b69c-7d98f3b46dfc'` (Caratinga) como fallback documentado.

### Controle de Presença
- Registro diário via app (clock-in) com validação de geolocalização real (edge fn `clock-in-validated` v8).
- Marcação em massa de presença/falta pela UI admin.
- Busca por nome, CPF, PIN, badge.
- Espelhamento de marcações (MirrorMassDialog) entre dias úteis.
- Estatísticas: presentes, faltas, não marcados, atrasos.

### Reconhecimento Facial (opcional)
- `face-api.js` para validar identidade no clock-in.
- Cadastro one-time via `FaceRegistration`. Reset manual sob auditoria.

### Gestão de Funcionários
- Cadastro completo: nome, CPF, PIN, badge, PIS, cargo, salário, jornada esperada, tipo de contrato.
- Tipos de pagamento configuráveis (mensalista, diarista, hora).
- Importação em massa via XLSX.
- Exportação para Excel.

### Banco de Horas
- Cálculo automático de créditos/débitos por dia (diurno + noturno).
- Aplicação transacional via RPC `apply_bank_hours_to_payment` (SECURITY DEFINER) — preview + commit atômico.
- Configuração de multiplicadores por empresa (`bank_hours_overrides`).

### Bonificações
- Tipos custom por empresa (`bonus_types` table) — B, C1, C2 ou definidos pelo admin.
- Aplicação individual ou em massa por data.
- Remoção com observação obrigatória (10-500 chars) — auditoria completa.
- Bloqueios programados (`bonus_blocks`) para impedir aplicação em períodos sensíveis.

### Relatórios Financeiros
- Cálculo de pagamento por período: dias trabalhados, faltas, hora-base, banco de horas, bonificações.
- Visualização por funcionário ou agregada por empresa.
- Exportação Excel + PDF.
- Pagamento via C6 Bank (formato proprietário, validação PIX/CPF/CNPJ).
- Histórico completo de remoções de bonificação para auditoria.

### Triagem e Registro de Erros
- Registro de problemas operacionais com categorização.
- Distribuição de erros entre funcionários (`triage_distribution`).
- Cálculo de impacto financeiro por funcionário.
- Visualização agregada (`EmployeeErrorsView`) com state machine completo.

### Autenticação e Permissões
- Login: **ID numérico + senha** (sem email). Admin master ID `9999`.
- JWT custom HS256 (24h) assinado com JWT_SECRET oficial do Supabase — RLS aceita via `auth.jwt() ->> 'company_id'`.
- Permissões granulares por usuário (`user_permissions.permissions` jsonb): `users.*`, `employees.*`, `attendance.*`, `financial.*`, `errors.*`, `datamanagement.*`.
- Admin '9999' tem bypass em todas as policies (`OR auth.jwt() ->> 'sub' = '9999'`).

---

## Tecnologias

### Frontend
- **React 18.3** + **TypeScript 5.5** + **Vite 5.4**
- **Tailwind CSS 3.4** (UI)
- **date-fns 4** (datas), **lucide-react** (ícones), **recharts** (gráficos)
- **jsPDF**, **xlsx-js-style** (exportação)
- **face-api.js** (reconhecimento facial opcional)
- **react-hot-toast** (notificações)

### Backend (Supabase)
- **PostgreSQL 17.6** com Row Level Security ativo em 47 tabelas (32 core + 15 legado isolado).
- **Edge Functions** (Deno runtime):
  - `auth-login` v9 (`verify_jwt:false`) — POST `{id, password}` → JWT custom HS256 com `{sub, role, aud, company_id, exp:24h}`.
  - `clock-in-validated` v8 (`verify_jwt:true`) — validação geo real + INSERT/UPDATE attendance + log em `error_logs`.
  - `create-user` v1 (`verify_jwt:true`) — bcrypt server-side + INSERT em `users.password_hash`. Substitui o INSERT plain antigo (sub-fase 11.7).
- **bcryptjs 2.4.3** (via `https://esm.sh/`) — hash de senhas em edge fns + RPC `verify_admin_secret`.
- **RPCs SECURITY DEFINER**: `verify_admin_secret`, `update_admin_secret`, `apply_bank_hours_to_payment`.

### Testes
- **Vitest 4** — 422 unit tests em 17 arquivos (~4s full run).
- **Playwright 1.59** + `@testing-library/react` — 35+ specs E2E cobrindo auth, clock, financial, multi-empresa isolation, admin tab, triage.

---

## Estrutura do Projeto

```
src/
├── components/          # Componentes React
│   ├── admin/          # Tab Admin (master only)
│   ├── attendance/     # Controle de ponto
│   ├── auth/           # LoginForm, CompanySelector
│   ├── c6payment/      # Exportação C6 Bank
│   ├── common/         # Layout, TabNavigation
│   ├── datamanagement/ # Retention, cleanup, audit
│   ├── employee-clock/ # Clock-in funcionário (PWA mode)
│   ├── employees/      # Gestão de funcionários
│   ├── errors/         # Registro de erros
│   ├── financial/      # Folha + banco de horas
│   ├── monitoring/     # Audit/activity logs
│   ├── reports/        # Relatórios gerais
│   ├── settings/       # Configurações por empresa
│   ├── triage/         # Triagem de erros
│   ├── tutorial/       # HelpButton, TutorialTab
│   └── users/          # Gestão de supervisors
├── contexts/           # CompanyContext (tenant ativo)
├── hooks/              # useAuth, usePermissions
├── lib/                # supabase client (proxy mutável)
├── services/           # database.ts (~5180 lin), permissions.ts
├── types/              # TS types compartilhados
├── utils/              # Calculators (attendance, bank hours, validation)
├── App.tsx
└── main.tsx

supabase/
├── functions/
│   ├── auth-login/     # v9 ACTIVE
│   ├── clock-in-validated/  # v8 ACTIVE
│   └── create-user/    # v1 ACTIVE
└── migrations/         # 57 migrations versionadas

tests/                  # Playwright specs E2E + unit
docs/                   # security baselines pre/post RLS
CHECKPOINT.md           # estado de retomada de sessão (regras + fases)
TECH_DEBT.md            # bugs + histórico de resoluções
```

---

## Configuração

### Pré-requisitos
- **Node.js 18+** (recomendado 20+)
- **npm** ou **pnpm**
- Conta Supabase com PostgreSQL ≥15

### Variáveis de Ambiente

**Frontend (`.env`):**
```env
VITE_SUPABASE_URL=https://flcncdidxmmornkgkfbb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # opcional — apenas pra specs E2E de isolation
```

`SUPABASE_SERVICE_ROLE_KEY` é usada por `tests/cleanup.ts:getClient()` em specs que validam isolamento RLS direto contra o banco (sub-fases `25-multi-company-isolation` e parte de `26-multi-company-ui-isolation`).

**Supabase Edge Function Secrets** (configurados via Dashboard → Settings → Edge Functions → Secrets):
- `JWT_SECRET` — valor idêntico ao "JWT Secret" oficial do projeto (Settings → API → JWT Settings → JWT Secret). Sem prefixo `SUPABASE_` (Supabase rejeita prefixos reservados).
- `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL` são injetados automaticamente.

### Instalação

```bash
git clone <repo>
cd SISTEMA-DE-PONTO
npm install
cp .env.example .env  # preencher com as keys reais
npm run dev
```

---

## Comandos Disponíveis

```bash
# Dev
npm run dev              # Vite dev server
npm run build            # build de produção
npm run preview          # preview do build
npm run lint             # ESLint

# Testes
npm run test:unit        # vitest run (422 unit tests, ~4s)
npm run test:unit:watch  # vitest watch mode
npm run test             # Playwright E2E full suite (~10-20min)
npm run test:headed      # Playwright em modo visível
npm run test:report      # abre report HTML
```

### Comandos de validação canônica

Antes de qualquer commit, executar:
```bash
npx tsc --noEmit         # TypeScript strict
npx vitest run           # unit (deve passar 422/422)
npx playwright test tests/<spec>.spec.ts --workers=1 --reporter=list  # E2E focal
```

---

## Banco de Dados

### Tabelas core do Sistema de Ponto (32, todas com RLS ativo)
- **Multi-empresa**: `companies`
- **Usuários e permissões**: `users`, `user_permissions`, `permission_logs`, `admin_secret`
- **Funcionários**: `employees`, `face_auth_attempts`, `face_recognition_config`
- **Ponto**: `attendance`, `geolocation_config`, `geo_fraud_attempts`
- **Banco de horas**: `bank_hours_overrides`, `bank_hours_application_log`
- **Bonificações**: `bonuses`, `bonus_types`, `bonus_removals`, `bonus_blocks`
- **Pagamentos**: `payments`, `payment_periods`, `payment_period_config`
- **Erros e triagem**: `error_records`, `error_logs`, `triage_errors`, `triage_error_distributions`, `triage_distribution_employees`
- **Auditoria**: `activity_logs`, `audit_logs`, `cleanup_logs`, `permission_logs`
- **Configuração**: `admin_cleanup_config`, `auto_cleanup_config`, `data_retention_settings`

### Tabelas legado (15) — sistema "Objetos Perdidos"
Compartilham o mesmo projeto Supabase mas pertencem a outro produto (`drivers`, `lost_*`, `routes`, `ai_reports`, etc.). **Não mexer** — coberto por políticas RLS próprias.

### RLS Approach

Todas as policies das tabelas core seguem o pattern:
```sql
CREATE POLICY "..." ON public.<tabela>
  FOR <operação> TO public
  USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    OR (auth.jwt() ->> 'sub') = '9999'    -- admin master bypass
  );
```

Detalhes completos em `docs/security-baseline-post-rls.md`.

---

## Segurança

| Item | Status |
|---|---|
| **RLS ativo** | 47/47 tabelas core + legado |
| **Senhas** | bcrypt `$2a$10$` (60 chars) em `users.password_hash` |
| **Coluna `password` plain** | dropada na sub-fase 11.1 |
| **JWT custom** | HS256 assinado com JWT_SECRET oficial, 24h, payload `{sub, role:'authenticated', aud, company_id, iat, exp}` |
| **Login** | ID numérico + senha (sem email) via edge fn `auth-login` |
| **SECURITY DEFINER fns** | `apply_bank_hours_to_payment` (revogada anon), `verify_admin_secret`, `update_admin_secret` |
| **Security advisors (ERRORs)** | **0** do Sistema de Ponto (Fase 11 fechou 67 → 0) |
| **Security advisors (WARNs)** | 22 — todos esperados (legado + 3 SECURITY DEFINER pré-login) |

### Fluxo de autenticação

1. Frontend `loginUser(id, password)` faz POST `/functions/v1/auth-login`.
2. Edge fn busca `users.password_hash` via service_role, faz `bcryptjs.compare`.
3. Se OK, assina JWT HS256 com payload de 24h e retorna `{token, user}`.
4. Frontend chama `setAuthToken(token)` — `src/lib/supabase.ts` recria o client Supabase com header `Authorization: Bearer <jwt>`.
5. Próximas queries Supabase trafegam o token; RLS policies validam via `auth.jwt() ->> 'company_id'`.
6. Logout (`clearAuthToken`) limpa o token e recria o client sem headers.

---

## Documentação Adicional

- **`CHECKPOINT.md`** — estado canônico de retomada de sessão (regras, fases, decisões).
- **`TECH_DEBT.md`** — bugs ativos, características aceitas, histórico de resoluções.
- **`PRE-LAUNCH-CHECKLIST.md`** — checklist de itens pra go-live.
- **`ARCHITECTURE.md`** — diagramas Mermaid + decisões arquiteturais.
- **`docs/edge-functions.md`** — referência das edge fns.
- **`docs/security-baseline-post-rls.md`** — audit trail RLS pós-Fase 11.

---

## Notas Importantes

- Sistema desenvolvido para uso interno empresarial — não é SaaS público.
- Timezone fixo Brasil (UTC-3).
- Valores monetários em Real (R$).
- Auto-cleanup de fixtures de teste via prefix `PW Test ` + `cleanupByPrefix` em `tests/cleanup.ts`.
- Edge fn `create-user` tem cold start lento (~150s) na primeira chamada pós-deploy (cf. TECH_DEBT 6.13) — UI deve mostrar spinner com aviso "pode levar até 2 minutos no primeiro uso".

---

## Suporte

Sistema desenvolvido para uso interno. Para suporte, consulte o `CHECKPOINT.md` ou abra issue interna.
