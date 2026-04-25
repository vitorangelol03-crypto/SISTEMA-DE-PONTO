import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * Testes de INTEGRIDADE FINANCEIRA — validam números reais, não só fluxo.
 *
 * Cada teste:
 *  1. Insere registros via Supabase direto
 *  2. Abre a aba relevante
 *  3. Verifica que os valores calculados batem com a expectativa matemática
 *
 * Tudo escopado em data segura (2026-01-12, longe de hoje/ontem) e
 * funcionários com prefixo `PW Test FinIntegridade ` — limpeza idempotente
 * em beforeEach garante isolamento.
 */

// Data muito longe no futuro para garantir ZERO attendance real nessa data
// (importante para tests 4/5 que dependem de saber exatamente quantos
// funcionários presentes — qualquer attendance real contaminaria a divisão).
const SAFE_DATE = '2030-06-15';
const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}FinIntegridade `;

async function cleanupTestData() {
  const s = getClient();

  // Funcionários de teste
  const { data: emps } = await s
    .from('employees')
    .select('id')
    .like('name', `${PREFIX}%`);
  const empIds = (emps || []).map((e: { id: string }) => e.id);

  // Distribuições de triagem do dia seguro
  const { data: dists } = await s
    .from('triage_error_distributions')
    .select('id')
    .eq('period_start', SAFE_DATE)
    .eq('period_end', SAFE_DATE);
  const distIds = (dists || []).map((d: { id: string }) => d.id);

  // 1. Filhos primeiro (FKs)
  if (distIds.length > 0) {
    await s.from('triage_distribution_employees').delete().in('distribution_id', distIds);
  }
  if (empIds.length > 0) {
    await s.from('triage_distribution_employees').delete().in('employee_id', empIds);
    await s.from('error_records').delete().in('employee_id', empIds);
    await s.from('attendance').delete().in('employee_id', empIds);
    await s.from('payments').delete().in('employee_id', empIds);
  }
  // 2. Pais
  if (distIds.length > 0) {
    await s.from('triage_error_distributions').delete().in('id', distIds);
  }
  if (empIds.length > 0) {
    await s.from('employees').delete().in('id', empIds);
  }
  await s.from('triage_errors').delete().eq('date', SAFE_DATE);
}

async function createEmployee(name: string, withPix = true): Promise<string> {
  const s = getClient();
  const cpf = `999${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
  const employee: Record<string, unknown> = {
    name,
    cpf,
    employment_type: 'CLT',
    created_by: '9999',
  };
  if (withPix) {
    employee.pix_key = `${cpf}@pwtest.com`;
    employee.pix_type = 'Email';
  }
  const { data, error } = await s.from('employees').insert([employee]).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function insertPayment(
  employeeId: string,
  total: number,
  dailyRate: number,
  bonus: number,
  extras: { bonus_b?: number; bonus_c1?: number; bonus_c2?: number } = {}
) {
  const s = getClient();
  const { error } = await s.from('payments').insert([{
    employee_id: employeeId,
    date: SAFE_DATE,
    daily_rate: dailyRate,
    bonus,
    total,
    bonus_b: extras.bonus_b ?? 0,
    bonus_c1: extras.bonus_c1 ?? 0,
    bonus_c2: extras.bonus_c2 ?? 0,
    created_by: '9999',
  }]);
  if (error) throw error;
}

async function insertErrorValue(employeeId: string, errorValue: number) {
  const s = getClient();
  const { error } = await s.from('error_records').insert([{
    employee_id: employeeId,
    date: SAFE_DATE,
    error_count: 0,
    error_type: 'value',
    error_value: errorValue,
    observations: 'PW Test FinIntegridade',
    created_by: '9999',
  }]);
  if (error) throw error;
}

async function insertTriageDistribution(employeeId: string, valueDeducted: number) {
  const s = getClient();
  const { data: dist, error: distErr } = await s
    .from('triage_error_distributions')
    .insert([{
      period_start: SAFE_DATE,
      period_end: SAFE_DATE,
      total_errors: 0,
      value_per_error: 0,
      total_employees: 1,
      total_deducted: valueDeducted,
      distributed_by: '9999',
    }])
    .select('id')
    .single();
  if (distErr) throw distErr;
  const { error: rowErr } = await s.from('triage_distribution_employees').insert([{
    distribution_id: (dist as { id: string }).id,
    employee_id: employeeId,
    errors_share: 0,
    value_deducted: valueDeducted,
  }]);
  if (rowErr) throw rowErr;
}

async function insertAttendance(employeeId: string) {
  const s = getClient();
  const { error } = await s.from('attendance').insert([{
    employee_id: employeeId,
    date: SAFE_DATE,
    status: 'present',
    marked_by: '9999',
  }]);
  if (error) throw error;
}

async function upsertTriageErrorRow(opts: {
  triageType: 'quantity' | 'value';
  errorCount?: number;
  directValue?: number;
}) {
  const s = getClient();
  await s.from('triage_errors').delete().eq('date', SAFE_DATE);
  const { error } = await s.from('triage_errors').insert([{
    date: SAFE_DATE,
    triage_type: opts.triageType,
    error_count: opts.errorCount ?? 0,
    direct_value: opts.directValue ?? 0,
    observations: 'PW Test FinIntegridade triagem',
    created_by: '9999',
  }]);
  if (error) throw error;
}

async function setFinancialPeriod(page: Page) {
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill(SAFE_DATE);
  await dateInputs.nth(1).fill(SAFE_DATE);
  // Blur para disparar loadData
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.waitForLoadState('networkidle');
}

test.describe('Integridade Financeira (cálculos reais)', () => {
  test.beforeAll(async () => {
    await cleanupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test.beforeEach(async ({ page }) => {
    await cleanupTestData();
    await loginAs(page, ADMIN);
  });

  test('1. Financeiro: líquido = bruto - erro_value - triagem (100 - 20 - 10 = 70)', async ({ page }) => {
    const empId = await createEmployee(`${PREFIX}Liquido`);
    await insertPayment(empId, 100, 100, 0);
    await insertErrorValue(empId, 20);
    await insertTriageDistribution(empId, 10);

    await goToTab(page, 'Financeiro');
    await setFinancialPeriod(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}Liquido` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Líquido com vírgula (formato BR)
    await expect(row).toContainText(/R\$\s*70,00/);
    await expect(row).toContainText(/Bruto:\s*R\$\s*100,00/);
    await expect(row).toContainText(/-R\$\s*20,00\s*erro\s*valor/);
    await expect(row).toContainText(/-R\$\s*10,00\s*triagem/);
  });

  test('2. C6: importa valor LÍQUIDO (R$ 70, não R$ 100)', async ({ page }) => {
    const empId = await createEmployee(`${PREFIX}LiquidoC6`);
    await insertPayment(empId, 100, 100, 0);
    await insertErrorValue(empId, 20);
    await insertTriageDistribution(empId, 10);

    await goToTab(page, 'Pagamento C6');
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(SAFE_DATE);
    await dateInputs.nth(0).blur();
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(1).blur();
    // Garante que isEditingDate ficou false (botão Importar fica disabled enquanto true)
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.getByRole('button', { name: /Importar Dados/ }).click();
    await expect(page.getByText(/importado/)).toBeVisible({ timeout: 10_000 });

    const row = page.locator('table tr', { hasText: `${PREFIX}LiquidoC6` }).first();
    await expect(row).toBeVisible();
    // C6 usa toFixed(2) sem replace — formato com ponto: R$ 70.00
    await expect(row).toContainText(/R\$\s*70\.00/);
    await expect(row).toContainText(/Bruto:\s*R\$\s*100\.00/);
    await expect(row).toContainText(/-R\$\s*20\.00\s*erro/);
    await expect(row).toContainText(/-R\$\s*10\.00\s*triagem/);
  });

  test('3. Bônus: payment com bonus_b=15, c1=20, c2=15 → bônus total = 50', async ({ page }) => {
    const empId = await createEmployee(`${PREFIX}Bonus`);
    await insertPayment(empId, 150, 100, 50, { bonus_b: 15, bonus_c1: 20, bonus_c2: 15 });

    await goToTab(page, 'Financeiro');
    await setFinancialPeriod(page);

    const row = page.locator('table tr', { hasText: `${PREFIX}Bonus` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Líquido = bruto = 150 (sem descontos)
    await expect(row).toContainText(/R\$\s*150,00/);

    // Expandir Ver Detalhes para checar quebra de bônus
    await row.getByRole('button', { name: 'Ver Detalhes' }).click();
    const detailsRow = page.locator(`tr#payments-${empId}`);
    await expect(detailsRow).toContainText(/Bônus B:\s*R\$\s*15\.00/);
    await expect(detailsRow).toContainText(/Bônus C1:\s*R\$\s*20\.00/);
    await expect(detailsRow).toContainText(/Bônus C2:\s*R\$\s*15\.00/);
    await expect(detailsRow).toContainText(/Bônus Total:\s*R\$\s*50\.00/);
  });

  test('4. Triagem por VALOR: R$ 90 ÷ 3 presentes = R$ 30,00 cada', async ({ page }) => {
    const empA = await createEmployee(`${PREFIX}TriV A`, false);
    const empB = await createEmployee(`${PREFIX}TriV B`, false);
    const empC = await createEmployee(`${PREFIX}TriV C`, false);
    await insertAttendance(empA);
    await insertAttendance(empB);
    await insertAttendance(empC);
    await upsertTriageErrorRow({ triageType: 'value', directValue: 90 });

    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /^Triagem$/ }).click();

    const dateInputs = page.locator('input[type="date"]');
    // nth(1) e nth(2) = período de distribuição (nth(0) é o do form de registro)
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(2).fill(SAFE_DATE);

    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Detalhamento por dia/)).toBeVisible({ timeout: 10_000 });
    // Texto fica em spans aninhados — usa toContainText no body para varrer nós aninhados
    await expect(page.locator('body')).toContainText(/R\$\s*90,00\s*÷\s*3\s*presentes/);
    await expect(page.locator('body')).toContainText(/R\$\s*30,00\/pessoa/);
    // Total a descontar = 90,00 (1 funcionário aparece com -R$ 30,00 no preview;
    // total geral = 3 × 30 = 90)
    await expect(page.locator('body')).toContainText(/Total a descontar:\s*R\$\s*90,00/);
  });

  test('5. Triagem por QUANTIDADE: 10 pacotes ÷ 2 presentes × R$ 5 = R$ 25,00 cada', async ({ page }) => {
    const empA = await createEmployee(`${PREFIX}TriQ A`, false);
    const empB = await createEmployee(`${PREFIX}TriQ B`, false);
    await insertAttendance(empA);
    await insertAttendance(empB);
    await upsertTriageErrorRow({ triageType: 'quantity', errorCount: 10 });

    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /^Triagem$/ }).click();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(2).fill(SAFE_DATE);

    // valuePerError input — segundo input numérico (o primeiro é "Quantidade de pacotes" do form)
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(1).fill('5');

    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Detalhamento por dia/)).toBeVisible({ timeout: 10_000 });
    // Per-day: "10 pacotes ÷ 2 presentes = 5 pacotes/pessoa"
    await expect(page.locator('body')).toContainText(/10\s*pacotes\s*÷\s*2\s*presentes/);
    await expect(page.locator('body')).toContainText(/5\s*pacotes\/pessoa/);
    // Cada funcionário recebe R$ 25,00 (5 pacotes × R$ 5)
    await expect(page.locator('body')).toContainText(/-R\$\s*25,00/);
    // Total a descontar = R$ 50,00 (2 funcionários × R$ 25)
    await expect(page.locator('body')).toContainText(/Total a descontar:\s*R\$\s*50,00/);
  });
});
