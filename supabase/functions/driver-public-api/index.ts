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
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.0';
import { runNfCheck, mirrorExpectedValue, type NfCheckResult } from './nfCheck.ts';
import {
  proofIsFullyConfirmed,
  proofRetryDelayMinutes,
  proofShouldReject,
  proofShouldRequeue,
  runProofCheck,
  type ProofCheckResult,
} from '../_shared/proofCheck.ts';
import { readProofImage, visionConfigFromEnv } from '../_shared/visionRead.ts';

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
    .select('id, period_id, scope, platform_filter, delivered_at, viewed_at, driverpay_periods(label, start_date, end_date, status)')
    .eq('driver_id', claims.driver_id)
    .order('delivered_at', { ascending: false });
  if (error) return json({ error: 'Database error', details: error.message }, 500);
  const mirrors = (data ?? []).map((m) => {
    const per = Array.isArray(m.driverpay_periods) ? m.driverpay_periods[0] : m.driverpay_periods;
    return {
      id: m.id,
      periodId: m.period_id,
      periodLabel: per?.label ?? '',
      // 'aberto' -> app mostra tag "Atual"; 'concluido' -> "Fechada" (driver sabe que nao e a atual).
      periodStatus: per?.status ?? null,
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

// Lugares de anexo do driver no periodo.
//
// 28/07 (decisao do Victor "uma nota por espelho — se tem 2 espelhos, 2 notas"): quando
// ha espelho PUBLICADO, cada espelho pede a sua nota, um slot por (espelho x CNPJ). Assim,
// pagando LOGGI hoje e SHOPEE depois, o driver manda uma nota pra cada — mesmo os dois
// caindo no MESMO CNPJ (Shopee/Anjun/Loggi compartilham 11.802.464/0001-38).
// Um espelho da quinzena inteira que envolve 2 CNPJs continua pedindo 2 notas, como antes.
// SEM espelho publicado, vale a regra antiga: um slot por CNPJ com pacote no periodo.
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
  if (platformNames.length === 0) return json({ slots: [] });

  const { data: plats } = await supabase.from('driverpay_platforms')
    .select('name, nota_emitter_id').eq('company_id', claims.company_id).in('name', platformNames);
  const emitterOf = new Map((plats ?? []).map((p) => [p.name as string, p.nota_emitter_id as string | null]));

  const emitterIds = [...new Set((plats ?? []).map((p) => p.nota_emitter_id).filter(Boolean))] as string[];
  if (emitterIds.length === 0) return json({ slots: [] });

  const { data: emitters } = await supabase.from('driverpay_nota_emitters')
    .select('id, cnpj, label').in('id', emitterIds).eq('active', true).order('sort_order', { ascending: true });
  const emitterById = new Map((emitters ?? []).map((e) => [e.id as string, e]));

  // Espelhos publicados pra ESTE driver no periodo (o driver e quem recebe: no grupo,
  // so o lider tem publicacao).
  const { data: pubs } = await supabase.from('driverpay_mirror_publications')
    .select('platform_key, platform_filter, delivered_at')
    .eq('driver_id', claims.driver_id).eq('period_id', periodId)
    .order('delivered_at', { ascending: true });

  const { data: files } = await supabase.from('driverpay_nota_fiscal_files')
    .select('nota_emitter_id, status, reject_reason, uploaded_at, mirror_platform_key')
    .eq('driver_id', claims.driver_id).eq('period_id', periodId)
    .order('uploaded_at', { ascending: true });

  // Contagem por SLOT (espelho + CNPJ). Nota antiga (mirror_platform_key NULL) conta no
  // slot daquele CNPJ de qualquer espelho — senao quem ja mandou antes desta mudanca
  // apareceria devendo nota.
  const sent: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  const rejectReason: Record<string, string | null> = {};
  const slotKey = (mirrorKey: string | null, emitterId: string) => `${mirrorKey ?? '*'}|${emitterId}`;
  const bump = (key: string, f: { status: string; reject_reason: string | null }) => {
    if (f.status === 'rejeitada') {
      rejected[key] = (rejected[key] ?? 0) + 1;
      rejectReason[key] = f.reject_reason ?? null; // ordem asc -> fica a mais recente
    } else {
      sent[key] = (sent[key] ?? 0) + 1;
    }
  };

  const temEspelho = (pubs ?? []).length > 0;

  // Monta os slots: um por (espelho, CNPJ) quando ha espelho; senao um por CNPJ.
  interface SlotOut {
    emitterId: string; cnpj: string; label: string;
    mirrorKey: string | null; mirrorLabel: string;
    sent: number; rejected: number; rejectReason: string | null;
  }
  const slots: SlotOut[] = [];
  const push = (emitterId: string, mirrorKey: string | null, mirrorLabel: string) => {
    const em = emitterById.get(emitterId);
    if (!em) return;
    const k = slotKey(mirrorKey, emitterId);
    const kLegado = slotKey(null, emitterId);
    slots.push({
      emitterId, cnpj: em.cnpj as string, label: em.label as string,
      mirrorKey, mirrorLabel,
      sent: (sent[k] ?? 0) + (mirrorKey ? (sent[kLegado] ?? 0) : 0),
      rejected: rejected[k] ?? 0,
      rejectReason: rejectReason[k] ?? null,
    });
  };

  for (const f of files ?? []) {
    bump(slotKey((f.mirror_platform_key as string | null) ?? null, f.nota_emitter_id as string), {
      status: f.status as string, reject_reason: (f.reject_reason as string | null) ?? null,
    });
  }

  if (temEspelho) {
    for (const pub of pubs ?? []) {
      const filtro = Array.isArray(pub.platform_filter) && pub.platform_filter.length
        ? (pub.platform_filter as string[]) : null;
      const doEspelho = (filtro ?? platformNames).filter((n) => platformNames.includes(n));
      const cnpjsDoEspelho = [...new Set(doEspelho.map((n) => emitterOf.get(n)).filter(Boolean))] as string[];
      const label = filtro ? `SOMENTE ${filtro.join(' + ').toUpperCase()}` : 'Quinzena completa';
      for (const emitterId of cnpjsDoEspelho) push(emitterId, (pub.platform_key as string) ?? '', label);
    }
  } else {
    for (const emitterId of emitterIds) push(emitterId, null, 'Quinzena completa');
  }

  return json({ slots });
}

// ─── Conferência automática (v8; abate parcial em v11) ───────────────────────
// Candidatos de valor esperado. Regra provada na Fase 0 (26/07, 18 notas reais):
// o driver emite a nota pelo valor do ESPELHO PUBLICADO que ele recebeu (escopo
// grupo/individual + filtro de plataforma) — por isso cada publicação vira um
// candidato. Soma-por-CNPJ e líquidos entram como fallback (nota "cheia").
//
// 27/07 — pagamento PARCIAL por plataforma: a publicação agora grava se ABATEU os
// vales/perdas (include_deductions). O valor esperado segue o total impresso no
// espelho: com abate = bruto do filtro − vales/perdas; sem abate = bruto puro.
// A conta mora em `mirrorExpectedValue` (nfCheck.ts, coberta por unit).
async function buildValueCandidates(
  driverId: string, companyId: string, periodId: string, emitterId: string,
): Promise<Record<string, number>> {
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const { data: ledGroup } = await supabase.from('driverpay_groups')
    .select('id').eq('leader_driver_id', driverId).eq('company_id', companyId).maybeSingle();
  let groupIds: string[] = [driverId];
  if (ledGroup?.id) {
    const { data: members } = await supabase.from('driverpay_group_members')
      .select('driver_id').eq('group_id', ledGroup.id);
    groupIds = [...new Set([driverId, ...(members ?? []).map((m) => m.driver_id as string)])];
  }

  const { data: pays } = await supabase.from('driverpay_payments')
    .select('id, driver_id, total_net, zapex_rate').eq('period_id', periodId).in('driver_id', groupIds);
  const payList = pays ?? [];
  const payIds = payList.map((p) => p.id);

  const { data: packs } = payIds.length
    ? await supabase.from('driverpay_payment_packages')
      .select('payment_id, platform_name, packages, rate_snapshot').in('payment_id', payIds)
    : { data: [] as never[] };

  // Vales/perdas e Zapex: entram na conta do espelho parcial (2026-07-27).
  const { data: discountRows } = payIds.length
    ? await supabase.from('driverpay_discounts').select('payment_id, amount').in('payment_id', payIds)
    : { data: [] as never[] };
  const { data: valeRows } = payIds.length
    ? await supabase.from('driverpay_vales').select('payment_id, amount').in('payment_id', payIds)
    : { data: [] as never[] };
  const { data: zapexRows } = payIds.length
    ? await supabase.from('driverpay_zapex').select('payment_id').in('payment_id', payIds)
    : { data: [] as never[] };

  const { data: plats } = await supabase.from('driverpay_platforms')
    .select('name, nota_emitter_id').eq('company_id', companyId);
  const emitterByPlatform = new Map((plats ?? []).map((p) => [p.name as string, p.nota_emitter_id as string | null]));

  const driverOf = new Map(payList.map((p) => [p.id as string, p.driver_id as string]));
  const platformSum = (ids: string[], filter: string[] | null, onlyEmitter: boolean): number => {
    let total = 0;
    for (const pk of packs ?? []) {
      const dId = driverOf.get(pk.payment_id as string);
      if (!dId || !ids.includes(dId)) continue;
      if (filter && !filter.includes(pk.platform_name as string)) continue;
      if (onlyEmitter && emitterByPlatform.get(pk.platform_name as string) !== emitterId) continue;
      total += (pk.packages ?? 0) * Number(pk.rate_snapshot ?? 0);
    }
    return round2(total);
  };
  const netSum = (ids: string[]): number =>
    round2(payList.filter((p) => ids.includes(p.driver_id as string))
      .reduce((s, p) => s + Number(p.total_net ?? 0), 0));

  /** Vales + perdas das pessoas cobertas pelo espelho. */
  const deductionsSum = (ids: string[]): number => {
    let total = 0;
    for (const row of [...(discountRows ?? []), ...(valeRows ?? [])]) {
      const dId = driverOf.get(row.payment_id as string);
      if (dId && ids.includes(dId)) total += Number(row.amount ?? 0);
    }
    return round2(total);
  };

  /** Ganho Zapex (itens × zapex_rate). A Zapex é tratada como "plataforma" no filtro. */
  const zapexRateOf = new Map(payList.map((p) => [p.id as string, Number(p.zapex_rate ?? 0)]));
  const zapexSum = (ids: string[], filter: string[] | null): number => {
    if (filter && !filter.includes('Zapex')) return 0;
    let total = 0;
    for (const z of zapexRows ?? []) {
      const payId = z.payment_id as string;
      const dId = driverOf.get(payId);
      if (dId && ids.includes(dId)) total += zapexRateOf.get(payId) ?? 0;
    }
    return round2(total);
  };

  const cands: Record<string, number> = {
    somaCnpj_individual: platformSum([driverId], null, true),
    liquido_individual: netSum([driverId]),
  };
  if (groupIds.length > 1) {
    cands.somaCnpj_grupo = platformSum(groupIds, null, true);
    cands.liquido_grupo = netSum(groupIds);
  }

  const { data: pubs } = await supabase.from('driverpay_mirror_publications')
    .select('scope, platform_filter, include_deductions').eq('driver_id', driverId).eq('period_id', periodId);
  for (const pub of pubs ?? []) {
    const filter = Array.isArray(pub.platform_filter) && pub.platform_filter.length
      ? (pub.platform_filter as string[])
      : null;
    const ids = pub.scope === 'group' && groupIds.length > 1 ? groupIds : [driverId];
    // include_deductions=false (pagamento parcial por plataforma): o espelho lista os
    // vales/perdas mas NÃO abate — a nota vem pelo bruto. Coluna nova (default true):
    // publicação antiga/sem a coluna segue como sempre.
    const includeDeductions = pub.include_deductions !== false;
    const value = mirrorExpectedValue({
      grossInScope: round2(platformSum(ids, filter, false) + zapexSum(ids, filter)),
      deductions: deductionsSum(ids),
      netFull: netSum(ids),
      hasPlatformFilter: filter !== null,
      includeDeductions,
    });
    const key = `espelho_${pub.scope}${filter ? '_' + filter.join('+') : '_cheio'}${
      includeDeductions ? '' : '_sem_abate'
    }`;
    cands[key] = value;
  }
  return cands;
}

// Recebe a nota (base64), CONFERE contra o espelho publicado (valor/CNPJ/nome) e
// registra. Decisão do Victor (26/07): não bateu ou ilegível → RECUSA automática
// com motivo (status 'rejeitada' reabre o slot; app mostra o porquê). Erro
// INTERNO da conferência nunca recusa nem derruba o upload → 'pendente'.
async function nfUpload(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const periodId = String(body.periodId ?? '').trim();
  const emitterId = String(body.emitterId ?? '').trim();
  const contentType = String(body.contentType ?? 'image/jpeg');
  const filename = body.filename ? String(body.filename) : null;
  // De qual espelho e esta nota (28/07). '' = espelho da quinzena inteira; ausente =
  // cliente antigo em cache ou envio sem espelho publicado -> null (regra antiga).
  const mirrorKeyRaw = body.mirrorKey;
  const mirrorPlatformKey = mirrorKeyRaw === undefined || mirrorKeyRaw === null
    ? null : String(mirrorKeyRaw);
  const b64raw = String(body.fileBase64 ?? '');
  if (!periodId || !emitterId || !b64raw) return json({ error: 'Dados incompletos' }, 400);

  const { data: em } = await supabase.from('driverpay_nota_emitters')
    .select('id, cnpj, label').eq('id', emitterId).eq('company_id', claims.company_id).maybeSingle();
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

  // Conferência automática ANTES de registrar. Qualquer exceção aqui vira
  // 'pendente' (conferir manualmente) — jamais bloqueia o envio por falha nossa.
  let check: NfCheckResult | null = null;
  let candidates: Record<string, number> = {};
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const { data: driver } = await supabase.from('driverpay_drivers')
      .select('name, recebedor_nome').eq('id', claims.driver_id).maybeSingle();
    candidates = await buildValueCandidates(claims.driver_id, claims.company_id, periodId, emitterId);
    check = runNfCheck({
      text: text ?? '',
      expectedCnpj: String(em.cnpj ?? '').replace(/\D/g, ''),
      expectedCnpjLabel: em.label ?? '',
      driverName: driver?.name ?? '',
      recebedorNome: driver?.recebedor_nome ?? null,
      valueCandidates: candidates,
    });
  } catch (checkErr) {
    console.error('[nf-check] falha interna (upload segue como pendente):', checkErr);
    check = null;
  }

  const autoReject = check !== null && check.status !== 'ok';
  const rejectReason = autoReject
    ? `[automático] ${check!.reasons.join(' ')}`
    : null;
  // Auto-validação (decisão do Victor 26/07, "validar já no envio"): só quando os
  // TRÊS checks confirmaram positivo. Check null (ex.: sem espelho publicado pra
  // comparar valor) NUNCA valida sozinho — fica 'recebida' pra validação manual.
  // O painel pode DESLIGAR a auto-validação (driverpay_settings.nf_auto_validate):
  // a conferência e a recusa automática continuam iguais; só a nota certa passa a
  // esperar validação manual. Sem linha na tabela = ligada (padrão).
  const { data: settings } = await supabase.from('driverpay_settings')
    .select('nf_auto_validate').eq('company_id', claims.company_id).maybeSingle();
  const autoValidateEnabled = settings?.nf_auto_validate !== false;
  const checksAllGreen = check !== null && check.status === 'ok'
    && check.valorOk === true && check.cnpjOk === true && check.nomeOk === true;
  const autoValidate = checksAllGreen && autoValidateEnabled;

  const path = `${claims.company_id}/${periodId}/${claims.driver_id}/${emitterId}/${crypto.randomUUID()}.${extFromType(contentType)}`;
  const { error: upErr } = await supabase.storage.from(NF_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (upErr) return json({ error: 'Falha ao subir a nota', details: upErr.message }, 500);

  const { data: pay } = await supabase.from('driverpay_payments')
    .select('id').eq('period_id', periodId).eq('driver_id', claims.driver_id).maybeSingle();

  const { error: insErr } = await supabase.from('driverpay_nota_fiscal_files').insert([{
    company_id: claims.company_id, driver_id: claims.driver_id, period_id: periodId,
    payment_id: pay?.id ?? null, nota_emitter_id: emitterId, file_path: path,
    file_type: contentType, original_filename: filename, uploaded_by: claims.driver_id,
    mirror_platform_key: mirrorPlatformKey,
    status: autoReject ? 'rejeitada' : (autoValidate ? 'validada' : 'recebida'),
    reject_reason: rejectReason,
    // validated_by tem FK pra users(id) — validação AUTOMÁTICA fica com null e o
    // marcador vive em check_details.autoValidated (validação manual sempre tem usuário).
    validated_at: autoValidate ? new Date().toISOString() : null,
    validated_by: null,
    check_status: check ? check.status : 'pendente',
    check_valor: check?.valorOk ?? null,
    check_cnpj: check?.cnpjOk ?? null,
    check_nome: check?.nomeOk ?? null,
    check_details: check ? {
      autoValidated: autoValidate,
      // Auto-validação estava desligada e a nota passou nos 3 checks: o painel
      // mostra "conferida ✓ — validar" (é só apertar o botão, sem reconferir).
      autoValidateSkipped: checksAllGreen && !autoValidateEnabled,
      foundValues: check.foundValues, foundCnpjs: check.foundCnpjs,
      matchedCandidates: check.matchedCandidates, candidates, reasons: check.reasons,
    } : null,
    checked_at: new Date().toISOString(),
  }]);
  if (insErr) return json({ error: 'Falha ao registrar a nota', details: insErr.message }, 500);

  // NAO marca mais o "nota recebida" antigo automaticamente: agora quem deixa a NF verde
  // no painel e a VALIDACAO da nota pelo mestre (status 'validada'), nao o simples upload.
  if (autoReject) {
    // HTTP 422 de propósito: o client (novo E antigo em cache) trata não-2xx como
    // erro e mostra a mensagem — nota recusada NUNCA aparece como "enviada".
    // A nota fica registrada como 'rejeitada' e o slot reabre pro reenvio.
    return json({ ok: false, rejected: true, error: rejectReason, reason: rejectReason, checks: check }, 422);
  }
  return json({ ok: true, validated: autoValidate, checks: check });
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

// ═══════════════════════════════════════════════════════════════════════════
// ESPELHO DO APP (print da tela da Shopee) — pedido do Victor, 04/08/2026
//
// A planilha da Shopee pode vir com a quantidade de pacotes errada por driver.
// O driver manda o print da tela "Entrega" (aba "Encerrado" + periodo selecionado)
// e o sistema confere contra a planilha.
//
// REGRAS (decisoes do Victor):
//  · so pede print onde existe driverpay_proof_requests (o botao "Solicitar espelho");
//  · GRUPO: so o LIDER anexa, mas UM PRINT POR DRIVER — o print de cada membro
//    marca o pagamento DAQUELE membro;
//  · o driver NUNCA ve numero nenhum: nem o esperado, nem que houve diferenca;
//  · data errada / print ilegivel  -> RECUSA na hora (422), com o motivo;
//  · quantidade diferente          -> ACEITA calado, aparece so no painel;
//  · falha nossa na leitura        -> ACEITA, fica pra conferir na mao.
// ═══════════════════════════════════════════════════════════════════════════

const PROOF_BUCKET = 'driverpay-delivery-proofs';
const MAX_PROOF_BYTES = 8 * 1024 * 1024; // 8 MB

/** Assinatura real do arquivo. Espelha o guard `%PDF` da NF, ao contrario: aqui SO imagem. */
function imageKind(bytes: Uint8Array): { ok: boolean; ext: string; mime: string } {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ok: true, ext: 'jpg', mime: 'image/jpeg' };
  }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ok: true, ext: 'png', mime: 'image/png' };
  }
  // WEBP = "RIFF"????"WEBP"
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { ok: true, ext: 'webp', mime: 'image/webp' };
  }
  return { ok: false, ext: '', mime: '' };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // `.slice()` em vez de passar `bytes` direto: devolve um Uint8Array com buffer
  // proprio (nunca SharedArrayBuffer), que e o que o WebCrypto exige. Sem isso o
  // `deno check` acusa TS2345 — o mesmo alerta que o `crypto.subtle.verify` do
  // login ja carrega hoje. Aqui da pra evitar sem forcar tipo.
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * De quem este driver pode mandar print: dele mesmo e, se for LIDER, dos membros
 * do grupo dele. Nada mais.
 *
 * ⚠️ Esta e a trava de seguranca da feature. Diferente das rotas de NF, aqui o
 * `driverId` do print vem do CORPO do pedido (o lider manda pelos membros) — sem
 * esta checagem, qualquer driver mandaria print no nome de qualquer outro e
 * deixaria o pagamento alheio verde.
 */
async function driversQuePossoEnviar(claims: DriverClaims): Promise<string[]> {
  const { data: ledGroup } = await supabase.from('driverpay_groups')
    .select('id').eq('leader_driver_id', claims.driver_id).eq('company_id', claims.company_id).maybeSingle();
  if (!ledGroup?.id) return [claims.driver_id];
  const { data: members } = await supabase.from('driverpay_group_members')
    .select('driver_id').eq('group_id', ledGroup.id);
  return [...new Set([claims.driver_id, ...(members ?? []).map((m) => m.driver_id as string)])];
}

/** Plataformas com print solicitado nesta quinzena. Vazio = nao pede nada. */
async function plataformasSolicitadas(companyId: string, periodId: string): Promise<string[]> {
  const { data } = await supabase.from('driverpay_proof_requests')
    .select('platform_name').eq('company_id', companyId).eq('period_id', periodId);
  return [...new Set((data ?? []).map((r) => r.platform_name as string))];
}

/** Pacotes que a planilha diz pra (driver, plataforma) na quinzena. 0 = sem base. */
async function pacotesEsperados(periodId: string, driverId: string, platformName: string): Promise<number> {
  const { data: pay } = await supabase.from('driverpay_payments')
    .select('id').eq('period_id', periodId).eq('driver_id', driverId).maybeSingle();
  if (!pay?.id) return 0;
  const { data: pks } = await supabase.from('driverpay_payment_packages')
    .select('packages').eq('payment_id', pay.id).eq('platform_name', platformName);
  return (pks ?? []).reduce((s, p) => s + (p.packages ?? 0), 0);
}

/** Quando o print deve ser tentado de novo. null = sai da fila (conferiu ou desistiu). */
function proximaTentativa(check: ProofCheckResult | null, tentativasJaFeitas: number): string | null {
  if (!proofShouldRequeue(check)) return null;
  const minutos = proofRetryDelayMinutes(tentativasJaFeitas);
  if (minutos === null) return null; // desistiu: fica so a conferencia manual
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

/**
 * Marca "espelho conferido" no pagamento do driver, se autorizado.
 *
 * Trava anti-remarcacao: se um humano ja mexeu neste check (marcou e depois
 * desmarcou), o automatico NAO passa por cima. So marca o que nunca foi tocado,
 * ou o que ja tinha sido marcado pelo proprio automatico.
 */
async function marcarEspelhoConferido(paymentId: string, companyId: string): Promise<boolean> {
  const { data: settings } = await supabase.from('driverpay_settings')
    .select('proof_auto_confirm').eq('company_id', companyId).maybeSingle();
  if (settings?.proof_auto_confirm === false) return false; // sem linha = ligado (padrao)

  const { data: atual } = await supabase.from('driverpay_payments')
    .select('espelho_conferido, espelho_conferido_by').eq('id', paymentId).maybeSingle();
  const nuncaTocadoPorHumano = !atual?.espelho_conferido_by || atual.espelho_conferido_by === 'auto';
  if (atual?.espelho_conferido || !nuncaTocadoPorHumano) return false;

  await supabase.from('driverpay_payments').update({
    espelho_conferido: true,
    espelho_conferido_at: new Date().toISOString(),
    espelho_conferido_by: 'auto',
  }).eq('id', paymentId);
  return true;
}

/**
 * Le o print de um registro que JA existe e grava o resultado. E o coracao da
 * FILA: o mesmo caminho serve pro reprocessamento oportunista e pro botao
 * "Conferir pendentes" do painel.
 *
 * Nao recusa ninguem aqui: o print ja foi aceito no envio. Se agora a leitura diz
 * que o periodo esta errado, isso vira informacao pro painel (o driver ja recebeu
 * "enviado" e nao pode ser desmentido depois).
 */
async function reconferirPrint(row: {
  id: string; company_id: string; period_id: string; driver_id: string;
  payment_id: string | null; platform_name: string; file_path: string;
  file_type: string | null; check_attempts: number;
}): Promise<'conferido' | 'divergente' | 'na-fila' | 'desistiu' | 'erro'> {
  const tentativas = (row.check_attempts ?? 0) + 1;
  try {
    const { data: per } = await supabase.from('driverpay_periods')
      .select('start_date, end_date').eq('id', row.period_id).maybeSingle();
    if (!per?.start_date || !per?.end_date) return 'erro';

    const { data: blob, error: dlErr } = await supabase.storage
      .from(PROOF_BUCKET).download(row.file_path);
    if (dlErr || !blob) return 'erro';
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let b64 = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    b64 = btoa(b64);

    const esperado = await pacotesEsperados(row.period_id, row.driver_id, row.platform_name);
    const { data: settings } = await supabase.from('driverpay_settings')
      .select('proof_tolerance_packages').eq('company_id', row.company_id).maybeSingle();

    const leitura = await readProofImage(
      b64, row.file_type ?? 'image/jpeg', visionConfigFromEnv(Deno.env.toObject()),
      (m) => console.log(`[fila ${row.id}] ${m}`),
    );
    const check = runProofCheck({
      reading: leitura,
      periodStart: String(per.start_date),
      periodEnd: String(per.end_date),
      expectedPackages: esperado,
      platformLabel: row.platform_name,
      tolerancePackages: Number(settings?.proof_tolerance_packages ?? 0) || 0,
    });

    const confirmado = proofIsFullyConfirmed(check);
    const next = proximaTentativa(check, tentativas);

    await supabase.from('driverpay_delivery_proofs').update({
      // O print ja foi aceito no envio: reconferencia nunca vira 'rejeitado'.
      status: confirmado ? 'validado' : 'recebido',
      validated_at: confirmado ? new Date().toISOString() : null,
      check_status: check.status,
      check_qtd: check.qtdOk,
      check_periodo: check.periodoOk,
      read_packages: check.readPackages,
      read_start_date: check.readStart,
      read_end_date: check.readEnd,
      expected_packages: esperado || null,
      check_details: {
        autoConfirmed: confirmado,
        driverReasons: check.driverReasons,
        internalReasons: check.internalReasons,
        reconferido: true,
      },
      checked_at: new Date().toISOString(),
      check_attempts: tentativas,
      next_check_at: next,
    }).eq('id', row.id);

    if (confirmado && row.payment_id) await marcarEspelhoConferido(row.payment_id, row.company_id);

    if (confirmado) return 'conferido';
    if (check.status === 'pendente') return next ? 'na-fila' : 'desistiu';
    return 'divergente';
  } catch (err) {
    console.error(`[fila ${row.id}] falhou:`, err);
    // Erro nosso: devolve pra fila (ou desiste, se ja passou do limite).
    const next = proximaTentativa(null, tentativas);
    await supabase.from('driverpay_delivery_proofs')
      .update({ check_attempts: tentativas, next_check_at: next }).eq('id', row.id);
    return next ? 'na-fila' : 'desistiu';
  }
}

/**
 * Puxa da fila quem ja pode ser tentado de novo e reconfere.
 *
 * Chamado de dois jeitos: OPORTUNISTA (todo print novo aproveita e limpa alguns
 * da fila de graca) e SOB DEMANDA (botao "Conferir pendentes" do painel / cron).
 */
async function processarFila(companyId: string | null, limite: number): Promise<Record<string, number>> {
  let q = supabase.from('driverpay_delivery_proofs')
    .select('id, company_id, period_id, driver_id, payment_id, platform_name, file_path, file_type, check_attempts')
    .not('next_check_at', 'is', null)
    .lte('next_check_at', new Date().toISOString());
  // null = TODAS as empresas (e o caso do agendador, que nao tem empresa).
  if (companyId) q = q.eq('company_id', companyId);
  const { data: fila } = await q.order('next_check_at', { ascending: true }).limit(limite);

  const placar: Record<string, number> = {};
  for (const row of fila ?? []) {
    const r = await reconferirPrint(row as Parameters<typeof reconferirPrint>[0]);
    placar[r] = (placar[r] ?? 0) + 1;
    // Cota esgotada: para de insistir agora e deixa o resto pra proxima rodada.
    if (r === 'na-fila') break;
  }
  return placar;
}

/**
 * O que este driver precisa anexar. Se ele lidera um grupo, vem um item por membro,
 * com o NOME do membro pra ele saber de quem e cada print.
 *
 * ⚠️ CONTRATO DE PRIVACIDADE: a resposta NAO carrega quantidade esperada, nem
 * resultado de conferencia de quantidade. So o que o driver precisa pra agir.
 */
async function proofSlots(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const periodId = String(body.periodId ?? '').trim();

  // ⚠️ periodId e OPCIONAL de proposito (corrigido em 04/08, achado pelo E2E do
  // portal): no fluxo real o print e pedido ANTES de o espelho de pagamento ser
  // publicado — a conferencia e justamente o que libera o pagamento. Se a tela
  // dependesse de uma quinzena vinda do espelho publicado, o driver nao teria por
  // onde enviar. Sem periodId, devolve o que ele deve em TODAS as quinzenas.
  let periodIds: string[];
  if (periodId) {
    periodIds = [periodId];
  } else {
    const { data: reqs } = await supabase.from('driverpay_proof_requests')
      .select('period_id').eq('company_id', claims.company_id);
    periodIds = [...new Set((reqs ?? []).map((r) => r.period_id as string))];
  }
  if (periodIds.length === 0) return json({ slots: [] });

  // Plataformas solicitadas, por quinzena.
  const { data: reqRows } = await supabase.from('driverpay_proof_requests')
    .select('period_id, platform_name').eq('company_id', claims.company_id).in('period_id', periodIds);
  const platsPorPeriodo = new Map<string, string[]>();
  for (const r of reqRows ?? []) {
    const lista = platsPorPeriodo.get(r.period_id as string) ?? [];
    lista.push(r.platform_name as string);
    platsPorPeriodo.set(r.period_id as string, lista);
  }
  if (platsPorPeriodo.size === 0) return json({ slots: [] });

  const { data: pers } = await supabase.from('driverpay_periods')
    .select('id, label').in('id', [...platsPorPeriodo.keys()]);
  const labelDe = new Map((pers ?? []).map((p) => [p.id as string, p.label as string]));

  const driverIds = await driversQuePossoEnviar(claims);
  const { data: pays } = await supabase.from('driverpay_payments')
    .select('id, driver_id, period_id').in('period_id', [...platsPorPeriodo.keys()]).in('driver_id', driverIds);
  const payList = pays ?? [];
  if (payList.length === 0) return json({ slots: [] });

  const { data: pks } = await supabase.from('driverpay_payment_packages')
    .select('payment_id, platform_name, packages').in('payment_id', payList.map((p) => p.id));
  const driverOf = new Map(payList.map((p) => [p.id as string, p.driver_id as string]));
  const periodOf = new Map(payList.map((p) => [p.id as string, p.period_id as string]));

  // (quinzena, driver, plataforma) que TEM pacote e foi solicitado.
  const precisa = new Set<string>();
  for (const pk of pks ?? []) {
    const payId = pk.payment_id as string;
    const dId = driverOf.get(payId);
    const perId = periodOf.get(payId);
    const plat = pk.platform_name as string;
    if (!dId || !perId || (pk.packages ?? 0) <= 0) continue;
    if ((platsPorPeriodo.get(perId) ?? []).includes(plat)) precisa.add(`${perId}|${dId}|${plat}`);
  }
  if (precisa.size === 0) return json({ slots: [] });

  const { data: drivers } = await supabase.from('driverpay_drivers')
    .select('id, name').in('id', driverIds);
  const nomeDe = new Map((drivers ?? []).map((d) => [d.id as string, d.name as string]));

  const { data: proofs } = await supabase.from('driverpay_delivery_proofs')
    .select('period_id, driver_id, platform_name, status, reject_reason, uploaded_at')
    .in('period_id', [...platsPorPeriodo.keys()]).in('driver_id', driverIds)
    .order('uploaded_at', { ascending: true });

  const enviados: Record<string, number> = {};
  const recusados: Record<string, number> = {};
  const motivo: Record<string, string | null> = {};
  for (const p of proofs ?? []) {
    const k = `${p.period_id}|${p.driver_id}|${p.platform_name}`;
    if (p.status === 'rejeitado') {
      recusados[k] = (recusados[k] ?? 0) + 1;
      motivo[k] = (p.reject_reason as string | null) ?? null; // asc -> fica o mais recente
    } else {
      enviados[k] = (enviados[k] ?? 0) + 1;
    }
  }

  const slots = [...precisa].map((k) => {
    const [pId, driverId, platformName] = k.split('|');
    return {
      periodId: pId,
      periodLabel: labelDe.get(pId) ?? '',
      driverId,
      driverName: nomeDe.get(driverId) ?? '',
      /** true quando o print e de outra pessoa (membro do grupo) — o app destaca. */
      doGrupo: driverId !== claims.driver_id,
      platformName,
      sent: enviados[k] ?? 0,
      rejected: recusados[k] ?? 0,
      rejectReason: motivo[k] ?? null,
    };
  }).sort((a, b) => (a.doGrupo === b.doGrupo ? a.driverName.localeCompare(b.driverName) : a.doGrupo ? 1 : -1));

  return json({ slots });
}

/**
 * Recebe o print, LE (IA), confere e registra.
 *
 * `driverId` no corpo porque o LIDER manda pelos membros — validado contra o token
 * por `driversQuePossoEnviar`. `claims.driver_id` continua sendo quem ENVIOU.
 */
async function proofUpload(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);

  const periodId = String(body.periodId ?? '').trim();
  const platformName = String(body.platformName ?? '').trim();
  const alvoId = String(body.driverId ?? claims.driver_id).trim();
  const filename = body.filename ? String(body.filename) : null;
  const b64raw = String(body.fileBase64 ?? '');
  if (!periodId || !platformName || !b64raw) return json({ error: 'Dados incompletos' }, 400);

  // Trava de seguranca: so pode enviar por si ou por membro do grupo que lidera.
  const permitidos = await driversQuePossoEnviar(claims);
  if (!permitidos.includes(alvoId)) return json({ error: 'Voce nao pode enviar o espelho deste entregador' }, 403);

  // So aceita se o print foi realmente pedido nesta quinzena pra esta plataforma.
  const plataformas = await plataformasSolicitadas(claims.company_id, periodId);
  if (!plataformas.includes(platformName)) return json({ error: 'Nao ha espelho solicitado para esta plataforma' }, 400);

  const pure = b64raw.includes(',') ? b64raw.slice(b64raw.indexOf(',') + 1) : b64raw;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(pure), (c) => c.charCodeAt(0)); }
  catch { return json({ error: 'Arquivo invalido' }, 400); }
  if (bytes.length === 0) return json({ error: 'Arquivo vazio' }, 400);
  if (bytes.length > MAX_PROOF_BYTES) return json({ error: 'Imagem muito grande (max 8MB)' }, 413);

  // SO imagem (o contrario da NF, que so aceita PDF). Confia na assinatura do
  // arquivo, nao no que o cliente declarou.
  const kind = imageKind(bytes);
  if (!kind.ok) return json({ error: 'Envie uma imagem (print ou foto da tela do app)' }, 400);

  // As datas da quinzena sao a base da conferencia. Sem elas nao da pra conferir
  // periodo — o painel exige preencher no botao "Solicitar espelho", entao isto
  // aqui e cinto de seguranca.
  const { data: per } = await supabase.from('driverpay_periods')
    .select('start_date, end_date, label').eq('id', periodId).maybeSingle();
  if (!per?.start_date || !per?.end_date) {
    return json({ error: 'A quinzena esta sem datas cadastradas. Avise a CD.' }, 400);
  }

  // ── Conferencia. Qualquer excecao vira 'pendente' — nunca recusa por falha nossa.
  let check: ProofCheckResult | null = null;
  let esperado = 0;
  try {
    esperado = await pacotesEsperados(periodId, alvoId, platformName);
    const { data: settings } = await supabase.from('driverpay_settings')
      .select('proof_auto_confirm, proof_tolerance_packages').eq('company_id', claims.company_id).maybeSingle();
    const leitura = await readProofImage(
      pure, kind.mime, visionConfigFromEnv(Deno.env.toObject()),
      (m) => console.log(m),
    );
    check = runProofCheck({
      reading: leitura,
      periodStart: String(per.start_date),
      periodEnd: String(per.end_date),
      expectedPackages: esperado,
      platformLabel: platformName,
      tolerancePackages: Number(settings?.proof_tolerance_packages ?? 0) || 0,
    });
  } catch (err) {
    console.error('[proof-check] falha interna (print segue como pendente):', err);
    check = null;
  }

  const recusar = check !== null && proofShouldReject(check);
  const confirmado = check !== null && proofIsFullyConfirmed(check);
  const rejectReason = recusar ? `[automático] ${check!.driverReasons.join(' ')}` : null;

  const sha = await sha256Hex(bytes);
  const path = `${claims.company_id}/${periodId}/${alvoId}/${platformName.replace(/[^\w.-]+/g, '_')}/${crypto.randomUUID()}.${kind.ext}`;
  const { error: upErr } = await supabase.storage.from(PROOF_BUCKET)
    .upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (upErr) return json({ error: 'Falha ao subir o print', details: upErr.message }, 500);

  const { data: pay } = await supabase.from('driverpay_payments')
    .select('id').eq('period_id', periodId).eq('driver_id', alvoId).maybeSingle();

  const { error: insErr } = await supabase.from('driverpay_delivery_proofs').insert([{
    company_id: claims.company_id,
    driver_id: alvoId,
    period_id: periodId,
    payment_id: pay?.id ?? null,
    platform_name: platformName,
    file_path: path,
    file_type: kind.mime,
    original_filename: filename,
    file_sha256: sha,
    upload_source: 'app',
    uploaded_by: claims.driver_id, // quem ENVIOU (o lider, no grupo)
    status: recusar ? 'rejeitado' : (confirmado ? 'validado' : 'recebido'),
    reject_reason: rejectReason,
    // validated_by tem FK pra users(id): confirmacao AUTOMATICA fica NULL e o
    // marcador vive em check_details.autoConfirmed (licao da NF).
    validated_at: confirmado ? new Date().toISOString() : null,
    validated_by: null,
    check_status: check ? check.status : 'pendente',
    check_qtd: check?.qtdOk ?? null,
    check_periodo: check?.periodoOk ?? null,
    read_packages: check?.readPackages ?? null,
    read_start_date: check?.readStart ?? null,
    read_end_date: check?.readEnd ?? null,
    expected_packages: esperado || null,
    check_details: check ? {
      autoConfirmed: confirmado,
      driverReasons: check.driverReasons,
      internalReasons: check.internalReasons,
    } : null,
    checked_at: new Date().toISOString(),
    // FILA: a leitura falhou por culpa nossa (cota/rede/API fora)? Volta depois,
    // sozinho. Se conferiu — ou se o problema e a foto — sai da fila na hora.
    check_attempts: 1,
    next_check_at: proximaTentativa(check, 1),
  }]);
  if (insErr) return json({ error: 'Falha ao registrar o print', details: insErr.message }, 500);

  if (confirmado && pay?.id) await marcarEspelhoConferido(pay.id, claims.company_id);

  // Reprocessamento OPORTUNISTA: este envio aproveita e tenta limpar alguns da
  // fila de graca. Assim, numa leva grande, quem caiu na cota no comeco tende a
  // ser reconferido pelos envios seguintes — sem ninguem clicar em nada.
  // Falha aqui nunca atrapalha o envio que o driver acabou de fazer.
  try {
    if (check !== null && check.status !== 'pendente') await processarFila(claims.company_id, 2);
  } catch (err) {
    console.error('[fila] reprocessamento oportunista falhou (ignorado):', err);
  }

  if (recusar) {
    // 422 = recusa de conferencia (o cliente trata nao-2xx como erro e mostra o
    // motivo). SO chega aqui por data errada ou print ilegivel — quantidade
    // divergente NUNCA recusa, por decisao do Victor.
    return json({ ok: false, rejected: true, error: rejectReason, reason: rejectReason }, 422);
  }
  // ⚠️ Resposta de sucesso PROPOSITALMENTE pobre: nada de quantidade, nada de
  // "bateu/nao bateu". O driver so sabe que chegou.
  return json({ ok: true });
}

/** O que este driver ja mandou. Sem numero, sem resultado de conferencia. */
async function proofList(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  // periodId opcional: sem ele, lista o que o driver mandou em qualquer quinzena
  // (mesma razao do proof-slots — o print vem antes do espelho publicado).
  const periodId = String(body.periodId ?? '').trim();

  const driverIds = await driversQuePossoEnviar(claims);
  let q = supabase.from('driverpay_delivery_proofs')
    .select('id, driver_id, platform_name, original_filename, status, reject_reason, uploaded_at')
    .eq('company_id', claims.company_id).in('driver_id', driverIds);
  if (periodId) q = q.eq('period_id', periodId);
  const { data } = await q.order('uploaded_at', { ascending: false });

  const { data: drivers } = await supabase.from('driverpay_drivers').select('id, name').in('id', driverIds);
  const nomeDe = new Map((drivers ?? []).map((d) => [d.id as string, d.name as string]));

  const files = (data ?? []).map((f) => ({
    id: f.id,
    driverId: f.driver_id,
    driverName: nomeDe.get(f.driver_id as string) ?? '',
    platformName: f.platform_name,
    filename: f.original_filename,
    // 'validado' e 'recebido' aparecem IGUAIS pro driver ("enviado"): ele nao pode
    // saber se a quantidade bateu.
    status: f.status === 'rejeitado' ? 'rejeitado' : 'enviado',
    rejectReason: f.status === 'rejeitado' ? (f.reject_reason ?? null) : null,
    uploadedAt: f.uploaded_at,
  }));
  return json({ files });
}

/**
 * Esvazia a fila. Chamada pelo AGENDADOR do banco (pg_cron + pg_net), pra fila
 * andar sozinha sem ninguem abrir o painel — pedido do Victor em 04/08:
 * "a fila deve funcionar sozinha de forma sempre automatica".
 *
 * ⚠️ Esta fn roda com --no-verify-jwt (o driver precisa chamar sem login do
 * painel), entao TODAS as rotas sao publicas. Esta aqui mexe em varias empresas,
 * entao exige um segredo dedicado: `PROOF_QUEUE_SECRET`, comparado em tempo
 * CONSTANTE (comparar com === vaza o tamanho do prefixo correto pelo tempo de
 * resposta). Sem o secret configurado a rota fica desligada — negada sempre.
 */
async function proofProcessQueue(req: Request, body: Body): Promise<Response> {
  const esperado = Deno.env.get('PROOF_QUEUE_SECRET') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  const recebido = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : String(body.secret ?? '');
  if (!esperado || !timingSafeEqual(esperado, recebido)) {
    return json({ error: 'Nao autorizado' }, 401);
  }
  const limite = Math.min(Math.max(Number(body.limit ?? 10) || 10, 1), 50);
  const placar = await processarFila(null, limite);
  const total = Object.values(placar).reduce((s, n) => s + n, 0);
  console.log(`[fila] rodada do agendador: ${total} print(s) — ${JSON.stringify(placar)}`);
  return json({ ok: true, processados: total, placar });
}

/** Comparacao que nao vaza o tamanho do acerto pelo tempo gasto. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
      // Espelho do app (print da tela da Shopee) — 04/08/2026
      case 'proof-slots': return await proofSlots(req, body);
      case 'proof-upload': return await proofUpload(req, body);
      case 'proof-list': return await proofList(req, body);
      case 'proof-process-queue': return await proofProcessQueue(req, body);
      default: return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('[driver-public-api] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }
});
