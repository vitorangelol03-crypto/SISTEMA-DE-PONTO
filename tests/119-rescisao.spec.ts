import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, cleanupByPrefix } from './integrity-helpers';

/**
 * RESCISÃO — o acerto de contas, no navegador (19/09/2026).
 *
 * Prova o que separa uma rescisão certa de um processo:
 *   1. a conta aparece ABERTA, linha por linha, antes de gerar papel;
 *   2. justa causa perde 13º e férias proporcionais, mas NÃO as férias vencidas;
 *   3. sem o saldo do FGTS a multa não é inventada — a tela avisa;
 *   4. registrar carimba a data de saída na ficha E guarda o acerto.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Rescisao`;
const SALARIO = 1700;
const ADMISSAO = '2023-03-10';
const SAIDA = '2026-09-15';

let employeeId = '';

async function abrirEEscolher(page: Page): Promise<void> {
  await page.getByTestId('rescisao-btn').click();
  await expect(page.getByTestId('rescisao-panel')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('rescisao-busca').fill('Rescisao');
  await page.getByTestId('rescisao-pessoa').filter({ hasText: NOME }).first().click();
  await expect(page.getByTestId('rescisao-escolhida')).toContainText(NOME);
  await page.getByTestId('rescisao-data').fill(SAIDA);
}

async function calcular(page: Page): Promise<void> {
  await page.getByTestId('rescisao-calcular').click();
  await expect(page.getByTestId('rescisao-liquido')).toBeVisible({ timeout: 60_000 });
}

/**
 * A linha de UMA verba.
 *
 * ⚠️ Ancorada no começo (`^`) de propósito: `hasText` com string casa por PEDAÇO e sem
 * diferenciar maiúscula, então "Férias vencidas" pegava também "1/3 sobre férias
 * vencidas" e a contagem vinha 2. A linha começa pela descrição, então o `^` resolve.
 */
const verba = (page: Page, nome: string) =>
  page.getByTestId('rescisao-linha').filter({ hasText: new RegExp('^' + nome) });

test.describe('Rescisão', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
    employeeId = await createTestEmployee({ name: NOME, employmentType: 'Carteira Assinada' });
    const s = getClient();
    const { error } = await s.from('employees')
      .update({ monthly_salary: SALARIO, fgts_enabled: true, hire_date: ADMISSAO, family_allowance_children: 0 })
      .eq('id', employeeId);
    if (error) throw error;
  });

  test.afterAll(async () => {
    const s = getClient();
    await s.from('payroll_termination').delete().eq('employee_id', employeeId);
    await cleanupByPrefix(PREFIX);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');
  });

  test('🎯 a conta sai aberta, verba por verba', async ({ page }) => {
    await abrirEEscolher(page);
    await page.getByTestId('rescisao-fgts').fill('8500,00');
    await calcular(page);

    await expect(verba(page, 'Saldo de salário')).toHaveCount(1);
    await expect(verba(page, 'Aviso prévio indenizado')).toHaveCount(1);
    await expect(verba(page, '13º salário proporcional')).toHaveCount(1);
    await expect(verba(page, 'Férias vencidas')).toHaveCount(1);
    await expect(verba(page, 'Multa de 40% do FGTS')).toHaveCount(1);
    // 3 anos de casa → 30 + 9 = 39 dias de aviso.
    await expect(page.getByTestId('rescisao-panel')).toContainText('39 dias');
  });

  test('🎯 justa causa perde 13º e férias proporcionais, mas NÃO as vencidas', async ({ page }) => {
    await abrirEEscolher(page);
    await page.getByTestId('rescisao-motivo').selectOption('justa-causa');
    await calcular(page);

    await expect(verba(page, '13º salário proporcional')).toHaveCount(0);
    await expect(verba(page, 'Férias proporcionais')).toHaveCount(0);
    await expect(verba(page, 'Aviso prévio indenizado')).toHaveCount(0);
    // O que ela NÃO perde:
    await expect(verba(page, 'Férias vencidas')).toHaveCount(1);
    await expect(verba(page, '1/3 sobre férias vencidas')).toHaveCount(1);
    await expect(verba(page, 'Saldo de salário')).toHaveCount(1);
  });

  test('🎯 sem o saldo do FGTS a multa não é inventada — a tela avisa', async ({ page }) => {
    await abrirEEscolher(page);
    await calcular(page); // sem preencher o FGTS

    await expect(page.getByTestId('rescisao-sem-fgts')).toBeVisible();
    await expect(page.getByTestId('rescisao-sem-fgts')).toContainText(/multa do FGTS não entrou/i);
    await expect(verba(page, 'Multa de')).toHaveCount(0);
  });

  test('🎯 registrar carimba a saída na ficha E guarda o acerto', async ({ page }) => {
    await abrirEEscolher(page);
    await page.getByTestId('rescisao-fgts').fill('8500,00');
    await calcular(page);

    page.once('dialog', d => d.accept());
    await page.getByTestId('rescisao-registrar').click();
    await expect(page.getByText(/Desligamento registrado/i)).toBeVisible({ timeout: 30_000 });

    const s = getClient();
    const { data: ficha } = await s.from('employees')
      .select('termination_date, termination_reason').eq('id', employeeId).single();
    expect((ficha as { termination_date: string }).termination_date).toBe(SAIDA);
    expect((ficha as { termination_reason: string }).termination_reason).toBe('sem-justa-causa');

    const { data: acerto } = await s.from('payroll_termination')
      .select('*').eq('employee_id', employeeId).single();
    const a = acerto as Record<string, string>;
    expect(Number(a.saldo_de_salario)).toBe(850);      // 15 dias
    expect(Number(a.multa_fgts)).toBe(3400);           // 40% de 8.500
    expect(Number(a.saldo_fgts_informado)).toBe(8500); // o que foi digitado fica gravado
    expect(a.motivo).toBe('sem-justa-causa');
    expect(Number(a.anos_de_casa)).toBe(3);

    // E o papel fecha: proventos − descontos = líquido.
    expect(Number((Number(a.total_proventos) - Number(a.total_descontos)).toFixed(2)))
      .toBe(Number(a.liquido));
  });

  test('baixar o termo entrega um PDF de verdade', async ({ page }) => {
    await abrirEEscolher(page);
    await calcular(page);

    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('rescisao-baixar').click();
    const arquivo = await download;
    expect(arquivo.suggestedFilename()).toMatch(/^Rescisao_.*\.pdf$/);

    const caminho = await arquivo.path();
    const fs = await import('node:fs');
    const buffer = fs.readFileSync(caminho!);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1024);
  });
});
