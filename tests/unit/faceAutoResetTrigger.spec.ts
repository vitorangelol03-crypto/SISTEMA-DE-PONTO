import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sub-fase 17.3.2 — Vitest contra trigger DB `_check_face_auto_reset`
 * (sub-fase 17.3, AFTER INSERT em face_auth_attempts).
 *
 * Cobre 3 cenários:
 *   1. Threshold padrão 5: 5 falhas → face_reset_requested = true
 *   2. <5 falhas → face_reset_requested fica false
 *   3. Threshold 0 desliga auto-reset (mesmo com N falhas)
 *
 * Cleanup forte em cada teste pra não poluir face_auth_attempts em prod.
 * Caratinga used (face_recognition_config exists). Skip se sem service_role.
 */

function readEnv(): Record<string, string> {
  const p = path.join(process.cwd(), '.env');
  if (!fs.existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const ENV = { ...readEnv(), ...process.env };
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? '';
const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const HAS_SERVICE = Boolean(SERVICE && SUPABASE_URL);

async function sbFetch(table: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, qs = '') {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function getFaceReset(employeeId: string): Promise<boolean> {
  const r = await sbFetch('employees', 'GET', null, `?id=eq.${employeeId}&select=face_reset_requested`);
  const data = await r.json();
  return Boolean(data[0]?.face_reset_requested);
}

async function setFaceReset(employeeId: string, val: boolean) {
  await sbFetch('employees', 'PATCH', { face_reset_requested: val }, `?id=eq.${employeeId}`);
}

async function setThresholds(maxAttempts: number, windowMin: number) {
  await sbFetch('face_recognition_config', 'PATCH', {
    max_attempts_before_reset: maxAttempts,
    attempts_window_minutes: windowMin,
  }, `?company_id=eq.${CARATINGA_ID}`);
}

async function insertAttempts(employeeId: string, n: number, success: boolean) {
  const rows = Array.from({ length: n }, (_, i) => ({
    employee_id: employeeId,
    date: new Date().toISOString().split('T')[0],
    attempted_at: new Date(Date.now() - i * 1000).toISOString(),
    success,
    confidence: success ? 0.95 : 0.3,
    clock_type: 'entry',
    company_id: CARATINGA_ID,
  }));
  await sbFetch('face_auth_attempts', 'POST', rows);
}

async function deleteRecentAttempts(employeeId: string) {
  // Deleta attempts dos últimos 10 minutos (teste)
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  await sbFetch('face_auth_attempts', 'DELETE', null, `?employee_id=eq.${employeeId}&attempted_at=gte.${since}`);
}

describe.skipIf(!HAS_SERVICE)('face auto-reset trigger (sub-fase 17.3.2)', () => {
  let testEmployeeId = '';
  let originalMax = 5;
  let originalWindow = 60;

  beforeAll(async () => {
    // Pega 1 employee real de Caratinga
    const r = await sbFetch('employees', 'GET', null, `?company_id=eq.${CARATINGA_ID}&limit=1&select=id`);
    const data = await r.json();
    testEmployeeId = data[0]?.id;
    expect(testEmployeeId).toBeTruthy();

    // Salva config original
    const cfgR = await sbFetch('face_recognition_config', 'GET', null,
      `?company_id=eq.${CARATINGA_ID}&select=max_attempts_before_reset,attempts_window_minutes`);
    const cfg = await cfgR.json();
    originalMax = cfg[0]?.max_attempts_before_reset ?? 5;
    originalWindow = cfg[0]?.attempts_window_minutes ?? 60;
  });

  beforeEach(async () => {
    // Reset state defensivo antes de cada teste
    await deleteRecentAttempts(testEmployeeId);
    await setFaceReset(testEmployeeId, false);
  });

  afterAll(async () => {
    // Cleanup + restaura config original
    await deleteRecentAttempts(testEmployeeId);
    await setFaceReset(testEmployeeId, false);
    await setThresholds(originalMax, originalWindow);
  });

  it('1. Threshold padrão (5/60min): 5 falhas dispara face_reset_requested=true', async () => {
    await setThresholds(5, 60);
    expect(await getFaceReset(testEmployeeId)).toBe(false);
    await insertAttempts(testEmployeeId, 5, false);
    expect(await getFaceReset(testEmployeeId)).toBe(true);
  });

  it('2. Menos que threshold (4 falhas) NÃO dispara reset', async () => {
    await setThresholds(5, 60);
    await insertAttempts(testEmployeeId, 4, false);
    expect(await getFaceReset(testEmployeeId)).toBe(false);
  });

  it('3. Threshold = 0 DESLIGA auto-reset (mesmo com 10 falhas)', async () => {
    await setThresholds(0, 60);
    await insertAttempts(testEmployeeId, 10, false);
    expect(await getFaceReset(testEmployeeId)).toBe(false);
  });

  it('4. Sucessos NÃO contam (5 success → reset stays false)', async () => {
    await setThresholds(5, 60);
    await insertAttempts(testEmployeeId, 5, true);
    expect(await getFaceReset(testEmployeeId)).toBe(false);
  });
});
