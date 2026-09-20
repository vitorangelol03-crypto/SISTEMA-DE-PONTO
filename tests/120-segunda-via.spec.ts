import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, cleanupByPrefix } from './integrity-helpers';

/**
 * 2ª VIA do 13º e da rescisão (19/09/2026).
 *
 * O que estes testes protegem é a razão de a coluna `papel` existir: a 2ª via **relê** o
 * que foi gravado, nunca recalcula. Por isso o teste da rescisão MUDA O SALÁRIO na ficha
 * entre registrar e reimprimir — se a tela estivesse recalculando, o PDF sairia com
 * outro número, e duas vias divergentes do mesmo acerto é exatamente o que não pode
 * existir num documento que vale num processo.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Segunda Via`;
const SALARIO = 1700;
const SAIDA = '2026-09-15';

let employeeId = '';

async function irPara(page: Page, aba: 'decimo' | 'rescisao'): Promise<void> {
  await page.getByTestId(`${aba}-btn`).click();
  await expect(page.getByTestId(`${aba}-panel`)).toBeVisible({ timeout: 30_000 });
}

/** Lê o texto de dentro do PDF baixado. */
async function textoDoPdf(caminho: string): Promise<string> {
  const fs = await import('node:fs');
  const buffer = fs.readFileSync(caminho);
  expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  return buffer.toString('latin1');
}

test.describe('2ª via — releitura, nunca recálculo', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
    employeeId = await createTestEmployee({ name: NOME, employmentType: 'Carteira Assinada' });
    const s = getClient();
    const { error } = await s.from('employees')
      .update({ monthly_salary: SALARIO, fgts_enabled: true, hire_date: '2023-03-10', family_allowance_children: 0 })
      .eq('id', employeeId);
    if (error) throw error;
  });

  test.afterAll(async () => {
    const s = getClient();
    await s.from('payroll_termination').delete().eq('employee_id', employeeId);
    await s.from('payroll_thirteenth').delete().eq('employee_id', employeeId);
    await cleanupByPrefix(PREFIX);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');
  });

  test('🎯 13º: registra, reimprime, e o papel diz que é 2ª via', async ({ page }) => {
    await irPara(page, 'decimo');
    await page.getByTestId('decimo-ano').fill('2026');
    await page.getByTestId('parcela-unica').click();
    await page.getByTestId('decimo-calcular').click();
    await expect(page.locator('tr').filter({ hasText: NOME })).toBeVisible({ timeout: 90_000 });

    page.once('dialog', d => d.accept());
    await page.getByTestId('decimo-registrar').click();
    await expect(page.getByText(/parcela registrada|parcelas registradas/i)).toBeVisible({ timeout: 30_000 });

    // O papel foi guardado inteiro, não só os valores.
    const { data } = await getClient()
      .from('payroll_thirteenth').select('papel').eq('employee_id', employeeId).single();
    const papel = (data as { papel: Record<string, unknown> }).papel;
    expect(papel).toBeTruthy();
    expect(Array.isArray(papel.linhas)).toBe(true);
    expect((papel.linhas as unknown[]).length).toBeGreaterThan(0);

    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator('tr').filter({ hasText: NOME }).getByTestId('decimo-reimprimir').click();
    const arquivo = await download;
    expect(arquivo.suggestedFilename()).toMatch(/^13o_2via_.*\.pdf$/);

    // O papel tem que dizer que é reimpressão — o jsPDF grava o título como texto simples.
    const texto = await textoDoPdf((await arquivo.path())!);
    expect(texto).toContain('VIA');
    expect(texto).toContain('13');
  });

  test('🎯 rescisão: o salário MUDA depois, e a 2ª via ignora a mudança', async ({ page }) => {
    const s = getClient();

    // ── 1. registra o acerto com salário 1.700 ──
    await irPara(page, 'rescisao');
    await page.getByTestId('rescisao-busca').fill('Segunda Via');
    await page.getByTestId('rescisao-pessoa').filter({ hasText: NOME }).first().click();
    await page.getByTestId('rescisao-data').fill(SAIDA);
    await page.getByTestId('rescisao-fgts').fill('8500,00');
    await page.getByTestId('rescisao-calcular').click();
    await expect(page.getByTestId('rescisao-liquido')).toBeVisible({ timeout: 60_000 });

    page.once('dialog', d => d.accept());
    await page.getByTestId('rescisao-registrar').click();
    await expect(page.getByText(/Desligamento registrado/i)).toBeVisible({ timeout: 30_000 });

    const { data: gravado } = await s.from('payroll_termination')
      .select('liquido, papel').eq('employee_id', employeeId).single();
    const liquidoOriginal = Number((gravado as { liquido: number }).liquido);
    const papel = (gravado as { papel: Record<string, unknown> }).papel;
    expect(Array.isArray(papel.linhas)).toBe(true);
    expect(Number(papel.liquido)).toBe(liquidoOriginal);

    // ── 2. o salário sobe DEPOIS do acerto ──
    const { error } = await s.from('employees').update({ monthly_salary: 2600 }).eq('id', employeeId);
    if (error) throw error;

    try {
      // ── 3. a 2ª via sai com o valor ORIGINAL, não com o novo ──
      await page.reload();
      await goToTab(page, 'Financeiro');
      await irPara(page, 'rescisao');
      const lista = page.getByTestId('rescisao-geradas');
      await expect(lista).toBeVisible({ timeout: 30_000 });
      await lista.click();

      const download = page.waitForEvent('download', { timeout: 120_000 });
      await lista.getByTestId('rescisao-reimprimir').first().click();
      const arquivo = await download;
      expect(arquivo.suggestedFilename()).toMatch(/^Rescisao_2via_.*\.pdf$/);

      // O que vale: o banco guardou o acerto do salário antigo, e nada o recalculou.
      const { data: depois } = await s.from('payroll_termination')
        .select('liquido').eq('employee_id', employeeId).single();
      expect(Number((depois as { liquido: number }).liquido)).toBe(liquidoOriginal);

      /**
       * A PROVA que dá nome a este teste: o PDF recém-gerado traz o líquido do acerto
       * ORIGINAL (salário 1.700), e não o que sairia do salário novo (2.600). Se a tela
       * estivesse recalculando, este número seria outro.
       */
      const texto = await textoDoPdf((await arquivo.path())!);
      expect(texto).toContain('VIA');
      const liquidoImpresso = liquidoOriginal.toFixed(2).replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d),)/g, '.');
      expect(texto).toContain(liquidoImpresso);
    } finally {
      await s.from('employees').update({ monthly_salary: SALARIO }).eq('id', employeeId);
    }
  });
});
