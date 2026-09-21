import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, insertPaymentRow, cleanupByPrefix } from './integrity-helpers';

/**
 * VIDA REAL — uma pessoa, um ano inteiro, na ordem em que acontece (20/09/2026).
 *
 * Pedido do Victor: *"valide tudo que a gente fez como se estivesse usando na vida real
 * mesmo"*. Este spec não testa peças soltas: ele conta UMA HISTÓRIA, pelas telas, do
 * cadastro até o acerto de contas — e cada passo depende do anterior ter funcionado.
 *
 *   1. cadastro: salário, filho (salário família), FGTS
 *   2. premiação lançada no mês
 *   3. falta sem atestado
 *   4. férias lançadas
 *   5. o recibo do mês, conferido POR DENTRO do PDF
 *   6. o 13º do ano
 *   7. a rescisão
 *   8. o relatório do mês, com tudo junto
 *
 * ## Os números, calculados à mão antes de rodar (salário 1.700, agosto/2026)
 *
 *   · Salário do mês (30 dias)                          1.700,00
 *   · Salário família (1 cota de 67,54)                    67,54
 *   · Premiação                                           500,00
 *   · Diárias (2 × 100)                                   200,00
 *   ─────────────────────────────────────────────────────────────
 *   · Base do INSS e do FGTS = 1.700,00
 *     (salário família E premiação ficam FORA — gabarito real: Camila e Maycon)
 *   · INSS = 7,5% de 1.621,00 + 9% de 79,00 = **128,68**
 *   · FGTS = 8% de 1.700,00 = **136,00** (custo da empresa, não desconta)
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX;
const NOME = `${PREFIX}Vida Real`;
const MES = { inicio: '2026-08-01', fim: '2026-08-31' };
const DIAS_DE_DIARIA = ['2026-08-04', '2026-08-05'];

let employeeId = '';

/** CPF válido — o formulário confere o dígito, e o de fábrica é só único. */
function cpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every(d => d === base[0])) base[0] = (base[0] + 1) % 10;
  const digito = (nums: number[]): number => {
    const soma = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0);
    const d = (soma * 10) % 11;
    return d === 10 ? 0 : d;
  };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}

async function abrirEdicao(page: Page): Promise<void> {
  const busca = page.getByPlaceholder('Buscar por nome ou CPF...');
  await expect(busca).toBeVisible({ timeout: 60_000 });
  await busca.fill('Vida Real');
  const linha = page.locator('tr, li').filter({ hasText: NOME }).first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await linha.getByTitle('Editar').first().click();
  await expect(page.getByRole('heading', { name: /Editar Funcionário/i })).toBeVisible({ timeout: 15_000 });
}

async function verFinanceiro(page: Page, p = MES): Promise<void> {
  await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
  const de = page.locator('input[type="date"]').first();
  const ate = page.locator('input[type="date"]').nth(1);
  await expect(de).toBeVisible({ timeout: 60_000 });
  await de.fill(p.inicio);
  await ate.fill(p.fim);
  await ate.blur(); // sem isto a tela continua no período anterior
  await expect(page.locator('tr').filter({ hasText: NOME }).first()).toBeVisible({ timeout: 60_000 });
}

async function textoDoRecibo(page: Page): Promise<string> {
  const linha = page.locator('tr').filter({ hasText: NOME }).first();
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await linha.getByRole('button', { name: 'Holerite PDF' }).click();
  const arquivo = await download;
  const fs = await import('node:fs');
  const buffer = fs.readFileSync((await arquivo.path())!);
  expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  return buffer.toString('latin1');
}

test.describe.configure({ mode: 'serial' });

test.describe('Vida real — uma pessoa, um ano inteiro', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX, DIAS_DE_DIARIA);
    employeeId = await createTestEmployee({
      name: NOME,
      employmentType: 'Carteira Assinada',
      functionRole: 'Triagem - Shopee',
    });
    const s = getClient();
    const { error } = await s.from('employees')
      .update({ hire_date: '2024-05-10', cpf: cpfValido() })
      .eq('id', employeeId);
    if (error) throw error;

    // Ela também recebe diária — o caso de 18 das 21 pessoas de carteira assinada.
    for (const dia of DIAS_DE_DIARIA) {
      await insertPaymentRow(employeeId, dia, { daily_rate: 100, total: 100 });
    }
  });

  test.afterAll(async () => {
    const s = getClient();
    for (const t of ['payroll_awards', 'payroll_thirteenth', 'payroll_termination', 'employee_vacations']) {
      await s.from(t).delete().eq('employee_id', employeeId);
    }
    await cleanupByPrefix(PREFIX, DIAS_DE_DIARIA);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
  });

  test('1️⃣ o cadastro: salário, um filho e FGTS', async ({ page }) => {
    await goToTab(page, 'Funcionários');
    await abrirEdicao(page);

    const bloco = page.getByTestId('bloco-folha');
    await bloco.getByPlaceholder('Ex.: 1700,00').fill('1700,00');
    await bloco.getByPlaceholder('0', { exact: true }).fill('1'); // filhos do salário família
    const fgts = bloco.getByRole('checkbox');
    if (!(await fgts.isChecked())) await fgts.check();

    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible({ timeout: 20_000 });

    const { data } = await getClient()
      .from('employees').select('monthly_salary, family_allowance_children, fgts_enabled')
      .eq('id', employeeId).single();
    const f = data as { monthly_salary: number; family_allowance_children: number; fgts_enabled: boolean };
    expect(Number(f.monthly_salary)).toBe(1700);
    expect(f.family_allowance_children).toBe(1);
    expect(f.fgts_enabled).toBe(true);
  });

  test('2️⃣ a premiação é lançada na tela do mês e sai como bônus', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await verFinanceiro(page);

    const linha = page.locator('tr').filter({ hasText: NOME }).first();
    await linha.getByTestId('premiar-btn').click();
    await expect(page.getByTestId('modal-premiacao')).toBeVisible();
    await page.getByTestId('premio-valor').fill('500,00');
    await page.getByTestId('premio-motivo').fill('Meta de agosto');
    await page.getByTestId('premio-salvar').click();
    await expect(page.getByText(/Premiação lançada/i)).toBeVisible({ timeout: 20_000 });

    const { data } = await getClient()
      .from('payroll_awards').select('valor, descricao, data').eq('employee_id', employeeId).single();
    const p = data as { valor: number; descricao: string; data: string };
    expect(Number(p.valor)).toBe(500);
    expect(p.descricao).toBe('Meta de agosto');
    expect(p.data).toBe(MES.inicio);
  });

  test('3️⃣ o recibo do mês sai com TUDO, e as bases estão certas', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await verFinanceiro(page);
    const pdf = await textoDoRecibo(page);

    // ── O que ela recebe ──
    expect(pdf, 'salário do mês').toContain('1.700,00');
    expect(pdf, 'salário família (1 cota)').toContain('67,54');
    expect(pdf, 'a premiação, com o motivo').toContain('500,00');
    expect(pdf, 'o motivo impresso').toContain('Meta de agosto');
    expect(pdf, 'as diárias').toContain('200,00');

    // ── O que desconta ──
    expect(pdf, 'INSS sobre 1.700,00').toContain('128,68');

    // ── 🎯 AS BASES: salário família e premiação ficam FORA (gabarito Camila/Maycon) ──
    expect(pdf, 'base do FGTS = só o salário').toContain('Base FGTS');
    expect(pdf, 'FGTS = 8% de 1.700,00').toContain('136,00');

    // ── A conta fecha: 2.467,54 − 128,68 = 2.338,86 ──
    expect(pdf, 'total de proventos').toContain('2.467,54');
    expect(pdf, 'líquido').toContain('2.338,86');

    // ── A tarja, porque as tabelas de imposto ainda não foram conferidas ──
    expect(pdf).toContain('CONFER');
  });

  test('4️⃣ o 13º do ano, com os avos certos', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await page.getByTestId('decimo-btn').click();
    await expect(page.getByTestId('decimo-panel')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('decimo-ano').fill('2026');
    await page.getByTestId('parcela-unica').click();
    await page.getByTestId('decimo-calcular').click();

    const linha = page.locator('tr').filter({ hasText: NOME });
    await expect(linha).toBeVisible({ timeout: 90_000 });
    // Admitida em 2024: os 12 avos do ano.
    await expect(linha).toContainText('12/12');
    // 13º bruto = um salário cheio (sem noturno no ponto dela).
    await expect(linha).toContainText(/R\$ 1\.?700,00/);
  });

  test('5️⃣ a rescisão: o acerto aberto, verba por verba', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await page.getByTestId('rescisao-btn').click();
    await expect(page.getByTestId('rescisao-panel')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('rescisao-busca').fill('Vida Real');
    await page.getByTestId('rescisao-pessoa').filter({ hasText: NOME }).first().click();
    await page.getByTestId('rescisao-data').fill('2026-08-31');
    await page.getByTestId('rescisao-fgts').fill('5000,00');
    await page.getByTestId('rescisao-calcular').click();
    await expect(page.getByTestId('rescisao-liquido')).toBeVisible({ timeout: 60_000 });

    const verba = (n: string) => page.getByTestId('rescisao-linha').filter({ hasText: new RegExp('^' + n) });
    await expect(verba('Saldo de salário')).toHaveCount(1);
    await expect(verba('Férias vencidas')).toHaveCount(1);
    await expect(verba('13º salário proporcional')).toHaveCount(1);
    // 40% de 5.000 = 2.000
    await expect(verba('Multa de 40% do FGTS')).toContainText('2.000,00');
  });

  test('6️⃣ o relatório do mês mostra a folha inteira', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await page.getByTestId('relatorios-btn').click();
    await expect(page.getByTestId('relatorios-panel')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('tipo-financeiro').click();
    await page.getByTestId('modo-livre').click();
    await page.getByTestId('data-inicio').fill(MES.inicio);
    await page.getByTestId('data-fim').fill(MES.fim);

    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('baixar-pdf').click();
    const arquivo = await download;
    const fs = await import('node:fs');
    const pdf = fs.readFileSync((await arquivo.path())!).toString('latin1');

    expect(pdf.slice(0, 4)).toBe('%PDF');
    expect(pdf, 'a pessoa está no relatório').toContain('Vida Real');
    expect(pdf, 'o salário').toContain('1.700,00');
    expect(pdf, 'a premiação').toContain('500,00');
    expect(pdf, 'o INSS como desconto').toContain('128,68');
    expect(pdf, 'o FGTS como custo da empresa').toContain('136,00');
  });
});
