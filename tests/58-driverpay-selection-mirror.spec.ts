import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — "Espelhos da seleção" (2026-07-18, decisões do Victor: 1A + 2A):
 * marcar QUAIS grupos e/ou drivers individuais geram espelho.
 *
 *   1) checkbox no cabeçalho do grupo (visão Grupos) marca o grupo inteiro;
 *   2) checkbox na linha (visão Lista) marca driver avulso — as visões compartilham;
 *   3) driver de grupo já marcado fica travado ("Já incluído pelo grupo selecionado");
 *   4) botão "Espelhos da seleção (N)" abre a prévia só com a seleção;
 *   5) Gerar PDF baixa DE VERDADE um arquivo espelhos-selecao-*.pdf;
 *   6) "Limpar" desmarca tudo e o botão desabilita.
 *
 * Roda numa QUINZENA DE TESTE descartável (preload dos drivers reais; seleção é
 * só de tela, nada grava no banco). No fim a quinzena é excluída pela UI.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzSel ${RUN}`;

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

test.describe('Pagamentos Driver — Espelhos da seleção', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
    // sobras de quinzenas de teste de runs anteriores
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

  test('marcar grupo + driver avulso, prévia correta, PDF baixado, limpar', async ({ page }) => {
    test.setTimeout(240_000);

    // ── Quinzena de teste (preload traz os drivers/grupos reais) ────────────
    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    const sel = periodSelect(page, PERIOD);
    await sel.selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

    // botão começa desabilitado (nada marcado)
    const selBtn = page.getByRole('button', { name: /Espelhos da seleção/ });
    await expect(selBtn).toBeDisabled();

    // ── 1. Visão Grupos: marca o PRIMEIRO grupo inteiro ─────────────────────
    await page.getByRole('button', { name: /^Grupos$/ }).click();
    const groupCheck = page.getByTitle('Selecionar o grupo inteiro para espelho').first();
    await expect(groupCheck).toBeVisible({ timeout: 15_000 });
    const firstSummary = page.locator('summary').first();
    const groupName = (await firstSummary.locator('span.font-semibold').first().innerText()).trim();
    await groupCheck.click();
    await expect(page.getByRole('button', { name: /Espelhos da seleção \(1\)/ })).toBeEnabled({ timeout: 10_000 });

    // ── 2. Visão Lista: driver de OUTRO grupo como avulso ───────────────────
    await page.getByRole('button', { name: /^Lista$/ }).click();
    const otherRow = page
      .locator('tbody tr')
      .filter({ hasNotText: groupName })
      .filter({ has: page.getByTitle('Selecionar para espelho') })
      .first();
    await expect(otherRow).toBeVisible({ timeout: 15_000 });
    const driverName = (await otherRow.locator('td').first().innerText()).split('\n')[0].trim();
    await otherRow.getByTitle('Selecionar para espelho').click();
    await expect(page.getByRole('button', { name: /Espelhos da seleção \(2\)/ })).toBeEnabled({ timeout: 10_000 });

    // ── 3. Driver do grupo marcado fica TRAVADO (não duplica) ───────────────
    const lockedRow = page
      .locator('tbody tr')
      .filter({ hasText: groupName })
      .filter({ has: page.getByTitle('Já incluído pelo grupo selecionado') })
      .first();
    await expect(lockedRow).toBeVisible({ timeout: 10_000 });
    await expect(lockedRow.getByTitle('Já incluído pelo grupo selecionado')).toBeDisabled();

    // ── 4. Prévia: só o que foi marcado ─────────────────────────────────────
    await page.getByRole('button', { name: /Espelhos da seleção \(2\)/ }).click();
    await expect(modal(page).getByText('Espelhos da seleção')).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText(/espelho\(s\) de grupo/)).toBeVisible();
    await expect(modal(page).getByText(/espelho\(s\) individual/)).toBeVisible();
    await expect(modal(page).getByText(groupName).first()).toBeVisible();
    await expect(modal(page).getByText(driverName).first()).toBeVisible();

    // ── 5. Gerar PDF: download REAL de espelhos-selecao-*.pdf ───────────────
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await modal(page).getByRole('button', { name: 'Gerar PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^espelhos-selecao-.*\.pdf$/);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ── 6. Limpar: desmarca tudo e desabilita o botão ───────────────────────
    await page.getByRole('button', { name: /^Limpar$/ }).click();
    await expect(page.getByRole('button', { name: /Espelhos da seleção$/ })).toBeDisabled({ timeout: 10_000 });

    // ── Limpeza: exclui a quinzena de teste ─────────────────────────────────
    await deleteCurrentPeriod(page);
    await expect(page.locator('select').filter({ hasText: PERIOD })).toHaveCount(0, { timeout: 10_000 });
  });
});
