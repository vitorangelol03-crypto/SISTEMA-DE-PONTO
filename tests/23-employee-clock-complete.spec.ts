import { test, expect } from '@playwright/test';
import { TEST_EMPLOYEE_CPF, TEST_EMPLOYEE_CPF_MASKED } from './helpers';
import { getClient } from './cleanup';
import { createTestEmployee, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * Cobertura completa do EmployeeClockIn (/clock):
 *  - CPF inválido / não encontrado
 *  - PIN setup (primeiro acesso)
 *  - PIN incorreto
 *  - PIN correto → dashboard
 *  - Face recognition GATE: NÃO testamos captura facial real (precisa câmera);
 *    apenas validamos os steps onde face_recognition_enabled controla fluxo.
 *  - Logout
 *
 * Para clockIn/clockOut em si (geo + edge function), precisaríamos do servidor
 * realmente disponível. Cobertura básica via UI.
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Clock `;

async function cleanup() {
  await cleanupByPrefix(PREFIX);
}

test.describe('EmployeeClockIn — completo', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await page.goto('/clock');
  });

  test('CPF inválido (formato) deixa botão Continuar disabled', async ({ page }) => {
    const cpfInput = page.locator('input').first();
    await cpfInput.fill('123.456'); // incompleto
    // Botão fica disabled até CPF ter 11 dígitos
    const btn = page.getByRole('button', { name: /Continuar/i });
    await expect(btn).toBeDisabled();
    await expect(cpfInput).toBeVisible();
  });

  test('CPF não encontrado mostra erro', async ({ page }) => {
    const cpfInput = page.locator('input').first();
    await cpfInput.fill('999.999.999-99');
    await page.getByRole('button', { name: /Continuar/i }).click();
    await expect(page.getByText(/Funcion[áa]rio n[ãa]o encontrado/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('CPF válido + sem PIN → tela setup-pin', async ({ page }) => {
    // Cria funcionário sem PIN
    const empId = await createTestEmployee({ name: `${PREFIX}SemPin` });
    const s = getClient();
    const { data: emp } = await s.from('employees').select('cpf').eq('id', empId).single();
    const cpf = emp?.cpf as string;
    const cpfMasked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    const cpfInput = page.locator('input').first();
    await cpfInput.fill(cpfMasked);
    await page.getByRole('button', { name: /Continuar/i }).click();

    // Tela de setup PIN (criar nova senha)
    await expect(page.getByText(/Criar.*senha|Nova senha|criar sua senha/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('CPF válido + PIN configurado → tela PIN', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}ComPin`, pin: '1234' });
    const s = getClient();
    const { data: emp } = await s.from('employees').select('cpf').eq('id', empId).single();
    const cpf = emp?.cpf as string;
    const cpfMasked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    await page.locator('input').first().fill(cpfMasked);
    await page.getByRole('button', { name: /Continuar/i }).click();
    // Tela "Olá, Nome" + keypad
    await expect(page.getByText(new RegExp(`Ol[áa]`, 'i')).first()).toBeVisible({ timeout: 10_000 });
    // Botões numéricos do keypad
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();
  });

  test('PIN incorreto: keypad → erro screen', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}PinErr`, pin: '1234' });
    const s = getClient();
    const { data: emp } = await s.from('employees').select('cpf').eq('id', empId).single();
    const cpf = emp?.cpf as string;
    const cpfMasked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    await page.locator('input').first().fill(cpfMasked);
    await page.getByRole('button', { name: /Continuar/i }).click();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible({ timeout: 10_000 });

    // Digita 4 dígitos errados (PIN é 1234, digitamos 9999)
    for (const d of ['9', '9', '9', '9']) {
      await page.getByRole('button', { name: d, exact: true }).click();
    }
    await page.getByRole('button', { name: /Confirmar PIN/i }).click();
    await expect(page.getByText(/PIN incorreto|Tentar novamente/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('PIN correto → dashboard', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}DashOK`, pin: '5678' });
    const s = getClient();
    const { data: emp } = await s.from('employees').select('cpf').eq('id', empId).single();
    const cpf = emp?.cpf as string;
    const cpfMasked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    await page.locator('input').first().fill(cpfMasked);
    await page.getByRole('button', { name: /Continuar/i }).click();
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible({ timeout: 10_000 });

    // Garante que face recognition está OFF para esse teste (evita gating)
    await s.from('employees').update({ face_recognition_enabled: false }).eq('id', empId);
    await s.from('face_recognition_config').update({ enabled: false }).neq('id', '00000000-0000-0000-0000-000000000000');

    for (const d of ['5', '6', '7', '8']) {
      await page.getByRole('button', { name: d, exact: true }).click();
    }
    await page.getByRole('button', { name: /Confirmar PIN/i }).click();

    // Dashboard mostra "REGISTRAR ENTRADA" ou "REGISTRAR SAÍDA"
    await expect(page.getByRole('button', { name: /REGISTRAR (ENTRADA|SAÍDA)/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('confirmar PIN diferente no setup-pin → erro', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}MismatchPin` });
    const s = getClient();
    const { data: emp } = await s.from('employees').select('cpf').eq('id', empId).single();
    const cpf = emp?.cpf as string;
    const cpfMasked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    await page.locator('input').first().fill(cpfMasked);
    await page.getByRole('button', { name: /Continuar/i }).click();
    await expect(page.getByText(/Criar.*senha/i).first()).toBeVisible({ timeout: 10_000 });

    // Digita primeira PIN: 1234
    for (const d of ['1', '2', '3', '4']) {
      await page.getByRole('button', { name: d, exact: true }).click();
    }
    await page.getByRole('button', { name: /Próximo/i }).click();

    // Confirmar com 5678 (diferente)
    for (const d of ['5', '6', '7', '8']) {
      await page.getByRole('button', { name: d, exact: true }).click();
    }
    await page.getByRole('button', { name: /Salvar/i }).click();
    await expect(page.getByText(/n[ãa]o conferem/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('logout volta para tela CPF', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Logout`, pin: '1111' });
    const s = getClient();
    const { data: emp } = await s.from('employees').select('cpf').eq('id', empId).single();
    const cpf = emp?.cpf as string;
    const cpfMasked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    await page.locator('input').first().fill(cpfMasked);
    await page.getByRole('button', { name: /Continuar/i }).click();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible({ timeout: 10_000 });
    await s.from('employees').update({ face_recognition_enabled: false }).eq('id', empId);
    for (const d of ['1', '1', '1', '1']) {
      await page.getByRole('button', { name: d, exact: true }).click();
    }
    await page.getByRole('button', { name: /Confirmar PIN/i }).click();
    await expect(page.getByRole('button', { name: /REGISTRAR/i }).first()).toBeVisible({ timeout: 15_000 });

    // Logout
    await page.getByRole('button', { name: /Sair/i }).first().click();
    // Volta para CPF
    await expect(page.locator('input').first()).toBeVisible({ timeout: 10_000 });
  });

  test.skip('face recognition: captura via webcam — não testável sem mock', async () => {});
  test.skip('clockIn → clockOut sequence: depende da Edge Function', async () => {});
});
