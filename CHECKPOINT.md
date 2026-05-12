# 🚦 CHECKPOINT — Sistema de Ponto Multi-Empresa rumo à Produção

> **Arquivo de retomada de sessão.** Quando reabrir o Claude Code, mande este arquivo (`cat CHECKPOINT.md`) ou peça pra Claude lê-lo. Ele deve restaurar contexto completo + REGRAS antes de fazer qualquer coisa.

**Última atualização:** 2026-05-12 (após Fase 11 completa + adição Regra 8 "Qualidade > Velocidade")
**Plano canônico:** `/home/victor/SISTEMA-DE-PONTO/PLANO_PRODUCAO.md`
**TECH_DEBT canônico:** `/home/victor/SISTEMA-DE-PONTO/TECH_DEBT.md`
**Memory:** `/home/victor/.claude/projects/-home-victor-SISTEMA-DE-PONTO/memory/`

---

## ⛔ REGRAS OBRIGATÓRIAS (NÃO IGNORAR — definem o que faz a diferença entre "sistema 100%" e "meia bomba")

Estas **8 regras** valem **pra cada sub-fase**, **toda execução**. Foram negociadas com o Victor. **Quebrar elas é incidente.**

### Regra 1 — VALIDAR TUDO REAL (não confiar só em tsc/lint/vitest)

- **Antes de mudar código**: pre-checks reais no banco via Supabase MCP — `list_tables`, `execute_sql` com `SELECT count(*)`, `EXPLAIN ANALYZE`, etc.
- **Durante mudança**: validar com dados reais de prod (não fixtures inventadas) — pegar samples via SQL antes de codar a regra.
- **Após mudança**: validar via MCP que estado mudou conforme esperado (constraint existe? row criada? índice ativo?).
- **Específico pra cada caso**:
  - Migrations: `apply_migration` + `pg_constraint`/`information_schema.tables` confirmando o efeito.
  - Edge functions: `deploy_edge_function` + `list_edge_functions` confirmando versão ACTIVE + hash novo.
  - Refactors de função pública: rodar specs E2E que exercitam o flow real (não só unit com mock).
  - RPC novas: criar a função + chamar via `supabase.rpc` real em spec E2E (não só mock).

### Regra 2 — NUNCA QUEBRA-GALHOS

- **Sem `as any`** sem documentar por quê em comentário inline.
- **Sem suprimir warnings** (`eslint-disable`, `@ts-ignore`) sem justificativa concreta + ticket de cleanup.
- **Sem hardcoded values** que dependem de empresa específica (`'6583bb2a-...'`) — usar `company_id` parametrizado. Default `DEFAULT_COMPANY_ID` constante é OK pra fallback documentado.
- **Sem mock paralelo elaborado** quando o real funciona em jsdom.
- **Sem testes "que passam"** mas não validam fluxo real. Cada teste precisa exercitar uma BRANCH específica do código + assertar OUTPUT real.

### Regra 3 — UMA SUB-FASE = UM COMMIT ATÔMICO

- Mensagem padrão: `tipo(escopo): descrição (sub-fase X.Y)`
- Co-author obrigatório: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- **NUNCA `git push`** sem autorização explícita (Victor é o único push-er por default).
- Se quebrar algo em prod: documentar imediatamente no TECH_DEBT como sub-fase X.Y.1 (fix latente).

### Regra 4 — SE TESTE FALHAR, MOSTRAR PRA VICTOR ANTES

- Não "ajustar mock pra passar" se a falha indica problema real.
- Investigar causa raiz primeiro.

### Regra 5 — TECH_DEBT é CANÔNICO

- Toda mudança que resolve bug: mover entry pra `## ✅ Histórico — Resolvidas` com data, sub-fase, validações reais executadas.
- Toda descoberta nova: adicionar entry numerada.
- Não deixar bug "meio resolvido" — ou está em Histórico ou está Pendente.

### Regra 6 — DECISÕES DE PRODUTO/SEMÂNTICA SEMPRE COM VICTOR

- Decisões D1-D6 do plano. **Status atualizado: TODAS resolvidas.**
- Não assumir nada que vire risco trabalhista/financeiro sem confirmar.

### Regra 7 — PADRÃO IDIOMÁTICO DO PROJETO

- **Auth/login**: ID numérico + senha (SEM email). JWT custom assinado com JWT_SECRET oficial.
- Multi-empresa: `company.id` sempre passado por param. RLS policies usam `auth.jwt() ->> 'company_id'`.
- useEffect com `[company?.id]` deve ser acompanhado de cleanup dos estados ID-based.
- React hooks: `useCallback` com deps corretas — não suprime warning.
- TypeScript: tipos explícitos. Sem `any` sem comentário.
- Supabase queries: `const { data, error } = await ...; if (error) throw error;`

### Regra 8 — QUALIDADE ACIMA DE VELOCIDADE (nunca "economizar")

> **Diretriz canônica do Victor:** _"sistema 100%, não meia bomba"_.
> Esta regra existe pra proteger a Claude de cair em quebra-galhos invisíveis. Economizar passos de validação abre brecha pra **"atalho que vira bug latente"** — exatamente o que as outras 7 regras tentam impedir. Quando em dúvida, qualidade > tempo. Sempre.

- **Cada decisão favorece robustez, não atalho.** Quando dois caminhos são possíveis, escolher o que **valida mais**, mesmo se levar mais tempo ou mais sub-fases. Nunca o "que parece mais rápido".
- **Não pular passos de validação alegando "é simples".** Pre-check via MCP sempre — mesmo em mudanças de 1 linha. Uma linha pode quebrar policy RLS, índice, trigger, constraint, JWT shape, edge fn binding.
- **Não escrever boilerplate genérico.** Adaptar ao pattern idiomático do projeto (Regra 7). Copy-paste de docs externas / Stack Overflow / outras codebases vira tech debt latente — sempre revalidar contra o estado real do banco/código.
- **Não simplificar teste/mock pra "passar".** Se validar a branch real exige 80 linhas de setup, escreve 80 linhas. Mock barato que passa NÃO é validação real (cross-ref Regra 1 + Regra 2 + Regra 4).
- **Não deixar `TODO`/`// fix me later`/`// HACK`/`// XXX` no código.** Ou resolve agora, ou vira entry numerada em TECH_DEBT.md com sub-fase prevista (Regra 5). Comentário órfão é dívida silenciosa.
- **Não economizar pre-check pensando "já fiz isso antes nesta sessão".** Estado pode ter mudado entre sub-fases (RLS toggle, edge fn redeploy, migration anterior, JWT_SECRET rotacionada). Re-confirmar via MCP custa 2s e pega regressão silenciosa.
- **Reflexão obrigatória antes de cada commit:** _"Estou escolhendo o caminho mais robusto, ou o mais rápido?"_ Se a resposta honesta é "rápido" — reavaliar antes de commitar. Se faltar 1 validação que daria mais 5 min de trabalho, fazer essa validação.
- **Quando o Victor diz "tá pronto?"**, a resposta correta é "sim" só se Steps 1-9 do pattern canônico (linha 304+ deste checkpoint) foram TODOS executados. "Quase pronto" = não pronto.

---

## 📊 ESTADO ATUAL — Fases 5 a 11 ✅ COMPLETAS

**Branch:** `main`
**Último commit:** `0300e8a` (sub-fase 11.5 — baseline pós-Fase 11)
**Working tree:** limpo (só `.claude/` untracked)
**Sincronizado com `origin/main`:** sim

### Resumo das fases concluídas

| Fase | Tema | Sub-fases | Status |
|---|---|---|---|
| **5** | Quick wins | 5.1-5.6 | ✅ |
| **6** | Cobertura unit tests | 6.1-6.6 | ✅ (414 unit tests) |
| **7** | Migrations small + cleanups | 7.2-7.4 | ✅ |
| **8** | Fixes médios | 8.1, 8.3, 8.4, 8.5 | ✅ |
| **9** | E2E gaps fixáveis | 9.1-9.4 | ✅ (9 skips condicionais → 0; 4 specs E2E novas) |
| **10** | E2E componentes | 10.1, 10.2, 10.4, 10.5, 10.6, 10.8 (6 ativas) + 10.3 cancelado + 10.7 postponed | ✅ (48 tests novos: 40 E2E + 8 unit) |
| **11** | Hardening produção pública | 11.0-11.5 | ✅ **(67 ERRORs → 0 do Sistema de Ponto)** |

### Métricas finais

| Métrica | Inicial | Atual |
|---|---|---|
| **Security advisors total** | 85 | **23** (-73%) |
| **Security ERRORs (Sistema de Ponto)** | 67 | **0** ✅ |
| `rls_disabled_in_public` | 64 | 0 |
| `sensitive_columns_exposed` (password plain) | 2 | 0 |
| Tabelas com RLS ON | 0 | 47 (32 core + 15 legado) |
| Senha plain text | sim (`users.password`) | **não** (bcrypt em `password_hash`) |
| Edge fn `clock-in-validated` | v6 (`verify_jwt:false`) | **v8 (`verify_jwt:true`)** |
| Edge fns ativos | 1 (`clock-in-validated`) | 2 (`+auth-login`) |
| Unit tests | 414 | **422** (+8 FaceScanFrame) |
| Specs E2E Playwright | 30 | **35** (+31 EmployeeErrorsView, +32 BonusTypesManager, +34 CompanySettings, +35 MirrorMassDialog, +36 EmployeeErrorsPage state machine, +26-extras 4 testes) |
| Migrations | 50 | **57** (+7 na Fase 11) |
| `users.password` plain em prod | sim | **dropada** |

### Commits desta sessão (19, mais antigos primeiro)

```
a4c3da3  test(e2e): data-testid pra remover 7 skips condicionais (sub-fase 9.1)
5e77eb8  test(e2e): corrigir locator do filtro employment_type (sub-fase 9.2)
de36d20  test(e2e): split 07-financial 'com/sem pagamentos' (sub-fase 9.3)
a2b29b0  test(e2e): 4 specs isolamento UI multi-empresa (6.18-6.21) (sub-fase 9.4)
138cec7  test(e2e): spec 31 EmployeeErrorsView (sub-fase 10.1)
03687aa  test(e2e): spec 32 BonusTypesManager (sub-fase 10.2)
f21062f  docs(tech-debt): sub-fase 10.3 cancelada — AuditLogsTab órfão
ee0dbae  test(e2e): spec 34 CompanySettings (sub-fase 10.4)
1c60430  test(e2e): spec 35 MirrorMassDialog (sub-fase 10.5)
19ca891  test(e2e): spec 36 EmployeeErrorsPage state machine (sub-fase 10.6)
b70b049  docs(tech-debt): sub-fase 10.7 (FaceRegistration) postponed
4274876  test(unit): spec FaceScanFrame via @testing-library/react (sub-fase 10.8)
6112ac1  chore(db): drop 32 tabelas backup_* legado (sub-fase 11.0)
aab8389  feat(auth): add password_hash + edge fn auth-login v6 (sub-fase 11.3 parcial)
41bd25c  feat(auth): completa 11.3 — bcrypt + JWT custom + auth-login v8 (sub-fase 11.3)
27b7796  feat(db): criar 74 policies RLS dormentes em 32 tabelas core (sub-fase 11.2)
ccc5a4c  feat(edge-fn): clock-in-validated v8 com verify_jwt:true (sub-fase 11.4)
23dc365  feat(rls): cutover atômico — ENABLE RLS + DROP password (sub-fase 11.1)
0300e8a  docs(security): baseline pós-Fase 11 + revoke anon apply_bank_hours (sub-fase 11.5)
```

---

## 📐 DECISÕES D1-D6 — TODAS RESOLVIDAS

| # | Decisão | Resolução | Sub-fase | Commit |
|---|---|---|---|---|
| **D1** | `nighttime_minutes → nightCreditMinutes` | **C — Diurno primeiro** | 8.3 | `e70da28` |
| **D2** | `admin_cleanup_config` strategy | **ES — Estrutural** (UNIQUE + lazy-create) | 7.2 + 7.2.1 | `19a72f3`, `0840f9c` |
| **D3** | **RLS strategy** | **C — auth.jwt() ->> 'company_id'** (com JWT custom HS256 assinado com JWT_SECRET oficial) | 11.2 + 11.1 | `27b7796`, `23dc365` |
| **D4** | **Hash de senhas** | **B — Edge fn `auth-login` com bcrypt** | 11.3 | `41bd25c` |
| **D5** | `error_logs` adicionar `company_id` | **A — Sim, adicionar** | 7.4 | `b2a1bbb` |
| **D6** | `bonus_defaults` legacy | **C — Drop após validar callers** | 7.3 | `73d7649` |

### Restrições arquiteturais confirmadas

- **Login do Sistema de Ponto é APENAS ID numérico + senha. SEM email.** (Vide memory `project_auth_no_email`.)
- Tabelas legado (15: drivers/lost_*/routes/ai_reports/etc.) compartilham mesmo Supabase mas são de OUTRO projeto ("objetos perdidos") — **não mexer**.
- 32 tabelas backup_* foram dropadas em 11.0. Sem mecanismo de restore (backups antigos sem uso real).

---

## 🔐 SETUP DE INFRA — JWT_SECRET CONFIGURADO

`JWT_SECRET` foi configurada via Supabase Dashboard → Settings → Edge Functions → Secrets em 2026-05-12. Valor: JWT Secret oficial do projeto (Settings → API → JWT Secret).

**Pra resetar/conferir:**
```
Dashboard → Settings → API → "JWT Settings" → JWT Secret (Reveal)
Dashboard → Settings → Edge Functions → Secrets → JWT_SECRET (deve ter o mesmo valor)
```

A var NÃO pode ter prefixo `SUPABASE_` (Supabase rejeita prefixos reservados). Por isso é `JWT_SECRET`, não `SUPABASE_JWT_SECRET`.

---

## 🚧 PENDÊNCIAS CONHECIDAS — PRECISAM AÇÃO NA PRÓXIMA SESSÃO

### 1. SERVICE_ROLE_KEY ausente no `.env`

Specs E2E `25-multi-company-isolation` e `26-multi-company-ui-isolation test 6` fazem queries direto via `tests/cleanup.ts:getClient()` (que usa `VITE_SUPABASE_ANON_KEY`). Após RLS ativo, anon retorna vazio.

**Como resolver (próxima sessão):**

1. Victor copia o `service_role` key do Supabase Dashboard → Settings → API.
2. Adicionar ao `.env` local:
   ```
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   ```
3. Atualizar `tests/cleanup.ts:getClient()`:
   ```typescript
   const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
   ```
4. Rodar specs `25` e `26` pra confirmar volta ao verde.

**Impacto atual:** o APP em prod NÃO é afetado — só specs E2E de isolation. Outras specs (01-auth, 02-clock, 12-admin, 26 testes 1-5/7-9) passam.

### 2. Sub-fase 10.3 (AuditLogsTab) CANCELADA — componente órfão

`src/components/monitoring/AuditLogsTab.tsx` (319 lin) existe mas não é renderizado em nenhuma view. Decisão pendente: expor na UI ou remover dead code. Fase 12 (docs) é o momento certo pra avaliar.

### 3. Sub-fase 10.7 (FaceRegistration) POSTPONED — mock pesado fora do escopo

`face-api.js` + `navigator.mediaDevices.getUserMedia` + `<video>` element exigem mock library compartilhada (~6-8h). Precedente: `tests/23-employee-clock-complete.spec.ts:173` skipa explicitamente.

### 4. 6 WARNs persistentes em advisors (intencionais)

- 3 funções SECURITY DEFINER nossas: `apply_bank_hours_to_payment`, `verify_admin_secret`, `update_admin_secret`. Já revogamos anon em `apply_bank_hours_to_payment` (11.5). Outras 2 precisam de anon pra fluxo pré-login.
- 16 WARNs no sistema legado (Q2 decisão Victor: não mexer).

### 5. `nightDebitMinutes = 0` (decisão técnica conservadora, NÃO bug)

Vide CHECKPOINT anterior. Todo débito tratado como diurno, sem multiplier noturno aplicado.

---

## 📋 PRÓXIMAS FASES

### Fase 12 — Documentação (~6h, SEM bloqueio)

- **12.1** — Atualizar `README.md` (RLS real, multi-empresa, bcrypt, JWT custom, versão atual)
- **12.2** — Atualizar `PRE-LAUNCH-CHECKLIST.md`
- **12.3** — Documentar edge functions (`auth-login`, `clock-in-validated` v7/v8)
- **12.4** — `ARCHITECTURE.md` novo (Mermaid diagrams, multi-tenancy, auth flow, RLS approach)

### Fase 13 — Validação final + go-live (~3h Claude + variable manual)

- **13.0** *(pendência adicional)* — Adicionar `SUPABASE_SERVICE_ROLE_KEY` ao `.env` + atualizar `tests/cleanup.ts:getClient()` (vide pendência 1)
- **13.1** — Full Playwright suite 3× consecutivos sem flake
- **13.2** — Audit final advisors via MCP (re-confirmar 0 ERRORs Sistema de Ponto)
- **13.3** — [MANUAL — Victor] Onboarding Ponte Nova com dados reais
- **13.4** — [MANUAL — Victor] Tag `v2.0.0-multi-tenant` + push pra release

---

## 🤖 ABORDAGEM PARA RETOMAR

Quando o Victor reabrir o Claude Code, o assistente deve:

1. **Ler este checkpoint** integralmente
2. **Confirmar as 8 regras obrigatórias** acima — não pular nem 1 (Regra 8 é "Qualidade > Velocidade", reforça as outras 7)
3. **Verificar estado atual** via git:
   ```bash
   git log --oneline -5
   git status --short
   ```
4. **Verificar baseline** (deve ser tsc limpo + 422 unit tests + advisors 23):
   ```bash
   npx tsc --noEmit
   npx vitest run 2>&1 | tail -5
   ```
5. **Perguntar ao Victor** qual fase atacar:
   - Fase 12 (Documentação) — sem bloqueio
   - Fase 13 — exige SERVICE_ROLE_KEY no .env primeiro
   - Pendência 1 (SERVICE_ROLE_KEY) — preparar getClient()
6. **Não começar a executar nada antes do Victor confirmar prioridade.**

---

## 🔧 COMANDOS ÚTEIS PARA REFERÊNCIA

### Validações locais (sempre antes de commit)

```bash
# TypeScript
npx tsc --noEmit

# Lint específico
npx eslint src/components/X/Y.tsx

# Unit tests (rápido — ~4s)
npx vitest run

# Unit test isolado
npx vitest run nomeDoArquivo

# E2E Playwright spec específica
npx playwright test tests/XX-spec.spec.ts --workers=1 --reporter=list

# E2E full suite (lento — ~10-20min)
npx playwright test --workers=1 --reporter=list
```

### Supabase MCP (sempre disponível)

- `mcp__claude_ai_Supabase__execute_sql` — SELECT/INSERT/UPDATE/DELETE direto
- `mcp__claude_ai_Supabase__apply_migration` — DDL migrations
- `mcp__claude_ai_Supabase__deploy_edge_function` — deploy edge fn
- `mcp__claude_ai_Supabase__list_edge_functions` — confirmar versão ACTIVE
- `mcp__claude_ai_Supabase__get_advisors` — security/performance
- `mcp__claude_ai_Supabase__get_edge_function` — fetch source atual de edge fn
- `mcp__claude_ai_Supabase__list_tables` — schema completo
- `mcp__claude_ai_Supabase__get_logs` — logs de edge fn/postgres/auth

**Project ID:** `flcncdidxmmornkgkfbb` (PNR Dashboard, sa-east-1, PG 17.6)

### Companies em prod

- **Caratinga:** `6583bb2a-e334-41a7-b69c-7d98f3b46dfc` (CLAYTON B DOS SANTOS) — 30 employees, ~3130 attendances, ~1722 payments, dados reais ativos
- **Ponte Nova:** `2b2abc4b-084c-4cf0-b5f1-02792513241d` (CD LOGISTICA LTDA) — empresa criada, 1 admin user (8888), demais dados em onboarding

### Edge functions ACTIVE em prod

| Slug | Versão | `verify_jwt` | Função |
|---|---|---|---|
| `auth-login` | v9 | `false` (emite tokens) | POST `{id, password}` → JWT custom HS256 com `{sub, role:'authenticated', aud, company_id, exp:24h}` |
| `clock-in-validated` | v8 | **`true`** | Validação real de geolocalização + criação/update de attendance + logging em error_logs |
| `create-user` | v1 | **`true`** | POST `{id, password, role, companyId}` → bcrypt server-side + INSERT users.password_hash. Admin '9999' OK; supervisor precisa `permissions.users.create` em user_permissions. Sub-fase 11.7. |
| `employee-public-api` | v1 | `false` | 11 actions cobrindo fluxo público do funcionário pós-RLS: `lookup-companies-by-cpf`, `lookup-employee`, `verify-pin`, `set-pin`, `today-attendance`, `attendance-history`, `face-config`, `face-descriptor`, `save-face`, `log-face-attempt`, `employee-errors-by-period`. Sub-fase 11.8. |

### RPCs SECURITY DEFINER ativos

- `verify_admin_secret(p_password text) → boolean` — valida admin via bcrypt
- `update_admin_secret(p_new_password text) → void` — atualiza admin via bcrypt
- `apply_bank_hours_to_payment(...21 args...) → uuid` — apply transacional bank hours

---

## 📐 PATTERN CANÔNICO DE "VALIDAÇÃO REAL" (replicar SEMPRE)

> Replicar este pattern em CADA sub-fase. Não é opcional. Foi o que pegou bugs latentes nas Fases 7-11.

### Step 1 — Pre-check via MCP (ANTES de codar nada)

```sql
-- 1.1 Schema atual da tabela alvo
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'X'
ORDER BY ordinal_position;

-- 1.2 Estado dos dados (pra saber se precisa backfill)
SELECT count(*) FROM X;
```

### Step 2 — Grep callers no código

```bash
grep -rn "from\\('X'\\)\\|tableName" /home/victor/SISTEMA-DE-PONTO/src --include="*.ts" --include="*.tsx"
```

### Step 3 — Apply migration via MCP (`apply_migration`)

### Step 4 — Post-check via MCP (CONFIRMAR efeito real)

```sql
-- Schema novo, constraints, índices, advisors antes/depois
```

### Step 5 — Code change (TS)

### Step 6 — Validation E2E REAL via MCP (não só vitest)

```sql
-- INSERT real simulando o que app faria — N cenários distintos
-- SELECT filtrado confirma comportamento
```

### Step 7 — Cleanup (RESTAURAR estado prod)

```sql
DELETE FROM X WHERE observation LIKE 'PW Test %';
```

### Step 8 — Rodar tsc + vitest + spec E2E relacionada

### Step 9 — Atualizar TECH_DEBT.md + Commit local + Reportar pro Victor

---

## 🔑 CHAVES DE ARQUITETURA — FASE 11 (auth/RLS)

### Fluxo de login

1. **Frontend:** `loginUser(id, password)` faz `fetch POST /functions/v1/auth-login` com Authorization Bearer ANON_KEY.
2. **Edge fn `auth-login` v9:**
   - `SELECT users.password_hash WHERE id = ?` (via service_role)
   - `bcryptjs.compare(password, password_hash)` → valid?
   - Gera JWT HS256 manualmente: header + payload + HMAC-SHA256(data, JWT_SECRET)
   - Retorna `{ token, user: {id, company_id} }`
3. **Frontend `loginUser`:** chama `setAuthToken(token)` do `src/lib/supabase.ts`.
4. **`setAuthToken`:** recria o `supabase` client com `global.headers.Authorization = Bearer ${token}` e salva no `sessionStorage`. Proxy export reflete novo client imediatamente.
5. **Próximas queries Supabase:** RLS policies leem `auth.jwt() ->> 'company_id'`. Match passa, vê dados da empresa do user.

### Admin master '9999' bypass

Policies têm `OR auth.jwt() ->> 'sub' = '9999'`. Admin master vê todas empresas. Switch via CompanySwitcher persiste em `localStorage['sistema_ponto_company_id']` — JWT permanece com `company_id` original, mas o UI/state armazenam o switch.

### Logout

`clearAuthToken()` no `src/lib/supabase.ts` recria client sem headers + remove sessionStorage. Próximas queries voltam a ser anon (bloqueadas pela maioria das policies).

### Tabelas com RLS ativo (47)

- **32 core do Sistema de Ponto** (policies via `auth.jwt() ->> 'company_id'`):
  Cat A (22): `admin_cleanup_config`, `attendance`, `bank_hours_application_log`, `bank_hours_overrides`, `bonus_blocks`, `bonus_removals`, `bonus_types`, `bonuses`, `employees`, `error_records`, `face_auth_attempts`, `face_recognition_config`, `geo_fraud_attempts`, `geolocation_config`, `payment_period_config`, `payment_periods`, `payments`, `triage_distribution_employees`, `triage_error_distributions`, `triage_errors`, `user_permissions`, `users`
  + `error_logs` (NULLABLE company_id, policy especial)
  + `companies` (SELECT TO public USING(true); modify só admin)
  + `admin_secret` (DENY ALL — só RPC verify/update)
  + 7 admin-only: `activity_logs`, `admin_cleanup_logs`, `audit_logs`, `auto_cleanup_config`, `cleanup_logs`, `data_retention_settings`, `permission_logs`
- **15 legado** (não mexer — outro projeto)

### Specs E2E afetadas pelo RLS

✅ **Passando após Fase 11:**
- `01-auth` (6/6), `02-employee-clock` (9/9), `08-geolocation` (4/4), `12-admin-tab` (3/3), `26-multi-company-ui-isolation` testes 1-5, 7-9, 10-13

❌ **Quebrados por SERVICE_ROLE_KEY ausente (vide pendência 1):**
- `25-multi-company-isolation` (testes que fazem SELECT/INSERT via getClient como anon)
- `26-multi-company-ui-isolation` teste 6 (count users via getClient)

---

## ⚠️ AVISOS IMPORTANTES PRA PRÓXIMA SESSÃO

1. **JWT_SECRET configurada em prod (var custom).** NÃO recriar — Já existe. Se alterar JWT Secret do Supabase no Dashboard, tem que atualizar a var custom também.

2. **`users.password` plain foi DROPADA em prod.** Não rollback fácil — `password_hash` bcrypt é o único guardião. 6 users + 1 admin_secret validados pre-drop (todos com hash `$2a$` length 60).

3. **`createDefaultAdmin` em `database.ts:334-360` está obsoleto** — ainda tenta INSERT com `password` plain. Como admin '9999' já existe, never disparam INSERT. Mas tem WARN no console. Remover na próxima sessão (limpeza). **Não é bug crítico.**

4. **`User` interface (`database.ts:14-20`)** ainda tem `password: string` mas a coluna não existe. TS aceita (campo opcional faltante = undefined). Atualizar pra remover `password` ou marcar optional. **Limpeza cosmética.**

5. **Auto-cleanup de tests:** specs criam fixtures com prefix `PW Test ...` e cleanup automático via `cleanupByPrefix`. Valida sempre via MCP que residue=0 pós-test. **Padrão obrigatório.**

6. **`docs/security-baseline-pre-rls.md` + `docs/security-baseline-post-rls.md`** salvos pra audit trail. Comparação direta lá.

7. **Spec 26 test 6** foi refatorado na sub-fase 7.3 pra ser robusto a counts variáveis. Continua quebrado pela pendência 1 (SERVICE_ROLE_KEY).

8. **Memory atualizada:** `project_auth_no_email.md` tem D3/D4 confirmados. Outras conversas devem ler ela primeiro.

---

**Fim do checkpoint.** Bom retorno ao trabalho — não economize qualidade pra economizar tempo. O Victor pediu "sistema 100%, não meia bomba", e a Fase 11 entregou: **67 ERRORs → 0** ✅.
