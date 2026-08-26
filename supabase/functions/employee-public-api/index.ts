// Sub-fase 11.8 — Edge fn employee-public-api
//
// Roteia operações públicas do app funcionário (/clock e /erros) que
// precisam bypassar RLS (anon não passa nas policies que exigem
// auth.jwt() ->> 'company_id' porque o app público não tem JWT custom).
//
// verify_jwt:false — fluxo público. Segurança vem do filtro estrito
// por (cpf, companyId) ou (employeeId, companyId) + verificação de PIN
// quando aplicável. Não expõe enumeração broad — sempre exige CPF/ID.
//
// Actions (todas POST):
//   lookup-companies-by-cpf  { cpf } → { companies: Company[] }
//   lookup-employee          { cpf, companyId } → { employee: Employee | null }
//   verify-pin               { employeeId, pin } → { valid: boolean }
//     26/08 (fix): compara por bcrypt contra pin_hash quando existir (migração
//     de 14/05 já converteu 70 funcionários pra hash e zerou o pin plain —
//     esta ação só comparava com o pin plain, travando o login de todo mundo
//     que já tinha PIN configurado). Fallback pro pin plain só sobra pra quem
//     ainda não tem pin_hash.
//   set-pin                  { employeeId, newPin } → { ok: true }
//     26/08 (fix): passa a gravar em pin_hash (bcrypt), não mais em pin plain
//     — fecha o mesmo buraco pra quem configura o PIN a partir de agora.
//   today-attendance         { employeeId, companyId } → { attendance: Attendance | null }
//   attendance-history       { employeeId, companyId, days } → { history: Attendance[] }
//   face-config              { companyId } → { enabled: boolean }
//   face-descriptor          { employeeId } → { descriptor: number[] | null }
//   save-face                { employeeId, photoUrl, descriptor } → { ok: true }
//   log-face-attempt         { employeeId, success, confidence, clockType, companyId } → { ok: true }
//   employee-errors-by-period { employeeId, periodId, companyId } → { period, individual_errors, triage_errors, total_individual, total_triage }
//   employee-error-periods    { employeeId, companyId } → { periods: Array<{ period, has_errors, total_errors }> }
//   register-employee        { companyId, name, cpf, phone, pixKey, pixType, functionRole } → { employee: { id } }
//     Sub-fase 26/08 — cadastro público de funcionário novo (link sem login,
//     página /cadastro). Grava registration_status='pending', employment_type
//     fixo 'Diarista' e function_role = a função escolhida (2ª leva 26/08).
//   list-function-roles      { companyId } → { roles: string[] }
//     2ª leva 26/08 — funções (function_role) já usadas na empresa, pro
//     <select> da página pública de cadastro.

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

function getBrazilDateString(): string {
  const now = new Date();
  const local = new Date(now.getTime() + (-3 * 60) * 60_000);
  return local.toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;

// ─── Action handlers ──────────────────────────────────────────────────────────

async function lookupCompaniesByCpf(body: Body): Promise<Response> {
  const cpf = String(body.cpf ?? '').replace(/\D/g, '');
  if (!cpf) return json({ error: 'Invalid cpf' }, 400);

  const { data, error } = await supabase
    .from('employees')
    .select('companies(*)')
    .eq('cpf', cpf);
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const row of (data ?? []) as Array<{ companies: { id: string } | { id: string }[] | null }>) {
    const c = row.companies;
    if (!c) continue;
    const arr = Array.isArray(c) ? c : [c];
    for (const co of arr) {
      if (co && !seen.has(co.id)) {
        seen.add(co.id);
        out.push(co);
      }
    }
  }
  return json({ companies: out });
}

// Sub-fase 26/08 (2ª leva) — lista as funções (function_role) já usadas na
// empresa, pra página pública oferecer como <select> (não texto livre).
// Mesma lógica de getFunctionRoles (database.ts), só que pública porque RLS
// de employees bloqueia anon.
async function listFunctionRoles(body: Body): Promise<Response> {
  const companyId = String(body.companyId ?? '').trim();
  if (!companyId) return json({ error: 'Invalid companyId' }, 400);

  const { data, error } = await supabase
    .from('employees')
    .select('function_role')
    .eq('company_id', companyId)
    .not('function_role', 'is', null);
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  const unique = new Set<string>();
  for (const row of (data ?? []) as Array<{ function_role: string | null }>) {
    const v = row.function_role?.trim();
    if (v) unique.add(v);
  }
  const roles = Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return json({ roles });
}

// Sub-fase 26/08 — cadastro público de funcionário novo (link sem login).
// Sempre grava pending: a análise de antecedentes acontece depois, na aba
// "Aprovação de Cadastro" do painel. Enquanto pending, o funcionário já bate
// ponto normal (bloqueio só entra se alguém recusar o cadastro).
// 2ª leva (26/08): todo cadastro por este link entra como Diarista, na função
// que a própria pessoa escolhe (lista das funções já existentes na empresa —
// pedido do Victor, cada empresa tem seu próprio "setor" majoritário).
async function registerEmployee(body: Body): Promise<Response> {
  const companyId = String(body.companyId ?? '').trim();
  const name = String(body.name ?? '').trim();
  const cpf = String(body.cpf ?? '').replace(/\D/g, '');
  const phone = String(body.phone ?? '').replace(/\D/g, '');
  const pixKey = String(body.pixKey ?? '').trim();
  const pixType = String(body.pixType ?? '').trim();
  const functionRole = String(body.functionRole ?? '').trim();

  if (!companyId) return json({ error: 'Empresa inválida' }, 400);
  if (!name) return json({ error: 'Nome é obrigatório' }, 400);
  if (cpf.length !== 11) return json({ error: 'CPF inválido' }, 400);
  if (phone.length !== 10 && phone.length !== 11) return json({ error: 'Telefone inválido' }, 400);
  if (!pixKey) return json({ error: 'Chave PIX é obrigatória' }, 400);
  if (!['CPF', 'Email', 'Telefone', 'Aleatória'].includes(pixType)) {
    return json({ error: 'Tipo de chave PIX inválido' }, 400);
  }
  if (!functionRole) return json({ error: 'Função é obrigatória' }, 400);

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();
  if (companyError) return json({ error: 'Database error', details: companyError.message }, 500);
  if (!company) return json({ error: 'Empresa não encontrada — link inválido' }, 404);

  // Trava a função na lista que a própria empresa já usa (mesma que o
  // <select> da página pública oferece) — evita valor arbitrário por fora
  // da UI. Empresa sem NENHUMA função cadastrada ainda: aceita qualquer
  // texto (senão ninguém consegue se cadastrar até alguém configurar uma).
  const { data: existingRoles, error: rolesError } = await supabase
    .from('employees')
    .select('function_role')
    .eq('company_id', companyId)
    .not('function_role', 'is', null);
  if (rolesError) return json({ error: 'Database error', details: rolesError.message }, 500);
  const roleSet = new Set(
    (existingRoles ?? [])
      .map((r) => (r as { function_role: string | null }).function_role?.trim())
      .filter((v): v is string => Boolean(v)),
  );
  if (roleSet.size > 0 && !roleSet.has(functionRole)) {
    return json({ error: 'Função inválida' }, 400);
  }

  const { data, error } = await supabase
    .from('employees')
    .insert([{
      company_id: companyId,
      name,
      cpf,
      phone,
      pix_key: pixKey,
      pix_type: pixType,
      employment_type: 'Diarista',
      function_role: functionRole,
      registration_status: 'pending',
    }])
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return json({ error: 'CPF já cadastrado' }, 409);
    return json({ error: 'Database error', details: error.message }, 500);
  }

  return json({ employee: data });
}

async function lookupEmployee(body: Body): Promise<Response> {
  const cpf = String(body.cpf ?? '').replace(/\D/g, '');
  const companyId = String(body.companyId ?? '').trim();
  if (!cpf || !companyId) return json({ error: 'Invalid cpf or companyId' }, 400);

  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('cpf', cpf)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ employee: data ?? null });
}

async function verifyPin(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const pin = String(body.pin ?? '');
  if (!employeeId || !pin) return json({ error: 'Invalid employeeId or pin' }, 400);

  const { data, error } = await supabase
    .from('employees')
    .select('pin, pin_hash')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  let valid = false;
  if (data?.pin_hash) {
    try {
      valid = await bcryptjs.compare(pin, data.pin_hash);
    } catch (err) {
      console.error('[employee-public-api] bcrypt compare error:', err);
      valid = false;
    }
  } else {
    valid = Boolean(data?.pin && data.pin === pin);
  }
  return json({ valid });
}

async function setPin(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const newPin = String(body.newPin ?? '');
  if (!employeeId) return json({ error: 'Invalid employeeId' }, 400);
  if (!/^\d{4,6}$/.test(newPin)) {
    return json({ error: 'PIN deve ser numérico com 4 a 6 dígitos' }, 400);
  }

  // hashSync, não hash() async: no runtime Deno desta função, bcryptjs.hash()
  // (que gera salt novo por dentro) trava indefinidamente até estourar o
  // timeout da edge fn (504) — medido: 2/2 chamadas reais. bcryptjs.compare()
  // (sem gerar salt, só reconfere) responde normal em <1s — por isso verify-pin
  // continua async. hashSync roda tudo síncrono, sem essa trava.
  const pinHash = bcryptjs.hashSync(newPin, 10);
  const { error } = await supabase
    .from('employees')
    .update({ pin: null, pin_hash: pinHash, pin_configured: true })
    .eq('id', employeeId);
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ ok: true });
}

async function todayAttendance(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  if (!employeeId || !companyId) return json({ error: 'Invalid employeeId or companyId' }, 400);

  const today = getBrazilDateString();
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', today)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ attendance: data ?? null });
}

async function attendanceHistory(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  const days = Number(body.days ?? 30);
  if (!employeeId || !companyId) return json({ error: 'Invalid employeeId or companyId' }, 400);
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return json({ error: 'Invalid days range (1-365)' }, 400);
  }

  const endDate = getBrazilDateString();
  const startMs = new Date(endDate).getTime() - (days - 1) * 86_400_000;
  const startDate = new Date(startMs).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('company_id', companyId)
    .order('date', { ascending: false });
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ history: data ?? [] });
}

async function faceConfig(body: Body): Promise<Response> {
  const companyId = String(body.companyId ?? '').trim();
  if (!companyId) return json({ error: 'Invalid companyId' }, 400);

  const { data, error } = await supabase
    .from('face_recognition_config')
    .select('enabled')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ enabled: Boolean(data?.enabled) });
}

async function faceDescriptor(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  if (!employeeId) return json({ error: 'Invalid employeeId' }, 400);

  const { data, error } = await supabase
    .from('employees')
    .select('face_descriptor')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  const raw = data?.face_descriptor;
  let descriptor: number[] | null = null;
  if (raw) {
    if (Array.isArray(raw)) descriptor = raw as number[];
    else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) descriptor = parsed as number[];
      } catch { /* noop */ }
    }
  }
  return json({ descriptor });
}

async function saveFace(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const photoUrl = body.photoUrl == null ? null : String(body.photoUrl);
  const descriptor = body.descriptor;
  if (!employeeId) return json({ error: 'Invalid employeeId' }, 400);
  if (!Array.isArray(descriptor)) {
    return json({ error: 'Invalid descriptor (expected array)' }, 400);
  }

  const { error } = await supabase
    .from('employees')
    .update({
      face_photo_url: photoUrl,
      face_descriptor: descriptor,
      face_registered: true,
      face_reset_requested: false,
      face_registered_at: new Date().toISOString(),
    })
    .eq('id', employeeId);
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ ok: true });
}

async function logFaceAttempt(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const success = Boolean(body.success);
  const confidence = body.confidence == null ? null : Number(body.confidence);
  const clockType = body.clockType ?? null;
  const companyId = String(body.companyId ?? '').trim();
  if (!employeeId || !companyId) return json({ error: 'Invalid employeeId or companyId' }, 400);

  const payload = {
    employee_id: employeeId,
    date: getBrazilDateString(),
    attempted_at: new Date().toISOString(),
    success,
    confidence,
    clock_type: clockType,
    company_id: companyId,
  };
  const { error } = await supabase.from('face_auth_attempts').insert([payload]);
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ ok: true });
}

async function employeeErrorsByPeriod(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const periodId = String(body.periodId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  if (!employeeId || !periodId || !companyId) {
    return json({ error: 'Invalid employeeId, periodId or companyId' }, 400);
  }

  const { data: period, error: pErr } = await supabase
    .from('payment_periods')
    .select('*')
    .eq('id', periodId)
    .single();
  if (pErr) return json({ error: 'Database error (period)', details: pErr.message }, 500);

  const { data: indErrors, error: iErr } = await supabase
    .from('error_records')
    .select('date, error_type, error_count, observations')
    .eq('employee_id', employeeId)
    .gte('date', period.start_date)
    .lte('date', period.end_date)
    .eq('company_id', companyId)
    .order('date', { ascending: true });
  if (iErr) return json({ error: 'Database error (individual)', details: iErr.message }, 500);

  const { data: triageDetails, error: tErr } = await supabase
    .from('triage_distribution_employees')
    .select('errors_share, value_deducted, triage_error_distributions!inner(period_start, period_end, observations)')
    .eq('employee_id', employeeId)
    .gte('triage_error_distributions.period_start', period.start_date)
    .lte('triage_error_distributions.period_end', period.end_date)
    .eq('company_id', companyId);
  if (tErr) return json({ error: 'Database error (triage)', details: tErr.message }, 500);

  const individual_errors = (indErrors ?? []).map((e) => ({
    date: e.date,
    error_type: (e.error_type ?? 'quantity') as 'quantity' | string,
    error_count: e.error_count ?? 0,
    observations: e.observations,
  }));

  type TriageRow = {
    errors_share: number;
    value_deducted: number;
    triage_error_distributions:
      | { period_start: string; period_end: string; observations: string | null }
      | { period_start: string; period_end: string; observations: string | null }[];
  };
  const triage_errors = ((triageDetails as TriageRow[] | null) ?? []).map((row) => {
    const dist = Array.isArray(row.triage_error_distributions)
      ? row.triage_error_distributions[0]
      : row.triage_error_distributions;
    return {
      date: dist.period_start,
      errors_share: row.errors_share,
      value_deducted: Number(row.value_deducted),
      observations: dist.observations,
    };
  });

  // Semântica do frontend legacy (preservar):
  //   total_individual = sum(error_count if quantity, else 1)
  //   total_triage = sum(errors_share)
  const total_individual = individual_errors.reduce(
    (s, e) => s + (e.error_type === 'quantity' ? Number(e.error_count) || 0 : 1),
    0,
  );
  const total_triage = triage_errors.reduce((s, t) => s + (Number(t.errors_share) || 0), 0);

  return json({
    period,
    individual_errors,
    triage_errors,
    total_individual,
    total_triage,
  });
}

async function employeeErrorPeriods(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  if (!employeeId || !companyId) return json({ error: 'Invalid employeeId or companyId' }, 400);

  const { data: periods, error: pErr } = await supabase
    .from('payment_periods')
    .select('*')
    .eq('company_id', companyId)
    .order('start_date', { ascending: false });
  if (pErr) return json({ error: 'Database error (periods)', details: pErr.message }, 500);
  if (!periods || periods.length === 0) return json({ periods: [] });

  const results: Array<{ period: unknown; has_errors: boolean; total_errors: number }> = [];
  for (const period of periods as Array<{ id: string; start_date: string; end_date: string }>) {
    const { data: indErrors } = await supabase
      .from('error_records')
      .select('error_count, error_type')
      .eq('employee_id', employeeId)
      .gte('date', period.start_date)
      .lte('date', period.end_date)
      .eq('company_id', companyId);

    const { data: triageDist } = await supabase
      .from('triage_distribution_employees')
      .select('errors_share, triage_error_distributions!inner(period_start, period_end)')
      .eq('employee_id', employeeId)
      .gte('triage_error_distributions.period_start', period.start_date)
      .lte('triage_error_distributions.period_end', period.end_date)
      .eq('company_id', companyId);

    type IndErr = { error_count: number; error_type: string | null };
    type Triage = { errors_share: number };
    const indCount = ((indErrors ?? []) as IndErr[])
      .filter((e) => (e.error_type ?? 'quantity') === 'quantity')
      .reduce((s, e) => s + (Number(e.error_count) || 0), 0);
    const indValueCount = ((indErrors ?? []) as IndErr[])
      .filter((e) => e.error_type === 'value').length;
    const triageCount = ((triageDist ?? []) as Triage[])
      .reduce((s, t) => s + (Number(t.errors_share) || 0), 0);

    const total = indCount + indValueCount + triageCount;
    results.push({ period, has_errors: total > 0, total_errors: total });
  }
  return json({ periods: results });
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== 'string') {
      return json({ error: 'Body must include "action" string' }, 400);
    }

    switch (body.action) {
      case 'lookup-companies-by-cpf': return await lookupCompaniesByCpf(body);
      case 'lookup-employee': return await lookupEmployee(body);
      case 'register-employee': return await registerEmployee(body);
      case 'list-function-roles': return await listFunctionRoles(body);
      case 'verify-pin': return await verifyPin(body);
      case 'set-pin': return await setPin(body);
      case 'today-attendance': return await todayAttendance(body);
      case 'attendance-history': return await attendanceHistory(body);
      case 'face-config': return await faceConfig(body);
      case 'face-descriptor': return await faceDescriptor(body);
      case 'save-face': return await saveFace(body);
      case 'log-face-attempt': return await logFaceAttempt(body);
      case 'employee-errors-by-period': return await employeeErrorsByPeriod(body);
      case 'employee-error-periods': return await employeeErrorPeriods(body);
      default: return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('[employee-public-api] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }
});
