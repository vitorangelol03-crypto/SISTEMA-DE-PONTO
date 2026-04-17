import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';
import { cleanupAllTestArtifacts, readSuiteStart } from './cleanup';

/**
 * Testes do Controle de Ponto.
 *
 * Estes testes MUTAM o banco: marcam presença/falta e depois usam
 * o botão Reset para limpar. Rode num ambiente de teste.
 */
test.describe('Controle de Ponto', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    await expect(page.getByRole('heading', { name: /Controle de Ponto/ })).toBeVisible();
  });

  // Limpeza pós-suíte: remove qualquer attendance/bonus/payment/bonus_removal
  // deixado para trás, além dos funcionários PW Test.
  test.afterAll(async () => {
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('marcar Presente → status muda para "Presente" e contador incrementa', async ({ page }) => {
    // Localiza o card "Presentes" pela classe do fundo verde
    const presentesCard = page.locator('.bg-green-50').filter({
      has: page.getByText('Presentes', { exact: true }),
    }).first();
    const presentesCount = presentesCard.locator('.text-green-600').last();

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Reseta a primeira linha se já tem marcação
    const resetBtn = firstRow.getByRole('button', { name: /^Reset$/ });
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      await page.getByRole('button', { name: /Confirmar Reset/ }).click();
      await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();
    }

    // Lê contador DEPOIS do reset da linha (para refletir o novo baseline)
    await page.waitForTimeout(300);
    const initialCount = parseInt((await presentesCount.textContent())?.trim() ?? '0', 10);

    // Marca como Presente
    await firstRow.getByRole('button', { name: /^Presente$/ }).click();

    await expect(firstRow.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });

    await expect.poll(async () => {
      const txt = await presentesCount.textContent();
      return parseInt(txt?.trim() ?? '0', 10);
    }, { timeout: 10_000 }).toBe(initialCount + 1);

    // Cleanup
    await firstRow.getByRole('button', { name: /^Reset$/ }).click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
  });

  test('marcar Falta → status muda para "Falta"', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Limpa estado
    const resetBtn = firstRow.getByRole('button', { name: /^Reset$/ });
    if (await resetBtn.count() > 0 && await resetBtn.isVisible()) {
      await resetBtn.click();
      await page.getByRole('button', { name: /Confirmar Reset/ }).click();
      await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();
    }

    await firstRow.getByRole('button', { name: /^Falta$/ }).click();

    await expect(firstRow.locator('span').filter({ hasText: /^Falta$/ }).first()).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await firstRow.getByRole('button', { name: /^Reset$/ }).click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
  });

  test('navegar para data anterior carrega dados do dia', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    const initialDate = await dateInput.inputValue();

    await page.getByRole('button', { name: /Anterior/ }).click();

    const newDate = await dateInput.inputValue();
    expect(newDate).not.toBe(initialDate);
    expect(newDate < initialDate).toBe(true);
  });

  test('navegar para data seguinte funciona', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    // Vai pra ontem primeiro para permitir avançar
    await page.getByRole('button', { name: /Anterior/ }).click();
    const ontem = await dateInput.inputValue();

    // Pode haver 2 botões com seta — pega "Próximo" que aparece quando não é hoje
    const nextBtn = page.getByRole('button', { name: /Próximo/ });
    await nextBtn.click();

    const novoValor = await dateInput.inputValue();
    expect(novoValor).not.toBe(ontem);
    expect(novoValor > ontem).toBe(true);
  });

  test('campos de horário manual: botão 💾 desabilitado até preencher entrada+saída', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    const entryInput = firstRow.locator('input[type="time"]').first();
    const exitInput = firstRow.locator('input[type="time"]').nth(1);
    const saveBtn = firstRow.getByRole('button', { name: '💾' });

    await expect(saveBtn).toBeDisabled();

    await entryInput.fill('08:00');
    // Ainda faltando a saída
    await expect(saveBtn).toBeDisabled();

    await exitInput.fill('17:00');
    await expect(saveBtn).toBeEnabled();
  });
});
