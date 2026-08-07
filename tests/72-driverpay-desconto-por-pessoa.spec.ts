import { test, expect, Page, Locator } from '@playwright/test';
import * as XLSXns from 'xlsx-js-style';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — DESCONTO POR PESSOA, COM SALDO (07/08/2026, pedido do Victor com print da tela).
 *
 * O pedido, literal: *"se eu pagar todos os grupos somente shopee e aplicar os descontos, e
 * depois gerar um pagamento da eMile e selecionar o mesmo grupo eu poder aplicar os descontos
 * sem que o cara que entrega shopee e eMile tome desconto duas vezes e o cara que entrega
 * eMile tome seu desconto"*.
 *
 * Este spec faz EXATAMENTE isso, com cliques reais e lendo o conteúdo dos .xlsx baixados:
 *
 *   Rodada 1 — relatório só da PLATAFORMA A, marcado como pagamento de verdade:
 *     · AMBOS  (entrega A e B, deve 60) -> 200 − 60 = 140
 *     · CAP    (deve 90, mas só recebe 20 em A) -> abate 20, sai 0, FICA DEVENDO 70
 *     · SO_B   (não entrega A) -> nem aparece no arquivo
 *
 *   Rodada 2 — relatório só da PLATAFORMA B, mesmo grupo de gente:
 *     · AMBOS  -> já quitado na rodada 1: sai com 100 CHEIO (não desconta duas vezes) 🔑
 *     · SO_B   -> nunca foi descontado: sai com 100 − 50 = 50 🔑
 *     · CAP    -> sai com 200 − 70 (a sobra da rodada 1) = 130 🔑
 *
 *   Rodada 3 — o ESPELHO (decisão dele: "mesma regra lá"), porque é o papel que o
 *   entregador recebe e o que a conferência automática da nota usa como referência:
 *     · espelho do AMBOS NÃO abate de novo (já foi descontado na rodada 1) 🔑
 *     · o modo "todos" abate os R$ 60 cheios — a diferença entre os dois prova a regra
 *     · publicar de verdade grava `printed_total`/`deducted_amount` na publicação
 *
 * Segurança de produção: tudo dentro de uma quinzena de teste descartável com drivers
 * "PW Test …" e as plataformas REAIS (nenhuma plataforma é criada). A quinzena é excluída
 * pela própria UI no fim — o FK cascade leva junto pacotes, vales e as linhas do livro-caixa.
 */

type XlsxModule = typeof import('xlsx-js-style');
const XLSX = ((XLSXns as unknown as { default?: XlsxModule }).default ?? XLSXns) as XlsxModule;

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
/** Prefixo comum: a busca da lista usa ele pra deixar SÓ os 3 drivers no escopo. */
const TAG = `${TEST_EMPLOYEE_NAME_PREFIX}Sald ${RUN}`;
const AMBOS = `${TAG} Ambos`;
const SO_B = `${TAG} SoB`;
const CAP = `${TAG} Cap`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzSald ${RUN}`;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const rowOfDriver = (page: Page, nome: string): Locator =>
  page.locator('tbody tr').filter({ hasText: nome }).first();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

async function closeModal(page: Page): Promise<void> {
  const fechar = modal(page).getByRole('button', { name: /^(Fechar|Cancelar)$/ });
  if (await fechar.count()) await fechar.first().click();
  else await modal(page).getByRole('button').first().click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });
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
  await expect(modal(page).getByText('Editar quinzena')).toBeVisible({ timeout: 10_000 });
  await modal(page).getByRole('button', { name: 'Excluir definitivamente' }).click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
}

async function platformColumns(page: Page): Promise<Array<{ name: string; index: number }>> {
  const headers = page.locator('thead th');
  const n = await headers.count();
  const out: Array<{ name: string; index: number }> = [];
  for (let i = 0; i < n; i++) {
    const label = (await headers.nth(i).innerText()).trim();
    if (/^(driver|rota|grupo|nf|espelho|total|ações|ação|a receber|desconto|vale|pacotes|zapex)/i.test(label)) continue;
    if (!label) continue;
    out.push({ name: label.split('\n')[0].trim(), index: i });
  }
  return out;
}

async function keepOnlyPlatform(page: Page, keep: string): Promise<void> {
  const chips = modal(page).locator('[data-testid^="report-plat-"]');
  await expect(chips.first()).toBeVisible({ timeout: 10_000 });
  const total = await chips.count();
  for (let i = 0; i < total; i++) {
    const chip = chips.nth(i);
    const name = (await chip.getAttribute('data-testid'))!.replace('report-plat-', '');
    if (name !== keep) await chip.click();
  }
}

async function downloadSheet(page: Page): Promise<{ filename: string; rows: string[][] }> {
  const waitDownload = page.waitForEvent('download', { timeout: 60_000 });
  await modal(page).getByTestId('report-confirm').click();
  const download = await waitDownload;
  const filename = download.suggestedFilename();
  const dest = path.join(os.tmpdir(), `${RUN}-${filename}`);
  await download.saveAs(dest);
  const wb = XLSX.read(fs.readFileSync(dest), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  return { filename, rows };
}

/** Linha do arquivo que contém aquele nome (ou null quando a pessoa não saiu). */
function linhaDe(rows: string[][], needle: string): string[] | null {
  return rows.find((r) => r.some((c) => String(c ?? '').includes(needle))) ?? null;
}

/**
 * Índice da coluna "TOTAL A RECEBER" no arquivo, achado pelo CABEÇALHO.
 *
 * Procurar o valor solto na linha (ex.: `.includes('140')`) seria fraco: "1.400" contém
 * "140", e a coluna VALE poderia casar por acaso. Aqui a asserção mira a célula certa.
 */
function colTotalAReceber(rows: string[][]): number {
  for (const r of rows) {
    const i = r.findIndex((c) => String(c ?? '').trim().toUpperCase().startsWith('TOTAL A RECEBER'));
    if (i >= 0) return i;
  }
  throw new Error('cabeçalho "TOTAL A RECEBER" não encontrado no arquivo');
}

/** Célula do .xlsx -> número. O arquivo guarda número puro (140), não "R$ 140,00". */
function valorDaCelula(celula: string): number {
  const t = String(celula ?? '').trim().replace(/R\$|\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(t);
  expect(Number.isFinite(n), `célula "${celula}" deveria ser um número`).toBe(true);
  return n;
}

/** O TOTAL A RECEBER daquela pessoa, lido da coluna certa. */
function totalDe(rows: string[][], nome: string): number {
  const linha = linhaDe(rows, nome);
  expect(linha, `linha de ${nome} no arquivo`).toBeTruthy();
  return valorDaCelula(linha![colTotalAReceber(rows)]);
}

/** "R$ 1.234,56" -> 1234.56 */
function parseBRL(text: string): number {
  const m = text.match(/-?[\d.]+,\d{2}/);
  expect(m, `valor em R$ no texto "${text}"`).toBeTruthy();
  return Number(m![0].replace(/\./g, '').replace(',', '.'));
}

/** Valor da faixa verde "TOTAL A RECEBER" na prévia do espelho. */
async function mirrorTotal(page: Page): Promise<number> {
  const banner = modal(page).locator('div.bg-green-700').filter({ hasText: 'TOTAL A RECEBER' }).first();
  await expect(banner).toBeVisible({ timeout: 10_000 });
  return parseBRL(await banner.locator('span').last().innerText());
}

test.describe.configure({ mode: 'serial' });

test.describe('Pagamentos Driver — desconto por pessoa, com saldo', () => {
  test('paga Shopee e depois eMile: ninguém é descontado duas vezes e ninguém escapa', async ({ page }) => {
    test.setTimeout(420_000);
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');

    // ── Limpeza de sobras de runs anteriores ────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const sel = periodSelect(page, TEST_EMPLOYEE_NAME_PREFIX);
      if (!(await sel.count())) break;
      const leftover = sel.locator('option').filter({ hasText: TEST_EMPLOYEE_NAME_PREFIX }).first();
      const value = await leftover.getAttribute('value');
      if (!value) break;
      await sel.selectOption(value);
      await deleteCurrentPeriod(page);
    }

    // ── 3 drivers de teste ──────────────────────────────────────────────────
    for (const nome of [AMBOS, SO_B, CAP]) {
      await page.getByRole('button', { name: /Novo driver/ }).click();
      await modal(page).getByPlaceholder('Nome completo do driver').fill(nome);
      await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Saldo');
      await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });
    }

    // ── Quinzena de teste ───────────────────────────────────────────────────
    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

    // ── Escopo do relatório = só os 3 drivers de teste ──────────────────────
    await page.getByPlaceholder(/Nome do driver/).fill(TAG);
    await expect(rowOfDriver(page, AMBOS)).toBeVisible({ timeout: 15_000 });
    await expect(rowOfDriver(page, SO_B)).toBeVisible({ timeout: 15_000 });
    await expect(rowOfDriver(page, CAP)).toBeVisible({ timeout: 15_000 });

    // ── Pacotes em DUAS plataformas reais (taxa R$ 2,00, igual o spec 63) ───
    const columns = await platformColumns(page);
    expect(columns.length, 'plataformas na grade').toBeGreaterThan(1);
    const [platA, platB] = columns;
    const fillPkgs = async (nome: string, col: { index: number }, qty: number) => {
      const input = rowOfDriver(page, nome).locator('td').nth(col.index).locator('input').first();
      await input.fill(String(qty));
      await input.blur();
    };
    await fillPkgs(AMBOS, platA, 100);           // R$ 200 na A
    await fillPkgs(AMBOS, platB, 50);            // R$ 100 na B
    await expect(rowOfDriver(page, AMBOS)).toContainText('R$ 300,00', { timeout: 10_000 });
    await fillPkgs(SO_B, platB, 50);             // R$ 100, só na B
    await expect(rowOfDriver(page, SO_B)).toContainText('R$ 100,00', { timeout: 10_000 });
    await fillPkgs(CAP, platA, 10);              // R$ 20 na A
    await fillPkgs(CAP, platB, 100);             // R$ 200 na B
    await expect(rowOfDriver(page, CAP)).toContainText('R$ 220,00', { timeout: 10_000 });

    // ── Vales: 60 (AMBOS) · 50 (SO_B) · 90 (CAP, maior que os R$20 dele na A) ──
    const lancarVale = async (nome: string, valor: string) => {
      await rowOfDriver(page, nome).getByTitle('Lançar vale').click();
      await expect(modal(page).getByText('Vales / adiantamentos')).toBeVisible({ timeout: 10_000 });
      await modal(page).getByPlaceholder('0,00').first().fill(valor);
      await modal(page).getByPlaceholder(/Adiantamento combustível/).fill(`PW vale saldo ${nome}`);
      await modal(page).getByRole('button', { name: 'Lançar vale' }).click();
      await expect(modal(page).getByText(`PW vale saldo ${nome}`)).toBeVisible({ timeout: 10_000 });
      await closeModal(page);
    };
    await lancarVale(AMBOS, '60,00');
    await lancarVale(SO_B, '50,00');
    await lancarVale(CAP, '90,00');
    // 300 − 60 = 240 · 100 − 50 = 50 · 220 − 90 = 130 (a grade sempre mostra o abate cheio)
    await expect(rowOfDriver(page, AMBOS)).toContainText('R$ 240,00', { timeout: 10_000 });
    await expect(rowOfDriver(page, CAP)).toContainText('R$ 130,00', { timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // RODADA 1 — paga SÓ a plataforma A, descontando só de quem falta
    // ═══════════════════════════════════════════════════════════════════════
    await page.getByRole('button', { name: /^Relatório geral$/ }).click();
    await expect(modal(page).getByText('Relatório geral — opções')).toBeVisible({ timeout: 10_000 });
    await keepOnlyPlatform(page, platA.name);

    // O modo novo já vem escolhido: é o padrão.
    await expect(modal(page).getByTestId('report-deductions-modo-pendentes')).toBeChecked();

    // A prévia diz quem vai ser descontado ANTES de baixar: AMBOS 60 + CAP 20 = 80.
    const previa1 = modal(page).getByTestId('report-deducao-vao');
    await expect(previa1).toContainText('2 vão ser descontados');
    await expect(previa1).toContainText('R$ 80,00');
    // E avisa que o CAP fica devendo o resto (90 − 20 = 70).
    const sobra1 = modal(page).getByTestId('report-deducao-sobra');
    await expect(sobra1).toContainText('R$ 70,00');

    // 🔴 Sem marcar como pago, o aviso vermelho aparece...
    await expect(modal(page).getByTestId('report-desconto-sem-marca')).toBeVisible();
    // ...e some quando marca (é o registro que faz o saldo existir).
    await modal(page).getByTestId('report-marcar-pago').check();
    await expect(modal(page).getByTestId('report-desconto-sem-marca')).toHaveCount(0);

    const r1 = await downloadSheet(page);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 20_000 });

    // AMBOS: recebe 200 na plataforma A e devia 60 -> abate os 60 inteiros.
    expect(totalDe(r1.rows, AMBOS), 'AMBOS = 200 − 60').toBe(140);

    // 🔑 CAP: devia 90 mas só recebe 20 aqui -> abate só os 20 que cabem e sai ZERADO.
    // Sem a trava do teto, esta linha sairia −70 numa planilha de PAGAMENTO.
    expect(totalDe(r1.rows, CAP), 'CAP = 20 − 20 (o resto fica pro próximo)').toBe(0);

    // Quem não entrega na plataforma A nem aparece.
    expect(linhaDe(r1.rows, SO_B), 'SO_B NÃO deve sair no arquivo da plataforma A').toBeNull();

    // ═══════════════════════════════════════════════════════════════════════
    // RODADA 2 — paga SÓ a plataforma B, o mesmo grupo de gente
    // ═══════════════════════════════════════════════════════════════════════
    await page.getByRole('button', { name: /^Relatório geral$/ }).click();
    await expect(modal(page).getByText('Relatório geral — opções')).toBeVisible({ timeout: 10_000 });
    await keepOnlyPlatform(page, platB.name);

    // 🔑 A prévia agora reconhece o que já foi pago na rodada 1.
    const jaDesc = modal(page).getByTestId('report-deducao-ja');
    await expect(jaDesc).toContainText('1 já foram descontados antes');
    await expect(jaDesc).toContainText('R$ 60,00'); // exatamente o AMBOS
    const previa2 = modal(page).getByTestId('report-deducao-vao');
    await expect(previa2).toContainText('2 vão ser descontados');
    await expect(previa2).toContainText('R$ 120,00'); // SO_B 50 + CAP 70 (a sobra)

    const r2 = await downloadSheet(page);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 20_000 });

    // 🔑 O que entrega as DUAS não é descontado de novo: sai com os R$ 100 CHEIOS.
    // Se o desconto saísse em dobro, este número seria 40 (100 − 60).
    expect(totalDe(r2.rows, AMBOS), 'AMBOS já foi descontado na rodada 1 -> 100 CHEIO').toBe(100);

    // 🔑 O que só entrega a B toma o desconto dele agora — ninguém escapa.
    expect(totalDe(r2.rows, SO_B), 'SO_B = 100 − 50').toBe(50);

    // 🔑 E a sobra do CAP sai agora: 200 − 70 (o que não coube na rodada 1).
    expect(totalDe(r2.rows, CAP), 'CAP = 200 − 70 (sobra da rodada 1)').toBe(130);

    // ═══════════════════════════════════════════════════════════════════════
    // RODADA 3 — O ESPELHO segue a mesma regra (decisão dele: "mesma regra lá")
    //
    // O espelho é o papel que o entregador recebe. Se ele abatesse de novo os R$ 60 que
    // já saíram na rodada 1, o papel diria um número e o pagamento diria outro — e a
    // conferência automática da nota usa justamente o valor do espelho.
    // ═══════════════════════════════════════════════════════════════════════
    await rowOfDriver(page, AMBOS).getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByText('Espelho individual')).toBeVisible({ timeout: 10_000 });

    // O modo novo também é o padrão aqui.
    await expect(modal(page).getByTestId('mirror-deductions-modo-pendentes')).toBeChecked();

    // ⚠️ O total EXIBIDO no espelho pode EXCLUIR plataforma marcada como "valor separado"
    // (regra de 20/07 — ela sai num destaque próprio, fora do TOTAL A RECEBER). Por isso a
    // prova aqui é a DIFERENÇA entre os dois modos, que não depende dessa configuração:
    //
    //   · "pendentes" -> AMBOS já foi descontado na rodada 1, então NÃO abate nada;
    //   · "todos"     -> abate os R$ 60 cheios, como a regra velha fazia sempre.
    //
    // A diferença tem que ser exatamente o vale. Se o espelho descontasse de novo em
    // "pendentes", os dois valores seriam IGUAIS e a diferença daria zero.
    const espelhoPendentes = await mirrorTotal(page);
    await modal(page).getByTestId('mirror-deductions-modo-todos').check();
    const espelhoTodos = await mirrorTotal(page);
    expect(espelhoPendentes - espelhoTodos,
      'espelho do AMBOS não pode abater de novo o vale que já saiu na rodada 1')
      .toBeCloseTo(60, 2);
    await modal(page).getByTestId('mirror-deductions-modo-pendentes').check();
    expect(await mirrorTotal(page), 'e volta ao valor sem abate ao reescolher o padrão')
      .toBeCloseTo(espelhoPendentes, 2);

    // Publicar de verdade: o insert grava `printed_total`/`deducted_amount`. Se as colunas
    // não existissem, ou o insert falhasse, o botão não viraria "Republicar".
    await modal(page).getByRole('button', { name: /^Publicar no app$/ }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 30_000 });
    await rowOfDriver(page, AMBOS).getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByRole('button', { name: /^Republicar \(atualiza\)$/ }))
      .toBeVisible({ timeout: 15_000 });
    await closeModal(page);

    // ── Limpeza: a quinzena leva junto pacotes, vales e o livro-caixa (FK cascade) ──
    await deleteCurrentPeriod(page);
  });
});
