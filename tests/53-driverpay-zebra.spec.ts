import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';

/**
 * Valida (com cliques reais) as melhorias de leitura da grade de Pagamentos Driver:
 *  - zebra striping: linhas alternam cor de fundo (branca / cinza claro);
 *  - coluna "Driver / Rota" grudada (position: sticky) ao rolar na horizontal.
 * Roda contra a grade REAL de Caratinga (o mestre 2626 vê a aba com dados).
 */
test.describe('Pagamentos Driver — zebra + coluna grudada', () => {
  // O Vite faz cold-compile na 1ª navegação (WSL) — dá tempo pra ela sem virar sleep.
  test.use({ navigationTimeout: 120_000, actionTimeout: 30_000 });
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
  });

  test('linhas alternam cor (zebra) e a 1ª coluna é sticky', async ({ page }) => {
    await goToTab(page, 'Pagamentos Driver');
    // A grade real de Caratinga renderiza o rodapé "TOTAL GERAL".
    await expect(page.getByText(/TOTAL GERAL/i).first()).toBeVisible({ timeout: 25_000 });

    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    expect(await rows.count()).toBeGreaterThan(2);

    const firstCellBg = (i: number) =>
      rows.nth(i).locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const bg0 = await firstCellBg(0);
    const bg1 = await firstCellBg(1);
    const bg2 = await firstCellBg(2);

    // zebra: linhas vizinhas com cor diferente; a 3ª volta a bater com a 1ª.
    expect(bg0).not.toBe(bg1);
    expect(bg0).toBe(bg2);

    // coluna do nome grudada (sticky).
    const pos = await rows
      .first()
      .locator('td')
      .first()
      .evaluate((el) => getComputedStyle(el).position);
    expect(pos).toBe('sticky');

    await page.screenshot({ path: 'test-results/driverpay-zebra.png' });
    // eslint-disable-next-line no-console
    console.log(`ZEBRA OK — bg linha0=${bg0} linha1=${bg1} linha2=${bg2} · sticky=${pos}`);
  });
});
