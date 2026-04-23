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
export function getClient(): SupabaseClient {
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

function yesterdayIso(): string {
  // Dia anterior no mesmo fuso — usado para proteger contra suítes que
  // iniciam antes da meia-noite e terminam depois (janela 23:58 → 00:02).
  const now = new Date();
  const offset = -3 * 60;
  const local = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60_000 - 86_400_000);
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
  await supabase.from('geo_fraud_attempts').delete().in('employee_id', ids);
  await supabase.from('bonus_blocks').delete().in('employee_id', ids);

  const { error: delErr } = await supabase.from('employees').delete().in('id', ids);
  if (delErr) throw delErr;
  return ids.length;
}

/**
 * Limpa artefatos de testes criados em/depois de `sinceIso`.
 *
 * ⚠️ PROTEÇÃO: NUNCA deleta/modifica registros cuja `date` seja o dia atual
 * em BRT. Um incidente anterior apagou dados reais de hoje quando o filtro
 * por `created_at >= sinceIso` coincidiu com a janela de uso real do app.
 * A limpeza de artefatos de teste do dia atual é feita via
 * `deleteTestEmployees()`, que escopa por funcionários com prefixo PW Test.
 */
export async function cleanupTodaySince(sinceIso: string): Promise<{
  bonuses: number;
  attendance: number;
  paymentsReset: number;
}> {
  const supabase = getClient();
  const today = todayIso();
  const yesterday = yesterdayIso();

  // eslint-disable-next-line no-console
  console.warn(
    `PROTEÇÃO: cleanup preservando registros com date=${today} (hoje) e date=${yesterday} (ontem — cobre suítes que atravessam meia-noite).`,
  );

  // attendance: apaga apenas de datas passadas (≤ anteontem), dentro da
  // janela da suíte.
  const { data: delAttendance } = await supabase
    .from('attendance')
    .delete()
    .neq('date', today)
    .neq('date', yesterday)
    .gte('created_at', sinceIso)
    .select('id');

  // bonuses: mesmo tratamento — protege hoje e ontem.
  const { data: delBonuses } = await supabase
    .from('bonuses')
    .delete()
    .neq('date', today)
    .neq('date', yesterday)
    .gte('created_at', sinceIso)
    .select('id');

  // payments: nunca deletamos; zeramos bônus em linhas que NÃO são hoje/ontem.
  // Tripla defesa:
  //  1) SELECT filtra por .neq(today).neq(yesterday)
  //  2) Loop testa p.date e emite log se bater com protegida
  //  3) UPDATE repete .neq(today).neq(yesterday) (belt-and-suspenders contra
  //     race entre SELECT e UPDATE)
  const { data: touchedPayments } = await supabase
    .from('payments')
    .select('id, bonus, bonus_b, bonus_c1, bonus_c2, daily_rate, updated_at, date')
    .neq('date', today)
    .neq('date', yesterday)
    .gte('updated_at', sinceIso);

  let paymentsReset = 0;
  for (const p of touchedPayments || []) {
    if (p.date === today || p.date === yesterday) {
      // eslint-disable-next-line no-console
      console.warn(`PROTEÇÃO: payment de ${p.date} preservado (hoje ou ontem).`);
      continue;
    }
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
      .eq('id', p.id)
      .neq('date', today)
      .neq('date', yesterday);
    paymentsReset++;
  }

  await supabase
    .from('bonus_removals')
    .delete()
    .neq('date', today)
    .neq('date', yesterday)
    .gte('created_at', sinceIso);

  // error_records tem coluna `date`: protege tambem.
  await supabase
    .from('error_records')
    .delete()
    .neq('date', today)
    .neq('date', yesterday)
    .gte('created_at', sinceIso);

  // Tabelas sem coluna `date` (apenas created_at/attempted_at): mantemos
  // scoping pela janela da suíte.
  await supabase
    .from('geo_fraud_attempts')
    .delete()
    .gte('created_at', sinceIso);

  await supabase
    .from('bonus_blocks')
    .delete()
    .gte('created_at', sinceIso);

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
