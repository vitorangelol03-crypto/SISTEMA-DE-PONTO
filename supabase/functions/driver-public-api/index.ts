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
import {
  runNfCheck, mirrorExpectedValue, nfTextoIlegivel, notasQueOcupamVaga, nfSplitSlices,
  type NfCheckResult, type NfSplitForm,
} from './nfCheck.ts';
import {
  proofContarDataErrada,
  proofDeveApagar,
  proofIsFullyConfirmed,
  proofRetryDelayMinutes,
  proofShouldReject,
  proofShouldRequeue,
  runProofCheck,
  type ProofCheckResult,
} from '../_shared/proofCheck.ts';
import { readProofImage, visionConfigFromEnv } from '../_shared/visionRead.ts';
import { readNotaFiscalTexto } from '../_shared/nfVisionRead.ts';

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

type Body = Record<string, unknown>;

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
    .select('id, period_id, platform_key, scope, platform_filter, delivered_at, viewed_at, driverpay_periods(label, start_date, end_date, status)')
    .eq('driver_id', claims.driver_id)
    .order('delivered_at', { ascending: false });
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  // Situação da nota de CADA espelho (05/08/2026, pedido do Victor: "apos enviado o
  // botão muda para nota enviada"). Vem da MESMA conta da tela de anexar — ver
  // `vagasDeNotaPorPeriodo`. Sem isso o botão continuaria dizendo "Anexar nota"
  // depois de o driver já ter mandado, e ele mandaria de novo (a queixa da tela
  // cheia de nota repetida começou aí).
  const periodIds = [...new Set((data ?? []).map((m) => m.period_id as string))];
  const vagas = await vagasDeNotaPorPeriodo(claims, periodIds);

  const mirrors = (data ?? []).map((m) => {
    const per = Array.isArray(m.driverpay_periods) ? m.driverpay_periods[0] : m.driverpay_periods;
    const chave = (m.platform_key as string | null) ?? '';
    const doEspelho = (vagas.get(m.period_id as string) ?? [])
      .filter((v) => (v.mirrorKey ?? '') === chave);
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
      /** Quantas notas este espelho pede (0 = nenhuma; ex.: quinzena sem pacote). */
      nfVagas: doEspelho.length,
      /** Quantas ja chegaram (recebida/validada). */
      nfEnviadas: doEspelho.filter((v) => v.sent > 0).length,
      /** Vagas com nota RECUSADA e nenhuma boa no lugar — o driver precisa da CD. */
      nfRecusadas: doEspelho.filter((v) => v.sent === 0 && v.rejected > 0).length,
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
interface SlotOut {
  emitterId: string; cnpj: string; label: string;
  mirrorKey: string | null; mirrorLabel: string;
  sent: number; rejected: number; rejectReason: string | null;
}

/**
 * As vagas de nota do driver em VÁRIOS períodos de uma vez.
 *
 * 05/08/2026: a lista de espelhos passou a mostrar "Nota enviada" no botão, e pra
 * isso ela precisa saber quantas notas cada espelho pede e quantas já chegaram — a
 * MESMA conta da tela de anexar. Ficar com duas contas parecidas seria pedir pra um
 * dia a lista dizer "enviada" e o envio recusar (ou o contrário).
 *
 * São 6 queries **independentes da quantidade de períodos** — o driver acumula um
 * espelho por quinzena, e uma rodada de queries por espelho cresceria pra sempre.
 */
async function vagasDeNotaPorPeriodo(
  claims: DriverClaims, periodIds: string[],
): Promise<Map<string, SlotOut[]>> {
  const saida = new Map<string, SlotOut[]>();
  for (const p of periodIds) saida.set(p, []);
  if (periodIds.length === 0) return saida;

  // Grupo: se este driver e LIDER, ele anexa as notas do GRUPO inteiro — entao os CNPJs
  // esperados vem dos pacotes de TODOS os membros (nao so dele). Se ele esta num grupo mas
  // NAO e o lider, nao anexa nada: a mesma regra do espelho e do print (04/08/2026).
  // Quem nao esta em grupo nenhum continua anexando a sua.
  const driverIds = await driversQuePossoEnviar(claims);
  if (driverIds.length === 0) return saida;

  const { data: pays } = await supabase.from('driverpay_payments')
    .select('id, period_id').in('period_id', periodIds).in('driver_id', driverIds);
  const periodoDoPagamento = new Map((pays ?? []).map((p) => [p.id as string, p.period_id as string]));
  const payIds = [...periodoDoPagamento.keys()];
  if (payIds.length === 0) return saida;

  // Plataformas com pacote, por período.
  const nomesPorPeriodo = new Map<string, string[]>();
  const { data: pks } = await supabase.from('driverpay_payment_packages')
    .select('payment_id, platform_name, packages').in('payment_id', payIds);
  for (const pk of pks ?? []) {
    if ((pk.packages ?? 0) <= 0) continue;
    const per = periodoDoPagamento.get(pk.payment_id as string);
    if (!per) continue;
    const lista = nomesPorPeriodo.get(per) ?? [];
    if (!lista.includes(pk.platform_name as string)) lista.push(pk.platform_name as string);
    nomesPorPeriodo.set(per, lista);
  }
  if (nomesPorPeriodo.size === 0) return saida;

  const { data: plats } = await supabase.from('driverpay_platforms')
    .select('name, nota_emitter_id').eq('company_id', claims.company_id);
  const emitterOf = new Map((plats ?? []).map((p) => [p.name as string, p.nota_emitter_id as string | null]));

  const { data: emitters } = await supabase.from('driverpay_nota_emitters')
    .select('id, cnpj, label').eq('company_id', claims.company_id).eq('active', true)
    .order('sort_order', { ascending: true });
  const emitterById = new Map((emitters ?? []).map((e) => [e.id as string, e]));

  // Espelhos publicados pra ESTE driver (o driver e quem recebe: no grupo, so o lider
  // tem publicacao).
  const { data: pubs } = await supabase.from('driverpay_mirror_publications')
    .select('period_id, platform_key, platform_filter, delivered_at')
    .eq('driver_id', claims.driver_id).in('period_id', periodIds)
    .order('delivered_at', { ascending: true });

  const { data: filesRaw } = await supabase.from('driverpay_nota_fiscal_files')
    .select('period_id, nota_emitter_id, status, reject_reason, uploaded_at, mirror_platform_key, check_details')
    .eq('driver_id', claims.driver_id).in('period_id', periodIds)
    .order('uploaded_at', { ascending: true });
  // Dupla EXPIRADA não conta em nada: nem segura vaga, nem aparece como recusada
  // (a nota estava certa, só o relógio dos 10 minutos venceu — o slot volta livre).
  const files = (filesRaw ?? []).filter(
    (f) => !ehSplitExpirada({ status: f.status as string, check_details: f.check_details }),
  );

  // Contagem por SLOT (periodo + espelho + CNPJ). Nota antiga (mirror_platform_key NULL)
  // conta no slot daquele CNPJ de qualquer espelho — senao quem ja mandou antes desta
  // mudanca apareceria devendo nota.
  const sent: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  const rejectReason: Record<string, string | null> = {};
  const slotKey = (periodId: string, mirrorKey: string | null, emitterId: string) =>
    `${periodId}|${mirrorKey ?? '*'}|${emitterId}`;

  for (const f of files ?? []) {
    const k = slotKey(
      f.period_id as string, (f.mirror_platform_key as string | null) ?? null, f.nota_emitter_id as string,
    );
    if (f.status === 'rejeitada') {
      rejected[k] = (rejected[k] ?? 0) + 1;
      rejectReason[k] = (f.reject_reason as string | null) ?? null; // ordem asc -> fica a mais recente
    } else {
      sent[k] = (sent[k] ?? 0) + 1;
    }
  }

  const push = (periodId: string, emitterId: string, mirrorKey: string | null, mirrorLabel: string) => {
    const em = emitterById.get(emitterId);
    if (!em) return;
    const k = slotKey(periodId, mirrorKey, emitterId);
    const kLegado = slotKey(periodId, null, emitterId);
    saida.get(periodId)!.push({
      emitterId, cnpj: em.cnpj as string, label: em.label as string,
      mirrorKey, mirrorLabel,
      sent: (sent[k] ?? 0) + (mirrorKey ? (sent[kLegado] ?? 0) : 0),
      rejected: rejected[k] ?? 0,
      rejectReason: rejectReason[k] ?? null,
    });
  };

  for (const periodId of periodIds) {
    const platformNames = nomesPorPeriodo.get(periodId) ?? [];
    if (platformNames.length === 0) continue;
    const emitterIds = [...new Set(platformNames.map((n) => emitterOf.get(n)).filter(Boolean))] as string[];
    if (emitterIds.length === 0) continue;

    // Monta os slots: um por (espelho, CNPJ) quando ha espelho; senao um por CNPJ.
    const doPeriodo = (pubs ?? []).filter((p) => p.period_id === periodId);
    if (doPeriodo.length > 0) {
      for (const pub of doPeriodo) {
        const filtro = Array.isArray(pub.platform_filter) && pub.platform_filter.length
          ? (pub.platform_filter as string[]) : null;
        const doEspelho = (filtro ?? platformNames).filter((n) => platformNames.includes(n));
        const cnpjsDoEspelho = [...new Set(doEspelho.map((n) => emitterOf.get(n)).filter(Boolean))] as string[];
        const label = filtro ? `SOMENTE ${filtro.join(' + ').toUpperCase()}` : 'Quinzena completa';
        for (const emitterId of cnpjsDoEspelho) push(periodId, emitterId, (pub.platform_key as string) ?? '', label);
      }
    } else {
      for (const emitterId of emitterIds) push(periodId, emitterId, null, 'Quinzena completa');
    }
  }

  return saida;
}

async function nfSlots(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const periodId = String(body.periodId ?? '').trim();
  if (!periodId) return json({ error: 'periodId ausente' }, 400);

  // Nota dividida: expira duplas vencidas ANTES de montar os slots — senão a
  // rodada que expira ainda conta a parte 1 velha como 'enviada' e a vaga só
  // aparece livre na recarga seguinte (pego pelo teste ponta-a-ponta de 20/08).
  await expirarDuplasDoDriver(claims.driver_id, periodId);

  const porPeriodo = await vagasDeNotaPorPeriodo(claims, [periodId]);
  const slots = porPeriodo.get(periodId) ?? [];

  // Nota dividida (19/08/2026, cross-CNPJ desde 04/09/2026): a parte 1, uma vez
  // enviada, JÁ ocupa a vaga do CNPJ dela (conta normal em `sent` acima) — quem
  // precisa avisar "falta a segunda de R$ X" é o OUTRO CNPJ (o par ainda vazio).
  const abertaGlobal = await parte1AbertaDoSlot(claims.driver_id, periodId);
  if (abertaGlobal) {
    for (const s of slots as Array<Record<string, unknown>>) {
      // O CNPJ onde a parte 1 já caiu não precisa de aviso (já mostra "enviada");
      // e um CNPJ que já tem nota própria (sem relação com esta dupla) não vira
      // "esperando a segunda" por cima do que já está lá.
      if (s.emitterId === abertaGlobal.nota_emitter_id || (s.sent as number) > 0) continue;
      const total = Number((abertaGlobal.check_details as { splitTotal?: number } | null)?.splitTotal ?? NaN);
      const veio = Number(abertaGlobal.read_value ?? NaN);
      s.splitOpen = {
        form: abertaGlobal.split_form,
        part1Value: Number.isFinite(veio) ? veio : null,
        remaining: Number.isFinite(total) && Number.isFinite(veio)
          ? Math.round((total - veio) * 100) / 100 : null,
        expiresAt: new Date(new Date(abertaGlobal.uploaded_at).getTime() + NF_SPLIT_WINDOW_MS).toISOString(),
      };
    }
  }
  return json({ slots });
}

/**
 * Nota dividida (19/08/2026): as FATIAS exatas de cada forma, pro app mostrar na
 * escolha ("cada nota deve ter R$ X e R$ Y" — exigência do Victor). A conta é a
 * MESMA da conferência (nfSplitSlices sobre os candidatos do espelho publicado).
 */
async function nfSplitPreview(req: Request, body: Body): Promise<Response> {
  const claims = await claimsFromRequest(req, body);
  if (!claims) return json({ error: 'Sessao invalida' }, 401);
  const periodId = String(body.periodId ?? '').trim();
  if (!periodId) return json({ error: 'Dados incompletos' }, 400);

  // 04/09/2026 (pedido do Victor, achado real com o driver Gessiley): "dividir em 2
  // notas" deixou de ser "2 pessoas no mesmo CNPJ" e virou "2 CNPJs diferentes,
  // cada um levando uma fatia do total combinado" (motivo: teto de valor por nota,
  // tipo MEI — uma nota só com o total de UM CNPJ pode estourar o limite da
  // pessoa). O total não depende mais de qual CNPJ o driver abriu a tela.
  const { total } = await buildComboTotal(claims.driver_id, claims.company_id, periodId);
  if (total <= 0) {
    return json({ error: 'Ainda não há valor calculado pra dividir — aguarde ou envie a nota única.' }, 409);
  }
  return json({
    total,
    forms: {
      '50': nfSplitSlices(total, '50'),
      '70-30': nfSplitSlices(total, '70-30'),
    },
    windowMinutes: NF_SPLIT_WINDOW_MS / 60_000,
  });
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

  /**
   * O escopo (individual/grupo) tem pacote de algum CNPJ DIFERENTE de `emitterId`?
   * (04/09/2026, achado real — driver GESSILEY: seu `liquido_individual` soma
   * Shopee+eMile JUNTOS — R$9.339,00 — e a conferência da nota do CNPJ Shopee
   * recusava cobrando esse total combinado, que nenhuma nota de UM CNPJ só bate.
   * Mesma causa raiz do achado do espelho combinado, só que em `liquido_*` em vez
   * de `espelho_*` — subiu antes por ser usada só embaixo; movida pra cima porque
   * `liquido_*` agora também depende dela.)
   */
  const hasOtherEmitterInScope = (ids: string[], filter: string[] | null): boolean => {
    for (const pk of packs ?? []) {
      const dId = driverOf.get(pk.payment_id as string);
      if (!dId || !ids.includes(dId)) continue;
      if ((pk.packages ?? 0) <= 0) continue;
      if (filter && !filter.includes(pk.platform_name as string)) continue;
      const em = emitterByPlatform.get(pk.platform_name as string);
      if (em && em !== emitterId) return true;
    }
    return false;
  };

  const cands: Record<string, number> = {
    somaCnpj_individual: platformSum([driverId], null, true),
  };
  // liquido_* soma o NET de TODAS as plataformas da pessoa junto (nunca só do CNPJ
  // pedido) — só entra como candidato quando a pessoa/grupo não tem pacote de NENHUM
  // outro CNPJ na quinzena, senão "bate" com um total que a nota nem cobre inteira.
  if (!hasOtherEmitterInScope([driverId], null)) {
    cands.liquido_individual = netSum([driverId]);
  }
  if (groupIds.length > 1) {
    cands.somaCnpj_grupo = platformSum(groupIds, null, true);
    if (!hasOtherEmitterInScope(groupIds, null)) {
      cands.liquido_grupo = netSum(groupIds);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A MESMA SOMA, COM VALE/PERDA ABATIDO  (05/08/2026 — urgente, gente travada)
  //
  // `somaCnpj_*` soma os pacotes daquele CNPJ SEM abater desconto. Mas o espelho
  // IMPRIME o total ja abatido: com os PNR lancados em 04/08, o PDF do Oliur passou
  // a dizer R$ 6.090,41 (= 6.119,40 - 28,99) e ele emitiu a nota nesse valor — e a
  // conferencia recusava, cobrando os R$ 6.119,40. Mesma coisa com o Fabricio
  // (7.574,10 = 7.602,00 - 27,90). A regra do projeto e "a nota segue o total
  // IMPRESSO no espelho", entao esse valor precisa ser candidato.
  //
  // ADITIVO de proposito: o candidato antigo CONTINUA valendo. Quem baixou o espelho
  // ANTES do desconto entrar tem um PDF com o valor cheio, e a nota dele nao pode
  // passar a ser recusada. Sem desconto os dois candidatos sao iguais e nada muda.
  // ══════════════════════════════════════════════════════════════════════════
  const abatidoIndividual = round2(cands.somaCnpj_individual - deductionsSum([driverId]));
  if (abatidoIndividual !== cands.somaCnpj_individual && abatidoIndividual > 0) {
    cands.somaCnpj_individual_abatido = abatidoIndividual;
  }
  if (groupIds.length > 1) {
    const abatidoGrupo = round2(cands.somaCnpj_grupo - deductionsSum(groupIds));
    if (abatidoGrupo !== cands.somaCnpj_grupo && abatidoGrupo > 0) {
      cands.somaCnpj_grupo_abatido = abatidoGrupo;
    }
  }

  const { data: pubs } = await supabase.from('driverpay_mirror_publications')
    .select('scope, platform_filter, include_deductions, printed_total')
    .eq('driver_id', driverId).eq('period_id', periodId);
  for (const pub of pubs ?? []) {
    const filter = Array.isArray(pub.platform_filter) && pub.platform_filter.length
      ? (pub.platform_filter as string[])
      : null;
    const ids = pub.scope === 'group' && groupIds.length > 1 ? groupIds : [driverId];
    // Espelho cobre CNPJ diferente do que esta nota é pra este: o total
    // impresso é combinado, não confiável pra ESTE CNPJ — pula o candidato
    // (sobra somaCnpj_*/liquido_* abaixo, sempre filtrado por CNPJ certo).
    if (hasOtherEmitterInScope(ids, filter)) continue;
    // include_deductions=false (pagamento parcial por plataforma): o espelho lista os
    // vales/perdas mas NÃO abate — a nota vem pelo bruto. Coluna nova (default true):
    // publicação antiga/sem a coluna segue como sempre.
    const includeDeductions = pub.include_deductions !== false;
    // 07/08: se a publicação guardou o TOTAL IMPRESSO, é ele que vale — a nota segue o
    // papel que o driver recebeu. Sem isso, o desconto por SALDO (abate parcial) faria a
    // fórmula esperar o abate cheio e RECUSAR a nota certa.
    const printedTotal = pub.printed_total === null || pub.printed_total === undefined
      ? null
      : Number(pub.printed_total);
    const value = mirrorExpectedValue({
      grossInScope: round2(platformSum(ids, filter, false) + zapexSum(ids, filter)),
      deductions: deductionsSum(ids),
      netFull: netSum(ids),
      hasPlatformFilter: filter !== null,
      includeDeductions,
      printedTotal,
    });
    const key = `espelho_${pub.scope}${filter ? '_' + filter.join('+') : '_cheio'}${
      includeDeductions ? '' : '_sem_abate'
    }`;
    cands[key] = value;
  }
  return cands;
}

/**
 * Total COMBINADO de todos os CNPJs juntos, pra "dividir em 2 notas entre CNPJs"
 * (04/09/2026, pedido do Victor — achado real com o driver Gessiley: ele precisa
 * dividir por causa de um TETO de valor por nota, tipo limite do MEI — uma nota só
 * com o total de UM CNPJ estoura esse limite). Não filtra por emitterId — soma
 * TODAS as plataformas (todos os CNPJs) do escopo (grupo, se a pessoa lidera um;
 * senão só ela), menos vale/perda pendente — mesmo cálculo do "abatido" que já
 * existe por CNPJ em `buildValueCandidates`, só que sem separar por CNPJ.
 */
async function buildComboTotal(
  driverId: string, companyId: string, periodId: string,
): Promise<{ total: number; ids: string[] }> {
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const { data: ledGroup } = await supabase.from('driverpay_groups')
    .select('id').eq('leader_driver_id', driverId).eq('company_id', companyId).maybeSingle();
  let ids: string[] = [driverId];
  if (ledGroup?.id) {
    const { data: members } = await supabase.from('driverpay_group_members')
      .select('driver_id').eq('group_id', ledGroup.id);
    ids = [...new Set([driverId, ...(members ?? []).map((m) => m.driver_id as string)])];
  }

  const { data: pays } = await supabase.from('driverpay_payments')
    .select('id, driver_id, zapex_rate').eq('period_id', periodId).in('driver_id', ids);
  const payList = pays ?? [];
  const payIds = payList.map((p) => p.id);
  const driverOf = new Map(payList.map((p) => [p.id as string, p.driver_id as string]));

  const { data: packs } = payIds.length
    ? await supabase.from('driverpay_payment_packages')
      .select('payment_id, packages, rate_snapshot').in('payment_id', payIds)
    : { data: [] as never[] };
  let bruto = 0;
  for (const pk of packs ?? []) {
    if (!driverOf.has(pk.payment_id as string)) continue;
    bruto += (pk.packages ?? 0) * Number(pk.rate_snapshot ?? 0);
  }

  const { data: zapexRows } = payIds.length
    ? await supabase.from('driverpay_zapex').select('payment_id').in('payment_id', payIds)
    : { data: [] as never[] };
  const zapexRateOf = new Map(payList.map((p) => [p.id as string, Number(p.zapex_rate ?? 0)]));
  for (const z of zapexRows ?? []) bruto += zapexRateOf.get(z.payment_id as string) ?? 0;

  const { data: discountRows } = payIds.length
    ? await supabase.from('driverpay_discounts').select('payment_id, amount').in('payment_id', payIds)
    : { data: [] as never[] };
  const { data: valeRows } = payIds.length
    ? await supabase.from('driverpay_vales').select('payment_id, amount').in('payment_id', payIds)
    : { data: [] as never[] };
  let deductions = 0;
  for (const row of [...(discountRows ?? []), ...(valeRows ?? [])]) {
    if (driverOf.has(row.payment_id as string)) deductions += Number(row.amount ?? 0);
  }

  return { total: round2(round2(bruto) - round2(deductions)), ids };
}

// ─── Nota dividida em 2 CNPJs (19/08/2026, decisão do Victor — redesenhada
// 04/09/2026: era "2 pessoas/nomes no mesmo CNPJ", virou "2 CNPJs diferentes,
// cada um levando uma fatia do total combinado" — motivo real: teto de valor
// por nota, tipo limite do MEI, que uma nota só com o total de UM CNPJ estoura)
// ──────────────────────────────────────────────────────────────────────────

/** Janela pra segunda nota da dupla chegar depois da primeira. */
const NF_SPLIT_WINDOW_MS = 10 * 60_000;

/** Nomes AUTORIZADOS a emitir nota por este driver (tabela nova, máx 2). */
async function nomesAutorizadosDe(driverId: string): Promise<string[]> {
  const { data } = await supabase.from('driverpay_driver_nota_names')
    .select('name').eq('driver_id', driverId);
  return (data ?? []).map((r) => String(r.name)).filter((n) => n.trim().length > 0);
}

type Parte1Aberta = {
  id: string; split_group: string; split_form: string; read_value: number | null;
  split_expected: number | null; matched_name: string | null; uploaded_at: string;
  check_details: Record<string, unknown> | null; nota_emitter_id: string;
};

/**
 * A parte 1 ABERTA da dupla deste driver (se houver) — e, de quebra, EXPIRA as
 * vencidas (lazy: roda no upload e no nf-slots; o cron também varre). Aberta =
 * split_part=1, status 'recebida', sem par, dentro dos 10 minutos.
 *
 * 04/09/2026: NÃO filtra mais por `emitterId` — a dupla agora é entre DOIS CNPJs
 * diferentes (não mais 2 pessoas no mesmo CNPJ), então a parte 1 pode estar em
 * QUALQUER CNPJ deste driver; quem chama decide se o CNPJ atual pode ser o par
 * (tem que ser DIFERENTE do de `nota_emitter_id`, ver `nfUpload`).
 *
 * ⚠️ A expiração marca 'rejeitada' com `check_details.splitExpired` — e essa recusa
 * NÃO segura a vaga (exceção à regra de 05/08 "recusada segura o lugar": aquilo
 * mira nota ERRADA reenviada em loop; aqui a nota estava CERTA, só o relógio venceu
 * — travar até a CD excluir puniria queda de internet no meio da dupla).
 */
async function parte1AbertaDoSlot(
  driverId: string, periodId: string,
): Promise<Parte1Aberta | null> {
  const { data: partes } = await supabase.from('driverpay_nota_fiscal_files')
    .select('id, split_group, split_form, split_part, read_value, split_expected, matched_name, uploaded_at, status, check_details, nota_emitter_id')
    .eq('driver_id', driverId).eq('period_id', periodId)
    .not('split_group', 'is', null)
    .order('uploaded_at', { ascending: true });
  const lista = partes ?? [];
  const temPar = new Set(lista.filter((f) => f.split_part === 2).map((f) => f.split_group as string));
  let aberta: Parte1Aberta | null = null;
  for (const f of lista) {
    if (f.split_part !== 1 || f.status !== 'recebida' || temPar.has(f.split_group as string)) continue;
    const idade = Date.now() - new Date(f.uploaded_at as string).getTime();
    if (idade > NF_SPLIT_WINDOW_MS) {
      await supabase.from('driverpay_nota_fiscal_files').update({
        status: 'rejeitada',
        reject_reason: '[automático] A segunda nota da dupla não chegou em 10 minutos. Envie as DUAS de novo.',
        check_details: { ...((f.check_details as Record<string, unknown> | null) ?? {}), splitExpired: true },
      }).eq('id', f.id);
      continue;
    }
    aberta = f as unknown as Parte1Aberta;
  }
  return aberta;
}

/** A nota rejeitada é uma dupla que EXPIROU? (não segura a vaga — ver acima.) */
function ehSplitExpirada(f: { status: string; check_details?: unknown }): boolean {
  return f.status === 'rejeitada'
    && Boolean((f.check_details as { splitExpired?: boolean } | null)?.splitExpired);
}

/** Expira TODAS as partes 1 vencidas deste driver no período (todos os CNPJs). */
async function expirarDuplasDoDriver(driverId: string, periodId: string): Promise<void> {
  const corte = new Date(Date.now() - NF_SPLIT_WINDOW_MS).toISOString();
  const { data: velhas } = await supabase.from('driverpay_nota_fiscal_files')
    .select('id, split_group, check_details')
    .eq('driver_id', driverId).eq('period_id', periodId)
    .eq('split_part', 1).eq('status', 'recebida').lt('uploaded_at', corte);
  for (const f of velhas ?? []) {
    const { data: par } = await supabase.from('driverpay_nota_fiscal_files')
      .select('id').eq('split_group', f.split_group).eq('split_part', 2).limit(1);
    if ((par ?? []).length > 0) continue;
    await supabase.from('driverpay_nota_fiscal_files').update({
      status: 'rejeitada',
      reject_reason: '[automático] A segunda nota da dupla não chegou em 10 minutos. Envie as DUAS de novo.',
      check_details: { ...((f.check_details as Record<string, unknown> | null) ?? {}), splitExpired: true },
    }).eq('id', f.id).eq('status', 'recebida');
  }
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

  // ── Nota dividida (19/08/2026): forma escolhida no app + qual das duas é esta ──
  // Ausente = nota única (comportamento de sempre, cliente antigo incluso).
  const splitFormRaw = body.splitForm === undefined || body.splitForm === null ? null : String(body.splitForm);
  const splitForm: NfSplitForm | null = splitFormRaw === '50' || splitFormRaw === '70-30' ? splitFormRaw : null;
  const splitPartNum = body.splitPart === undefined || body.splitPart === null ? null : Number(body.splitPart);
  const splitPart: 1 | 2 | null = splitPartNum === 1 || splitPartNum === 2 ? splitPartNum : null;
  if ((splitForm === null) !== (splitPart === null)) {
    return json({ error: 'Parcelamento inválido — escolha a forma de novo no app.' }, 400);
  }

  const { data: em } = await supabase.from('driverpay_nota_emitters')
    .select('id, cnpj, label').eq('id', emitterId).eq('company_id', claims.company_id).maybeSingle();
  if (!em) return json({ error: 'CNPJ invalido' }, 400);

  const pure = b64raw.includes(',') ? b64raw.slice(b64raw.indexOf(',') + 1) : b64raw;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(pure), (c) => c.charCodeAt(0)); }
  catch { return json({ error: 'Arquivo invalido' }, 400); }
  if (bytes.length === 0) return json({ error: 'Arquivo vazio' }, 400);
  if (bytes.length > MAX_NF_BYTES) return json({ error: 'Arquivo muito grande (max 8MB)' }, 413);

  // ══════════════════════════════════════════════════════════════════════════
  // UMA NOTA POR VAGA — só enquanto está VÁLIDA (05/08/2026 → revisto 04/09/2026)
  //
  // Regra original (05/08): "vamos permitir apenas um envio por nota pedida,
  // está ficando com muitas notas no sistema" · "eles só vão poder anexar outra
  // quando a atual for excluída" — nota RECUSADA também segurava o lugar, só a
  // CD liberava excluindo manualmente. O GESSILEY tinha 7 notas na quinzena —
  // 4 num CNPJ e 3 no outro.
  //
  // 04/09/2026 (pedido do Victor, revisto): nota recusada agora NÃO segura mais
  // o lugar — ela é apagada na hora (registro + arquivo, ver mais abaixo) e o
  // driver já pode reenviar sozinho, sem esperar a CD excluir. O "muitas notas
  // no sistema" do pedido original fica resolvido pela raiz (a nota errada nem
  // fica acumulada) em vez de bloquear o reenvio. A vaga é (espelho × CNPJ) — a
  // MESMA chave do `nfSlots`, inclusive a regra da nota legada (mirror_platform_key
  // NULL vale pra qualquer espelho): se as duas contas fossem diferentes,
  // existiria a vaga que a tela mostra como livre e o envio recusa.
  //
  // Vem ANTES do upload pra não deixar PDF órfão no bucket.
  // ══════════════════════════════════════════════════════════════════════════
  // Expira duplas vencidas ANTES de olhar a vaga (lazy — o cron também varre) e
  // descobre se há uma parte 1 aberta esperando o par.
  const parte1 = await parte1AbertaDoSlot(claims.driver_id, periodId);
  if (splitPart === 2) {
    if (!parte1) {
      return json({
        error: 'Não há primeira nota aberta desta dupla (ou os 10 minutos acabaram). Escolha a forma e envie as DUAS de novo.',
        splitExpired: true,
      }, 409);
    }
    if (parte1.split_form !== splitForm) {
      return json({ error: 'A forma escolhida mudou no meio — envie as DUAS de novo com a mesma forma.' }, 409);
    }
    // 04/09/2026: a dupla agora é entre 2 CNPJs diferentes (não mais 2 pessoas no
    // mesmo CNPJ) — a segunda nota tem que ser de um CNPJ DIFERENTE da primeira.
    if (parte1.nota_emitter_id === emitterId) {
      return json({ error: 'A segunda nota precisa ser de um CNPJ DIFERENTE da primeira — envie no outro cartão.' }, 409);
    }
  }
  {
    const { data: jaEnviadas } = await supabase.from('driverpay_nota_fiscal_files')
      .select('id, status, mirror_platform_key, check_details')
      .eq('driver_id', claims.driver_id).eq('period_id', periodId)
      .eq('nota_emitter_id', emitterId);
    const consideradas = (jaEnviadas ?? [])
      // Dupla expirada não segura a vaga (ver parte1AbertaDoSlot) …
      .filter((f) => !ehSplitExpirada({ status: f.status as string, check_details: f.check_details }))
      // 04/09/2026: nota RECUSADA não segura mais o lugar (ver comentário grande
      // acima) — só recebida/validada ocupam a vaga de verdade.
      .filter((f) => f.status !== 'rejeitada');
    const ocupando = notasQueOcupamVaga(
      consideradas.map((f) => ({
        status: f.status as string,
        mirror_platform_key: (f.mirror_platform_key as string | null) ?? null,
      })),
      mirrorPlatformKey,
    );
    if (ocupando.length > 0) {
      // 04/09/2026: nota recusada já foi filtrada de `consideradas` acima — quem
      // chega aqui só pode ser recebida/validada de verdade ocupando a vaga.
      return json({
        error: `Voce ja enviou a nota de ${em.label} desta quinzena. Para mandar outra, a atual precisa ser excluida pela CD.`,
        alreadySent: true,
      }, 409);
    }
    // Dupla aberta bloqueia nota única/nova parte 1: ou completa, ou espera expirar.
    if (splitPart !== 2 && parte1) {
      return json({
        error: 'Você tem uma dupla de notas em andamento — envie a SEGUNDA nota dela (ou aguarde os 10 minutos expirarem pra recomeçar).',
        splitOpen: true,
      }, 409);
    }
  }

  // Somente PDF (decisao do Victor, 2026-07-24): foto confundia os drivers. Valida o TIPO
  // declarado E a assinatura real do arquivo (%PDF) — cliente antigo em cache nao fura a regra.
  const isPdfType = contentType.toLowerCase().includes('pdf');
  const isPdfMagic = bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!isPdfType || !isPdfMagic) return json({ error: 'A nota deve ser um arquivo PDF (foto nao e aceita)' }, 400);

  // Conferência automática ANTES de registrar. Qualquer exceção aqui vira
  // 'pendente' (conferir manualmente) — jamais bloqueia o envio por falha nossa.
  let check: NfCheckResult | null = null;
  let candidates: Record<string, number> = {};
  /** O mapa que a conferência DE FATO comparou (nota dividida troca por fatias). */
  let candidatosComparados: Record<string, number> = {};
  /** Total combinado (todos os CNPJs) usado pra fatiar a parte 1 da dupla. */
  let comboTotalParaSplit: number | null = null;
  /** A transcricao veio da IA? Vai pro check_details, pra dar pra auditar depois. */
  let lidoPorIa = false;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });

    // ══════════════════════════════════════════════════════════════════════
    // PDF SEM TEXTO -> a IA TRANSCREVE  (05/08/2026, pedido do Victor)
    //
    // Nota impressa e escaneada nao tem uma letra dentro do arquivo (medido no PDF
    // do LUCAS: zero fontes, zero caracteres, 675 KB de imagem). Antes disso virar
    // recusa, a IA le o documento — mesma leitora e mesmo rodizio de cota do print
    // da Shopee, so que com o Gemini recebendo o PDF direto.
    //
    // 🔑 A IA so TRANSCREVE. Quem confere valor/CNPJ/nome continua sendo o
    // `runNfCheck`, com as mesmas regras: nao existe uma segunda conferencia de
    // dinheiro que possa divergir da primeira.
    //
    // ⚠️ So entra quando a leitura normal falhou (`nfTextoIlegivel`, o MESMO
    // criterio da recusa). Nao deu pra ler nem com IA? Segue recusando como antes —
    // nunca valida no escuro.
    // ══════════════════════════════════════════════════════════════════════
    let textoFinal = text ?? '';
    if (nfTextoIlegivel(textoFinal)) {
      const transcrito = await readNotaFiscalTexto(
        pure, 'application/pdf', visionConfigFromEnv(Deno.env.toObject()),
        (m) => console.log(`[nf-ocr ${emitterId}] ${m}`),
      );
      if (transcrito) {
        textoFinal = transcrito;
        lidoPorIa = true;
      }
    }

    const { data: driver } = await supabase.from('driverpay_drivers')
      .select('name, recebedor_nome').eq('id', claims.driver_id).maybeSingle();
    const nomesAutorizados = await nomesAutorizadosDe(claims.driver_id);
    candidates = await buildValueCandidates(claims.driver_id, claims.company_id, periodId, emitterId);

    // ── Nota dividida: o valor esperado vira a FATIA (19/08/2026, cross-CNPJ
    // desde 04/09/2026) ── Parte 1: a fatia 1 do total COMBINADO (todos os CNPJs
    // juntos — mesma conta que `nfSplitPreview` mostrou no app). Parte 2: em OUTRO
    // CNPJ, exatamente o que FALTA da dupla (total combinado casado na parte 1 −
    // o que a parte 1 trouxe) — assim a soma fecha sempre no total combinado.
    candidatosComparados = candidates;
    if (splitPart === 1 && splitForm) {
      const combo = await buildComboTotal(claims.driver_id, claims.company_id, periodId);
      comboTotalParaSplit = combo.total;
      candidatosComparados = combo.total > 0
        ? { combo_parte1: nfSplitSlices(combo.total, splitForm)[0] }
        : {};
    } else if (splitPart === 2 && parte1) {
      const totalDupla = Number((parte1.check_details as { splitTotal?: number } | null)?.splitTotal ?? NaN);
      const jaVeio = Number(parte1.read_value ?? NaN);
      if (Number.isFinite(totalDupla) && Number.isFinite(jaVeio)) {
        candidatosComparados = { dupla_restante: Math.round((totalDupla - jaVeio) * 100) / 100 };
      }
    }

    check = runNfCheck({
      text: textoFinal,
      expectedCnpj: String(em.cnpj ?? '').replace(/\D/g, ''),
      expectedCnpjLabel: em.label ?? '',
      driverName: driver?.name ?? '',
      recebedorNome: driver?.recebedor_nome ?? null,
      authorizedNames: nomesAutorizados,
      valueCandidates: candidatosComparados,
    });
    // 04/09/2026: a dupla deixou de exigir nomes diferentes entre as 2 notas — CNPJ
    // diferente (checado antes de chegar aqui) já é o suficiente pra diferenciá-las.
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
  // Parte 1 da dupla NUNCA valida sozinha — fica 'recebida' esperando o par (a
  // validação das duas acontece junta, quando a parte 2 fecha a soma).
  const autoValidate = checksAllGreen && autoValidateEnabled && splitPart !== 1;

  // ── Nota dividida: números pra gravar (fatia, total da dupla, nome que casou) ──
  let readValue: number | null = null;
  let splitTotal: number | null = null;
  if (check && check.valorOk === true && check.matchedCandidates.length > 0) {
    const labelComparado = check.matchedCandidates[0];
    const v = candidatosComparados[labelComparado];
    readValue = typeof v === 'number' && Number.isFinite(v) ? v : null;
    if (splitPart === 1) {
      splitTotal = comboTotalParaSplit;
    } else if (splitPart === 2 && parte1) {
      const t = Number((parte1.check_details as { splitTotal?: number } | null)?.splitTotal ?? NaN);
      splitTotal = Number.isFinite(t) ? t : null;
    }
  }
  const matchedName = check && check.matchedNames.length > 0 ? check.matchedNames[0] : null;
  const splitGroup = splitPart === 1 ? crypto.randomUUID() : (splitPart === 2 ? parte1!.split_group : null);

  const path = `${claims.company_id}/${periodId}/${claims.driver_id}/${emitterId}/${crypto.randomUUID()}.${extFromType(contentType)}`;
  const { error: upErr } = await supabase.storage.from(NF_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (upErr) return json({ error: 'Falha ao subir a nota', details: upErr.message }, 500);

  // 04/09/2026 (pedido do Victor): nota recusada na hora do envio nem chega a ser
  // gravada — apaga o arquivo que acabou de subir e devolve o motivo. O slot já
  // fica livre pro driver mandar outra na hora (nada ficou pra segurar a vaga).
  if (autoReject) {
    const { error: rmErr } = await supabase.storage.from(NF_BUCKET).remove([path]);
    if (rmErr) console.error('Falha ao apagar nota recusada do storage:', rmErr.message);
    // HTTP 422 de propósito: o client (novo E antigo em cache) trata não-2xx como
    // erro e mostra a mensagem — nota recusada NUNCA aparece como "enviada".
    return json({ ok: false, rejected: true, error: rejectReason, reason: rejectReason, checks: check }, 422);
  }

  const { data: pay } = await supabase.from('driverpay_payments')
    .select('id').eq('period_id', periodId).eq('driver_id', claims.driver_id).maybeSingle();

  const { error: insErr } = await supabase.from('driverpay_nota_fiscal_files').insert([{
    company_id: claims.company_id, driver_id: claims.driver_id, period_id: periodId,
    payment_id: pay?.id ?? null, nota_emitter_id: emitterId, file_path: path,
    file_type: contentType, original_filename: filename, uploaded_by: claims.driver_id,
    mirror_platform_key: mirrorPlatformKey,
    status: autoValidate ? 'validada' : 'recebida',
    reject_reason: null,
    // validated_by tem FK pra users(id) — validação AUTOMÁTICA fica com null e o
    // marcador vive em check_details.autoValidated (validação manual sempre tem usuário).
    validated_at: autoValidate ? new Date().toISOString() : null,
    validated_by: null,
    check_status: check ? check.status : 'pendente',
    check_valor: check?.valorOk ?? null,
    check_cnpj: check?.cnpjOk ?? null,
    check_nome: check?.nomeOk ?? null,
    // Nota dividida (19/08/2026): NULL em tudo na nota única — nada muda pra ela.
    read_value: readValue,
    split_group: splitGroup,
    split_form: splitForm,
    split_part: splitPart,
    split_expected: readValue,
    matched_name: matchedName,
    check_details: check ? {
      autoValidated: autoValidate,
      // Auto-validação estava desligada e a nota passou nos 3 checks: o painel
      // mostra "conferida ✓ — validar" (é só apertar o botão, sem reconferir).
      autoValidateSkipped: checksAllGreen && !autoValidateEnabled,
      foundValues: check.foundValues, foundCnpjs: check.foundCnpjs,
      matchedCandidates: check.matchedCandidates, candidates: candidatosComparados,
      reasons: check.reasons,
      matchedNames: check.matchedNames,
      ...(splitTotal !== null ? { splitTotal } : {}),
      // O PDF veio sem texto e quem leu foi a IA. Fica gravado pra dar pra
      // auditar depois: se um dia um valor lido errado passar, dá pra achar
      // exatamente quais notas dependeram da leitura automática.
      lidoPorIa,
    } : null,
    checked_at: new Date().toISOString(),
  }]);
  if (insErr) return json({ error: 'Falha ao registrar a nota', details: insErr.message }, 500);

  // NAO marca mais o "nota recebida" antigo automaticamente: agora quem deixa a NF verde
  // no painel e a VALIDACAO da nota pelo mestre (status 'validada'), nao o simples upload.

  // ── Nota dividida: a parte 2 fechou a soma → a PARTE 1 acompanha o veredito ──
  // (validada junto, ou 'recebida' aguardando o clique quando a auto-validação
  // está desligada — o par nunca fica meio validado.)
  if (splitPart === 2 && parte1 && checksAllGreen && autoValidate) {
    await supabase.from('driverpay_nota_fiscal_files').update({
      status: 'validada',
      validated_at: new Date().toISOString(),
    }).eq('id', parte1.id).eq('status', 'recebida');
  }

  if (splitPart === 1) {
    const restante = splitTotal !== null && readValue !== null
      ? Math.round((splitTotal - readValue) * 100) / 100
      : null;
    return json({
      ok: true,
      validated: false,
      splitOpen: true,
      splitRemaining: restante,
      splitDeadlineMs: NF_SPLIT_WINDOW_MS,
      checks: check,
    });
  }
  return json({ ok: true, validated: autoValidate, splitClosed: splitPart === 2, checks: check });
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
  if (ledGroup?.id) {
    const { data: members } = await supabase.from('driverpay_group_members')
      .select('driver_id').eq('group_id', ledGroup.id);
    return [...new Set([claims.driver_id, ...(members ?? []).map((m) => m.driver_id as string)])];
  }

  // ⚠️ SO O LIDER ANEXA (decisao do Victor, 04/08/2026). Quem esta num grupo mas NAO e o
  // lider dele nao envia nada: o lider ja recebe um cartao por membro e manda por todos.
  // Antes, o membro via o proprio cartao e podia mandar tambem — dois caminhos pro mesmo
  // print, e o painel do lider continuava cobrando. Quem NAO esta em grupo nenhum segue
  // enviando o seu: nao ha lider pra quem passar.
  const { data: souMembro } = await supabase.from('driverpay_group_members')
    .select('group_id').eq('driver_id', claims.driver_id).maybeSingle();
  if (souMembro?.group_id) {
    // EXCECAO: grupo SEM LIDER definido. Bloquear aqui deixaria o driver sem conseguir
    // anexar nada e sem ninguem pra anexar por ele (caso real: "Vermelho Novo - ROGERIO",
    // 1 membro, sem lider). Entao ele volta a enviar o proprio — ninguem fica travado.
    const { data: g } = await supabase.from('driverpay_groups')
      .select('leader_driver_id').eq('id', souMembro.group_id).maybeSingle();
    if (g?.leader_driver_id) return [];
  }

  return [claims.driver_id];
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

/**
 * Quando o print deve ser tentado de novo. null = sai da fila (conferiu ou desistiu).
 * `dataErradaSeguidas` = leituras seguidas de "data errada" (contando a atual): com 1
 * volta pra fila para a 2a leitura confirmar; com 2 sai da fila porque vai ser apagado.
 */
function proximaTentativa(
  check: ProofCheckResult | null,
  tentativasJaFeitas: number,
  dataErradaSeguidas = 0,
): string | null {
  if (!proofShouldRequeue(check, dataErradaSeguidas)) return null;
  const minutos = proofRetryDelayMinutes(tentativasJaFeitas);
  if (minutos === null) return null; // desistiu: fica so a conferencia manual
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

/**
 * Marca "espelho conferido" no pagamento do driver, se autorizado.
 *
 * ⚠️ MUDANCA 05/08/2026 (pedido do Victor: *"o Adriano nao ficou marcado como espelho
 * conferido automaticamente; deve marcar automatico quando o espelho esta conferido"*).
 *
 * Existia aqui uma trava anti-remarcacao: se um humano ja tivesse mexido no check, o
 * automatico nao passava por cima nunca mais. Na pratica ela travou o caso certo — o
 * ADRIANO teve o espelho desmarcado por gente ANTES de mandar o print; quando o print
 * chegou e bateu (902 lidos = 902 da planilha, periodo certo), o sistema conferiu tudo e
 * mesmo assim deixou o botao apagado, obrigando alguem a clicar na mao.
 *
 * O motivo da trava era guardar a decisao humana, mas ela nao dava pra separar "desmarquei
 * porque nao quero validar" de "desmarquei antes de existir print" — a desmarcacao nem
 * guarda data (`espelho_conferido_at` vira null). Entre travar a conferencia certa e
 * remarcar uma desmarcacao, ele escolheu remarcar: o print conferido e um FATO NOVO, e
 * quem quiser desfazer desmarca de novo.
 *
 * Continua valendo: o liga/desliga `proof_auto_confirm`, e nao mexer no que ja esta marcado.
 */
async function marcarEspelhoConferido(paymentId: string, companyId: string): Promise<boolean> {
  const { data: settings } = await supabase.from('driverpay_settings')
    .select('proof_auto_confirm').eq('company_id', companyId).maybeSingle();
  if (settings?.proof_auto_confirm === false) return false; // sem linha = ligado (padrao)

  const { data: atual } = await supabase.from('driverpay_payments')
    .select('espelho_conferido').eq('id', paymentId).maybeSingle();
  if (atual?.espelho_conferido) return false; // ja esta marcado: nada a fazer

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
  check_details?: Record<string, unknown> | null;
}): Promise<'conferido' | 'divergente' | 'na-fila' | 'desistiu' | 'erro' | 'apagado' | 'recusado'> {
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
    const recusar = proofShouldReject(check);
    // Leituras SEGUIDAS de data errada, contando esta. Qualquer outro veredito zera.
    const seguidasAntes = Number((row.check_details as { dataErradaSeguidas?: number } | null)?.dataErradaSeguidas ?? 0);
    const dataErradaSeguidas = proofContarDataErrada(seguidasAntes, check);

    // ══ APAGAR: so com a data errada CONFIRMADA por 2 leituras ══════════════
    // Decisao do Victor (04/08/2026), depois do caso GESSILEY: a IA leu a mesma foto
    // duas vezes com respostas diferentes, e a 1a estava errada. Apagar na primeira
    // leitura destruiria print bom. Aqui a 2a leitura ja concordou.
    if (proofDeveApagar(check, dataErradaSeguidas)) {
      await supabase.storage.from(PROOF_BUCKET).remove([row.file_path]);
      await supabase.from('driverpay_delivery_proofs').delete().eq('id', row.id);
      console.log(`[fila ${row.id}] data errada confirmada 2x — print apagado`);
      return 'apagado';
    }

    const next = proximaTentativa(check, tentativas, dataErradaSeguidas);

    await supabase.from('driverpay_delivery_proofs').update({
      // ⚠️ ANTES isto era `confirmado ? 'validado' : 'recebido'` fixo, com o comentario
      // "reconferencia nunca vira rejeitado" — e por isso um print RECUSADO no envio
      // era DESTRAVADO sozinho pela fila, virando "recebido" com a data errada. Era a
      // causa do caso GESSILEY. Agora a reconferencia recusa igual ao envio.
      status: recusar ? 'rejeitado' : (confirmado ? 'validado' : 'recebido'),
      // Limpa o motivo antigo quando a nova leitura absolve: cartao "recebido"
      // exibindo recusa de uma leitura passada e mentira na tela.
      reject_reason: recusar ? `[automático] ${check.driverReasons.join(' ')}` : null,
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
        dataErradaSeguidas,
      },
      checked_at: new Date().toISOString(),
      check_attempts: tentativas,
      next_check_at: next,
    }).eq('id', row.id);

    if (confirmado && row.payment_id) await marcarEspelhoConferido(row.payment_id, row.company_id);

    if (confirmado) return 'conferido';
    if (check.status === 'pendente') return next ? 'na-fila' : 'desistiu';
    // Recusado: fica visivel pro entregador reenviar. Data errada ainda volta pra
    // fila (a 2a leitura e que decide se apaga); ilegivel para por aqui.
    if (recusar) return 'recusado';
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
    // check_details carrega `dataErradaSeguidas` — sem ele a contagem reinicia a cada
    // rodada e o print de data errada nunca chegaria na 2a confirmacao pra ser apagado.
    .select('id, company_id, period_id, driver_id, payment_id, platform_name, file_path, file_type, check_attempts, check_details')
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
/**
 * Roda a tarefa DEPOIS de a resposta ja ter saido (Supabase Edge Runtime).
 *
 * Serve pra o entregador nao ficar ~40s olhando pro "Enviando..." esperando a IA. Quando
 * isto e chamado o print JA esta salvo e na fila — se o runtime matar a tarefa no meio, o
 * cron pega o print depois e nada se perde.
 *
 * Se o runtime nao expuser `waitUntil`, devolve false e o chamador espera do jeito antigo:
 * melhor lento do que sem conferir.
 */
function emBackground(tarefa: Promise<unknown>): boolean {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof rt?.waitUntil !== 'function') return false;
  rt.waitUntil(tarefa.catch((e) => console.error('[background] tarefa falhou (print segue na fila):', e)));
  return true;
}

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

  // Plataformas solicitadas, por quinzena. A coluna driver_id (04/08/2026) diz o ALCANCE
  // do pedido: VAZIA = todo mundo com pacote (como sempre foi); PREENCHIDA = so aquele
  // entregador. Pedir de um grupo inteiro e so gravar uma linha por membro.
  const { data: reqRows } = await supabase.from('driverpay_proof_requests')
    .select('period_id, platform_name, driver_id')
    .eq('company_id', claims.company_id).in('period_id', periodIds);
  /** quinzena -> plataformas pedidas pra TODOS. */
  const platsTodos = new Map<string, Set<string>>();
  /** "quinzena|driver" -> plataformas pedidas SO pra ele. */
  const platsDoDriver = new Map<string, Set<string>>();
  for (const r of reqRows ?? []) {
    const per = r.period_id as string;
    const plat = r.platform_name as string;
    const dId = (r.driver_id as string | null) ?? null;
    const alvo = dId === null ? platsTodos : platsDoDriver;
    const chave = dId === null ? per : `${per}|${dId}`;
    const atual = alvo.get(chave) ?? new Set<string>();
    atual.add(plat);
    alvo.set(chave, atual);
  }
  const periodosComPedido = new Set<string>([
    ...platsTodos.keys(),
    ...[...platsDoDriver.keys()].map((k) => k.split('|')[0]),
  ]);
  if (periodosComPedido.size === 0) return json({ slots: [] });

  const { data: pers } = await supabase.from('driverpay_periods')
    .select('id, label').in('id', [...periodosComPedido]);
  const labelDe = new Map((pers ?? []).map((p) => [p.id as string, p.label as string]));

  const driverIds = await driversQuePossoEnviar(claims);
  const { data: pays } = await supabase.from('driverpay_payments')
    .select('id, driver_id, period_id').in('period_id', [...periodosComPedido]).in('driver_id', driverIds);
  const payList = pays ?? [];
  if (payList.length === 0) return json({ slots: [] });

  const { data: pks } = await supabase.from('driverpay_payment_packages')
    .select('payment_id, platform_name, packages').in('payment_id', payList.map((p) => p.id));
  /** pagamento -> plataforma -> pacotes (so os DELE; o resto da quinzena vem abaixo). */
  const pacotesDe = new Map<string, Map<string, number>>();
  for (const pk of pks ?? []) {
    const payId = pk.payment_id as string;
    const m = pacotesDe.get(payId) ?? new Map<string, number>();
    m.set(pk.platform_name as string, (m.get(pk.platform_name as string) ?? 0) + (pk.packages ?? 0));
    pacotesDe.set(payId, m);
  }

  // PEDIR ANTES DA PLANILHA (decisao do Victor, 04/08/2026): da pra solicitar o print sem
  // ter importado a planilha, pra adiantar. Enquanto NINGUEM da quinzena tem pacote naquela
  // plataforma, o pedido vale pra todo mundo em grupo. Assim que a planilha entra, volta a
  // regra normal (so quem tem pacote) — senao continuariamos cobrando quem nao entregou.
  // ⚠️ E por PLATAFORMA: importar a eMile nao pode fazer o sistema achar que a Shopee chegou.
  const { data: paysDoPeriodo } = await supabase.from('driverpay_payments')
    .select('id, period_id').in('period_id', [...periodosComPedido]);
  const idsPorPeriodo = new Map<string, string[]>();
  for (const p of paysDoPeriodo ?? []) {
    const lista = idsPorPeriodo.get(p.period_id as string) ?? [];
    lista.push(p.id as string);
    idsPorPeriodo.set(p.period_id as string, lista);
  }
  const planilhaChegou = new Set<string>(); // `${periodo}|${plataforma}`
  for (const [perId, ids] of idsPorPeriodo) {
    if (ids.length === 0) continue;
    const { data: todosPks } = await supabase.from('driverpay_payment_packages')
      .select('platform_name').in('payment_id', ids).gt('packages', 0);
    for (const pk of todosPks ?? []) planilhaChegou.add(`${perId}|${pk.platform_name as string}`);
  }

  // REGRA DE LOGISTICA (decisao do Victor, 04/08/2026): o pedido "PRA TODOS" so cobra quem
  // esta EM GRUPO. Quem anexa na pratica e o lider, que ve um cartao por membro; quem nao
  // esta em grupo nenhum NAO recebe pedido pelo portal — fica sinalizado no painel pra
  // alguem resolver na mao ou coloca-lo num grupo. Pedido INDIVIDUAL continua valendo mesmo
  // sem grupo: ali o operador escolheu aquela pessoa de proposito.
  const { data: emGrupo } = await supabase.from('driverpay_group_members')
    .select('driver_id').in('driver_id', driverIds);
  const temGrupo = new Set((emGrupo ?? []).map((m) => m.driver_id as string));

  // (quinzena, driver, plataforma) que foi solicitado E ele deve mandar.
  // ⚠️ Percorre PAGAMENTO x PLATAFORMA PEDIDA, nao a lista de pacotes: sem planilha nao
  // existe pacote nenhum, e varrer pacotes deixaria a tela do entregador vazia.
  const precisa = new Set<string>();
  for (const pay of payList) {
    const payId = pay.id as string;
    const dId = pay.driver_id as string;
    const perId = pay.period_id as string;
    const plats = new Set<string>([
      ...(platsTodos.get(perId) ?? []),
      ...(platsDoDriver.get(`${perId}|${dId}`) ?? []),
    ]);
    for (const plat of plats) {
      const praTodos = platsTodos.get(perId)?.has(plat) === true && temGrupo.has(dId);
      const soPraEle = platsDoDriver.get(`${perId}|${dId}`)?.has(plat) === true;
      if (!praTodos && !soPraEle) continue;
      const temPacote = (pacotesDe.get(payId)?.get(plat) ?? 0) > 0;
      const semPlanilha = !planilhaChegou.has(`${perId}|${plat}`);
      if (temPacote || semPlanilha) precisa.add(`${perId}|${dId}|${plat}`);
    }
  }

  if (precisa.size === 0) return json({ slots: [] });

  const { data: drivers } = await supabase.from('driverpay_drivers')
    .select('id, name').in('id', driverIds);
  const nomeDe = new Map((drivers ?? []).map((d) => [d.id as string, d.name as string]));

  const { data: proofs } = await supabase.from('driverpay_delivery_proofs')
    .select('period_id, driver_id, platform_name, status, reject_reason, uploaded_at')
    .in('period_id', [...periodosComPedido]).in('driver_id', driverIds)
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

  // ══════════════════════════════════════════════════════════════════════════
  // UM PRINT POR ENTREGADOR  (04/08/2026, decisao do Victor)
  //
  // Enquanto existir um print VALENDO deste entregador nesta quinzena/plataforma, o
  // proximo e barrado — quem quiser trocar tem que excluir o anterior. Print
  // RECUSADO **libera a vaga** (decisao dele): senao o entregador que tomou "nao"
  // ficaria travado esperando alguem apagar na mao.
  //
  // Vem ANTES de subir o arquivo pra nao deixar imagem orfa no bucket.
  // ══════════════════════════════════════════════════════════════════════════
  const { data: jaTem } = await supabase.from('driverpay_delivery_proofs')
    .select('id, status')
    .eq('company_id', claims.company_id)
    .eq('period_id', periodId)
    .eq('driver_id', alvoId)
    .eq('platform_name', platformName)
    .neq('status', 'rejeitado')
    .limit(1);
  if ((jaTem ?? []).length > 0) {
    return json({
      error: 'Ja existe um espelho enviado deste entregador nesta quinzena. Para mandar outro, o anterior precisa ser excluido.',
      alreadySent: true,
    }, 409);
  }

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

  // ══════════════════════════════════════════════════════════════════════════
  // ORDEM: GUARDA PRIMEIRO, LE DEPOIS  (04/08/2026, pedido do Victor)
  //
  // Antes o print era LIDO pela IA antes de ser salvo — e a leitura leva ~40s. Se o 4G
  // do entregador caisse nesse meio-tempo, ou ele fechasse a tela, ou a funcao
  // estourasse o tempo, NAO FICAVA NADA: nem arquivo nem registro, e ele tinha que
  // mandar tudo de novo. Com 30 enviando no mesmo minuto (a IA fica mais lenta e a cota
  // estoura), a chance de alguem perder o envio ficava alta.
  //
  // Agora o arquivo e o registro entram PRIMEIRO, ja dentro da fila. O pior caso virou
  // "o print demora alguns minutos pra ser conferido" em vez de "o driver perdeu a foto".
  // ══════════════════════════════════════════════════════════════════════════
  const sha = await sha256Hex(bytes);
  const path = `${claims.company_id}/${periodId}/${alvoId}/${platformName.replace(/[^\w.-]+/g, '_')}/${crypto.randomUUID()}.${kind.ext}`;
  const { error: upErr } = await supabase.storage.from(PROOF_BUCKET)
    .upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (upErr) return json({ error: 'Falha ao subir o print', details: upErr.message }, 500);

  const { data: pay } = await supabase.from('driverpay_payments')
    .select('id').eq('period_id', periodId).eq('driver_id', alvoId).maybeSingle();

  // Nasce 'recebido' + 'pendente' + JA NA FILA (next_check_at = agora): se a leitura
  // logo abaixo nao acontecer, o cron pega este print sozinho na proxima rodada.
  const { data: inserido, error: insErr } = await supabase.from('driverpay_delivery_proofs').insert([{
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
    status: 'recebido',
    check_status: 'pendente',
    check_attempts: 0,
    next_check_at: new Date().toISOString(),
  }]).select('id').single();
  if (insErr || !inserido?.id) {
    return json({ error: 'Falha ao registrar o print', details: insErr?.message ?? 'sem id' }, 500);
  }
  const proofId = inserido.id as string;

  /**
   * Le o print com a IA e grava o resultado por cima do registro que ja existe.
   * Qualquer excecao vira 'pendente' — nunca recusa por falha nossa. Se o update falhar,
   * o print continua 'pendente' na fila, que e o comportamento seguro.
   */
  const conferir = async (): Promise<ProofCheckResult | null> => {
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
    // 1a leitura do print: se disser data errada, esta e a 1a confirmacao (nunca apaga aqui).
    const dataErradaSeguidas = check !== null ? proofContarDataErrada(0, check) : 0;

    const { error: updErr } = await supabase.from('driverpay_delivery_proofs').update({
      status: recusar ? 'rejeitado' : (confirmado ? 'validado' : 'recebido'),
      reject_reason: recusar ? `[automático] ${check!.driverReasons.join(' ')}` : null,
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
        dataErradaSeguidas,
      } : null,
      checked_at: new Date().toISOString(),
      // FILA: volta sozinho quando a leitura falhou por culpa nossa (cota/rede/API
      // fora) E TAMBEM quando deu data errada — nesse caso pra uma 2a leitura
      // confirmar antes de apagar. Conferido ou ilegivel sai da fila na hora.
      check_attempts: 1,
      next_check_at: proximaTentativa(check, 1, dataErradaSeguidas),
    }).eq('id', proofId).eq('company_id', claims.company_id);
    if (updErr) console.error('[proof-check] nao gravei o resultado (segue na fila):', updErr);

    if (confirmado && pay?.id) await marcarEspelhoConferido(pay.id, claims.company_id);

    // Reprocessamento OPORTUNISTA: este envio aproveita e tenta limpar alguns da
    // fila de graca. Assim, numa leva grande, quem caiu na cota no comeco tende a
    // ser reconferido pelos envios seguintes — sem ninguem clicar em nada.
    try {
      if (check !== null && check.status !== 'pendente') await processarFila(claims.company_id, 2);
    } catch (err) {
      console.error('[fila] reprocessamento oportunista falhou (ignorado):', err);
    }
    return check;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // O ENTREGADOR NAO ESPERA A IA  (04/08/2026, pedido do Victor)
  //
  // A leitura leva ~40s. Como o print JA esta salvo e na fila, da pra responder agora e
  // conferir por tras: o celular dele libera em ~3s em vez de ~45s. Se a recusa vier
  // (data errada / ilegivel), o portal mostra na atualizacao seguinte da tela — ele
  // continua sabendo, so nao fica parado esperando.
  // ══════════════════════════════════════════════════════════════════════════
  if (emBackground(conferir())) {
    // ⚠️ Resposta PROPOSITALMENTE pobre: nada de quantidade, nada de "bateu/nao bateu".
    return json({ ok: true, conferindo: true });
  }

  // Runtime sem `waitUntil`: espera a conferencia e responde como antes.
  const check = await conferir();
  if (check !== null && proofShouldReject(check)) {
    // 422 = recusa de conferencia (o cliente trata nao-2xx como erro e mostra o
    // motivo). SO chega aqui por data errada ou print ilegivel — quantidade
    // divergente NUNCA recusa, por decisao do Victor.
    const motivo = `[automático] ${check.driverReasons.join(' ')}`;
    return json({ ok: false, rejected: true, error: motivo, reason: motivo }, 422);
  }
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
  // Nota dividida (19/08/2026): duplas com a parte 1 esperando há mais de 10 min
  // expiram aqui também — o app e o upload já expiram lazy, o cron garante que
  // nenhuma fica pendurada mesmo sem ninguém abrir nada.
  const expiradas = await expirarDuplasVencidas();
  if (expiradas > 0) console.log(`[fila] ${expiradas} dupla(s) de nota expiradas (10 min sem a segunda)`);
  console.log(`[fila] rodada do agendador: ${total} print(s) — ${JSON.stringify(placar)}`);
  return json({ ok: true, processados: total, placar, duplasExpiradas: expiradas });
}

/** Expira TODAS as partes 1 sem par além dos 10 minutos (qualquer empresa). */
async function expirarDuplasVencidas(): Promise<number> {
  const corte = new Date(Date.now() - NF_SPLIT_WINDOW_MS).toISOString();
  const { data: abertas } = await supabase.from('driverpay_nota_fiscal_files')
    .select('id, split_group, check_details')
    .eq('split_part', 1).eq('status', 'recebida').lt('uploaded_at', corte);
  let n = 0;
  for (const f of abertas ?? []) {
    const { data: par } = await supabase.from('driverpay_nota_fiscal_files')
      .select('id').eq('split_group', f.split_group).eq('split_part', 2).limit(1);
    if ((par ?? []).length > 0) continue;
    const { error } = await supabase.from('driverpay_nota_fiscal_files').update({
      status: 'rejeitada',
      reject_reason: '[automático] A segunda nota da dupla não chegou em 10 minutos. Envie as DUAS de novo.',
      check_details: { ...((f.check_details as Record<string, unknown> | null) ?? {}), splitExpired: true },
    }).eq('id', f.id).eq('status', 'recebida');
    if (!error) n++;
  }
  return n;
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
      case 'nf-split-preview': return await nfSplitPreview(req, body);
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
