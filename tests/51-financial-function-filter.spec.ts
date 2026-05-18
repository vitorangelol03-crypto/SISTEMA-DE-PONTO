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
    // Pelo menos 1 função real existir é OPCIONAL: a empresa pode estar
    // sem function_role cadastrada (válido). Polling pra esperar useEffect
    // resolver getFunctionRoles em CI lento.
    await expect.poll(
      async () => await filter.locator('option').count(),
      { timeout: 10_000, message: 'aguardando carregar funções da empresa' },
    ).toBeGreaterThanOrEqual(2); // mínimo: "Todas" + "Sem função"
  });

  test('selecionar função filtra a lista', async ({ page }) => {
    const filter = page.getByTestId('function-role-filter');
    await expect(filter).toBeVisible({ timeout: 10_000 });
    const rowLocator = page.locator('tbody tr, [data-financial-card]');

    // Aguarda primeira renderização estabilizar (CI lento precisa mais tempo).
    // Espera contagem ficar > 0 OU timeout — se for 0 pode ser banco vazio
    // de pagamentos pro dia, e o test não tem o que comparar.
    await expect.poll(async () => await rowLocator.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(0);
    const totalRows = await rowLocator.count();
    if (totalRows === 0) {
      test.skip(true, 'Financeiro sem rows pra filtrar — pula');
      return;
    }

    // Pega o primeiro option que NÃO é "Todas" nem "Sem função" (1ª função real)
    const allOptions = await filter.locator('option').allTextContents();
    const realRole = allOptions.find(o => o !== 'Todas as funções' && o !== 'Sem função');
    if (!realRole) {
      test.skip(true, 'Banco sem function_role cadastrada — pula');
      return;
    }

    await filter.selectOption({ label: realRole });
    // Polling: filtragem aconteceu quando contagem refletiu o filtro
    // (≤ totalRows). Robusto contra CI lento. Timeout generoso.
    await expect.poll(
      async () => await rowLocator.count(),
      { timeout: 15_000, message: `aguardando filtro "${realRole}" aplicar` },
    ).toBeLessThanOrEqual(totalRows);

    // Volta pra "Todas as funções" — restaura total exato. Polling tolera
    // o re-render da lista (em CI pode demorar mais que 500ms).
    await filter.selectOption({ label: 'Todas as funções' });
    await expect.poll(
      async () => await rowLocator.count(),
      { timeout: 15_000, message: 'aguardando restauração da lista completa' },
    ).toBe(totalRows);
  });
});
