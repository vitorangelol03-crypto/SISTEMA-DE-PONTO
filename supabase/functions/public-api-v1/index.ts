// Sub-fase 17.6 + 17.6.1: API pública v1 — endpoints expandidos.
//
// v2 (17.6.1): adiciona /attendance + /payments com filtros + paginação.
// Scopes novos: read:attendance, read:payments. Compatível com keys existentes
// que têm apenas read:employees (não conseguem acessar /attendance ou /payments).
//
// Auth: header `X-API-Key: <key>` + `apikey` ou `Authorization: Bearer <ANON_KEY>`.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, code: string, status: number): Response {
  return jsonResponse({ error: message, code }, status);
}

// Parse pagination params (limit max 500, default 100)
function parsePagination(url: URL): { limit: number; offset: number } {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  return { limit, offset };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, '').replace(/^public-api-v1\/?/, '').replace(/^\/+/, '');

  // Health check (sem auth)
  if (path === '' || path === 'health') {
    return jsonResponse({
      status: 'ok',
      version: 'v1.1',
      endpoints: [
        'GET /employees',
        'GET /attendance?from=YYYY-MM-DD&to=YYYY-MM-DD&employee_id=<uuid>&limit=100&offset=0',
        'GET /payments?period_id=<uuid>&from=&to=&limit=100&offset=0',
      ],
    });
  }

  // Auth
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (!apiKey) return errorResponse('Missing X-API-Key header', 'UNAUTHORIZED', 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: keys, error: keysErr } = await supabase
    .from('api_keys')
    .select('id, key_hash, company_id, scopes, expires_at, revoked_at, call_count')
    .is('revoked_at', null);

  if (keysErr) return errorResponse(`DB error: ${keysErr.message}`, 'INTERNAL', 500);

  let matchedKey: typeof keys[number] | null = null;
  for (const k of keys ?? []) {
    if (k.expires_at && new Date(k.expires_at) < new Date()) continue;
    try {
      if (await bcrypt.compare(apiKey, k.key_hash)) {
        matchedKey = k;
        break;
      }
    } catch { /* skip */ }
  }

  if (!matchedKey) return errorResponse('Invalid or expired API key', 'UNAUTHORIZED', 401);

  // Auto-update last_used_at + call_count (fire-and-forget)
  supabase
    .from('api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      call_count: (matchedKey.call_count || 0) + 1,
    })
    .eq('id', matchedKey.id)
    .then(() => {});

  // ═══ Routing ═══

  // GET /employees
  if (path === 'employees' && req.method === 'GET') {
    if (!matchedKey.scopes.includes('read:employees')) {
      return errorResponse('Key lacks read:employees scope', 'FORBIDDEN', 403);
    }

    const { limit, offset } = parsePagination(url);
    const { data, error, count } = await supabase
      .from('employees')
      .select('id, name, cpf, employment_type, function_role, address, city, state, hire_date, created_at', { count: 'exact' })
      .eq('company_id', matchedKey.company_id)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return errorResponse(error.message, 'INTERNAL', 500);
    return jsonResponse({ employees: data, count, limit, offset });
  }

  // GET /attendance?from=&to=&employee_id=
  if (path === 'attendance' && req.method === 'GET') {
    if (!matchedKey.scopes.includes('read:attendance')) {
      return errorResponse('Key lacks read:attendance scope', 'FORBIDDEN', 403);
    }

    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const employeeId = url.searchParams.get('employee_id');
    const { limit, offset } = parsePagination(url);

    let query = supabase
      .from('attendance')
      .select('id, employee_id, date, status, entry_time, exit_time, exit_time_full, marked_by, approved_by, created_at', { count: 'exact' })
      .eq('company_id', matchedKey.company_id)
      .order('date', { ascending: false })
      .order('id', { ascending: true });

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (employeeId) query = query.eq('employee_id', employeeId);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return errorResponse(error.message, 'INTERNAL', 500);
    return jsonResponse({ attendance: data, count, limit, offset, filters: { from, to, employee_id: employeeId } });
  }

  // GET /payments?period_id=&from=&to=
  if (path === 'payments' && req.method === 'GET') {
    if (!matchedKey.scopes.includes('read:payments')) {
      return errorResponse('Key lacks read:payments scope', 'FORBIDDEN', 403);
    }

    const periodId = url.searchParams.get('period_id');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const employeeId = url.searchParams.get('employee_id');
    const { limit, offset } = parsePagination(url);

    let query = supabase
      .from('payments')
      .select('id, employee_id, date, daily_rate, bonus_b, bonus_c1, bonus_c2, created_by, created_at, updated_at', { count: 'exact' })
      .eq('company_id', matchedKey.company_id)
      .order('date', { ascending: false });

    if (periodId) {
      // Resolve period dates first
      const { data: period } = await supabase
        .from('payment_periods')
        .select('start_date, end_date')
        .eq('id', periodId)
        .eq('company_id', matchedKey.company_id)
        .maybeSingle();
      if (!period) return errorResponse('payment_period not found', 'NOT_FOUND', 404);
      query = query.gte('date', period.start_date).lte('date', period.end_date);
    }
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (employeeId) query = query.eq('employee_id', employeeId);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return errorResponse(error.message, 'INTERNAL', 500);
    return jsonResponse({ payments: data, count, limit, offset, filters: { period_id: periodId, from, to, employee_id: employeeId } });
  }

  return errorResponse(`Unknown endpoint: ${req.method} ${path}`, 'NOT_FOUND', 404);
});
