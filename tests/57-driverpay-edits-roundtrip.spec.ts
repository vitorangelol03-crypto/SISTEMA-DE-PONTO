import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — TODAS as edições da aba Pagamentos Driver, com cliques reais (pedido
 * do Victor 2026-07-18, após o bug "Erro ao renomear grupo" em produção):
 *
 *   plataforma (criar/editar) · driver (criar/editar PIX+fone) · pacotes na grade
 *   · desconto PNR → editar → LOST → remover · vale (criar/editar/remover)
 *   · Zapex (valor unitário, lançar, editar, excluir) · NF e Espelho (toggles)
 *   · grupo (criar/RENOMEAR/excluir — a cena do bug) · rotas (adicionar/renomear/remover)
 *   · quinzena (renomear, concluir sem abrir próxima, reabrir, excluir)
 *   + regressão: sessão expirada tem que avisar "Sessão expirada — saia e faça login".
 *
 * Segurança de produção: TUDO acontece dentro de uma quinzena de teste descartável
 * ("PW Test Quinzena") com driver/plataforma/grupo "PW Test …". No fim a quinzena é
 * EXCLUÍDA pela própria UI (FK cascade limpa pacotes/descontos/vales/zapex).
 * A Quinzena Junho real não é tocada (verificado por SQL fora do teste).
 */

const MODAL = 'div.fixed.inset-0';
// Sufixo único por rodada: sobra de rodada anterior nunca colide com a atual.
// A varredura definitiva de qualquer 'PW Test%' é feita fora do teste (service role).
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Driver ${RUN}`;
const PLAT = `${TEST_EMPLOYEE_NAME_PREFIX}Plat ${RUN}`;
const PLAT2 = `${TEST_EMPLOYEE_NAME_PREFIX}PlatEd ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}Quinzena ${RUN}`;
const PERIOD2 = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzEd ${RUN}`;
const GROUP = `${TEST_EMPLOYEE_NAME_PREFIX}Grupo ${RUN}`;
const GROUP2 = `${TEST_EMPLOYEE_NAME_PREFIX}GrupoRen ${RUN}`;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const driverRow = (page: Page): Locator => page.locator('tbody tr').filter({ hasText: DRIVER }).first();

/** Select de período = o <select> que contém a opção com esse rótulo. */
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

async function closeModal(page: Page): Promise<void> {
  const fechar = modal(page).getByRole('button', { name: 'Fechar' });
  if (await fechar.count()) {
    await fechar.click();
  } else {
    await modal(page).getByRole('button').first().click(); // X do header
  }
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });
}

/**
 * Exclui a quinzena selecionada. Os botões Editar/Excluir só existem em quinzena
 * CONCLUÍDA (design do produto) — se estiver aberta, conclui primeiro.
 */
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

test.describe.configure({ mode: 'serial' });

test.describe('Pagamentos Driver — jornada completa de edições', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
  });

  test('todas as edições, numa quinzena de teste descartável', async ({ page }) => {
    test.setTimeout(300_000);

    // ── Limpeza de sobras de runs anteriores (qualquer quinzena PW Test) ────
    for (let i = 0; i < 5; i++) {
      const sel = periodSelect(page, TEST_EMPLOYEE_NAME_PREFIX);
      if (!(await sel.count())) break;
      const leftover = sel.locator('option').filter({ hasText: TEST_EMPLOYEE_NAME_PREFIX }).first();
      const value = await leftover.getAttribute('value');
      if (!value) break;
      await sel.selectOption(value);
      await deleteCurrentPeriod(page);
    }

    // ── 1. Driver novo ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: /Novo driver/ }).click();
    await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
    await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Teste');
    await modal(page).getByPlaceholder('CPF, e-mail, telefone…').fill('pw-original@teste.com');
    await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

    // ── 2. Plataforma: criar (só p/ o driver de teste) e EDITAR o nome ──────
    await page.getByRole('button', { name: /Adicionar plataforma/ }).first().click();
    await expect(modal(page).getByText('Plataformas ativas')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder(/Ex\.: Shopee, Mercado Livre/).fill(PLAT);
    await modal(page).locator('input[inputmode="decimal"]').last().fill('2,00');
    await modal(page).getByRole('button', { name: /Só um driver/ }).click();
    // a option mostra "nome — rota"; seleciona pelo value da option que contém o nome
    const driverOpt = modal(page).locator('select option').filter({ hasText: DRIVER }).first();
    await expect(driverOpt).toBeAttached({ timeout: 10_000 });
    await modal(page).locator('select').selectOption((await driverOpt.getAttribute('value'))!);
    await modal(page).getByRole('button', { name: 'Adicionar plataforma' }).click();
    await expect(modal(page).getByText(PLAT, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    // editar nome E taxa — escopado na LINHA da plataforma recém-criada
    const platRow = modal(page)
      .locator('div')
      .filter({ has: page.getByText(PLAT, { exact: true }) })
      .filter({ has: page.getByTitle('Editar plataforma') })
      .last();
    await platRow.getByTitle('Editar plataforma').click();
    await modal(page).getByPlaceholder('Nome').fill(PLAT2);
    await modal(page).locator('input[inputmode="decimal"]').first().fill('2,00');
    await modal(page).getByRole('button', { name: 'Salvar' }).click();
    await expect(modal(page).getByText(PLAT2)).toBeVisible({ timeout: 10_000 });
    await closeModal(page);

    // ── 3. Quinzena de teste ────────────────────────────────────────────────
    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    const sel = periodSelect(page, PERIOD);
    await expect(sel).toBeVisible({ timeout: 10_000 });
    await sel.selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

    // ── 4. Pacotes na grade (10 × R$2,00 = R$ 20,00) ───────────────────────
    await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
    await expect(driverRow(page)).toBeVisible({ timeout: 10_000 });
    // coluna da plataforma de teste = posição do cabeçalho com o nome dela
    const headers = page.locator('thead th');
    const nHeaders = await headers.count();
    let platIdx = -1;
    for (let i = 0; i < nHeaders; i++) {
      if ((await headers.nth(i).innerText()).includes(PLAT2)) {
        platIdx = i;
        break;
      }
    }
    expect(platIdx, 'coluna da plataforma de teste no cabeçalho').toBeGreaterThan(-1);
    const pkgInput = driverRow(page).locator('td').nth(platIdx).locator('input').first();
    await pkgInput.fill('10');
    await pkgInput.blur();
    await expect(driverRow(page)).toContainText('R$ 20,00', { timeout: 10_000 });

    // ── 5. Editar driver (PIX + telefone) ──────────────────────────────────
    await driverRow(page).getByTitle('Configurar valores / PIX').click();
    await expect(modal(page).getByText('Editar driver')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder('CPF, e-mail, telefone…').fill('pix-editado@teste.com');
    await modal(page).getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });
    // reabrir e conferir que gravou
    await driverRow(page).getByTitle('Configurar valores / PIX').click();
    await expect(modal(page).getByPlaceholder('CPF, e-mail, telefone…')).toHaveValue('pix-editado@teste.com', {
      timeout: 10_000,
    });
    await closeModal(page);

    // ── 6. Desconto: PNR → editar → LOST → remover ─────────────────────────
    await driverRow(page).getByTitle('Lançar desconto').click();
    await expect(modal(page).getByText('Descontos')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder('0,00').first().fill('5,00');
    await modal(page).getByPlaceholder(/741412525252/).fill('PWPKG123');
    await modal(page).getByPlaceholder('Motivo do desconto').fill('PW teste PNR');
    await modal(page).getByRole('button', { name: 'PNR', exact: true }).click();
    await modal(page).getByRole('button', { name: 'Lançar desconto' }).click();
    await expect(modal(page).getByText('PWPKG123')).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText('PNR', { exact: true }).first()).toBeVisible();
    // editar: vira LOST e muda o valor
    await modal(page).getByTitle('Editar desconto').first().click();
    await modal(page).getByPlaceholder('0,00').first().fill('7,50');
    await modal(page).getByRole('button', { name: 'LOST', exact: true }).click();
    await modal(page).getByRole('button', { name: 'Salvar edição' }).click();
    await expect(modal(page).getByText('LOST', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText(/7,50/).first()).toBeVisible();
    // remover
    await modal(page).getByTitle('Remover desconto').first().click();
    await expect(modal(page).getByText('PWPKG123')).toHaveCount(0, { timeout: 10_000 });
    await closeModal(page);

    // ── 7. Vale: criar → editar → remover ──────────────────────────────────
    await driverRow(page).getByTitle('Lançar vale').click();
    await expect(modal(page).getByText('Vales / adiantamentos')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder('0,00').first().fill('30,00');
    await modal(page).getByPlaceholder(/Adiantamento combustível/).fill('PW vale teste');
    await modal(page).getByRole('button', { name: 'Lançar vale' }).click();
    await expect(modal(page).getByText('PW vale teste')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByTitle('Editar vale').first().click();
    await modal(page).getByPlaceholder('0,00').first().fill('45,00');
    await modal(page).getByRole('button', { name: 'Salvar edição' }).click();
    await expect(modal(page).getByText(/45,00/).first()).toBeVisible({ timeout: 10_000 });
    await modal(page).getByTitle('Remover vale').first().click();
    await expect(modal(page).getByText('PW vale teste')).toHaveCount(0, { timeout: 10_000 });
    await closeModal(page);

    // ── 8. Zapex: valor unitário + lançar + editar (blur) + excluir ────────
    await driverRow(page).getByTitle('Lançar Zapex').click();
    await expect(modal(page).getByText('Zapex (ganho por item)')).toBeVisible({ timeout: 10_000 });
    // lançar o 1º item ANTES: o campo de valor unitário só aparece com ≥1 Zapex
    await modal(page).getByPlaceholder(/ZPX-000123/).fill('ZPX-PW-1');
    await modal(page).getByRole('button', { name: 'Lançar Zapex' }).click();
    const zapexRate = modal(page).getByPlaceholder('0,00').first();
    await expect(zapexRate).toBeVisible({ timeout: 10_000 });
    await zapexRate.fill('1,00');
    await zapexRate.blur();
    const zapexItem = modal(page).getByPlaceholder('Código *').last();
    await expect(zapexItem).toHaveValue('ZPX-PW-1', { timeout: 10_000 });
    // editar o código direto no item (salva no blur)
    await zapexItem.fill('ZPX-PW-2');
    await zapexItem.blur();
    await page.waitForTimeout(500); // autosave no blur
    await expect(zapexItem).toHaveValue('ZPX-PW-2');
    await modal(page).getByTitle('Excluir Zapex').first().click();
    await expect(modal(page).getByPlaceholder('Código *')).toHaveCount(0, { timeout: 10_000 });
    await closeModal(page);

    // ── 9. NF e Espelho conferido (toggles) ────────────────────────────────
    await driverRow(page).getByTitle('Marcar nota fiscal recebida').click();
    await expect(driverRow(page).getByTitle('Nota fiscal recebida')).toBeVisible({ timeout: 10_000 });
    await driverRow(page).getByTitle('Nota fiscal recebida').click();
    await expect(driverRow(page).getByTitle('Marcar nota fiscal recebida')).toBeVisible({ timeout: 10_000 });
    await driverRow(page).getByTitle('Marcar espelho conferido').click();
    await expect(driverRow(page).getByTitle('Espelho conferido (bate com a planilha)')).toBeVisible({
      timeout: 10_000,
    });
    await driverRow(page).getByTitle('Espelho conferido (bate com a planilha)').click();
    await expect(driverRow(page).getByTitle('Marcar espelho conferido')).toBeVisible({ timeout: 10_000 });

    // ── 10. Grupo: criar → RENOMEAR (a cena do bug de prod) → excluir ──────
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    await modal(page).getByPlaceholder(/Nome do grupo/).fill(GROUP);
    await modal(page).getByRole('button', { name: /^Criar$/ }).click();
    const groupCard = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP }).first();
    await expect(groupCard).toBeVisible({ timeout: 10_000 });
    await groupCard.getByTitle('Renomear grupo').click();
    // em modo edição o nome vira input e o texto some do card — âncora agora é o
    // único card com o botão verde de salvar
    const editCard = modal(page)
      .locator('div.border.rounded-lg.overflow-hidden')
      .filter({ has: page.locator('button.text-green-600') })
      .first();
    const nameEdit = editCard.locator('input[type="text"]').first();
    await expect(nameEdit).toHaveValue(GROUP, { timeout: 10_000 }); // é o input do nome mesmo
    await nameEdit.fill(GROUP2);
    await editCard.locator('button.text-green-600').click(); // salvar rename
    // toast aparece FORA do modal (Toaster é global)
    await expect(page.getByText('Grupo renomeado')).toBeVisible({ timeout: 10_000 });
    const renamed = modal(page).locator('div.border.rounded-lg.overflow-hidden').filter({ hasText: GROUP2 }).first();
    await expect(renamed).toBeVisible({ timeout: 10_000 });
    await renamed.getByTitle('Excluir grupo').click();
    await expect(renamed).toHaveCount(0, { timeout: 10_000 });
    await closeModal(page);

    // ── 11. Rotas: adicionar 2ª rota → nomear → pacotes → remover ──────────
    await driverRow(page).getByRole('button', { name: /^rota$/ }).click();
    const cityInputs = page.getByPlaceholder('cidade');
    await expect(cityInputs.last()).toBeVisible({ timeout: 10_000 });
    await cityInputs.last().fill('PW Rota 2');
    await cityInputs.last().blur();
    const routePkg = page.getByTitle('Pacotes desta rota').last();
    await routePkg.fill('5');
    await routePkg.blur();
    await expect(driverRow(page)).toContainText('R$ 30,00', { timeout: 10_000 }); // 10×2 + 5×2
    await page.getByTitle('Remover rota').last().click();
    await expect(driverRow(page)).toContainText('R$ 20,00', { timeout: 10_000 });

    // ── 12. Quinzena: concluir → renomear (só concluída tem Editar) → reabrir
    //        → concluir de novo → excluir (design: Editar/Excluir só em concluída)
    await page.getByRole('button', { name: /^Concluir$/ }).click();
    await expect(modal(page).getByText('Concluir pagamento')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Concluir sem abrir próxima' }).click();
    await expect(page.getByText('Concluído').first()).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('Editar rótulo / datas da quinzena').click();
    await expect(modal(page).getByText('Editar quinzena')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder('Rótulo da quinzena').fill(PERIOD2);
    await modal(page).getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });
    await expect(periodSelect(page, PERIOD2)).toBeVisible({ timeout: 10_000 });

    await page.getByTitle('Reabrir a quinzena para editar').click();
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 15_000 });

    await deleteCurrentPeriod(page); // reconclui e exclui
    await expect(page.locator('select').filter({ hasText: PERIOD2 })).toHaveCount(0, { timeout: 10_000 });
  });

  test('sessão expirada: edição avisa "Sessão expirada — saia e faça login" (regressão do bug de prod)', async ({
    page,
  }) => {
    // abre a tela normalmente…
    await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
    await expect(modal(page).getByPlaceholder(/Nome do grupo/)).toBeVisible({ timeout: 10_000 });
    // …e ENTÃO invalida o token (como se as 24h tivessem vencido com a tela aberta)
    await page.evaluate(() => {
      const t = sessionStorage.getItem('sb-custom-token');
      sessionStorage.setItem('sb-custom-token', t ? `${t.slice(0, -8)}AAAAAAAA` : 'token-invalido');
    });
    await modal(page).getByPlaceholder(/Nome do grupo/).fill(`${TEST_EMPLOYEE_NAME_PREFIX}Grupo Expirado`);
    await modal(page).getByRole('button', { name: /^Criar$/ }).click();
    // ANTES do fix: toast genérico "Erro ao criar grupo". AGORA: mensagem clara.
    await expect(page.getByText(/Sessão expirada — saia e faça login novamente/)).toBeVisible({ timeout: 10_000 });
  });
});
