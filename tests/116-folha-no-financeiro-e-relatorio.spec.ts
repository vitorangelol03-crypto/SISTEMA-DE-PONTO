import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, insertPaymentRow, cleanupByPrefix } from './integrity-helpers';

/**
 * A FOLHA CHEGANDO NA TELA E NO RELATÓRIO (19/09/2026).
 *
 * Prova, no navegador, as duas decisões do Victor desta leva:
 *
 *   3. *"mostra se tiver"* — a tela do Financeiro passa a mostrar o salário de quem é
 *      carteira assinada, junto com o líquido somado (diária + folha).
 *   2. *"não mostra, avisa"* — em período menor que o mês o salário NÃO sai, e a tela
 *      diz onde ele aparece, em vez de deixar o valor sumir sem explicação.
 *
 * E prova que o relatório continua saindo com a folha ligada: ele passou a buscar a
 * configuração da folha, as tabelas de imposto e as férias antes de montar, e um erro
 * ali derrubaria a geração inteira para todo mundo, inclusive o relatório de ponto.
 *
 * O 2626 é quem loga: ver valor em R$ exige três permissões juntas
 * (`financial.viewPayments` + `c6payment.viewValues` + `errors.viewValues`).
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Folha Relatorio`;

/** Agosto/2026: mês fechado, no passado, sem depender da data de hoje. */
const MES = { inicio: '2026-08-01', fim: '2026-08-31' };
/** Uma semana DENTRO do mesmo mês, contendo o dia do pagamento. */
const SEMANA = { inicio: '2026-08-01', fim: '2026-08-07' };
const DIA_DO_PAGAMENTO = '2026-08-03';

const SALARIO = 1700;

let employeeId = '';

/** Entra na lista de pagamentos e recorta o período pedido. */
async function verPeriodo(page: Page, inicio: string, fim: string): Promise<void> {
  const de = page.locator('input[type="date"]').first();
  const ate = page.locator('input[type="date"]').nth(1);
  await expect(de).toBeVisible({ timeout: 60_000 });
  await de.fill(inicio);
  await ate.fill(fim);
  // Espera por CONDIÇÃO, não por tempo: a linha da pessoa reaparecer é o sinal de que a
  // busca do novo período terminou. (A lição do tests/57, em 15/09.)
  await expect(page.locator('tr, div').filter({ hasText: NOME }).first())
    .toBeVisible({ timeout: 60_000 });
}

test.describe('Folha de carteira assinada no Financeiro e no relatório', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX, [DIA_DO_PAGAMENTO]);
    employeeId = await createTestEmployee({
      name: NOME,
      employmentType: 'Carteira Assinada',
      functionRole: 'Triagem - Shopee',
    });

    // O salário não passa pelo `createTestEmployee` (a ficha de folha é de 18/09): vai
    // direto no banco, que é o estado que a tela vai ler.
    const s = getClient();
    const { error } = await s.from('employees').update({
      monthly_salary: SALARIO,
      family_allowance_children: 0,
      fgts_enabled: true,
      hire_date: '2025-01-02',
    }).eq('id', employeeId);
    if (error) throw error;

    // Uma diária no mesmo mês: é o caso REAL da virada — 18 das 21 pessoas de carteira
    // assinada são pagas por diária hoje. Decisão do Victor (1a): o papel mostra as duas
    // coisas e o líquido soma.
    await insertPaymentRow(employeeId, DIA_DO_PAGAMENTO, { daily_rate: 100, total: 100 });
  });

  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX, [DIA_DO_PAGAMENTO]);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');
    await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
  });

  test('🎯 no MÊS fechado a tela mostra o salário junto do líquido', async ({ page }) => {
    await verPeriodo(page, MES.inicio, MES.fim);

    const salario = page.getByTestId('valor-com-salario').first();
    await expect(salario).toBeVisible({ timeout: 30_000 });
    await expect(salario).toContainText('Salário:');
    // O regex aceita o ponto do milhar como opcional porque este teste atravessou a
    // mudança: até 19/09/2026 o `moneyBRL` escrevia "R$ 1700,00" sem separador, e foi
    // este teste que expôs a diferença contra os PDFs. Arrumado no mesmo dia — o
    // opcional fica, e o teste vale dos dois lados da correção.
    await expect(salario).toContainText(/R\$ 1\.?700,00/);

    // O aviso de "fora do mês" NÃO pode aparecer aqui.
    await expect(page.getByTestId('salario-so-no-mes')).toHaveCount(0);
  });

  test('🎯 numa SEMANA o salário não sai, e a tela explica onde ele está', async ({ page }) => {
    await verPeriodo(page, SEMANA.inicio, SEMANA.fim);

    const aviso = page.getByTestId('salario-so-no-mes').first();
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText(/mês fechado/i);

    // Sem salário na semana: a linha do salário some junto.
    await expect(page.getByTestId('valor-com-salario')).toHaveCount(0);
  });

  test('🎯 o relatório do mês sai em PDF com a folha ligada', async ({ page }) => {
    await page.getByTestId('relatorios-btn').click();
    await expect(page.getByTestId('relatorios-panel')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('tipo-financeiro').click();
    await page.getByTestId('modo-livre').click();
    await page.getByTestId('data-inicio').fill(MES.inicio);
    await page.getByTestId('data-fim').fill(MES.fim);

    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('baixar-pdf').click();
    const arquivo = await download;

    expect(arquivo.suggestedFilename()).toMatch(/^Relatorio_Financeiro_.*\.pdf$/);
    // Nome terminando em .pdf não basta — arquivo de 0 byte com nome certo já aconteceu.
    const caminho = await arquivo.path();
    expect(caminho).toBeTruthy();
    const fs = await import('node:fs');
    const buffer = fs.readFileSync(caminho!);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1024);
  });
});
