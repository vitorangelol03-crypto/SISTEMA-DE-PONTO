import { test, expect } from '@playwright/test';
import { TEST_EMPLOYEE_CPF, TEST_EMPLOYEE_CPF_MASKED } from './helpers';

test.describe('Tela do Funcionário (/clock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clock');
    await expect(page.getByText('Registro de Ponto')).toBeVisible();
  });

  test('mostra tela de Registro de Ponto', async ({ page }) => {
    await expect(page.getByText('Digite seu CPF')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continuar/ })).toBeVisible();
  });

  test('letras no CPF são ignoradas (input filtra)', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill('abc123xyz456');
    // Apenas os números devem permanecer
    await expect(input).toHaveValue(/^[\d.\-]+$/);
    const value = await input.inputValue();
    expect(value.replace(/\D/g, '')).toBe('123456');
  });

  test('CPF incompleto (10 dígitos) → Continuar desabilitado', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill('1234567890');
    await expect(page.getByRole('button', { name: /Continuar/ })).toBeDisabled();
  });

  test('CPF completo (11 dígitos) → Continuar habilitado', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill(TEST_EMPLOYEE_CPF);
    await expect(page.getByRole('button', { name: /Continuar/ })).toBeEnabled();
  });

  test('CPF é formatado em tempo real com máscara', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill(TEST_EMPLOYEE_CPF);
    await expect(input).toHaveValue(TEST_EMPLOYEE_CPF_MASKED);
  });

  test('CPF inválido (não existe) → mensagem de erro', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill('00000000191'); // CPF válido em formato mas inexistente no banco
    await page.getByRole('button', { name: /Continuar/ }).click();
    await expect(page.getByText(/não encontrado/i)).toBeVisible({ timeout: 10_000 });
  });

  test('CPF válido pede PIN', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill(TEST_EMPLOYEE_CPF);
    await page.getByRole('button', { name: /Continuar/ }).click();
    await expect(page.getByText('Digite seu PIN para continuar')).toBeVisible({ timeout: 10_000 });
  });

  test('PIN errado → mensagem de erro', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill(TEST_EMPLOYEE_CPF);
    await page.getByRole('button', { name: /Continuar/ }).click();
    await expect(page.getByText('Digite seu PIN para continuar')).toBeVisible({ timeout: 10_000 });

    // Digita PIN errado (0000)
    for (const digit of '0000') {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: /Confirmar PIN/ }).click();
    await expect(page.getByText(/PIN incorreto/i)).toBeVisible({ timeout: 10_000 });
  });

  test('tela de erro tem botão "Tentar novamente" que volta para CPF', async ({ page }) => {
    const input = page.locator('input[placeholder="000.000.000-00"]');
    await input.fill('00000000191');
    await page.getByRole('button', { name: /Continuar/ }).click();
    await expect(page.getByText(/não encontrado/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Tentar novamente/ }).click();
    await expect(page.getByText('Digite seu CPF')).toBeVisible();
  });
});
