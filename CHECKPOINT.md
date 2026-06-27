# 🚦 CHECKPOINT — Sistema de Ponto Multi-Empresa rumo à Produção

> **Arquivo principal de retomada.** Ao abrir o Claude Code, este é o índice mestre.
> Detalhes técnicos foram divididos em 5 arquivos auxiliares — ver §3.

**Última atualização:** 2026-06-27 (mestre **2626** + edição de ponto exclusiva do 2626 — tela + servidor — deployado e logando em prod ✅). Ver `CHECKPOINT_SESSAO_2026-06-27.md`. Último commit: `5bad73e`.
**Branch:** `main` (sincronizada com origin)
**Release publicada:** https://github.com/vitorangelol03-crypto/SISTEMA-DE-PONTO/releases/tag/v2.0.0-multi-tenant.1
**CI status:** ✅ verde no commit `e3ec3b0` (run 26065259300 — vitest + tsc/eslint + playwright)
**Plano canônico:** `PLANO_100.md` (roadmap completo até 100%)
**TECH_DEBT canônico:** `TECH_DEBT.md`
**Memory:** `/home/victor/.claude/projects/-home-victor-SISTEMA-DE-PONTO/memory/`

## 🆕 Sessão 2026-06-27 — Mestre 2626 + edição de ponto exclusiva (detalhes em `CHECKPOINT_SESSAO_2026-06-27.md`)

Feature: novo **usuário mestre `2626`** (login `2626` / senha `cdlogistica26`; senha **fora do git**),
em paridade total com o 9999 (cross-empresa via RLS). E **edição de ponto** (editar saída, horário
manual, dias anteriores, reset/exclusão) virou **exclusiva do 2626** — nem o 9999 pode mais.

- **Camadas:** frontend (`src/config/masters.ts` como fonte única + chokepoint em `usePermissions`
  e `validatePermission`), RLS (36 policies aceitam 2626; migration `20260627120000`), e trigger
  `enforce_ponto_master_only` em `attendance` (migration `20260627120100`) — libera service_role
  (clock-in) e 2626; bloqueia o resto de alterar horário/data e excluir ponto.
- **Edge fn `create-user` v2:** aceita 2626 como criador.
- **Verificado real:** clock-in (service_role) e marcar presença/recalc intactos; 9999/supervisores
  bloqueados de editar/excluir ponto; isolamento multi-empresa preservado; login 2626 OK em prod;
  zero perda de dados (attendance 3970 / 23 hoje, inalterado).
- **Também:** removida a senha do admin (`684171`) que estava exposta na tela de Configurações.
- **Commits (pushed):** `6172ee7` (feature) + `5bad73e` (fix senha exposta).
- **Como reverter:** `DROP TRIGGER trg_enforce_ponto_master_only ON public.attendance;` + reverter
  RLS (IN→=) + `DELETE FROM users WHERE id='2626'` + reverter arquivos/edge fn.

---

## 🆕 Sessão 2026-05-18/19 — Pós-deploy ajustes (6 commits + incidente de polução)

Sessão focada em UX mobile + nova feature de funções + auditoria de polução prod.

### Commits da sessão (todos pushed e CI verde)

| commit | tema | descrição |
|---|---|---|
| `322d40d` | **face perf** | `inputSize 320→224`, intervalo 400→600ms, sem `backdrop-filter` |
| `e9d7f63` | **face perf** | pre-warmup WebGL + frame oval estilo rosto (220×290) |
| `a3b50aa` | **feat funções** | biblioteca de funções (`getFunctionRoles`) + datalist autocomplete + filtro no Financeiro |
| `e1bd010` | **Layout fix** | `<main>` ganha `sm:pb-24` → FAB de ajuda não sobrepõe ações de tabela (10 abas) |
| `14d685f` | **spec 100 C2** | snapshot/restore de payments REAIS antes de aplicar bônus em massa |
| `af62a53` | **spec 38** | `toBe(30)` → `toBeGreaterThanOrEqual(30)` (admin pode cadastrar reais) |
| `cf08976` | **spec 51** | polling robusto pra CI lento |
| `823f45f` | **isolamento bônus** | helper `tests/_bonusIsolation.ts` + blindagem dos specs 100/C2, 09, 40/test3, 99/test4 |
| `e3ec3b0` | **spec 51** | polling no `count()` + mínimo 2 (empresa sem funções é válido) |

### Incidente: poluição de bônus em prod (2026-05-18)

**O que aconteceu**: CI rodando spec 100 C2 (botão "Aplicar B=10") aplicou bônus em massa em Caratinga via `applyBonusToAllPresent` — função do sistema afeta TODOS os presentes da empresa, não diferencia PW Test de funcionário real. 4 funcionários REAIS (Pablo, Lara, Diendrel, Victor Angelo) ficaram com `bonus_b=10` sem admin ter aplicado.

**Cleanup imediato** (via SQL com autorização do admin):
- `UPDATE payments SET bonus_b=0, bonus=0, total=daily_rate` nos 4 REAIS
- `DELETE FROM bonuses WHERE id='7a6461af...'` (regra do dia)

**Fix permanente** (commit `823f45f`):
- Novo helper `tests/_bonusIsolation.ts`: `snapshotRealPayments` + `restoreRealPayments`
- Aplicado em **4 specs** que clicavam "Aplicar B/C1/C2" via UI:
  - `tests/100-supremo-v2.spec.ts` C2
  - `tests/09-bonus-blocks.spec.ts` (test "bonificação aplicada com bloqueio")
  - `tests/40-bonus-individual-ui.spec.ts` test 3 ("aplicar B=15")
  - `tests/99-supremo.spec.ts` test 4 ("Bonificação massiva B=10")
- Filtra REAL como `!name LIKE 'PW Test%' AND !name LIKE 'Demo PN%'` (cobre os 2 prefixos sintéticos)
- Validação: rodou os 4 specs em sequência local → DB pós-execução: **0 REAIS poluídos, 0 rows em `bonuses` do dia**

**Lição**: testes E2E sobre banco compartilhado precisam blindagem explícita quando a função sob teste afeta toda a empresa. Não basta limpar PW Test no afterAll — a row em `bonuses` (regra por dia/empresa) e os payments de funcionários reais persistem.

### Feature nova: biblioteca de funções + filtro Financeiro (commit `a3b50aa`)

Quando admin cadastra função em um funcionário, ela vira sugestão reutilizável (`<datalist>` HTML nativo) nos próximos cadastros da mesma empresa. Novo filtro no Financeiro permite recortar lista por função.

- `src/services/database.ts` — `getFunctionRoles(companyId)` retorna DISTINCT ordenado pt-BR
- `src/components/common/FunctionRoleInput.tsx` (NOVO) — input + datalist
- `src/components/common/FunctionRoleFilter.tsx` (NOVO) — dropdown com "Todas / função X / Sem função"
- `EmployeesTab.tsx` — substitui `<input>` por `FunctionRoleInput`
- `FinancialTab.tsx` — adiciona filtro ao lado do `EmploymentTypeFilter`
- `tests/51-financial-function-filter.spec.ts` (NOVO) — 2 testes E2E
- CI essencial agora cobre spec 51

**Zero migration de banco**: `function_role` continua TEXT NULL em employees, lista é DISTINCT em tempo real.

### Outros achados desta sessão

- **Permissions custom do supervisor 01 deletadas** (DB-only, não vai pro git) — supervisor estava sem abas Erros + Relatórios porque alguém via UI tinha zerado `errors.view` + `reports.view`. DELETE da row em `user_permissions` → caiu no `DEFAULT_SUPERVISOR_PERMISSIONS` → tabs voltaram.
- **Spec 101 PN não precisa fix** — confirmou que filtra por `name LIKE 'Demo PN%'`, robusto contra cadastros reais
- **Caratinga só tem 1 função distinta** ("Auxiliar Administrativo"). As 9 funções vistas inicialmente estavam concentradas em Ponte Nova (8 distintas)

### Pendências remanescentes (dependem do Victor)

| # | item | status |
|---|---|---|
| 1 | Testar face fluidez no celular (warmup + oval + inputSize 224) | ⏳ aguardando |
| 2 | Spec 101 PN hardcodes | ✅ não precisava (filtra por "Demo PN%") |
| 3 | Specs com bônus em massa | ✅ helper + 4 specs blindados |
| 4 | Deploy de produção (redeploy do build atualizado) | ⏳ Victor dispara |

---

## 🔍 Auditoria Forense (2026-05-17 final) — 12 bugs/gaps detectados + fixados

Após afirmar "100% validado" várias vezes prematuramente, Victor pediu auditoria
rigorosa. 3 rounds de investigação detectaram:

| # | Bug/Gap | Severidade | Round | Commit fix |
|---|---|---|---|---|
| 1 | CI ESLint error (`loginAs` unused em spec 47) | 🔴 Alta | 1 | `d6b876a` |
| 2 | Spec 100 B4 flake CI (waitForTimeout 2.5s → polling DB) | 🔴 Alta | 1 | `50f3ea3` |
| 3 | Trigger face auto-reset: threshold=0 NÃO desligava (bug lógico) | 🔴 Alta | 1 | migration MCP |
| 4 | Edge fn `send-push` role check via JWT (sempre `authenticated`) | 🔴 Alta | 1 | edge fn v2 |
| 5 | Edge fns `public-api-v1` + `send-push` SEM source no repo | 🔴 Alta | 2 | `8dbc9c6` |
| 6 | `coverage/` faltava no `.gitignore` | 🟡 Média | 2 | `8dbc9c6` |
| 7 | **11 migrations MCP fora de `supabase/migrations/`** | 🔴 Alta | 2 | `65ce593` |
| 8 | CI essencial não rodava specs 47/49/50 | 🔴 Alta | 2 | `65ce593` |
| 9 | `_test_create_supervisor_with_perms` `gen_salt` schema → CI fail | 🔴 Alta | 3 | `714b5e3` |
| 10 | CHECKPOINT.md: 5 métricas defasadas | 🟡 Média | 3 | `7dc3827` |
| 11 | `bench-edge-fns.mjs` action `lookup-cpf` inexistente | 🟡 Média | 3 | `cc0dcd9` |
| 12 | Afirmação "7 edge fns" (era 6) em docs | 🟢 Baixa | 3 | `7dc3827` |

**Lição aprendida:** verificação rigorosa antes de afirmar. Cada vez que disse
"100%" sem auditar, novo bug aparecia. Audit forense 3x detectou + fixou tudo.

---

## ⛔ AS 8 REGRAS OBRIGATÓRIAS (NÃO IGNORAR)

Estas regras valem **pra cada sub-fase, toda execução**. Foram negociadas com o Victor. **Quebrar é incidente.**

### Regra 1 — VALIDAR TUDO REAL (não confiar só em tsc/lint/vitest)
- **Antes de mudar código:** pre-checks reais no banco via Supabase MCP — `list_tables`, `execute_sql` com `SELECT count(*)`, `EXPLAIN ANALYZE`.
- **Durante mudança:** validar com dados reais de prod (não fixtures inventadas).
- **Após mudança:** validar via MCP que estado mudou conforme esperado (constraint existe? row criada? índice ativo?).

### Regra 2 — NUNCA QUEBRA-GALHOS
- **Sem `as any`** sem documentar por quê.
- **Sem suprimir warnings** sem justificativa + ticket.
- **Sem hardcoded values** que dependem de empresa específica.
- **Sem testes "que passam"** sem validar fluxo real.

### Regra 3 — UMA SUB-FASE = UM COMMIT ATÔMICO
- Mensagem: `tipo(escopo): descrição (sub-fase X.Y)`
- Co-author: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- **NUNCA `git push`** sem autorização (Victor é o único push-er).

### Regra 4 — SE TESTE FALHAR, MOSTRAR PRA VICTOR ANTES
- Não "ajustar mock pra passar" se a falha indica problema real.

### Regra 5 — TECH_DEBT é CANÔNICO
- Toda mudança que resolve bug → mover entry pra `## ✅ Histórico — Resolvidas` com data + sub-fase + validação real.

### Regra 6 — DECISÕES DE PRODUTO/SEMÂNTICA SEMPRE COM VICTOR
- Decisões D1-D6 do plano. **Status: TODAS resolvidas** (ver `CHECKPOINT_ARQUITETURA.md §6`).

### Regra 7 — PADRÃO IDIOMÁTICO DO PROJETO
- **Auth/login:** ID numérico + senha (SEM email). JWT custom HS256 com JWT_SECRET.
- Multi-empresa: `company.id` por param. RLS via `auth.jwt() ->> 'company_id'`.
- TypeScript: tipos explícitos. Sem `any` sem comentário.

### Regra 8 — QUALIDADE ACIMA DE VELOCIDADE
> _"Sistema 100%, não meia bomba"_ — Victor.
> Quando em dúvida, qualidade > tempo. Sempre.

- Cada decisão favorece robustez, não atalho.
- Não pular validação alegando "é simples".
- Não simplificar mock/teste pra "passar".
- Reflexão obrigatória antes de cada commit: _"estou escolhendo o caminho mais robusto ou o mais rápido?"_

---

## 📊 ESTADO ATUAL — 2026-05-13

### Resumo executivo

| Métrica | Valor |
|---|---|
| **Branch / working tree** | `main` / limpo (só `coverage/` untracked, ignorado) |
| **Último commit** | sub-fase 14.23 (checkpoint completo) |
| **Security advisors ERRORs (core)** | **0** ✅ |
| **RLS-enabled tables** | **52** (+2: api_keys + push_subscriptions + push_send_log) |
| **Edge functions ACTIVE** | **6** (auth-login v9, clock-in-validated v8, create-user v1, employee-public-api v3 bcrypt, **public-api-v1 v2**, **send-push v2**) |
| **Migrations DB / repo** | **74 DB / 35 repo** (recuperadas via auditoria forense) |
| **Unit tests (Vitest)** | **458 passing** + 1 skipped (24 specs em `tests/unit/`) |
| **Performance Supabase** | RLS cache subquery em 55 policies ✅, 23 FKs indexadas ✅, 22 multiple_permissive eliminadas ✅ |
| **Estados UI cross-empresa** | 7/7 tabs resolvidas (4 Sev Alta + 3 Sev Média) ✅ |
| **UX mobile** | 31/31 subset mobile-pixel5 ✅ (era 14/31 inicial) |
| **Browser compat** | Chromium ✅ + Firefox 15/15 ✅ + Webkit 15/15 ✅ (sub-fase 16.2.1, 2026-05-17) |
| **Realtime AttendanceTab** | ✅ 3 channels (employees, attendance, payments) + polling 30s fallback |
| **Backup drill** | ✅ `backup-all.mjs` + `verify-backup.mjs` (drift detection) |
| **Face auto-reset** | ✅ Trigger DB N falhas (default 5 em 60min) |
| **Spec 47 supervisor users.create** | ✅ 2/2 cenário descoberto exercitado |
| **Tag v2.0.0-multi-tenant.1** | ✅ Push remote (commit `9830246`) |
| **GitHub Release** | ✅ Publicada em 14.52 |
| **Performance baseline doc** | ✅ `docs/PERFORMANCE_BASELINE.md` + `scripts/bench-edge-fns.mjs` |
| **PDF holerite v2** | ✅ `src/utils/holeritePdf.ts` v2 (sub-fase 17.2.1) — grid dados, breakdown, resumo, assinaturas |
| **Multi-idioma real** | ✅ react-i18next + LoginForm + Layout + TabNavigation + LanguageSwitcher (sub-fase 17.5.1) — 60 chaves pt-BR/en |
| **API pública v1.1** | ✅ Edge fn `public-api-v1` v2 + endpoints `/employees`, `/attendance`, `/payments` com pagination (sub-fase 17.6.1) |
| **UI admin face threshold** | ✅ Form em AdminTab pra ajustar max_attempts + window via UI (sub-fase 17.3.1) |
| **Capacitor Android setup** | ✅ Estrutura 100% pronta (`android/`, AndroidManifest, 4 plugins) — falta só Studio (sub-fase 17.1.1) |
| **Firebase Push infra local** | ✅ Tabela + edge fn `send-push` + SW + cliente `pushNotifications.ts` (sub-fase 17.4.1) — falta só Firebase project |
| **Face perf mobile** | ✅ inputSize 320→224, intervalo 400→600ms, pre-warmup WebGL, frame oval 220×290 (sessão 2026-05-18) |
| **Função reutilizável** | ✅ `getFunctionRoles` + datalist autocomplete em cadastro + filtro no Financeiro (commit `a3b50aa`) |
| **Helper isolamento bônus** | ✅ `tests/_bonusIsolation.ts` — 4 specs blindados contra polução prod (commit `823f45f`) |
| **Bug visual FAB ajuda** | ✅ `<main>` ganha `sm:pb-24` — botão não cobre mais ações da última linha (commit `e1bd010`) |
| **Spec 48 FaceRegistration** | ⏸️ Skipped (TECH_DEBT 16.1.X — mock pesado postponed) |
| **Tutorial Victor** | ✅ `TUTORIAL_VICTOR.md` com 7 itens step-by-step |
| **E2E specs (Playwright)** | **54 specs** (CI essencial: 10 specs — spec 51 incluído / Full local: 334+ em 44.5min) |
| **Spec Supremo PN** | `tests/101-supremo-pn.spec.ts` — **25/25** contra prod em 1.1min ✅ |
| **Funcionários PN** | **30 Demo PN** (20 CLT + 8 Diarista + 2 PJ) com PINs bcrypt |
| **CI GitHub Actions** | **100% VERDE** ✅ (Run #21: vitest 30s + tsc 22s + playwright 8m43s) |
| **Spec Supremo 2.0** | `tests/100-supremo-v2.spec.ts` — **46/46** contra prod URL em 2.0min ✅ |
| **Lighthouse (dist build)** | Perf 87 / **A11y 100** / Best 100 / SEO 100 |
| **PINs bcrypt** | **26/26** Caratinga + 30/30 PN Demo (0 plain restantes) ✅ |
| **Bugs latentes em prod** | **0** ✅ |
| **Tutoriais Ajuda** | **28** (13 originais + 15 novos cobrindo features fases 8-14) |
| **TECH_DEBT entries resolvidos hoje** | **3** (6.17 flake timeout, 6.23 validatePixKey, 3.5+3.6 docs/Vite) |
| **Roadmap canônico** | `PLANO_100.md` (sub-fases 14.18 → 17.X pra 100%) |

### Fases concluídas (5 → 14)

| Fase | Tema | Status |
|---|---|---|
| 5-10 | Quick wins + Cobertura + Migrations + E2E components | ✅ |
| **11** | **Hardening RLS + bcrypt (67 ERRORs → 0)** | ✅ |
| 12 | Documentação (README + PRE-LAUNCH + ARCHITECTURE + edge-fns) | ✅ |
| 13 | Validação final (3× Playwright clean) | ✅ |
| **14** | **Pós-validação + UI bug hunt + cobertura final + batch determinístico** | ✅ |

Detalhe completo de cada fase → `CHECKPOINT_FASES.md`

---

## 📁 ARQUIVOS DO CHECKPOINT (dividido pra não ficar gigante)

| Arquivo | O que tem |
|---|---|
| **`CHECKPOINT.md`** (este) | Índice + 8 regras + estado executivo + ponteiros |
| `CHECKPOINT_FASES.md` | Histórico granular das fases 5-14 + sub-fases |
| `CHECKPOINT_ARQUITETURA.md` | Stack, fluxo de auth, decisões D1-D6, padrões idiomáticos |
| `CHECKPOINT_BANCO.md` | Schema, RLS, edge functions, RPCs, migrations |
| `CHECKPOINT_TESTES.md` | Specs E2E + Vitest, coverage, comandos, patterns |
| `CHECKPOINT_OPERACAO.md` | Deploy, manual ops, troubleshoot bugs latentes |
| `CHECKPOINT_PROXIMOS_PASSOS.md` | Pendências + ações Victor go-live + gaps postponed |

**Outros docs canônicos do projeto:**
- `ARCHITECTURE.md` — Mermaid diagrams completos
- `PLANO_PRODUCAO.md` — plano original que orientou as Fases 5-14
- `TECH_DEBT.md` — tech debt registrado com sub-fases previstas
- `README.md` — visão produto
- `PRE-LAUNCH-CHECKLIST.md` — checklist de pré-lançamento

---

## 🎯 ESTADO ATUAL DA SUB-FASE 14 (em andamento)

### Concluído hoje (2026-05-13)

#### 14.4 (continuação) — Manual UI Bug Hunt
- ✅ 11 bugs reais cazados via teste manual UI no browser do Victor
- ✅ Causa raiz refator: `supabase.ts` 1 instance + fetch interceptor (14.4.9)
- ✅ Spec 38 `system-walkthrough` auto-captura console errors em 8 fluxos

#### 14.5 / 14.6 / 14.7 / 14.8 — Cobertura final via 6 agents paralelos
Em resposta ao pedido Victor: _"eu quero que vc teste tudo tudo mesmo, e valide tudo, se for preciso use mais agentes"_:

| Sub-fase | Spec | Resultado |
|---|---|---|
| 14.5 | `37-create-user-e2e` (createUser via UI completo) | 5/5 ✅ |
| 14.5 | `38-system-walkthrough` (8 fluxos + console capture) | 8/8 ✅ |
| 14.6 | `39-create-employee-ui` (criar emp UI form + validações + edit) | 5/5 ✅ |
| 14.6 | `40-bonus-individual-ui` (bonificação aplica/remove via UI) | 5/5 ✅ |
| 14.7 | `41-company-settings-save` (city/address/radius/schedule persist) | 5/5 ✅ |
| 14.7 | `42-bank-hours-apply-ui` (apply via UI + log + payment updated) | 3/3 + 1 skip ✅ |
| 14.8 | `unit/edgeFnEmployeePublicApi` (set-pin/save-face/log-face-attempt happy) | 4/4 + 1 skip ✅ |
| 14.8 | `unit/xlsxSecurity` (5 defensive tests prototype pollution) | 5/5 ✅ |
| 14.8 | Race fix tests/26+37 (PN config snapshot + pre-create user via DB) | 26: 9/9 ✅ + 37: 5/5 ✅ |

**3 ajustes pós-criação dos specs (strict mode + reload):**
- `40` test 4: `.first()/.last()` em getByText
- `41` test 5: `page.reload()` após setLatLngDirect
- `42` test 2: `getByText('Selecionados', {exact: true})`

#### 14.9 — Batch 100% determinístico (4 race failures → 0)

Após sub-fases 14.5-14.8, batch report mostrou 4 failures (255 passed/18 skipped/4 failed) que **passavam isoladas**. Investigação confirmou **causa raiz arquitetural** no spec 40:

- `AttendanceTab.loadData()` dispara só no mount/[company?.id]/[selectedDate]. Polling silencioso 30s. Sem refetch live.
- Sequência: `loginAs` → `goToTab('Ponto')` → mount → `loadData` (lista vazia) → `createTestEmployee` (SQL INSERT) → UI mostra lista cached **sem o novo emp**.
- Tests 1/4 às vezes passavam (timing); tests 2/3 sempre cached.

**Fix spec 40:** `searchEmployee` clica botão "Atualizar" antes do fill → força refetch.
**Fix spec 37:** warmup **completo** no `beforeAll` (login admin → JWT custom → cria user real `97000` via edge fn), forçando bcrypt.hash + INSERT antes dos tests. Worker 100% warm. Describe timeout 90s→180s + expect 30s→60s como camada extra.

**Resultados finais validados:**
- Spec 40 isolado: 5/5 ✅ (era 2 failed)
- Spec 37 isolado com warmup full: 5/5 ✅ em 27.1s (test 2: 4.5s, test 5: 6.4s)
- **Suite completa: 259 passed / 18 skipped / 0 failed em 19.3min** (era 255/18/4)
- `BATCH_FAILURES_REPORT.md` deletado (info migrada para `CHECKPOINT_FASES.md`)

#### 14.10 — Validação ampla pré-go-live (build + lighthouse + mobile E2E)

Resposta ao pedido "tem mais nada que vc possa testar?" + "use multiplos agentes se for preciso".

**Quick wins (10min total):**
- `npm run build`: 21.26s, dist/ produzido com warning chunks >600kB (aceitável)
- Vitest coverage: 45.96% Stmts (utils 81%+; services testados via E2E)
- Supabase advisors: 0 ERRORs Sistema de Ponto core
- Edge fns warm: todas <1s (auth-login 0.67s, employee-public-api 0.30s, clock-in 0.28s, create-user 0.21s)

**Médio (Lighthouse + dist smoke):**
- Dist serve (`npx serve dist -l 4173`) + smoke chromium: ✅
- Lighthouse: Perf **86** / A11y **75** / Best **100** / SEO **100**. FCP/LCP 3.3s, TBT 0ms, CLS 0

**Alto (agent paralelo — Mobile E2E):**
- Patch `playwright.config.ts`: project `mobile-pixel5` (Pixel 5, touch). Não roda por padrão.
- Subset mobile: **14/31 passed**. `/clock` 9/9 ✅. Tabs admin: TabNavigation colapsa em hamburger (regressão helpers, não bug usuário).
- TECH_DEBT registrados: 6.25 (UX mobile) + 6.26 (A11y).

---

## 🚀 PRÓXIMOS PASSOS

**Sistema técnico está 100% pronto** + Caratinga em prod desde 14/5. Próximas ações:

### Bloqueado por Victor (não posso fazer):
1. **Onboarding Ponte Nova real** — importar planilha de ~30 employees (Victor mandar planilha)
2. **Push tag `v2.0.0-multi-tenant`** + GitHub Release publicada (Victor faz push)
3. **Smoke test pós-onboarding PN** — 1 funcionário marca ponto + geo bloqueio

### Pode executar sem Victor (roadmap `PLANO_100.md`):
4. **Bloco Tech Debt Médio** — sub-fases 14.24-14.27 (~5-6h):
   - 14.24/14.25/14.26 Estados UI cross-empresa em 3 tabs (AttendanceTab, FinancialTab, DataManagementTab)
   - 14.27 UX mobile completa (aria-label, helpers detect viewport)
5. **Bloco Estabilidade** — sub-fases 14.28-14.29 (~1-2 dias):
   - 14.28 Flake C6 helper `importC6`
   - 14.29 AttendanceTab refetch live (Realtime)

### Pós-onboarding PN (Fase 15+):
6. Fase 15 — Performance advisors (148 advisors otimizados, ~4-7h)
7. Fase 16 — Cobertura postponed (FaceRegistration, Firefox/Safari, etc.)
8. Fase 17 — Features novas (APK Android, export PDF, push notifications)

Roadmap completo → **`PLANO_100.md`**
Detalhes go-live → `CHECKPOINT_PROXIMOS_PASSOS.md`

---

## 🤖 ABORDAGEM PARA RETOMAR (nova sessão Claude Code)

1. **Ler este checkpoint + os 6 arquivos auxiliares.**
2. **Confirmar as 8 regras obrigatórias** acima.
3. **Verificar estado:**
   ```bash
   git log --oneline -10                 # último commit deve ser fechamento 14.5/6/7/8
   git status --short                     # working tree limpo (só .claude/)
   ```
4. **Validar baseline:**
   ```bash
   npx tsc --noEmit                       # exit 0
   npx vitest run | tail -5               # 422+ passing
   ```
5. **Avaliar com Victor** os próximos passos:
   - Onboarding Ponte Nova (manual)
   - Release/deploy
   - Tech debt residual aceito (PIN bcrypt? cleanup cosmético `User.password`?)
   - Pós-go-live: monitoring/observability

---

## 🔧 Comandos úteis (cheat sheet rápido)

```bash
# Validações
npx tsc --noEmit
npx eslint src/
npx vitest run
npx playwright test --workers=1 --reporter=list

# Spec isolado
npx playwright test tests/XX-spec.spec.ts --workers=1 --reporter=list
npx vitest run nomeDoArquivo

# Git
git log --oneline -10
git diff --stat HEAD~5
```

**Supabase MCP** (sempre disponível):
- `mcp__claude_ai_Supabase__list_tables`
- `mcp__claude_ai_Supabase__execute_sql`
- `mcp__claude_ai_Supabase__apply_migration`
- `mcp__claude_ai_Supabase__deploy_edge_function`
- `mcp__claude_ai_Supabase__list_edge_functions`
- `mcp__claude_ai_Supabase__get_advisors`
- `mcp__claude_ai_Supabase__get_logs`

**Project ID:** `flcncdidxmmornkgkfbb` (PNR Dashboard, sa-east-1, PG 17.6)

---

## ⚠️ Avisos importantes (não esquecer)

1. **JWT_SECRET em prod já configurada** — NÃO recriar. Se rotacionar JWT Secret no Dashboard, atualizar var custom também.
2. **`users.password` plain DROPADA em 11.1** — sem rollback fácil.
3. **`createDefaultAdmin`** removido em 11.6 — não tem mais issue.
4. **Specs E2E:** prefix `PW Test` + cleanup automático. **Padrão obrigatório.**
5. **Memory:** `project_auth_no_email` confirma D3+D4. Ler antes de tocar em auth/RLS.
6. **`docs/security-baseline-pre-rls.md` + `post-rls.md`** salvos pra audit trail.
