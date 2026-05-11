import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import {
  createTestEmployee,
  insertPaymentRow,
  cleanupByPrefix,
  SAFE_DATE,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}07Fin `;

async function setRangeToSafeDate(page: Page) {
  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs.first()).toBeVisible({ timeout: 10_000 });
  await dateInputs.nth(0).fill(SAFE_DATE);
  await dateInputs.nth(1).fill(SAFE_DATE);
  await page.waitForLoadState('networkidle');
}

test.describe('Financeiro', () => {
  test.beforeAll(() => cleanupByPrefix(PREFIX));
  test.afterAll(() => cleanupByPrefix(PREFIX));

  test.beforeEach(async ({ page }) => {
    await cleanupByPrefix(PREFIX);
    await loginAs(page, ADMIN);
  });

  test('lista de Funcionários e Pagamentos carrega', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible();
    await expect(page.getByText(/Funcionários e Pagamentos/)).toBeVisible();
  });

  test('filtro por período atualiza a UI sem erro', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible();

    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible();

    const d = new Date();
    d.setDate(d.getDate() - 30);
    await dateInputs.first().fill(d.toISOString().slice(0, 10));

    await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible();
  });

  test('filtro por funcionário (dropdown) atualiza', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible();

    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    const options = await select.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1); // "Todos" + funcionários
  });

  test('Ver Detalhes — com pagamento expande card com Bônus B, C1, C2', async ({ page }) => {
    // Cria fixture ANTES de navegar — FinancialTab.loadEmployees roda no mount.
    const empId = await createTestEmployee({ name: `${PREFIX}ComPag` });
    await insertPaymentRow(empId, SAFE_DATE, {
      daily_rate: 100, bonus_b: 5, bonus_c1: 10, bonus_c2: 15,
    });

    await goToTab(page, 'Financeiro');
    await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible();
    await setRangeToSafeDate(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}ComPag` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Ver Detalhes' }).first().click();

    // Conteúdo está sempre no DOM (toggle apenas troca display:none).
    // Lemos via textContent pra evitar reset por re-render do React.
    const detailsRow = page.locator(`tr#payments-${empId}`);
    const rowText = await detailsRow.textContent({ timeout: 5_000 });
    expect(rowText ?? '').toMatch(/Bônus B:.*5\.00.*C1:.*10\.00.*C2:.*15\.00/s);
  });

  test('Ver Detalhes — sem pagamento mostra "Nenhum pagamento registrado"', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}SemPag` });
    // NÃO insere payment.

    await goToTab(page, 'Financeiro');
    await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible();
    await setRangeToSafeDate(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}SemPag` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Ver Detalhes' }).first().click();

    const detailsRow = page.locator(`tr#payments-${empId}`);
    const rowText = await detailsRow.textContent({ timeout: 5_000 });
    expect(rowText ?? '').toMatch(/Nenhum pagamento registrado/);
  });
});
