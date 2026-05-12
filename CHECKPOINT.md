# 🚦 CHECKPOINT — Sistema de Ponto Multi-Empresa rumo à Produção

> **Arquivo de retomada de sessão.** Quando reabrir o Claude Code, mande este arquivo (`cat CHECKPOINT.md`) ou peça pra Claude lê-lo. Ele deve restaurar contexto completo + REGRAS antes de fazer qualquer coisa.

**Última atualização:** 2026-05-12 (após Fases 5-13 completas — sistema 100% pronto pra go-live)
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

## 📊 ESTADO ATUAL — Fases 5 a 13 ✅ COMPLETAS — Sistema 100% pronto pra go-live

**Branch:** `main`
**Último commit:** `f612499` (sub-fase 11.8.1) → próximo será o de fechamento da 13.2
**Working tree:** limpo (só `.claude/` untracked)
**Playwright suite:** 3× consecutivos sem flake (228 passed, 17 skipped, 0 failed, ~20min cada)
**Security advisors Sistema de Ponto:** **0 ERRORs** ✅

### Resumo das fases concluídas

| Fase | Tema | Sub-fases | Status |
|---|---|---|---|
| **5** | Quick wins | 5.1-5.6 | ✅ |
| **6** | Cobertura unit tests | 6.1-6.6 | ✅ (414 unit tests) |
| **7** | Migrations small + cleanups | 7.2-7.4 | ✅ |
| **8** | Fixes médios | 8.1, 8.3, 8.4, 8.5 | ✅ |
| **9** | E2E gaps fixáveis | 9.1-9.4 | ✅ (9 skips condicionais → 0; 4 specs E2E novas) |
| **10** | E2E componentes | 10.1, 10.2, 10.3✅, 10.4, 10.5, 10.6, 10.8 + 10.7 postponed | ✅ (48 tests + AuditLogsTab exposto) |
| **11** | Hardening produção pública | 11.0-11.5 + **11.6 + 11.7 + 11.8 + 11.8.1** | ✅ **(67 ERRORs → 0; bug createUser fixed; lacuna anon-RLS fixed)** |
| **12** | Documentação | 12.1-12.4 | ✅ (README, PRE-LAUNCH, edge-fns, ARCHITECTURE) |
| **13** | Validação final | 13.0, **13.1, 13.2** | ✅ (SERVICE_ROLE fallback + Playwright 3× clean + audit final) |

### Métricas finais

| Métrica | Inicial (pré-Fase 5) | Atual (pós-Fase 13) |
|---|---|---|
| **Security advisors total** | 85 | **23** (-73%) |
| **Security ERRORs (Sistema de Ponto)** | 67 | **0** ✅ |
| `rls_disabled_in_public` | 64 | 0 |
| `sensitive_columns_exposed` (password plain) | 2 | 0 |
| Tabelas com RLS ON | 0 | 47 (32 core + 15 legado) |
| Senha plain text | sim (`users.password`) | **não** (bcrypt em `password_hash`) |
| Edge fns ativos em prod | 1 (`clock-in-validated` v6 verify_jwt:false) | **4** (auth-login v9, clock-in-validated v8, create-user v1, employee-public-api v2) |
| Unit tests | 414 | **422** |
| Specs E2E Playwright | 30 | **35** (+ runs 3× sem flake = 228 passing) |
| Migrations | 50 | **57** |
| `users.password` plain em prod | sim | **dropada** |
| Docs canônicas | README desatualizado + PRE-LAUNCH desatualizado | README v2.0.0-rc.1 + PRE-LAUNCH 10/10 + ARCHITECTURE com Mermaid + docs/edge-functions.md |
| Bugs latentes em prod | 1 (createUser INSERT plain) + 1 (app funcionário /clock+/erros sem queries pós-RLS) | **0** |

### Commits desta sessão (18, mais antigos primeiro)

```
a6655e8  docs(checkpoint): adicionar Regra 8 — Qualidade > Velocidade
a9607ce  refactor(auth): remover createDefaultAdmin + User.password obsoletos (sub-fase 11.6)
79cf44b  feat(auth): edge fn create-user com bcrypt + frontend reescrita (sub-fase 11.7)
156bc0e  docs(readme): atualizar pra refletir multi-tenant + Fase 11 (sub-fase 12.1)
523d10c  docs(checklist): atualizar PRE-LAUNCH pós Fase 11 (sub-fase 12.2)
f277aaa  docs(edge-fns): referência canônica das 3 edge fns ACTIVE (sub-fase 12.3)
93c0706  docs(architecture): criar ARCHITECTURE.md com Mermaid diagrams (sub-fase 12.4)
85546f4  feat(admin): expor AuditLogsTab sob AdminTab Section 10 (sub-fase 10.3)
b5bb660  feat(tests): cleanup.ts:getClient prefere SERVICE_ROLE_KEY + .env.example (sub-fase 13.0)
ca61c90  feat(edge-fn): employee-public-api unificada (sub-fase 11.8 — fix lacuna pós-RLS)
f612499  fix(edge-fn): adicionar action employee-error-periods (sub-fase 11.8.1)
[+commit fechamento 13.2 — TBD]
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

## 🚧 PENDÊNCIAS / AVISOS CONHECIDOS (não bloqueiam go-live)

### 1. Sub-fase 10.7 (FaceRegistration) POSTPONED — mock pesado fora do escopo

`face-api.js` + `navigator.mediaDevices.getUserMedia` + `<video>` element exigem mock library compartilhada (~6-8h). Precedente: `tests/23-employee-clock-complete.spec.ts:173` skipa explicitamente. Componente funciona em prod — apenas não é exercitado por specs E2E.

### 2. 6 WARNs persistentes em advisors (intencionais)

- 3 funções SECURITY DEFINER nossas: `apply_bank_hours_to_payment`, `verify_admin_secret`, `update_admin_secret`. Já revogamos anon em `apply_bank_hours_to_payment` (11.5). Outras 2 precisam de anon pra fluxo pré-login (verify admin password).
- 16 WARNs no sistema legado (Q2 decisão Victor: não mexer — outro produto).

### 3. `nightDebitMinutes = 0` (decisão técnica conservadora, NÃO bug)

Todo débito tratado como diurno, sem multiplier noturno aplicado. Documentado.

### 4. Cold start `create-user` ~150s primeira chamada pós-deploy

Característica conhecida (TECH_DEBT 6.13) — esm.sh bcryptjs download. Warm 0.57s. Solução UI: spinner com "pode levar até 2 minutos no primeiro uso". Não bloqueia.

### 5. PIN funcionário ainda plain text (`employees.pin`)

Validado server-side via edge fn `employee-public-api` action `verify-pin`. Não exposto na rota REST (RLS bloqueia anon SELECT em employees). Migrar pra bcrypt seria coerente com password — mas exige migração de fluxo (similar à 11.3+11.7). Anotado como sub-fase 11.9 futura se necessidade aparecer pós-go-live.

---

## 📋 AÇÕES MANUAIS PARA GO-LIVE (Victor)

Trabalho do Claude está **completo**. Próximos passos exigem ação manual do Victor:

### 13.3 — Onboarding Ponte Nova com dados reais

- [ ] Importar ~30 employees em Ponte Nova via UI Admin → Funcionários → Importar Excel
- [ ] Configurar `payment_period_config` (auto_weekly?, semana de pagamento)
- [ ] Configurar `geolocation_config` (lat/lng + radius do escritório de Ponte Nova)
- [ ] Configurar `bonus_types` (B, C1, C2 ou customizados)
- [ ] Validar login do admin local de Ponte Nova (id 8888)
- [ ] Smoke test: 1 funcionário marca ponto via `/clock`

### 13.4 — Release

- [ ] Tag `v2.0.0-multi-tenant` no commit final da Fase 13.2
- [ ] CHANGELOG (ou GitHub Release notes) referenciando: multi-empresa, RLS hardening, bcrypt, 4 edge fns, 0 ERRORs Sistema de Ponto, 228 specs E2E passing 3× sem flake
- [ ] Push da tag pra remote (`git push origin v2.0.0-multi-tenant`)
- [ ] Deploy frontend pro hosting de produção (Vercel/Netlify/etc.)
- [ ] Configurar VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY no hosting (NUNCA SERVICE_ROLE_KEY no frontend prod)
- [ ] Smoke test pós-deploy: login admin `9999` + login supervisor Caratinga + login supervisor Ponte Nova + clock-in real

---

## 🤖 ABORDAGEM PARA RETOMAR

Sistema está 100% pronto. Quando reabrir o Claude Code:

1. **Ler este checkpoint** integralmente.
2. **Confirmar as 8 regras obrigatórias** acima — Regra 8 ("Qualidade > Velocidade") reforça as outras 7.
3. **Verificar estado:**
   ```bash
   git log --oneline -5     # último commit deve ser do fechamento Fase 13.2
   git status --short       # working tree limpo (só .claude/ untracked)
   ```
4. **Validar baseline:**
   ```bash
   npx tsc --noEmit         # limpo
   npx vitest run | tail -5 # 422/422 passing
   ```
5. **Avaliar com Victor** os próximos passos:
   - Ações manuais Go-Live (13.3 onboarding Ponte Nova + 13.4 release/tag)
   - Tech debt residual aceito (PIN bcrypt? 6.10 setPaymentPeriodAutoWeekly? etc.)
   - Pós-go-live: monitoring/observability/feedback de usuários reais

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
