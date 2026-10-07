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
//   lookup-employee          { cpf, companyId } → { employee: (só os campos da tela pública) | null }
//     30/09/2026 (segurança): devolvia `select('*')` — a FICHA INTEIRA (pin_hash, rosto,
//     PIX, telefone...) de qualquer um só com o CPF. Agora só os 10 campos que as telas
//     públicas usam (CAMPOS_PUBLICOS_DO_FUNCIONARIO).
//   verify-pin               { employeeId, pin } → { valid: boolean }
//     26/08 (fix): compara por bcrypt contra pin_hash quando existir (migração
//     de 14/05 já converteu 70 funcionários pra hash e zerou o pin plain —
//     esta ação só comparava com o pin plain, travando o login de todo mundo
//     que já tinha PIN configurado). Fallback pro pin plain só sobra pra quem
//     ainda não tem pin_hash.
//   set-pin                  { employeeId, newPin } → { ok: true }
//     26/08 (fix): passa a gravar em pin_hash (bcrypt), não mais em pin plain
//     — fecha o mesmo buraco pra quem configura o PIN a partir de agora.
//     30/09/2026 (segurança): SÓ NO 1º ACESSO (sem PIN). Antes trocava o PIN de
//     qualquer um sem login. O painel define/troca PIN pela RPC admin_set_employee_pin
//     (confere employees.edit de quem está logado); o "Resetar PIN" do painel zera o PIN
//     e a pessoa cria o novo aqui.
//   today-attendance         { employeeId, companyId, pin? | comprovanteFacial? } → { attendance: Attendance | null }
//   attendance-history       { employeeId, companyId, days, pin? | comprovanteFacial? } → { history: Attendance[] }
//   face-config              { companyId } → { enabled: boolean }
//   face-descriptor          { employeeId, pin } → { descriptor: number[] | null }
//   save-face                { employeeId, pin, photoUrl, descriptor } → { ok: true }
//     30/09/2026 (segurança): as duas exigem o PIN da própria pessoa (o mesmo que ela
//     acabou de digitar pra entrar). Antes, com o id (que lookup-employee devolvia pelo
//     CPF), qualquer um trocava o rosto de outra pessoa ou copiava o rosto cadastrado —
//     e batia o ponto dela.
//   identify-face            { companyId, descriptorNow, deviceToken?, todasAsEmpresasDoTablet? } → { matched, employeeId?, employeeName?, cpf?, faceDistance?, comprovanteFacial?, ambiguous?, deviceBlocked?, companyId?, defaultMarkingCount? }
//     04/09/2026 — ponto SÓ pela facial, sem digitar CPF. Compara contra TODOS
//     os rostos ativos da empresa (1:N) com margem mínima contra o 2º colocado
//     (0.08) — ambíguo ou sem certeza = não bate. Isto só IDENTIFICA; quem
//     registra o ponto de fato é o clock-in-validated de sempre, reconferindo o
//     mesmo rosto 1:1 contra a pessoa identificada.
//     30/09/2026 — limite 0.42 → 0.50 (o MESMO do 1:1; ver _shared/faceIdentify.ts),
//     a tentativa grava o desfecho (matched/no_match/ambiguous) e as distâncias do
//     1º e 2º colocados, e com a trava do tablet ligada exige um tablet autorizado.
//   log-face-attempt         { employeeId, success, confidence, clockType, companyId } → { ok: true }
//   clock-device-status      { deviceToken } → { device: { id, name, companyIds, companyNames } | null }
//   activate-clock-device    { code } → { token, device }
//     30/09/2026 — ponto só no tablet da empresa (ver _shared/clockDevice.ts e a
//     migration 20260930034644). O código de ativação vem do painel (2626).
//   log-clock-event          { companyId, employeeId?, kind: 'camera_error', details, userAgent? } → { ok: true }
//     30/09/2026 — "câmera bloqueada" sem estar: até aqui nenhum erro de câmera
//     chegava ao servidor. Grava em error_logs (best-effort, texto truncado).
//   employee-errors-by-period { employeeId, periodId, companyId, pin? | comprovanteFacial? } → { period, individual_errors, triage_errors, total_individual, total_triage }
//   employee-error-periods    { employeeId, companyId, pin? | comprovanteFacial? } → { periods: Array<{ period, has_errors, total_errors }> }
//     30/09/2026: estas 4 (ponto do dia, histórico e os 2 de erros) pedem a prova da própria
//     pessoa — PIN ou comprovante facial (ver recusaSemProva e EXIGIR_PROVA_DO_FUNCIONARIO).
//   register-employee        { companyId, name, cpf, phone, pixKey, pixType, functionRole } → { employee: { id } }
//     Sub-fase 26/08 — cadastro público de funcionário novo (link sem login,
//     página /cadastro). Grava registration_status='pending', employment_type
//     fixo 'Diarista' e function_role = a função escolhida (2ª leva 26/08).
//   list-function-roles      { companyId } → { roles: string[] }
//     2ª leva 26/08 — funções (function_role) já usadas na empresa, pro
//     <select> da página pública de cadastro.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PIN_FORMATO, bcryptjs, pinConfere } from '../_shared/pin.ts';
import {
  decidirIdentificacao, escolherFichaDaPessoa, fichasDaPessoa, juntarCandidatosPorCpf, pontoAbertoNoDia,
  type CandidatoFacialComEmpresa,
} from '../_shared/faceIdentify.ts';
import {
  comprovanteFacialConfere, decidirProva, emitirComprovanteFacial, type ProvaDoFuncionario,
} from '../_shared/acessoDoFuncionario.ts';
import {
  MENSAGEM_APARELHO_NAO_AUTORIZADO,
  decidirAparelho,
  gerarSegredoDoTablet,
  normalizarCodigoDeAtivacao,
  resolverTablet,
  sha256Hex,
  tabletDaLinha,
} from '../_shared/clockDevice.ts';

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

// ── Facial 1:N — reconhecimento sem CPF (04/09/2026) ──────────────────────────
// Mesma conta do servidor de clock-in-validated (euclideanDistance sobre os 128
// números do face-api), mas aqui comparando contra TODOS os rostos da empresa,
// não contra um só. O limite e a margem contra o 2º colocado moram em
// _shared/faceIdentify.ts desde 30/09/2026 (limite 0.42 → 0.50, o mesmo do 1:1 —
// o motivo, com os números reais, está lá).

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function parseDescriptor(raw: unknown): number[] | null {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(arr) || arr.length !== 128) return null;
  const nums = arr.map(Number);
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
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

/**
 * O que as telas PÚBLICAS (/clock, /erros) usam da ficha — e nada mais (30/09/2026).
 * Antes ia `select('*')`: pin_hash (um PIN de 4 dígitos em bcrypt se descobre por tentativa
 * em minutos), o rosto cadastrado, PIX, telefone, dados da folha — de qualquer um, pelo CPF.
 * Tela nova precisando de outro campo: acrescentar aqui, pensando se ele pode ser público.
 */
const CAMPOS_PUBLICOS_DO_FUNCIONARIO = [
  'id', 'name', 'cpf', 'company_id', 'registration_status', 'pin_configured',
  'face_registered', 'face_reset_requested', 'face_recognition_enabled', 'marking_count',
].join(', ');

async function lookupEmployee(body: Body): Promise<Response> {
  const cpf = String(body.cpf ?? '').replace(/\D/g, '');
  const companyId = String(body.companyId ?? '').trim();
  if (!cpf || !companyId) return json({ error: 'Invalid cpf or companyId' }, 400);

  const { data, error } = await supabase
    .from('employees')
    .select(CAMPOS_PUBLICOS_DO_FUNCIONARIO)
    .eq('cpf', cpf)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  return json({ employee: data ?? null });
}

/**
 * O PIN do funcionário confere? 'ok' | 'invalido' (inclui funcionário inexistente — mesma
 * resposta, pra não dizer se o id existe) | 'erro' (banco).
 */
async function conferirPinDoFuncionario(employeeId: string, pin: unknown): Promise<'ok' | 'invalido' | 'erro'> {
  const { data, error } = await supabase
    .from('employees')
    .select('pin, pin_hash')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) {
    console.error('[employee-public-api] leitura do PIN falhou:', error.message);
    return 'erro';
  }
  return (await pinConfere(pin, data)) ? 'ok' : 'invalido';
}

/**
 * TROCA EM DOIS PASSOS (30/09/2026, roadmap item 5 — ver _shared/acessoDoFuncionario.ts).
 *
 * Erros, ponto do dia e histórico passam a exigir a prova da própria pessoa (PIN ou comprovante
 * facial). Mas há telas de ponto ABERTAS AGORA com o código de antes (a facial sem CPF roda todo
 * dia em Caratinga) e elas não mandam prova nenhuma: exigir de uma vez travaria a batida na porta
 * até alguém recarregar a página.
 *   Passo 1 (false): prova ERRADA já é recusada; prova AUSENTE ainda passa, e cada uma fica
 *                    anotada no log como `[prova-ausente] <ação>`.
 *   Passo 2 (true):  quando o log ficar sem `[prova-ausente]` (as telas velhas sumiram), liga.
 */
const EXIGIR_PROVA_DO_FUNCIONARIO = false;

/**
 * null = pode seguir; senão, a resposta de recusa. Mensagem genérica de propósito: não diz se
 * foi o PIN, o comprovante ou o id que não bateu.
 */
async function recusaSemProva(acao: string, employeeId: string, companyId: string, body: Body): Promise<Response | null> {
  let prova: ProvaDoFuncionario;
  try {
    prova = await decidirProva({
      pin: body.pin,
      comprovante: body.comprovanteFacial,
      pinConfere: async (pin) => {
        const r = await conferirPinDoFuncionario(employeeId, pin);
        if (r === 'erro') throw new Error('leitura do PIN falhou');
        return r === 'ok';
      },
      comprovanteConfere: (c) => comprovanteFacialConfere(SRV, c, employeeId, companyId, Date.now()),
    });
  } catch (err) {
    console.error(`[prova] ${acao}: conferência falhou:`, err);
    return json({ error: 'Database error' }, 500);
  }
  if (prova === 'ok') return null;
  if (prova === 'invalido') return json({ error: 'Acesso negado' }, 401);
  if (EXIGIR_PROVA_DO_FUNCIONARIO) return json({ error: 'Acesso negado' }, 401);
  console.warn(`[prova-ausente] ${acao}`);
  return null;
}

async function verifyPin(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const pin = String(body.pin ?? '');
  if (!employeeId || !pin) return json({ error: 'Invalid employeeId or pin' }, 400);

  const resultado = await conferirPinDoFuncionario(employeeId, pin);
  if (resultado === 'erro') return json({ error: 'Database error' }, 500);
  return json({ valid: resultado === 'ok' });
}

async function setPin(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const newPin = String(body.newPin ?? '');
  if (!employeeId) return json({ error: 'Invalid employeeId' }, 400);
  if (!PIN_FORMATO.test(newPin)) {
    return json({ error: 'PIN deve ser numérico com 4 a 6 dígitos' }, 400);
  }

  // hashSync, não hash() async: no runtime Deno desta função, bcryptjs.hash()
  // (que gera salt novo por dentro) trava indefinidamente até estourar o
  // timeout da edge fn (504) — medido: 2/2 chamadas reais. bcryptjs.compare()
  // (sem gerar salt, só reconfere) responde normal em <1s — por isso verify-pin
  // continua async. hashSync roda tudo síncrono, sem essa trava.
  const pinHash = bcryptjs.hashSync(newPin, 10);

  // 30/09/2026: SÓ NO 1º ACESSO. A condição vai NO PRÓPRIO UPDATE (sem PIN configurado, sem
  // hash, sem texto) — duas chamadas ao mesmo tempo não conseguem as duas gravar, e quem já
  // tem PIN não tem o PIN trocado por ninguém. Trocar PIN de quem já tem = painel (RPC com login).
  const { data, error } = await supabase
    .from('employees')
    .update({ pin: null, pin_hash: pinHash, pin_configured: true })
    .eq('id', employeeId)
    .eq('pin_configured', false)
    .is('pin_hash', null)
    .or('pin.is.null,pin.eq.')
    .select('id');
  if (error) return json({ error: 'Database error', details: error.message }, 500);
  if (!data || data.length === 0) {
    return json({
      error: 'Este funcionário já tem PIN. Para trocar, peça ao responsável para resetar o PIN.',
    }, 409);
  }

  return json({ ok: true });
}

async function todayAttendance(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  if (!employeeId || !companyId) return json({ error: 'Invalid employeeId or companyId' }, 400);
  const recusa = await recusaSemProva('today-attendance', employeeId, companyId, body);
  if (recusa) return recusa;

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
  const recusa = await recusaSemProva('attendance-history', employeeId, companyId, body);
  if (recusa) return recusa;

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

  // 30/09/2026: o rosto cadastrado é dado biométrico — só com o PIN da própria pessoa.
  const pin = await conferirPinDoFuncionario(employeeId, body.pin);
  if (pin === 'erro') return json({ error: 'Database error' }, 500);
  if (pin === 'invalido') return json({ error: 'PIN inválido' }, 401);

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

  // 30/09/2026: trocar o rosto exige o PIN da própria pessoa — antes, com o id, qualquer um
  // punha o PRÓPRIO rosto na ficha de outro e batia o ponto dele.
  const pin = await conferirPinDoFuncionario(employeeId, body.pin);
  if (pin === 'erro') return json({ error: 'Database error' }, 500);
  if (pin === 'invalido') return json({ error: 'PIN inválido' }, 401);

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

/**
 * Reconhece o rosto SEM saber quem é de antemão (04/09/2026, pedido do Victor:
 * "bater ponto só pela facial, sem digitar CPF"). Recebe o rosto capturado
 * agora e devolve quem é (se achar) — a comparação contra TODOS os rostos
 * cadastrados da empresa acontece AQUI, no servidor, nunca no navegador: mandar
 * o rosto de 90 pessoas pro cliente comparar lá seria expor dado biométrico de
 * todo mundo numa tela pública sem senha nenhuma.
 *
 * Isto é só a IDENTIFICAÇÃO (1:N, mais frouxa por natureza — comparar contra
 * muita gente aumenta o risco de confundir). Quem bate o ponto de fato é o
 * fluxo já existente (clock-in-validated), que reconfere o MESMO rosto 1:1
 * contra o descriptor da pessoa identificada, com o limite de sempre — duas
 * conferências, não uma.
 */
async function identifyFace(body: Body): Promise<Response> {
  const companyId = String(body.companyId ?? '').trim();
  const now = parseDescriptor(body.descriptorNow);
  if (!companyId) return json({ error: 'Invalid companyId' }, 400);
  if (!now) return json({ error: 'Invalid descriptorNow' }, 400);

  // Trava do tablet (30/09/2026): com ela ligada, só um tablet autorizado identifica —
  // senão qualquer celular apontado pra um rosto descobriria nome e CPF da pessoa.
  const aparelho = await conferirAparelhoDaEmpresa(companyId, body.deviceToken);
  if (aparelho === 'erro') return json({ error: 'Database error' }, 500);
  if (aparelho === 'bloqueado') {
    return json({ matched: false, deviceBlocked: true, message: MENSAGEM_APARELHO_NAO_AUTORIZADO });
  }

  // MODO GALPÃO (06/10/2026, decisão 7 do plano do tablet sem toque): com `todasAsEmpresasDoTablet`
  // E o segredo de um tablet ATIVO, em modo galpão, que atende a empresa pedida, o rosto é procurado
  // em TODAS as empresas dele (Caratinga e Ponte Nova no mesmo galpão). Não expõe nada novo: esse
  // tablet já podia identificar em cada uma delas trocando a empresa da tela. Sem isso, só a empresa
  // pedida — exatamente o caminho de antes.
  let empresas = [companyId];
  if (body.todasAsEmpresasDoTablet === true) {
    try {
      const tablet = await resolverTablet(supabase, body.deviceToken);
      if (tablet && tablet.modoGalpao && tablet.companyIds.includes(companyId)) empresas = tablet.companyIds;
    } catch (err) {
      console.error('[identify-face] resolução do tablet (modo galpão) falhou:', err);
      return json({ error: 'Database error' }, 500);
    }
  }
  const variasEmpresas = empresas.length > 1;

  // employees não tem coluna "active" (diferente de driverpay_drivers/platforms) —
  // quem sai da empresa hoje é excluído da tabela, não desativado. `registration_status`
  // é o único filtro de elegibilidade que existe (fora abaixo).
  const consulta = supabase
    .from('employees')
    .select('id, name, cpf, company_id, face_descriptor, registration_status')
    .not('face_descriptor', 'is', null);
  const { data, error } = await (variasEmpresas ? consulta.in('company_id', empresas) : consulta.eq('company_id', companyId));
  if (error) return json({ error: 'Database error', details: error.message }, 500);

  const candidates: CandidatoFacialComEmpresa[] = [];
  for (const emp of data ?? []) {
    if (emp.registration_status === 'rejected') continue;
    const enrolled = parseDescriptor(emp.face_descriptor);
    if (!enrolled) continue;
    candidates.push({
      id: emp.id, name: emp.name, cpf: emp.cpf, companyId: emp.company_id, distance: euclideanDistance(now, enrolled),
    });
  }

  // Várias empresas: a mesma pessoa com ficha nas duas conta UMA vez (senão daria sempre "ambíguo").
  const { outcome, best, second } = decidirIdentificacao(variasEmpresas ? juntarCandidatosPorCpf(candidates) : candidates);
  const matched = outcome === 'matched' && best !== null;

  // Qual ficha bate o ponto (decisão 7): a que já tem ponto aberto hoje; senão a da empresa de casa
  // (a pedida); senão a mais parecida. Uma ficha só (o caso comum) = ela mesma, sem consulta a mais.
  let escolhida: CandidatoFacialComEmpresa | null = matched ? best : null;
  if (matched && variasEmpresas) {
    const fichas = fichasDaPessoa(candidates, best);
    let comPontoAberto = new Set<string>();
    if (fichas.length > 1) {
      const { data: dias, error: diasErr } = await supabase
        .from('attendance')
        .select('employee_id, entry_time, entry_1_time, exit_time_full, exit_2_time')
        .eq('date', getBrazilDateString())
        .in('employee_id', fichas.map((f) => f.id));
      if (diasErr) return json({ error: 'Database error', details: diasErr.message }, 500);
      comPontoAberto = new Set((dias ?? []).filter((d) => pontoAbertoNoDia(d)).map((d) => String(d.employee_id)));
    }
    escolhida = escolherFichaDaPessoa(fichas, companyId, comPontoAberto) ?? best;
  }

  // Log da tentativa — sem employee_id quando não deu pra confirmar (não
  // registra um "quase" como se fosse a pessoa certa). Desde 30/09 grava também o
  // desfecho e as duas distâncias: é o que permite calibrar com dado real.
  const { error: logErr } = await supabase.from('face_auth_attempts').insert([{
    employee_id: escolhida ? escolhida.id : null,
    date: getBrazilDateString(),
    attempted_at: new Date().toISOString(),
    success: matched,
    confidence: best ? Math.max(0, 1 - best.distance) : null,
    clock_type: null,
    company_id: escolhida ? escolhida.companyId : companyId,
    outcome,
    best_distance: best ? best.distance : null,
    second_distance: second ? second.distance : null,
  }]);
  if (logErr) console.error('[identify-face] log da tentativa falhou:', logErr.message);

  if (!matched || !escolhida) {
    return json({ matched: false, ambiguous: outcome === 'ambiguous' });
  }

  // Modo galpão: a tela precisa saber a empresa da ficha e o padrão de marcações dela (a ficha pode
  // ser da OUTRA empresa do tablet). Fora dele a resposta é a de sempre, sem campo a mais.
  let empresaDaFicha: { companyId: string; defaultMarkingCount: number | null } | null = null;
  if (variasEmpresas) {
    const { data: emp, error: empErr } = await supabase
      .from('companies')
      .select('default_marking_count')
      .eq('id', escolhida.companyId)
      .maybeSingle();
    if (empErr) return json({ error: 'Database error', details: empErr.message }, 500);
    empresaDaFicha = { companyId: escolhida.companyId, defaultMarkingCount: emp?.default_marking_count ?? null };
  }

  return json({
    matched: true,
    employeeId: escolhida.id,
    employeeName: escolhida.name,
    cpf: escolhida.cpf,
    faceDistance: escolhida.distance,
    // 30/09/2026: o rosto reconhecido vale como a senha dela por 15 min (ponto do dia e
    // histórico no tablet, onde ninguém digita PIN). Emitido pra empresa DA FICHA.
    comprovanteFacial: await emitirComprovanteFacial(SRV, escolhida.id, escolhida.companyId, Date.now()),
    ...(empresaDaFicha ?? {}),
  });
}

/**
 * Trava do tablet para UMA empresa: 'liberado' quando a trava está desligada ou quando o
 * segredo enviado é de um tablet ATIVO que atende a empresa; 'bloqueado' caso contrário.
 * Erro de banco = 'erro' (quem chama responde 500 — nunca libera no escuro).
 */
async function conferirAparelhoDaEmpresa(
  companyId: string,
  deviceToken: unknown,
): Promise<'liberado' | 'bloqueado' | 'erro'> {
  const { data: company, error } = await supabase
    .from('companies')
    .select('require_clock_device')
    .eq('id', companyId)
    .maybeSingle();
  if (error) {
    console.error('[clock-device] leitura da trava falhou:', error.message);
    return 'erro';
  }
  const travaLigada = company?.require_clock_device === true;
  if (!travaLigada) return 'liberado';
  try {
    const tablet = await resolverTablet(supabase, deviceToken);
    return decidirAparelho({ travaLigada, tablet, companyId }).liberado ? 'liberado' : 'bloqueado';
  } catch (err) {
    console.error('[clock-device] resolução do tablet falhou:', err);
    return 'erro';
  }
}

/** Quem é este aparelho? (null = não é um tablet ativo). Não depende de empresa nem de trava. */
async function clockDeviceStatus(body: Body): Promise<Response> {
  try {
    const tablet = await resolverTablet(supabase, body.deviceToken);
    return json({ device: tablet });
  } catch (err) {
    console.error('[clock-device-status] falhou:', err);
    return json({ error: 'Database error' }, 500);
  }
}

/**
 * Troca o código de ativação (gerado pelo 2626 no painel) pelo segredo do tablet. O segredo
 * volta UMA vez e fica só no aparelho; o banco guarda o sha256. Código vencido, já usado ou
 * digitado errado dão a mesma resposta — não ajuda quem tenta adivinhar.
 */
async function activateClockDevice(body: Body): Promise<Response> {
  const codigo = normalizarCodigoDeAtivacao(body.code);
  if (!codigo) {
    return json({ error: 'Código inválido. Confira as 8 letras e números (ex.: K7P2-9XQM).' }, 400);
  }
  const token = gerarSegredoDoTablet();
  const [codeHash, tokenHash] = await Promise.all([sha256Hex(codigo), sha256Hex(token)]);
  const { data, error } = await supabase.rpc('clock_device_activate', {
    p_code_hash: codeHash,
    p_token_hash: tokenHash,
  });
  if (error) {
    console.error('[activate-clock-device] falhou:', error.message);
    return json({ error: 'Database error' }, 500);
  }
  const tablet = tabletDaLinha(Array.isArray(data) ? data[0] : data);
  if (!tablet) {
    return json({ error: 'Código inválido, vencido ou já usado. Peça um código novo ao responsável.' }, 400);
  }
  return json({ token, device: tablet });
}

const CLOCK_EVENT_KINDS = new Set(['camera_error']);

function textoCurto(valor: unknown, max: number): string | null {
  if (valor == null) return null;
  const s = String(valor);
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Registro de problema da tela de ponto (30/09/2026). Hoje: erro de câmera — a queixa
 * "diz que a câmera está bloqueada mas não está" não tinha rastro nenhum no servidor.
 * Best-effort pro chamador (a tela não espera nem mostra erro disto).
 */
async function logClockEvent(body: Body): Promise<Response> {
  const companyId = String(body.companyId ?? '').trim();
  const kind = String(body.kind ?? '').trim();
  if (!companyId || !CLOCK_EVENT_KINDS.has(kind)) return json({ error: 'Invalid companyId or kind' }, 400);

  const detalhesBrutos = body.details && typeof body.details === 'object' ? body.details as Record<string, unknown> : {};
  const detalhes: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(detalhesBrutos).slice(0, 12)) {
    detalhes[textoCurto(k, 40) ?? ''] = textoCurto(v, 300);
  }
  const employeeId = textoCurto(body.employeeId, 64);

  const { error } = await supabase.from('error_logs').insert([{
    user_id: employeeId,
    company_id: companyId,
    error_type: kind,
    severity: 'medium',
    message: textoCurto(detalhes.name ?? kind, 200),
    component: textoCurto(detalhes.component ?? 'employee-clock', 60),
    module: 'employee-clock',
    error_context: detalhes,
    user_agent: textoCurto(body.userAgent, 300),
    occurrence_count: 1,
  }]);
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
  const recusa = await recusaSemProva('employee-errors-by-period', employeeId, companyId, body);
  if (recusa) return recusa;

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

// ─── Recibos de pagamento publicados pro funcionario (11/09/2026) ────────────
//
// Pedido do Victor: o PDF do recibo aparece na aba de erros dele. O bucket
// `payment-receipts` e PRIVADO e o funcionario nao tem JWT — por isso o link vem
// ASSINADO daqui, com validade curta, e nunca do bucket direto.
//
// 🔴 EXIGE O PIN (11/09/2026). A rota nasceu so com employeeId + companyId, no
// mesmo nivel das outras daqui — e uma auditoria mostrou que isso e FRACO DEMAIS
// pra este conteudo: a chave anon esta no bundle publico do site, e
// `lookup-employee` devolve o id de qualquer um a partir do CPF. Ou seja, quem
// soubesse um CPF baixava o RECIBO DE PAGAMENTO da pessoa, com o salario dela,
// sem senha nenhuma. Contagem de erro ja era discutivel; holerite nao da.
//
// O PIN e o mesmo que a pessoa digita pra entrar na tela — nao ha passo novo pra
// ela. A conferencia acontece AQUI, no servidor, com bcrypt, e nao na tela.
async function employeeReceipts(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  const pin = String(body.pin ?? '');
  if (!employeeId || !companyId) return json({ error: 'Invalid employeeId or companyId' }, 400);
  if (!pin) return json({ error: 'PIN obrigatorio' }, 401);

  const { data: dono, error: donoErr } = await supabase
    .from('employees')
    .select('pin, pin_hash')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (donoErr) return json({ error: 'Database error (pin)', details: donoErr.message }, 500);
  if (!dono) return json({ error: 'Funcionario nao encontrado' }, 404);

  // 30/09/2026: a mesma conferência de todas as ações (_shared/pin.ts).
  const pinOk = await pinConfere(pin, dono);
  // Mensagem generica de proposito: nao diz se foi o PIN ou o id que nao bate.
  if (!pinOk) return json({ error: 'PIN invalido' }, 401);

  const { data: rows, error } = await supabase
    .from('payment_receipt_publications')
    .select('id, titulo, period_start, period_end, total_net, delivered_at, pdf_path')
    .eq('employee_id', employeeId)
    .eq('company_id', companyId)
    .order('period_end', { ascending: false });
  if (error) return json({ error: 'Database error (receipts)', details: error.message }, 500);
  if (!rows || rows.length === 0) return json({ receipts: [] });

  type Row = {
    id: string; titulo: string; period_start: string; period_end: string;
    total_net: number | null; delivered_at: string; pdf_path: string;
  };

  const receipts = await Promise.all((rows as Row[]).map(async (r) => {
    // 10 minutos: tempo de abrir e baixar, sem virar link que circula por ai.
    const { data: signed } = await supabase.storage
      .from('payment-receipts')
      .createSignedUrl(r.pdf_path, 600);
    return {
      id: r.id,
      titulo: r.titulo,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      totalNet: r.total_net === null ? null : Number(r.total_net),
      deliveredAt: r.delivered_at,
      // `null` quando o arquivo sumiu do bucket: a tela mostra o recibo como
      // indisponivel em vez de um link quebrado.
      url: signed?.signedUrl ?? null,
    };
  }));

  // `viewed_at` = quando o recibo APARECEU na tela dele (a lista carregou), NAO
  // quando ele abriu o PDF — daqui nao da pra saber se ele clicou em "Abrir".
  // O `.is('viewed_at', null)` garante que so a PRIMEIRA vez grava, entao a data
  // nao fica se atualizando toda vez que ele entra na aba.
  const naoVistos = (rows as Row[]).map((r) => r.id);
  if (naoVistos.length > 0) {
    await supabase
      .from('payment_receipt_publications')
      .update({ viewed_at: new Date().toISOString() })
      .in('id', naoVistos)
      .is('viewed_at', null);
  }

  return json({ receipts });
}

async function employeeErrorPeriods(body: Body): Promise<Response> {
  const employeeId = String(body.employeeId ?? '').trim();
  const companyId = String(body.companyId ?? '').trim();
  if (!employeeId || !companyId) return json({ error: 'Invalid employeeId or companyId' }, 400);
  const recusa = await recusaSemProva('employee-error-periods', employeeId, companyId, body);
  if (recusa) return recusa;

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
      case 'identify-face': return await identifyFace(body);
      case 'log-face-attempt': return await logFaceAttempt(body);
      case 'clock-device-status': return await clockDeviceStatus(body);
      case 'activate-clock-device': return await activateClockDevice(body);
      case 'log-clock-event': return await logClockEvent(body);
      case 'employee-errors-by-period': return await employeeErrorsByPeriod(body);
      case 'employee-error-periods': return await employeeErrorPeriods(body);
      case 'employee-receipts': return await employeeReceipts(body);
      default: return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('[employee-public-api] unhandled:', err);
    return json({ error: 'Internal server error', details: String(err) }, 500);
  }
});
