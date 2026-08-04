import { test, expect, Page, Locator } from '@playwright/test';
import * as XLSX from 'xlsx';
import { MASTER_2626, loginAs, goToTab, switchCompany } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — O IMPORT DETECTA SOZINHO PLATAFORMA NAO CADASTRADA (e trava).
 *
 * Origem (04/08/2026): o Victor importou a planilha da Shopee e "as coletas nao
 * foram identificadas". Elas FORAM: 1.600 coletas entraram como "Coleta Shopee" —
 * mas essa plataforma nao existia na empresa. O import gravou com **taxa 0,00** (o
 * `?? 0` no fim da conta da taxa) e a grade, que so desenha coluna de plataforma
 * cadastrada, **escondeu os pacotes**. Silencio total; so apareceu no banco.
 *
 * Pedido dele: "da proxima vez que eu upar planilha o sistema ja deve detectar de
 * forma automatica". Este teste prova, com CLIQUES REAIS:
 *   1) subindo a planilha, o sistema sozinho acusa as plataformas que faltam, com
 *      nome e contagem de pacotes;
 *   2) o botao de importar fica BLOQUEADO;
 *   3) a linha que a empresa nao paga (DEVOLUCAO) sai da conta e aparece listada;
 *   4) cadastradas as plataformas, a trava some, o import LIBERA e o que entra tem
 *      taxa de verdade — nao zero.
 *
 * 🔑 RODA EM **PONTE NOVA**, que tem ZERO plataformas cadastradas. Assim o cenario
 * do bug acontece naturalmente, sem apagar nem por um segundo a configuracao real
 * da Caratinga (a primeira versao deste teste removia "Coleta Shopee" de producao
 * para forcar a trava — risco alto demais para o ganho).
 *
 * A planilha e gerada aqui no formato real da Shopee (as 4 colunas que o detector
 * exige). Nada de arquivo de 31 MB no repositorio.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Import ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzImp ${RUN}`;
const EMPRESA_PN = '2b2abc4b-084c-4cf0-b5f1-02792513241d';

const ENTREGAS = 7;
const COLETAS = 3;
const DEVOLUCOES = 2;
const TAXA = 1.5;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

/** Planilha no formato Shopee: o `Tipo do Serviço` decide o destino de cada linha. */
function planilhaShopee(): Buffer {
  const linhas: string[][] = [['Tipo do Serviço', 'Driver Name', 'Cidade Entrega', '3PL Tracking Number']];
  for (let i = 0; i < ENTREGAS; i++) linhas.push(['ENTREGA', DRIVER, 'Ponte Nova', `E${RUN}${i}`]);
  for (let i = 0; i < COLETAS; i++) linhas.push(['COLETA', DRIVER, 'Ponte Nova', `C${RUN}${i}`]);
  for (let i = 0; i < DEVOLUCOES; i++) linhas.push(['DEVOLUÇÃO', DRIVER, 'Ponte Nova', `D${RUN}${i}`]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const ARQUIVO = {
  name: 'shopee-teste.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  get buffer() {
    return planilhaShopee();
  },
};

/**
 * Garante a empresa sem quebrar quando JA esta nela.
 * ⚠️ `page.reload()` mantém a empresa escolhida, e o `switchCompany` do helpers
 * estoura nesse caso: o listbox não traz a empresa ATUAL como opção, então ele
 * espera para sempre por um botão que não existe.
 */
async function garantirEmpresa(page: Page, nome: 'Caratinga' | 'Ponte Nova'): Promise<void> {
  const trigger = page.locator('button[aria-haspopup="listbox"]').first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  if (new RegExp(nome, 'i').test((await trigger.innerText()) ?? '')) return;
  await switchCompany(page, nome);
}

async function deleteCurrentPeriod(page: Page): Promise<void> {
  const excluir = page.getByTitle('Excluir esta quinzena e seus lançamentos');
  if (!(await excluir.count())) {
    await page.getByRole('button', { name: /^Concluir$/ }).click();
    await expect(modal(page).getByText('Concluir pagamento')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Concluir sem abrir próxima' }).click();
    await expect(excluir).toBeVisible({ timeout: 15_000 });
  }
  await excluir.click();
  await modal(page).getByRole('button', { name: /Excluir/ }).click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
}

test.describe('Import de planilha: plataforma não cadastrada (04/08/2026)', () => {
  test('detecta sozinho, trava o import, e libera depois de cadastrar', async ({ page }) => {
    test.setTimeout(300_000);
    const db = getClient();

    // Pré-requisito do cenário: Ponte Nova sem plataforma nenhuma.
    const { count: platsAntes } = await db
      .from('driverpay_platforms')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', EMPRESA_PN);
    expect(platsAntes, 'Ponte Nova deve começar sem plataformas (senão o teste não prova a trava)').toBe(0);

    await page.goto('/', { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
    await loginAs(page, MASTER_2626);
    await garantirEmpresa(page, 'Ponte Nova');
    await goToTab(page, 'Pagamentos Driver');

    try {
      // ── Quinzena de teste (em Ponte Nova) ─────────────────────────────────
      await page.getByRole('button', { name: /Novo período/ }).click();
      await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
      await modal(page).getByRole('button', { name: 'Criar período' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

      // ══ 1. Sobe a planilha — o sistema ACUSA SOZINHO ═════════════════════
      await page.getByRole('button', { name: 'Importar planilha' }).click();
      await expect(modal(page).getByText('Importar planilha da plataforma')).toBeVisible({ timeout: 10_000 });
      await modal(page).locator('input[type="file"]').setInputFiles(ARQUIVO);

      await expect(modal(page).getByText('Import bloqueado — plataforma não cadastrada')).toBeVisible({
        timeout: 60_000,
      });
      // As duas que faltam, cada uma com a contagem REAL de pacotes.
      await expect(modal(page).getByText('SHOPEE', { exact: true })).toBeVisible();
      await expect(modal(page).getByText('Coleta Shopee', { exact: true })).toBeVisible();
      await expect(modal(page).getByText(`${ENTREGAS} pacote(s)`)).toBeVisible();
      await expect(modal(page).getByText(`${COLETAS} pacote(s)`)).toBeVisible();

      // ══ 2. O botão de importar está BLOQUEADO ════════════════════════════
      const botaoImportar = modal(page).getByRole('button', { name: /Importar .* pacotes/ });
      await expect(botaoImportar).toBeDisabled();

      // ══ 3. A DEVOLUÇÃO fica de fora, e some da conta ═════════════════════
      await expect(modal(page).getByText(/Ficaram/).first()).toBeVisible();
      await expect(modal(page).getByText(/DEVOLUÇÃO/).first()).toBeVisible();
      // O botão conta ENTREGA + COLETA (10), nunca as 2 devoluções.
      await expect(botaoImportar).toContainText(String(ENTREGAS + COLETAS));

      // ══ 4. Cadastradas as plataformas, a trava some e o import LIBERA ════
      await modal(page).getByRole('button', { name: /^(Cancelar|Fechar)$/ }).first().click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

      await db.from('driverpay_platforms').insert([
        { company_id: EMPRESA_PN, name: 'SHOPEE', default_rate: TAXA, created_by: '2626' },
        { company_id: EMPRESA_PN, name: 'Coleta Shopee', default_rate: TAXA, created_by: '2626' },
      ]);
      await page.reload();
      await garantirEmpresa(page, 'Ponte Nova');
      await goToTab(page, 'Pagamentos Driver');
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD }).catch(() => {});

      await page.getByRole('button', { name: 'Importar planilha' }).click();
      await modal(page).locator('input[type="file"]').setInputFiles(ARQUIVO);

      const botao2 = modal(page).getByRole('button', { name: /Importar .* pacotes/ });
      await expect(botao2).toBeEnabled({ timeout: 60_000 });
      await expect(modal(page).getByText('Import bloqueado — plataforma não cadastrada')).toHaveCount(0);

      await botao2.click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 60_000 });

      // ══ O que entrou tem taxa de VERDADE, não zero ═══════════════════════
      const { data: pacotes } = await db
        .from('driverpay_payment_packages')
        .select('platform_name, packages, rate_snapshot')
        .eq('company_id', EMPRESA_PN);
      const coleta = (pacotes ?? []).find((p) => p.platform_name === 'Coleta Shopee');
      const entrega = (pacotes ?? []).find((p) => p.platform_name === 'SHOPEE');
      expect(coleta, 'a coleta foi gravada').toBeTruthy();
      expect(Number(coleta!.packages)).toBe(COLETAS);
      expect(Number(entrega!.packages)).toBe(ENTREGAS);
      // 🔴 O coração do bug: antes a coleta entrava a 0,00 e sumia da tela.
      expect(Number(coleta!.rate_snapshot)).toBe(TAXA);
      // E a devolução não virou pacote nenhum.
      expect((pacotes ?? []).reduce((s, p) => s + Number(p.packages), 0)).toBe(ENTREGAS + COLETAS);
    } finally {
      // Ponte Nova volta a ficar exatamente como estava: zero de tudo.
      const sel = periodSelect(page, PERIOD);
      if (await sel.count()) {
        await sel.selectOption({ label: PERIOD }).catch(() => {});
        await deleteCurrentPeriod(page).catch(() => {});
      }
      await db.from('driverpay_periods').delete().eq('company_id', EMPRESA_PN);
      await db.from('driverpay_drivers').delete().eq('company_id', EMPRESA_PN);
      await db.from('driverpay_platforms').delete().eq('company_id', EMPRESA_PN);
    }
  });
});
