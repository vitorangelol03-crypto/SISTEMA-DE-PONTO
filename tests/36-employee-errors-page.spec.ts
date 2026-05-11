import { test, expect, Page } from '@playwright/test';
import { getClient } from './cleanup';
import {
  createTestEmployee,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * Sub-fase 10.6 — EmployeeErrorsPage state machine spec
 *
 * Componente em `src/components/employee-clock/EmployeeErrorsPage.tsx` (295 lin)
 * acessível em `/erros`. State machine: `cpf → company-select | pin | error → dashboard`.
 *
 * A sub-fase 10.1 (`tests/31-employee-errors-view.spec.ts`) já cobriu o caminho
 * feliz cpf→pin→dashboard + CPF inexistente + PIN errado. Esta spec foca nas
 * TRANSIÇÕES do state machine que faltam:
 *   - CPF inválido (<11 dígitos) → botão Continuar disabled
 *   - CPF em 2 empresas → step 'company-select'
 *   - Clique empresa → step 'pin'
 *   - Botão "Voltar" do PIN → step 'cpf' (state reset)
 *   - Botão "Voltar" do company-select → step 'cpf'
 *   - PIN < 4 → botão Entrar disabled
 *   - Logout do dashboard → reset pra 'cpf'
 *   - Funcionário sem pin_configured → step 'error' com mensagem específica
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PONTE_NOVA_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';
const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}EmpErrPage `;
const PIN = '1234';

/** CPF compartilhado entre CT+PN (válido: 11 dígitos numéricos). */
const SHARED_CPF = '99988877766';
const SHARED_CPF_FMT = '999.888.777-66';

async function getCpf(empId: string): Promise<string> {
  const s = getClient();
  const { data } = await s.from('employees').select('cpf').eq('id', empId).single();
  return (data as { cpf: string }).cpf;
}

/** Cria emp manualmente com CPF específico (createTestEmployee gera random). */
async function createEmpWithCpf(opts: { name: string; cpf: string; companyId: string; pin?: string }): Promise<string> {
  const s = getClient();
  const row: Record<string, unknown> = {
    name: opts.name,
    cpf: opts.cpf,
    company_id: opts.companyId,
    employment_type: 'CLT',
    created_by: '9999',
    pix_key: `${opts.cpf}@pwtest.com`,
    pix_type: 'Email',
  };
  if (opts.pin) {
    row.pin = opts.pin;
    row.pin_configured = true;
  }
  const { data, error } = await s.from('employees').insert([row]).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function cleanupSharedCpf() {
  const s = getClient();
  await s.from('employees').delete().eq('cpf', SHARED_CPF);
}

test.describe('EmployeeErrorsPage state machine (sub-fase 10.6)', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
    await cleanupSharedCpf();
  });

  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX);
    await cleanupSharedCpf();
  });

  test.beforeEach(async () => {
    await cleanupByPrefix(PREFIX);
    await cleanupSharedCpf();
  });

  test('1. CPF inválido (<11 dígitos) → botão "Continuar" disabled', async ({ page }) => {
    await page.goto('/erros');
    const cpfInput = page.locator('#cpf');
    const continueBtn = page.getByRole('button', { name: /^Continuar$/ });

    await expect(continueBtn).toBeDisabled();
    await cpfInput.fill('123');
    await expect(continueBtn).toBeDisabled();
    await cpfInput.fill('12345678901'); // 11 dígitos
    await expect(continueBtn).toBeEnabled();
  });

  test('2. CPF formata automaticamente para XXX.XXX.XXX-XX', async ({ page }) => {
    await page.goto('/erros');
    const cpfInput = page.locator('#cpf');
    await cpfInput.fill('12345678901');
    await expect(cpfInput).toHaveValue('123.456.789-01');
  });

  test('3. CPF em 2 empresas → step "company-select" mostra ambas', async ({ page }) => {
    await createEmpWithCpf({ name: `${PREFIX}A`, cpf: SHARED_CPF, companyId: CARATINGA_ID, pin: PIN });
    await createEmpWithCpf({ name: `${PREFIX}B`, cpf: SHARED_CPF, companyId: PONTE_NOVA_ID, pin: PIN });

    await page.goto('/erros');
    await page.locator('#cpf').fill(SHARED_CPF);
    await page.getByRole('button', { name: /^Continuar$/ }).click();

    await expect(page.getByText(/Em qual empresa você está hoje/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Caratinga/i).first()).toBeVisible();
    await expect(page.getByText(/Ponte Nova/i).first()).toBeVisible();
  });

  test('4. Clique empresa em company-select → step "pin"', async ({ page }) => {
    await createEmpWithCpf({ name: `${PREFIX}A`, cpf: SHARED_CPF, companyId: CARATINGA_ID, pin: PIN });
    await createEmpWithCpf({ name: `${PREFIX}B`, cpf: SHARED_CPF, companyId: PONTE_NOVA_ID, pin: PIN });

    await page.goto('/erros');
    await page.locator('#cpf').fill(SHARED_CPF);
    await page.getByRole('button', { name: /^Continuar$/ }).click();
    await expect(page.getByText(/Em qual empresa/i)).toBeVisible({ timeout: 10_000 });

    // Clica Caratinga
    await page.getByText(/Caratinga/i).first().click();
    await expect(page.getByPlaceholder('••••')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Olá,`)).toBeVisible();
  });

  test('5. Botão "Voltar" do company-select → step "cpf" (reset)', async ({ page }) => {
    await createEmpWithCpf({ name: `${PREFIX}A`, cpf: SHARED_CPF, companyId: CARATINGA_ID, pin: PIN });
    await createEmpWithCpf({ name: `${PREFIX}B`, cpf: SHARED_CPF, companyId: PONTE_NOVA_ID, pin: PIN });

    await page.goto('/erros');
    await page.locator('#cpf').fill(SHARED_CPF);
    await page.getByRole('button', { name: /^Continuar$/ }).click();
    await expect(page.getByText(/Em qual empresa/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^Voltar$/ }).click();
    await expect(page.locator('#cpf')).toBeVisible({ timeout: 5_000 });
    // goBackToCpf preserva cpfInput (só setCpfInput('') no handleLogout).
    // Volta pro step 'cpf' mas mantém valor digitado pra edição rápida.
    await expect(page.locator('#cpf')).toHaveValue(SHARED_CPF_FMT);
    // Step "company-select" some
    await expect(page.getByText(/Em qual empresa/i)).toHaveCount(0);
  });

  test('6. Botão "Voltar" do PIN → step "cpf"', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Back`, pin: PIN });
    const cpf = await getCpf(empId);

    await page.goto('/erros');
    await page.locator('#cpf').fill(cpf);
    await page.getByRole('button', { name: /^Continuar$/ }).click();
    await expect(page.getByPlaceholder('••••')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^Voltar$/ }).click();
    await expect(page.locator('#cpf')).toBeVisible({ timeout: 5_000 });
    // CPF preservado (goBackToCpf não reseta cpfInput)
    await expect(page.locator('#cpf')).not.toHaveValue('');
    // PIN input some
    await expect(page.getByPlaceholder('••••')).toHaveCount(0);
  });

  test('7. PIN < 4 → botão "Entrar" disabled', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}PinDis`, pin: PIN });
    const cpf = await getCpf(empId);

    await page.goto('/erros');
    await page.locator('#cpf').fill(cpf);
    await page.getByRole('button', { name: /^Continuar$/ }).click();
    await expect(page.getByPlaceholder('••••')).toBeVisible({ timeout: 10_000 });

    const enterBtn = page.getByRole('button', { name: /^Entrar$/ });
    await expect(enterBtn).toBeDisabled();
    await page.getByPlaceholder('••••').fill('12');
    await expect(enterBtn).toBeDisabled();
    await page.getByPlaceholder('••••').fill('1234');
    await expect(enterBtn).toBeEnabled();
  });

  test('8. Funcionário sem pin_configured → step "error" com msg específica', async ({ page }) => {
    // createTestEmployee SEM passar pin → pin_configured=false (default)
    const empId = await createTestEmployee({ name: `${PREFIX}NoPin` });
    const cpf = await getCpf(empId);

    await page.goto('/erros');
    await page.locator('#cpf').fill(cpf);
    await page.getByRole('button', { name: /^Continuar$/ }).click();

    await expect(page.getByText(/PIN não configurado/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Tentar novamente/i })).toBeVisible();
  });
});
