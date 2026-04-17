/**
 * Cleanup utilities for Playwright E2E tests.
 *
 * These helpers connect directly to Supabase (anon key, no RLS on this DB)
 * to remove any rows that tests might have left behind.
 *
 * Strategy: every cleanup helper is SCOPED — it only removes rows that are
 * clearly owned by tests:
 *   - `bonus_removals` with the known test observation string
 *   - employees with name starting with `PW Test ` (test marker)
 *   - `bonuses`, `attendance` and `payments` rows created AT/AFTER a given
 *     timestamp AND dated today (so real data from yesterday or earlier
 *     is never touched).
 *
 * The whole suite should ideally run against a separate test DB. Until then,
 * these cleanups keep the production DB free of dirty test data.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Marcadores explícitos usados pelos testes (devem bater com os strings/nomes
// usados nos specs).
export const TEST_BONUS_REMOVAL_OBSERVATION = 'Limpeza automatizada dos testes Playwright';
export const TEST_EMPLOYEE_NAME_PREFIX = 'PW Test ';

// Arquivo temporário usado por globalSetup/globalTeardown para trocar o
// timestamp de início da suíte.
export const SUITE_START_FILE = path.join(process.cwd(), 'tests', '.suite-start.tmp');

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

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (_client) return _client;
  const env = { ...readDotEnv(), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Cleanup: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes no .env');
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

function todayIso(): string {
  // Mesmo formato que a app usa (YYYY-MM-DD no fuso de São Paulo).
  const now = new Date();
  const offset = -3 * 60; // BRT
  const local = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Remove todas as linhas de auditoria (`bonus_removals`) que foram geradas
 * pelos testes, identificadas pelo texto fixo em `observation`.
 */
export async function deleteTestBonusRemovals(): Promise<number> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('bonus_removals')
    .delete()
    .eq('observation', TEST_BONUS_REMOVAL_OBSERVATION)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

/**
 * Remove funcionários criados por testes (prefixo `PW Test `).
 * Antes de apagar, também remove qualquer attendance/payment vinculado —
 * se houver FK sem cascade, a deleção do employee falharia.
 */
export async function deleteTestEmployees(): Promise<number> {
  const supabase = getClient();
  const { data: emps, error: selErr } = await supabase
    .from('employees')
    .select('id')
    .like('name', `${TEST_EMPLOYEE_NAME_PREFIX}%`);
  if (selErr) throw selErr;
  const ids = (emps || []).map(e => e.id);
  if (ids.length === 0) return 0;

  await supabase.from('attendance').delete().in('employee_id', ids);
  await supabase.from('payments').delete().in('employee_id', ids);
  await supabase.from('bonus_removals').delete().in('employee_id', ids);

  const { error: delErr } = await supabase.from('employees').delete().in('id', ids);
  if (delErr) throw delErr;
  return ids.length;
}

/**
 * Apaga registros de `bonuses`, `attendance` e reseta colunas de bônus em
 * `payments` — mas apenas para a data de hoje e apenas para linhas criadas
 * em/depois de `sinceIso`. Isso garante que registros legítimos preexistentes
 * sejam preservados.
 */
export async function cleanupTodaySince(sinceIso: string): Promise<{
  bonuses: number;
  attendance: number;
  paymentsReset: number;
}> {
  const supabase = getClient();
  const today = todayIso();

  const { data: delBonuses } = await supabase
    .from('bonuses')
    .delete()
    .eq('date', today)
    .gte('created_at', sinceIso)
    .select('id');

  const { data: delAttendance } = await supabase
    .from('attendance')
    .delete()
    .eq('date', today)
    .gte('created_at', sinceIso)
    .select('id');

  // Para payments, não deletamos: apenas zeramos as colunas de bônus se
  // foram tocadas durante a suíte. Isso evita apagar pagamentos reais.
  const { data: touchedPayments } = await supabase
    .from('payments')
    .select('id, bonus, bonus_b, bonus_c1, bonus_c2, daily_rate, updated_at')
    .eq('date', today)
    .gte('updated_at', sinceIso);

  let paymentsReset = 0;
  for (const p of touchedPayments || []) {
    const dailyRate = Number(p.daily_rate) || 0;
    await supabase
      .from('payments')
      .update({
        bonus: 0,
        bonus_b: 0,
        bonus_c1: 0,
        bonus_c2: 0,
        total: dailyRate,
      })
      .eq('id', p.id);
    paymentsReset++;
  }

  // Também apaga quaisquer bonus_removals criadas durante a suíte, caso um
  // teste tenha gerado registros de remoção com outro texto de observação.
  await supabase
    .from('bonus_removals')
    .delete()
    .gte('created_at', sinceIso)
    .eq('date', today);

  return {
    bonuses: (delBonuses || []).length,
    attendance: (delAttendance || []).length,
    paymentsReset,
  };
}

/**
 * Faz limpeza completa: testes removidos + remove dados de hoje criados
 * a partir de `sinceIso`. Use em globalTeardown e em afterAll por spec.
 */
export async function cleanupAllTestArtifacts(sinceIso: string): Promise<void> {
  await deleteTestBonusRemovals();
  await deleteTestEmployees();
  await cleanupTodaySince(sinceIso);
}

/**
 * Lê o timestamp escrito pelo globalSetup. Se não existir, usa agora (fallback
 * conservador — pega janela pequena).
 */
export function readSuiteStart(): string {
  try {
    if (fs.existsSync(SUITE_START_FILE)) {
      return fs.readFileSync(SUITE_START_FILE, 'utf8').trim();
    }
  } catch { /* noop */ }
  return new Date().toISOString();
}
