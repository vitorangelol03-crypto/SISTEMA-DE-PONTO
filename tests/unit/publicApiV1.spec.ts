import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sub-fase 17.6.2 — Vitest contra edge fn `public-api-v1` (Fase 17.6 + 17.6.1).
 *
 * Cobre endpoints:
 *   - GET /health (sem auth)
 *   - GET /employees (scope read:employees)
 *   - GET /attendance?from=&to=&limit= (scope read:attendance)
 *   - GET /payments?limit= (scope read:payments)
 *
 * Estratégia:
 *   1. beforeAll cria API key via service_role com 3 scopes
 *   2. Cada teste chama edge fn com X-API-Key + ANON_KEY
 *   3. afterAll deleta a API key
 *   4. Skip todo o describe se service_role ausente
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
const ANON = ENV.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const FN_URL = `${SUPABASE_URL}/functions/v1/public-api-v1`;
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const TEST_KEY_PLAIN = `sp_test_v1_unit_${Date.now()}`;
const HAS_SERVICE = Boolean(SERVICE && SUPABASE_URL && ANON);

async function sbFetch(table: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, qs = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${qs}`;
  return fetch(url, {
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

async function apiFetch(p: string, key: string = TEST_KEY_PLAIN) {
  return fetch(`${FN_URL}/${p}`, {
    headers: {
      'X-API-Key': key,
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
  });
}

describe.skipIf(!HAS_SERVICE)('public-api-v1 endpoints (sub-fase 17.6.2)', () => {
  let keyId = '';

  beforeAll(async () => {
    // Cleanup defensivo
    await sbFetch('api_keys', 'DELETE', null, `?label=eq.${encodeURIComponent('Test public-api-v1 (vitest 17.6.2)')}`);

    // pgcrypto.crypt hash via RPC seria mais limpo, mas como não tem RPC pública
    // pra isso, usamos a função do supabase admin (REST) com bcrypt embarcado
    // OU criamos a row e pegamos o ID. A edge fn faz bcrypt.compare(plain, hash)
    // então o hash precisa ser bcrypt-compatible.
    //
    // Como não temos acesso a bcrypt em vitest direto sem instalar dep,
    // usamos a função RPC `crypt` via PostgREST (extension pgcrypto):
    const cryptRpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_test_bcrypt_hash`, {
      method: 'POST',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plain: TEST_KEY_PLAIN }),
    });

    if (!cryptRpc.ok) {
      throw new Error(`_test_bcrypt_hash RPC failed: ${cryptRpc.status} ${await cryptRpc.text()}`);
    }
    const keyHash = (await cryptRpc.json()) as string;

    const insert = await sbFetch('api_keys', 'POST', [{
      key_hash: keyHash,
      key_prefix: TEST_KEY_PLAIN.slice(0, 8),
      label: 'Test public-api-v1 (vitest 17.6.2)',
      company_id: CARATINGA_ID,
      scopes: ['read:employees', 'read:attendance', 'read:payments'],
      created_by: '9999',
    }]);
    const data = await insert.json();
    keyId = data[0]?.id;
    expect(keyId).toBeTruthy();
  });

  afterAll(async () => {
    if (keyId) {
      await sbFetch('api_keys', 'DELETE', null, `?id=eq.${keyId}`);
    }
  });

  it('1. GET /health (sem auth) retorna status ok + endpoints', async () => {
    const res = await fetch(`${FN_URL}/health`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^v1/);
    expect(Array.isArray(body.endpoints)).toBe(true);
  });

  it('2. GET /employees retorna lista da empresa', async () => {
    const res = await apiFetch('employees?limit=5');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.employees)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect(body.count).toBeGreaterThan(0);
    expect(body.limit).toBe(5);
  });

  it('3. GET /attendance retorna lista paginada', async () => {
    const res = await apiFetch('attendance?limit=3');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.attendance)).toBe(true);
    expect(body.filters).toMatchObject({ from: null, to: null });
  });

  it('4. GET /payments retorna lista paginada', async () => {
    const res = await apiFetch('payments?limit=3');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.payments)).toBe(true);
    expect(body.limit).toBe(3);
  });

  it('5. X-API-Key inválido retorna 401', async () => {
    const res = await apiFetch('employees', 'sp_invalid_key_xxx');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('6. Endpoint desconhecido retorna 404', async () => {
    const res = await apiFetch('totally-fake-endpoint');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });
});
