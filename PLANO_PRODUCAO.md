# PLANO DE PRODUÇÃO — Sistema de Ponto Multi-Empresa

> **Documento de plano canônico versionado no repo.** Original em `/home/victor/.claude/plans/ent-o-divide-e-crie-zesty-biscuit.md` (mantido pra histórico).
> **Criado em:** 2026-05-11
> **Última atualização:** 2026-05-11 (pós sub-fase 8.5, commit `a4d6884`)
> **Objetivo:** levar o sistema do estado atual a **100% pronto para produção multi-empresa pública**.
>
> **📌 LEIA TAMBÉM:** `CHECKPOINT.md` na raiz tem regras operacionais + racional D1-D6 + gaps conhecidos + pattern canônico de "validação real".

---

## 🎯 PROGRESSO ATUAL (2026-05-11)

| Fase | Status | Sub-fases | Commits |
|---|---|---|---|
| **5** Quick wins | ✅ COMPLETA | 5.1 a 5.6 | `96f037d`, `b14f739`, `0ba0e9d`, `7e34daa`, `523e296`, `3fe9740` |
| **6** Unit tests | ✅ COMPLETA + reforço REAL | 6.1 a 6.5 + 6.6 | `6f44c14`, `7e486d2`, `9748564`, `a9b3098`, `d8a238a`, `ff51819` |
| **7** Migrations small | ✅ COMPLETA | 7.2 + 7.2.1 + 7.3 + 7.4 | `19a72f3`, `0840f9c`, `73d7649`, `b2a1bbb` |
| **8** Fixes médios | ✅ COMPLETA | 8.1 + 8.3 + 8.4 + 8.5 | `60d80a5`, `05ac7ce`, `e70da28`, `a4d6884` |
| **9** E2E gaps fixáveis | ⏳ PENDENTE — sem bloqueio | 9.1 a 9.4 | — |
| **10** E2E componentes | ⏳ PENDENTE — sem bloqueio | 10.1 a 10.8 | — |
| **11** Hardening produção | 🔒 BLOQUEADA (D3 + D4) | 11.1 a 11.5 | — |
| **12** Documentação | ⏳ PENDENTE | 12.1 a 12.4 | — |
| **13** Validação final | ⏳ PENDENTE | 13.1 a 13.4 | — |

**Bugs TECH_DEBT resolvidos nesta sessão:** 6.4, 6.6, 6.7, 6.8, 6.11, 6.12, 6.14 (4 ocorrências), 6.15, 6.16. Descobertas: 6.22 (parcial), 6.23 (doc-only), 6.24.

**Decisões resolvidas:** D1=C (8.3), D2=ES (7.2), D5=A (7.4), D6=C (7.3).
**Decisões pendentes:** D3 (RLS strategy — recomendado C), D4 (hash senhas — recomendado B).

---

> **Estado base original (preservado pra histórico):** branch `main` no commit `04b6f4f` (sub-fase 4.1 — `payment_period_config` multi-empresa). Plano foi escrito quando esse era o último commit. Hoje (pós-Fase 8) estamos em `a4d6884`.

---

## 1. CONTEXTO

Este plano consolida toda a auditoria conduzida em 2026-05-11 (3 agentes Explore + leitura direta) e materializa o caminho até produção. Estado atual confirmado:

**Projeto e infra:**
- Supabase project `flcncdidxmmornkgkfbb` (sa-east-1, PG 17.6.1.063)
- React 18 + TS 5.5 + Vite 5 + Supabase 2.58 + Tailwind + jspdf/xlsx
- 50 migrations aplicadas (última `20260509150608_fix_payment_period_config_multi_empresa`)
- Edge function `clock-in-validated` v5 ACTIVE (hash `a841de37...`, 540 linhas, `verify_jwt: false`)
- 30 specs E2E Playwright + 8 specs vitest unit (~365 testes totais)
- `database.ts`: 4960 linhas, 177 exports, multi-empresa propagado

**Empresas em produção:**
- Caratinga (`6583bb2a-e334-41a7-b69c-7d98f3b46dfc`) — 30 employees, 3130 attendances, 1721 payments, 64 bonuses, 7 geo_fraud_attempts, 8 triage_errors
- Ponte Nova (`2b2abc4b-084c-4cf0-b5f1-02792513241d`) — estrutura vazia (zero dados operacionais)

**Bloqueadores ativos identificados:**
- **9 bugs do TECH_DEBT.md** (6.4, 6.6, 6.7, 6.8, 6.11, 6.12, 6.14, 6.15, 6.16)
- **1 descoberta nova:** `error_logs` sem `company_id`
- **9 testes E2E pulados** com `test.skip` condicional UI
- **4 specs E2E não escritas** (6.18-6.21 do TECH_DEBT — gaps multi-empresa)
- **5 utils sem unit test** (c6Export, mirrorGenerator, mirrorPdf, bonusHelpers, dateUtils)
- **9 componentes sem cobertura E2E direta**
- **RLS desabilitado em 18+ tabelas** (32+ ERROR advisors do Supabase) — bloqueador crítico de produção pública
- **Senhas em plain-text** em `users.password` (loginUser via `eq('password', plain)`)
- **Edge function sem auth** (`verify_jwt: false`) + 4 writes sem error handling

---

## 2. FILOSOFIA DE EXECUÇÃO

### Regras herdadas do CLAUDE.md do projeto

| Regra | Aplicação operacional |
|---|---|
| **1 sub-fase = 1 commit local atômico** | Mensagem: `tipo(escopo): descrição (sub-fase X.Y)`. Histórico legível pra rollback granular. |
| **Mudanças aditivas** | Jamais quebrar funcionalidade existente em prod. Deploys de edge function = nova versão, não overwrite imediato. |
| **Validação obrigatória antes do commit** | `npx tsc --noEmit && npm run lint && npm run test:unit && (npx playwright test <spec_alterada> se aplicável)`. Falha → mostro pra Victor, não tento "consertar". |
| **Commit local apenas** | NUNCA `git push`. Victor é o único push-er. |
| **Sem skills proibidas** | `subagent-driven-development`, `dispatching-parallel-agents`, `legacy-modernizer`, `spec-miner`, `architecture-designer` (sem pedido explícito). |
| **Dúvida → perguntar** | Especialmente em decisões semânticas (D1-D6 abaixo). |

### Diretiva específica desta sessão

> **Maximizar automação por aqui, minimizar tarefas manuais do Victor — incluindo testes, validação de fluxos.**

Tradução operacional:

| Antes considerei [MANUAL — Victor] | Agora vira |
|---|---|
| Deploy de edge function (Supabase MCP) | **[AUTO — Claude via MCP]** `mcp__claude_ai_Supabase__deploy_edge_function` |
| Aplicar migration | **[AUTO — Claude via MCP]** `mcp__claude_ai_Supabase__apply_migration` |
| Consultar advisors security/perf | **[AUTO — Claude via MCP]** `mcp__claude_ai_Supabase__get_advisors` |
| Listar tabelas, ver logs edge fn | **[AUTO — Claude via MCP]** `get_logs`, `list_tables`, `list_edge_functions` |
| Rodar Playwright/vitest | **[AUTO — Claude via Bash]** `npx playwright test`, `npx vitest run` |
| Validar visual rápido | **[AUTO]** Posso usar `playwright-skill` pra abrir browser e tirar screenshot dos fluxos |
| Cadastro de empresa nova | **[MANUAL — Victor]** (decisão de produto + dados reais) |
| Tag de release final + push | **[MANUAL — Victor]** (push é dele) |
| Decisões D1-D6 (produto/arquitetura) | **[MANUAL — Victor]** (quando bloquear sub-fase) |

### Critério OBJETIVO de "feito" por sub-fase

1. ✅ Diff cirúrgico (apenas linhas/arquivos no escopo)
2. ✅ `tsc --noEmit` = 0 erros
3. ✅ `eslint .` = 0 erros novos
4. ✅ Unit tests passam (`npm run test:unit`)
5. ✅ E2E spec relacionada passa (se aplicável)
6. ✅ Commit local criado com mensagem padrão
7. ✅ Entry no `TECH_DEBT.md` atualizado (movido pra "Resolvidas" se aplicável)
8. ✅ Aviso pro Victor: "Sub-fase X.Y feita. Posso seguir pra X.Z?"

---

## 3. WORKFLOW OPERACIONAL POR SUB-FASE

Cada sub-fase segue este loop fechado:

```
[ENTRADA]
  ↓
1. CHECK: Há decisão pendente bloqueante (D1-D6)? Se sim → AskUserQuestion ao Victor.
  ↓
2. LEITURA: leio arquivos do escopo, valido entendimento contra o plano.
  ↓
3. (se aplicável) PRE-CHECK no banco via Supabase MCP (e.g., contar duplicatas antes de UNIQUE).
  ↓
4. IMPLEMENTAÇÃO: Edit/Write nos arquivos.
  ↓
5. VALIDAÇÃO local:
   - tsc --noEmit
   - npm run lint (escopo afetado)
   - npm run test:unit (se aplicável)
   - npx playwright test <spec> (se aplicável)
  ↓
6. (se aplicável) DEPLOY via MCP (migration / edge function).
  ↓
7. VALIDAÇÃO pós-deploy via MCP (advisors, list_tables, logs).
  ↓
8. UPDATE TECH_DEBT.md (mover entrada pra "Resolvidas" com data e commit hash).
  ↓
9. COMMIT local atômico.
  ↓
10. MENSAGEM ao Victor:
    "✅ Sub-fase X.Y concluída.
     - Arquivos: [...]
     - Validações: tsc OK, lint OK, X testes passaram
     - Commit: <hash>
     - Próxima: X.Z (estimativa Yh)
     Posso seguir?"
  ↓
[SAÍDA] aguarda OK do Victor antes da próxima.
```

---

## 4. DECISÕES — D1 a D6

> Status atualizado em 2026-05-11 após Fase 8.

| # | Decisão | Status | Resolução | Sub-fase | Commit |
|---|---|---|---|---|---|
| **D1** | Mapeamento `nighttime_minutes → nightCreditMinutes` | ✅ RESOLVIDA | **C — Diurno primeiro** confirmado pelo Victor | 8.3 | `e70da28` |
| **D2** | `admin_cleanup_config` — operacional ou estrutural | ✅ RESOLVIDA | **ES — Estrutural** (UNIQUE + lazy-create via upsert) | 7.2 + 7.2.1 | `19a72f3`, `0840f9c` |
| **D3** | RLS strategy | ⚠️ **PENDENTE** | A (status quo) / B (Supabase Auth + JWT claim) / **C (SECURITY DEFINER + sessão custom)** recomendado | 11.2 | — |
| **D4** | Hash de senhas | ⚠️ **PENDENTE** | A (bcryptjs cliente) / **B (edge fn `auth-login`)** recomendado / C (ambos) | 11.3 | — |
| **D5** | `error_logs` adicionar `company_id` | ✅ RESOLVIDA | **A — Sim, adicionar** (FK NULLABLE + index) | 7.4 | `b2a1bbb` |
| **D6** | `bonus_defaults` legacy | ✅ RESOLVIDA | **C — Drop após validar callers** (dump JSON salvo pra audit) | 7.3 | `73d7649` |

### ⚠️ Decisões pendentes que bloqueiam Fase 11

**D3 — RLS strategy** (3 opções):
- **A** — Continuar sem RLS, validações app-level. Não traz benefício real (anon_key continua acessível).
- **B** — Migrar pra Supabase Auth nativo, JWT custom claim `company_id`. Refactor pesado mas canônico.
- **C** (recomendado pelo plano) — Função `current_company_id()` SECURITY DEFINER que lê variável de sessão setada por edge fn `set_company_context`. Mais leve que B, mantém schema atual `users`.

**D4 — Hash de senhas** (3 opções):
- **A** — bcryptjs no cliente. Lento, expõe lógica.
- **B** (recomendado) — Edge function `auth-login` com bcrypt no Deno, retorna JWT custom. Cliente nunca vê hash.
- **C** — Ambos. Excessivo.

**Quando atacar:** D3 + D4 confirmados antes de iniciar Fase 11. Refactor de auth é pesado e exige backup obrigatório de prod.

### 📚 Racional detalhado das decisões resolvidas

Ver `CHECKPOINT.md` → seção "📐 RACIONAL DAS DECISÕES (D1–D6)" pra justificativa técnica completa + caveats (incluindo decisão pragmática de `nightDebitMinutes=0` em D1).

---

## 5. ÍNDICE DE FASES E SUB-FASES

| Fase | Tema | Sub-fases | Tempo automático Claude | Tempo manual Victor |
|---|---|---|---|---|
| **5** | Quick wins | 5.1, 5.2, 5.3, 5.4, 5.5 (audit), 5.6 (mesclada em 7.2) | ~3h | 0 |
| **6** | Cobertura unit tests faltantes | 6.1 a 6.5 | ~24h | 0 |
| **7** | Migrations small + cleanups | 7.2, 7.3, 7.4 | ~6h | 0 |
| **8** | Fixes médios | 8.1, 8.3, 8.4, 8.5 | ~16h | confirmar D1 |
| **9** | E2E gaps fixáveis | 9.1, 9.2, 9.3, 9.4 | ~10h | 0 |
| **10** | E2E componentes sem cobertura | 10.1 a 10.8 | ~36h | 0 |
| **11** | Hardening produção pública | 11.1, 11.2, 11.3, 11.4, 11.5 | ~30h | confirmar D3, D4 |
| **12** | Documentação | 12.1, 12.2, 12.3, 12.4 | ~6h | 0 |
| **13** | Validação final + go-live | 13.1, 13.2, 13.3 (importação dados), 13.4 (push) | ~3h | 13.3 + 13.4 |
| **TOTAL** | ~45 sub-fases | **~134h Claude** | ~2h Victor (decisões + push) |

> Tempos otimistas pra execução; assumir 1.3-1.5x se houver retrabalho.

---

## FASE 5 — Quick wins ✅ CONCLUÍDA

> **Commits:** `96f037d` (5.1) → `b14f739` (5.2) → `0ba0e9d` (5.3) → `7e34daa` (5.4) → `523e296` (5.5) → `3fe9740` (5.6).
> **Detalhes em:** TECH_DEBT.md (seção Resolvidas) + commit messages.

---

> Sub-fases triviais, alta confiança, sem dependências.

### 5.1 — Fix data futura em `tests/10-errors.spec.ts:107`

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.4 (Baixa) |
| **Arquivo** | `/home/victor/SISTEMA-DE-PONTO/tests/10-errors.spec.ts:105-107` |
| **Diff exato** | `const d = new Date(today.getFullYear(), today.getMonth(), 28);` → `const d = new Date(today.getFullYear(), today.getMonth() - 1, 15);` Comentário atualizado: "Data passada (dia 15 do mês anterior) — garante que não é futura nem colide". |
| **Validação** | `npx playwright test tests/10-errors.spec.ts --workers=1` rodado 3x. Esperado: todos os 5 testes passam em todas as 3 runs. |
| **Tempo** | 15 min |
| **Commit** | `fix(tests): corrigir bug de data futura em 10-errors:107 (sub-fase 5.1)` |
| **TECH_DEBT** | 6.4 movido pra "Resolvidas" com data 2026-05-XX. |
| **Dependências** | Nenhuma. |

---

### 5.2 — Substituir `eslint-disable` por `useCallback` em 3 useEffect

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.14 (Baixa) |
| **Arquivos** | `src/components/datamanagement/DataManagementTab.tsx:64-67` + `src/components/admin/AdminTab.tsx:226-248` |
| **Padrão idiomático a reusar** | `src/components/errors/TriageTab.tsx:51-72`, `src/components/errors/PaymentPeriodsTab.tsx:35`, `src/components/errors/ErrorsTab.tsx:71` (todos usam `React.useCallback(async () => {...}, [company?.id])` + colocam no deps array) |
| **Diff conceitual** | **1)** `DataManagementTab.tsx`: extrair `loadData` em `useCallback([company?.id])`, colocar no `useEffect` deps. **2)** `AdminTab.tsx:241-247`: dois useEffect distintos — wrappear `loadCleanupConfig`, `loadFaceConfig`, `loadFaceAttempts`, `loadData` em useCallback com deps corretas (`[company?.id]` ou `[company?.id, faceDate*, faceEmployeeFilter, faceResultFilter]`). **3)** Remover as 3 linhas `// eslint-disable-next-line react-hooks/exhaustive-deps`. |
| **Validação** | `npx tsc --noEmit` (0 erros); `npm run lint -- src/components/datamanagement src/components/admin` (0 warnings nas linhas alteradas); `npx playwright test tests/12-admin-tab.spec.ts tests/24-admin-complete.spec.ts --workers=1` (passar). |
| **Tempo** | 45 min |
| **Commit** | `refactor(hooks): useCallback substituindo eslint-disable em 3 useEffect (sub-fase 5.2)` |
| **TECH_DEBT** | 6.14 → resolvidas. |
| **Dependências** | Nenhuma. |

---

### 5.3 — `geolocation_config` UNIQUE(company_id)

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.11 (Baixa) |
| **Pre-check** | [AUTO — MCP] `execute_sql`: `SELECT company_id, count(*) FROM geolocation_config GROUP BY company_id HAVING count(*) > 1;` (esperado: 0 rows). |
| **Migration nova** | `supabase/migrations/<timestamp>_unique_geolocation_per_company.sql` <br>Conteúdo: `ALTER TABLE public.geolocation_config ADD CONSTRAINT geolocation_config_company_id_key UNIQUE (company_id); COMMENT ON CONSTRAINT geolocation_config_company_id_key ON public.geolocation_config IS 'Garante 1 row por empresa — multi-empresa singleton-de-fato (TECH_DEBT 6.11).';` |
| **Deploy** | [AUTO — MCP] `apply_migration` com name `unique_geolocation_per_company`. |
| **Validação pós-deploy** | [AUTO — MCP] `list_tables` (filtrar por geolocation_config) — confirmar constraint criada. Verificar `get_advisors security` — security advisors antes/depois. |
| **Tempo** | 20 min |
| **Commit** | `feat(db): UNIQUE(company_id) em geolocation_config (sub-fase 5.3)` |
| **TECH_DEBT** | 6.11 → resolvidas. |
| **Dependências** | Nenhuma. |

---

### 5.4 — C6PaymentTab: limpar estados ao trocar empresa

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.15 (Baixa) |
| **Arquivo** | `src/components/c6payment/C6PaymentTab.tsx` (adicionar 2º useEffect logo após o existente em L57-59) |
| **Diff conceitual** | Adicionar abaixo do useEffect existente: <br>`useEffect(() => { setPaymentRows([]); setDataImported(false); setSelectedRows(new Set()); setInlineEdit(null); setEditingRowId(null); setEditValues(null); }, [company?.id]);` |
| **Validação** | `npx tsc --noEmit`; `npx playwright test tests/20-c6-complete.spec.ts --workers=1` (passar); **validação visual via playwright-skill:** [AUTO — Claude] importar dados em Caratinga, trocar pra PN via switcher, verificar tabela vazia. |
| **Tempo** | 30 min |
| **Commit** | `fix(c6payment): limpar estados ao trocar empresa (sub-fase 5.4)` |
| **TECH_DEBT** | 6.15 → resolvidas. |
| **Dependências** | Nenhuma. |

---

### 5.5 — [AUDIT] Padrão cross-empresa em demais tabs (Wave 3)

| Campo | Valor |
|---|---|
| **Tipo** | Auditoria — sem código novo. Resultado: lista de componentes com padrão similar. |
| **Escopo** | Ler useEffect com `[company?.id]` em: `EmployeesTab`, `AttendanceTab`, `FinancialTab`, `ReportsTab`, `ErrorsTab`, `TriageTab`, `PaymentPeriodsTab`, `SettingsTab`, `UsersTab`, `AdminTab`, `DataManagementTab`. |
| **Critério** | Pra cada tab: lista estados locais que NÃO são reset no useEffect e que poderiam vazar entre empresas. |
| **Diff** | Atualização do `TECH_DEBT.md` com nova entrada de baixa prioridade (lista resultante). Não cria sub-fases automaticamente — Victor prioriza depois. |
| **Validação** | `git diff TECH_DEBT.md` revisado. |
| **Tempo** | 1h |
| **Commit** | `docs(tech-debt): audit padrão cross-empresa em tabs Wave 3 (sub-fase 5.5)` |
| **Dependências** | 5.4 concluída. |

---

### 5.6 — (Mesclada em 7.2) `admin_cleanup_config`

Decisão D2 = ES (estrutural). Esta sub-fase **não é executada** — fix vai integrado em 7.2.

---

## FASE 6 — Cobertura unit tests faltantes ✅ CONCLUÍDA

> **Commits:** `6f44c14` (6.1 dateUtils) → `7e486d2` (6.2 bonusHelpers) → `9748564` (6.3 c6Export) → `a9b3098` (6.4 mirrorGenerator) → `d8a238a` (6.5 mirrorPdf mocked) → `ff51819` (6.6 reforço REAL — c6Export sem mock paralelo + mirrorPdf.real.spec.ts validando bytes binários reais).
> **Total:** +207 unit tests adicionados (207→414 passing em 16 files).

---

> **Estratégia comum:** templates baseados em `tests/unit/bankHoursCalculator.spec.ts` (puro, sem mock) e `tests/unit/applyBankHoursToPayment.spec.ts` (com mock Supabase via `vi.hoisted`). Convenção de naming: `describe('functionName')` + `it('N. caso: input → output')` (numeração sequencial).

### 6.1 — Unit tests `dateUtils.ts`

| Campo | Valor |
|---|---|
| **Arquivo novo** | `tests/unit/dateUtils.spec.ts` |
| **Fonte** | `src/utils/dateUtils.ts` (50 linhas, 6 funções) |
| **Risco em prod** | Médio-baixo. Funções puras, usado em timestamps de export/UI. |
| **Cenários (15 testes mínimo):** | <br>**`getBrazilDate()`** — 3 testes: (1) retorna string `YYYY-MM-DD` (10 chars); (2) usa offset -3h (mock `Date.now()` = `2026-05-11T02:00:00Z` → retorna `2026-05-10`); (3) meio-dia UTC → mesmo dia BRT. <br>**`getBrazilDateTime()`** — 2 testes: (1) retorna `Date`; (2) `.getTime()` consistente com offset. <br>**`formatDateBR()`** — 3 testes: (1) `'2026-05-11'` → `'11/05/2026'`; (2) `'2026-01-01'` → `'01/01/2026'`; (3) input inválido (`'invalid'`) → retorna original ou throw (validar comportamento atual). <br>**`formatDateTimeBR()`** — 3 testes: (1) `'2026-05-11T15:30:00Z'` → `'11/05/2026 12:30'`; (2) virada de dia (UTC 23h → BRT 20h mesmo dia); (3) string sem horário → fallback. <br>**`getCurrentBrazilTime()`** — 2 testes: formato `HH:MM` (5 chars), mock `Date.now()`. <br>**`formatTimestampForExcel()`** — 2 testes: formato `DD/MM/YYYY HH:MM:SS` (19 chars), edge case inválido. |
| **Mock** | `vi.useFakeTimers()` + `vi.setSystemTime(new Date('2026-05-11T12:00:00Z'))` para determinismo. |
| **Validação** | `npx vitest run dateUtils` — 15+ testes passam; `npm run test:unit:coverage` cobertura ≥95% em dateUtils.ts. |
| **Tempo** | 2h |
| **Commit** | `test(unit): cobertura completa de dateUtils (sub-fase 6.1)` |

---

### 6.2 — Unit tests `bonusHelpers.ts`

| Campo | Valor |
|---|---|
| **Arquivo novo** | `tests/unit/bonusHelpers.spec.ts` |
| **Fonte** | `src/utils/bonusHelpers.ts` (28 linhas, 1 função: `getBonusValueForType(payment, bonusType)`) |
| **Risco** | Médio. Usado em FinancialTab/ReportsTab — bug aqui = pagamento errado. |
| **Cenários (10 testes mínimo):** | <br>1. `bonus_breakdown[bonusType.id] = 50` → retorna `50` <br>2. Sem breakdown, code='B', `bonus_b=10` → `10` (fallback) <br>3. Sem breakdown, code='C1', `bonus_c1=20` → `20` <br>4. Sem breakdown, code='C2', `bonus_c2=30` → `30` <br>5. Sem breakdown, code não-canônico ('X') → `0` <br>6. `bonus_breakdown = null` → fallback legacy <br>7. `bonus_breakdown = {}` → fallback legacy <br>8. Valor não-numérico ('abc') no breakdown → `0` via `Number()` <br>9. Valor zero no breakdown (`{[id]: 0}`) → `0` (não cai pra fallback) <br>10. `bonus_b = null` → `0` |
| **Validação** | `npx vitest run bonusHelpers` — 10+ passam; cobertura 100% (função única). |
| **Tempo** | 1.5h |
| **Commit** | `test(unit): cobertura completa de bonusHelpers (sub-fase 6.2)` |

---

### 6.3 — Unit tests `c6Export.ts`

| Campo | Valor |
|---|---|
| **Arquivo novo** | `tests/unit/c6Export.spec.ts` |
| **Fonte** | `src/utils/c6Export.ts` (530 linhas, gera planilha C6 Bank com 3 sheets) |
| **Risco em prod** | **ALTO.** Bug aqui = banco recusa lote → atrasa folha. Validador de PIX crítico. |
| **Estratégia** | Mockar `xlsx-js-style` parcialmente: `XLSX.utils.book_new()`, `aoa_to_sheet`, `book_append_sheet` retornam objetos rastreáveis. `XLSX.write` retorna `ArrayBuffer` fake. Foco: validar PAYLOAD de dados, não bytes do XLSX. <br>**[OPCIONAL — Victor decide]** Expor `validatePixKey` como named export (atualmente private) — simplifica grupo A. Sugestão: exportar com prefixo `_` (convenção test-only). |
| **Cenários (55 testes mínimo, dividido em 6 `describe`):** | |
| **A. `_validatePixKey`** — 12 testes | CPF 11 dígitos válido; CPF 10 inválido; CPF com pontos limpos → válido; CNPJ 14 válido; CNPJ 13 inválido; email válido; email sem `@` inválido; telefone 11 válido; telefone 10 válido; UUID v4 válido; chave vazia inválida; só whitespace inválido. |
| **B. `exportC6PaymentSheet` — workbook estrutura** | 8 testes: gera 3 sheets (Pagamentos, Resumo, Instruções); ordem das colunas; linhas = rows.length + headers; amount 2 casas decimais; paymentDate `DD/MM/YYYY`; PIX limpo; descrição truncada se >N chars; style header (bold + bg). |
| **C. Sheet "Resumo"** | 6 testes: count, sum, periodo start/end formatados, generatedBy, generatedAt, breakdown por funcionário. |
| **D. Sheet "Instruções"** (ou Validação — verificar nome real do código) | 8 testes: sheet vazia se todos válidos; lista PIX inválidos quando há; coluna Erro com motivo; PIX vazio marcado; mesma chave em 2 funcionários ambos listados; ordem preservada; CPF cleaned; warnings em vermelho. |
| **E. Edge cases** | 8 testes: rows vazias → workbook só headers; rows=1 → 1 linha dado; amount=0 aceito; amount negativo → comportamento (throw?); paymentDate inválido → fallback; nome vazio → throw; acentos preservados; 1000 rows perf smoke. |
| **F. Styling** | 13 testes: bordas em todas células; fonte header; cor header; alinhamentos; freeze pane; col widths; row heights; merged cells; zebra striping; autofilter; cells protected. |
| **Validação** | `npx vitest run c6Export` — 55+ passam; cobertura ≥80%. |
| **Tempo** | 8-10h (maior unit test do plano) |
| **Commit** | `test(unit): cobertura completa de c6Export (sub-fase 6.3)` |

---

### 6.4 — Unit tests `mirrorGenerator.ts`

| Campo | Valor |
|---|---|
| **Arquivo novo** | `tests/unit/mirrorGenerator.spec.ts` |
| **Fonte** | `src/utils/mirrorGenerator.ts` (358 linhas) — gera estrutura do espelho CLT |
| **Risco** | **ALTO.** Documento legal CLT — erro pode invalidar perícia. |
| **Cenários (65 testes mínimo):** | |
| **A. Formatadores** | 15 testes: `formatCnpj` 14 dígitos válido; CNPJ vazio → ''; `formatCpf` 11 válido; CPF curto → ''; `minutesToHHMM(0)` → ''; `minutesToHHMM(60)` → '01:00'; `minutesToHHMM(125)` → '02:05'; `minutesToHHMM(null)` → ''; `minutesToHHMMAlways(0)` → '00:00'; `-60` → '-01:00'; `Infinity` → ''; `NaN` → ''; `27` → '00:27'. |
| **B. `getExpectedMinutesForDate(date, schedule)`** | 8 testes: domingo (idx 0); segunda (idx 1); fallback schedule null → 0; data inválida → 0; data limítrofe meia-noite BRT; data com TZ offset; bissexto; ano novo. |
| **C. `buildMirrorDayRow`** | 20 testes: dia normal (entry+exit) gera ent1/sai1 BRT corretos; 4 marcações geram todos os 4 timestamps; flag 'included' propaga a todas 4 colunas; flag 'requested' idem; domingo: tudo vazio exceto label; dia sem attendance: expected do schedule, demais vazios; absent_compensated → marca todas "Aus. Comp."; nighttime > 0 → daytime + nighttime separados; bank_credit preservado; bank_debit preservado; ent/sai invertidos; entry sem exit (em curso); 2026 sem DST; bissexto; primeiro dia mês; último dia mês; flag 'pre_assigned'; flag null não marca; emission date fallback; range vazio. |
| **D. `MirrorTotals` agregação** | 12 testes: soma all campos; bankNet positivo; bankNet negativo; vazio → zeros; 1 dia → totais = aquele dia; domingo soma só expected; absent_compensated não soma daytime; flag 'included' soma normal; flag 'requested' soma normal; rounding consistente; precisão decimal; total vs sum check. |
| **E. `buildMirrorData`** | 10 testes: integra company+employee+attendances+period; nome empresa do `legal_name`; CNPJ do company; CPF+PIS do employee; range start..end inclusivo; linha pra cada dia mesmo sem attendance; sem `expected_schedule` → FALLBACK; missing logo_url → null preservado; ordenação cronológica; gaps de dia preenchidos. |
| **Validação** | `npx vitest run mirrorGenerator` — 65+ passam; cobertura ≥90%. |
| **Tempo** | 6-8h |
| **Commit** | `test(unit): cobertura completa de mirrorGenerator (sub-fase 6.4)` |

---

### 6.5 — Unit tests `mirrorPdf.ts`

| Campo | Valor |
|---|---|
| **Arquivo novo** | `tests/unit/mirrorPdf.spec.ts` |
| **Fonte** | `src/utils/mirrorPdf.ts` (490 linhas) — gera PDF do espelho |
| **Risco** | **ALTO.** PDF é artefato entregue à fiscalização. |
| **Estratégia mock** | Mockar `jspdf` e `jspdf-autotable` via `vi.mock`. `jsPDF` retorna spy rastreando `text()`, `rect()`, `addImage()`, `addPage()`, `save()`, `output('blob')`. `autoTable` mockado retorna `finalY` previsível. Sem render real — testamos chamadas API. |
| **Cenários (45 testes mínimo):** | |
| **A. `generateMirrorPdf(data)`** | 12 testes: retorna `Blob`; output 'blob'; orientação landscape; tamanho A4; chamadas `text()` consistentes; logo aplicado quando logo_url; logo skip quando null; header em y=19-60; sub-header y=60-90; chamadas em ordem; throw data inválido; throw period > 31 dias. |
| **B. `downloadMirrorPdf(data, filename)`** | 6 testes: chama `save()` com filename; default filename quando undefined; sanitiza filename; sufixo `.pdf`; createObjectURL chamado; link click triggered. |
| **C. `generateMirrorsBatchPdf(dataList)`** | 10 testes: 1 espelho = 1 página; 3 espelhos = 3 páginas com `addPage()`; lista vazia → throw; preserva ordem; cada espelho usa seus dados; totais por espelho; header reset; pagination footer. |
| **D. Layout** | 17 testes: tabela 12 colunas; widths somam 803; header bold+bg; rows alternadas; totais bottom; legenda final; footer com data; assinatura employee+supervisor; cor preto; fonte default helvetica; sizes 8/9/12pt; padding cells; flags coloridas; domingo sombreado; pagination correta; footnotes; subtitle. |
| **Validação** | `npx vitest run mirrorPdf` — 45+ passam; cobertura ≥75%. |
| **Tempo** | 5-7h |
| **Commit** | `test(unit): cobertura completa de mirrorPdf (sub-fase 6.5)` |
| **Dependências** | 6.4 (compartilha fixtures `MirrorData`). |

---

## FASE 7 — Migrations small + cleanups ✅ CONCLUÍDA

> **Commits:** `19a72f3` (7.2 admin_cleanup UNIQUE) → `0840f9c` (7.2.1 fix latente: id PK default UUID, descoberto via validação real) → `73d7649` (7.3 DROP TABLE bonus_defaults + robustez spec 26) → `b2a1bbb` (7.4 error_logs ADD company_id).
> **3 migrations aplicadas em prod via MCP, versionadas localmente.**

---

### 7.2 — `admin_cleanup_config` UNIQUE + lazy-create

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.16 (Baixa). Decisão D2 = ES. |
| **Pre-check** | [AUTO — MCP] `execute_sql`: `SELECT company_id, count(*) FROM admin_cleanup_config GROUP BY company_id HAVING count(*) > 1;` (esperado 0). |
| **Migration** | `supabase/migrations/<timestamp>_admin_cleanup_unique_per_company.sql`: `ALTER TABLE admin_cleanup_config ADD CONSTRAINT admin_cleanup_config_company_id_key UNIQUE (company_id);` |
| **Arquivo código** | `src/services/database.ts` — `runAutoCleanup(companyId)` (~L4096-4117): substituir `update` direto por `upsert` com `onConflict: 'company_id'`. `getAutoCleanupConfig(companyId)` filtra por company_id e cria lazy se ausente. |
| **Deploy** | [AUTO — MCP] `apply_migration`. |
| **Validação pós-deploy** | [AUTO — MCP] `list_tables` confirma constraint. `npx tsc --noEmit`. `npx playwright test tests/24-admin-complete.spec.ts`. [AUTO — playwright-skill] simular run de autocleanup em PN via console → row criada. |
| **Tempo** | 2h |
| **Commit** | `feat(db+admin): UNIQUE + lazy-create em admin_cleanup_config (sub-fase 7.2)` |
| **TECH_DEBT** | 6.16 → resolvidas. |

---

### 7.3 — Cleanup `bonus_defaults` legacy (D6 = C)

| Campo | Valor |
|---|---|
| **Pre-check obrigatório** | [AUTO — MCP] (a) `SELECT count(*) FROM bonus_defaults;` (b) `grep -rn "bonus_defaults" src/` — confirmar só 2 callers em `database.ts` (linhas 1532 e 1575); (c) Caratinga + PN têm rows válidas em `bonus_types`. <br>**Dump pré-drop**: salvar `SELECT * FROM bonus_defaults;` em `docs/bonus_defaults_legacy_dump-<data>.json` pra audit trail. |
| **Arquivos código** | `src/services/database.ts`: <br>(a) Remover linhas 1530-1544 (bloco fallback `bonus_defaults` em `getBonusDefaults`) <br>(b) Remover linhas 1573-1584 (UPDATE legacy em `updateBonusDefault`) <br>(c) Atualizar 3 comentários "legacy" pra refletir cleanup. |
| **Migration** | `supabase/migrations/<timestamp>_drop_bonus_defaults_legacy.sql`: `DROP TABLE bonus_defaults;` |
| **Teste smoke** | Remover `tests/17-bonus-complete.spec.ts:67-72` (smoke test obsoleto). |
| **Validação** | `npx tsc --noEmit`; `npm run test:unit`; `npx playwright test tests/04-bonus.spec.ts tests/17-bonus-complete.spec.ts tests/25-multi-company-isolation.spec.ts`. |
| **Tempo** | 1h |
| **Commit** | `refactor(db): remover bonus_defaults legacy + drop tabela (sub-fase 7.3)` |

---

### 7.4 — `error_logs` ADD `company_id` (D5 = A)

| Campo | Valor |
|---|---|
| **Migration** | `supabase/migrations/<timestamp>_error_logs_add_company_id.sql`: <br>`ALTER TABLE error_logs ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE SET NULL;` <br>`CREATE INDEX idx_error_logs_company_id ON error_logs(company_id);` (nullable — erros pré-login não têm contexto). |
| **Arquivos código** | `src/services/errorTracking.ts` (linhas ~116-148): `captureError({...data, companyId?})` — adicionar param optional, persistir. Atualizar 4 callers internos. |
| **Validação** | `npx tsc --noEmit`; teste manual via [AUTO — playwright-skill] disparar erro JS no browser em ambas empresas; verificar row em `error_logs` com `company_id` correto. |
| **Tempo** | 2h |
| **Commit** | `feat(db+app): adicionar company_id em error_logs (sub-fase 7.4)` |
| **TECH_DEBT** | Nova entrada "6.22 — error_logs sem company_id" criada+resolvida na mesma sub-fase. |

---

## FASE 8 — Fixes médios ✅ CONCLUÍDA

> **Commits:** `60d80a5` (8.4 edge fn v6 — error handling 4 writes silenciosos) → `05ac7ce` (8.1 batch SQL em previewBankHoursForPeriod, 150→6 queries) → `e70da28` (8.3 nightCreditMinutes real D1=C) → `a4d6884` (8.5 RPC transacional apply_bank_hours_to_payment).
> **Edge fn v6 ACTIVE em prod** (hash `ff0b9dd72005...`).
> **RPC ACTIVE** com SECURITY DEFINER + GRANT pra anon/authenticated/service_role.
> **TODOS bugs ativos do TECH_DEBT resolvidos.** Bugs restantes são apenas Severidade Baixa do 6.22 (3 tabs com cleanup cross-empresa pendente) e 6.23 (validatePixKey doc-only).

---

### 8.1 — N+1 batch em `previewBankHoursForPeriod`

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.7 (Baixa-Média) |
| **Arquivos** | `src/services/database.ts:4862-4886` + novo helper `_fetchPreviewInputsBatch` |
| **Estratégia** | Refatorar `_previewBankHoursForEmployee` em 2: <br>(a) `_fetchPreviewInputsBatch(employees, paymentPeriodId, companyId)` → 1 query `payment_periods` + 1 query batched `payments WHERE employee_id IN (...)` + 1 query batched `attendance WHERE employee_id IN (...)` + 1 query `companies`. <br>(b) `_calcPreviewForEmployee(emp, batchedData)` puro a partir dos dados pré-fetched. <br>Reduz de 5×N pra 4 queries totais. |
| **Validação** | Spec 27 (`27-bank-hours-payment.spec.ts`) e `tests/unit/applyBankHoursToPayment.spec.ts` passam sem regressão. **Novo teste perf**: `previewBankHoursForPeriod` com 30 fixture employees < 2s (vs ~30s atual). |
| **Tempo** | 4h |
| **Commit** | `perf(database): batch SQL em previewBankHoursForPeriod (sub-fase 8.1)` |
| **TECH_DEBT** | 6.7 → resolvidas. |

---

### 8.3 — `nightCreditMinutes` real (D1 = C, confirmar antes)

| Campo | Valor |
|---|---|
| **⚠️ Bloqueio** | **Confirmar D1 com Victor ANTES de iniciar.** Opções A (proporcional), B (noturno primeiro), C (diurno primeiro — recomendado). |
| **Bug-alvo** | TECH_DEBT 6.6 (Média) |
| **Arquivos** | `src/services/database.ts`: <br>(a) L4682: SELECT incluir `nighttime_minutes, daytime_minutes` <br>(b) L4686-4693: somar `nighttime` e `daytime` por dia <br>(c) L4711-4712: passar valores reais ao invés de 0. |
| **Diff conceitual (D1 = C "diurno primeiro")** | Por dia: `nightCredit = max(0, dailyBankCredit - dailyDaytime)`. Por período: somar nightCredit dos dias. Idem para débito. Implicação: saldo positivo é "preenchido" pelas horas diurnas primeiro; sobra vira noturno (favorece funcionário, simples auditar). |
| **Validação** | 4 cenários unit novos em `applyBankHoursToPayment.spec.ts`: <br>(1) jornada 100% diurna → night=0 <br>(2) jornada 100% noturna → night=tudo (credit) <br>(3) jornada mista 60/40 com saldo positivo → diurno preenche primeiro <br>(4) `bank_hours_night_separate=false` → ignora night. <br>Spec E2E 29 (`29-bank-hours-integrity.spec.ts`) sem regressão. |
| **Tempo** | 4h |
| **Commit** | `fix(bank-hours): calcular nightCredit/nightDebit reais (sub-fase 8.3)` |
| **TECH_DEBT** | 6.6 → resolvidas. |

---

### 8.4 — Edge fn v6 — error handling 4 writes

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.12 (Baixa) |
| **Arquivo** | `supabase/functions/clock-in-validated/index.ts` linhas 227, 241, 278, 292 |
| **Diff conceitual** | Cada `await supabase.from(...).insert/upsert(...)` substituído por: <br>`const { error: gfErr } = await supabase.from(...).insert/upsert(...);`<br>`if (gfErr) { console.error('[clock-in-validated v6] write failed:', { table, error: gfErr, context }); await supabase.from('error_logs').insert([{ module: 'edge:clock-in-validated', component: 'geo_fraud_attempts insert', message: gfErr.message, company_id: effectiveCompanyId, error_context: { employee_id, today, clock_type } }]).catch(() => {}); }` <br>Lógica de fluxo NÃO muda — fail-soft (geo_fraud é registro auxiliar). |
| **Deploy** | [AUTO — MCP] `deploy_edge_function` name=`clock-in-validated` bump v6. |
| **Validação pós-deploy** | [AUTO — MCP] `list_edge_functions` confirma v6 ACTIVE. [AUTO — playwright-skill]: simular clock-in fora de raio → verificar `geo_fraud_attempts` populada normalmente; se simular falha (RLS reject mock), confirmar `error_logs` ganha row. Spec 02/08 (employee-clock, geolocation) sem regressão. |
| **Tempo** | 3h |
| **Commit** | `fix(edge-fn): error handling em 4 writes silenciosos v6 (sub-fase 8.4)` |
| **TECH_DEBT** | 6.12 → resolvidas. |
| **Dependências** | 7.4 concluída (error_logs com company_id). |

---

### 8.5 — RPC transacional `apply_bank_hours_to_payment`

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.8 (Média) |
| **Migration** | `supabase/migrations/<timestamp>_rpc_apply_bank_hours.sql`: <br>`CREATE OR REPLACE FUNCTION apply_bank_hours_to_payment(...) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN UPDATE payments SET bank_hours_amount=..., bank_hours_minutes=..., bank_hours_applied_at=now(), total=p_total_after, updated_at=now() WHERE id=p_payment_id; INSERT INTO bank_hours_application_log (...) VALUES (...) RETURNING id INTO v_log_id; IF p_zero_balance THEN UPDATE attendance SET bank_credit_minutes=0, bank_debit_minutes=0 WHERE employee_id=p_employee_id AND date BETWEEN p_range_start AND p_range_end; END IF; RETURN v_log_id; END; $$;` <br>`GRANT EXECUTE ON FUNCTION apply_bank_hours_to_payment(...) TO anon, authenticated;` |
| **Arquivo código** | `src/services/database.ts:4738-4856` (`applyBankHoursToPayment`): substituir blocos UPDATE+INSERT+UPDATE (linhas 4784-4838) por 1 chamada `supabase.rpc('apply_bank_hours_to_payment', {...})`. Idempotência via check `bank_hours_applied_at` mantida antes da RPC. |
| **Deploy** | [AUTO — MCP] `apply_migration`. |
| **Validação** | `tests/unit/applyBankHoursToPayment.spec.ts` adaptado pra mockar `rpc()`. Spec E2E 27 (`27-bank-hours-payment.spec.ts`) sem regressão. <br>**Teste rollback novo**: mockar falha no INSERT log; confirmar via DB pós-test que payment NÃO foi atualizado (atomic). |
| **Tempo** | 5h |
| **Commit** | `refactor(bank-hours): RPC transacional para apply (sub-fase 8.5)` |
| **TECH_DEBT** | 6.8 → resolvidas. |
| **Dependências** | 8.3 concluída. |

---

## FASE 9 — E2E gaps fixáveis ⏳ PENDENTE — próxima fase recomendada

> Sem bloqueio de decisões. ~10h estimadas. Foco: remover 7 skips condicionais + escrever 4 specs novas. Cobertura E2E sobe sem mexer em código de produção.

---

### 9.1 — `data-testid` em 7 skips condicionais

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.3/6.9 (Baixa) — 7 dos 9 skips |
| **Componentes alterados** | <br>• `AttendanceTab.tsx` — bulk-approve button: `data-testid="bulk-approve-button"` <br>• `FinancialTab.tsx` — search input: `data-testid="financial-search-input"` <br>• `FinancialTab.tsx` — history tab btn: `data-testid="financial-history-btn"` <br>• `PaymentPeriodsTab.tsx` — auto-weekly switch: `data-testid="auto-weekly-toggle"` <br>• `C6PaymentTab.tsx` — edit button por row: `data-testid={\`c6-edit-row-${id}\`}` <br>• `AdminTab.tsx` — facial toggle: `data-testid="facial-global-toggle"` <br>• `AdminTab.tsx` — facial list rows: `data-testid={\`facial-list-row-${empId}\`}` |
| **Testes alterados** | `tests/15-attendance-complete.spec.ts:184` (substituir locator + remover skip); `tests/16-financial-complete.spec.ts:133,197` (idem); `tests/19-payment-periods-complete.spec.ts:103`; `tests/20-c6-complete.spec.ts:151`; `tests/24-admin-complete.spec.ts:72,102`. |
| **Validação** | `npx playwright test tests/15 tests/16 tests/19 tests/20 tests/24 --workers=1` — skipped count diminui de 9 pra 2. Full suite rodada 3x sem flake novo. |
| **Tempo** | 4h |
| **Commit** | `test(e2e): data-testid pra remover 7 skips condicionais (sub-fase 9.1)` |
| **TECH_DEBT** | 6.3/6.9 atualizadas (resta 2 skips, justificados). |

---

### 9.2 — Corrigir seletor errado em `16-financial-complete:149`

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.3 (1 dos 9) |
| **Componente** | `src/components/common/EmploymentTypeFilter.tsx` — `data-testid="employment-type-filter"` no `<select>`. |
| **Teste** | `tests/16-financial-complete.spec.ts:147-149` — substituir `page.locator('select').filter({ hasText: /Diarista|Carteira/i }).first()` por `page.getByTestId('employment-type-filter')`. |
| **Validação** | `npx playwright test tests/16-financial-complete.spec.ts --workers=1` — teste em L149 passa em 3 runs. |
| **Tempo** | 1h |
| **Commit** | `test(e2e): corrigir locator do filtro employment_type (sub-fase 9.2)` |
| **Dependências** | 9.1 concluída. |

---

### 9.3 — Split `07-financial:43` em "com" + "sem" dados

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.3 (1 dos 9) |
| **Arquivo** | `tests/07-financial.spec.ts:33-44` |
| **Diff** | Substituir o teste atual por 2: <br>(a) `test('Ver Detalhes — com pagamentos no período', ...)` — fixture cria 1 payment, clica Ver Detalhes, assert expansão. <br>(b) `test('Ver Detalhes — sem pagamentos no período', ...)` — fixture garante 0 payments, navega, assert "Nenhum pagamento" visível. |
| **Validação** | Spec 07 passa em 3 runs sem skip. |
| **Tempo** | 1.5h |
| **Commit** | `test(e2e): split 07-financial 'com/sem pagamentos' (sub-fase 9.3)` |

---

### 9.4 — 4 specs E2E novos (6.18-6.21) com fixtures

| Campo | Valor |
|---|---|
| **Bug-alvo** | TECH_DEBT 6.18, 6.19, 6.20, 6.21 |
| **Estratégia** | Expandir `tests/26-multi-company-ui-isolation.spec.ts` com 4 testes adicionais (ou criar `tests/26-multi-company-ui-isolation-extras.spec.ts`). |
| **Testes:** | |
| **Teste 1 (6.18 — C6PaymentTab):** | Fixture: cria 2 `c6_payments` distintas (uma por empresa). Loga admin → C6PaymentTab → importa Caratinga → assert tabela mostra row Caratinga. Switch empresa → re-navega → assert NÃO mostra row Caratinga + após import mostra row PN. Validação adicional: estados limpos (sub-fase 5.4). |
| **Teste 2 (6.19 — SettingsTab):** | Fixture: `UPDATE bonus_types SET default_value=99 WHERE company_id=Caratinga AND code='B'; UPDATE bonus_types SET default_value=77 WHERE company_id=PN AND code='B';`. SettingsTab Caratinga → input mostra `99.00`. Switch PN → mostra `77.00`. Cleanup: reverter snapshot. |
| **Teste 3 (6.20 — TriageTab):** | Fixture: `INSERT triage_errors ... company_id=Caratinga, error_date=hoje, error_count=42;`. TriageTab Caratinga → row com `42`. Switch PN → "Nenhum registro neste mês". Cleanup: DELETE. |
| **Teste 4 (6.21 — AdminTab Bloqueios):** | Fixture: `INSERT bonus_blocks ... company_id=Caratinga, week_end=hoje+7d (ativo);`. AdminTab Caratinga → 1 row em "Bloqueios". Switch PN → "Nenhum bloqueio encontrado". Cleanup: DELETE. |
| **Validação** | `npx playwright test tests/26 --workers=1` em 3 runs consecutivos — 4 testes verdes. |
| **Tempo** | 3h |
| **Commit** | `test(e2e): 4 specs isolamento UI multi-empresa (6.18-6.21) (sub-fase 9.4)` |
| **TECH_DEBT** | 6.18-6.21 → resolvidas. |
| **Dependências** | 5.4 concluída (C6 cleanup). |

---

## FASE 10 — E2E componentes sem cobertura ⏳ PENDENTE

> Sem bloqueio. ~30h estimadas (8 sub-fases, alguns componentes grandes). Cobertura E2E pra 8 componentes que hoje não tem spec direta. Pode ser paralelizada com Fase 9.

---

> Ordem: baixa→alta dificuldade. Validação após cada: 3 runs consecutivos sem flake.

### 10.1 — `EmployeeErrorsView` (~171 lin) — baixa

| Campo | Valor |
|---|---|
| **Arquivo novo** | `tests/31-employee-errors-view.spec.ts` |
| **Cenários (6 testes)** | (1) 0 erros → estado vazio; (2) N erros renderizam com fixture; (3) filtro por data; (4) detalhes visíveis (date/value/observation); (5) responsividade mobile width; (6) erro de fetch → mensagem amigável. |
| **Tempo** | 2h |
| **Commit** | `test(e2e): spec 31 EmployeeErrorsView (sub-fase 10.1)` |

### 10.2 — `BonusTypesManager` (~393 lin) — média

| Cenários (10 testes) | (1) lista bonus types empresa atual; (2) trocar empresa repopula; (3) criar novo; (4) editar code/name/value; (5) toggle active/inactive; (6) soft-delete; (7) validação code único; (8) UNIQUE(code, company_id) viola → erro; (9) bonus type usado → não deleta mas desativa; (10) toast feedback. |
| Arquivo | `tests/32-bonus-types-manager.spec.ts` |
| Tempo | 4h |

### 10.3 — `AuditLogsTab` (~319 lin) — média

| Cenários (8 testes) | (1) lista; (2) filtro módulo; (3) filtro user_id; (4) filtro date range; (5) paginação; (6) ordenação desc; (7) detalhes expandíveis; (8) isolamento por empresa. |
| Arquivo | `tests/33-audit-logs-tab.spec.ts` |
| Tempo | 3h |

### 10.4 — `CompanySettings` (~857 lin) — alta

| Cenários (18 testes) | (a) flags bank_hours toggle/select cada — persistência DB; (b) simulador creditMin=120 + debitMin=30 + dailyRate=100 → preview correto (cross-check calculator); (c) reset to defaults; (d) save sem mudanças no-op; (e) flag noturna ON → mostra multiplier slider; (f) custom_hour_value mostra input; (g) trocar empresa → settings refletem; (h) admin-only (supervisor não vê). |
| Arquivo | `tests/34-company-settings.spec.ts` |
| Tempo | 7h |
| Dependências | Suite bank_hours unit estável. |

### 10.5 — `MirrorMassDialog` (~308 lin) — média-alta

| Cenários (10 testes) | dialog abre/fecha; seleção período; lista funcs; selecionar todos/desmarcar; selection individual; gerar PDFs em lote (mock `downloadMirrorsBatchPdf`); loading state; sem funcs → vazio; erro → toast; isolamento por empresa. |
| Arquivo | `tests/35-mirror-mass-dialog.spec.ts` |
| Tempo | 4h |
| Dependências | 6.4 + 6.5 (unit tests mirror) |

### 10.6 — `EmployeeErrorsPage` (~295 lin) — alta (state machine)

| Cenários (14 testes) | state machine: CPF → inválido erro; CPF → tela empresa; empresa selecionada → tela PIN; PIN inválido erro; PIN válido → lista; voltar PIN → empresa; voltar empresa → CPF; CPF em 1 empresa → pula seleção; CPF em 2 empresas → mostra ambas; sem auth (não usa loginUser); lista erros após auth. |
| Arquivo | `tests/36-employee-errors-page.spec.ts` |
| Tempo | 6h |

### 10.7 — `FaceRegistration` (~364 lin) — muito alta (mock pesado)

| Estratégia | Reusar pattern da spec 23 (FaceVerification). Mockar `face-api.js` via `playwright addInitScript`. Mockar `navigator.mediaDevices.getUserMedia` retornando MediaStream fake. |
| Cenários (12 testes) | abertura pede câmera; câmera negada → erro; 3 captures consecutivos → descriptor gravado; capture sem face → retry; save grava `employees.face_descriptor`; face_registered=true; "Refazer foto" reset; preview última captura; cancel reverte; erro upload → toast; unmount cleanup tracks; acessibilidade teclado. |
| Arquivo | `tests/37-face-registration.spec.ts` |
| Tempo | 8h |

### 10.8 — `FaceScanFrame` (~294 lin) — baixa (snapshot)

| Cenários (5 testes) | render default; `scanning=true` mostra animação; `detected=true` overlay verde; `error="X"` mostra mensagem; snapshot visual (`toHaveScreenshot`). |
| Arquivo | `tests/38-face-scan-frame.spec.ts` |
| Tempo | 2h |

---

## FASE 11 — Hardening pra produção pública 🔒 BLOQUEADA (D3 + D4)

> **NÃO INICIAR antes de Victor confirmar D3 (RLS strategy) e D4 (hash senhas).** Estas decisões definem arquitetura de auth + isolamento — uma vez tomadas, refactor é destrutivo (migração de senhas plain→hash em prod).
> ~30h estimadas. Várias sub-fases dependentes entre si.

---

> ⚠️ ALTO RISCO ESTRUTURAL. Rollback obrigatório planejado. Bloqueios D3 + D4 confirmados antes de iniciar.

### Pré-requisitos antes de 11.x

| Item | Validação |
|---|---|
| Suite full verde | 3 runs consecutivos sem regressão |
| Baseline advisors | [AUTO — MCP] `get_advisors security` salvo em `docs/security-baseline-pre-rls.json` |
| **Confirmação D3 + D4** | [MANUAL — Victor] |
| Backup Supabase | [AUTO — MCP] `create_branch` (preview branch = snapshot completo do banco). Rollback via `reset_branch`. |

### 11.1 — Habilitar RLS em 5 grupos de tabelas

#### 11.1.A — Grupo 1: 10 tabelas operacionais

| Tabelas | `attendance`, `employees`, `payments`, `bonuses`, `bonus_blocks`, `geo_fraud_attempts`, `bonus_types`, `triage_errors`, `users` (+ 1 do audit) |
| Migration | `<timestamp>_rls_enable_group1.sql`: `ALTER TABLE X ENABLE ROW LEVEL SECURITY;` em cada tabela + policy default `FOR ALL USING (false);` (deny-all temporário). |
| Validação | App "quebra" intencionalmente (esperado entre 11.1.A e 11.2.A). Confirmar via `SELECT relrowsecurity FROM pg_class WHERE relname=ANY(...)`. |
| Tempo | 30 min |
| Commit | `feat(db): habilitar RLS em 10 tabelas operacionais (sub-fase 11.1.A)` |
| **Próxima IMEDIATA** | 11.2.A (mesma sessão) |

#### 11.1.B — Grupo 2: 5 tabelas de config

Tabelas: `companies`, `geolocation_config`, `payment_period_config`, `admin_cleanup_config`, `face_recognition_config`. Idem 11.1.A.

#### 11.1.C — Grupo 3: 8 tabelas auxiliares

Tabelas: `bank_hours_application_log`, `bank_hours_overrides`, `bonus_removals`, `c6_payment`, `error_records`, `triage_distribution_employees`, `payment_periods`, `attendance_audit_log` (se existir). Idem.

#### 11.1.D — Grupo 4: tabelas globais

Tabelas: `error_logs` (pós-7.4), `activity_logs`, `usage_metrics`, `performance_metrics`, `permissions`, `admin_secret`, `feature_versions`. Policy especial: `FOR SELECT USING (true)` (logs) ou admin-only.

#### 11.1.E — Audit final

[AUTO — MCP] `list_tables schemas=['public']` — identificar qualquer tabela faltante; classificar em grupo. Migration cobertura completa.

**Total 11.1:** ~2.5h, executar em 1 sessão pra minimizar janela "app quebrado".

---

### 11.2 — Policies multi-empresa (D3 = C — confirmar)

> ⚠️ Confirmar D3 antes. Plano assume **C — função SECURITY DEFINER + sessão custom**.

#### 11.2.A — Setup função `current_company_id()` + helper edge fn

| Migration | <br>`CREATE OR REPLACE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT current_setting('app.current_company_id', true)::uuid $$;` <br>`GRANT EXECUTE TO anon, authenticated;` |
| Edge fn nova | `supabase/functions/set_company_context/index.ts` — recebe `{ token, company_id }`, valida, retorna SET app.current_company_id na sessão. Chamada pelo frontend pós-login + pós-switch. |
| Validação | Executar via SQL: `SELECT set_config('app.current_company_id', 'caratinga_id', false); SELECT current_company_id();` → retorna caratinga_id. |
| Tempo | 3h |

#### 11.2.B — Policies SELECT por company_id (15+ tabelas)

| Migration | Pra cada tabela com `company_id`: <br>`CREATE POLICY "select_own_company" ON X FOR SELECT USING (company_id = current_company_id());` |
| Validação | Login admin → query attendance → vê só Caratinga. Switch PN → vê só PN. Spec 25/26 passam. |
| Tempo | 4h |

#### 11.2.C — Policies INSERT/UPDATE/DELETE (idem)

| Migration | `FOR INSERT WITH CHECK (company_id = current_company_id());` etc. |
| Tempo | 4h |

#### 11.2.D — Admin global bypass (ID `9999`)

| Estratégia | Admin master tem `company_id` setado mas pode ler todas. Policy: `OR (auth.uid() = '9999')` ou similar. |
| Tempo | 2h |

#### 11.2.E — Policies tabelas globais (logs/metrics)

| Estratégia | Logs visíveis apenas para admin. Policy: `FOR SELECT USING (auth.uid() = '9999')`. |
| Tempo | 2h |

**Total 11.2:** ~15h.

---

### 11.3 — Hash de senhas (D4 = B — edge fn auth-login)

| Migration | <br>(a) `ALTER TABLE users ADD COLUMN password_hash text;` <br>(b) Script de migração via edge fn: para cada `users.password` plain, gerar `bcrypt(password)` e gravar em `password_hash`. Validar 100% das rows migradas. <br>(c) `ALTER TABLE users DROP COLUMN password;` (após validação). <br>Idem pra `admin_secret`. |
| Edge fn nova | `supabase/functions/auth-login/index.ts`: <br>- POST `{id, password}` <br>- `SELECT password_hash FROM users WHERE id=?` <br>- `if (!bcrypt.compare(password, password_hash)) throw;` <br>- Gera JWT custom: `{ sub: id, company_id, role, ... }` <br>- Retorna token. |
| Frontend | `src/services/database.ts:410-423` (`loginUser`) → chama edge fn `auth-login`. `verifyAdminSecret` (L3771-3780) idem. Token guardado em localStorage; usado em headers Supabase. |
| Validação | Specs 01 (auth), 11/22 (permissions), 24 (admin-complete) passam. Teste manual: tentar login com senha antiga em REST plain → falha. |
| Tempo | 8h |
| Commit | `feat(auth): hash bcrypt via edge fn auth-login (sub-fase 11.3)` |

---

### 11.4 — `verify_jwt: true` em clock-in-validated v7

| Arquivo | `supabase/functions/clock-in-validated/index.ts` (v7) — adicionar verificação JWT manual. Extrai `auth.uid()`, `company_id` do token. |
| Frontend | `src/components/employee-clock/EmployeeClockIn.tsx` + callers — incluir `Authorization: Bearer ${session.access_token}` no payload. |
| Deploy | [AUTO — MCP] `deploy_edge_function` v7. |
| Validação | Spec 02 (employee-clock) passa. Chamada sem token → 401. |
| Tempo | 4h |
| Commit | `feat(edge-fn): verify_jwt true em clock-in-validated v7 (sub-fase 11.4)` |
| Dependências | 11.3 concluída. |

---

### 11.5 — Audit final security via MCP

| Etapa | [AUTO — MCP] `get_advisors type=security` |
| Critério | 0 ERROR; warnings revisados individualmente, documentados em `ARCHITECTURE.md`. |
| Tempo | 1h |
| Commit | `docs: snapshot security advisors pós-RLS (sub-fase 11.5)` |
| Output | `docs/security-baseline-post-rls.json` |

---

## FASE 12 — Documentação

### 12.1 — Atualizar `README.md`

| Conteúdo novo | Seção "Multi-empresa" (modelo, switching); Seção "Segurança" (RLS, bcrypt, JWT); edge fn v7; migration count atualizado; versão correta. |
| Tempo | 1.5h |
| Commit | `docs: atualizar README pós-multi-empresa + RLS (sub-fase 12.1)` |

### 12.2 — Atualizar `PRE-LAUNCH-CHECKLIST.md`

| Conteúdo | Marcar bloqueadores resolvidos; adicionar seção "Multi-empresa onboarding" (cadastrar empresa, importar dados, validação fluxo). |
| Tempo | 1h |
| Commit | `docs: atualizar PRE-LAUNCH-CHECKLIST pós-hardening (sub-fase 12.2)` |

### 12.3 — Documentar edge function v7

| Arquivo novo | `supabase/functions/clock-in-validated/README.md` |
| Conteúdo | Arquitetura, payload, response, error codes, fluxo de fraude, integração JWT. |
| Tempo | 1.5h |
| Commit | `docs(edge-fn): documentar clock-in-validated v7 (sub-fase 12.3)` |

### 12.4 — `ARCHITECTURE.md` novo

| Conteúdo | Visão stack, multi-tenancy strategy, RLS approach, auth flow, edge fn architecture, banco horas pipeline. Diagrama Mermaid. |
| Tempo | 2h |
| Commit | `docs: ARCHITECTURE.md inicial (sub-fase 12.4)` |

---

## FASE 13 — Validação final + go-live

### 13.1 — Full suite Playwright 3x

| Comando | [AUTO — Bash] `for i in 1 2 3; do npx playwright test --workers=1 --reporter=list > "docs/playwright-baseline/run-$i.log" 2>&1; done` |
| Critério | 3 runs com contagem idêntica: `XXX passed, ≤2 skipped, 0 failed`. Sem flake. |
| Tempo | 1h |
| Commit | `docs: baseline Playwright 3-runs pós-hardening (sub-fase 13.1)` |

### 13.2 — Audit final MCP

| Comando | [AUTO — MCP] `get_advisors security`, `get_advisors performance` |
| Critério | 0 ERROR; warnings com justificativa em ARCHITECTURE.md. |
| Tempo | 1h |
| Commit | `docs: baseline advisors final (sub-fase 13.2)` |

### 13.3 — [MANUAL — Victor] Onboarding Ponte Nova com dados reais

| Etapa | Victor + admin PN: cadastrar employees reais, configurar geolocation, payment_period_config, bonus_types. |
| Validação automática | [AUTO — playwright-skill] depois que Victor avisar: login admin → switch PN → criar employee teste → registrar attendance → verificar payment. |
| Tempo manual | Variável. Eu acompanho. |

### 13.4 — [MANUAL — Victor] Tag + push

| Etapa | Victor: `git tag v2.0.0-multi-tenant; git push origin main --tags;` Deploy build (`npm run build`) pra hosting. |
| Eu auxilio | Posso preparar release notes + changelog. |
| Tempo | Variável. |

---

## 6. MÉTRICAS FINAIS ESPERADAS

| Métrica | Antes (2026-05-11) | Depois (pós-13.4) |
|---|---|---|
| Bugs ativos no TECH_DEBT | 9 | 0 |
| Skips condicionais E2E | 9 | ≤2 (não-fixáveis sem refactor de produto) |
| Specs E2E | 30 | 38+ |
| Utils com unit test | 8/13 | 13/13 |
| Componentes sem E2E | 9 | 1 (FaceVerification — já coberto via 23) |
| Tabelas com RLS | 0 | ~28 |
| Senhas em plain-text | sim | não (bcrypt) |
| `verify_jwt` em edge fn | false | true |
| `error_logs` com company_id | não | sim |
| Migrations | 50 | ~58 |
| Edge fn version | v5 | v7 (+v1 auth-login + v1 set_company_context) |
| Cobertura código (estimada) | ~40% | ~75% |

---

## 7. DEPENDÊNCIAS (DAG)

```
FASE 5 (Quick wins) — paralelizáveis entre si
  5.1 ─┐
  5.2 ─┤
  5.3 ─┼─→ 5.5 (audit)
  5.4 ─┘
  5.6 (mesclado em 7.2)

FASE 6 (Unit tests) — paralelizável internamente
  6.1, 6.2, 6.3 (independentes)
  6.4 ──→ 6.5 (compartilha fixtures)

FASE 7 (Migrations small)
  7.2 (depende 5.5 audit) ──→ 7.3 (D6) ──→ 7.4 (D5)

FASE 8 (Fixes médios) — depende de testes verdes
  8.1 (suite estável)
  8.3 (D1 confirmado, 8.1 não conflita)
  8.4 (depende 7.4 — error_logs com company_id)
  8.5 (depende 8.3 — night minutes funcionando)

FASE 9 (E2E gaps fixáveis)
  9.1 ──→ 9.2 (compartilha padrão data-testid)
  9.3 (independente)
  9.4 (depende 5.4 — C6 cleanup)

FASE 10 (E2E componentes)
  10.1 → 10.2 → 10.3 → 10.4 (depende 8.x) → 10.5 (depende 6.4/6.5) → 10.6 → 10.7 → 10.8

FASE 11 (Hardening) — D3 + D4 confirmados antes
  11.1.A → 11.1.B → 11.1.C → 11.1.D → 11.1.E (mesma sessão)
  11.2.A → 11.2.B → 11.2.C → 11.2.D → 11.2.E
  11.3 (depende D4, 11.2.D)
  11.4 (depende 11.3)
  11.5 (depende 11.1-11.4)

FASE 12 (Documentação) — após 11
  12.1 → 12.2 → 12.3 → 12.4

FASE 13 (Validação) — após 12
  13.1 → 13.2 → 13.3 [MANUAL] → 13.4 [MANUAL]
```

---

## 8. SUB-FASES ONDE VICTOR PRECISA RESPONDER

| Quando vou perguntar | Pergunta | Travamento |
|---|---|---|
| Antes da 8.3 | "Confirma D1 = C (diurno primeiro) pra mapeamento `nighttime_minutes → nightCreditMinutes`?" | 4h da 8.3 |
| Antes da 11.2 | "Confirma D3 = C (SECURITY DEFINER + sessão custom)? Alternativa B = Supabase Auth completo (mais trabalho)." | Toda a Fase 11 |
| Antes da 11.3 | "Confirma D4 = B (edge fn `auth-login` com bcrypt)?" | 11.3 + 11.4 |
| Antes da 13.3 | "Posso ir testando importação PN? Ou prefere cadastrar manualmente antes?" | 13.3 |
| Antes do push final | "Faz a tag/push você mesmo, ou prepara release notes pra eu?" | 13.4 |

**Decisões já tomadas no plano (Victor pode revisar agora):** D2 = ES, D5 = A, D6 = C.

---

## 9. ARQUIVOS COM MAIS MUDANÇAS (TOP 10)

Ordenados por número de sub-fases que tocam:

1. `src/services/database.ts` — 7.3, 7.4, 8.1, 8.3, 8.5, 11.3, 11.4 (refactor central, ~177 exports)
2. `supabase/functions/clock-in-validated/index.ts` — 8.4 (v6), 11.4 (v7)
3. `src/components/admin/AdminTab.tsx` — 5.2 (useCallback), 7.2 (lazy-create), 9.1 (data-testid)
4. `src/components/c6payment/C6PaymentTab.tsx` — 5.4 (cleanup), 9.1 (data-testid)
5. `src/services/errorTracking.ts` — 7.4 (companyId)
6. `src/utils/c6Export.ts` — 6.3 (unit tests)
7. `src/utils/mirrorGenerator.ts` — 6.4 (unit tests)
8. `src/utils/mirrorPdf.ts` — 6.5 (unit tests)
9. `TECH_DEBT.md` — todas as sub-fases (atualização contínua)
10. `README.md` + `PRE-LAUNCH-CHECKLIST.md` + `ARCHITECTURE.md` — Fase 12

---

## 10. PRÓXIMO PASSO

Quando Victor autorizar (via `ExitPlanMode` aprovado):

1. Vou abrir sub-fase **5.1** (fix data futura — 15min, zero ambiguidade, zero decisão).
2. Executo o workflow operacional descrito em §3.
3. Reporto resultado e pergunto se segue pra 5.2.

Estimativa de tempo até 100% produção:
- **Trabalho automatizado por aqui:** ~134h (≈ 17 sessões de 8h)
- **Trabalho manual Victor:** ~2-4h (decisões D1/D3/D4 + onboarding PN + push)
- **Calendário:** depende da disponibilidade; sub-fase mais curta (5.1) sai em 15min, mais longa (6.3 c6Export) sai em 2 dias.

---

> **Fim do plano.** Documento vivo — atualizado em cada sub-fase com link pra commit hash e estado de execução.
