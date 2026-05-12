// Sub-fase 11.3 — Edge fn auth-login
// Recebe {id, password} → valida (bcrypt | plain fallback) → retorna JWT custom.
//
// Sistema de Ponto: login só por ID numérico + senha (sem email). JWT carrega
// company_id como custom claim — policies RLS vão ler via auth.jwt() ->> 'company_id'.
//
// Estratégia de migração (FASE 11.3):
//   - Edge fn aceita password_hash (bcrypt) OU password (plain legacy).
//   - Após esta fn rodar 1× pra cada user, password_hash fica populado.
//   - Cutover atômico (11.1) dropa password plain — só password_hash sobrevive.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import bcryptjs from 'https://esm.sh/bcryptjs@2.4.3';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRV = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET')!;

const supabase = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

function b64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signJWT(payload: Record<string, unknown>): Promise<string> {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = b64urlEncode(new Uint8Array(sig));
  return `${data}.${sigB64}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { id, password } = await req.json();
    if (!id || !password) return json({ error: 'Missing id or password' }, 400);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, company_id, password, password_hash')
      .eq('id', String(id).trim())
      .maybeSingle();

    if (error) {
      console.error('[auth-login] db error:', error);
      return json({ error: 'Database error', details: error.message }, 500);
    }
    if (!user) return json({ error: 'Invalid credentials' }, 401);

    let valid = false;
    if (user.password_hash) {
      try {
        valid = await bcryptjs.compare(String(password), user.password_hash);
      } catch (err) {
        console.error('[auth-login] bcrypt.compare error:', err);
      }
    }
    if (!valid && user.password) {
      valid = String(password) === user.password;
    }
    if (!valid) return json({ error: 'Invalid credentials' }, 401);

    const now = Math.floor(Date.now() / 1000);
    const jwt = await signJWT({
      sub: user.id,
      role: 'authenticated',
      aud: 'authenticated',
      company_id: user.company_id,
      iat: now,
      exp: now + 60 * 60 * 24, // 24h
    });

    return json({
      token: jwt,
      user: { id: user.id, company_id: user.company_id },
    });
  } catch (err) {
    console.error('[auth-login] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }
});
