import { test, expect, Page } from '@playwright/test';
import { getClient } from './cleanup';
import {
  createTestEmployee,
  insertErrorQuantity,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * Sub-fase 10.1 — EmployeeErrorsView spec
 *
 * Componente em `src/components/employee-clock/EmployeeErrorsView.tsx` (170 lin)
 * renderizado dentro de `EmployeeErrorsPage` ao acessar `/erros`. State machine
 * é cpf → company-select (se 2+ empresas) → pin → dashboard. Fixtures aqui
 * criam funcionários em CT only (default `employees.company_id`), então
 * pulam company-select e vão direto pra step pin → dashboard.
 *
 * Cobertura:
 *  1. CPF inexistente → step error
 *  2. PIN errado → toast
 *  3. Sem erros → "Nenhum erro registrado"
 *  4. 1 erro individual quantity → card com observation + total
 *  5. 1 erro triage → "Lote de triagem"
 *  6. Total plural ("3 erros") vs singular ("1 erro")
 *
 * Período base: 2026-04-16 a 2026-04-22 (existe em CT como status='paid' →
 * badge "✅ Pago"). Não criamos period novo pra não inflar fixtures.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}EmpErrV `;
const EXISTING_PERIOD_DATE = '2026-04-22'; // último dia do period paid
const PIN = '1234';

async function getCpf(empId: string): Promise<string> {
  const s = getClient();
  const { data } = await s.from('employees').select('cpf').eq('id', empId).single();
  return (data as { cpf: string }).cpf;
}

async function gotoErrosAndFillCpf(page: Page, cpf: string) {
  await page.goto('/erros');
  await page.locator('#cpf').fill(cpf);
  await page.getByRole('button', { name: /^Continuar$/ }).click();
}

async function loginEmployee(page: Page, cpf: string, pin: string) {
  await gotoErrosAndFillCpf(page, cpf);
  // Funcionário só está em 1 empresa (CT default) → pula company-select.
  await expect(page.getByPlaceholder('••••')).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder('••••').fill(pin);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  // Dashboard: header "Meus Erros"
  await expect(page.getByText('Meus Erros').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('EmployeeErrorsView (sub-fase 10.1)', () => {
  test.beforeAll(() => cleanupByPrefix(PREFIX));
  test.afterAll(() => cleanupByPrefix(PREFIX));

  test.beforeEach(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test('1. CPF inexistente → step error com "Funcionário não encontrado"', async ({ page }) => {
    // CPF sintético improvável (99988877766) — não existe em CT/PN.
    await gotoErrosAndFillCpf(page, '99988877766');
    await expect(page.getByText(/Funcion[áa]rio n[ãa]o encontrado/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Tentar novamente/i })).toBeVisible();
  });

  test('2. PIN errado → toast "PIN incorreto"', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}WrongPin`, pin: PIN });
    const cpf = await getCpf(empId);

    await gotoErrosAndFillCpf(page, cpf);
    await expect(page.getByPlaceholder('••••')).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder('••••').fill('9999'); // errado
    await page.getByRole('button', { name: /^Entrar$/ }).click();

    await expect(page.getByText(/PIN incorreto/i)).toBeVisible({ timeout: 10_000 });
    // Continua na tela de PIN (não vai pra dashboard)
    await expect(page.getByText('Meus Erros').first()).toBeVisible(); // header da tela login
  });

  test('3. Sem erros → "Nenhum erro registrado"', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}NoErr`, pin: PIN });
    const cpf = await getCpf(empId);

    await loginEmployee(page, cpf, PIN);

    await expect(page.getByText(/Nenhum erro registrado/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Continue assim/i)).toBeVisible();
  });

  test('4. 1 erro individual quantity → card com observação + badge "Pago"', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Ind1`, pin: PIN });
    // insertErrorQuantity insere observation="PW Test integrity" (hardcoded no helper)
    await insertErrorQuantity(empId, EXISTING_PERIOD_DATE, 3);
    const cpf = await getCpf(empId);

    await loginEmployee(page, cpf, PIN);

    // Card do período aparece + label do period existente
    await expect(page.getByText(/16\/04\/2026 a 22\/04\/2026/)).toBeVisible({ timeout: 15_000 });
    // Badge "Pago" (period status=paid)
    await expect(page.getByText(/Pago/).first()).toBeVisible();
    // Subheader "Erros Individuais: 3 erros"
    await expect(page.getByText(/Erros Individuais:\s*3\s*erros/)).toBeVisible();
    // Observation aparece
    await expect(page.getByText('PW Test integrity').first()).toBeVisible();
    // Total agregado no fim do card
    await expect(page.getByText(/^Total:$/)).toBeVisible();
  });

  test('5. 1 erro triage → "Lote de triagem"', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Tri1`, pin: PIN });
    const s = getClient();

    // Triage: distribution dentro do period 2026-04-16/22 com 1 pacote pro emp.
    // observations diferente do prefix pra controle de cleanup adicional:
    // distribution não tem campo "name" pra cleanupByPrefix capturar — vai
    // ficar via empIds (triage_distribution_employees join). Distributions
    // órfãs (sem rows em employees) ficariam, mas cleanupByPrefix do prefix
    // anterior cobre distribuições atadas a empIds prefixados.
    const { data: dist, error: distErr } = await s
      .from('triage_error_distributions')
      .insert([{
        period_start: '2026-04-16',
        period_end: '2026-04-22',
        total_errors: 1,
        value_per_error: 0,
        total_employees: 1,
        total_deducted: 0,
        distributed_by: '9999',
        observations: 'PW Test triage spec31',
      }])
      .select('id')
      .single();
    if (distErr) throw distErr;
    const distId = (dist as { id: string }).id;

    try {
      const { error: rowErr } = await s.from('triage_distribution_employees').insert([{
        distribution_id: distId,
        employee_id: empId,
        errors_share: 1,
        value_deducted: 0,
      }]);
      if (rowErr) throw rowErr;

      const cpf = await getCpf(empId);
      await loginEmployee(page, cpf, PIN);

      // Card do period aparece + subseção "Triagem"
      await expect(page.getByText(/16\/04\/2026 a 22\/04\/2026/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/^Triagem$/)).toBeVisible();
      // Texto "Lote de triagem — 1 pacote atribuído"
      await expect(page.getByText(/Lote de triagem/)).toBeVisible();
      await expect(page.getByText(/1\s*pacote atribuído/)).toBeVisible();
    } finally {
      // Cleanup explícito: cleanupByPrefix derruba triage_distribution_employees
      // via in('employee_id', empIds), mas a distribution órfã fica.
      await s.from('triage_error_distributions').delete().eq('id', distId);
    }
  });

  test('6. Plural vs singular: "1 erro" vs "3 erros" exibidos corretamente', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Plural`, pin: PIN });
    // 1 erro registrado com error_count=1 → "1 erro" (singular no total_individual)
    await insertErrorQuantity(empId, EXISTING_PERIOD_DATE, 1);
    const cpf = await getCpf(empId);

    await loginEmployee(page, cpf, PIN);

    // total_individual=1 → "1 erro" (singular). Âncoras de início/fim do texto
    // garantem que NÃO casa "1 erros" (plural).
    await expect(
      page.getByText(/^Erros Individuais:\s+1\s+erro$/)
    ).toBeVisible({ timeout: 15_000 });
  });
});
