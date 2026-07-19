import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * Valida (com cliques reais) as melhorias de leitura da grade de Pagamentos Driver:
 *  - zebra striping: linhas alternam cor de fundo (branca / cinza claro);
 *  - coluna "Driver / Rota" grudada (position: sticky) ao rolar na horizontal.
 *
 * MODERNIZADO 2026-07-19: a versão antiga usava a grade REAL — quando o Victor
 * marcou "espelho conferido" (linha fica VERDE, sobrepondo a zebra) nas primeiras
 * linhas, a comparação quebrou. Agora roda numa QUINZENA DESCARTÁVEL recém-criada
 * (preload traz os drivers, nenhum com espelho conferido → zebra garantida) e a
 * exclui no fim.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzZebra ${RUN}`;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

async function deleteCurrentPeriod(page: Page): Promise<void> {
  const excluir = page.getByTitle('Excluir esta quinzena e seus lançamentos');
  if (!(await excluir.count())) {
    await page.getByRole('button', { name: /^Concluir$/ }).click();
    await expect(modal(page).getByText('Concluir pagamento')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Concluir sem abrir próxima' }).click();
    await expect(excluir).toBeVisible({ timeout: 15_000 });
  }
  await excluir.click();
  await expect(modal(page).getByText('Editar quinzena')).toBeVisible({ timeout: 10_000 });
  await modal(page).getByRole('button', { name: 'Excluir definitivamente' }).click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
}

test.describe('Pagamentos Driver — zebra + coluna grudada', () => {
  // O Vite faz cold-compile na 1ª navegação (WSL) — dá tempo pra ela sem virar sleep.
  test.use({ navigationTimeout: 120_000, actionTimeout: 30_000 });
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
    // sobras de quinzenas de teste
    for (let i = 0; i < 5; i++) {
      const sel = periodSelect(page, TEST_EMPLOYEE_NAME_PREFIX);
      if (!(await sel.count())) break;
      const leftover = sel.locator('option').filter({ hasText: TEST_EMPLOYEE_NAME_PREFIX }).first();
      const value = await leftover.getAttribute('value');
      if (!value) break;
      await sel.selectOption(value);
      await deleteCurrentPeriod(page);
    }
  });

  test('linhas alternam cor (zebra) e a 1ª coluna é sticky', async ({ page }) => {
    // Quinzena descartável: preload traz os drivers SEM nenhum espelho conferido.
    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
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

    // limpeza: exclui a quinzena descartável
    await deleteCurrentPeriod(page);
  });
});
