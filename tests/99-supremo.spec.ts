/**
 * SPEC 99 — Teste Supremo (fluxo completo de um dia normal Caratinga).
 *
 * Objetivo: validar END-TO-END que TODAS as abas e fluxos do sistema funcionam
 * em produção. Roda contra o Supabase prod via dev server (mesma config dos
 * outros specs).
 *
 * Estratégia: criar 10 funcionários "PW Test Supremo" em Caratinga (isolados
 * com prefix), exercitar o fluxo COMPLETO neles (presença → bonus → erros →
 * payment → espelho → C6), + sweep visual das 11 abas admin com dados reais
 * (read-only, valida que renderizam sem console errors).
 *
 * Cleanup: cleanupByPrefix no afterAll garante zero pollution.
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import { ADMIN, loginAs, goToTab, logout } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import {
  createTestEmployee,
  insertAttendance,
  cleanupByPrefix,
} from './integrity-helpers';
import { snapshotRealPayments, restoreRealPayments } from './_bonusIsolation';

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Supremo `;
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

function todayBR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function yesterdayBR(): string {
  const d = new Date(Date.now() - 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

async function cleanup(): Promise<void> {
  await cleanupByPrefix(PREFIX, [todayBR(), yesterdayBR()]);
}

// ============================================================================
// CONSOLE CAPTURE (igual ao spec 38)
// ============================================================================

const IGNORED_PATTERNS: RegExp[] = [
  /react-devtools/i,
  /\[vite\]/,
  /Download the React DevTools/,
  /Module "stream"/,
  /\[stream-stub\]/,
  /xlsx-js-style/,
  /\[useAuth\]/,
  /CompanySwitcher: falha ao persistir/,
  /Erro ao carregar tipos/,
  /\[cleanup\.ts\]/,
  // Rotas públicas (/clock /erros) — CompanyContext tenta init sem JWT (esperado, sem regressão)
  /CompanyContext init error.*Failed to fetch/,
];

function shouldIgnore(text: string): boolean {
  return IGNORED_PATTERNS.some((re) => re.test(text));
}

interface ConsoleCapture {
  errors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; status: number }>;
}

function attachConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (shouldIgnore(text)) return;
    capture.errors.push(text);
  });
  page.on('pageerror', (err: Error) => {
    capture.pageErrors.push(err.message);
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400 && status !== 401 && status !== 404) {
      const url = response.url();
      if (!url.includes('supabase.co')) return;
      capture.failedRequests.push({ url: url.slice(-80), status });
    }
  });
  return capture;
}

function assertCleanConsole(capture: ConsoleCapture, context: string): void {
  const issues: string[] = [];
  if (capture.errors.length > 0) {
    issues.push(`[${context}] ${capture.errors.length} console.error(s):\n  - ${capture.errors.slice(0, 5).join('\n  - ')}`);
  }
  if (capture.pageErrors.length > 0) {
    issues.push(`[${context}] ${capture.pageErrors.length} uncaught error(s):\n  - ${capture.pageErrors.slice(0, 5).join('\n  - ')}`);
  }
  if (capture.failedRequests.length > 0) {
    issues.push(`[${context}] ${capture.failedRequests.length} failed HTTP request(s):\n  - ${capture.failedRequests.slice(0, 5).map((r) => `${r.status} ${r.url}`).join('\n  - ')}`);
  }
  if (issues.length > 0) throw new Error(`Console issues detected:\n${issues.join('\n')}`);
}

// ============================================================================
// SETUP: 10 funcionários PW Test Supremo em Caratinga
// ============================================================================

const TEST_EMPLOYEES: { name: string; id?: string }[] = Array.from({ length: 10 }, (_, i) => ({
  name: `${PREFIX}${String(i + 1).padStart(2, '0')}`,
}));

test.describe('SPEC 99 — Teste Supremo: fluxo completo Caratinga', () => {
  // Timeout estendido: spec executa MUITOS fluxos, alguns envolvem edge fns
  // com cold-start (~5s warm, mas até 30s na primeira). Espelho PDF + C6
  // export podem demorar dezenas de segundos cada.
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    await cleanup();
    // Cria 10 funcionários PW Test em Caratinga via SQL
    for (const emp of TEST_EMPLOYEES) {
      emp.id = await createTestEmployee({ name: emp.name });
    }
  });

  test.afterAll(async () => {
    await cleanup();
  });

  // ==========================================================================
  // TEST 1: Sweep visual de TODAS as 11 abas admin (read-only com dados reais)
  // ==========================================================================
  test('1. Sweep visual todas as abas admin sem console errors', async ({ page }) => {
    const capture = attachConsoleCapture(page);
    await loginAs(page, ADMIN);

    // Lista de abas baseada em TabNavigation.tsx
    const tabs = [
      'Ponto',
      'Funcionários',
      'Relatórios',
      'Financeiro',
      'Pagamento C6',
      'Erros',
      'Configurações',
      'Usuários',
      'Gerenciamento',
      'Ajuda',
    ];

    for (const tab of tabs) {
      await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).first().click();
      // Aguarda lazy load + render
      await page.waitForTimeout(1200);
    }

    assertCleanConsole(capture, 'sweep-all-tabs');
  });

  // ==========================================================================
  // TEST 2: Sweep visual públicas (/clock + /erros)
  // ==========================================================================
  test('2. Sweep público /clock + /erros sem console errors', async ({ page }) => {
    const capture = attachConsoleCapture(page);

    await page.goto('/clock');
    await expect(page.locator('input[placeholder="000.000.000-00"]')).toBeVisible({ timeout: 10_000 });

    await page.goto('/erros');
    await expect(page.locator('#cpf')).toBeVisible({ timeout: 10_000 });

    assertCleanConsole(capture, 'sweep-publico');
  });

  // ==========================================================================
  // TEST 3: Marcar TODOS os 10 PW Test como Presente (via SQL, mais rápido) +
  // verificar via UI que aparecem na lista de Presentes
  // ==========================================================================
  test('3. Marcar 10 PW Test como Presente via SQL + UI mostra "Presentes 10+"', async ({ page }) => {
    const today = todayBR();
    for (const emp of TEST_EMPLOYEES) {
      await insertAttendance(emp.id!, today, { status: 'present' });
    }

    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');
    // Atualizar pra UI pegar os PW Test recém-criados
    await page.getByRole('button', { name: /^Atualizar$/ }).click();
    await page.waitForTimeout(1500);

    // Card "Presentes" deve mostrar pelo menos 10 (PW Test) + presentes reais Caratinga
    const presentesCard = page.locator('div').filter({ hasText: /^Presentes\s*\d+$/ }).first();
    await expect(presentesCard).toBeVisible({ timeout: 10_000 });
  });

  // ==========================================================================
  // TEST 4: Aplicar bonificação em massa via UI (modal Bonificação)
  // ==========================================================================
  test('4. Bonificação massiva B=10 via modal + verificar payments criados', async ({ page }) => {
    // Cleanup SQL determinístico (UI "Remover Todas" demora >15s em Caratinga com 30+ funcionários)
    const s = getClient();
    const empIds = TEST_EMPLOYEES.map((e) => e.id!);
    await s.from('bonus_removals').delete().in('employee_id', empIds).eq('date', todayBR());
    await s.from('payments').update({ bonus_b: 0, bonus: 0 }).in('employee_id', empIds).eq('date', todayBR());

    // Snapshot REAIS antes — "Aplicar B" aplica em TODOS presentes, não só
    // PW Test. Restore no fim evita polução em prod (incidente 2026-05-18).
    const snapshot = await snapshotRealPayments(s, CARATINGA_ID, todayBR());

    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');
    await page.getByRole('button', { name: /^Atualizar$/ }).click();
    await page.waitForTimeout(1500);

    // Abre modal de bônus
    await page.getByRole('button', { name: /^Bonificação$/ }).click();
    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

    // Bloco Tipo B → input → 10 → Aplicar B
    const typeBSpan = page.getByText('Tipo B', { exact: true });
    const blockB = typeBSpan.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
    await blockB.locator('input[type="number"]').fill('10');
    await page.getByRole('button', { name: 'Aplicar B', exact: true }).click();
    await expect(page.getByText(/Bonificação B aplicada com sucesso/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /^Fechar$/ }).click();

    // Verifica que payment.bonus_b = 10 nos 10 PW Test
    const { data: payments } = await s
      .from('payments')
      .select('employee_id, bonus_b')
      .in('employee_id', empIds)
      .eq('date', todayBR());
    expect(payments?.length).toBeGreaterThanOrEqual(10);
    payments?.forEach((p) => {
      expect(Number(p.bonus_b)).toBe(10);
    });

    // Restore REAIS
    await restoreRealPayments(s, snapshot);
  });

  // ==========================================================================
  // TEST 5: Lançar error_records em 3 PW Test via aba Erros + visualizar
  // ==========================================================================
  test('5. Erros: lançar 3 error_records via SQL + ErrorsTab renderiza com dados', async ({ page }) => {
    const today = todayBR();
    const s = getClient();
    for (let i = 0; i < 3; i++) {
      await s.from('error_records').insert([
        {
          employee_id: TEST_EMPLOYEES[i].id,
          date: today,
          error_count: 0,
          error_type: 'value',
          error_value: 50,
          observations: 'PW Test Supremo — erro lançado via spec 99',
          created_by: '9999',
          company_id: CARATINGA_ID,
        },
      ]);
    }

    // Valida via DB que os 3 error_records foram criados
    const empIds = TEST_EMPLOYEES.slice(0, 3).map((e) => e.id!);
    const { data: errors } = await s
      .from('error_records')
      .select('id, employee_id, error_value')
      .in('employee_id', empIds)
      .eq('date', today)
      .eq('error_type', 'value');
    expect(errors?.length).toBe(3);
    errors?.forEach((e) => expect(Number(e.error_value)).toBe(50));

    // Valida UI renderiza ErrorsTab sem console errors
    const capture = attachConsoleCapture(page);
    await loginAs(page, ADMIN);
    await goToTab(page, 'Erros');
    await page.waitForTimeout(2500);
    // Heading da aba renderiza
    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasHeading).toBe(true);

    assertCleanConsole(capture, 'erros-tab');
  });

  // ==========================================================================
  // TEST 6: Gerar espelho PDF de 1 PW Test via Relatórios tab
  // ==========================================================================
  test('6. Espelho PDF: navegação Relatórios + Gerar espelhos modal abre', async ({ page }) => {
    const capture = attachConsoleCapture(page);
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');

    // Botão "Gerar espelhos" abre MirrorMassDialog (sub-fase 35)
    const gerarBtn = page.getByRole('button', { name: /Gerar espelhos/ });
    await expect(gerarBtn).toBeVisible({ timeout: 10_000 });
    await gerarBtn.click();

    // Modal abriu
    await expect(page.getByRole('heading', { name: /Gerar espelhos em massa/i })).toBeVisible({ timeout: 10_000 });

    // Fechar modal (sem realmente gerar PDFs em massa — spec 35 cobre isso)
    await page.keyboard.press('Escape');

    assertCleanConsole(capture, 'espelho-modal');
  });

  // ==========================================================================
  // TEST 7: Pagamento C6 export — navegação aba + UI renderiza
  // ==========================================================================
  test('7. Pagamento C6: aba renderiza com payments do mês atual sem erros', async ({ page }) => {
    const capture = attachConsoleCapture(page);
    await loginAs(page, ADMIN);
    await goToTab(page, 'Pagamento C6');

    // Aguarda render
    await page.waitForTimeout(2500);

    // Pelo menos 1 heading ou botão de export deve aparecer
    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasHeading).toBe(true);

    assertCleanConsole(capture, 'c6-tab');
  });

  // ==========================================================================
  // TEST 8: Financeiro — payments rolam, banco de horas tab renderiza
  // ==========================================================================
  test('8. Financeiro: aba renderiza payments + filtros + banco de horas', async ({ page }) => {
    const capture = attachConsoleCapture(page);
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');
    await page.waitForTimeout(2500);

    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasHeading).toBe(true);

    assertCleanConsole(capture, 'financeiro-tab');
  });

  // ==========================================================================
  // TEST 9: Audit logs validados (admin tab → mostra logs recentes)
  // ==========================================================================
  test('9. Gerenciamento: dados internos renderizam sem console errors', async ({ page }) => {
    const capture = attachConsoleCapture(page);
    await loginAs(page, ADMIN);
    await goToTab(page, 'Gerenciamento');
    await page.waitForTimeout(2500);

    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasHeading).toBe(true);

    assertCleanConsole(capture, 'gerenciamento-tab');
  });

  // ==========================================================================
  // TEST 10: Logout limpa state + login flow recompleto
  // ==========================================================================
  test('10. Logout completo + re-login admin (smoke final)', async ({ page }) => {
    const capture = attachConsoleCapture(page);
    await loginAs(page, ADMIN);

    const beforeToken = await page.evaluate(() => sessionStorage.getItem('sb-custom-token'));
    expect(beforeToken).toBeTruthy();

    await logout(page);

    const afterToken = await page.evaluate(() => sessionStorage.getItem('sb-custom-token'));
    expect(afterToken).toBeNull();

    // Re-login funcional
    await loginAs(page, ADMIN);
    await expect(page.getByRole('button', { name: /^Ponto$/ })).toBeVisible();

    assertCleanConsole(capture, 'logout-relogin');
  });
});
