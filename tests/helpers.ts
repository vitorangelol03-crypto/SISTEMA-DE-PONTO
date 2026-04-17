import { Page, expect } from '@playwright/test';

export const ADMIN = { id: '9999', password: '684171' };
export const SUPERVISOR = { id: '01', password: '9098' };
export const TEST_EMPLOYEE_CPF = '12232625613';
export const TEST_EMPLOYEE_CPF_MASKED = '122.326.256-13';

/**
 * Faz login no painel de supervisor. Assume que estamos em `/`.
 */
export async function loginAs(page: Page, user: { id: string; password: string }) {
  await page.goto('/');
  await page.locator('#id').fill(user.id);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Espera entrar no painel (aparece o título "Sistema de Ponto" no header + TabNavigation)
  await expect(page.getByRole('button', { name: /Ponto/ })).toBeVisible({ timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /Sair/ }).first().click();
  await expect(page.locator('#id')).toBeVisible({ timeout: 10_000 });
}

export async function goToTab(page: Page, tabName: string) {
  await page.getByRole('button', { name: new RegExp(`^${tabName}$`) }).first().click();
}
