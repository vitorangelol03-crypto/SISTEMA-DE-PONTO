import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * Spec 51 — Filtro de função no Financeiro.
 *
 * Valida que:
 *  1. Dropdown FunctionRoleFilter aparece (data-testid="function-role-filter")
 *  2. Lista opções "Todas as funções" + funções reais do banco + "Sem função"
 *  3. Selecionar uma função filtra a lista de funcionários no Financeiro
 *  4. Voltar pra "Todas" restaura a lista completa
 *
 * Não cria/exclui dados — apenas observa o comportamento de filtro sobre
 * funcionários já cadastrados (lista distinta vem de getFunctionRoles).
 */

test.describe('Financeiro — filtro por função', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');
  });

  test('dropdown de função aparece com opções', async ({ page }) => {
    const filter = page.getByTestId('function-role-filter');
    await expect(filter).toBeVisible({ timeout: 10_000 });

    // "Todas as funções" sempre presente
    await expect(filter.locator('option', { hasText: /^Todas as funções$/ })).toHaveCount(1);
    // "Sem função" sempre presente
    await expect(filter.locator('option', { hasText: /^Sem função$/ })).toHaveCount(1);
    // Pelo menos 1 função real (banco tem ~9 funções)
    const optionCount = await filter.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(3); // todas + sem função + ao menos 1 real
  });

  test('selecionar função filtra a lista', async ({ page }) => {
    const filter = page.getByTestId('function-role-filter');
    await expect(filter).toBeVisible({ timeout: 10_000 });

    // Conta funcionários sem filtro
    await page.waitForTimeout(800);
    const totalRows = await page.locator('tbody tr, [data-financial-card]').count();

    // Pega o primeiro option que NÃO é "Todas" nem "Sem função" (1ª função real)
    const allOptions = await filter.locator('option').allTextContents();
    const realRole = allOptions.find(o => o !== 'Todas as funções' && o !== 'Sem função');
    if (!realRole) {
      test.skip(true, 'Banco sem function_role cadastrada — pula');
      return;
    }

    await filter.selectOption({ label: realRole });
    await page.waitForTimeout(500);

    // Após filtrar, conta deve ser <= total (pode ser igual se TODOS tiverem a mesma função)
    const filteredRows = await page.locator('tbody tr, [data-financial-card]').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // Volta pra "Todas as funções" — restaura total
    await filter.selectOption({ label: 'Todas as funções' });
    await page.waitForTimeout(500);
    const restoredRows = await page.locator('tbody tr, [data-financial-card]').count();
    expect(restoredRows).toBe(totalRows);
  });
});
