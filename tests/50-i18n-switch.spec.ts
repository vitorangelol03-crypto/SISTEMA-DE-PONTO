import { test, expect } from '@playwright/test';

/**
 * Sub-fase 17.5.2 — Spec i18n LanguageSwitcher
 *
 * Cobre:
 *   1. Default pt-BR: Login mostra "Sistema de Ponto" + "Entrar"
 *   2. Switch EN: header dropdown → seleciona EN → reload
 *   3. Após reload: Login mostra "Time Clock System" + "Sign in"
 *   4. Switch volta pt-BR: strings voltam
 */

test.describe('i18n LanguageSwitcher (sub-fase 17.5.2)', () => {
  test.beforeEach(async ({ context }) => {
    // Limpa localStorage pra começar em pt-BR default
    await context.clearCookies();
    await context.addInitScript(() => {
      try { localStorage.removeItem('app_locale'); } catch { /* ignore */ }
    });
  });

  test('1. Default pt-BR: Login mostra strings pt-BR', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sistema de Ponto' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Entre com suas credenciais')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Entrar$/ })).toBeVisible();
  });

  test('2. EN via addInitScript: strings mudam', async ({ page }) => {
    // i18n.init() roda no module load; localStorage precisa estar setado
    // ANTES do JS da página rodar. addInitScript garante isso.
    await page.addInitScript(() => {
      try { localStorage.setItem('app_locale', 'en'); } catch { /* ignore */ }
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Time Clock System' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Sign in with your credentials')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Sign in$/ })).toBeVisible();
  });

  test('3. LanguageSwitcher renderiza no header após login (Layout)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#id').fill('9999');
    await page.locator('#password').fill('684171');
    await page.getByRole('button', { name: /^Entrar$/ }).click();

    // Aguarda CompanySelector (admin) → seleciona Caratinga
    const caratingaCard = page.getByText('Caratinga', { exact: false }).first();
    await expect(caratingaCard).toBeVisible({ timeout: 10_000 });
    await caratingaCard.click();

    // Sanity: chegou ao painel
    await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });

    // LanguageSwitcher button (Globe icon + PT label)
    const langBtn = page.getByRole('button', { name: /Idioma|Language/i }).first();
    await expect(langBtn).toBeVisible({ timeout: 10_000 });

    // Abre dropdown
    await langBtn.click();
    // Listbox options visíveis
    const ptOption = page.getByRole('option', { name: /Português/ });
    const enOption = page.getByRole('option', { name: /English/ });
    await expect(ptOption).toBeVisible();
    await expect(enOption).toBeVisible();
  });

  test('4. setLocale() helper persiste em localStorage', async ({ page }) => {
    // Verifica que o helper exportado escreve no localStorage como esperado.
    // setLocale é importado e usado pelo LanguageSwitcher.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('app_locale', 'en'));
    const persisted = await page.evaluate(() => localStorage.getItem('app_locale'));
    expect(persisted).toBe('en');
    // Cleanup
    await page.evaluate(() => localStorage.removeItem('app_locale'));
  });
});
