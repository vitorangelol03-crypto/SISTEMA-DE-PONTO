import { test, expect, Page, Locator } from '@playwright/test';
import * as XLSXns from 'xlsx-js-style';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — opções dos relatórios e do espelho (2026-07-27, decisões do Victor):
 *
 *   1) FILTRO POR PLATAFORMA nos relatórios geral e simples (chips na hora de baixar);
 *   2) "Descontar vales e perdas" (pagamento PARCIAL por plataforma): desmarcado, o
 *      vale aparece no arquivo/espelho mas NÃO é abatido do total — pra não descontar
 *      duas vezes quando o resto das plataformas for pago;
 *   3) o espelho mostra a faixa "NÃO foram descontados deste pagamento".
 *
 * Os arquivos são baixados DE VERDADE e o conteúdo do .xlsx é LIDO e conferido
 * (não basta o nome do arquivo).
 *
 * Segurança de produção: tudo dentro de uma quinzena de teste descartável, com um
 * driver "PW Test …" e as plataformas REAIS (nenhuma plataforma nova é criada).
 * A quinzena é excluída pela própria UI no fim — FK cascade limpa pacotes/vales.
 */

/**
 * xlsx-js-style é CommonJS: no runner do Playwright o namespace vem embrulhado em
 * `.default` (no app, o Vite resolve direto). Desembrulha uma vez só — justificativa
 * do cast: é interop CJS/ESM, não conveniência de tipo.
 */
type XlsxModule = typeof import('xlsx-js-style');
const XLSX = ((XLSXns as unknown as { default?: XlsxModule }).default ?? XLSXns) as XlsxModule;

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}RelDriver ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzRel ${RUN}`;

// Pacotes lançados: PLAT_A 100 × R$2 = R$200 · PLAT_B 50 × R$2 = R$100 · vale R$80.
const PKGS_A = 100;
const PKGS_B = 50;
const VALE = 80;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const driverRow = (page: Page): Locator => page.locator('tbody tr').filter({ hasText: DRIVER }).first();
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

/**
 * Colunas de PLATAFORMA na grade (as que têm input de pacotes). Zapex tem coluna
 * própria na grade mas NÃO é plataforma cadastrada — fica de fora.
 */
async function platformColumns(page: Page): Promise<Array<{ name: string; index: number }>> {
  const headers = page.locator('thead th');
  const n = await headers.count();
  const out: Array<{ name: string; index: number }> = [];
  for (let i = 0; i < n; i++) {
    const label = (await headers.nth(i).innerText()).trim();
    // Colunas fixas da grade — o resto é plataforma.
    if (/^(driver|rota|grupo|nf|espelho|total|ações|ação|a receber|desconto|vale|pacotes|zapex)/i.test(label)) continue;
    if (!label) continue;
    out.push({ name: label.split('\n')[0].trim(), index: i });
  }
  return out;
}

/** No modal de opções, deixa marcada SÓ a plataforma pedida (desmarca as outras). */
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

/** Baixa o arquivo do modal aberto e devolve as linhas da 1ª aba como matriz de texto. */
async function downloadSheet(page: Page): Promise<{ filename: string; rows: string[][] }> {
  const waitDownload = page.waitForEvent('download', { timeout: 60_000 });
  await modal(page).getByTestId('report-confirm').click();
  const download = await waitDownload;
  const filename = download.suggestedFilename();
  const dest = path.join(os.tmpdir(), `${RUN}-${filename}`);
  await download.saveAs(dest);
  // `readFile` não existe no bundle que o runner resolve (versão browser do xlsx-js-style):
  // lê os bytes com o fs do Node e parseia da memória.
  const wb = XLSX.read(fs.readFileSync(dest), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  return { filename, rows };
}

/** "R$ 1.234,56" → 1234.56 */
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

/** Linha (array de células) que contém o nome do driver de teste. */
function rowOf(rows: string[][], needle: string): string[] {
  const hit = rows.find((r) => r.some((c) => String(c ?? '').includes(needle)));
  expect(hit, `linha com "${needle}" no arquivo`).toBeTruthy();
  return hit!;
}

const flat = (rows: string[][]): string => rows.map((r) => r.join(' | ')).join('\n');

test.describe.configure({ mode: 'serial' });

test.describe('Pagamentos Driver — filtro de plataforma e abate nos relatórios', () => {
  test('relatórios e espelho respeitam plataforma escolhida e o abate de vales/perdas', async ({ page }) => {
    test.setTimeout(360_000);
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

    // ── Driver de teste + quinzena de teste ─────────────────────────────────
    await page.getByRole('button', { name: /Novo driver/ }).click();
    await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
    await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Rel');
    await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

    // ── Escopo do relatório = só o driver de teste (busca filtra a lista) ───
    await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
    await expect(driverRow(page)).toBeVisible({ timeout: 15_000 });

    // ── Pacotes em DUAS plataformas reais ───────────────────────────────────
    const columns = await platformColumns(page);
    expect(columns.length, 'plataformas na grade').toBeGreaterThan(1);
    const [platA, platB] = columns;
    const fillPkgs = async (col: { name: string; index: number }, qty: number) => {
      const input = driverRow(page).locator('td').nth(col.index).locator('input').first();
      await input.fill(String(qty));
      await input.blur();
    };
    await fillPkgs(platA, PKGS_A);
    await expect(driverRow(page)).toContainText('R$ 200,00', { timeout: 10_000 });
    await fillPkgs(platB, PKGS_B);
    await expect(driverRow(page)).toContainText('R$ 300,00', { timeout: 10_000 });

    // ── Vale de R$ 80 (o valor que não pode ser descontado duas vezes) ──────
    await driverRow(page).getByTitle('Lançar vale').click();
    await expect(modal(page).getByText('Vales / adiantamentos')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder('0,00').first().fill('80,00');
    await modal(page).getByPlaceholder(/Adiantamento combustível/).fill('PW vale relatorio');
    await modal(page).getByRole('button', { name: 'Lançar vale' }).click();
    await expect(modal(page).getByText('PW vale relatorio')).toBeVisible({ timeout: 10_000 });
    await closeModal(page);
    // net = 300 − 80 = 220
    await expect(driverRow(page)).toContainText('R$ 220,00', { timeout: 10_000 });

    // ═══ 1. Relatório geral SEM filtro e COM abate (tem que sair como sempre) ═══
    await page.getByRole('button', { name: /^Relatório geral$/ }).click();
    await expect(modal(page).getByText('Relatório geral — opções')).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByTestId('report-deductions-box')).toContainText('R$ 80,00');
    const completo = await downloadSheet(page);
    expect(completo.filename).toMatch(/^Relatorio_Geral_Driver_.*\.xlsx$/);
    expect(completo.filename).not.toContain(platB.name);
    const linhaCompleta = rowOf(completo.rows, DRIVER);
    expect(linhaCompleta.join(' | ')).toContain('220'); // TOTAL A RECEBER = 220
    expect(flat(completo.rows)).toContain(platA.name);
    expect(flat(completo.rows)).toContain(platB.name);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ═══ 2. Relatório geral SÓ da 2ª plataforma, COM abate ═══════════════════
    await page.getByRole('button', { name: /^Relatório geral$/ }).click();
    await keepOnlyPlatform(page, platB.name);
    await expect(modal(page).getByTestId('report-platform-box')).toContainText(`somente com ${platB.name}`);
    const soB = await downloadSheet(page);
    expect(soB.filename).toContain(platB.name);
    const textoB = flat(soB.rows);
    expect(textoB).toContain(`SOMENTE ${platB.name.toUpperCase()}`);
    expect(textoB).not.toContain(platA.name); // coluna da outra plataforma sumiu
    // 50 × R$2 = 100, menos o vale de 80 => 20
    expect(rowOf(soB.rows, DRIVER).join(' | ')).toContain('20');
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ═══ 3. Relatório geral SÓ da 2ª plataforma, SEM abate ═══════════════════
    await page.getByRole('button', { name: /^Relatório geral$/ }).click();
    await keepOnlyPlatform(page, platB.name);
    // 07/08/2026: a caixa de marcar virou 3 opções (só quem falta / todo mundo / ninguém).
    // Mesma intenção de antes — "este pagamento NÃO abate" —, só que no clique que uma
    // pessoa daria hoje. A prova ficou mais forte: antes bastava o texto "NÃO abate" estar
    // na tela (hoje ele é o rótulo do rádio e estaria lá de qualquer jeito), agora exige o
    // rádio REALMENTE marcado — além do conteúdo do .xlsx conferido logo abaixo.
    await modal(page).getByTestId('report-deductions-modo-nenhum').check();
    await expect(modal(page).getByTestId('report-deductions-modo-nenhum')).toBeChecked();
    const semAbate = await downloadSheet(page);
    const textoSemAbate = flat(semAbate.rows);
    // 28/07: o .xlsx sai 100% ASCII (o arquivo vai direto pro banco, que não aceita
    // acento) — por isso "NAO", sem til. A tela e o PDF continuam acentuados.
    expect(textoSemAbate).toContain('vales e perdas NAO foram abatidos');
    expect(textoSemAbate).toContain('NAO ABATIDO'); // rótulo das colunas DESCONTO/VALE
    // sem abater o vale, o total do driver é o bruto da plataforma: 100
    const linhaSemAbate = rowOf(semAbate.rows, DRIVER).join(' | ');
    expect(linhaSemAbate).toContain('100');
    expect(linhaSemAbate).toContain('80'); // o vale continua VISÍVEL na coluna
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ═══ 4. Relatório SIMPLES só da 2ª plataforma, sem abate ═════════════════
    await page.getByRole('button', { name: /^Relatório simples$/ }).click();
    await expect(modal(page).getByText('Relatório simples — opções')).toBeVisible({ timeout: 10_000 });
    await keepOnlyPlatform(page, platB.name);
    await modal(page).getByTestId('report-deductions-modo-nenhum').check();
    const simples = await downloadSheet(page);
    expect(simples.filename).toMatch(/^Relatorio_Simples_Driver_.*\.xlsx$/);
    expect(simples.filename).toContain(platB.name);
    const linhaSimples = rowOf(simples.rows, DRIVER);
    expect(linhaSimples.join(' | ')).toContain('100'); // valor cheio da plataforma
    // OBS leva a plataforma. O travessão vira hífen simples no .xlsx (regra ASCII de 28/07).
    expect(linhaSimples.join(' | ')).toContain(`${PERIOD} - ${platB.name}`);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ═══ 5. Espelho individual: desmarcar o abate muda o TOTAL A RECEBER ═════
    await driverRow(page).getByTitle('Ver / gerar espelho').click();
    await expect(modal(page).getByText('Espelho individual')).toBeVisible({ timeout: 10_000 });
    // O total EXIBIDO pode excluir plataforma com "valor separado" (regra de 20/07), então
    // o que se afirma aqui é a DIFERENÇA: sem abate ele sobe exatamente o valor do vale.
    const comAbateTotal = await mirrorTotal(page);
    await expect(modal(page).getByText(/Vales \/ adiantamentos$/).first()).toBeVisible();
    // 07/08/2026: a caixa de marcar do espelho virou 3 opções, igual a do relatório.
    // Mesma intenção — "este espelho NÃO abate" — no clique que uma pessoa daria hoje.
    await modal(page).getByTestId('mirror-deductions-modo-nenhum').check();
    await expect(modal(page).getByTestId('mirror-deductions-modo-nenhum')).toBeChecked();
    await expect(modal(page).getByText(/NÃO.*foram descontados deste pagamento/)).toBeVisible({ timeout: 10_000 });
    const semAbateTotal = await mirrorTotal(page);
    expect(semAbateTotal - comAbateTotal).toBeCloseTo(VALE, 2);
    await expect(modal(page).getByText(/NÃO.*foram descontados deste pagamento/)).toBeVisible();
    await expect(modal(page).getByText(/Vales \/ adiantamentos \(não abatidos neste pagamento\)/).first()).toBeVisible();
    // e o PDF sai de verdade nessa condição
    const waitPdf = page.waitForEvent('download', { timeout: 60_000 });
    await modal(page).getByRole('button', { name: 'Gerar PDF' }).click();
    const pdf = await waitPdf;
    expect(pdf.suggestedFilename()).toMatch(/^espelho-driver-.*\.pdf$/);
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

    // ── Limpeza: exclui a quinzena de teste ─────────────────────────────────
    await deleteCurrentPeriod(page);
    await expect(page.locator('select').filter({ hasText: PERIOD })).toHaveCount(0, { timeout: 10_000 });
  });
});
