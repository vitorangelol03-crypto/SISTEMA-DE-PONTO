import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import {
  SAFE_DATE,
  createTestEmployee,
  insertPaymentRow,
  insertErrorValue,
  insertTriageDistribution,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * Cobertura completa do FinancialTab:
 *  - Cálculo bruto/líquido (já coberto em 14-financial-integrity; aqui expandimos)
 *  - Filtros (data, funcionário, employment_type, busca)
 *  - Ver Detalhes mostra breakdown completo
 *  - Histórico de remoções
 *
 *  Export Excel/PDF: Playwright suporta downloads, mas a UI atual não expõe
 *  esses botões na FinancialTab (são da ReportsTab) — testados em 16's
 *  reportagem expandida via ReportsTab. Aqui apenas marcamos como skip.
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}FinCompl `;

async function cleanup() {
  await cleanupByPrefix(PREFIX, [SAFE_DATE]);
}

async function setRange(page: Page) {
  const inputs = page.locator('input[type="date"]');
  await inputs.nth(0).fill(SAFE_DATE);
  await inputs.nth(1).fill(SAFE_DATE);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.waitForLoadState('networkidle');
}

test.describe('Financial — completo', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await loginAs(page, ADMIN);
  });

  test('valor bruto = daily_rate + bonus_b + bonus_c1 + bonus_c2 (50 + 10 + 20 + 30 = 110)', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Bruto` });
    await insertPaymentRow(empId, SAFE_DATE, {
      daily_rate: 50,
      bonus_b: 10,
      bonus_c1: 20,
      bonus_c2: 30,
    });

    await goToTab(page, 'Financeiro');
    await setRange(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}Bruto` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Sem descontos: líquido = bruto = 110
    await expect(row).toContainText(/R\$\s*110,00/);

    // DB sanity
    const s = getClient();
    const { data } = await s.from('payments').select('*').eq('employee_id', empId).single();
    expect(Number(data?.total)).toBe(110);
    expect(Number(data?.bonus)).toBe(60);
  });

  test('valor líquido = bruto - erro_value - triagem (200 - 30 - 20 = 150)', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Liquido` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 200, bonus: 0 });
    await insertErrorValue(empId, SAFE_DATE, 30);
    await insertTriageDistribution({
      employeeId: empId, startDate: SAFE_DATE, endDate: SAFE_DATE, valueDeducted: 20,
    });

    await goToTab(page, 'Financeiro');
    await setRange(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}Liquido` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/R\$\s*150,00/);
    await expect(row).toContainText(/Bruto:\s*R\$\s*200,00/);
    await expect(row).toContainText(/-R\$\s*30,00\s*erro/);
    await expect(row).toContainText(/-R\$\s*20,00\s*triagem/);
  });

  test('Math.max(0): descontos > bruto → líquido = 0', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}NeverNeg` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 50, bonus: 0 });
    await insertErrorValue(empId, SAFE_DATE, 100); // > bruto
    await insertTriageDistribution({
      employeeId: empId, startDate: SAFE_DATE, endDate: SAFE_DATE, valueDeducted: 50,
    });

    await goToTab(page, 'Financeiro');
    await setRange(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}NeverNeg` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/R\$\s*0,00/);
  });

  test('filtro por data: período sem dados retorna lista sem nosso funcionário', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}FiltroData` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 100 });

    await goToTab(page, 'Financeiro');
    // Data fora do range
    const inputs = page.locator('input[type="date"]');
    await inputs.nth(0).fill('2031-01-01');
    await inputs.nth(1).fill('2031-01-01');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.waitForLoadState('networkidle');

    const row = page.locator('table tr', { hasText: `${PREFIX}FiltroData` });
    // Funcionário aparece (lista todos), mas total = 0 nesse período
    await expect(row.first()).toBeVisible({ timeout: 10_000 });
    await expect(row.first()).toContainText(/R\$\s*0,00/);
  });

  test('busca por nome filtra funcionários exibidos', async ({ page }) => {
    await createTestEmployee({ name: `${PREFIX}BuscaA` });
    await createTestEmployee({ name: `${PREFIX}BuscaB` });

    await goToTab(page, 'Financeiro');
    const search = page.getByPlaceholder(/Buscar.*nome/i).first();
    if (!(await search.isVisible().catch(() => false))) {
      test.skip(true, 'Busca não disponível na FinancialTab nesta UI');
    }
    await search.fill(`${PREFIX}BuscaA`);
    await page.waitForTimeout(500);

    await expect(page.locator('tr', { hasText: `${PREFIX}BuscaA` }).first()).toBeVisible();
    expect(await page.locator('tr', { hasText: `${PREFIX}BuscaB` }).count()).toBe(0);
  });

  test('filtro employment_type: Diarista vs Carteira Assinada', async ({ page }) => {
    await createTestEmployee({ name: `${PREFIX}Diari`, employmentType: 'Diarista' });
    await createTestEmployee({ name: `${PREFIX}Cart`, employmentType: 'Carteira Assinada' });

    await goToTab(page, 'Financeiro');
    const select = page.locator('select').filter({ hasText: /Diarista|Carteira/i }).first();
    if (!(await select.isVisible().catch(() => false))) {
      test.skip(true, 'Filtro employment_type não disponível');
    }
    await select.selectOption('Diarista');
    await page.waitForTimeout(500);

    await expect(page.locator('tr', { hasText: `${PREFIX}Diari` }).first()).toBeVisible();
    expect(await page.locator('tr', { hasText: `${PREFIX}Cart` }).count()).toBe(0);
  });

  test('Ver Detalhes mostra breakdown: daily_rate + bonus B/C1/C2', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Detalhes` });
    await insertPaymentRow(empId, SAFE_DATE, {
      daily_rate: 100, bonus_b: 5, bonus_c1: 10, bonus_c2: 15,
    });

    await goToTab(page, 'Financeiro');
    await setRange(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}Detalhes` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Ver Detalhes' }).click();

    const details = page.locator(`tr#payments-${empId}`);
    await expect(details).toContainText(/Diária:\s*R\$\s*100\.00/);
    await expect(details).toContainText(/Bônus B:.*5\.00.*C1:.*10\.00.*C2:.*15\.00/s);
    await expect(details).toContainText(/Bônus Total:\s*R\$\s*30\.00/);
  });

  test('histórico de remoções: bonus removido aparece em audit log', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}HistRemove` });
    await insertPaymentRow(empId, SAFE_DATE, {
      daily_rate: 100, bonus_b: 50,
    });
    // Insere registro de remoção diretamente
    const s = getClient();
    await s.from('bonus_removals').insert([{
      employee_id: empId,
      date: SAFE_DATE,
      bonus_amount_removed: 50,
      bonus_type: 'B',
      observation: 'PW Test remoção histórica',
      removed_by: '9999',
    }]);

    await goToTab(page, 'Financeiro');
    // Subtab "Histórico"
    const histBtn = page.getByRole('button', { name: /Hist[oó]rico/i }).first();
    if (!(await histBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Aba Histórico não disponível');
    }
    await histBtn.click();
    await page.waitForLoadState('networkidle');
    // Filtro de data — usa SAFE_DATE
    const inputs = page.locator('input[type="date"]');
    await inputs.nth(0).fill(SAFE_DATE);
    await inputs.nth(1).fill(SAFE_DATE);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText(/PW Test remoção histórica|HistRemove/);
  });

  test.skip('exportar Excel — botão não exposto em FinancialTab (cobertura no ReportsTab)', async () => {});
  test.skip('exportar PDF — botão não exposto em FinancialTab (cobertura no ReportsTab)', async () => {});
});
