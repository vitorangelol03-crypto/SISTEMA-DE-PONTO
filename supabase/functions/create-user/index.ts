// Sub-fase 11.7 (criação) + Fase A do rework de Usuários, 01/09/2026 (pedido do
// Victor: "vai ter o botão pra redefinir a senha normal, padrão" + nome/telefone
// + real controle de quem pode editar/excluir usuário).
//
// Um único edge fn com dispatcher por `action` — mesmo padrão já usado em
// employee-public-api. Recebe POST {action, ...} com Authorization Bearer JWT
// custom (gerado pelo auth-login). Supabase valida o JWT antes de chamar
// (verify_jwt:true). Cada ação faz seu próprio permission check server-side
// (não confia em nada vindo do frontend) + a operação no banco via service_role.
//
// Ações:
//   create        (default, mantém compat com chamadas antigas sem `action`)
//                 — precisa users.create. Cria supervisor com nome/telefone.
//   update        — precisa users.edit. Só nome/telefone (id/role/company são
//                   imutáveis: id é PK referenciada em texto solto por outras
//                   tabelas, mudar quebraria histórico).
//   resetPassword — precisa users.resetPassword. Seta senha padrão
//                   (DEFAULT_PASSWORD) + must_change_password=true.
//   delete        — precisa users.delete. Bloqueia auto-exclusão e exclusão
//                   de mestre (mesma regra que já existia no frontend, agora
//                   também aplicada aqui — o frontend fazia DELETE direto no
//                   Supabase antes, sem esse checkpoint server-side).
//   changeOwnPassword — sem permissão de módulo: qualquer usuário autenticado
//                   pode trocar A PRÓPRIA senha (alvo é sempre o `sub` do JWT,
//                   nunca um `id` vindo do body). Usada na tela de "defina uma
//                   senha nova" obrigatória após um reset (must_change_password).
//
// bcryptjs.hash() (async) trava no runtime Deno deste projeto (bug já visto e
// documentado em set-pin/verify-pin) — usa hashSync em vez de hash.

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

// Senha padrão aplicada por "Redefinir senha" — decisão do Victor (01/09/2026):
// "Padrão (mesma senha pra todo mundo, recomendado) apos o priemir acesso
// coloca a senha que quiser". must_change_password força a troca no próximo login.
const DEFAULT_PASSWORD = 'mudar123';

const MASTER_IDS = ['9999', '2626'];

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

// Replica validatePermission do frontend (database.ts) + checkPermission de
// permissions.ts. Mestres '9999'/'2626' sempre OK. Demais: lê
// user_permissions.permissions jsonb e checa `users.<action> === true`.
async function callerHasUsersPermission(callerId: string, action: string): Promise<boolean> {
  if (MASTER_IDS.includes(callerId)) return true;

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
  return Boolean(perms?.users?.[action]);
}

async function handleCreate(callerId: string, body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (!id) return json({ error: 'Invalid id' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 chars' }, 400);
  if (role !== 'supervisor') {
    return json({ error: 'Invalid role — only supervisor can be created' }, 400);
  }
  if (!companyId) return json({ error: 'Invalid companyId' }, 400);

  let passwordHash: string;
  try {
    passwordHash = bcryptjs.hashSync(password, 10);
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
      name: name || null,
      phone: phone || null,
    });

  if (insertErr) {
    if (insertErr.code === '23505') return json({ error: 'ID já existe' }, 409);
    console.error('[create-user] insert error:', insertErr);
    return json({ error: 'Insert failed', details: insertErr.message }, 500);
  }

  return json({ ok: true, user: { id, role, company_id: companyId, name: name || null, phone: phone || null } });
}

async function handleUpdate(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return json({ error: 'Invalid id' }, 400);
  if (!('name' in body) && !('phone' in body)) {
    return json({ error: 'Nothing to update' }, 400);
  }

  const update: Record<string, string | null> = {};
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    update.name = name || null;
  }
  if ('phone' in body) {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    update.phone = phone || null;
  }

  const { data, error: updateErr } = await supabase
    .from('users')
    .update(update)
    .eq('id', id)
    .select('id, role, name, phone')
    .maybeSingle();

  if (updateErr) {
    console.error('[create-user:update] error:', updateErr);
    return json({ error: 'Update failed', details: updateErr.message }, 500);
  }
  if (!data) return json({ error: 'Usuário não encontrado' }, 404);

  return json({ ok: true, user: data });
}

async function handleResetPassword(id: string) {
  if (!id) return json({ error: 'Invalid id' }, 400);

  let passwordHash: string;
  try {
    passwordHash = bcryptjs.hashSync(DEFAULT_PASSWORD, 10);
  } catch (err) {
    console.error('[create-user:resetPassword] bcrypt hash error:', err);
    return json({ error: 'Hash error' }, 500);
  }

  const { data, error: updateErr } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, must_change_password: true })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (updateErr) {
    console.error('[create-user:resetPassword] error:', updateErr);
    return json({ error: 'Reset failed', details: updateErr.message }, 500);
  }
  if (!data) return json({ error: 'Usuário não encontrado' }, 404);

  return json({ ok: true, defaultPassword: DEFAULT_PASSWORD });
}

async function handleChangeOwnPassword(callerId: string, body: Record<string, unknown>) {
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < 6) return json({ error: 'Password must be at least 6 chars' }, 400);

  let passwordHash: string;
  try {
    passwordHash = bcryptjs.hashSync(newPassword, 10);
  } catch (err) {
    console.error('[create-user:changeOwnPassword] bcrypt hash error:', err);
    return json({ error: 'Hash error' }, 500);
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, must_change_password: false })
    .eq('id', callerId);

  if (updateErr) {
    console.error('[create-user:changeOwnPassword] error:', updateErr);
    return json({ error: 'Update failed', details: updateErr.message }, 500);
  }

  return json({ ok: true });
}

async function handleDelete(callerId: string, id: string) {
  if (!id) return json({ error: 'Invalid id' }, 400);
  if (id === callerId) return json({ error: 'Não é possível excluir o próprio usuário' }, 400);
  if (MASTER_IDS.includes(id)) return json({ error: 'Não é possível excluir o administrador principal' }, 400);

  const { error: deleteErr } = await supabase.from('users').delete().eq('id', id);
  if (deleteErr) {
    console.error('[create-user:delete] error:', deleteErr);
    return json({ error: 'Delete failed', details: deleteErr.message }, 500);
  }

  return json({ ok: true });
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

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const action = typeof body.action === 'string' ? body.action : 'create';

    if (!['create', 'update', 'resetPassword', 'delete', 'changeOwnPassword'].includes(action)) {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    // changeOwnPassword não passa pelo checkpoint de permissão de módulo —
    // qualquer usuário autenticado (JWT já validado por verify_jwt:true) pode
    // trocar a PRÓPRIA senha; o alvo é sempre callerId, nunca vem do body.
    if (action === 'changeOwnPassword') {
      return await handleChangeOwnPassword(callerId, body);
    }

    if (!(await callerHasUsersPermission(callerId, action))) {
      return json({ error: `Forbidden — sem permissão users.${action}` }, 403);
    }

    switch (action) {
      case 'create':
        return await handleCreate(callerId, body);
      case 'update':
        return await handleUpdate(body);
      case 'resetPassword':
        return await handleResetPassword(typeof body.id === 'string' ? body.id.trim() : '');
      case 'delete':
        return await handleDelete(callerId, typeof body.id === 'string' ? body.id.trim() : '');
    }
  } catch (err) {
    console.error('[create-user] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }

  return json({ error: 'Unreachable' }, 500);
});
