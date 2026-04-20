import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * Módulo 10 — Aba Admin secreta.
 * A senha padrão do Admin é "Clayton2024" (configurada via admin_secret).
 * Se foi alterada, os testes de "senha correta" vão falhar — isso é esperado.
 */

const ADMIN_SECRET = 'Clayton2024';

test.describe('Aba Admin', () => {
  test('acessar aba Admin mostra tela de senha', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Admin');
    await expect(page.getByRole('heading', { name: /Acesso restrito/ })).toBeVisible();
    await expect(page.getByPlaceholder('Senha')).toBeVisible();
  });

  test('senha errada mostra "Senha incorreta"', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Admin');
    await page.getByPlaceholder('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: /^Entrar$/ }).click();
    await expect(page.getByText(/Senha incorreta/)).toBeVisible({ timeout: 10_000 });
  });

  test('senha correta abre painel com seções Geo/Fraudes/Bloqueios', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Admin');
    await page.getByPlaceholder('Senha').fill(ADMIN_SECRET);
    await page.getByRole('button', { name: /^Entrar$/ }).click();

    // Aguarda painel abrir — aparece alguma das headings das seções
    await expect(page.getByText(/Geolocalização|Geo Records|Registros Geográficos/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Tentativas Suspeitas|Fraude/i).first()).toBeVisible();
    await expect(page.getByText(/Bloqueios/i).first()).toBeVisible();
  });
});
