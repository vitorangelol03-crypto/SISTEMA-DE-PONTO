// Sub-fase 11.3 — Edge fn auth-login v7 (com JWT generation)
//
// Recebe {id, password} → valida (bcrypt | plain fallback) → retorna JWT custom.
// JWT é assinado com `JWT_SECRET` (Edge Function Secret, valor = JWT Secret oficial
// do projeto Supabase, configurado via Dashboard → Settings → Edge Functions).
//
// Variável NÃO pode ter prefixo `SUPABASE_` (Supabase rejeita prefixos reservados),
// por isso usamos `JWT_SECRET` em vez de `SUPABASE_JWT_SECRET`.
//
// RLS policies poderão ler company_id via `auth.jwt() ->> 'company_id'` porque
// o token é assinado com o secret oficial — Supabase Postgres aceita.
//
// Sistema de Ponto: login só por ID numérico + senha (sem email).

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
const JWT_SECRET = Deno.env.get('JWT_SECRET')!;

const supabase = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

function b64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let cryptoKeyPromise: Promise<CryptoKey> | null = null;
function getCryptoKey(): Promise<CryptoKey> {
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
  return cryptoKeyPromise;
}

async function signJWT(payload: Record<string, unknown>): Promise<string> {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await getCryptoKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
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
    if (!JWT_SECRET) {
      console.error('[auth-login] JWT_SECRET not configured');
      return json({ error: 'Server misconfigured', details: 'JWT_SECRET missing' }, 500);
    }

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
    let authMethod: 'bcrypt' | 'plain' | 'none' = 'none';
    if (user.password_hash) {
      try {
        valid = await bcryptjs.compare(String(password), user.password_hash);
        if (valid) authMethod = 'bcrypt';
      } catch (err) {
        console.error('[auth-login] bcrypt error:', err);
      }
    }
    if (!valid && user.password) {
      valid = String(password) === user.password;
      if (valid) authMethod = 'plain';
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
      auth_method: authMethod, // 'bcrypt' ou 'plain' (debug — remover em prod final)
    });
  } catch (err) {
    console.error('[auth-login] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }
});
