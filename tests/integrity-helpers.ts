/**
 * Helpers compartilhados para a suíte de testes de integridade (15-24).
 *
 * Convenções:
 *  - Todos os funcionários criados por testes começam com `PW Test ` (limpo
 *    automaticamente pelo `deleteTestEmployees` global)
 *  - Datas dos testes financeiros usam SAFE_DATE = '2030-06-15' — futura,
 *    sem attendance real, sem colisão com cleanup.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

export const SAFE_DATE = '2030-06-15';
export const SAFE_DATE_2 = '2030-06-16';
export const SAFE_DATE_3 = '2030-06-17';

let _seq = 0;
function uniqueCpf(): string {
  _seq += 1;
  const stamp = Date.now().toString().slice(-7);
  return `9${stamp}${String(_seq).padStart(3, '0')}`;
}

export interface CreateEmployeeOpts {
  name: string;
  withPix?: boolean;
  employmentType?: 'CLT' | 'PJ' | 'Diarista' | 'Carteira Assinada';
  pin?: string;
}

export async function createTestEmployee(opts: CreateEmployeeOpts): Promise<string> {
  const s = getClient();
  const cpf = uniqueCpf();
  const row: Record<string, unknown> = {
    name: opts.name,
    cpf,
    employment_type: opts.employmentType ?? 'CLT',
    created_by: '9999',
  };
  if (opts.withPix !== false) {
    row.pix_key = `${cpf}@pwtest.com`;
    row.pix_type = 'Email';
  }
  if (opts.pin) {
    row.pin = opts.pin;
    row.pin_configured = true;
  }
  const { data, error } = await s.from('employees').insert([row]).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function insertPaymentRow(
  employeeId: string,
  date: string,
  fields: {
    daily_rate?: number;
    bonus?: number;
    total?: number;
    bonus_b?: number;
    bonus_c1?: number;
    bonus_c2?: number;
  }
): Promise<void> {
  const s = getClient();
  const dailyRate = fields.daily_rate ?? 0;
  const bonusB = fields.bonus_b ?? 0;
  const bonusC1 = fields.bonus_c1 ?? 0;
  const bonusC2 = fields.bonus_c2 ?? 0;
  const bonus = fields.bonus ?? bonusB + bonusC1 + bonusC2;
  const total = fields.total ?? dailyRate + bonus;

  const { error } = await s.from('payments').insert([{
    employee_id: employeeId,
    date,
    daily_rate: dailyRate,
    bonus,
    total,
    bonus_b: bonusB,
    bonus_c1: bonusC1,
    bonus_c2: bonusC2,
    created_by: '9999',
  }]);
  if (error) throw error;
}

export async function insertErrorValue(employeeId: string, date: string, value: number): Promise<void> {
  const s = getClient();
  const { error } = await s.from('error_records').insert([{
    employee_id: employeeId,
    date,
    error_count: 0,
    error_type: 'value',
    error_value: value,
    observations: 'PW Test integrity',
    created_by: '9999',
  }]);
  if (error) throw error;
}

export async function insertErrorQuantity(
  employeeId: string,
  date: string,
  count: number
): Promise<void> {
  const s = getClient();
  const { error } = await s.from('error_records').insert([{
    employee_id: employeeId,
    date,
    error_count: count,
    error_type: 'quantity',
    error_value: 0,
    observations: 'PW Test integrity',
    created_by: '9999',
  }]);
  if (error) throw error;
}

export async function insertAttendance(
  employeeId: string,
  date: string,
  fields: Partial<{
    status: 'present' | 'absent';
    entry_time: string;
    exit_time_full: string;
    hours_worked: number;
    night_hours: number;
    night_additional: number;
    approval_status: 'pending' | 'approved' | 'rejected' | 'manual';
    rejection_reason: string;
  }> = {}
): Promise<string> {
  const s = getClient();
  const row: Record<string, unknown> = {
    employee_id: employeeId,
    date,
    status: fields.status ?? 'present',
    marked_by: '9999',
  };
  if (fields.entry_time !== undefined) row.entry_time = fields.entry_time;
  if (fields.exit_time_full !== undefined) row.exit_time_full = fields.exit_time_full;
  if (fields.hours_worked !== undefined) row.hours_worked = fields.hours_worked;
  if (fields.night_hours !== undefined) row.night_hours = fields.night_hours;
  if (fields.night_additional !== undefined) row.night_additional = fields.night_additional;
  if (fields.approval_status !== undefined) row.approval_status = fields.approval_status;
  if (fields.rejection_reason !== undefined) row.rejection_reason = fields.rejection_reason;

  const { data, error } = await s.from('attendance').insert([row]).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function insertTriageDistribution(opts: {
  employeeId: string;
  startDate: string;
  endDate: string;
  errorsShare?: number;
  valueDeducted: number;
}): Promise<string> {
  const s = getClient();
  const { data: dist, error: distErr } = await s
    .from('triage_error_distributions')
    .insert([{
      period_start: opts.startDate,
      period_end: opts.endDate,
      total_errors: opts.errorsShare ?? 0,
      value_per_error: 0,
      total_employees: 1,
      total_deducted: opts.valueDeducted,
      distributed_by: '9999',
    }])
    .select('id')
    .single();
  if (distErr) throw distErr;
  const { error: rowErr } = await s.from('triage_distribution_employees').insert([{
    distribution_id: (dist as { id: string }).id,
    employee_id: opts.employeeId,
    errors_share: opts.errorsShare ?? 0,
    value_deducted: opts.valueDeducted,
  }]);
  if (rowErr) throw rowErr;
  return (dist as { id: string }).id;
}

export async function upsertTriageError(
  date: string,
  fields: { triage_type: 'quantity' | 'value'; error_count?: number; direct_value?: number }
): Promise<void> {
  const s = getClient();
  await s.from('triage_errors').delete().eq('date', date);
  const { error } = await s.from('triage_errors').insert([{
    date,
    triage_type: fields.triage_type,
    error_count: fields.error_count ?? 0,
    direct_value: fields.direct_value ?? 0,
    observations: 'PW Test triagem',
    created_by: '9999',
  }]);
  if (error) throw error;
}

/**
 * Limpa todos os artefatos de teste por prefixo de nome + dates seguros.
 * Idempotente — chame em beforeEach e afterAll.
 */
export async function cleanupByPrefix(prefix: string, dates: string[] = []): Promise<void> {
  const s: SupabaseClient = getClient();

  const { data: emps } = await s.from('employees').select('id').like('name', `${prefix}%`);
  const empIds = (emps || []).map((e: { id: string }) => e.id);

  // Triage distributions cobrindo dates seguros
  let distIds: string[] = [];
  if (dates.length > 0) {
    const { data } = await s
      .from('triage_error_distributions')
      .select('id')
      .in('period_start', dates);
    distIds = (data || []).map((d: { id: string }) => d.id);
  }

  if (distIds.length > 0) {
    await s.from('triage_distribution_employees').delete().in('distribution_id', distIds);
  }
  if (empIds.length > 0) {
    await s.from('triage_distribution_employees').delete().in('employee_id', empIds);
    await s.from('error_records').delete().in('employee_id', empIds);
    await s.from('attendance').delete().in('employee_id', empIds);
    await s.from('payments').delete().in('employee_id', empIds);
    await s.from('bonus_removals').delete().in('employee_id', empIds);
    await s.from('bonus_blocks').delete().in('employee_id', empIds);
    await s.from('geo_fraud_attempts').delete().in('employee_id', empIds);
  }
  if (distIds.length > 0) {
    await s.from('triage_error_distributions').delete().in('id', distIds);
  }
  if (empIds.length > 0) {
    await s.from('employees').delete().in('id', empIds);
  }
  if (dates.length > 0) {
    await s.from('triage_errors').delete().in('date', dates);
  }
}

export { TEST_EMPLOYEE_NAME_PREFIX };
