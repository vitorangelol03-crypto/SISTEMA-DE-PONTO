import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, insertPaymentRow, cleanupByPrefix } from './integrity-helpers';

/**
 * O PASSO 2, DE PONTA A PONTA — preencher o salário de UMA pessoa e conferir o recibo.
 *
 * Este spec não testa peças: ele percorre exatamente o caminho que o Victor vai fazer
 * quando a folha sair do papel, pelas telas, como uma pessoa faria.
 *
 * ## Por que o cenário é ESTE
 *
 * A pessoa do teste é de carteira assinada, tem data de admissão E tem diárias no mesmo
 * mês — porque é o caso REAL: **18 das 21 pessoas de carteira assinada recebem por diária
 * hoje**. Testar com alguém "só salário" provaria um cenário que não existe lá.
 *
 * ## Os números, calculados à mão antes de rodar
 *
 * Salário 1.700, 30 dias de referência, sem falta e sem noturno:
 *   · INSS  = 7,5% de 1.621,00 + 9% de 79,00 = 128,6850 → truncado **128,68**
 *     (21/09: a 1ª faixa passou a ser a OFICIAL, 1.621,00 — a de 1.621,30 era derivada
 *      dos recibos e errava acima de R$ 2.902; o total aqui não muda)
 *   · IRRF  = 0 (base 1.571,32, abaixo da 1ª faixa de 2.428,80)
 *   · Proventos = 1.700 (salário) + 300 (3 diárias) = **2.000,00**
 *   · Líquido   = 2.000,00 − 128,68 = **1.871,32**
 *
 * Se qualquer um desses números mudar, este teste fica vermelho — que é o ponto.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Passo Dois`;
const SALARIO = '1700,00';
const MES = { inicio: '2026-08-01', fim: '2026-08-31' };
const QUINZENA = { inicio: '2026-08-01', fim: '2026-08-15' };
const DIAS_DE_DIARIA = ['2026-08-05', '2026-08-06', '2026-08-07'];

let employeeId = '';

/**
 * CPF sintético VÁLIDO (mesmo algoritmo de `src/utils/validation.ts`).
 *
 * ⚠️ NÃO É DETALHE: o `createTestEmployee` gera um CPF só ÚNICO, não válido — e o
 * formulário da ficha confere o dígito verificador ANTES de salvar. Com o CPF de fábrica
 * o "Atualizar" morre calado, sem toast de sucesso, e o salário nunca é gravado.
 * Foi exatamente assim que este spec caiu na 1ª rodada (CPF 939.212.180-01, cujo dígito
 * correto seria 06). A mesma armadilha do spec 115.
 */
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
  await busca.fill('Passo Dois');
  const linha = page.locator('tr, li').filter({ hasText: NOME }).first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await linha.getByTitle('Editar').first().click();
  await expect(page.getByRole('heading', { name: /Editar Funcionário/i })).toBeVisible({ timeout: 15_000 });
}

/** Entra na lista de pagamentos e recorta o período. O BLUR é o que dispara a busca. */
async function verFinanceiro(page: Page, p: { inicio: string; fim: string }): Promise<void> {
  await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
  const de = page.locator('input[type="date"]').first();
  const ate = page.locator('input[type="date"]').nth(1);
  await expect(de).toBeVisible({ timeout: 60_000 });
  await de.fill(p.inicio);
  await ate.fill(p.fim);
  await ate.blur(); // sem isto a tela continua mostrando o período anterior
  await expect(page.locator('tr').filter({ hasText: NOME }).first()).toBeVisible({ timeout: 60_000 });
}

/** Clica em "Holerite PDF" na linha da pessoa e devolve o texto de dentro do arquivo. */
async function baixarRecibo(page: Page): Promise<string> {
  const linha = page.locator('tr').filter({ hasText: NOME }).first();
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await linha.getByRole('button', { name: 'Holerite PDF' }).click();
  const arquivo = await download;
  const fs = await import('node:fs');
  const buffer = fs.readFileSync((await arquivo.path())!);
  expect(buffer.subarray(0, 4).toString(), 'tem que ser um PDF de verdade').toBe('%PDF');
  expect(buffer.length).toBeGreaterThan(1024);
  return buffer.toString('latin1');
}

test.describe('Passo 2 — salário de uma pessoa e o recibo dela', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX, DIAS_DE_DIARIA);
    employeeId = await createTestEmployee({
      name: NOME,
      employmentType: 'Carteira Assinada',
      functionRole: 'Triagem - Shopee',
    });
    const s = getClient();
    // Admissão antiga: 30 dias de referência, sem proporcional de mês de entrada.
    const { error } = await s.from('employees')
      .update({
        hire_date: '2024-05-10',
        fgts_enabled: true,
        family_allowance_children: 0,
        cpf: cpfValido(),
      })
      .eq('id', employeeId);
    if (error) throw error;

    // O caso REAL: carteira assinada que também recebe diária no mesmo mês.
    for (const dia of DIAS_DE_DIARIA) {
      await insertPaymentRow(employeeId, dia, { daily_rate: 100, total: 100 });
    }
  });

  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX, DIAS_DE_DIARIA);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
  });

  test('🎯 1. o salário é preenchido na ficha e FICA gravado', async ({ page }) => {
    await goToTab(page, 'Funcionários');
    await abrirEdicao(page);

    const bloco = page.getByTestId('bloco-folha');
    await expect(bloco, 'o bloco Folha tem que aparecer para o 2626').toBeVisible();
    await bloco.getByPlaceholder('Ex.: 1700,00').fill(SALARIO);

    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible({ timeout: 20_000 });

    // O que vale é o que ficou no banco, não o que a tela disse.
    const { data } = await getClient()
      .from('employees').select('monthly_salary').eq('id', employeeId).single();
    expect(Number((data as { monthly_salary: number }).monthly_salary)).toBe(1700);

    // E volta preenchido ao reabrir — o caminho de LEITURA já quebrou aqui em 03/09.
    await page.reload();
    await goToTab(page, 'Funcionários');
    await abrirEdicao(page);
    await expect(page.getByTestId('bloco-folha').getByPlaceholder('Ex.: 1700,00'))
      .toHaveValue(SALARIO);
  });

  test('🎯 2. a tela do Financeiro passa a mostrar o salário', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await verFinanceiro(page, MES);

    const linha = page.locator('tr').filter({ hasText: NOME }).first();
    await expect(linha.getByTestId('valor-com-salario')).toBeVisible({ timeout: 30_000 });
    await expect(linha.getByTestId('valor-com-salario')).toContainText(/1\.?700,00/);
    // O líquido da tela soma diária + folha: 300 + (1.700 − 128,68) = 1.871,32
    await expect(linha).toContainText(/1\.?871,32/);
  });

  test('🎯 3. o RECIBO sai com tudo, e a conta FECHA', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await verFinanceiro(page, MES);
    const pdf = await baixarRecibo(page);

    // ── O que a pessoa recebe ──
    expect(pdf, 'o salário do mês').toContain('1.700,00');
    expect(pdf, 'as diárias, porque ela também recebeu por dia').toContain('300,00');

    // ── 🔴 O desconto que o recibo jogava fora até 19/09 ──
    expect(pdf, 'o INSS tem que estar no papel').toContain('128,68');

    // ── A conta fecha: 2.000,00 − 128,68 = 1.871,32 ──
    expect(pdf, 'total de proventos').toContain('2.000,00');
    expect(pdf, 'líquido a receber').toContain('1.871,32');

    // ── A tarja, porque as tabelas de imposto ainda não foram conferidas ──
    expect(pdf, 'a tarja de conferência').toContain('CONFER');

    // ── E o rodapé com as bases, que é o que a contabilidade confere ──
    expect(pdf).toContain('Base INSS');
    expect(pdf).toContain('Base FGTS');
  });

  test('🎯 4. a armadilha: em QUINZENA o salário não sai, e o papel avisa', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await verFinanceiro(page, QUINZENA);
    const pdf = await baixarRecibo(page);

    // A folha é mensal: numa quinzena ela não aparece...
    expect(pdf).not.toContain('Salário mensalista');
    expect(pdf).not.toContain('128,68');
    // ...e o papel explica onde o salário está, em vez de deixar sumir calado.
    expect(pdf).toContain('aparece no recibo do M');
    // As diárias da quinzena continuam saindo normalmente.
    expect(pdf).toContain('300,00');
  });
});
