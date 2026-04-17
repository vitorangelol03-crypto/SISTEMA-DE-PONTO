import { test, expect } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';
import { getClient } from './cleanup';

const TEST_NAME = 'PW Test Blocked Employee';
const TEST_CPF = '99977766655';

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const brazilOffset = -3 * 60;
  const local = new Date(now.getTime() + brazilOffset * 60 * 1000);
  const day = local.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

function todayIso(): string {
  const now = new Date();
  const offset = -3 * 60;
  const local = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60_000);
  return local.toISOString().slice(0, 10);
}

test.describe('Bloqueio de Bonificação (silencioso)', () => {
  const supabase = getClient();
  let employeeId: string;
  const today = todayIso();

  test.beforeAll(async () => {
    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('cpf', TEST_CPF)
      .maybeSingle();

    if (existing) {
      await supabase.from('payments').delete().eq('employee_id', existing.id);
      await supabase.from('attendance').delete().eq('employee_id', existing.id);
      await supabase.from('bonus_blocks').delete().eq('employee_id', existing.id);
      await supabase.from('geo_fraud_attempts').delete().eq('employee_id', existing.id);
      await supabase.from('bonus_removals').delete().eq('employee_id', existing.id);
      await supabase.from('employees').delete().eq('id', existing.id);
    }

    const { data, error } = await supabase
      .from('employees')
      .insert([{
        name: TEST_NAME,
        cpf: TEST_CPF,
        created_by: '9999',
      }])
      .select('id')
      .single();
    if (error) throw error;
    employeeId = data.id;
  });

  test.afterAll(async () => {
    if (employeeId) {
      await supabase.from('payments').delete().eq('employee_id', employeeId);
      await supabase.from('attendance').delete().eq('employee_id', employeeId);
      await supabase.from('bonus_blocks').delete().eq('employee_id', employeeId);
      await supabase.from('geo_fraud_attempts').delete().eq('employee_id', employeeId);
      await supabase.from('bonus_removals').delete().eq('employee_id', employeeId);
      await supabase.from('employees').delete().eq('id', employeeId);
      await supabase.from('bonuses').delete().eq('date', today);
    }
  });

  test.beforeEach(async () => {
    if (employeeId) {
      await supabase.from('payments').delete().eq('employee_id', employeeId);
      await supabase.from('attendance').delete().eq('employee_id', employeeId);
      await supabase.from('bonus_blocks').delete().eq('employee_id', employeeId);
      await supabase.from('bonuses').delete().eq('date', today);
    }
  });

  test('modal de bonificação NÃO mostra seção de bloqueio (silencioso)', async ({ page }) => {
    await supabase.from('attendance').upsert([{
      employee_id: employeeId,
      date: today,
      status: 'present',
      marked_by: '9999',
    }], { onConflict: 'employee_id,date' });

    const { weekStart, weekEnd } = getWeekBounds();
    await supabase.from('bonus_blocks').upsert([{
      employee_id: employeeId,
      week_start: weekStart,
      week_end: weekEnd,
      reason: 'Tentativa de fraude de localização',
    }], { onConflict: 'employee_id,week_start' });

    await loginAs(page, ADMIN);
    await page.getByRole('button', { name: /^Bonificação$/ }).click();
    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

    // Blocked section must NOT appear inside modal (blocking is now silent)
    const modal = page.locator('[role="dialog"], .fixed').filter({ has: page.getByRole('heading', { name: /Bonificação do Dia/ }) });
    await expect(modal.getByText(/bonificação bloqueada/i)).not.toBeVisible();
    await expect(modal.getByText(TEST_NAME)).not.toBeVisible();

    await page.getByRole('button', { name: /^Fechar$/ }).click();
  });

  test('bonificação é aplicada normalmente mesmo com bloqueio ativo', async ({ page }) => {
    await supabase.from('attendance').upsert([{
      employee_id: employeeId,
      date: today,
      status: 'present',
      marked_by: '9999',
    }], { onConflict: 'employee_id,date' });

    const { weekStart, weekEnd } = getWeekBounds();
    await supabase.from('bonus_blocks').upsert([{
      employee_id: employeeId,
      week_start: weekStart,
      week_end: weekEnd,
      reason: 'Tentativa de fraude',
    }], { onConflict: 'employee_id,week_start' });

    await loginAs(page, ADMIN);

    await page.getByRole('button', { name: /^Bonificação$/ }).click();
    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

    const typeSpan = page.getByText('Tipo B', { exact: true });
    const block = typeSpan.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
    await block.locator('input[type="number"]').fill('10');
    await page.getByRole('button', { name: 'Aplicar B', exact: true }).click();

    await expect(page.getByText(/Bonificação B aplicada com sucesso/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^Fechar$/ }).click();
  });

  test('configurações NÃO mostra seção de bloqueios (removida)', async ({ page }) => {
    const { weekStart, weekEnd } = getWeekBounds();
    await supabase.from('bonus_blocks').upsert([{
      employee_id: employeeId,
      week_start: weekStart,
      week_end: weekEnd,
      reason: 'Tentativa de fraude de localização',
    }], { onConflict: 'employee_id,week_start' });

    await loginAs(page, ADMIN);
    await page.getByRole('button', { name: /^Configurações$/ }).first().click();

    // The "Bloqueios de Bonificação" section was removed from settings
    await expect(page.getByText(/Bloqueios de Bonificação/)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Desbloquear/ })).not.toBeVisible();
  });
});
