import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, cleanupByPrefix } from './integrity-helpers';

/**
 * 13º SALÁRIO — a tela, de ponta a ponta (19/09/2026).
 *
 * Prova o caminho que o Victor vai fazer: escolher o ano, escolher a parcela, conferir a
 * lista, baixar os recibos e registrar. E prova a regra que o cálculo sozinho não mostra:
 * a **2ª parcela abate o que a 1ª REGISTROU** — que é a razão de a tabela existir.
 *
 * O 2626 é quem loga: ver salário é permissão própria (`employees.viewPayroll`),
 * desligada pra todo mundo menos ele desde 18/09.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Decimo Terceiro`;
const ANO = 2026;
const SALARIO = 1700;

let employeeId = '';

/** Abre o painel do 13º no ano e parcela pedidos, e manda calcular. */
async function calcular(page: Page, parcela: 'primeira' | 'segunda' | 'unica'): Promise<void> {
  await page.getByTestId('decimo-btn').click();
  await expect(page.getByTestId('decimo-panel')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('decimo-ano').fill(String(ANO));
  await page.getByTestId(`parcela-${parcela}`).click();
  await page.getByTestId('decimo-calcular').click();
  // Espera por CONDIÇÃO: a linha da pessoa aparecer é o sinal de que o ano inteiro
  // de ponto terminou de carregar.
  await expect(page.locator('tr').filter({ hasText: NOME })).toBeVisible({ timeout: 90_000 });
}

/** A linha da nossa pessoa na tabela. */
const linhaDaPessoa = (page: Page) => page.locator('tr').filter({ hasText: NOME }).first();

test.describe('13º salário', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
    employeeId = await createTestEmployee({
      name: NOME,
      employmentType: 'Carteira Assinada',
      functionRole: 'Triagem - Shopee',
    });

    const s = getClient();
    const { error } = await s.from('employees')
      .update({ monthly_salary: SALARIO, family_allowance_children: 0, fgts_enabled: true, hire_date: '2024-05-10' })
      .eq('id', employeeId);
    if (error) throw error;
  });

  test.afterAll(async () => {
    const s = getClient();
    // A tabela do 13º não entra no cleanup genérico: limpa o que este spec criou.
    await s.from('payroll_thirteenth').delete().eq('employee_id', employeeId);
    await cleanupByPrefix(PREFIX);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');
  });

  test('🎯 quem tem 12 avos aparece com o 13º de um salário cheio', async ({ page }) => {
    await calcular(page, 'unica');
    const linha = linhaDaPessoa(page);
    // Admitida em 2024: os 12 avos do ano.
    await expect(linha).toContainText('12/12');
    // 13º bruto = um salário (sem noturno no ponto dela).
    await expect(linha).toContainText(/R\$ 1\.?700,00/);
  });

  test('🎯 a 1ª parcela sai sem nenhum desconto — metade do 13º', async ({ page }) => {
    await calcular(page, 'primeira');
    const linha = linhaDaPessoa(page);
    await expect(linha).toContainText(/R\$ 850,00/);
    // A coluna de descontos fica com o travessão: a lei não desconta na 1ª.
    await expect(linha.locator('td').nth(3)).toHaveText('—');
  });

  test('🎯 baixar os recibos entrega um PDF de verdade e NÃO grava nada', async ({ page }) => {
    await calcular(page, 'unica');

    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('decimo-baixar').click();
    const arquivo = await download;
    expect(arquivo.suggestedFilename()).toMatch(/^13o_.*_2026\.pdf$/);

    const caminho = await arquivo.path();
    const fs = await import('node:fs');
    const buffer = fs.readFileSync(caminho!);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1024);

    // Baixar é só papel: nada foi para o banco.
    const { count } = await getClient()
      .from('payroll_thirteenth')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId);
    expect(count ?? 0).toBe(0);
  });

  test('🎯 registrar a 1ª parcela faz a 2ª abater o adiantamento', async ({ page }) => {
    // ── 1. registra a 1ª parcela ──
    await calcular(page, 'primeira');
    page.once('dialog', d => d.accept());
    await page.getByTestId('decimo-registrar').click();
    await expect(page.getByText(/parcela registrada|parcelas registradas/i)).toBeVisible({ timeout: 30_000 });

    const s = getClient();
    const { data: gravado } = await s.from('payroll_thirteenth')
      .select('parcela, valor, avos, inss')
      .eq('employee_id', employeeId)
      .eq('parcela', 'primeira')
      .single();
    expect(Number((gravado as { valor: number }).valor)).toBe(850);
    expect(Number((gravado as { inss: number }).inss)).toBe(0); // a 1ª não desconta nada
    expect((gravado as { avos: number }).avos).toBe(12);

    // ── 2. a 2ª parcela já sabe do adiantamento ──
    await page.reload();
    await goToTab(page, 'Financeiro');
    await calcular(page, 'segunda');
    const linha = linhaDaPessoa(page);
    // 1.700 − 128,68 de INSS − 850 de adiantamento = 721,32
    await expect(linha).toContainText(/R\$ 721,32/);
    // E o desconto mostrado soma o adiantamento com o INSS.
    await expect(linha).toContainText(/978,68/);
  });

  test('quem não é carteira assinada ou não tem salário fica de fora, com o motivo', async ({ page }) => {
    await calcular(page, 'unica');
    const fora = page.getByTestId('decimo-fora');
    // As 21 pessoas de carteira assinada sem salário caem aqui.
    await expect(fora).toBeVisible({ timeout: 15_000 });
    await fora.click();
    await expect(fora).toContainText('Sem salário na ficha');
  });
});
