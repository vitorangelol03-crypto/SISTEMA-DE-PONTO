/**
 * Migração abril/2026 — popular worked/daytime/nighttime/interval/expected/bank
 * em registros de attendance que já tem entry_1_time preenchido.
 *
 * Uso (manual; NÃO roda automático):
 *   npx tsx src/scripts/migrateApril2026.ts
 *
 * Pré-requisitos:
 *   - VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env
 *   - banco com colunas novas em attendance + companies.default_schedule populado
 *   - employees.expected_schedule é opcional (sobrescreve o da empresa quando set)
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import {
  AttendanceMarkings,
  ExpectedSchedule,
  computeWorkedMinutes,
  computeIntervalMinutes,
  computeDaytimeMinutes,
  computeNighttimeMinutes,
  getExpectedMinutesForDate,
  computeBankHours,
} from '../utils/attendanceCalc';

const START = '2026-04-01';
const END = '2026-04-30';
const BATCH_SIZE = 50;

interface AttendanceRow {
  id: string;
  date: string;
  employee_id: string;
  entry_1_time: string | null;
  exit_1_time: string | null;
  entry_2_time: string | null;
  exit_2_time: string | null;
  is_absent_compensated: boolean | null;
}

interface EmployeeRow {
  id: string;
  company_id: string | null;
  marking_count?: number | null;
  expected_schedule?: ExpectedSchedule | null;
}

interface CompanyRow {
  id: string;
  default_schedule: ExpectedSchedule | null;
  default_marking_count: number;
}

function readDotEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function getClient(): SupabaseClient {
  const env = { ...readDotEnv(), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes no .env');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main(): Promise<void> {
  const s = getClient();

  console.log(`[migrateApril2026] início — janela ${START}..${END}`);

  const { data: companies, error: cErr } = await s
    .from('companies')
    .select('id, default_schedule, default_marking_count');
  if (cErr) throw cErr;
  const companyMap = new Map<string, CompanyRow>();
  for (const c of (companies ?? []) as CompanyRow[]) companyMap.set(c.id, c);
  console.log(`  empresas carregadas: ${companyMap.size}`);

  const { data: employees, error: eErr } = await s
    .from('employees')
    .select('id, company_id, marking_count, expected_schedule');
  if (eErr) throw eErr;
  const empMap = new Map<string, EmployeeRow>();
  for (const e of (employees ?? []) as EmployeeRow[]) empMap.set(e.id, e);
  console.log(`  funcionários carregados: ${empMap.size}`);

  const { data: attendances, error: aErr } = await s
    .from('attendance')
    .select('id, date, employee_id, entry_1_time, exit_1_time, entry_2_time, exit_2_time, is_absent_compensated')
    .gte('date', START)
    .lte('date', END)
    .not('entry_1_time', 'is', null);
  if (aErr) throw aErr;
  const rows = (attendances ?? []) as AttendanceRow[];
  console.log(`  attendance abril/2026 a processar: ${rows.length}`);

  let updated = 0;
  let skippedNoEmployee = 0;
  let skippedNoSchedule = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const emp = empMap.get(row.employee_id);
      if (!emp) {
        skippedNoEmployee++;
        continue;
      }
      const company = emp.company_id ? companyMap.get(emp.company_id) : null;
      const schedule = emp.expected_schedule ?? company?.default_schedule ?? null;
      if (!schedule) skippedNoSchedule++;

      const markingCountRaw = emp.marking_count ?? company?.default_marking_count ?? 2;
      const markingCount = (markingCountRaw === 4 ? 4 : 2) as 2 | 4;

      const m: AttendanceMarkings = {
        entry_1: row.entry_1_time,
        exit_1: row.exit_1_time,
        entry_2: row.entry_2_time,
        exit_2: row.exit_2_time,
        marking_count: markingCount,
      };

      const workedMin = computeWorkedMinutes(m);
      const intervalMin = computeIntervalMinutes(m);
      const daytimeMin = computeDaytimeMinutes(m);
      const nighttimeMin = computeNighttimeMinutes(m);
      const expectedMin = getExpectedMinutesForDate(schedule, row.date);
      const bank = computeBankHours(workedMin, expectedMin, !!row.is_absent_compensated);

      const { error: uErr } = await s
        .from('attendance')
        .update({
          worked_minutes: workedMin,
          interval_minutes: intervalMin,
          daytime_minutes: daytimeMin,
          nighttime_minutes: nighttimeMin,
          expected_minutes: expectedMin,
          bank_credit_minutes: bank.credit,
          bank_debit_minutes: bank.debit,
        })
        .eq('id', row.id);
      if (uErr) {
        errors++;
        console.error(`  ❌ attendance.id=${row.id}: ${uErr.message}`);
      } else {
        updated++;
      }
    }
    console.log(`  → progresso: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }

  console.log('');
  console.log('[migrateApril2026] concluído');
  console.log(`  atualizados:           ${updated}`);
  console.log(`  sem schedule (exp=0):  ${skippedNoSchedule}`);
  console.log(`  sem employee mapeado:  ${skippedNoEmployee}`);
  console.log(`  erros:                 ${errors}`);
}

main().catch(err => {
  console.error('[migrateApril2026] erro fatal:', err);
  process.exit(1);
});
