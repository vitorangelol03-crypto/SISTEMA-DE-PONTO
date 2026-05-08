import { Page, expect } from '@playwright/test';

export const ADMIN = { id: '9999', password: '684171' };
export const SUPERVISOR = { id: '01', password: '9098' };
export const TEST_EMPLOYEE_CPF = '12232625613';
export const TEST_EMPLOYEE_CPF_MASKED = '122.326.256-13';

/**
 * Faz login no painel de supervisor. Assume que estamos em `/`.
 *
 * Admin (id === '9999') passa por uma tela de seleção de empresa após o
 * login (sub-fase 1.10). Os testes default selecionam Caratinga.
 */
export async function loginAs(page: Page, user: { id: string; password: string }) {
  await page.goto('/');
  await page.locator('#id').fill(user.id);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Admin: lidar com CompanySelector — clica em Caratinga (empresa default dos testes).
  if (user.id === '9999') {
    const caratingaCard = page.getByText('Caratinga', { exact: false }).first();
    await expect(caratingaCard).toBeVisible({ timeout: 10_000 });
    await caratingaCard.click();
  }

  // Sanity check: chegou ao painel (aparece botão "Ponto" do TabNavigation).
  await expect(page.getByRole('button', { name: /Ponto/ })).toBeVisible({ timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /Sair/ }).first().click();
  await expect(page.locator('#id')).toBeVisible({ timeout: 10_000 });
}

export async function goToTab(page: Page, tabName: string) {
  await page.getByRole('button', { name: new RegExp(`^${tabName}$`) }).first().click();
}

/**
 * Troca empresa via dropdown CompanySwitcher (admin vê todas).
 * Aguarda o display_name no header refletir a nova empresa.
 *
 * Pré-requisito: admin logado E availableCompanies.length > 1
 * (caso contrário CompanySwitcher não renderiza no header).
 */
export async function switchCompany(page: Page, targetName: 'Caratinga' | 'Ponte Nova'): Promise<void> {
  const trigger = page.locator('button[aria-haspopup="listbox"]').first();
  await trigger.click();
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  await listbox.locator('button').filter({ hasText: targetName }).first().click();
  await expect(trigger).toContainText(new RegExp(targetName, 'i'), { timeout: 10_000 });
}
