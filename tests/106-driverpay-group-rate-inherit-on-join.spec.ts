import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — pedido do Victor (04/09/2026): quando um driver entra num grupo que JÁ tem
 * valor por pacote configurado, ele deve herdar essa taxa automaticamente — sem
 * precisar clicar em "Aplicar" de novo pra ele.
 *
 * Prova com cliques reais: cria grupo, entra com driver A, aplica R$ 3,00 (grava
 * default_rate do grupo) → entra com driver B DEPOIS, sem tocar em "Aplicar" →
 * lança pacotes pro driver B e confere que o total já usa R$ 3,00, não o default
 * da plataforma (R$ 2,00).
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER_A = `${TEST_EMPLOYEE_NAME_PREFIX}Driver GI-A ${RUN}`;
const DRIVER_B = `${TEST_EMPLOYEE_NAME_PREFIX}Driver GI-B ${RUN}`;
const PLAT = `${TEST_EMPLOYEE_NAME_PREFIX}PlatGI ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzGI ${RUN}`;
const GROUP = `${TEST_EMPLOYEE_NAME_PREFIX}GrupoGI ${RUN}`;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const driverRow = (page: Page, name: string): Locator => page.locator('tbody tr').filter({ hasText: name }).first();
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

test.describe('Pagamentos Driver — driver herda taxa do grupo ao entrar', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
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

  test('grupo já com taxa 3,00 → driver B entra depois → já herda 3,00 sem clicar Aplicar de novo', async ({ page }) => {
    test.setTimeout(240_000);

    // 2 drivers + 1 plataforma (default 2,00)
    for (const name of [DRIVER_A, DRIVER_B]) {
      await page.getByRole('button', { name: /Novo driver/ }).click();
      await modal(page).getByPlaceholder('Nome completo do driver').fill(name);
      await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota GI');
      await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });
    }

    await page.getByRole('button', { name: /Adicionar plataforma/ }).first().click();
    await expect(modal(page).getByText('Plataformas ativas')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder(/Ex\.: Shopee, Mercado Livre/).fill(PLAT);
    await modal(page).locator('input[inputmode="decimal"]').last().fill('2,00');
    await modal(page).getByRole('button', { name: 'Adicionar plataforma' }).click();
    await expect(modal(page).getByText(PLAT, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

    // Cria grupo, entra com o driver A, aplica 3,00 (grava default_rate do grupo)
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    await modal(page).getByPlaceholder(/Nome do grupo/).fill(GROUP);
    await modal(page).getByRole('button', { name: /^Criar$/ }).click();
    const card = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByTitle('Membros').click();
    await card.getByPlaceholder(/Buscar driver/).fill(DRIVER_A);
    const rowA = card.locator('label').filter({ hasText: DRIVER_A }).first();
    await rowA.locator('input[type="checkbox"]').click();
    await expect(rowA.locator('input[type="checkbox"]')).toBeChecked({ timeout: 10_000 });
    await card.getByPlaceholder('valor/pacote').fill('3,00');
    await card.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/Valor por pacote aplicado/)).toBeVisible({ timeout: 15_000 });

    // O CERNE: adiciona o driver B — SEM clicar Aplicar de novo
    await card.getByPlaceholder(/Buscar driver/).fill(DRIVER_B);
    const rowB = card.locator('label').filter({ hasText: DRIVER_B }).first();
    await rowB.locator('input[type="checkbox"]').click();
    await expect(rowB.locator('input[type="checkbox"]')).toBeChecked({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // Lança 5 pacotes pro driver B — se herdou 3,00, total = R$ 15,00
    // (se NÃO herdou, ficaria no default da plataforma, R$ 2,00 → R$ 10,00)
    await page.getByPlaceholder(/Nome do driver/).fill(DRIVER_B);
    await expect(driverRow(page, DRIVER_B)).toBeVisible({ timeout: 10_000 });
    const headers = page.locator('thead th');
    const nHeaders = await headers.count();
    let platIdx = -1;
    for (let i = 0; i < nHeaders; i++) {
      if ((await headers.nth(i).innerText()).includes(PLAT)) {
        platIdx = i;
        break;
      }
    }
    expect(platIdx, 'coluna da plataforma de teste').toBeGreaterThan(-1);
    const pkgInput = driverRow(page, DRIVER_B).locator('td').nth(platIdx).locator('input').first();
    await pkgInput.fill('5');
    await pkgInput.blur();
    await expect(driverRow(page, DRIVER_B)).toContainText('R$ 15,00', { timeout: 10_000 });
    await expect(driverRow(page, DRIVER_B).locator('td').nth(platIdx)).toContainText('R$ 3,00', { timeout: 10_000 });

    // limpeza
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    const delCard = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await delCard.getByTitle('Excluir grupo').click();
    await expect(delCard).toHaveCount(0, { timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await deleteCurrentPeriod(page);
  });
});
