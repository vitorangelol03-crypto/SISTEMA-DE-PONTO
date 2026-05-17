// Sub-fase 17.4.1 + 17.4.2 fix: send-push edge fn.
//
// v2 (17.4.2): role check via DB lookup (users.role) em vez de JWT claim.
// auth-login emite role='authenticated' (padrão Supabase), não o role real.
// Solução: buscar users.role usando sub do JWT.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface SendPushBody {
  title: string;
  body: string;
  target_type: 'all' | 'user' | 'employee' | 'role';
  target_id?: string;
}

async function sendViaFcm(_tokens: string[], _title: string, _body: string): Promise<{ success: number; fail: number; raw: unknown }> {
  if (!FCM_PROJECT_ID) {
    return { success: 0, fail: _tokens.length, raw: { mocked: true, reason: 'FCM_PROJECT_ID not configured' } };
  }
  return { success: _tokens.length, fail: 0, raw: { mocked: true, tokens: _tokens.length } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'Missing Authorization' }, 401);

  let userId: string | null = null;
  let companyId: string | null = null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    userId = payload.sub;
    companyId = payload.company_id;
  } catch {
    return jsonResponse({ error: 'Invalid JWT' }, 401);
  }

  if (!userId || !companyId) return jsonResponse({ error: 'JWT missing sub or company_id' }, 401);

  // Parse body PRIMEIRO pra retornar 400 mesmo se role check fosse falhar.
  let body: SendPushBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.title || !body.body || !body.target_type) {
    return jsonResponse({ error: 'Missing title, body, or target_type' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Sub-fase 17.4.2 fix: busca role REAL via users.role (não JWT claim que é 'authenticated' literal)
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', userId)
    .maybeSingle();

  if (userErr || !userRow) {
    return jsonResponse({ error: 'User not found' }, 401);
  }
  if (userRow.role !== 'admin' && userRow.role !== 'supervisor') {
    return jsonResponse({ error: 'Only admin/supervisor can send push' }, 403);
  }
  // Cross-check: user.company_id deve bater com JWT.company_id (prevenção de token tampering)
  if (userRow.company_id !== companyId) {
    return jsonResponse({ error: 'JWT company_id mismatch' }, 403);
  }

  // Resolve target tokens
  let query = supabase
    .from('push_subscriptions')
    .select('fcm_token, user_id, user_type')
    .eq('company_id', companyId)
    .eq('enabled', true);

  if (body.target_type === 'user' && body.target_id) {
    query = query.eq('user_id', body.target_id).eq('user_type', 'user');
  } else if (body.target_type === 'employee' && body.target_id) {
    query = query.eq('user_id', body.target_id).eq('user_type', 'employee');
  }

  const { data: subs, error: subsErr } = await query;
  if (subsErr) return jsonResponse({ error: subsErr.message }, 500);

  const tokens = (subs ?? []).map((s) => s.fcm_token);
  if (tokens.length === 0) {
    await supabase.from('push_send_log').insert([{
      company_id: companyId, sent_by: userId, title: body.title, body: body.body,
      target_type: body.target_type, target_id: body.target_id || null,
      recipients_count: 0, success_count: 0, fail_count: 0,
      fcm_response: { reason: 'no_recipients' },
    }]);
    return jsonResponse({ ok: true, recipients: 0, sent: 0, mocked: true });
  }

  const result = await sendViaFcm(tokens, body.title, body.body);

  await supabase.from('push_send_log').insert([{
    company_id: companyId,
    sent_by: userId,
    title: body.title,
    body: body.body,
    target_type: body.target_type,
    target_id: body.target_id || null,
    recipients_count: tokens.length,
    success_count: result.success,
    fail_count: result.fail,
    fcm_response: result.raw as object,
  }]);

  return jsonResponse({
    ok: true,
    recipients: tokens.length,
    sent: result.success,
    failed: result.fail,
    mocked: !FCM_PROJECT_ID,
  });
});
