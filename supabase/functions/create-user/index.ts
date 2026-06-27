// Sub-fase 11.7 — Edge fn create-user
//
// Substitui o INSERT direto do frontend (database.ts:createUser) que estava
// quebrado pós-Fase 11 (coluna users.password dropada na sub-fase 11.1).
//
// Recebe POST {id, password, role, companyId} com Authorization Bearer JWT
// custom (gerado pelo auth-login). Supabase valida o JWT antes de chamar
// (verify_jwt:true). Edge fn faz permission check + bcrypt + INSERT.
//
// Permissão: caller deve ser admin (role === 'admin') OU supervisor com
// permissions.users.create === true em user_permissions. Mesma lógica do
// validatePermission no frontend (database.ts:330).

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

const supabase = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Decode base64url do payload do JWT sem verificar assinatura (Supabase já
// verificou via verify_jwt:true antes desta função rodar).
function decodeJWTPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

// Replica validatePermission do frontend (database.ts:330) + checkPermission
// de permissions.ts. Mestres '9999'/'2626' sempre OK. Demais: lê user_permissions.permissions
// jsonb e checa `users.create === true`.
async function callerCanCreateUser(callerId: string): Promise<boolean> {
  if (callerId === '9999' || callerId === '2626') return true;

  const { data: caller, error: callerErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (callerErr || !caller) return false;
  if (caller.role === 'admin') return true;

  const { data: permRow } = await supabase
    .from('user_permissions')
    .select('permissions')
    .eq('user_id', callerId)
    .maybeSingle();

  const perms = permRow?.permissions as Record<string, Record<string, boolean>> | null | undefined;
  return Boolean(perms?.users?.create);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401);
    const payload = decodeJWTPayload(auth.slice(7));
    if (!payload?.sub) return json({ error: 'Invalid JWT' }, 401);
    const callerId = String(payload.sub);

    if (!(await callerCanCreateUser(callerId))) {
      return json({ error: 'Forbidden — sem permissão users.create' }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';

    if (!id) return json({ error: 'Invalid id' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 chars' }, 400);
    if (role !== 'supervisor') {
      return json({ error: 'Invalid role — only supervisor can be created' }, 400);
    }
    if (!companyId) return json({ error: 'Invalid companyId' }, 400);

    let passwordHash: string;
    try {
      passwordHash = await bcryptjs.hash(password, 10);
    } catch (err) {
      console.error('[create-user] bcrypt hash error:', err);
      return json({ error: 'Hash error' }, 500);
    }

    const { error: insertErr } = await supabase
      .from('users')
      .insert({
        id,
        password_hash: passwordHash,
        role,
        created_by: callerId,
        company_id: companyId,
      });

    if (insertErr) {
      if (insertErr.code === '23505') return json({ error: 'ID já existe' }, 409);
      console.error('[create-user] insert error:', insertErr);
      return json({ error: 'Insert failed', details: insertErr.message }, 500);
    }

    return json({
      ok: true,
      user: { id, role, company_id: companyId },
    });
  } catch (err) {
    console.error('[create-user] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }
});
