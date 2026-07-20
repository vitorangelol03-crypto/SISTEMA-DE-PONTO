import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — implementações dos espelhos de 2026-07-20 (plano aprovado do Victor):
 *   1) MULTI-ROTA: mais de uma rota com pacotes na MESMA plataforma sai uma linha
 *      POR ROTA no espelho, com a taxa real de cada rota — NUNCA taxa média
 *      (caso Fabricio: 2,00 e 1,50 não podem virar "1,86").
 *   2) VALOR SEPARADO: plataforma destacada com "Separar o valor do total" tem o
 *      valor numa faixa própria, FORA do TOTAL A RECEBER do espelho (individual
 *      e grupo); a grade do painel continua com o total cheio.
 *
 * Tudo com cliques reais em QUINZENA DESCARTÁVEL + driver/plataformas/grupo
 * próprios (prefixo PW Test → varridos pela limpeza global). Prints em
 * prints-espelhos/ na raiz (test-results/ é apagada a cada rodada).
 *
 * Números do cenário:
 *   PLAT A (destacada + separada): rota 1 = 10×2,00 = 20,00; rota 2 = 4×1,50 = 6,00
 *     → separado 26,00 (14 pacotes); média proibida seria 26/14 = "R$ 1,86".
 *   PLAT B (normal): rota 1 = 5×2,00 = 10,00 → TOTAL A RECEBER exibido no espelho.
 *   Grade do painel: total cheio = 36,00 (decisão do Victor: a tela não separa).
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Driver M61 ${RUN}`;
const PLAT_A = `${TEST_EMPLOYEE_NAME_PREFIX}PlatM61A ${RUN}`;
const PLAT_B = `${TEST_EMPLOYEE_NAME_PREFIX}PlatM61B ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzM61 ${RUN}`;
const GROUP = `${TEST_EMPLOYEE_NAME_PREFIX}GrupoM61 ${RUN}`;
const ROTA_1 = 'PW Rota M61';
const ROTA_2 = 'PW COLETA M61';

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

/** Cria uma plataforma "Só um driver" pelo modal Plataformas (já aberto). */
async function createPlatformForDriver(page: Page, name: string, rate: string): Promise<void> {
  await modal(page).getByPlaceholder(/Ex\.: Shopee, Mercado Livre/).fill(name);
  await modal(page).locator('input[inputmode="decimal"]').last().fill(rate);
  await modal(page).getByRole('button', { name: /Só um driver/ }).click();
  const opt = modal(page).locator('select option').filter({ hasText: DRIVER }).first();
  await expect(opt).toBeAttached({ timeout: 10_000 });
  await modal(page).locator('select').selectOption((await opt.getAttribute('value'))!);
  await modal(page).getByRole('button', { name: 'Adicionar plataforma' }).click();
  await expect(modal(page).getByText(name, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Abre a edição inline de uma plataforma no modal Plataformas (já aberto).
 * hasText (substring), não exact: com destaque ligado o span do nome ganha os
 * badges "🟡 espelho"/"💰 à parte" no texto e o match exato deixa de casar.
 */
async function startEditPlatform(page: Page, name: string): Promise<void> {
  const row = modal(page)
    .locator('div')
    .filter({ hasText: name })
    .filter({ has: page.getByTitle('Editar plataforma') })
    .last();
  await row.getByTitle('Editar plataforma').click();
}

test.describe('Pagamentos Driver — multi-rota sem média + valor separado do total', () => {
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

  test('linha por rota (sem média) + valor separado no individual e no grupo', async ({ page }) => {
    test.setTimeout(300_000);

    // ── Massa: driver + 2 plataformas (só pra ele) ──
    await page.getByRole('button', { name: /Novo driver/ }).click();
    await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
    await modal(page).getByPlaceholder('Ex.: Caratinga').fill(ROTA_1);
    await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

    await page.getByRole('button', { name: /Adicionar plataforma/ }).first().click();
    await expect(modal(page).getByText('Plataformas ativas')).toBeVisible({ timeout: 10_000 });
    await createPlatformForDriver(page, PLAT_A, '2,00');
    await createPlatformForDriver(page, PLAT_B, '2,00');

    // ── PLAT A: destacar + SEPARAR o valor do total (a caixinha nova) ──
    await startEditPlatform(page, PLAT_A);
    await modal(page)
      .locator('label')
      .filter({ hasText: 'Destacar no espelho' })
      .locator('input[type="checkbox"]')
      .check();
    await modal(page)
      .locator('label')
      .filter({ hasText: 'Separar o valor do total no espelho' })
      .locator('input[type="checkbox"]')
      .check();
    await modal(page).getByRole('button', { name: 'Salvar' }).click();
    await expect(modal(page).getByText('💰 à parte').first()).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // ── Quinzena + pacotes ──
    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
    await expect(driverRow(page)).toBeVisible({ timeout: 10_000 });

    // Índices das colunas das plataformas de teste no cabeçalho.
    const headers = page.locator('thead th');
    const nHeaders = await headers.count();
    let idxA = -1;
    let idxB = -1;
    for (let i = 0; i < nHeaders; i++) {
      const txt = await headers.nth(i).innerText();
      if (txt.includes(PLAT_A)) idxA = i;
      if (txt.includes(PLAT_B)) idxB = i;
    }
    expect(idxA, 'coluna da PLAT A').toBeGreaterThan(-1);
    expect(idxB, 'coluna da PLAT B').toBeGreaterThan(-1);

    // Rota 1: 10 pacotes PLAT A + 5 pacotes PLAT B (taxa padrão 2,00).
    const pkgA = driverRow(page).locator('td').nth(idxA).locator('input').first();
    await pkgA.fill('10');
    await pkgA.blur();
    await expect(driverRow(page)).toContainText('R$ 20,00', { timeout: 10_000 });
    const pkgB = driverRow(page).locator('td').nth(idxB).locator('input').first();
    await pkgB.fill('5');
    await pkgB.blur();
    await expect(driverRow(page)).toContainText('R$ 30,00', { timeout: 10_000 });

    // ── MULTI-ROTA: adiciona a rota 2 e lança 4 pacotes PLAT A a 1,50 ──
    await driverRow(page).getByRole('button', { name: /rota/ }).click();
    const cityInputs = page.getByPlaceholder('cidade');
    await expect(cityInputs).toHaveCount(2, { timeout: 10_000 });
    await cityInputs.nth(1).fill(ROTA_2);
    await cityInputs.nth(1).blur();

    // Sub-linha da rota 2: as sub-linhas de rota são os tr que contêm o input "cidade"
    // (na ordem das rotas). 1º td tem colSpan=2 → td da plataforma = índice do header - 1.
    const route2Row = page
      .locator('tbody tr')
      .filter({ has: page.locator('input[placeholder="cidade"]') })
      .nth(1);
    const r2PkgA = route2Row.locator('td').nth(idxA - 1).getByTitle('Pacotes desta rota');
    await r2PkgA.fill('4');
    await r2PkgA.blur();
    // Serializa os dois saves (anti-flake 20/07): espera o reload dos PACOTES
    // refletir na grade (4×2,00 provisório → 38,00) ANTES de digitar a taxa,
    // senão o reload atrasado engole a taxa recém-digitada.
    const mainRow = page.locator('tbody tr').filter({ hasText: DRIVER }).first();
    await expect(mainRow).toContainText('R$ 38,00', { timeout: 10_000 });
    const r2RateA = route2Row.locator('td').nth(idxA - 1).getByTitle('Valor por pacote desta rota');
    await r2RateA.fill('1,50');
    await r2RateA.blur();
    // Grade (decisão do Victor): total CHEIO = 20 + 6 + 10 = 36,00.
    await expect(mainRow).toContainText('R$ 36,00', { timeout: 10_000 });

    // ── ESPELHO INDIVIDUAL: linha por rota + valor separado, na prévia ──
    await mainRow.getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByText('Espelho individual')).toBeVisible({ timeout: 10_000 });

    // 1) Multi-rota: uma linha POR ROTA com a taxa real; a média "R$ 1,86" não existe.
    await expect(modal(page).getByText(`${PLAT_A} — ${ROTA_1}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText(`${PLAT_A} — ${ROTA_2}`).first()).toBeVisible();
    await expect(modal(page).getByText('R$ 1,50').first()).toBeVisible();
    await expect(modal(page).getByText('R$ 1,86')).toHaveCount(0);
    // PLAT B tem rota única → linha agregada, sem sufixo de rota.
    await expect(modal(page).getByText(`${PLAT_B} — ${ROTA_1}`)).toHaveCount(0);

    // 2) Valor separado: faixa própria, fora do total exibido.
    await expect(modal(page).getByText(/PAGO SEPARADO, FORA DO TOTAL ABAIXO/).first()).toBeVisible();
    await expect(
      modal(page).getByText(new RegExp(`TOTAL A RECEBER DE PACOTES \\(sem ${PLAT_A.trim().toUpperCase()}`)).first(),
    ).toBeVisible();
    await expect(
      modal(page).getByText(`TOTAL ${PLAT_A.toUpperCase()} (14 pacotes)`).first(),
    ).toBeVisible();
    await expect(modal(page).getByText('R$ 26,00').first()).toBeVisible();
    await expect(modal(page).getByText(/ESTE VALOR É PAGO SEPARADO/).first()).toBeVisible();
    const greenTotal = modal(page).locator('div.bg-green-700').filter({ hasText: 'TOTAL A RECEBER' }).first();
    await expect(greenTotal).toContainText('R$ 10,00');
    await page.screenshot({ path: 'prints-espelhos/03-individual-separado-previa.png', fullPage: false });

    const dl1 = page.waitForEvent('download', { timeout: 30_000 });
    await modal(page).getByRole('button', { name: 'Gerar PDF' }).click();
    const pdf1 = await dl1;
    expect(pdf1.suggestedFilename()).toMatch(/^espelho-driver-.*\.pdf$/);
    await pdf1.saveAs(`prints-espelhos/espelho-individual-separado-${RUN}.pdf`);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ── GRUPO: faixa "TOTAL ... DO GRUPO" e total verde sem a plataforma ──
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    await modal(page).getByPlaceholder(/Nome do grupo/).fill(GROUP);
    await modal(page).getByRole('button', { name: /^Criar$/ }).click();
    const card = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByTitle('Membros').click();
    await card.getByPlaceholder(/Buscar driver/).fill(DRIVER);
    const memberRow = card.locator('label').filter({ hasText: DRIVER }).first();
    await memberRow.locator('input[type="checkbox"]').click();
    await expect(memberRow.locator('input[type="checkbox"]')).toBeChecked({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    await page.getByRole('button', { name: /^Grupos$/ }).click();
    const groupHeader = page.locator('summary').filter({ hasText: GROUP }).first();
    await expect(groupHeader).toBeVisible({ timeout: 10_000 });
    await groupHeader.getByRole('button', { name: /Espelho do grupo/ }).click();
    await expect(modal(page).getByText(`Espelho do grupo — ${GROUP}`)).toBeVisible({ timeout: 10_000 });
    await expect(
      modal(page).getByText(`TOTAL ${PLAT_A.toUpperCase()} DO GRUPO (14 pacotes)`).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText(/ESTE VALOR É PAGO SEPARADO/).first()).toBeVisible();
    const greenGroup = modal(page).locator('div.bg-green-700').filter({ hasText: 'TOTAL —' }).first();
    await expect(greenGroup).toContainText('R$ 10,00');
    await page.screenshot({ path: 'prints-espelhos/04-grupo-separado-previa.png', fullPage: false });

    const dl2 = page.waitForEvent('download', { timeout: 30_000 });
    await modal(page).getByRole('button', { name: 'Gerar PDF' }).click();
    const pdf2 = await dl2;
    expect(pdf2.suggestedFilename()).toMatch(/^espelho-grupo-.*\.pdf$/);
    await pdf2.saveAs(`prints-espelhos/espelho-grupo-separado-${RUN}.pdf`);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ── DESLIGA a separação pela UI → espelho volta a somar tudo ──
    await page.getByRole('button', { name: /^Lista$/ }).click();
    await page.getByRole('button', { name: /Adicionar plataforma/ }).first().click();
    await expect(modal(page).getByText('Plataformas ativas')).toBeVisible({ timeout: 10_000 });
    await startEditPlatform(page, PLAT_A);
    await modal(page)
      .locator('label')
      .filter({ hasText: 'Separar o valor do total no espelho' })
      .locator('input[type="checkbox"]')
      .uncheck();
    await modal(page).getByRole('button', { name: 'Salvar' }).click();
    // Assert escopado à LINHA da PLAT A (não ao modal inteiro) e com folga de
    // tempo: o reload pós-save pode demorar sob carga (flake de 20/07).
    const rowA = modal(page)
      .locator('div')
      .filter({ hasText: PLAT_A })
      .filter({ has: page.getByTitle('Editar plataforma') })
      .last();
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    await expect(rowA.getByText('💰 à parte')).toHaveCount(0, { timeout: 15_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
    await expect(driverRow(page)).toBeVisible({ timeout: 10_000 });
    await driverRow(page).getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByText('Espelho individual')).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText(/PAGO SEPARADO/)).toHaveCount(0);
    // Multi-rota continua separando as linhas (independe do valor separado).
    await expect(modal(page).getByText(`${PLAT_A} — ${ROTA_2}`).first()).toBeVisible();
    const greenTotal2 = modal(page).locator('div.bg-green-700').filter({ hasText: 'TOTAL A RECEBER' }).first();
    await expect(greenTotal2).toContainText('R$ 36,00');
    await modal(page).getByRole('button', { name: /Fechar/ }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // ── limpeza: grupo + quinzena (driver/plataformas varridos pela limpeza global) ──
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    const delCard = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await delCard.getByTitle('Excluir grupo').click();
    await expect(delCard).toHaveCount(0, { timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await deleteCurrentPeriod(page);
  });
});
