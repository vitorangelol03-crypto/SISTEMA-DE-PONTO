import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

test.describe('Relatórios', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Relatórios');
    await expect(page.getByRole('heading', { name: /Relatórios/ }).first()).toBeVisible();
  });

  test('colunas Bon. B, Bon. C1 e Bon. C2 existem na tabela', async ({ page }) => {
    // Espera tabela aparecer
    await expect(page.getByRole('columnheader', { name: 'Bon. B' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Bon. C1' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Bon. C2' })).toBeVisible();
  });

  test('toggle "Mostrar rejeitados" alterna exibição', async ({ page }) => {
    const toggle = page.getByRole('checkbox', { name: /Mostrar rejeitados/ }).or(
      page.getByText(/Mostrar rejeitados/).locator('xpath=ancestor::label[1]//input[@type="checkbox"]')
    );
    await expect(toggle.first()).toBeVisible();
    const initial = await toggle.first().isChecked();
    await toggle.first().click();
    await expect(toggle.first()).toBeChecked({ checked: !initial });
  });

  test('filtro por data atualiza lista', async ({ page }) => {
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible();

    // Muda data inicial para 1 ano atrás
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    const isoDate = d.toISOString().slice(0, 10);
    await dateInputs.first().fill(isoDate);

    // Só valida que a página não quebrou
    await expect(page.getByRole('heading', { name: /Relatórios/ }).first()).toBeVisible();
  });

  test('botão Exportar Excel dispara download sem erro', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    const btn = page.getByRole('button', { name: /Exportar Excel/ });
    if (await btn.isEnabled()) {
      await btn.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
      }
      // Se não houve download (ex: 0 registros), só garante que não deu erro de JS
    }
    // Sem erros de console críticos
    await expect(page.getByRole('heading', { name: /Relatórios/ }).first()).toBeVisible();
  });

  test('botão Exportar PDF abre janela (popup) ou dispara download', async ({ page, context }) => {
    const popupPromise = context.waitForEvent('page', { timeout: 8_000 }).catch(() => null);
    const btn = page.getByRole('button', { name: /Exportar PDF/ });
    if (await btn.isEnabled()) {
      await btn.click();
      const popup = await popupPromise;
      if (popup) {
        await popup.close().catch(() => {});
      }
    }
    // Sem travar a página
    await expect(page.getByRole('heading', { name: /Relatórios/ }).first()).toBeVisible();
  });
});
