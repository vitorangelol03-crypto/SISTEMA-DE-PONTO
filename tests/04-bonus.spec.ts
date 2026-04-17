import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';
import { cleanupAllTestArtifacts, readSuiteStart } from './cleanup';

/**
 * Testes do fluxo de Bonificações.
 * Mutam o banco: aplicam bônus e depois removem. Cada teste limpa seu estado.
 */

async function markFirstEmployeePresent(page: Page) {
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible();
  // Se já está presente, não faz nada. Se não, marca.
  const presenteBadge = firstRow.locator('span').filter({ hasText: /^Presente$/ });
  if ((await presenteBadge.count()) === 0) {
    const resetBtn = firstRow.getByRole('button', { name: /^Reset$/ });
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      await page.getByRole('button', { name: /Confirmar Reset/ }).click();
      await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();
    }
    await firstRow.getByRole('button', { name: /^Presente$/ }).click();
    await expect(firstRow.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible();
  }
}

async function applyBonus(page: Page, type: 'B' | 'C1' | 'C2', amount: string) {
  // Abre o modal
  await page.getByRole('button', { name: /^Bonificação$/ }).click();
  await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

  // Encontra o bloco do tipo via XPath: span "Tipo X" → sobe até a div container
  // do tipo → desce para o input number.
  const typeSpan = page.getByText(`Tipo ${type}`, { exact: true });
  const block = typeSpan.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
  const input = block.locator('input[type="number"]');
  await input.fill(amount);

  const applyBtn = page.getByRole('button', { name: `Aplicar ${type}`, exact: true });
  await expect(applyBtn).toBeEnabled({ timeout: 5_000 });
  await applyBtn.click();

  // Espera toast de sucesso
  await expect(page.getByText(new RegExp(`Bonificação ${type} aplicada com sucesso`))).toBeVisible({ timeout: 10_000 });

  // Fecha modal
  await page.getByRole('button', { name: /^Fechar$/ }).click();
  await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeHidden();
}

async function resetAllAttendance(page: Page) {
  const resetGeral = page.getByRole('button', { name: /^Reset Geral$/ });
  if (await resetGeral.isVisible().catch(() => false)) {
    await resetGeral.click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
    await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();
  }
}

async function removeAllBonuses(page: Page) {
  const removeBtn = page.getByRole('button', { name: /Remover Todas/ });
  if (await removeBtn.isVisible().catch(() => false)) {
    await removeBtn.click();
    await page.getByPlaceholder(/motivo da remoção/).fill('Limpeza automatizada dos testes Playwright');
    await page.getByRole('button', { name: /Confirmar Remoção em Massa/ }).click();
    await expect(page.getByRole('heading', { name: /Remover Todas as Bonificações/ })).toBeHidden({ timeout: 15_000 });
  }
}

test.describe('Bonificações (B / C1 / C2)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    await expect(page.getByRole('heading', { name: /Controle de Ponto/ })).toBeVisible();
    // Limpa bonificações de testes anteriores
    await removeAllBonuses(page);
  });

  test.afterEach(async ({ page }) => {
    // Garante limpeza final via UI (remove bonificações e reseta presença)
    await removeAllBonuses(page).catch(() => {});
    await resetAllAttendance(page).catch(() => {});
  });

  // Depois de TODOS os testes do arquivo: apaga os rastros que a UI não
  // consegue apagar sozinha — principalmente as linhas de auditoria em
  // `bonus_removals` criadas pelo "Remover Todas".
  test.afterAll(async () => {
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('modal de Bonificação abre com 3 campos (B, C1, C2)', async ({ page }) => {
    await markFirstEmployeePresent(page);
    await page.getByRole('button', { name: /^Bonificação$/ }).click();

    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();
    await expect(page.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(page.getByText('Tipo C1', { exact: true })).toBeVisible();
    await expect(page.getByText('Tipo C2', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar B', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar C1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar C2', exact: true })).toBeVisible();
  });

  test('aplicar B=10 faz aparecer card "Tipo B" com R$ 10,00', async ({ page }) => {
    await markFirstEmployeePresent(page);
    await applyBonus(page, 'B', '10');

    // Card "Bonificações Aplicadas" aparece com Tipo B
    const painelBonus = page.locator('div').filter({ hasText: /^Bonificações Aplicadas$/ }).first().locator('..');
    await expect(painelBonus.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(painelBonus.getByText(/R\$ 10\.00|R\$ 10,00/)).toBeVisible();
  });

  test('aplicar B=10, C1=15 e C2=5 → cards B/C1/C2 aparecem', async ({ page }) => {
    await markFirstEmployeePresent(page);

    await applyBonus(page, 'B', '10');
    await applyBonus(page, 'C1', '15');
    await applyBonus(page, 'C2', '5');

    await expect(page.getByText(/Bonificações Aplicadas/)).toBeVisible();

    // Os 3 tipos aparecem como "aplicados" no painel
    const painel = page.locator('div').filter({ hasText: /^Bonificações Aplicadas$/ }).first().locator('..');
    await expect(painel.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(painel.getByText('Tipo C1', { exact: true })).toBeVisible();
    await expect(painel.getByText('Tipo C2', { exact: true })).toBeVisible();

    // Valores (pode vir formatado com . ou ,)
    await expect(painel.getByText(/R\$ 10[.,]00/)).toBeVisible();
    await expect(painel.getByText(/R\$ 15[.,]00/)).toBeVisible();
    await expect(painel.getByText(/R\$ 5[.,]00/)).toBeVisible();
  });

  test('"Remover Todas" faz os cards desaparecerem', async ({ page }) => {
    await markFirstEmployeePresent(page);
    await applyBonus(page, 'B', '10');
    await expect(page.getByText(/Bonificações Aplicadas/)).toBeVisible();

    await removeAllBonuses(page);

    await expect(page.getByText(/Bonificações Aplicadas/)).toBeHidden();
  });

  test('Reset Geral do ponto remove bonificações também (regressão)', async ({ page }) => {
    await markFirstEmployeePresent(page);
    await applyBonus(page, 'B', '10');
    await expect(page.getByText(/Bonificações Aplicadas/)).toBeVisible();

    // Reset Geral
    await page.getByRole('button', { name: /^Reset Geral$/ }).click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
    await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();

    // O painel "Bonificações Aplicadas" precisa sumir
    await expect(page.getByText(/Bonificações Aplicadas/)).toBeHidden();
  });
});
