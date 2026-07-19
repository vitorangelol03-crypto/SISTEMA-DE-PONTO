import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX, getClient } from './cleanup';

/**
 * E2E — as 4 implementações dos espelhos (2026-07-19, plano aprovado do Victor):
 *   1) destaque amarelo por plataforma (só onde a plataforma TEM pacotes);
 *   2) aviso de corte das notas (datas salvas automaticamente ao gerar);
 *   3) seção de descontos no espelho de grupo (driver/código/PNR-LOST/obs/valor);
 *   4) aviso por plataforma, grande/chamativo (acoplado ao destaque).
 *
 * Tudo com cliques reais em QUINZENA DESCARTÁVEL + driver/plataforma/grupo
 * próprios. A config de corte REAL da empresa é fotografada antes e RESTAURADA
 * no fim (risco nº 2 do plano: o teste salvaria datas de teste como padrão).
 * Prints salvos em test-results/prints-espelhos/ para aprovação visual.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Driver M60 ${RUN}`;
const PLAT = `${TEST_EMPLOYEE_NAME_PREFIX}PlatM60 ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzM60 ${RUN}`;
const GROUP = `${TEST_EMPLOYEE_NAME_PREFIX}GrupoM60 ${RUN}`;
const AVISO = 'Conferir os pacotes antes de assinar o recibo';

const modal = (page: Page): Locator => page.locator(MODAL).last();
const driverRow = (page: Page): Locator => page.locator('tbody tr').filter({ hasText: DRIVER }).first();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

let cutoffSnapshot: Record<string, unknown> | null = null;
let caratingaId = '';

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

test.describe('Pagamentos Driver — 4 features dos espelhos', () => {
  test.beforeAll(async () => {
    // Snapshot da config de corte REAL (restaurada no afterAll).
    const s = getClient();
    const { data: comps } = await s.from('companies').select('id, display_name, city').limit(100);
    const ct = (comps || []).find((c: Record<string, unknown>) =>
      [c.display_name, c.city].filter(Boolean).some((v) => String(v).toLowerCase().includes('caratinga')),
    );
    if (!ct) throw new Error('Caratinga não encontrada');
    caratingaId = (ct as { id: string }).id;
    const { data } = await s.from('driverpay_mirror_notice').select('*').eq('company_id', caratingaId).maybeSingle();
    cutoffSnapshot = (data as Record<string, unknown> | null) ?? null;
  });

  test.afterAll(async () => {
    // Restaura a config de corte real do Victor (ou remove a de teste).
    const s = getClient();
    if (cutoffSnapshot) {
      await s.from('driverpay_mirror_notice').upsert([cutoffSnapshot], { onConflict: 'company_id' });
    } else {
      await s.from('driverpay_mirror_notice').delete().eq('company_id', caratingaId);
    }
  });

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

  test('destaque + aviso + corte + descontos: individual e grupo, com prints', async ({ page }) => {
    test.setTimeout(300_000);

    // ── Massa: driver + plataforma (2,00 só pra ele) + quinzena + 10 pacotes ──
    await page.getByRole('button', { name: /Novo driver/ }).click();
    await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
    await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota M60');
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

    // ── Feature 1+4: DESTACAR a plataforma + escrever o AVISO (cliques reais) ──
    const platRowM = modal(page)
      .locator('div')
      .filter({ has: page.getByText(PLAT, { exact: true }) })
      .filter({ has: page.getByTitle('Editar plataforma') })
      .last();
    await platRowM.getByTitle('Editar plataforma').click();
    await modal(page)
      .locator('label')
      .filter({ hasText: 'Destacar no espelho' })
      .locator('input[type="checkbox"]')
      .check();
    await modal(page).getByPlaceholder(/Conferir os pacotes da SHOPEE/).fill(AVISO);
    await modal(page).getByRole('button', { name: 'Salvar' }).click();
    await expect(modal(page).getByText('🟡 espelho').first()).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // quinzena + pacotes
    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

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

    // ── Feature 3 (massa): desconto PNR no driver ──
    await driverRow(page).getByTitle('Lançar desconto').click();
    await expect(modal(page).getByText('Descontos')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder('0,00').first().fill('5,00');
    await modal(page).getByPlaceholder(/741412525252/).fill('PWPKG60');
    await modal(page).getByPlaceholder('Motivo do desconto').fill('caixa violada');
    await modal(page).getByRole('button', { name: 'PNR', exact: true }).click();
    await modal(page).getByRole('button', { name: 'Lançar desconto' }).click();
    await expect(modal(page).getByText('PWPKG60')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // ── ESPELHO INDIVIDUAL: corte + destaque + aviso, na prévia e no PDF ──
    await driverRow(page).getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByText('Espelho individual')).toBeVisible({ timeout: 10_000 });
    // Feature 2: preencher o corte (salva ao gerar)
    await modal(page).getByPlaceholder('14:00').fill('23:59');
    await modal(page).getByPlaceholder('20/07').fill('31/12');
    await modal(page).getByPlaceholder('27/07').fill('05/01');
    // prévia ao vivo: faixa de corte + aviso da plataforma + linha destacada
    await expect(modal(page).getByText(/as notas deverão ser enviadas até as/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText(/23:59H do dia 31\/12/).first()).toBeVisible();
    await expect(modal(page).getByText(new RegExp(`AVISO ${TEST_EMPLOYEE_NAME_PREFIX.trim().toUpperCase()}`, 'i')).first())
      .toBeVisible();
    await expect(modal(page).getByText(AVISO).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/prints-espelhos/01-individual-previa.png', fullPage: false });

    const dl1 = page.waitForEvent('download', { timeout: 30_000 });
    await modal(page).getByRole('button', { name: 'Gerar PDF' }).click();
    const pdf1 = await dl1;
    expect(pdf1.suggestedFilename()).toMatch(/^espelho-driver-.*\.pdf$/);
    await pdf1.saveAs(`test-results/prints-espelhos/espelho-individual-${RUN}.pdf`);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ── Feature 2 (prova do AUTO-SAVE): reabrir → campos vêm preenchidos ──
    await driverRow(page).getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByText('Espelho individual')).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByPlaceholder('14:00')).toHaveValue('23:59', { timeout: 10_000 });
    await expect(modal(page).getByPlaceholder('20/07')).toHaveValue('31/12');
    await expect(modal(page).getByPlaceholder('27/07')).toHaveValue('05/01');
    await modal(page).getByRole('button', { name: /Fechar/ }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // ── ESPELHO DE GRUPO: descontos + corte + aviso ──
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

    // visão Grupos → Espelho do grupo
    await page.getByRole('button', { name: /^Grupos$/ }).click();
    const groupHeader = page.locator('summary').filter({ hasText: GROUP }).first();
    await expect(groupHeader).toBeVisible({ timeout: 10_000 });
    await groupHeader.getByRole('button', { name: /Espelho do grupo/ }).click();
    await expect(modal(page).getByText(`Espelho do grupo — ${GROUP}`)).toBeVisible({ timeout: 10_000 });
    // corte veio salvo; seção de descontos do grupo com código+PNR+obs+valor+driver
    await expect(modal(page).getByText(/23:59H do dia 31\/12/).first()).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText('Descontos do grupo')).toBeVisible();
    await expect(modal(page).getByText('PWPKG60')).toBeVisible();
    await expect(modal(page).getByText('PNR', { exact: true }).first()).toBeVisible();
    await expect(modal(page).getByText('caixa violada')).toBeVisible();
    await expect(modal(page).getByText(AVISO).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/prints-espelhos/02-grupo-previa.png', fullPage: false });

    const dl2 = page.waitForEvent('download', { timeout: 30_000 });
    await modal(page).getByRole('button', { name: 'Gerar PDF' }).click();
    const pdf2 = await dl2;
    expect(pdf2.suggestedFilename()).toMatch(/^espelho-grupo-.*\.pdf$/);
    await pdf2.saveAs(`test-results/prints-espelhos/espelho-grupo-${RUN}.pdf`);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ── REGRA DE PRESENÇA: espelho de um driver SEM a plataforma → sem aviso ──
    await page.getByRole('button', { name: /^Lista$/ }).click();
    await page.getByPlaceholder(/Nome do driver/).fill('');
    const otherRow = page
      .locator('tbody tr')
      .filter({ hasNotText: DRIVER })
      .filter({ has: page.getByTitle('Ver / gerar espelho') })
      .first();
    await expect(otherRow).toBeVisible({ timeout: 10_000 });
    await otherRow.getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByText('Espelho individual')).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText(AVISO)).toHaveCount(0); // sem pacotes da PW → sem aviso
    await modal(page).getByRole('button', { name: /Fechar/ }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

    // ── limpeza: grupo + quinzena (driver/plataforma varridos pela limpeza global) ──
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    const delCard = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await delCard.getByTitle('Excluir grupo').click();
    await expect(delCard).toHaveCount(0, { timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
    await deleteCurrentPeriod(page);
  });
});
