import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sub-fase 14.4.x — Vitest spec contra edge fn `employee-public-api` (Fase 11.8).
 *
 * Cobre os happy paths das 3 actions que ainda não tinham teste verde:
 *   - set-pin            (configurar PIN inicial)
 *   - save-face          (salvar descriptor + photoUrl)
 *   - log-face-attempt   (registrar tentativa de face match)
 *
 * Estratégia (importante — sem mocks: bate na edge fn real):
 *   1. Cada teste cria um employee FIXTURE próprio com prefixo "PW Test EdgeFn"
 *      (mesmo padrão do tests/cleanup.ts) via Supabase REST com service_role.
 *   2. Após cada teste roda cleanup forte: deleta face_auth_attempts +
 *      employee fixture. Nada toca o Pablo Henrique (id b175d4f3...).
 *   3. Toda chamada à edge fn usa fetch direto com VITE_SUPABASE_ANON_KEY
 *      em Authorization Bearer (verify_jwt:true desde sub-fase 11.4).
 *   4. Se SUPABASE_SERVICE_ROLE_KEY ausente, skipamos com explicação clara.
 *      Sem service_role não conseguimos garantir cleanup nem criar fixtures
 *      isolados (RLS pós-Fase 11 bloqueia anon).
 *
 * Companhia usada: Caratinga (6583bb2a-...).
 */

// ───────────────────────────── env loader ─────────────────────────────

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

const ENV = { ...readDotEnv(), ...process.env };
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? '';
const ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const FN_URL = `${SUPABASE_URL}/functions/v1/employee-public-api`;
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

const HAS_SERVICE_ROLE = Boolean(SERVICE_KEY && SUPABASE_URL && ANON_KEY);

// ───────────────────────── Supabase REST helpers ─────────────────────────

/**
 * Cliente REST direto (sem supabase-js) usando service_role. Tudo é fetch puro
 * pra manter o spec auto-contido e sem deps adicionais.
 */
async function supaInsert<T extends Record<string, unknown>>(
  table: string,
  row: T,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`supaInsert(${table}) ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, unknown>[];
  return data[0];
}

async function supaSelect<T = Record<string, unknown>>(
  table: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`supaSelect(${table}?${query}) ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

async function supaDelete(table: string, query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`supaDelete(${table}?${query}) ${res.status}: ${await res.text()}`);
  }
}

// ───────────────────────── fixture factory ─────────────────────────

/**
 * Gera um CPF random "PW Test EdgeFn" + companhia Caratinga.
 * Nome: 'PW Test EdgeFn <ts>' — pega no scoping de deleteTestEmployees.
 * Note: o CPF gerado é numérico de 11 dígitos mas NÃO é CPF válido —
 * a edge fn não valida dígito verificador.
 */
function generateRandomCpf(): string {
  let cpf = '';
  for (let i = 0; i < 11; i++) cpf += Math.floor(Math.random() * 10);
  return cpf;
}

interface FixtureEmployee {
  id: string;
  cpf: string;
  name: string;
}

async function createFixtureEmployee(label: string): Promise<FixtureEmployee> {
  const cpf = generateRandomCpf();
  const name = `PW Test EdgeFn ${label} ${Date.now()}`;
  const created = await supaInsert<Record<string, unknown>>('employees', {
    name,
    cpf,
    company_id: CARATINGA_ID,
    pin_configured: false,
    face_registered: false,
  });
  return { id: String(created.id), cpf, name };
}

async function cleanupFixtureEmployee(employeeId: string): Promise<void> {
  // Ordem: dependências FK primeiro.
  await supaDelete('face_auth_attempts', `employee_id=eq.${employeeId}`);
  await supaDelete('employees', `id=eq.${employeeId}`);
}

// ───────────────────────── edge fn caller ─────────────────────────

async function callEdgeFn(action: string, payload: Record<string, unknown>): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { _raw: text };
  }
  return { status: res.status, body };
}

// ───────────────────────── tests ─────────────────────────

// Sem service_role não dá pra criar fixtures isolados nem garantir cleanup;
// `describe.skipIf` documenta o motivo no relatório do vitest.
describe.skipIf(!HAS_SERVICE_ROLE)(
  'edge fn employee-public-api — happy paths (set-pin, save-face, log-face-attempt)',
  // Sub-fase 14.13/14.17/14.17.2: timeout 90s + retry 2x — set-pin chama
  // bcrypt.hash que pode bater cold-start absoluto da edge fn (~150s pior caso,
  // ~5s warm). Em CI GitHub Actions o cold-start é frequente. 90s + retry
  // acomoda warm-up sem mascarar bug real.
  { timeout: 90_000, retry: 2 },
  () => {
    let currentEmployee: FixtureEmployee | null = null;

    beforeAll(() => {
      if (!HAS_SERVICE_ROLE) return;
      // Sanity check: env carregado.
      expect(SUPABASE_URL).toMatch(/^https:\/\//);
      expect(ANON_KEY.length).toBeGreaterThan(20);
      expect(SERVICE_KEY.length).toBeGreaterThan(20);
    });

    beforeEach(() => {
      currentEmployee = null;
    });

    afterEach(async () => {
      // Cleanup forte: deleta employee fixture (cascateando face_auth_attempts).
      // NUNCA toca o Pablo Henrique.
      if (currentEmployee) {
        try {
          await cleanupFixtureEmployee(currentEmployee.id);
        } catch (err) {

          console.error('[cleanup afterEach]', err);
        }
        currentEmployee = null;
      }
    });

    it('set-pin: PIN válido (4 dígitos) → {ok:true} + DB atualizado (pin_hash bcrypt, pin=null, pin_configured=true)', async () => {
      // Sub-fase 11.9: set-pin agora grava bcrypt em pin_hash + zera pin plain.
      currentEmployee = await createFixtureEmployee('setpin');

      const { status, body } = await callEdgeFn('set-pin', {
        employeeId: currentEmployee.id,
        newPin: '1234',
      });

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true });

      const [row] = await supaSelect<{ pin: string | null; pin_hash: string | null; pin_configured: boolean }>(
        'employees',
        `select=pin,pin_hash,pin_configured&id=eq.${currentEmployee.id}`,
      );
      expect(row.pin).toBeNull();
      expect(row.pin_hash).toMatch(/^\$2[aby]\$10\$/);
      expect(row.pin_hash!.length).toBe(60);
      expect(row.pin_configured).toBe(true);
    });

    it('set-pin: PIN curto (3 dígitos) → 400 com mensagem clara', async () => {
      currentEmployee = await createFixtureEmployee('setpin-short');

      const { status, body } = await callEdgeFn('set-pin', {
        employeeId: currentEmployee.id,
        newPin: '123',
      });

      expect(status).toBe(400);
      expect(String(body.error ?? '')).toMatch(/PIN/i);

      // DB não deve ter mudado — pin continua null e pin_configured=false.
      const [row] = await supaSelect<{ pin: string | null; pin_configured: boolean }>(
        'employees',
        `select=pin,pin_configured&id=eq.${currentEmployee.id}`,
      );
      expect(row.pin).toBeNull();
      expect(row.pin_configured).toBe(false);
    });

    it('save-face: descriptor 128-float array + photoUrl → {ok:true} + DB face_registered=true', async () => {
      currentEmployee = await createFixtureEmployee('saveface');

      // face-api.js gera descriptor de 128 floats no range [-1, 1].
      const descriptor: number[] = Array.from({ length: 128 }, () => Math.random() * 2 - 1);
      const photoUrl = 'https://example.test/fake-face.png';

      const { status, body } = await callEdgeFn('save-face', {
        employeeId: currentEmployee.id,
        descriptor,
        photoUrl,
      });

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true });

      const [row] = await supaSelect<{
        face_registered: boolean;
        face_reset_requested: boolean;
        face_photo_url: string | null;
        face_descriptor: number[] | null;
        face_registered_at: string | null;
      }>(
        'employees',
        `select=face_registered,face_reset_requested,face_photo_url,face_descriptor,face_registered_at&id=eq.${currentEmployee.id}`,
      );
      expect(row.face_registered).toBe(true);
      expect(row.face_reset_requested).toBe(false);
      expect(row.face_photo_url).toBe(photoUrl);
      expect(Array.isArray(row.face_descriptor)).toBe(true);
      expect(row.face_descriptor).toHaveLength(128);
      // Spot-check: primeiro float bate (jsonb preserva valor).
      expect(row.face_descriptor?.[0]).toBeCloseTo(descriptor[0], 6);
      expect(typeof row.face_registered_at).toBe('string');
    });

    it('log-face-attempt: success=true + confidence + clockType → {ok:true} + linha inserida em face_auth_attempts', async () => {
      currentEmployee = await createFixtureEmployee('logface');

      const { status, body } = await callEdgeFn('log-face-attempt', {
        employeeId: currentEmployee.id,
        companyId: CARATINGA_ID,
        success: true,
        confidence: 0.95,
        clockType: 'entry',
      });

      expect(status).toBe(200);
      expect(body).toEqual({ ok: true });

      const rows = await supaSelect<{
        employee_id: string;
        success: boolean;
        confidence: number | null;
        clock_type: string | null;
        company_id: string;
        date: string;
        attempted_at: string | null;
      }>(
        'face_auth_attempts',
        `select=employee_id,success,confidence,clock_type,company_id,date,attempted_at&employee_id=eq.${currentEmployee.id}`,
      );
      expect(rows).toHaveLength(1);
      const [attempt] = rows;
      expect(attempt.employee_id).toBe(currentEmployee.id);
      expect(attempt.success).toBe(true);
      expect(Number(attempt.confidence)).toBeCloseTo(0.95, 6);
      expect(attempt.clock_type).toBe('entry');
      expect(attempt.company_id).toBe(CARATINGA_ID);
      // date é YYYY-MM-DD no fuso BRT — checa formato e dia razoável.
      expect(attempt.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof attempt.attempted_at).toBe('string');
    });
  },
);

// Mensagem visível mesmo quando o describe inteiro for skipado.
describe.skipIf(HAS_SERVICE_ROLE)(
  'edge fn employee-public-api — skipped (sem SUPABASE_SERVICE_ROLE_KEY)',
  () => {
    it('skip note: defina SUPABASE_SERVICE_ROLE_KEY no .env pra rodar os happy paths', () => {
      // Sem service_role, RLS pós-Fase 11 bloqueia criação/cleanup de fixtures.
      // Rodar com anon poderia deixar lixo no DB ou contaminar o Pablo.
      expect(HAS_SERVICE_ROLE).toBe(false);
    });
  },
);
