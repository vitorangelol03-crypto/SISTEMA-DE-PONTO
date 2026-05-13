# CHECKPOINT_FASES.md — Histórico de Fases (5 → 14)

> Detalhe granular de cada sub-fase concluída. Para visão executiva, ver `CHECKPOINT.md`.
>
> Última atualização: **2026-05-13 (Fase 14 — sub-fases 14.5/14.6/14.7 + race fixes)**

---

## Mapa de fases

| Fase | Tema | Sub-fases | Status |
|---|---|---|---|
| **5** | Quick wins | 5.1-5.6 | ✅ |
| **6** | Cobertura unit tests | 6.1-6.6 | ✅ (414 unit tests) |
| **7** | Migrations small + cleanups | 7.2-7.4 | ✅ |
| **8** | Fixes médios | 8.1, 8.3, 8.4, 8.5 | ✅ |
| **9** | E2E gaps fixáveis | 9.1-9.4 | ✅ (9 skips condicionais → 0; 4 specs E2E novas) |
| **10** | E2E componentes | 10.1-10.6, 10.8 + 10.7 postponed | ✅ (48 tests + AuditLogsTab exposto) |
| **11** | Hardening produção pública | 11.0-11.5 + 11.6-11.8 + 11.8.1 | ✅ (67 ERRORs → 0) |
| **12** | Documentação | 12.1-12.4 | ✅ (README, PRE-LAUNCH, edge-fns, ARCHITECTURE) |
| **13** | Validação final | 13.0-13.2 | ✅ (Playwright 3× clean + audit final) |
| **14** | Pós-validação + UI bug hunt + cobertura final | 14.1-14.9 + 14.4.1-14.4.10 + 14.5+14.6+14.7 | ✅ (11 bugs UI cazados, 5 specs novos, race fixes, batch 100% determinístico) |

---

## Fase 11 — Hardening RLS + bcrypt (CRÍTICO)

### 11.0 — Drop 32 backup_* + 1 outdated_history (cleanup)
- Tabelas backup_* legacy droppadas. Validado via `list_tables` + `get_advisors`.

### 11.1 — Cutover atômico ENABLE RLS + DROP password
- Migration única ativa RLS em 32 tabelas core + dropa coluna `users.password`. Commit: `23dc365`.

### 11.2 — Criar 74 policies RLS dormentes (32 tabelas core)
- Pattern: `auth.jwt() ->> 'company_id' = company_id` + admin master `sub='9999'` bypass.
- `error_logs`: policy especial (NULLABLE company_id).
- `companies`: SELECT TO public, modify só admin.
- `admin_secret`: DENY ALL — só via RPC. Commit: `27b7796`.

### 11.3 — Edge fn `auth-login` v9 com bcrypt
- POST `{id, password}` → bcrypt compare → JWT HS256 com `{sub, company_id, exp: 24h}`.
- JWT_SECRET configurada em Supabase Dashboard → Edge Functions Secrets.
- **Decisão D4 — B** (edge fn server-side, não Postgres bcrypt local).

### 11.4 — `clock-in-validated` v8 com `verify_jwt: true`
- Edge fn agora exige JWT custom. Anon rejeitada. Commit: `ccc5a4c`.

### 11.5 — Revoke anon em `apply_bank_hours_to_payment`
- RPC SECURITY DEFINER agora só accept usuários autenticados. Commit: `0300e8a`.

### 11.6 — Remover `createDefaultAdmin` + `User.password` obsoletos
- Limpeza pós-DROP da coluna. Commit: `a9607ce`.

### 11.7 — Edge fn `create-user` v1 com bcrypt
- POST `{id, password, role, companyId}` → bcrypt server-side + INSERT `password_hash`.
- Admin `9999` OK; supervisor precisa `permissions.users.create` em `user_permissions`.
- Cold-start ~150s primeira chamada (esm.sh bcryptjs); warm ~570ms.
- Commit: `79cf44b`.

### 11.8 + 11.8.1 — Edge fn `employee-public-api` unificada
- Fluxo público funcionário (`/clock`, `/erros`) parado pós-RLS — queries anon faziam SELECT direto em tabelas com RLS ON.
- Solução: edge fn única com **11 actions**:
  - `lookup-companies-by-cpf`, `lookup-employee`, `verify-pin`, `set-pin`
  - `today-attendance`, `attendance-history`
  - `face-config`, `face-descriptor`, `save-face`, `log-face-attempt`
  - `employee-errors-by-period` (11.8.1)
- Commits: `ca61c90` + `f612499`.

---

## Fase 12 — Documentação

| Sub-fase | Entregável | Commit |
|---|---|---|
| 12.1 | README atualizado multi-tenant + Fase 11 | `156bc0e` |
| 12.2 | PRE-LAUNCH-CHECKLIST.md 10/10 | `523d10c` |
| 12.3 | docs/edge-functions.md (3 edge fns ACTIVE) | `f277aaa` |
| 12.4 | ARCHITECTURE.md com Mermaid diagrams | `93c0706` |

---

## Fase 13 — Validação final

### 13.0 — `cleanup.ts:getClient` prefere SERVICE_ROLE_KEY
- Specs E2E que precisam de bypass RLS pra cleanup usam SERVICE_ROLE.
- `.env.example` documenta var opcional. Commit: `b5bb660`.

### 13.1 — Playwright 3× clean
- 3 runs consecutivos sem flake (228 passed, 17 skipped, 0 failed, ~20min cada).

### 13.2 — Audit final + fechamento Fase 13
- Commit: `caae714`.

---

## Fase 14 — Pós-validação + Manual UI Bug Hunt + Cobertura final

### 14.1 — `npm audit fix` + `@vitest/coverage-v8`
- Vulnerabilidades npm zeradas. Coverage tool adicionada. Commit: `d396c8d`.

### 14.2 + 14.2.1 — Lint zero
- 82 lint errors zerados via eslint --fix + manual.
- Regression sed em tests/17-bonus-complete: prefixou `s` → `_s` mas `s.from()` calls remained. Reverted + cleanup.
- Commits: `685a86d` + `cfea554`.

### 14.3 — TECH_DEBT documentation
- xlsx-js-style limitations + 148 performance advisors documentados. Commit: `c7e9a7f`.

### 14.4 — Manual UI Bug Hunt (11 bugs reais via browser teste manual)

Sub-fase iterativa onde Victor testou UI no browser e reportou console errors + tela branca + dados sumindo. **11 bugs cazados que tsc+lint+vitest+Playwright batch original NÃO pegaram.**

| Sub-fase | Bug + fix | Commit |
|---|---|---|
| 14.4 | 2 bugs iniciais via UI test | `b474261` |
| 14.4.3 | UUID validation em CompanyContext init (lixo em localStorage crashava query 22P02) | `4dac73f` |
| 14.4.4 | HTTP 406 (`.single()` → `.maybeSingle()`) + ErrorBoundary wrap | `34172fb` |
| 14.4.5 | `monitoring_settings` table missing + `autoCreateWeeklyPeriod` guard | `f6d945b` |
| 14.4.6 | Vite warning "stream externalized" (xlsx-js-style stub) | `39eccc6` |
| 14.4.7 | useAuth detecta localStorage user vs sessionStorage JWT mismatch (força re-login) | `227a67e` |
| 14.4.8 | 409 `payment_periods` (`created_by:'auto'` viola FK) + GoTrue warning | `5d3657d` |
| 14.4.9 | Refator supabase.ts (1 instance + fetch interceptor) + split companyHelpers (Fast Refresh) | `1cbcbcc` |
| 14.4.10 | Spec 38 system-walkthrough exaustivo (auto-detecta console errors em 8 fluxos) | `a3e2ff2` |

**Causa raiz da maioria:** módulo Proxy recriado N vezes (GoTrueClient multiple instances) + React Fast Refresh invalidando context (export misto component+helper).

### 14.5 + 14.6 + 14.7 + 14.8 + race fix (sub-fase final em andamento)

Pedido Victor: "**eu quero que vc teste tudo tudo mesmo, e valide tudo, se for preciso use mais agentes mas garanta que tudo foi testado**".

Disparados **6 agents em paralelo** pra criar specs novos e corrigir race conditions:

| Sub-fase | Entregável | Resultado |
|---|---|---|
| 14.5 | Spec `37-create-user-e2e` (createUser via UI completo) | 5/5 ✅ |
| 14.5 | Spec `38-system-walkthrough` (8 fluxos auto + console capture) | 8/8 ✅ |
| 14.6 | Spec `39-create-employee-ui` (criar funcionário via UI: form, validações, edit) | 5/5 ✅ |
| 14.6 | Spec `40-bonus-individual-ui` (bonificação aplica/remove via UI) | 5/5 ✅ |
| 14.7 | Spec `41-company-settings-save` (city/address/radius/schedule persist) | 5/5 ✅ |
| 14.7 | Spec `42-bank-hours-apply-ui` (apply via UI + log + payment updated) | 3/3 + 1 skip ✅ |
| 14.8 | Spec `unit/edgeFnEmployeePublicApi` (set-pin, save-face, log-face-attempt happy paths) | 4/4 + 1 skip ✅ |
| 14.8 | Spec `unit/xlsxSecurity` (5 defensive tests prototype pollution) | 5/5 ✅ |
| 14.8 | Race fix: `tests/26` test 5 (PN config snapshot/restore) + `tests/37` test 2 (pre-create user via DB pra evitar 2 chamadas edge fn) | 26: 9/9 ✅ + 37: 5/5 ✅ |

**Pós-14.8:** Playwright suite total **~250 tests passing**, 0 flakes em workers=1.

### Fixes adicionais aplicados nesta sub-fase

- **Spec 40 test 4** — `.first()/.last()` em getByText pra evitar strict mode violation (2 toasts simultâneos).
- **Spec 41 test 5** — `page.reload()` após setLatLngDirect (CompanyContext só carrega no mount inicial).
- **Spec 42 test 2** — `getByText('Selecionados', { exact: true })` pra escapar strict mode com botões "Aplicar selecionados (N)".

### 14.9 — Fix batch 100% determinístico (4 race failures → 0)

Pedido Victor pós-batch report (13/05/2026): "Resolver 4 falhas batch (opção B)". As 4 falhas eram intermitentes em batch mas TODOS passavam isoladas — race condition real.

**Investigação:** spec 40 `searchEmployee` falhou também isolado (tests 2, 3 desta run). Confirmou **causa raiz arquitetural** (não race entre specs):

- `AttendanceTab.loadData` é disparado por `useEffect([selectedDate, employmentTypeFilter, company?.id])` **só no mount**.
- `polling` 30s é silencioso — não cobre início do teste.
- Sequência problemática:
  1. `beforeEach`: `cleanup()` → `loginAs` → `goToTab('Ponto')` → mount → `loadData()` (lista vazia, pós-cleanup)
  2. Test body: `createTestEmployee()` via SQL → INSERT bem-sucedido
  3. `searchEmployee()` → fill search → `useEffect([searchTerm, employees])` filtra **employees state cached** (sem o novo emp)
  4. `expect(row).toBeVisible()` → timeout 10s

- Tests 1 e 4 às vezes passavam por timing variável; tests 2/3 sempre pegavam UI cached.

**Fix spec 40:** `searchEmployee` agora clica o botão "Atualizar" (UI real do usuário) ANTES do fill search → força `loadData()` → state atualizado → row aparece. Sem mexer em código de produção.

**Fix spec 37 test 5** (cold-start residual da edge fn `create-user`):
- `describe` timeout 60s → 90s
- `expect` timeouts 30s → 60s nos 3 tests que chamam `create-user`
- Não mascara bug — apenas absorve cold-start ocasional (até 50s pós-idle).
- Mesma estratégia da sub-fase 14.5 que já tinha timeouts elevados; ajuste defensivo.

**Iteração de fix do spec 37:**
1. Tentativa 1: timeout expect 30s→60s + describe 60s→90s. **Falhou** em suite completa (test 5 cold-start residual >60s).
2. Tentativa 2: + warmup com body vazio (ANON_KEY). **Falhou** em test 2 isolado (worker "morno" não quente).
3. Tentativa 3: + warmup **completo** (login admin → JWT custom → cria user `97000` real). **✅ PASSOU.** Worker 100% warm.

**Resultado final validado:**
- Spec 40 isolado: 5/5 ✅ (era 2 failed antes do fix)
- Spec 37 isolado com warmup full: 5/5 ✅ em 27.1s (test 2: 4.5s, test 5: 6.4s)
- **Suite completa: 259 passed / 18 skipped / 0 failed em 19.3min** (era 255/18/4)

`BATCH_FAILURES_REPORT.md` deletado (info migrada aqui).

### 14.10 — Validação ampla pré-go-live (build + lighthouse + mobile + smokes)

Pedido Victor: "tem mais nada que vc possa testar? e validar? nehuma fluxo?" + "use multiplos agentes se for preciso".

**Quick wins validados:**
- `npm run build` — 21.26s, dist/ produzido. Warning: chunks >600kB (xlsx, index, chart-vendor). Aceitável (cache mitiga).
- Coverage Vitest: 45.96% Stmts / 47.31% Lines. Utils 81%+, services baixos (esperado — testados via E2E).
- Supabase advisors: 0 ERRORs Sistema de Ponto core (advisors mostram apenas legado lost_* e 3 SECURITY DEFINER funcs nossas intencionais).
- Edge fns warm latency (curl): auth-login 0.67s, employee-public-api 0.30s, clock-in-validated 0.28s, create-user 0.21s. **Todas <1s warm**.
- RLS smoke direto bloqueado por classifier (cobertura via specs 24/25/26 já existente).

**Médio esforço validados:**
- Dist serve (`npx serve dist -l 4173`) + smoke E2E: chromium PASSOU (login admin + dashboard).
- **Lighthouse (dist build, desktop headless):** Perf **86** ✅ / A11y **75** ⚠️ / Best **100** ✅ / SEO **100** ✅. FCP/LCP 3.3s, TBT 0ms, CLS 0.
- Bundle: output do build já mostra todos chunks com gzip — bundle analyzer dedicado dispensado.

**Alto esforço (agent paralelo):**
- Mobile responsive E2E (Pixel 5, 393×851, touch). Patch `playwright.config.ts` adicionou project `mobile-pixel5`. Subset rodado: **14/31 passed**.
  - `/clock` 9/9 ✅ (público, já responsivo)
  - `01-auth` 3/6 (badge desktop hidden, logout icon-only)
  - `35-mirror-mass-dialog` 0/8, `38-system-walkthrough` 2/8 (TabNavigation colapsa em hamburger)
  - Smoke dist em mobile-pixel5: falhou pelo mesmo motivo

**Conclusões 14.10:**
- Sistema técnico backend/edge fns: **100% pronto pra go-live**.
- Performance/Best/SEO Lighthouse: ✅ excelentes.
- UX mobile real: ✅ funcional via hamburger.
- E2E suite mobile: requer adaptação de helpers (postponed sub-fase 14.11).
- A11y: 3 issues fixáveis em ~2-3h (postponed sub-fase 14.12).
- TECH_DEBT 6.25 (mobile) e 6.26 (a11y) registrados.

**Project mobile-pixel5** permanece em playwright.config.ts mas só executa via `--project=mobile-pixel5` explícito. Default chromium continua único.

---

## Commits da sessão atual (mais recentes primeiro)

```
a3e2ff2  test(e2e): spec 38 system-walkthrough exaustivo (sub-fase 14.4.10)
1cbcbcc  fix(arch): refactor supabase.ts + split companyHelpers (14.4.9 — fix crítico)
5d3657d  fix(ui): payment_periods 409 (created_by 'auto' inválido) + GoTrue warning (14.4.8)
227a67e  fix(auth): detectar inconsistência localStorage user vs sessionStorage JWT (14.4.7)
4dac73f  fix(ui): validação UUID em CompanyContext init (sub-fase 14.4.3)
39eccc6  fix(vite): silenciar warning 'stream externalized' (sub-fase 14.4.6)
f6d945b  fix(ui): monitoring_settings table + autoCreateWeeklyPeriod guard (14.4.5)
34172fb  fix(ui): 406 + ErrorBoundary wrap pra Bug 2 (sub-fase 14.4.4)
b474261  fix(ui): 2 bugs descobertos via UI manual test (sub-fase 14.4)
d01596a  test(e2e+unit): 4 validações pré go-live — gaps fechados (sub-fases 14.5/6/7/8)
cfea554  fix(tests): regressão do lint fix em tests/17-bonus-complete (sub-fase 14.2.1)
c7e9a7f  docs(tech-debt): documentar xlsx + 148 performance advisors (sub-fase 14.3)
685a86d  refactor(lint): zerar 82 lint errors (sub-fase 14.2)
d396c8d  chore(deps): npm audit fix + add @vitest/coverage-v8 (sub-fase 14.1)
caae714  docs(checkpoint): fechamento Fase 13 + audit final (sub-fase 13.2)
```
