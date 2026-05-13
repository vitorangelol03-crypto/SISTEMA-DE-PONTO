import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { cleanupByPrefix } from './integrity-helpers';

/**
 * Sub-fase 14.6 — Spec E2E end-to-end pra createEmployee via UI Admin.
 *
 * Cobre a lacuna: o spec 05-employees.spec.ts cria/edita via UI mas não
 * cobre cenários de erro (CPF duplicado, CPF inválido) nem validação SQL
 * pós-submit. Este spec foca em:
 *
 *   admin login → EmployeesTab → form Novo Funcionário → submit →
 *   toast → row em employees (company_id correto) → edit → toast → DB
 *
 * Mesmo padrão do 37-create-user-e2e.spec.ts (cleanup via SQL antes/depois).
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

/** Gera CPF válido sintético (mesmo algoritmo de src/utils/validation.ts). */
function generateValidCPF(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 1) % 10;

  const calcDigit = (nums: number[]): number => {
    const len = nums.length;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += nums[i] * (len + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };

  const d1 = calcDigit(base);
  const d2 = calcDigit([...base, d1]);
  return [...base, d1, d2].join('');
}

/**
 * Abre o form "Novo Funcionário" (já na tab Funcionários).
 * Confirma que o header do form aparece — diferencia "Novo" de "Editar".
 */
async function openNewEmployeeForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Novo Funcionário/ }).first().click();
  await expect(
    page.getByRole('heading', { name: /^Novo Funcionário$/ }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Preenche os campos obrigatórios do form (nome + CPF) e opcionalmente
 * o select Tipo de Vínculo. Usa placeholders pra localizar inputs (form
 * dentro do componente não tem htmlFor nos labels).
 */
async function fillRequiredFields(
  page: Page,
  opts: { name: string; cpf: string; employmentType?: 'Diarista' | 'Carteira Assinada' },
): Promise<void> {
  const formScope = page
    .locator('form')
    .filter({ has: page.getByText('Nome Completo') })
    .first();
  await formScope.getByPlaceholder('Digite o nome completo').fill(opts.name);
  // handleCPFChange formata automaticamente — fill cru funciona.
  await formScope.getByPlaceholder('000.000.000-00').fill(opts.cpf);
  if (opts.employmentType) {
    // Tipo de Vínculo é o segundo select do form (PIX vem antes).
    // Localiza pelo label "Tipo de Vínculo (opcional)".
    await formScope
      .locator('label', { hasText: 'Tipo de Vínculo' })
      .locator('..')
      .locator('select')
      .selectOption(opts.employmentType);
  }
}

async function submitForm(page: Page, action: 'Cadastrar' | 'Atualizar'): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${action}$`) }).click();
}

test.describe('CreateEmployee E2E via EmployeesTab (sub-fase 14.6)', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test.beforeEach(async ({ page }) => {
    // Cleanup defensivo antes de cada teste pra evitar pollution entre runs.
    await cleanupByPrefix(PREFIX);
    await loginAs(page, ADMIN);
    await goToTab(page, 'Funcionários');
    await expect(
      page
        .getByRole('heading', { name: /Gestão de Funcionários|Funcionários/ })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('1. Admin clica "Novo Funcionário" → modal abre com todos os inputs principais', async ({ page }) => {
    await openNewEmployeeForm(page);

    const formScope = page
      .locator('form')
      .filter({ has: page.getByText('Nome Completo') })
      .first();

    // Inputs/selects principais: Nome, CPF, PIX, Tipo PIX, Tipo Vínculo.
    await expect(formScope.getByPlaceholder('Digite o nome completo')).toBeVisible();
    await expect(formScope.getByPlaceholder('000.000.000-00')).toBeVisible();
    await expect(formScope.getByPlaceholder('Digite a chave PIX')).toBeVisible();
    await expect(formScope.getByText('Tipo de Chave PIX')).toBeVisible();
    await expect(formScope.getByText('Tipo de Vínculo')).toBeVisible();

    // Seção "Jornada e contrato" — escala, contrato, marcações.
    await expect(formScope.getByText('Jornada e contrato')).toBeVisible();
    await expect(formScope.getByText('Função').first()).toBeVisible();
    await expect(formScope.getByText('Crachá').first()).toBeVisible();
    await expect(formScope.getByText('PIS').first()).toBeVisible();
    await expect(formScope.getByText('Tipo de escala').first()).toBeVisible();
    await expect(formScope.getByText('Tipo de contrato').first()).toBeVisible();
    await expect(formScope.getByText('Data de admissão').first()).toBeVisible();
    await expect(formScope.getByText('Marcações por dia').first()).toBeVisible();

    // Botão de submit: state inicial "Cadastrar" (não "Atualizar").
    await expect(page.getByRole('button', { name: /^Cadastrar$/ })).toBeVisible();
  });

  test('2. Form válido (nome + CPF + Diarista) → toast sucesso + row em DB + lista atualizada', async ({ page }) => {
    const name = `${PREFIX}CreateEmp1`;
    const cpf = generateValidCPF();

    await openNewEmployeeForm(page);
    await fillRequiredFields(page, { name, cpf, employmentType: 'Diarista' });
    await submitForm(page, 'Cadastrar');

    // Toast de sucesso (react-hot-toast).
    await expect(
      page.getByText(/Funcionário cadastrado com sucesso/i),
    ).toBeVisible({ timeout: 15_000 });

    // Form fechou (header não está mais visível).
    await expect(
      page.getByRole('heading', { name: /^Novo Funcionário$/ }),
    ).toBeHidden({ timeout: 10_000 });

    // Valida row em DB: name, cpf (sem máscara), employment_type, company_id.
    const s = getClient();
    const { data, error } = await s
      .from('employees')
      .select('id, name, cpf, employment_type, company_id, created_by')
      .eq('name', name)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.name).toBe(name);
    expect(data?.cpf).toBe(cpf); // 11 dígitos, sem máscara
    expect(data?.employment_type).toBe('Diarista');
    expect(data?.company_id).toBe(CARATINGA_ID);
    expect(data?.created_by).toBe(ADMIN.id);

    // Lista UI deveria mostrar o funcionário recém-criado (após loadEmployees).
    const searchInput = page
      .locator('input[placeholder*="Buscar" i], input[placeholder*="nome" i]')
      .first();
    await searchInput.fill(name);
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5_000 });
  });

  test('3. CPF duplicado → toast "CPF já cadastrado" + apenas 1 row em DB', async ({ page }) => {
    const name1 = `${PREFIX}DupCPF1`;
    const name2 = `${PREFIX}DupCPF2`;
    const cpf = generateValidCPF();

    // Cria o primeiro funcionário via UI.
    await openNewEmployeeForm(page);
    await fillRequiredFields(page, { name: name1, cpf });
    await submitForm(page, 'Cadastrar');
    await expect(
      page.getByText(/Funcionário cadastrado com sucesso/i),
    ).toBeVisible({ timeout: 15_000 });

    // Tenta criar o segundo com o MESMO CPF.
    await openNewEmployeeForm(page);
    await fillRequiredFields(page, { name: name2, cpf });
    await submitForm(page, 'Cadastrar');

    // Toast de erro do banco propagado pela createEmployee (code 23505).
    await expect(page.getByText(/CPF já cadastrado/i)).toBeVisible({
      timeout: 15_000,
    });

    // DB: apenas o primeiro funcionário existe (cpf é UNIQUE globalmente).
    const s = getClient();
    const { data } = await s.from('employees').select('id, name').eq('cpf', cpf);
    expect(data?.length).toBe(1);
    expect(data?.[0].name).toBe(name1);
  });

  test('4. CPF inválido (10 dígitos) → toast "CPF inválido" + nenhuma row criada', async ({ page }) => {
    const name = `${PREFIX}InvalidCPF`;
    const invalidCpf = '1234567890'; // 10 dígitos (validateCPF retorna false)

    await openNewEmployeeForm(page);
    await fillRequiredFields(page, { name, cpf: invalidCpf });
    await submitForm(page, 'Cadastrar');

    // Toast de validação client-side (handleSubmit linha 196).
    await expect(page.getByText(/CPF inválido/i)).toBeVisible({ timeout: 10_000 });

    // Form continua aberto (não fecha em erro de validação).
    await expect(
      page.getByRole('heading', { name: /^Novo Funcionário$/ }),
    ).toBeVisible();

    // DB: nenhum employee com esse nome.
    const s = getClient();
    const { data } = await s.from('employees').select('id').eq('name', name);
    expect(data?.length ?? 0).toBe(0);
  });

  test('5. Editar funcionário: clica edit → modal "Editar" preenchido → muda nome → toast + DB', async ({ page }) => {
    const originalName = `${PREFIX}EditMe1`;
    const updatedName = `${PREFIX}EditMe1 (renamed)`;
    const cpf = generateValidCPF();

    // Cria via UI pra exercitar o fluxo completo.
    await openNewEmployeeForm(page);
    await fillRequiredFields(page, { name: originalName, cpf });
    await submitForm(page, 'Cadastrar');
    await expect(
      page.getByText(/Funcionário cadastrado com sucesso/i),
    ).toBeVisible({ timeout: 15_000 });

    // Localiza a row recém-criada e clica no ícone de editar (title="Editar").
    const searchInput = page
      .locator('input[placeholder*="Buscar" i], input[placeholder*="nome" i]')
      .first();
    await searchInput.fill(originalName);
    const row = page.locator('tbody tr').filter({ hasText: originalName }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });
    await row.locator('button[title="Editar"]').first().click();

    // Header do form muda pra "Editar Funcionário".
    await expect(
      page.getByRole('heading', { name: /^Editar Funcionário$/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Form deve estar pré-preenchido com nome e CPF.
    const formScope = page
      .locator('form')
      .filter({ has: page.getByText('Nome Completo') })
      .first();
    await expect(formScope.getByPlaceholder('Digite o nome completo')).toHaveValue(
      originalName,
    );

    // Muda o nome e salva.
    await formScope.getByPlaceholder('Digite o nome completo').fill(updatedName);
    await submitForm(page, 'Atualizar');

    // Toast de sucesso da edição.
    await expect(
      page.getByText(/Funcionário atualizado com sucesso/i),
    ).toBeVisible({ timeout: 15_000 });

    // Form fechou.
    await expect(
      page.getByRole('heading', { name: /^Editar Funcionário$/ }),
    ).toBeHidden({ timeout: 10_000 });

    // DB: row teve o name atualizado, cpf inalterado.
    const s = getClient();
    const { data, error } = await s
      .from('employees')
      .select('id, name, cpf')
      .eq('cpf', cpf)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.name).toBe(updatedName);
    expect(data?.cpf).toBe(cpf);

    // UI: nome atualizado aparece na lista.
    await searchInput.fill(updatedName);
    await expect(page.getByText(updatedName).first()).toBeVisible({ timeout: 5_000 });
  });
});
