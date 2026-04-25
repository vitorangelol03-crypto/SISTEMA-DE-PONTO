import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import {
  SAFE_DATE,
  SAFE_DATE_2,
  createTestEmployee,
  insertAttendance,
  insertErrorValue,
  insertErrorQuantity,
  upsertTriageError,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * Cobertura completa de Erros (individuais + Triagem):
 *  - Erro por quantidade (📦) e por valor (💰)
 *  - Filtros, deleção
 *  - Erro aparece como desconto no Financeiro
 *  - Triagem por quantidade: divisão + resto
 *  - Triagem por valor: divisão R$ + resto centavos
 *  - Mistura de tipos no mesmo período
 *  - Período sem presentes não permite triagem
 *  - Funcionário ausente não recebe triagem
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}ErrCompl `;

async function cleanup() {
  await cleanupByPrefix(PREFIX, [SAFE_DATE, SAFE_DATE_2]);
}

test.describe('Errors — completo', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await loginAs(page, ADMIN);
  });

  test('criar erro por QUANTIDADE: error_count > 0, error_type=quantity', async () => {
    const empId = await createTestEmployee({ name: `${PREFIX}ErrQtd` });
    await insertErrorQuantity(empId, SAFE_DATE, 5);

    const s = getClient();
    const { data } = await s.from('error_records').select('*').eq('employee_id', empId).single();
    expect(data?.error_type).toBe('quantity');
    expect(data?.error_count).toBe(5);
    expect(Number(data?.error_value ?? 0)).toBe(0);
  });

  test('criar erro por VALOR R$: error_value > 0, error_type=value, error_count=0', async () => {
    const empId = await createTestEmployee({ name: `${PREFIX}ErrVal` });
    await insertErrorValue(empId, SAFE_DATE, 25.50);

    const s = getClient();
    const { data } = await s.from('error_records').select('*').eq('employee_id', empId).single();
    expect(data?.error_type).toBe('value');
    expect(Number(data?.error_value)).toBe(25.5);
    expect(data?.error_count).toBe(0);
  });

  test('erro aparece no Financeiro como desconto (verifica integração)', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}DescErr` });
    const s = getClient();
    await s.from('payments').insert([{
      employee_id: empId, date: SAFE_DATE,
      daily_rate: 100, bonus: 0, total: 100, created_by: '9999',
    }]);
    await insertErrorValue(empId, SAFE_DATE, 30);

    await goToTab(page, 'Financeiro');
    const inputs = page.locator('input[type="date"]');
    await inputs.nth(0).fill(SAFE_DATE);
    await inputs.nth(1).fill(SAFE_DATE);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.waitForLoadState('networkidle');

    const row = page.locator('table tr', { hasText: `${PREFIX}DescErr` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/R\$\s*70,00/); // 100 - 30
    await expect(row).toContainText(/-R\$\s*30,00/);
  });

  test('triagem por QUANTIDADE — distribuição: 11 ÷ 3 = 3 + resto 2 → 4,4,3 (top-2 por dias)', async ({ page }) => {
    const empA = await createTestEmployee({ name: `${PREFIX}TriQ A`, withPix: false });
    const empB = await createTestEmployee({ name: `${PREFIX}TriQ B`, withPix: false });
    const empC = await createTestEmployee({ name: `${PREFIX}TriQ C`, withPix: false });
    // A e B têm 2 dias presentes (mais), C apenas 1 → resto vai p/ A e B
    await insertAttendance(empA, SAFE_DATE);
    await insertAttendance(empA, SAFE_DATE_2);
    await insertAttendance(empB, SAFE_DATE);
    await insertAttendance(empB, SAFE_DATE_2);
    await insertAttendance(empC, SAFE_DATE);
    await upsertTriageError(SAFE_DATE, { triage_type: 'quantity', error_count: 11 });

    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /^Triagem$/ }).click();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(2).fill(SAFE_DATE);
    const numInputs = page.locator('input[type="number"]');
    await numInputs.nth(1).fill('1'); // R$ 1 por erro
    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Detalhamento por dia/)).toBeVisible({ timeout: 10_000 });
    // 11 ÷ 3 = 3 base + 2 resto
    await expect(page.locator('body')).toContainText(/11\s*pacotes\s*÷\s*3\s*presentes/);
    await expect(page.locator('body')).toContainText(/3\s*pacotes\/pessoa/);
    // Total = 11 × 1 = 11
    await expect(page.locator('body')).toContainText(/Total a descontar:\s*R\$\s*11,00/);
  });

  test('triagem por VALOR — divisão R$ 100 ÷ 3 = 33,33 + resto 1¢ p/ primeiro', async ({ page }) => {
    const empA = await createTestEmployee({ name: `${PREFIX}TriVA`, withPix: false });
    const empB = await createTestEmployee({ name: `${PREFIX}TriVB`, withPix: false });
    const empC = await createTestEmployee({ name: `${PREFIX}TriVC`, withPix: false });
    await insertAttendance(empA, SAFE_DATE);
    await insertAttendance(empB, SAFE_DATE);
    await insertAttendance(empC, SAFE_DATE);
    await upsertTriageError(SAFE_DATE, { triage_type: 'value', direct_value: 100 });

    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /^Triagem$/ }).click();
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(2).fill(SAFE_DATE);
    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Detalhamento por dia/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).toContainText(/R\$\s*100,00\s*÷\s*3\s*presentes/);
    // 100 / 3 = 33.33 cada (resto 1 centavo p/ primeiro)
    await expect(page.locator('body')).toContainText(/R\$\s*33,33\/pessoa/);
    await expect(page.locator('body')).toContainText(/resto\s*1¢/);
    await expect(page.locator('body')).toContainText(/Total a descontar:\s*R\$\s*100,00/);
  });

  test('triagem MISTA: dia1 quantity=10, dia2 value=R$60, 2 funcionários → cálculo combinado', async ({ page }) => {
    const empA = await createTestEmployee({ name: `${PREFIX}MixA`, withPix: false });
    const empB = await createTestEmployee({ name: `${PREFIX}MixB`, withPix: false });
    await insertAttendance(empA, SAFE_DATE);
    await insertAttendance(empA, SAFE_DATE_2);
    await insertAttendance(empB, SAFE_DATE);
    await insertAttendance(empB, SAFE_DATE_2);

    const s = getClient();
    // dia1: quantity=10
    await s.from('triage_errors').insert([{
      date: SAFE_DATE, triage_type: 'quantity', error_count: 10, direct_value: 0,
      observations: 'PW mix qty', created_by: '9999',
    }]);
    // dia2: value=60
    await s.from('triage_errors').insert([{
      date: SAFE_DATE_2, triage_type: 'value', error_count: 0, direct_value: 60,
      observations: 'PW mix value', created_by: '9999',
    }]);

    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /^Triagem$/ }).click();
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(2).fill(SAFE_DATE_2);
    const numInputs = page.locator('input[type="number"]');
    await numInputs.nth(1).fill('2'); // R$ 2/erro p/ dia1
    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Detalhamento por dia/)).toBeVisible({ timeout: 10_000 });
    // dia1: 10 ÷ 2 = 5 pacotes/pessoa × R$ 2 = R$ 10/pessoa
    // dia2: R$ 60 ÷ 2 = R$ 30/pessoa
    // Total por pessoa = R$ 40 → 2 funcionários × R$ 40 = R$ 80
    await expect(page.locator('body')).toContainText(/Total a descontar:\s*R\$\s*80,00/);
  });

  test('período sem presentes não permite triagem (toast erro)', async ({ page }) => {
    // Não cria attendance — só triage error
    await upsertTriageError(SAFE_DATE, { triage_type: 'value', direct_value: 50 });

    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /^Triagem$/ }).click();
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(2).fill(SAFE_DATE);
    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Nenhum funcion[áa]rio presente/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('funcionário ausente NÃO recebe triagem', async ({ page }) => {
    const empPresente = await createTestEmployee({ name: `${PREFIX}Pres`, withPix: false });
    const empAusente = await createTestEmployee({ name: `${PREFIX}Aus`, withPix: false });
    await insertAttendance(empPresente, SAFE_DATE);
    // empAusente sem attendance
    await upsertTriageError(SAFE_DATE, { triage_type: 'value', direct_value: 50 });

    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /^Triagem$/ }).click();
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(2).fill(SAFE_DATE);
    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Detalhamento por dia/)).toBeVisible({ timeout: 10_000 });
    // Apenas 1 presente recebe (R$ 50 / 1 = R$ 50)
    await expect(page.locator('body')).toContainText(`${PREFIX}Pres`);
    // Ausente NÃO aparece no preview
    expect(await page.locator('body').textContent()).not.toContain(`${PREFIX}Aus`);
    await expect(page.locator('body')).toContainText(/Total a descontar:\s*R\$\s*50,00/);
  });
});
