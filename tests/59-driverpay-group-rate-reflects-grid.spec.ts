import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — regressão do relato por áudio (2026-07-18): usuário alterava o preço,
 * a CONFIG ficava certa, mas a página inicial (grade) e o espelho/PDF ficavam
 * no valor velho. Causa: "Aplicar" do grupo só gravava a config e não refletia
 * nos pacotes já lançados da quinzena aberta.
 *
 * Prova com cliques reais (quinzena descartável):
 *   lança 10 pacotes a R$ 2,00 → aplica R$ 3,00 pelo grupo →
 *   a grade mostra R$ 3,00 e o total vira R$ 30,00 NA HORA (sem F5).
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Driver GR ${RUN}`;
const PLAT = `${TEST_EMPLOYEE_NAME_PREFIX}PlatGR ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzGR ${RUN}`;
const GROUP = `${TEST_EMPLOYEE_NAME_PREFIX}GrupoGR ${RUN}`;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const driverRow = (page: Page): Locator => page.locator('tbody tr').filter({ hasText: DRIVER }).first();
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

test.describe('Pagamentos Driver — Aplicar do grupo reflete na grade lançada', () => {
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

  test('lança a 2,00 → grupo aplica 3,00 → grade e total mudam na hora', async ({ page }) => {
    test.setTimeout(240_000);

    // driver + plataforma (2,00 só pra ele) + quinzena de teste
    await page.getByRole('button', { name: /Novo driver/ }).click();
    await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
    await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota GR');
    await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

    await page.getByRole('button', { name: /Adicionar plataforma/ }).first().click();
    await expect(modal(page).getByText('Plataformas ativas')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder(/Ex\.: Shopee, Mercado Livre/).fill(PLAT);
    await modal(page).locator('input[inputmode="decimal"]').last().fill('2,00');
    await modal(page).getByRole('button', { name: /Só um driver/ }).click();
    const opt = modal(page).locator('select option').filter({ hasText: DRIVER }).first();
    await expect(opt).toBeAttached({ timeout: 10_000 });
    await modal(page).locator('select').selectOption((await opt.getAttribute('value'))!);
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

    // lança 10 pacotes na plataforma de teste (snapshot fica 2,00 → R$ 20,00)
    await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
    await expect(driverRow(page)).toBeVisible({ timeout: 10_000 });
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
    const pkgInput = driverRow(page).locator('td').nth(platIdx).locator('input').first();
    await pkgInput.fill('10');
    await pkgInput.blur();
    await expect(driverRow(page)).toContainText('R$ 20,00', { timeout: 10_000 });

    // grupo com o driver → Aplicar R$ 3,00
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    await modal(page).getByPlaceholder(/Nome do grupo/).fill(GROUP);
    await modal(page).getByRole('button', { name: /^Criar$/ }).click();
    const card = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByTitle('Membros').click();
    await card.getByPlaceholder(/Buscar driver/).fill(DRIVER);
    const row = card.locator('label').filter({ hasText: DRIVER }).first();
    await row.locator('input[type="checkbox"]').click();
    await expect(row.locator('input[type="checkbox"]')).toBeChecked({ timeout: 10_000 });
    await card.getByPlaceholder('valor/pacote').fill('3,00');
    await card.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/Valor por pacote aplicado/)).toBeVisible({ timeout: 15_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // O CERNE: a grade reflete NA HORA — R$ 3,00 na coluna e total R$ 30,00
    await expect(driverRow(page)).toContainText('R$ 30,00', { timeout: 15_000 });
    await expect(driverRow(page).locator('td').nth(platIdx)).toContainText('R$ 3,00', { timeout: 10_000 });

    // limpeza: grupo e quinzena de teste (driver/plataforma varridos via SQL depois)
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    const delCard = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await delCard.getByTitle('Excluir grupo').click();
    await expect(delCard).toHaveCount(0, { timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await deleteCurrentPeriod(page);
  });
});
