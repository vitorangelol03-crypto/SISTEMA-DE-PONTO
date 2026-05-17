import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sub-fase 17.4.2 — Vitest contra edge fn `send-push` (sub-fase 17.4.1).
 *
 * Cobre:
 *   1. Auth: chama auth-login pra pegar JWT custom HS256 admin
 *   2. POST /send-push com body válido → response {ok:true, mocked:true}
 *   3. Log em push_send_log foi escrito
 *   4. Validação: sem auth → 401
 *   5. Validação: body inválido → 400
 *
 * Mocked porque FCM_PROJECT_ID não está em Secrets (Victor pluga depois).
 * Skip se sem service_role pra cleanup.
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
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`;
const AUTH_LOGIN_URL = `${SUPABASE_URL}/functions/v1/auth-login`;
const HAS_SERVICE = Boolean(SERVICE && SUPABASE_URL && ANON);
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

async function sbFetch(table: string, method: 'GET' | 'DELETE', qs = '') {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
  });
}

describe.skipIf(!HAS_SERVICE)('send-push edge fn (sub-fase 17.4.2)', () => {
  let adminJwt = '';

  beforeAll(async () => {
    // Login admin pra pegar JWT custom HS256
    const loginRes = await fetch(AUTH_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ id: '9999', password: '684171', company_id: CARATINGA_ID }),
    });
    expect(loginRes.ok).toBe(true);
    const loginBody = await loginRes.json();
    adminJwt = loginBody.token;
    expect(adminJwt).toBeTruthy();
  });

  afterAll(async () => {
    // Cleanup: deleta logs criados pelos tests (label começa com "Vitest 17.4.2")
    await sbFetch('push_send_log', 'DELETE', `?title=like.Vitest%2017.4.2%25`);
  });

  it('1. Sem Authorization → 401', async () => {
    const res = await fetch(SEND_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ title: 'x', body: 'y', target_type: 'all' }),
    });
    expect(res.status).toBe(401);
  });

  it('2. Body sem title → 400', async () => {
    const res = await fetch(SEND_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON,
        Authorization: `Bearer ${adminJwt}`,
      },
      body: JSON.stringify({ body: 'missing title', target_type: 'all' }),
    });
    expect(res.status).toBe(400);
  });

  it('3. POST válido retorna {ok:true, mocked:true} (sem FCM key)', async () => {
    const res = await fetch(SEND_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON,
        Authorization: `Bearer ${adminJwt}`,
      },
      body: JSON.stringify({
        title: 'Vitest 17.4.2 test',
        body: 'Mocked push notification',
        target_type: 'all',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mocked).toBe(true);
    expect(typeof body.recipients).toBe('number');
  });

  it('4. Log escrito em push_send_log', async () => {
    const r = await sbFetch('push_send_log', 'GET',
      `?title=like.Vitest%2017.4.2%25&select=title,body,target_type,recipients_count,success_count,fail_count&order=sent_at.desc&limit=1`);
    const data = await r.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].title).toMatch(/Vitest 17\.4\.2/);
    expect(data[0].target_type).toBe('all');
    expect(typeof data[0].recipients_count).toBe('number');
  });
});
