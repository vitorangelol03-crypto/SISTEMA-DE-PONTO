// ponto-supervisor-api — o SERVIDOR DO MODO SUPERVISOR do tablet (07/10/2026, plano do tablet sem
// toque, entrega D; .claude-checkpoints/PLANO_TABLET_SEM_TOQUE_2026-10-05.md §4 "Servidor").
//
// O supervisor entra no CELULAR dele (código + senha do painel), mostra um QR pro tablet ler (a
// sessão fica PAREADA com aquele tablet), vê a lista de funcionários, cadastra gente nova ou pede
// pra refazer um rosto; um 2º QR leva o tablet a tirar o rosto, e ele confirma no celular. O rosto
// confirmado entra na ficha; a batida continua pelo caminho de sempre (o tablet reconhece a pessoa).
//
// Separada da employee-public-api DE PROPÓSITO: aquela é chamada em TODA batida dos tablets no ar —
// cada deploy dela mexe no ponto ao vivo. Esta é só do modo supervisor (como a driver-public-api é a
// do app do entregador). verify_jwt = false: o celular entra aqui mesmo (código + senha), o tablet
// manda o segredo dele; o service_role fica só aqui dentro. As 3 tabelas desta função
// (migration 20261007060926) não têm policy nenhuma — só ela mexe.
//
// Ações do CELULAR (todas, menos o login, com `session` = o segredo da sessão de 20 min):
//   supervisor-login     { userId, password, companyId? } → { sessionToken, expiresAt, usuario, funcionario, empresa, pode }
//   supervisor-logout    { session }
//   create-pair-qr       { session } → { qrId, qrText, expiresAt }                     (QR1: parear)
//   qr-status            { session, qrId } → { status, tablet?, foto?, qualidade?, pontoDeHoje? }
//   list-employees       { session } → { funcionarios }                                (só PAREADA)
//   list-function-roles  { session } → { funcoes }
//   create-employee      { session, name, cpf, phone, functionRole } → { employeeId, nome } | { jaExiste, employeeId, nome }
//   create-face-qr       { session, employeeId, mode: 'novo'|'refazer', baterPonto? } → { qrId, qrText, expiresAt }  (QR2: rosto)
//   confirm-face         { session, qrId, aceitar } → { status }
// Ações do TABLET (sem login — o segredo de um tablet ATIVO, em modo galpão):
//   tablet-read-qr       { deviceToken, qrText } → { tipo: 'parear', ... } | { tipo: 'rosto', ... }
//   tablet-submit-face   { deviceToken, qrId, amostras, foto } → { ok, aviso }
//   tablet-qr-status     { deviceToken, qrId } → { status, ... }
//
// Respostas de recusa são GENÉRICAS de propósito onde o detalhe ajudaria quem tenta adivinhar
// (sessão errada/vencida, QR vencido/usado/de outro tablet).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { bcryptjs } from '../_shared/pin.ts';
import {
  gerarSegredoDoTablet, resolverTablet, segredoTemFormatoValido, sha256Hex, type TabletAtivo,
} from '../_shared/clockDevice.ts';
import {
  CAPTURA_PRAZO_MS, CONFIRMA_PRAZO_MS, MAX_TENTATIVAS_DE_ROSTO, QR_VALIDO_MS, SESSAO_MS,
  dentroDoPrazo, gerarCodigoDoQr, lerTextoDoQr, sessaoValida, textoDoQr,
} from '../_shared/tabletQr.ts';
import {
  AMOSTRAS_CONSISTENTES_ATE, decidirRostoNovo, distanciaEntre, lerAmostras, maiorDistanciaEntreAmostras,
  mediaDasAmostras, type RostoCadastrado,
} from '../_shared/rostoPeloTablet.ts';
import {
  cpfValido, finalDoCpf, funcaoAceita, funcoesDaEmpresa, nomeDoCadastro, soDigitos, telefoneDoCadastro,
} from '../_shared/cadastroPeloTablet.ts';
import {
  MENSAGEM_DA_RECUSA, decidirLogin, depoisDeUmaFalha, ehMestre, loginTravado, type OQueOSupervisorPode,
} from '../_shared/sessaoDoSupervisor.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRV = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SRV, { auth: { persistSession: false } });

const MENSAGEM_SESSAO = 'Sua sessão de supervisor acabou. Entre de novo.';
const MENSAGEM_QR = 'Código vencido ou já usado — gere outro no celular.';
const MENSAGEM_TABLET = 'Este aparelho não é um tablet de ponto ativo em modo galpão.';
const MENSAGEM_LOGIN = 'Código ou senha inválidos.';
const MENSAGEM_TRAVADO = 'Muitas tentativas erradas. Tente de novo em 15 minutos.';
/** Foto pequena do rosto (data URL JPEG) — o limite é o da coluna (60 mil caracteres). */
const FOTO_MAXIMA = 60_000;

type Body = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** 'AAAA-MM-DD' no fuso do Brasil (sem horário de verão desde 2019). */
function hojeNoBrasil(): string {
  return new Date(Date.now() - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function erroDeBanco(onde: string, err: { message: string } | null): Response {
  console.error(`[ponto-supervisor-api] ${onde}:`, err?.message);
  return json({ error: 'Database error' }, 500);
}

// ─── Histórico (audit_logs) — gravado pelo SERVIDOR: pelo navegador falharia calado ──────────────
async function registrar(p: {
  userId: string;
  acao: 'login' | 'logout' | 'create' | 'update';
  modulo: 'tablet' | 'employees';
  tipo: string;
  entidade: string | null;
  descricao: string;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert([{
    user_id: p.userId,
    action_type: p.acao,
    module: p.modulo,
    entity_type: p.tipo,
    entity_id: p.entidade,
    old_data: p.antes ?? null,
    new_data: p.depois ?? null,
    description: p.descricao,
  }]);
  // O histórico não derruba a ação (o que importa já foi gravado) — mas fica no log da função.
  if (error) console.error('[ponto-supervisor-api] histórico falhou:', error.message);
}

// ─── Sessão do supervisor ─────────────────────────────────────────────────────────────────────────
interface Sessao {
  id: string;
  user_id: string;
  employee_id: string | null;
  company_id: string;
  device_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}

async function permissoesAtuais(userId: string): Promise<OQueOSupervisorPode | Response> {
  if (userId === '2626') return { cadastrar: true, refazerRosto: true };
  const [c, r] = await Promise.all([
    supabase.rpc('user_has_module_permission', { p_user_id: userId, p_module: 'employees', p_action: 'tabletCreate' }),
    supabase.rpc('user_has_module_permission', { p_user_id: userId, p_module: 'employees', p_action: 'tabletFaceReset' }),
  ]);
  if (c.error) return erroDeBanco('permissão (cadastrar)', c.error);
  if (r.error) return erroDeBanco('permissão (rosto)', r.error);
  return { cadastrar: c.data === true, refazerRosto: r.data === true };
}

/** A sessão do celular — válida e com a permissão conferida DE NOVO (tirada no meio = para na hora). */
async function carregarSessao(body: Body, exigirPermissao = true): Promise<{ sessao: Sessao; pode: OQueOSupervisorPode } | Response> {
  if (!segredoTemFormatoValido(body.session)) return json({ error: MENSAGEM_SESSAO }, 401);
  const tokenHash = await sha256Hex(body.session);
  const { data, error } = await supabase
    .from('tablet_supervisor_sessions')
    .select('id, user_id, employee_id, company_id, device_id, status, created_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) return erroDeBanco('sessão', error);
  const sessao = data as Sessao | null;
  if (!sessao || !sessaoValida(sessao, Date.now())) return json({ error: MENSAGEM_SESSAO }, 401);
  if (!exigirPermissao) return { sessao, pode: { cadastrar: false, refazerRosto: false } };
  const pode = await permissoesAtuais(sessao.user_id);
  if (pode instanceof Response) return pode;
  if (!pode.cadastrar && !pode.refazerRosto) {
    return json({ error: 'Sua permissão do tablet foi retirada. Fale com o responsável.' }, 403);
  }
  return { sessao, pode };
}

/** O tablet da sessão continua ATIVO? (pareada com um tablet que foi removido não lista nem cadastra) */
async function tabletDaSessaoAtivo(sessao: Sessao): Promise<boolean | Response> {
  if (sessao.status !== 'pareada' || !sessao.device_id) return false;
  const { data, error } = await supabase.from('clock_devices').select('status').eq('id', sessao.device_id).maybeSingle();
  if (error) return erroDeBanco('tablet da sessão', error);
  return (data as { status: string } | null)?.status === 'active';
}

async function exigirPareada(sessao: Sessao): Promise<Response | null> {
  const ativo = await tabletDaSessaoAtivo(sessao);
  if (ativo instanceof Response) return ativo;
  if (!ativo) return json({ error: 'Mostre o QR de conectar para a câmera do tablet primeiro.', motivo: 'nao_pareada' }, 409);
  return null;
}

/** O tablet que está chamando: ATIVO e com o modo galpão ligado (é lá que mora a leitura do QR). */
async function carregarTablet(body: Body): Promise<TabletAtivo | Response> {
  try {
    const tablet = await resolverTablet(supabase, body.deviceToken);
    if (!tablet || !tablet.modoGalpao) return json({ error: MENSAGEM_TABLET }, 403);
    return tablet;
  } catch (err) {
    console.error('[ponto-supervisor-api] resolução do tablet falhou:', err);
    return json({ error: 'Database error' }, 500);
  }
}

/** Cancela QRs em andamento de uma sessão (e apaga a biometria temporária deles). */
async function cancelarQrs(sessaoId: string, kind?: 'parear' | 'rosto'): Promise<void> {
  let q = supabase
    .from('tablet_qr_tokens')
    .update({ status: 'cancelado', captured_descriptor: null, captured_thumb: null, decided_at: new Date().toISOString() })
    .eq('session_id', sessaoId)
    .in('status', ['pendente', 'lido', 'capturado']);
  if (kind) q = q.eq('kind', kind);
  const { error } = await q;
  if (error) console.error('[ponto-supervisor-api] cancelar QRs falhou:', error.message);
}

async function novoQr(sessao: Sessao, campos: { kind: 'parear' | 'rosto'; employee_id?: string; mode?: string; bater_ponto?: boolean }): Promise<Response> {
  const codigo = gerarCodigoDoQr();
  const expiresAt = new Date(Date.now() + QR_VALIDO_MS).toISOString();
  const { data, error } = await supabase
    .from('tablet_qr_tokens')
    .insert([{ session_id: sessao.id, token_hash: await sha256Hex(codigo), expires_at: expiresAt, ...campos }])
    .select('id')
    .single();
  if (error) return erroDeBanco('criar QR', error);
  return json({ qrId: (data as { id: string }).id, qrText: textoDoQr(campos.kind, codigo), expiresAt });
}

// ─── CELULAR ──────────────────────────────────────────────────────────────────────────────────────

async function supervisorLogin(body: Body): Promise<Response> {
  const userId = texto(body.userId);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!userId || !password) return json({ error: 'Informe o código e a senha.' }, 400);

  const { data: userRow, error } = await supabase
    .from('users')
    .select('id, name, company_id, password_hash, must_change_password, employee_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) return erroDeBanco('usuário', error);
  const user = userRow as {
    id: string; name: string | null; company_id: string; password_hash: string | null;
    must_change_password: boolean | null; employee_id: string | null;
  } | null;
  if (!user || !user.password_hash) return json({ error: MENSAGEM_LOGIN }, 401);

  const { data: tentativaRow, error: tErr } = await supabase
    .from('tablet_supervisor_login_attempts')
    .select('failed_attempts, locked_until')
    .eq('user_id', userId)
    .maybeSingle();
  if (tErr) return erroDeBanco('tentativas', tErr);
  const tentativa = tentativaRow as { failed_attempts: number; locked_until: string | null } | null;
  if (loginTravado(tentativa?.locked_until, Date.now())) return json({ error: MENSAGEM_TRAVADO }, 423);

  let confere = false;
  try {
    confere = await bcryptjs.compare(password, user.password_hash);
  } catch (err) {
    console.error('[ponto-supervisor-api] bcrypt:', err);
  }
  if (!confere) {
    const proxima = depoisDeUmaFalha(tentativa?.failed_attempts ?? 0, Date.now());
    const { error: uErr } = await supabase
      .from('tablet_supervisor_login_attempts')
      .upsert({ user_id: userId, ...proxima, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (uErr) return erroDeBanco('registrar tentativa', uErr);
    return proxima.locked_until ? json({ error: MENSAGEM_TRAVADO }, 423) : json({ error: MENSAGEM_LOGIN }, 401);
  }
  if (tentativa) {
    const { error: dErr } = await supabase.from('tablet_supervisor_login_attempts').delete().eq('user_id', userId);
    if (dErr) return erroDeBanco('zerar tentativas', dErr);
  }

  const pode = await permissoesAtuais(userId);
  if (pode instanceof Response) return pode;
  const decisao = decidirLogin({
    userId,
    senhaProvisoria: user.must_change_password === true,
    podeCadastrar: pode.cadastrar,
    podeRefazerRosto: pode.refazerRosto,
    employeeId: user.employee_id,
  });
  if (!decisao.ok) return json({ error: MENSAGEM_DA_RECUSA[decisao.motivo], motivo: decisao.motivo }, 403);

  // A empresa da sessão: a do usuário; os mestres (9999/2626) escolhem.
  let companyId = user.company_id;
  const pedida = texto(body.companyId);
  if (pedida && ehMestre(userId)) companyId = pedida;
  const { data: empresa, error: eErr } = await supabase
    .from('companies').select('id, display_name').eq('id', companyId).maybeSingle();
  if (eErr) return erroDeBanco('empresa', eErr);
  if (!empresa) return json({ error: 'Empresa não encontrada.' }, 400);

  let funcionario: { id: string; nome: string } | null = null;
  if (user.employee_id) {
    const { data: f } = await supabase.from('employees').select('id, name').eq('id', user.employee_id).maybeSingle();
    if (f) funcionario = { id: (f as { id: string }).id, nome: (f as { name: string }).name };
  }

  const segredo = gerarSegredoDoTablet();
  const expiresAt = new Date(Date.now() + SESSAO_MS).toISOString();
  const { data: sessao, error: sErr } = await supabase
    .from('tablet_supervisor_sessions')
    .insert([{
      token_hash: await sha256Hex(segredo),
      user_id: userId,
      employee_id: user.employee_id,
      company_id: companyId,
      status: 'aberta',
      expires_at: expiresAt,
    }])
    .select('id')
    .single();
  if (sErr) return erroDeBanco('criar sessão', sErr);

  const nomeDaEmpresa = (empresa as { display_name: string }).display_name;
  await registrar({
    userId, acao: 'login', modulo: 'tablet', tipo: 'sessao_supervisor', entidade: (sessao as { id: string }).id,
    descricao: `Entrou no modo supervisor do tablet (${nomeDaEmpresa})${funcionario ? ` — ${funcionario.nome}` : ''}`,
    depois: { company_id: companyId, employee_id: user.employee_id },
  });
  return json({
    sessionToken: segredo,
    expiresAt,
    usuario: { id: userId, nome: user.name },
    funcionario,
    empresa: { id: companyId, nome: nomeDaEmpresa },
    pode: decisao.pode,
  });
}

async function supervisorLogout(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body, false);
  if (carregada instanceof Response) return carregada;
  const { sessao } = carregada;
  await cancelarQrs(sessao.id);
  const { error } = await supabase
    .from('tablet_supervisor_sessions')
    .update({ status: 'encerrada', ended_at: new Date().toISOString() })
    .eq('id', sessao.id);
  if (error) return erroDeBanco('encerrar sessão', error);
  await registrar({
    userId: sessao.user_id, acao: 'logout', modulo: 'tablet', tipo: 'sessao_supervisor', entidade: sessao.id,
    descricao: 'Saiu do modo supervisor do tablet',
  });
  return json({ ok: true });
}

async function createPairQr(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body);
  if (carregada instanceof Response) return carregada;
  await cancelarQrs(carregada.sessao.id, 'parear');
  return novoQr(carregada.sessao, { kind: 'parear' });
}

async function qrStatus(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body);
  if (carregada instanceof Response) return carregada;
  const qrId = texto(body.qrId);
  if (!qrId) return json({ error: 'qrId obrigatório' }, 400);
  const { data, error } = await supabase
    .from('tablet_qr_tokens')
    .select('id, kind, status, expires_at, employee_id, mode, bater_ponto, read_by_device, read_at, captured_at, captured_thumb, quality, attempts')
    .eq('id', qrId)
    .eq('session_id', carregada.sessao.id)
    .maybeSingle();
  if (error) return erroDeBanco('QR', error);
  const qr = data as {
    kind: string; status: string; expires_at: string; employee_id: string | null; mode: string | null;
    bater_ponto: boolean; read_by_device: string | null; read_at: string | null; captured_at: string | null;
    captured_thumb: string | null; quality: Record<string, unknown> | null; attempts: number;
  } | null;
  if (!qr) return json({ error: 'QR não encontrado.' }, 404);

  const agora = Date.now();
  let status = qr.status;
  if (status === 'pendente' && new Date(qr.expires_at).getTime() <= agora) status = 'vencido';
  if (status === 'lido' && qr.kind === 'rosto' && !dentroDoPrazo(qr.read_at, CAPTURA_PRAZO_MS, agora)) status = 'vencido';
  if (status === 'capturado' && !dentroDoPrazo(qr.captured_at, CONFIRMA_PRAZO_MS, agora)) status = 'vencido';

  let tablet: string | null = null;
  if (qr.read_by_device) {
    const { data: d } = await supabase.from('clock_devices').select('name').eq('id', qr.read_by_device).maybeSingle();
    tablet = (d as { name: string } | null)?.name ?? null;
  }
  const resposta: Record<string, unknown> = { status, tipo: qr.kind, tablet, tentativas: qr.attempts };
  if (status === 'capturado') {
    resposta.foto = qr.captured_thumb;
    resposta.qualidade = qr.quality;
  }
  if (qr.kind === 'rosto' && (status === 'recusado' || status === 'confirmado')) resposta.qualidade = qr.quality;
  if (qr.kind === 'rosto' && status === 'confirmado' && qr.employee_id) {
    // O ponto de hoje da pessoa — o celular mostra "Entrada 07:02" quando a batida entrar.
    const { data: dia } = await supabase
      .from('attendance')
      .select('entry_time, entry_1_time, exit_1_time, entry_2_time, exit_2_time, exit_time_full')
      .eq('employee_id', qr.employee_id)
      .eq('date', hojeNoBrasil())
      .maybeSingle();
    resposta.pontoDeHoje = dia ?? null;
  }
  return json(resposta);
}

async function listEmployees(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body);
  if (carregada instanceof Response) return carregada;
  const naoPareada = await exigirPareada(carregada.sessao);
  if (naoPareada) return naoPareada;
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, function_role, cpf, face_registered, face_reset_requested, registration_status, termination_date')
    .eq('company_id', carregada.sessao.company_id)
    .order('name', { ascending: true });
  if (error) return erroDeBanco('funcionários', error);
  const hoje = hojeNoBrasil();
  const funcionarios = (data ?? []).map((e) => {
    const f = e as {
      id: string; name: string; function_role: string | null; cpf: string | null; face_registered: boolean | null;
      face_reset_requested: boolean | null; registration_status: string; termination_date: string | null;
    };
    return {
      id: f.id,
      nome: f.name,
      funcao: f.function_role,
      cpfFinal: finalDoCpf(f.cpf),
      temRosto: f.face_registered === true,
      pediuNovoRosto: f.face_reset_requested === true,
      status: f.registration_status,
      desligado: !!f.termination_date && f.termination_date < hoje,
    };
  });
  return json({ funcionarios, pode: carregada.pode });
}

async function listFunctionRoles(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body);
  if (carregada instanceof Response) return carregada;
  const { data, error } = await supabase
    .from('employees')
    .select('function_role')
    .eq('company_id', carregada.sessao.company_id)
    .not('function_role', 'is', null);
  if (error) return erroDeBanco('funções', error);
  return json({ funcoes: funcoesDaEmpresa((data ?? []) as Array<{ function_role: string | null }>) });
}

async function createEmployee(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body);
  if (carregada instanceof Response) return carregada;
  const { sessao, pode } = carregada;
  if (!pode.cadastrar) return json({ error: 'Você não tem permissão de cadastrar funcionário pelo tablet.' }, 403);
  const naoPareada = await exigirPareada(sessao);
  if (naoPareada) return naoPareada;

  const nome = nomeDoCadastro(body.name);
  if (!nome) return json({ error: 'Nome inválido — escreva o nome completo.' }, 400);
  const cpf = soDigitos(body.cpf);
  if (!cpfValido(cpf)) return json({ error: 'CPF inválido — confira os números.' }, 400);
  const telefone = telefoneDoCadastro(body.phone);
  if (!telefone) return json({ error: 'Telefone inválido — DDD + número.' }, 400);
  const { data: rolesRows, error: rErr } = await supabase
    .from('employees').select('function_role').eq('company_id', sessao.company_id).not('function_role', 'is', null);
  if (rErr) return erroDeBanco('funções', rErr);
  const funcao = funcaoAceita(funcoesDaEmpresa((rolesRows ?? []) as Array<{ function_role: string | null }>), body.functionRole);
  if (!funcao) return json({ error: 'Escolha a função na lista.' }, 400);

  // O CPF já tem ficha nesta empresa? Ativo: o celular oferece "refazer o rosto"; recusado ou
  // desligado: resolve no painel (não cria uma 2ª ficha da mesma pessoa).
  const { data: existentes, error: xErr } = await supabase
    .from('employees')
    .select('id, name, cpf, registration_status, termination_date')
    .eq('company_id', sessao.company_id)
    .not('cpf', 'is', null);
  if (xErr) return erroDeBanco('CPF existente', xErr);
  const hoje = hojeNoBrasil();
  const mesmo = (existentes ?? []).find((e) => soDigitos((e as { cpf: string }).cpf) === cpf) as
    { id: string; name: string; registration_status: string; termination_date: string | null } | undefined;
  if (mesmo) {
    const desligado = !!mesmo.termination_date && mesmo.termination_date < hoje;
    if (mesmo.registration_status === 'rejected' || desligado) {
      return json({ error: 'Esse CPF já tem cadastro recusado ou desligado nesta empresa — resolva no painel.' }, 409);
    }
    return json({ jaExiste: true, employeeId: mesmo.id, nome: mesmo.name });
  }

  // Grava DE PROPÓSITO, sem depender dos padrões do banco (empresa Caratinga, contrato 'CLT'):
  // decisão 5 — diarista nos DOIS campos de vínculo, Pendente (Aprovação de Cadastro), sem PIX.
  const { data: novo, error: iErr } = await supabase
    .from('employees')
    .insert([{
      company_id: sessao.company_id,
      name: nome,
      cpf,
      phone: telefone,
      function_role: funcao,
      employment_type: 'Diarista',
      contract_type: 'Diarista',
      registration_status: 'pending',
      created_by: sessao.user_id,
      marking_count: null,
    }])
    .select('id')
    .single();
  if (iErr) return erroDeBanco('cadastrar funcionário', iErr);
  const employeeId = (novo as { id: string }).id;
  await registrar({
    userId: sessao.user_id, acao: 'create', modulo: 'employees', tipo: 'funcionario', entidade: employeeId,
    descricao: `Funcionário ${nome} cadastrado pelo modo supervisor do tablet`,
    depois: { nome, funcao, via: 'tablet', tablet: sessao.device_id, sessao: sessao.id, funcionario_do_supervisor: sessao.employee_id },
  });
  return json({ employeeId, nome });
}

async function createFaceQr(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body);
  if (carregada instanceof Response) return carregada;
  const { sessao, pode } = carregada;
  const naoPareada = await exigirPareada(sessao);
  if (naoPareada) return naoPareada;

  const employeeId = texto(body.employeeId);
  const mode = texto(body.mode);
  if (!employeeId || (mode !== 'novo' && mode !== 'refazer')) return json({ error: 'Escolha o funcionário e o tipo.' }, 400);
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, company_id, registration_status, termination_date, created_by, created_at')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) return erroDeBanco('funcionário', error);
  const emp = data as {
    id: string; name: string; company_id: string; registration_status: string; termination_date: string | null;
    created_by: string | null; created_at: string;
  } | null;
  if (!emp || emp.company_id !== sessao.company_id) return json({ error: 'Funcionário não encontrado nesta empresa.' }, 404);
  if (emp.registration_status === 'rejected') return json({ error: 'Cadastro recusado — resolva no painel.' }, 409);
  if (emp.termination_date && emp.termination_date < hojeNoBrasil()) return json({ error: 'Funcionário desligado — resolva no painel.' }, 409);

  if (mode === 'novo') {
    // "Novo" só pra quem ESTA sessão cadastrou agora (o resto é "refazer", com a outra permissão).
    const desta = emp.created_by === sessao.user_id && new Date(emp.created_at).getTime() >= new Date(sessao.created_at).getTime();
    if (!pode.cadastrar || !desta) return json({ error: 'Esse funcionário não foi cadastrado agora — use "Refazer rosto".' }, 403);
  } else if (!pode.refazerRosto) {
    return json({ error: 'Você não tem permissão de refazer rosto pelo tablet.' }, 403);
  }

  await cancelarQrs(sessao.id, 'rosto');
  return novoQr(sessao, {
    kind: 'rosto', employee_id: emp.id, mode, bater_ponto: body.baterPonto !== false,
  });
}

async function confirmFace(body: Body): Promise<Response> {
  const carregada = await carregarSessao(body);
  if (carregada instanceof Response) return carregada;
  const { sessao } = carregada;
  const qrId = texto(body.qrId);
  const aceitar = body.aceitar === true;
  if (!qrId) return json({ error: 'qrId obrigatório' }, 400);

  const { data, error } = await supabase
    .from('tablet_qr_tokens')
    .select('id, kind, status, employee_id, mode, captured_at, captured_descriptor, attempts, read_by_device')
    .eq('id', qrId)
    .eq('session_id', sessao.id)
    .maybeSingle();
  if (error) return erroDeBanco('QR', error);
  const qr = data as {
    id: string; kind: string; status: string; employee_id: string | null; mode: string | null; captured_at: string | null;
    captured_descriptor: unknown; attempts: number; read_by_device: string | null;
  } | null;
  if (!qr || qr.kind !== 'rosto' || qr.status !== 'capturado' || !qr.employee_id) {
    return json({ error: 'Não há rosto esperando confirmação.' }, 409);
  }
  if (!dentroDoPrazo(qr.captured_at, CONFIRMA_PRAZO_MS, Date.now())) {
    await cancelarQrs(sessao.id, 'rosto');
    return json({ error: 'O tempo pra confirmar acabou — gere outro código.' }, 409);
  }
  const agoraIso = new Date().toISOString();

  if (!aceitar) {
    // Foto ruim: o tablet tira de novo (até MAX_TENTATIVAS_DE_ROSTO), com um prazo de captura novo.
    const tentativas = qr.attempts + 1;
    const final = tentativas >= MAX_TENTATIVAS_DE_ROSTO;
    const { error: uErr } = await supabase
      .from('tablet_qr_tokens')
      .update(final
        ? { status: 'recusado', decided_at: agoraIso, attempts: tentativas, captured_descriptor: null, captured_thumb: null }
        : { status: 'lido', read_at: agoraIso, captured_at: null, attempts: tentativas, captured_descriptor: null, captured_thumb: null })
      .eq('id', qr.id)
      .eq('status', 'capturado');
    if (uErr) return erroDeBanco('recusar foto', uErr);
    return json({ status: final ? 'recusado' : 'lido', tentativas });
  }

  const descriptor = Array.isArray(qr.captured_descriptor) ? (qr.captured_descriptor as unknown[]).map(Number) : null;
  if (!descriptor || descriptor.length !== 128 || !descriptor.every((n) => Number.isFinite(n))) {
    return json({ error: 'O rosto tirado não está mais disponível — gere outro código.' }, 409);
  }
  // 1) Quem confirma primeiro ganha (status 'capturado' → 'confirmado' num UPDATE só).
  const { data: ganhou, error: cErr } = await supabase
    .from('tablet_qr_tokens')
    .update({ status: 'confirmado', decided_at: agoraIso })
    .eq('id', qr.id)
    .eq('status', 'capturado')
    .select('id');
  if (cErr) return erroDeBanco('confirmar QR', cErr);
  if (!ganhou || ganhou.length === 0) return json({ error: 'Esse rosto já foi decidido.' }, 409);

  // 2) O rosto novo entra na ficha (o antigo valia até aqui). A foto NÃO vai pro bucket público:
  //    face_photo_url fica vazio (o tablet não guarda foto, só o supervisor viu a pequena).
  const { data: empAntes } = await supabase.from('employees').select('name').eq('id', qr.employee_id).maybeSingle();
  const { error: eErr } = await supabase
    .from('employees')
    .update({
      face_descriptor: descriptor,
      face_registered: true,
      face_reset_requested: false,
      face_registered_at: agoraIso,
      face_photo_url: null,
    })
    .eq('id', qr.employee_id);
  if (eErr) {
    await supabase.from('tablet_qr_tokens').update({ status: 'capturado', decided_at: null }).eq('id', qr.id);
    return erroDeBanco('gravar rosto', eErr);
  }
  // 3) A biometria temporária sai daqui na hora.
  const { error: zErr } = await supabase
    .from('tablet_qr_tokens').update({ captured_descriptor: null, captured_thumb: null }).eq('id', qr.id);
  if (zErr) console.error('[ponto-supervisor-api] zerar biometria temporária falhou (o job apaga em 10 min):', zErr.message);

  let nomeDoTablet = '';
  if (qr.read_by_device) {
    const { data: d } = await supabase.from('clock_devices').select('name').eq('id', qr.read_by_device).maybeSingle();
    nomeDoTablet = (d as { name: string } | null)?.name ?? '';
  }
  const nome = (empAntes as { name: string } | null)?.name ?? 'funcionário';
  await registrar({
    userId: sessao.user_id, acao: 'update', modulo: 'employees', tipo: 'rosto', entidade: qr.employee_id,
    descricao: `Rosto de ${nome} ${qr.mode === 'novo' ? 'cadastrado' : 'refeito'} no tablet${nomeDoTablet ? ` ${nomeDoTablet}` : ''}, confirmado pelo supervisor`,
    depois: { via: 'tablet', modo: qr.mode, tablet: qr.read_by_device, sessao: sessao.id, funcionario_do_supervisor: sessao.employee_id },
  });
  return json({ status: 'confirmado' });
}

// ─── TABLET ───────────────────────────────────────────────────────────────────────────────────────

async function tabletReadQr(body: Body): Promise<Response> {
  const tablet = await carregarTablet(body);
  if (tablet instanceof Response) return tablet;
  const lido = lerTextoDoQr(body.qrText);
  if (!lido) return json({ error: MENSAGEM_QR }, 404);
  const tokenHash = await sha256Hex(lido.codigo);

  const { data, error } = await supabase
    .from('tablet_qr_tokens')
    .select('id, kind, status, expires_at, session_id, employee_id, mode, bater_ponto')
    .eq('token_hash', tokenHash)
    .eq('status', 'pendente')
    .maybeSingle();
  if (error) return erroDeBanco('ler QR', error);
  const qr = data as {
    id: string; kind: string; status: string; expires_at: string; session_id: string; employee_id: string | null;
    mode: string | null; bater_ponto: boolean;
  } | null;
  if (!qr || qr.kind !== lido.tipo || new Date(qr.expires_at).getTime() <= Date.now()) return json({ error: MENSAGEM_QR }, 404);
  if (qr.kind === 'rosto' && !qr.employee_id) return json({ error: MENSAGEM_QR }, 404);

  const { data: s, error: sErr } = await supabase
    .from('tablet_supervisor_sessions')
    .select('id, user_id, employee_id, company_id, device_id, status, created_at, expires_at')
    .eq('id', qr.session_id)
    .maybeSingle();
  if (sErr) return erroDeBanco('sessão do QR', sErr);
  const sessao = s as Sessao | null;
  if (!sessao || !sessaoValida(sessao, Date.now())) return json({ error: MENSAGEM_QR }, 404);
  // QR1: o tablet tem que atender a empresa da sessão. QR2: tem que ser o MESMO tablet pareado.
  if (qr.kind === 'parear' && !tablet.companyIds.includes(sessao.company_id)) return json({ error: MENSAGEM_QR }, 404);
  if (qr.kind === 'rosto' && sessao.device_id !== tablet.id) return json({ error: MENSAGEM_QR }, 404);

  // 1 uso: só um UPDATE ganha (status ainda 'pendente').
  const agoraIso = new Date().toISOString();
  const { data: ganhou, error: uErr } = await supabase
    .from('tablet_qr_tokens')
    .update({ status: 'lido', read_by_device: tablet.id, read_at: agoraIso })
    .eq('id', qr.id)
    .eq('status', 'pendente')
    .select('id');
  if (uErr) return erroDeBanco('marcar QR lido', uErr);
  if (!ganhou || ganhou.length === 0) return json({ error: MENSAGEM_QR }, 404);

  if (qr.kind === 'parear') {
    const { error: pErr } = await supabase
      .from('tablet_supervisor_sessions')
      .update({ status: 'pareada', device_id: tablet.id, paired_at: agoraIso })
      .eq('id', sessao.id);
    if (pErr) return erroDeBanco('parear sessão', pErr);
    const { data: u } = await supabase.from('users').select('name').eq('id', sessao.user_id).maybeSingle();
    let nomeDoFuncionario: string | null = null;
    if (sessao.employee_id) {
      const { data: f } = await supabase.from('employees').select('name').eq('id', sessao.employee_id).maybeSingle();
      nomeDoFuncionario = (f as { name: string } | null)?.name ?? null;
    }
    return json({
      tipo: 'parear',
      supervisor: { id: sessao.user_id, nome: nomeDoFuncionario ?? (u as { name: string | null } | null)?.name ?? null },
      // O tablet não bate o ponto do próprio supervisor enquanto ele opera (decisão do plano).
      funcionarioDoSupervisorId: sessao.employee_id,
    });
  }

  const { data: emp } = await supabase.from('employees').select('name').eq('id', qr.employee_id as string).maybeSingle();
  const nome = (emp as { name: string } | null)?.name ?? '';
  return json({
    tipo: 'rosto',
    qrId: qr.id,
    employeeId: qr.employee_id,
    primeiroNome: nome.split(' ')[0] ?? '',
    modo: qr.mode,
    baterPonto: qr.bater_ponto,
    prazoCapturaMs: CAPTURA_PRAZO_MS,
  });
}

async function tabletSubmitFace(body: Body): Promise<Response> {
  const tablet = await carregarTablet(body);
  if (tablet instanceof Response) return tablet;
  const qrId = texto(body.qrId);
  if (!qrId) return json({ error: 'qrId obrigatório' }, 400);
  const { data, error } = await supabase
    .from('tablet_qr_tokens')
    .select('id, kind, status, session_id, employee_id, mode, read_by_device, read_at')
    .eq('id', qrId)
    .maybeSingle();
  if (error) return erroDeBanco('QR', error);
  const qr = data as {
    id: string; kind: string; status: string; session_id: string; employee_id: string | null; mode: string | null;
    read_by_device: string | null; read_at: string | null;
  } | null;
  if (!qr || qr.kind !== 'rosto' || qr.status !== 'lido' || qr.read_by_device !== tablet.id || !qr.employee_id) {
    return json({ error: MENSAGEM_QR }, 404);
  }
  if (!dentroDoPrazo(qr.read_at, CAPTURA_PRAZO_MS, Date.now())) {
    return json({ error: 'O tempo pra tirar o rosto acabou — gere outro código no celular.' }, 409);
  }

  const amostras = lerAmostras(body.amostras);
  if (!amostras) return json({ error: 'Rosto inválido.' }, 400);
  const maior = maiorDistanciaEntreAmostras(amostras);
  if (maior > AMOSTRAS_CONSISTENTES_ATE) {
    // A pessoa se mexeu ou trocou durante as fotos: não guarda nada, o tablet tira de novo.
    return json({ error: 'Fique parado olhando para a câmera.', motivo: 'mexeu', maiorDistancia: maior }, 422);
  }
  const foto = typeof body.foto === 'string' ? body.foto : '';
  if (!foto.startsWith('data:image/jpeg;base64,') || foto.length > FOTO_MAXIMA) return json({ error: 'Foto inválida.' }, 400);
  const media = mediaDasAmostras(amostras);

  const { data: proprioRow, error: pErr } = await supabase
    .from('employees').select('id, cpf, face_descriptor').eq('id', qr.employee_id).maybeSingle();
  if (pErr) return erroDeBanco('funcionário', pErr);
  const proprio = proprioRow as { id: string; cpf: string | null; face_descriptor: unknown } | null;
  if (!proprio) return json({ error: MENSAGEM_QR }, 404);

  // Duplicidade contra TODOS os rostos das empresas do tablet (a facial sem CPF procura nelas).
  const { data: rostos, error: rErr } = await supabase
    .from('employees')
    .select('id, name, cpf, face_descriptor, registration_status')
    .in('company_id', tablet.companyIds)
    .not('face_descriptor', 'is', null);
  if (rErr) return erroDeBanco('rostos cadastrados', rErr);
  const cadastrados: RostoCadastrado[] = [];
  for (const r of rostos ?? []) {
    const linha = r as { id: string; name: string; cpf: string | null; face_descriptor: unknown; registration_status: string };
    if (linha.registration_status === 'rejected') continue;
    const d = Array.isArray(linha.face_descriptor) ? (linha.face_descriptor as unknown[]).map(Number) : null;
    if (!d || d.length !== 128 || !d.every((n) => Number.isFinite(n))) continue;
    cadastrados.push({ id: linha.id, nome: linha.name, cpf: linha.cpf, descriptor: d });
  }
  const decisao = decidirRostoNovo(media, cadastrados, { id: proprio.id, cpf: proprio.cpf });
  const antigo = Array.isArray(proprio.face_descriptor) ? (proprio.face_descriptor as unknown[]).map(Number) : null;
  const qualidade = {
    maiorDistanciaEntreFotos: Number(maior.toFixed(4)),
    resultado: decisao.resultado,
    parecidoCom: decisao.maisParecido && decisao.resultado !== 'ok'
      ? { nome: decisao.maisParecido.nome, distancia: Number(decisao.maisParecido.distancia.toFixed(4)) }
      : null,
    distanciaDoRostoAntigo: qr.mode === 'refazer' && antigo && antigo.length === 128
      ? Number(distanciaEntre(media, antigo).toFixed(4))
      : null,
  };

  if (decisao.resultado === 'recusa') {
    // Parecido demais com OUTRA pessoa: não guarda o rosto; o supervisor vê com quem no celular.
    const { error: uErr } = await supabase
      .from('tablet_qr_tokens')
      .update({ status: 'recusado', quality: qualidade, decided_at: new Date().toISOString() })
      .eq('id', qr.id)
      .eq('status', 'lido');
    if (uErr) return erroDeBanco('recusar rosto', uErr);
    return json({ error: 'Esse rosto é muito parecido com o de outra pessoa já cadastrada. O supervisor vê no celular.', motivo: 'parecido' }, 409);
  }

  const { data: ganhou, error: cErr } = await supabase
    .from('tablet_qr_tokens')
    .update({
      status: 'capturado',
      captured_at: new Date().toISOString(),
      captured_descriptor: media,
      captured_thumb: foto,
      quality: qualidade,
    })
    .eq('id', qr.id)
    .eq('status', 'lido')
    .select('id');
  if (cErr) return erroDeBanco('guardar captura', cErr);
  if (!ganhou || ganhou.length === 0) return json({ error: MENSAGEM_QR }, 404);
  return json({ ok: true, aviso: decisao.resultado === 'aviso' });
}

async function tabletQrStatus(body: Body): Promise<Response> {
  const tablet = await carregarTablet(body);
  if (tablet instanceof Response) return tablet;
  const qrId = texto(body.qrId);
  if (!qrId) return json({ error: 'qrId obrigatório' }, 400);
  const { data, error } = await supabase
    .from('tablet_qr_tokens')
    .select('status, kind, employee_id, bater_ponto, read_at, captured_at, attempts')
    .eq('id', qrId)
    .eq('read_by_device', tablet.id)
    .maybeSingle();
  if (error) return erroDeBanco('QR', error);
  const qr = data as {
    status: string; kind: string; employee_id: string | null; bater_ponto: boolean; read_at: string | null;
    captured_at: string | null; attempts: number;
  } | null;
  if (!qr) return json({ error: MENSAGEM_QR }, 404);
  const agora = Date.now();
  let status = qr.status;
  if (status === 'lido' && qr.kind === 'rosto' && !dentroDoPrazo(qr.read_at, CAPTURA_PRAZO_MS, agora)) status = 'vencido';
  if (status === 'capturado' && !dentroDoPrazo(qr.captured_at, CONFIRMA_PRAZO_MS, agora)) status = 'vencido';
  // Nada de CPF nem rosto aqui: só o que a tela do tablet precisa pra seguir.
  return json({ status, employeeId: qr.employee_id, baterPonto: qr.bater_ponto, tentativas: qr.attempts });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => null) as Body | null;
    if (!body || typeof body.action !== 'string') return json({ error: 'Body must include "action" string' }, 400);
    switch (body.action) {
      case 'supervisor-login': return await supervisorLogin(body);
      case 'supervisor-logout': return await supervisorLogout(body);
      case 'create-pair-qr': return await createPairQr(body);
      case 'qr-status': return await qrStatus(body);
      case 'list-employees': return await listEmployees(body);
      case 'list-function-roles': return await listFunctionRoles(body);
      case 'create-employee': return await createEmployee(body);
      case 'create-face-qr': return await createFaceQr(body);
      case 'confirm-face': return await confirmFace(body);
      case 'tablet-read-qr': return await tabletReadQr(body);
      case 'tablet-submit-face': return await tabletSubmitFace(body);
      case 'tablet-qr-status': return await tabletQrStatus(body);
      default: return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('[ponto-supervisor-api] unhandled:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
