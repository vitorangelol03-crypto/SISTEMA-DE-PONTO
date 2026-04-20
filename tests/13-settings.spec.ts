import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * Módulo 11 — Configurações / Valores Padrão de Bonificação.
 *
 * Testes não destrutivos: lê valores atuais, altera levemente e restaura.
 * Só admin 9999 vê essa seção.
 */

test.describe('Configurações — Valores Padrão de Bonificação', () => {
  test('admin vê valores padrão B/C1/C2 preenchidos', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Configurações');

    await expect(page.getByRole('heading', { name: /Valores Padrão de Bonificação/ })).toBeVisible();
    await expect(page.getByText('Tipo B').first()).toBeVisible();
    await expect(page.getByText('Tipo C1').first()).toBeVisible();
    await expect(page.getByText('Tipo C2').first()).toBeVisible();

    const inputs = page.locator('input[type="number"]');
    expect(await inputs.nth(0).inputValue()).toMatch(/^\d+(\.\d+)?$/);
    expect(await inputs.nth(1).inputValue()).toMatch(/^\d+(\.\d+)?$/);
    expect(await inputs.nth(2).inputValue()).toMatch(/^\d+(\.\d+)?$/);
  });

  test('alterar valor B e restaurar (round-trip)', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Configurações');

    await expect(page.getByRole('heading', { name: /Valores Padrão de Bonificação/ })).toBeVisible();

    const input = page.locator('input[type="number"]').nth(0);
    const original = await input.inputValue();

    // Altera para 99.99
    await input.fill('99.99');
    const saveBtns = page.getByRole('button', { name: /^Salvar$/ });
    await saveBtns.first().click();
    await expect(page.getByText(/Valor padrão de B atualizado/).first()).toBeVisible({ timeout: 10_000 });

    // Restaura ao valor original
    await input.fill(original);
    await saveBtns.first().click();
    await expect(page.getByText(new RegExp(`atualizado para R\\$ ${original}`)).first()).toBeVisible({ timeout: 10_000 });
  });
});
