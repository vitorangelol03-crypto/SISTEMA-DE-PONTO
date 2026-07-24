// App do Entregador — edge fn driver-public-api (FASE 0 + login/ver espelho)
//
// API publica do app do driver (verify_jwt=false). Segue o molde do employee-public-api:
// roda com SERVICE_ROLE_KEY (bypassa RLS) e a seguranca vem de filtros ESTRITOS
// server-side. O driver NUNCA fala direto com o banco.
//
// Autenticacao propria (independente do login do painel):
//  - login por CPF + senha; senha inicial "1234" com troca obrigatoria no 1o acesso;
//  - emite um token HS256 assinado com DRIVER_JWT_SECRET (segredo DEDICADO, != JWT_SECRET
//    do projeto). Assim, mesmo que o token vaze, o Postgres/PostgREST NAO o aceita —
//    ele so vale dentro desta edge fn.
//  - o driver_id vem SEMPRE do token verificado, nunca do corpo do request.
//
// Deploy: supabase functions deploy driver-public-api --no-verify-jwt
// Secret necessario: DRIVER_JWT_SECRET (Dashboard -> Edge Functions). NAO usar prefixo SUPABASE_.
//
// Actions (todas POST { action, ... }):
//   login          { cpf, password }                 -> { token, mustChange, driver:{name} } | 401
//   change-password{ newPassword }        [+token]   -> { token, ok }            (proibe "1234")
//   my-mirrors     {}                     [+token]   -> { mirrors: [...] }        (espelhos publicados p/ mim)
//   my-mirror-url  { publicationId }       [+token]   -> { url }                  (link assinado; marca visto)

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
const DRIVER_JWT_SECRET = Deno.env.get('DRIVER_JWT_SECRET')!;
const MIRRORS_BUCKET = 'driverpay-mirrors';
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 dias (app instalado; 401 -> re-login)
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const supabase = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

// ─── JWT HS256 (mesmo esquema do auth-login, com secret dedicado) ───────────────
function b64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlToBytes(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(DRIVER_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }
  return keyPromise;
}

interface DriverClaims { driver_id: string; company_id: string; purpose: 'driver'; iat: number; exp: number }

async function signDriverToken(driverId: string, companyId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: DriverClaims = {
    driver_id: driverId, company_id: companyId, purpose: 'driver', iat: now, exp: now + TOKEN_TTL_SEC,
  };
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = await crypto.subtle.sign('HMAC', await getKey(), new TextEncoder().encode(data));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifyDriverToken(token: string): Promise<DriverClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const data = new TextEncoder().encode(`${h}.${b}`);
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await getKey(), b64urlToBytes(s), data);
  } catch { return null; }
  if (!ok) return null;
  let claims: DriverClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(b)));
  } catch { return null; }
  if (claims.purpose !== 'driver') return null;
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  if (!claims.driver_id) return null;
  return claims;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;

async function claimsFromRequest(req: Request, body: Body): Promise<DriverClaims | null> {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const token = bearer || String(body.token ?? '');
  if (!token) return null;
  return verifyDriverToken(token);
}

// ─── Actions ────────────────────────────────────────────────────────────────────
async function login(body: Body): Promise<Response> {
  const cpf = onlyDigits(body.cpf);
  const password = String(body.password ?? '');
  if (cpf.length !== 11 || !password) return json({ error: 'CPF ou senha invalidos' }, 400);

  // Acha o driver ativo por CPF (compara so digitos; base ja importada como 11 digitos).
  const { data: drivers, error: dErr } = await supabase
    .from('driverpay_drivers')
    .select('id, company_id, name, cpf, active')
    .eq('active', true);
  if (dErr) return json({ error: 'Database error', details: dErr.message }, 500);
  const driver = (drivers ?? []).find((d) => onlyDigits(d.cpf) === cpf);
  if (!driver) return json({ error: 'CPF nao encontrado ou sem cadastro ativo' }, 401);

  const { data: auth, error: aErr } = await supabase
    .from('driverpay_driver_auth')
    .select('driver_id, password_hash, must_change, failed_attempts, locked_until')
    .eq('driver_id', driver.id)
    .maybeSingle();
  if (aErr) return json({ error: 'Database error', details: aErr.message }, 500);

  if (auth?.locked_until && new Date(auth.locked_until) > new Date()) {
    return json({ error: 'Conta bloqueada por tentativas. Tente mais tarde.' }, 423);
  }

  let valid = false;
  let mustChange = true;
  if (auth?.password_hash) {
    try { valid = await bcryptjs.compare(password, auth.password_hash); } catch { valid = false; }
    mustChange = Boolean(auth.must_change);
  } else {
    // Sem senha definida ainda: aceita a inicial "1234" e forca troca (lazy).
    valid = password === '1234';
    mustChange = true;
  }

  if (!valid) {
    // Incrementa falhas e bloqueia apos MAX_FAILED (so se ja tinha senha definida).
    const fails = (auth?.failed_attempts ?? 0) + 1;
    const lock = fails >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await supabase.from('driverpay_driver_auth').upsert({
      driver_id: driver.id, company_id: driver.company_id,
      failed_attempts: fails, locked_until: lock, updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id' });
    return json({ error: 'CPF ou senha invalidos' }, 401);
  }

  // Sucesso: zera falhas, registra login, garante a linha de auth.
  await supabase.from('driverpay_driver_auth').upsert({
    driver_id: driver.id, company_id: driver.company_id,
    must_change: mustChange, failed_attempts: 0, locked_until: null,
    last_login_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'driver_id' });

  const token = await signDriverToken(driver.id, driver.company_id);
  return json({ token, mustChange, driver: { name: driver.name } });
}

async function changePassword(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const newPassword = String(body.newPassword ?? '');
  if (newPassword.length < 4) return json({ error: 'A senha precisa ter ao menos 4 caracteres' }, 400);
  if (newPassword === '1234') return json({ error: 'Escolha uma senha diferente de 1234' }, 400);

  const hash = await bcryptjs.hash(newPassword, 10);
  const { error } = await supabase.from('driverpay_driver_auth').upsert({
    driver_id: claims.driver_id, company_id: claims.company_id,
    password_hash: hash, must_change: false, failed_attempts: 0, locked_until: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'driver_id' });
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  // Token novo (senha trocada) — mustChange agora false.
  const token = await signDriverToken(claims.driver_id, claims.company_id);
  return json({ ok: true, token });
}

async function myMirrors(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const { data, error } = await supabase
    .from('driverpay_mirror_publications')
    .select('id, period_id, scope, platform_filter, delivered_at, viewed_at, driverpay_periods(label, start_date, end_date)')
    .eq('driver_id', claims.driver_id)
    .order('delivered_at', { ascending: false });
  if (error) return json({ error: 'Database error', details: error.message }, 500);
  const mirrors = (data ?? []).map((m) => {
    const per = Array.isArray(m.driverpay_periods) ? m.driverpay_periods[0] : m.driverpay_periods;
    return {
      id: m.id,
      periodId: m.period_id,
      periodLabel: per?.label ?? '',
      scope: m.scope,
      platformFilter: m.platform_filter ?? null,
      deliveredAt: m.delivered_at,
      viewedAt: m.viewed_at,
    };
  });
  return json({ mirrors });
}

async function myMirrorUrl(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const publicationId = String(body.publicationId ?? '').trim();
  if (!publicationId) return json({ error: 'publicationId ausente' }, 400);

  // Dono: a publicacao TEM que ser do driver do token (nunca confia no cliente).
  const { data: pub, error } = await supabase
    .from('driverpay_mirror_publications')
    .select('id, driver_id, pdf_path, viewed_at')
    .eq('id', publicationId)
    .eq('driver_id', claims.driver_id)
    .maybeSingle();
  if (error) return json({ error: 'Database error', details: error.message }, 500);
  if (!pub) return json({ error: 'Espelho nao encontrado' }, 404);

  const { data: signed, error: sErr } = await supabase
    .storage.from(MIRRORS_BUCKET).createSignedUrl(pub.pdf_path, 300); // 5 min
  if (sErr || !signed?.signedUrl) return json({ error: 'Falha ao gerar link', details: sErr?.message }, 500);

  if (!pub.viewed_at) {
    await supabase.from('driverpay_mirror_publications')
      .update({ viewed_at: new Date().toISOString() }).eq('id', pub.id);
  }
  return json({ url: signed.signedUrl });
}

// ─── Nota Fiscal (Fase 3) ───────────────────────────────────────────────────
const NF_BUCKET = 'driverpay-nota-fiscais';
const MAX_NF_BYTES = 8 * 1024 * 1024; // 8 MB (nota em PDF; somente PDF desde 2026-07-24)

function extFromType(t: string): string {
  const s = (t || '').toLowerCase();
  if (s.includes('png')) return 'png';
  if (s.includes('pdf')) return 'pdf';
  if (s.includes('webp')) return 'webp';
  return 'jpg';
}

// Lugares de anexo do driver no periodo: 1 por CNPJ que fatura alguma plataforma
// com pacotes>0 dele naquele periodo. `sent` = quantas notas ele ja mandou naquele CNPJ.
async function nfSlots(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const periodId = String(body.periodId ?? '').trim();
  if (!periodId) return json({ error: 'periodId ausente' }, 400);

  // Grupo: se este driver e LIDER de um grupo, ele anexa as notas do GRUPO inteiro — entao
  // os CNPJs esperados vem dos pacotes de TODOS os membros (nao so dele). Senao, so dele.
  const { data: ledGroup } = await supabase.from('driverpay_groups')
    .select('id').eq('leader_driver_id', claims.driver_id).eq('company_id', claims.company_id).maybeSingle();
  let driverIds = [claims.driver_id];
  if (ledGroup?.id) {
    const { data: members } = await supabase.from('driverpay_group_members')
      .select('driver_id').eq('group_id', ledGroup.id);
    driverIds = [...new Set([claims.driver_id, ...(members ?? []).map((m) => m.driver_id as string)])];
  }

  const { data: pays } = await supabase.from('driverpay_payments')
    .select('id').eq('period_id', periodId).in('driver_id', driverIds);
  const payIds = (pays ?? []).map((p) => p.id);

  let platformNames: string[] = [];
  if (payIds.length) {
    const { data: pks } = await supabase.from('driverpay_payment_packages')
      .select('platform_name, packages').in('payment_id', payIds);
    platformNames = [...new Set((pks ?? []).filter((p) => (p.packages ?? 0) > 0).map((p) => p.platform_name))];
  }

  let emitterIds: string[] = [];
  if (platformNames.length) {
    const { data: plats } = await supabase.from('driverpay_platforms')
      .select('name, nota_emitter_id').eq('company_id', claims.company_id).in('name', platformNames);
    emitterIds = [...new Set((plats ?? []).map((p) => p.nota_emitter_id).filter(Boolean))] as string[];
  }
  if (emitterIds.length === 0) return json({ slots: [] });

  const { data: emitters } = await supabase.from('driverpay_nota_emitters')
    .select('id, cnpj, label').in('id', emitterIds).eq('active', true).order('sort_order', { ascending: true });

  const { data: files } = await supabase.from('driverpay_nota_fiscal_files')
    .select('nota_emitter_id, status, reject_reason, uploaded_at')
    .eq('driver_id', claims.driver_id).eq('period_id', periodId)
    .order('uploaded_at', { ascending: true });
  // sent = notas NAO rejeitadas. Rejeitada nao conta (reabre o slot pro driver reenviar);
  // guarda o motivo da ultima rejeicao pra mostrar "recusada: <motivo>, envie outra".
  const sent: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  const rejectReason: Record<string, string | null> = {};
  for (const f of files ?? []) {
    if (f.status === 'rejeitada') {
      rejected[f.nota_emitter_id] = (rejected[f.nota_emitter_id] ?? 0) + 1;
      rejectReason[f.nota_emitter_id] = f.reject_reason ?? null; // ordem asc -> fica a mais recente
    } else {
      sent[f.nota_emitter_id] = (sent[f.nota_emitter_id] ?? 0) + 1;
    }
  }
  const slots = (emitters ?? []).map((e) => ({
    emitterId: e.id, cnpj: e.cnpj, label: e.label,
    sent: sent[e.id] ?? 0, rejected: rejected[e.id] ?? 0, rejectReason: rejectReason[e.id] ?? null,
  }));
  return json({ slots });
}

// Recebe a nota (base64), sobe no bucket privado, registra e marca o "check" antigo.
async function nfUpload(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const periodId = String(body.periodId ?? '').trim();
  const emitterId = String(body.emitterId ?? '').trim();
  const contentType = String(body.contentType ?? 'image/jpeg');
  const filename = body.filename ? String(body.filename) : null;
  const b64raw = String(body.fileBase64 ?? '');
  if (!periodId || !emitterId || !b64raw) return json({ error: 'Dados incompletos' }, 400);

  const { data: em } = await supabase.from('driverpay_nota_emitters')
    .select('id').eq('id', emitterId).eq('company_id', claims.company_id).maybeSingle();
  if (!em) return json({ error: 'CNPJ invalido' }, 400);

  const pure = b64raw.includes(',') ? b64raw.slice(b64raw.indexOf(',') + 1) : b64raw;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(pure), (c) => c.charCodeAt(0)); }
  catch { return json({ error: 'Arquivo invalido' }, 400); }
  if (bytes.length === 0) return json({ error: 'Arquivo vazio' }, 400);
  if (bytes.length > MAX_NF_BYTES) return json({ error: 'Arquivo muito grande (max 8MB)' }, 413);

  // Somente PDF (decisao do Victor, 2026-07-24): foto confundia os drivers. Valida o TIPO
  // declarado E a assinatura real do arquivo (%PDF) — cliente antigo em cache nao fura a regra.
  const isPdfType = contentType.toLowerCase().includes('pdf');
  const isPdfMagic = bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!isPdfType || !isPdfMagic) return json({ error: 'A nota deve ser um arquivo PDF (foto nao e aceita)' }, 400);

  const path = `${claims.company_id}/${periodId}/${claims.driver_id}/${emitterId}/${crypto.randomUUID()}.${extFromType(contentType)}`;
  const { error: upErr } = await supabase.storage.from(NF_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (upErr) return json({ error: 'Falha ao subir a nota', details: upErr.message }, 500);

  const { data: pay } = await supabase.from('driverpay_payments')
    .select('id').eq('period_id', periodId).eq('driver_id', claims.driver_id).maybeSingle();

  const { error: insErr } = await supabase.from('driverpay_nota_fiscal_files').insert([{
    company_id: claims.company_id, driver_id: claims.driver_id, period_id: periodId,
    payment_id: pay?.id ?? null, nota_emitter_id: emitterId, file_path: path,
    file_type: contentType, original_filename: filename, uploaded_by: claims.driver_id,
  }]);
  if (insErr) return json({ error: 'Falha ao registrar a nota', details: insErr.message }, 500);

  // NAO marca mais o "nota recebida" antigo automaticamente: agora quem deixa a NF verde
  // no painel e a VALIDACAO da nota pelo mestre (status 'validada'), nao o simples upload.
  return json({ ok: true });
}

// Lista as notas que o proprio driver ja enviou no periodo.
async function nfListFn(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const periodId = String(body.periodId ?? '').trim();
  if (!periodId) return json({ error: 'periodId ausente' }, 400);
  const { data } = await supabase.from('driverpay_nota_fiscal_files')
    .select('id, nota_emitter_id, original_filename, status, reject_reason, uploaded_at, driverpay_nota_emitters(label, cnpj)')
    .eq('driver_id', claims.driver_id).eq('period_id', periodId)
    .order('uploaded_at', { ascending: false });
  const files = (data ?? []).map((f) => {
    const em = Array.isArray(f.driverpay_nota_emitters) ? f.driverpay_nota_emitters[0] : f.driverpay_nota_emitters;
    return {
      id: f.id, emitterId: f.nota_emitter_id, emitterLabel: em?.label ?? '', cnpj: em?.cnpj ?? '',
      filename: f.original_filename, status: f.status, rejectReason: f.reject_reason ?? null, uploadedAt: f.uploaded_at,
    };
  });
  return json({ files });
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!DRIVER_JWT_SECRET) {
      console.error('[driver-public-api] DRIVER_JWT_SECRET not configured');
      return json({ error: 'Server misconfigured', details: 'DRIVER_JWT_SECRET missing' }, 500);
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== 'string') return json({ error: 'Body must include "action" string' }, 400);

    switch (body.action) {
      case 'login': return await login(body);
      case 'change-password': return await changePassword(req, body);
      case 'my-mirrors': return await myMirrors(req, body);
      case 'my-mirror-url': return await myMirrorUrl(req, body);
      case 'nf-slots': return await nfSlots(req, body);
      case 'nf-upload': return await nfUpload(req, body);
      case 'nf-list': return await nfListFn(req, body);
      default: return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('[driver-public-api] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }
});
