import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
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

test.describe('Bloqueio de Bonificação', () => {
  const supabase = getClient();
  let employeeId: string;
  const today = todayIso();

  test.beforeAll(async () => {
    // Remove leftover from crashed previous run
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

  test('modal de bonificação mostra funcionário bloqueado', async ({ page }) => {
    // Mark test employee as present
    await supabase.from('attendance').upsert([{
      employee_id: employeeId,
      date: today,
      status: 'present',
      marked_by: '9999',
    }], { onConflict: 'employee_id,date' });

    // Block bonus for this week
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

    // Should show the blocked employees section inside the modal
    const blockedSection = page.locator('.bg-red-50');
    await expect(blockedSection.getByText(/bonificação bloqueada/i)).toBeVisible({ timeout: 10_000 });
    await expect(blockedSection.getByText(TEST_NAME)).toBeVisible();
    await expect(blockedSection.getByText(/fraude/i)).toBeVisible();

    await page.getByRole('button', { name: /^Fechar$/ }).click();
  });

  test('aplicar bonificação ignora funcionário bloqueado', async ({ page }) => {
    // Mark test employee as present
    await supabase.from('attendance').upsert([{
      employee_id: employeeId,
      date: today,
      status: 'present',
      marked_by: '9999',
    }], { onConflict: 'employee_id,date' });

    // Block bonus
    const { weekStart, weekEnd } = getWeekBounds();
    await supabase.from('bonus_blocks').upsert([{
      employee_id: employeeId,
      week_start: weekStart,
      week_end: weekEnd,
      reason: 'Tentativa de fraude',
    }], { onConflict: 'employee_id,week_start' });

    await loginAs(page, ADMIN);

    // Open bonus modal and apply B=10
    await page.getByRole('button', { name: /^Bonificação$/ }).click();
    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

    const typeSpan = page.getByText('Tipo B', { exact: true });
    const block = typeSpan.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
    await block.locator('input[type="number"]').fill('10');
    await page.getByRole('button', { name: 'Aplicar B', exact: true }).click();

    // Toast should mention blocked employees were skipped
    await expect(
      page.getByText(/bloqueados foram ignorados/i)
        .or(page.getByText(/Bonificação B/i))
    ).toBeVisible({ timeout: 10_000 });

    // Verify blocked employee did NOT receive payment
    await expect.poll(async () => {
      const { data } = await supabase
        .from('payments')
        .select('bonus_b')
        .eq('employee_id', employeeId)
        .eq('date', today)
        .maybeSingle();
      return data?.bonus_b ?? 0;
    }, { timeout: 10_000 }).toBe(0);

    await page.getByRole('button', { name: /^Fechar$/ }).click();
  });

  test('configurações: seção bloqueios aparece e desbloquear funciona', async ({ page }) => {
    // Block bonus
    const { weekStart, weekEnd } = getWeekBounds();
    await supabase.from('bonus_blocks').upsert([{
      employee_id: employeeId,
      week_start: weekStart,
      week_end: weekEnd,
      reason: 'Tentativa de fraude de localização',
    }], { onConflict: 'employee_id,week_start' });

    await loginAs(page, ADMIN);
    await goToTab(page, 'Configurações');

    // Bloqueios section should appear
    await expect(page.getByText(/Bloqueios de Bonificação/)).toBeVisible({ timeout: 10_000 });

    // Blocked employee in the table
    await expect(page.getByText(TEST_NAME)).toBeVisible({ timeout: 10_000 });

    // Click unblock
    await page.getByRole('button', { name: /Desbloquear/ }).first().click();

    // Success toast
    await expect(page.getByText(/desbloqueada/i)).toBeVisible({ timeout: 10_000 });

    // Employee should disappear from the table
    await expect(page.getByText(TEST_NAME)).not.toBeVisible({ timeout: 5_000 });

    // Verify in DB
    const { data: blocks } = await supabase
      .from('bonus_blocks')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('week_start', weekStart);
    expect(blocks?.length ?? 0).toBe(0);
  });
});
