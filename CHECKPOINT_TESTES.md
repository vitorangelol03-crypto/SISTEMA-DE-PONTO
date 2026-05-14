# CHECKPOINT_TESTES.md — Specs, Coverage, Comandos

> Estado da bateria de testes pós-Fase 14. Última atualização: **2026-05-13**.

---

## 1. Resumo numérico

| Métrica | Valor atual |
|---|---|
| Unit tests (Vitest) | **422+ passing** (incluindo 16 specs `tests/unit/`) |
| E2E specs (Playwright) | **40+ specs** (specs `tests/01-*` a `tests/42-*`) |
| Tests E2E individuais | **~250+ passing**, 0 flakes em workers=1 |
| Coverage tool | `@vitest/coverage-v8` instalado (14.1) |

---

## 2. Specs E2E Playwright — Mapa completo

### Específicos (1-19): Fluxos core do sistema
| Spec | Tema | Pass |
|---|---|---|
| `01-auth` | Login admin/supervisor | 6/6 ✅ |
| `02-employee-clock` | Funcionário marca ponto (/clock) | 9/9 ✅ |
| `03-employees-tab` | CRUD employees básico | ✅ |
| `04-bonus` | Aplicar bonificação em MASSA | ✅ |
| `05-employees` | Importação Excel | ✅ |
| `06-financial` | Gestão financeira + pagamentos | ✅ |
| `07-reports` | Relatórios mensais/quinzenais | ✅ |
| `08-geolocation` | Geo + clock-in-validated | 4/4 ✅ |
| `09-c6-export` | Pagamento C6 Bank Excel | ✅ |
| `10-bank-hours` | Banco de horas base | ✅ |
| `11-tutorials` | Sistema de tutoriais | ✅ |
| `12-admin-tab` | Admin tab + verifyAdminSecret | 3/3 ✅ |
| `13-permissions` | User permissions matrix | ✅ |
| `14-import-excel` | Importação validações | ✅ |
| `15-bonus-types-manager` | Gestor de tipos bonus | ✅ |
| `16-mirror` | Espelho ponto | ✅ |
| `17-bonus-complete` | Fluxo bonus completo | ✅ |
| `18-error-tracking` | ErrorBoundary + error_logs | ✅ |
| `19-c6-cnpj` | C6 CNPJ validação | ✅ |

### Específicos (20-30): Features expandidas + multi-empresa
| Spec | Tema | Pass |
|---|---|---|
| `20-attendance-detail` | Detalhe attendance | ✅ |
| `21-multi-day-mirror` | Espelho múltiplos dias | ✅ |
| `22-tutorial-onboarding` | Onboarding tutorial | ✅ |
| `23-employee-clock-complete` | Clock completo (1 skip facial) | ✅ |
| `24-multi-company-isolation` | Isolamento DB multi-empresa | ✅ |
| `25-multi-company-isolation-v2` | (v2 isolation, alguns gaps SERVICE_ROLE) | ✅ |
| `26-multi-company-ui-isolation` | **Isolamento UI multi-empresa** | **9/9 ✅** (race fix em 14.8) |
| `27-mirror-bonus-mass` | Espelho com bonus em massa | ✅ |
| `28-payment-periods` | Gestão de períodos | ✅ |
| `29-bank-hours-integrity` | Integridade banco horas | ✅ |
| `30-multi-company-isolation-v2` | Multi-tenant v2 | ✅ |

### Específicos (31-42): Cobertura nova
| Spec | Tema | Pass |
|---|---|---|
| `31-employee-errors-view` | View erros funcionário | ✅ |
| `32-bonus-types-manager` | Gestor types v2 | ✅ |
| `34-company-settings` | CompanySettings toggles | ✅ |
| `35-mirror-mass-dialog` | Dialog mirror mass | ✅ |
| `36-employee-errors-page` | /erros page completa | ✅ |
| `37-create-user-e2e` | **createUser via UI completo** (sub-fase 14.5) | **5/5 ✅** (race fix em 14.8) |
| `38-system-walkthrough` | **8 fluxos auto + console capture** (sub-fase 14.4.10) | **8/8 ✅** |
| `39-create-employee-ui` | **Criar funcionário UI form** (sub-fase 14.6) | **5/5 ✅** |
| `40-bonus-individual-ui` | **Bonificação individual UI** (sub-fase 14.6) | **5/5 ✅** |
| `41-company-settings-save` | **Salvar CompanySettings** (sub-fase 14.7) | **5/5 ✅** |
| `42-bank-hours-apply-ui` | **Apply bank hours UI** (sub-fase 14.7) | **3/3 ✅ + 1 skip** (revert UI inexistente) |
| `99-supremo` | **Teste Supremo v1** (10 fluxos completos Caratinga, sub-fase 14.9) | **10/10 ✅** em 1.2min |
| `100-supremo-v2` | **Teste Supremo v2** (46 tests, 12 seções A-L exaustivo, sub-fase 14.13) | **46/46 ✅** prod em 2.0min |

---

## 3. Specs Vitest — Mapa completo

### `tests/unit/` (16 specs)
- `applyBankHoursToPayment` — RPC integration
- `attendanceCalc` — cálculo de horas
- `bankHoursCalculator` — saldo banco horas
- `bankHoursUiHelpers` — formatadores UI
- `bonusHelpers` — lógica de bonus
- `c6Export` — geração Excel C6
- `dateUtils` — utils de data BRT
- **`edgeFnEmployeePublicApi`** — **happy paths set-pin/save-face/log-face-attempt** (sub-fase 14.8) — 4/4 ✅ + 1 skip
- `employeeImportRoundtrip` — import/export Excel
- `employeeImportValidation` — validações de import
- `integrityChecks` — checks de integridade DB
- `mirrorGenerator` — geração espelho
- `mirrorPdf.real` — PDF real (integration)
- `mirrorPdf` — PDF unit
- `numericInputHelpers` — input numerico
- **`xlsxSecurity`** — **5 defensive tests prototype pollution** (sub-fase 14.8) — 5/5 ✅

---

## 4. Helpers compartilhados de teste

### `tests/helpers.ts`
- `ADMIN = {id: '9999', password: '684171'}` — admin master
- `loginAs(page, user)` — completo: ID + senha + selectCompany
- `goToTab(page, 'Funcionários' | 'Ponto' | etc.)` — clica tab
- `logout(page)` — botão de logout no header
- `switchCompany(page, companyName)` — admin switch via CompanySwitcher

### `tests/cleanup.ts`
- `getClient()` — prefere `SUPABASE_SERVICE_ROLE_KEY` se disponível, senão anon
- `cleanupAllTestData()` — limpa rows criadas hoje com prefix `PW Test`

### `tests/integrity-helpers.ts`
- `TEST_EMPLOYEE_NAME_PREFIX = 'PW Test '` — prefix padrão
- `createTestEmployee({name, ...})` → uuid
- `insertAttendance(empId, date, {status, ...})` → uuid
- `cleanupByPrefix(prefix, dates?)` — DELETE FK-safe por prefix
- `insertPaymentRow(empId, date, {...})` → uuid

---

## 5. Comandos de validação

### TypeScript + Lint
```bash
npx tsc --noEmit                 # tsc strict — exit 0 esperado
npx eslint src/**/*.{ts,tsx}     # lint — exit 0 esperado
```

### Vitest
```bash
npx vitest run                              # full unit suite (~4s)
npx vitest run nomeDoArquivo                # spec isolado
npx vitest run --coverage                   # coverage report
```

### Playwright
```bash
# Spec isolado
npx playwright test tests/XX-spec.spec.ts --workers=1 --reporter=list

# Test isolado dentro de spec
npx playwright test tests/XX-spec.spec.ts:LINE --workers=1

# Full suite (lento — ~15-25min)
npx playwright test --workers=1 --reporter=line

# Debug com trace (gera trace.zip)
npx playwright test tests/XX --workers=1 --trace=on

# Ver trace gerado
npx playwright show-trace test-results/.../trace.zip
```

---

## 6. Pre-flight checklist (antes de commit)

```bash
npx tsc --noEmit                            # ✅ exit 0
npx eslint src/                             # ✅ exit 0
npx vitest run | tail -5                    # ✅ N passed
npx playwright test tests/RELEVANTE-spec.ts # ✅ N/N passed
```

---

## 7. Patterns de spec

### Pattern E2E (Playwright)
```typescript
import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX + 'NomeSpec ';

test.describe('Nome do feature (sub-fase X.Y)', () => {
  test.beforeAll(async () => { await cleanupByPrefix(PREFIX); });
  test.afterAll(async () => { await cleanupByPrefix(PREFIX); });
  test.beforeEach(async ({ page }) => {
    await cleanupByPrefix(PREFIX);   // defensivo
    await loginAs(page, ADMIN);
    await goToTab(page, 'Funcionários');
  });

  test('1. cenário X', async ({ page }) => {
    // UI actions
    await page.getByRole('button', { name: /Submit/ }).click();
    await expect(page.getByText(/sucesso/i)).toBeVisible({ timeout: 10_000 });

    // SQL validation
    const s = getClient();
    const { data } = await s.from('table').select().eq('field', value).single();
    expect(data?.field).toBe(expected);
  });
});
```

### Pattern Vitest happy path edge fn
```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

const env = parseDotenv('.env');
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

describe('edge fn X actions', () => {
  let fixtureId: string;
  beforeEach(async () => { fixtureId = await createFixture(ROLE); });
  afterEach(async () => { await deleteFixture(ROLE, fixtureId); });

  test('action Y happy path', async () => {
    const res = await fetch(`${URL}/functions/v1/EDGE/Y`, { ... });
    expect(res.ok).toBe(true);
    // SQL validation via service_role
  });
});
```

---

## 8. Lacunas conhecidas (postponed)

| Item | Motivo | Sub-fase |
|---|---|---|
| `10.7 FaceRegistration` | `face-api.js` + `getUserMedia` mock library pesado (~6-8h) | Postponed |
| Bank hours **revert UI** | Não existe no produto — apenas apply | Spec 42 skip |
| `set-pin` short PIN | Coberto em 14.4.10 (test 38 indireto) | Cobertura indireta |
| Browser compat | Só Chromium em CI | Pós-go-live |
| Mobile responsivo | Não exercitado em E2E | Pós-go-live |
| Supervisor com `users.create` perm | Cenário criado mas não exercitado | Pós-go-live |

---

## 9. Sub-fase 14.8 — Fixes pós-criação dos specs

Após criação dos 5 specs novos via agents paralelos, 3 ajustes manuais:

| Spec | Fix | Causa |
|---|---|---|
| `40-bonus-individual-ui` test 4 | `.first()/.last()` em getByText | Strict mode violation (2 toasts simultâneos) |
| `41-company-settings-save` test 5 | `page.reload()` pós-setLatLngDirect | CompanyContext só carrega no mount inicial |
| `42-bank-hours-apply-ui` test 2 | `getByText('Selecionados', {exact: true})` | Strict mode: 3 elementos matchavam regex `/Selecionados/i` |

---

## 10. Sub-fase 14.9 — Batch determinístico (race fixes finais)

Após batch report (255 passed/18 skipped/4 failed onde TODOS passavam isoladas):

| Spec | Fix | Causa raiz |
|---|---|---|
| `40-bonus-individual-ui` `searchEmployee` | Click "Atualizar" antes de `fill(searchInput)` | `AttendanceTab.loadData` mount-only — não vê emp criado via SQL pós-mount |
| `37-create-user-e2e` `beforeAll` | Warmup completo: login admin → JWT custom → cria user `97000` real via edge fn | Cold-start residual `create-user` (>60s); warmup body vazio não força handler full |
| `37-create-user-e2e` describe + expects | timeout describe 60s→180s, expect 30s→60s | Camada extra de safety pra cold-start residual residual |

**Validação final:**
- Spec 40 isolado: 5/5 ✅ (era 2 failed antes do fix)
- Spec 37 isolado com warmup full: 5/5 ✅ em 27.1s (test 2: 4.5s, test 5: 6.4s)
- **Suite completa: 259 passed / 18 skipped / 0 failed em 19.3min** (era 255/18/4)

---

## 11. Sub-fase 14.10 — Mobile responsive E2E + Lighthouse audit

**Project mobile-pixel5** adicionado em `playwright.config.ts` (devices['Pixel 5'], 393×851, touch). Roda explicitamente via `--project=mobile-pixel5`. Default `chromium` continua único.

**Resultado subset mobile (14/31 passed, 17 regressões):**

| Spec | Pass/Total | Causa principal |
|---|---|---|
| `02-employee-clock` (/clock) | **9/9 ✅** | Público, já responsivo |
| `01-auth` | 3/6 | Badge `.first()` resolve elemento desktop hidden; logout sem aria-label |
| `35-mirror-mass-dialog` | 0/8 | TabNavigation colapsa em hamburger ☰ (Ponto invisível como botão) |
| `38-system-walkthrough` | 2/8 | Mesma causa |

**Lighthouse audit (dist build, desktop headless):**

| Categoria | Score |
|---|---|
| Performance | 86 ✅ |
| Accessibility | 75 ⚠️ |
| Best Practices | 100 ✅ |
| SEO | 100 ✅ |

Metrics: FCP/LCP 3.3s, TBT 0ms, CLS 0.

**Comando subset mobile (manual):**
```bash
npx playwright test --project=mobile-pixel5 --workers=1 --reporter=list \
  tests/01-auth.spec.ts tests/02-employee-clock.spec.ts
```

**Tech debt registrado:**
- 6.25 — UX mobile (TabNavigation + badges + logout icon-only)
- 6.26 — A11y 3 issues (sub 75→95+ em ~2-3h)
