/**
 * Servico da aba "Pagamentos Driver" (iMile CTGA) — pagamento quinzenal por pacote.
 *
 * Namespace de tabelas: driverpay_* (isolado do produto SPX que divide o mesmo
 * projeto Supabase). Toda query e escopada por company_id (RLS + filtro explicito),
 * seguindo o padrao idiomatico do database.ts (supabase client unico, throw error cru,
 * companyId explicito, Number() nos numericos).
 *
 * Seguranca: RLS ja isola por empresa + mestre (9999/2626). Escritas sensiveis passam
 * por `ensurePerm` (espelha validatePermission de database.ts usando os helpers exportados).
 * O ciclo concluir->imutavel e reforcado no banco (trigger + RPC SECURITY DEFINER).
 */
import { supabase } from '../lib/supabase';
import { getUserPermissions, hasPermission as checkPermission } from './permissions';
import { isMaster, isDriverpayPermission, canAccessDriverpay } from '../config/masters';
import type { ImportResolvedItem, ImportApplyResult } from '../utils/driverImportApply';
import { missingImportPlatforms } from '../utils/driverImportApply';
import { mirrorPlatformKey, sanitizeMirrorKeyForPath } from '../components/driverpay/driverPayShared';
import type { ProofRequest, PaymentMark } from '../components/driverpay/driverPayShared';
import { statusPorQuantidade, taxasDePlataformasQueExistem } from '../components/driverpay/driverPayShared';
import { orphanProofPaths, proofFileName, isKeptProof, type ProofSlot } from '../utils/discountProofs';
import { saldoDevedorDoPeriodo, type SaldoQuinzenaFechada } from '../utils/descontoSaldo';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type DriverPeriodStatus = 'aberto' | 'concluido';

export interface Driver {
  id: string;
  company_id: string;
  name: string;
  route: string | null;
  pix_key: string | null;
  cpf: string | null;
  phone: string | null;
  /** Quem recebe POR este driver nos relatórios (ex.: esposa emite a nota). Null = ele mesmo. */
  recebedor_nome: string | null;
  /** Chave PIX do recebedor. Null = usa a pix_key do próprio driver. */
  recebedor_pix: string | null;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverPlatform {
  id: string;
  company_id: string;
  name: string;
  default_rate: number;
  sort_order: number;
  active: boolean;
  /** Cor (HEX) do nome no cabecalho da grade; null = cor padrao (cinza). */
  color: string | null;
  /** Espelhos: coluna/linha da plataforma destacada em amarelo (so onde ha pacotes). */
  highlight_mirror: boolean;
  /** Espelhos: aviso grande da plataforma (acoplado ao destaque; so onde ha pacotes). */
  mirror_notice: string | null;
  /** Espelhos: valor da plataforma sai numa faixa separada, FORA do total exibido (acoplado ao destaque). */
  mirror_separate_value: boolean;
  /** Nota Fiscal (Fase 3): CNPJ/emitente que fatura esta plataforma (null = nao vinculada). */
  nota_emitter_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** Aviso de corte das notas (faixa amarela dos espelhos) — 1 por empresa. */
export interface MirrorCutoffNotice {
  cutoff_time: string;
  cutoff_date: string;
  late_payment_date: string;
}

export interface DriverPlatformRate {
  id: string;
  company_id: string;
  driver_id: string;
  platform_id: string;
  rate: number;
  updated_by: string | null;
  updated_at: string;
}

export interface DriverGroup {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  default_rate: number | null;
  /** Fase 4: líder do grupo — só ele recebe o PDF do grupo publicado no app (null = sem líder). */
  leader_driver_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DriverPaymentPeriod {
  id: string;
  company_id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  status: DriverPeriodStatus;
  concluded_at: string | null;
  concluded_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DriverPaymentPackage {
  id: string;
  company_id: string;
  payment_id: string;
  platform_name: string;
  route: string;
  packages: number;
  rate_snapshot: number;
  created_at: string;
}

export interface DriverDiscount {
  id: string;
  company_id: string;
  payment_id: string;
  amount: number;
  package_code: string | null;
  observation: string | null;
  /** Marca do pacote no desconto: 'PNR' | 'LOST' | null (sem marca). */
  package_status: 'PNR' | 'LOST' | null;
  /** Caminhos das ate 2 imagens de prova no bucket driverpay-discount-proofs (null = sem foto). */
  proof1_path: string | null;
  proof2_path: string | null;
  /** Caminho do video de prova (filmagem das cameras) no mesmo bucket (null = sem video). */
  proof_video_path: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DriverVale {
  id: string;
  company_id: string;
  payment_id: string;
  amount: number;
  vale_date: string | null;
  observation: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DriverZapex {
  id: string;
  company_id: string;
  payment_id: string;
  code: string;
  delivery_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DriverPayment {
  id: string;
  company_id: string;
  period_id: string;
  driver_id: string;
  driver_name_snapshot: string;
  route_snapshot: string | null;
  total_packages_amount: number;
  total_discounts: number;
  total_vales: number;
  total_net: number;
  zapex_rate: number;
  total_zapex: number;
  nota_fiscal_recebida: boolean;
  espelho_conferido: boolean;
  /** Quem marcou/desmarcou por último: id de usuário, 'auto', ou null (nunca tocado). */
  espelho_conferido_by: string | null;
  created_at: string;
  updated_at: string;
  // joins opcionais (embutidos via select aninhado)
  packages?: DriverPaymentPackage[];
  discounts?: DriverDiscount[];
  vales?: DriverVale[];
  zapex?: DriverZapex[];
}

/** Linha do relatorio geral / grade, ja com grupo e agregados por plataforma. */
export interface DriverPaymentRow extends DriverPayment {
  group_name: string | null;
  driver_active: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Converte o erro cru do PostgREST em um Error legivel (os catch das telas mostram
 * e.message no toast). O objeto de erro do supabase-js NAO e instanceof Error no
 * bundle, entao sem esta conversao os catch caiam na mensagem generica e escondiam
 * a causa real — ex.: sessao expirada (JWT vencido, HTTP 401) aparecia so como
 * "Erro ao renomear grupo" (bug real em prod, 2026-07-18).
 */
export const throwDbError = (error: { message?: string; code?: string }): never => {
  const msg = error.message ?? '';
  if (error.code === 'PGRST301' || (/jwt/i.test(msg) && /expired|invalid/i.test(msg))) {
    throw new Error('Sessão expirada — saia e faça login novamente para continuar.');
  }
  if (error.code === '23505' || /duplicate key/i.test(msg)) {
    throw new Error('Já existe um registro com esse nome.');
  }
  throw new Error(msg || 'Erro de comunicação com o banco de dados.');
};

/** Espelha validatePermission (privado no database.ts) com os helpers exportados. */
async function ensurePerm(userId: string, permission: string): Promise<void> {
  // Modulo Pagamentos Driver e EXCLUSIVO do 2626 (nem 9999). Acima do bypass de mestre.
  if (isDriverpayPermission(permission)) {
    if (canAccessDriverpay(userId)) return;
    throw new Error('Apenas o usuário mestre 2626 pode acessar Pagamentos Driver');
  }
  if (isMaster(userId)) return;
  const perms = await getUserPermissions(userId);
  if (!perms || !checkPermission(perms, permission)) {
    throw new Error(`Você não tem permissão para: ${permission}`);
  }
}

function mapDriver(r: Record<string, unknown>): Driver {
  return { ...(r as unknown as Driver) };
}
function mapPlatform(r: Record<string, unknown>): DriverPlatform {
  return {
    ...(r as unknown as DriverPlatform),
    default_rate: num(r.default_rate),
    sort_order: num(r.sort_order),
    color: (r.color as string | null) ?? null,
    highlight_mirror: Boolean(r.highlight_mirror),
    mirror_notice: (r.mirror_notice as string | null) ?? null,
    mirror_separate_value: Boolean(r.mirror_separate_value),
    nota_emitter_id: (r.nota_emitter_id as string | null) ?? null,
  };
}
function mapPackage(r: Record<string, unknown>): DriverPaymentPackage {
  return { ...(r as unknown as DriverPaymentPackage), packages: num(r.packages), rate_snapshot: num(r.rate_snapshot) };
}
function mapDiscount(r: Record<string, unknown>): DriverDiscount {
  return { ...(r as unknown as DriverDiscount), amount: num(r.amount) };
}
function mapVale(r: Record<string, unknown>): DriverVale {
  return { ...(r as unknown as DriverVale), amount: num(r.amount) };
}
function mapZapex(r: Record<string, unknown>): DriverZapex {
  return { ...(r as unknown as DriverZapex) };
}
function mapPayment(r: Record<string, unknown>): DriverPayment {
  const p = r as Record<string, unknown>;
  return {
    ...(p as unknown as DriverPayment),
    total_packages_amount: num(p.total_packages_amount),
    total_discounts: num(p.total_discounts),
    total_vales: num(p.total_vales),
    total_net: num(p.total_net),
    zapex_rate: num(p.zapex_rate),
    total_zapex: num(p.total_zapex),
    nota_fiscal_recebida: Boolean(p.nota_fiscal_recebida),
    espelho_conferido: Boolean(p.espelho_conferido),
    espelho_conferido_by: (p.espelho_conferido_by as string | null) ?? null,
    packages: Array.isArray(p.packages) ? (p.packages as Record<string, unknown>[]).map(mapPackage) : undefined,
    discounts: Array.isArray(p.discounts) ? (p.discounts as Record<string, unknown>[]).map(mapDiscount) : undefined,
    vales: Array.isArray(p.vales) ? (p.vales as Record<string, unknown>[]).map(mapVale) : undefined,
    zapex: Array.isArray(p.zapex) ? (p.zapex as Record<string, unknown>[]).map(mapZapex) : undefined,
  };
}

// ─── Drivers (cadastro / busca / filtro) ─────────────────────────────────────

export const getDrivers = async (
  companyId: string,
  opts?: { search?: string; route?: string; activeOnly?: boolean }
): Promise<Driver[]> => {
  let query = supabase.from('driverpay_drivers').select('*').eq('company_id', companyId);
  if (opts?.activeOnly) query = query.eq('active', true);
  if (opts?.route) query = query.eq('route', opts.route);
  if (opts?.search) query = query.ilike('name', `%${opts.search}%`);
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throwDbError(error);
  return (data || []).map(mapDriver);
};

export const getDriverRoutes = async (companyId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('driverpay_drivers')
    .select('route')
    .eq('company_id', companyId)
    .not('route', 'is', null);
  if (error) throwDbError(error);
  const set = new Set<string>();
  (data || []).forEach((r: Record<string, unknown>) => {
    const route = (r.route as string | null)?.trim();
    if (route) set.add(route);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

/**
 * Garante que o driver tenha um pagamento (zerado) em TODOS os períodos ABERTOS da empresa.
 * A grade da aba é montada a partir dos pagamentos do período — sem isso, um driver criado
 * DEPOIS que o período foi aberto não aparece na grade (nem o grupo dele). Idempotente:
 * só insere onde ainda não existe pagamento (período, driver).
 */
async function ensureDriverInOpenPeriods(
  companyId: string,
  driverId: string,
  driverName: string,
  route: string | null,
): Promise<void> {
  const { data: openPeriods, error: perErr } = await supabase
    .from('driverpay_periods')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'aberto');
  if (perErr) throwDbError(perErr);
  if (!openPeriods || openPeriods.length === 0) return;

  const { data: existing } = await supabase
    .from('driverpay_payments')
    .select('period_id')
    .eq('company_id', companyId)
    .eq('driver_id', driverId);
  const has = new Set((existing ?? []).map((p) => (p as { period_id: string }).period_id));

  const rows = openPeriods
    .filter((p) => !has.has(p.id as string))
    .map((p) => ({
      company_id: companyId,
      period_id: p.id as string,
      driver_id: driverId,
      driver_name_snapshot: driverName,
      route_snapshot: route,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('driverpay_payments').insert(rows);
  if (error) throwDbError(error);
}

export const createDriver = async (
  companyId: string,
  userId: string,
  data: { name: string; route?: string | null; pix_key?: string | null; cpf?: string | null; phone?: string | null; notes?: string | null; recebedor_nome?: string | null; recebedor_pix?: string | null }
): Promise<Driver> => {
  await ensurePerm(userId, 'driverpay.createDriver');
  const { data: row, error } = await supabase
    .from('driverpay_drivers')
    .insert([{
      company_id: companyId,
      name: data.name.trim(),
      route: data.route ?? null,
      pix_key: data.pix_key ?? null,
      cpf: data.cpf ?? null,
      phone: data.phone ?? null,
      recebedor_nome: data.recebedor_nome ?? null,
      recebedor_pix: data.recebedor_pix ?? null,
      notes: data.notes ?? null,
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throwDbError(error);
  const driver = mapDriver(row);
  // Entra automaticamente nos períodos abertos (pacotes zerados) pra aparecer na grade já.
  await ensureDriverInOpenPeriods(companyId, driver.id, driver.name, driver.route);
  return driver;
};

/**
 * Cadastra o entregador E as taxas dele como UMA COISA SÓ: ou grava tudo, ou não grava nada.
 *
 * 🔴 POR QUE EXISTE (05/08/2026): antes eram dois passos soltos — criava o entregador e
 * DEPOIS gravava as taxas num laço. Quando o 2º passo falhava, o 1º já estava gravado: a
 * tela mostrava erro, o Victor clicava de novo, e cada clique criava outro cadastro.
 * O Othon Saraiva Freitas virou **3 entregadores**. (A falha em si: o painel estava com uma
 * plataforma na memória que já não existia no banco.)
 *
 * DUAS PROTEÇÕES:
 *  1) peneira as taxas contra as plataformas que existem AGORA no banco — mata a causa;
 *  2) se ainda assim algo falhar, DESFAZ o que acabou de criar (taxas → pagamentos →
 *     entregador), pra a tela voltar exatamente ao estado de antes do clique. Assim,
 *     clicar de novo nunca duplica.
 *
 * O desfazer é seguro porque o entregador acabou de nascer: os pagamentos que o
 * `ensureDriverInOpenPeriods` cria vêm zerados, sem pacote, desconto ou vale.
 */
export const createDriverWithRates = async (
  companyId: string,
  userId: string,
  data: Parameters<typeof createDriver>[2],
  taxas: readonly { platformId: string; rate: number }[],
): Promise<{ driver: Driver; fantasmas: number }> => {
  // 1) A verdade do banco AGORA — não o que a tela tem na memória desde ontem.
  const plataformas = await getPlatforms(companyId, false);
  const { validas, fantasmas } = taxasDePlataformasQueExistem(taxas, plataformas);

  const driver = await createDriver(companyId, userId, data);
  try {
    for (const t of validas) {
      await upsertDriverRate(companyId, driver.id, t.platformId, t.rate, userId);
    }
  } catch (e) {
    // 2) Desfaz o que acabou de ser criado. Se o desfazer falhar, avisa dos DOIS problemas —
    // esconder um cadastro órfão seria pior que a mensagem feia.
    try {
      await supabase.from('driverpay_platform_rates').delete().eq('driver_id', driver.id);
      await supabase.from('driverpay_payments').delete().eq('driver_id', driver.id);
      await supabase.from('driverpay_drivers').delete().eq('id', driver.id);
    } catch (limpeza) {
      console.error('Falha ao desfazer o cadastro incompleto:', limpeza);
      throw new Error(
        'Não consegui salvar os valores por pacote e também não consegui desfazer o cadastro. ' +
        `O entregador "${driver.name}" pode ter ficado sem os valores — confira antes de cadastrar de novo.`,
      );
    }
    console.error('Erro ao salvar as taxas do driver:', e);
    throw new Error(
      'Não consegui salvar os valores por pacote, então o cadastro foi desfeito (nada ficou pela metade). ' +
      'Atualize a página (F5) e tente de novo — a lista de plataformas pode estar desatualizada.',
    );
  }
  return { driver, fantasmas: fantasmas.length };
};

export const updateDriver = async (
  id: string,
  userId: string,
  updates: Partial<Pick<Driver, 'name' | 'route' | 'pix_key' | 'cpf' | 'phone' | 'active' | 'notes' | 'recebedor_nome' | 'recebedor_pix'>>
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_drivers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throwDbError(error);
};

export const setDriverActive = async (id: string, active: boolean, userId: string): Promise<void> => {
  await ensurePerm(userId, active ? 'driverpay.editDriver' : 'driverpay.deleteDriver');
  const { error } = await supabase
    .from('driverpay_drivers')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throwDbError(error);
};

// ─── Plataformas (eMile/ANJUN + custom) ──────────────────────────────────────

export const getPlatforms = async (companyId: string, onlyActive = true): Promise<DriverPlatform[]> => {
  let query = supabase.from('driverpay_platforms').select('*').eq('company_id', companyId);
  if (onlyActive) query = query.eq('active', true);
  const { data, error } = await query.order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (error) throwDbError(error);
  return (data || []).map(mapPlatform);
};

export const createPlatform = async (
  companyId: string,
  userId: string,
  data: { name: string; default_rate?: number; sort_order?: number; color?: string | null }
): Promise<DriverPlatform> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  const { data: row, error } = await supabase
    .from('driverpay_platforms')
    .insert([{
      company_id: companyId,
      name: data.name.trim(),
      default_rate: data.default_rate ?? 2.0,
      sort_order: data.sort_order ?? 0,
      color: data.color ?? null,
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throwDbError(error);
  return mapPlatform(row);
};

export const updatePlatform = async (
  id: string,
  userId: string,
  updates: Partial<
    Pick<
      DriverPlatform,
      'name' | 'default_rate' | 'sort_order' | 'active' | 'color' | 'highlight_mirror' | 'mirror_notice' | 'mirror_separate_value'
    >
  >
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  const { error } = await supabase.from('driverpay_platforms').update(updates).eq('id', id);
  if (error) throwDbError(error);
};

// ─── Emitentes (CNPJs) de nota fiscal — Fase 3 ───────────────────────────────

/** Um CNPJ para o qual o driver emite nota (ex.: "iMile", "Shopee/Anjun/Loggi"). */
export interface DriverNotaEmitter {
  id: string;
  company_id: string;
  cnpj: string;
  label: string;
  sort_order: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export const getNotaEmitters = async (companyId: string, onlyActive = true): Promise<DriverNotaEmitter[]> => {
  let query = supabase.from('driverpay_nota_emitters').select('*').eq('company_id', companyId);
  if (onlyActive) query = query.eq('active', true);
  const { data, error } = await query.order('sort_order', { ascending: true }).order('label', { ascending: true });
  if (error) throwDbError(error);
  return (data ?? []) as DriverNotaEmitter[];
};

export const createNotaEmitter = async (
  companyId: string,
  userId: string,
  data: { cnpj: string; label: string; sort_order?: number },
): Promise<DriverNotaEmitter> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  const { data: row, error } = await supabase
    .from('driverpay_nota_emitters')
    .insert([{
      company_id: companyId,
      cnpj: data.cnpj.trim(),
      label: data.label.trim(),
      sort_order: data.sort_order ?? 0,
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throwDbError(error);
  return row as DriverNotaEmitter;
};

export const updateNotaEmitter = async (
  id: string,
  userId: string,
  updates: Partial<Pick<DriverNotaEmitter, 'cnpj' | 'label' | 'sort_order' | 'active'>>,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  const clean = { ...updates };
  if (typeof clean.cnpj === 'string') clean.cnpj = clean.cnpj.trim();
  if (typeof clean.label === 'string') clean.label = clean.label.trim();
  const { error } = await supabase.from('driverpay_nota_emitters').update(clean).eq('id', id);
  if (error) throwDbError(error);
};

/** Vincula (ou desvincula, com null) uma plataforma a um emitente/CNPJ. */
export const setPlatformNotaEmitter = async (
  platformId: string,
  userId: string,
  emitterId: string | null,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  const { error } = await supabase
    .from('driverpay_platforms')
    .update({ nota_emitter_id: emitterId })
    .eq('id', platformId);
  if (error) throwDbError(error);
};

// ─── Notas fiscais recebidas (painel) — Fase 3e ──────────────────────────────

/** Uma nota recebida (arquivo) com o driver e o CNPJ resolvidos, pro painel. */
export interface NotaFiscalFileRow {
  id: string;
  driverId: string;
  driverName: string;
  /** Recebedor configurado do driver (a NOTA vem no nome dele — ex.: esposa). Null = o próprio driver. */
  recebedorNome: string | null;
  emitterId: string;
  emitterLabel: string;
  emitterCnpj: string;
  filePath: string;
  fileType: string | null;
  originalFilename: string | null;
  /** 'recebida' (pendente) | 'validada' (conferida OK) | 'rejeitada' (errada, driver reenvia). */
  status: string;
  /** Motivo da recusa (só quando status='rejeitada') — mostrado pro driver no app. */
  rejectReason: string | null;
  uploadedAt: string;
  /** Conferência automática (v8): ok | divergente | ilegivel | pendente | null (anterior à feature). */
  checkStatus: string | null;
  /** null = não deu pra conferir aquele item (ex.: sem espelho publicado). */
  checkValor: boolean | null;
  checkCnpj: boolean | null;
  checkNome: boolean | null;
  /** JSON com valores/CNPJs achados, candidatos esperados e motivos. */
  checkDetails: Record<string, unknown> | null;
  /** userId da validação manual; null quando auto (marcador: checkDetails.autoValidated). */
  validatedBy: string | null;
  /** Espelho que pediu esta nota (28/07). null = nota antiga / sem espelho publicado. */
  mirrorPlatformKey: string | null;
}

export const listNotaFiscalFiles = async (companyId: string, periodId: string): Promise<NotaFiscalFileRow[]> => {
  const { data, error } = await supabase
    .from('driverpay_nota_fiscal_files')
    .select('id, driver_id, nota_emitter_id, file_path, file_type, original_filename, status, reject_reason, uploaded_at, check_status, check_valor, check_cnpj, check_nome, check_details, validated_by, mirror_platform_key, driverpay_drivers(name, recebedor_nome), driverpay_nota_emitters(label, cnpj)')
    .eq('company_id', companyId)
    .eq('period_id', periodId)
    .order('uploaded_at', { ascending: true });
  if (error) throwDbError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const drvRaw = r.driverpay_drivers;
    const emRaw = r.driverpay_nota_emitters;
    const drv = (Array.isArray(drvRaw) ? drvRaw[0] : drvRaw) as { name?: string; recebedor_nome?: string | null } | null;
    const em = (Array.isArray(emRaw) ? emRaw[0] : emRaw) as { label?: string; cnpj?: string } | null;
    return {
      id: String(r.id),
      driverId: String(r.driver_id),
      driverName: drv?.name ?? '(sem nome)',
      recebedorNome: drv?.recebedor_nome ?? null,
      emitterId: String(r.nota_emitter_id),
      emitterLabel: em?.label ?? '',
      emitterCnpj: em?.cnpj ?? '',
      mirrorPlatformKey: (r.mirror_platform_key as string | null) ?? null,
      filePath: String(r.file_path),
      fileType: (r.file_type as string | null) ?? null,
      originalFilename: (r.original_filename as string | null) ?? null,
      status: (r.status as string) ?? 'recebida',
      rejectReason: (r.reject_reason as string | null) ?? null,
      uploadedAt: String(r.uploaded_at),
      checkStatus: (r.check_status as string | null) ?? null,
      checkValor: (r.check_valor as boolean | null) ?? null,
      checkCnpj: (r.check_cnpj as boolean | null) ?? null,
      checkNome: (r.check_nome as boolean | null) ?? null,
      checkDetails: (r.check_details as Record<string, unknown> | null) ?? null,
      validatedBy: (r.validated_by as string | null) ?? null,
    };
  });
};

/**
 * Auto-validação da NF (liga/desliga por empresa — decisão do Victor 26/07).
 * DESLIGADA, a conferência automática continua igual (selos + recusa de nota errada);
 * só a nota certa deixa de entrar 'validada' sozinha e espera validação manual.
 * Sem linha na tabela = LIGADA (padrão).
 */
export const getNfAutoValidate = async (companyId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('driverpay_settings')
    .select('nf_auto_validate')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throwDbError(error);
  return data?.nf_auto_validate !== false;
};

export const setNfAutoValidate = async (
  companyId: string,
  enabled: boolean,
  userId: string,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase.from('driverpay_settings').upsert(
    { company_id: companyId, nf_auto_validate: enabled, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'company_id' },
  );
  if (error) throwDbError(error);
};

/**
 * Valida / recusa / reabre uma nota anexada pelo driver. 'validada' conta pra NF ficar
 * verde; 'rejeitada' (com motivo opcional) faz o driver reenviar (o slot reabre no app).
 * Só o mestre (RLS FOR ALL + ensurePerm) mexe. Não apaga o arquivo — muda o status.
 */
export const setNotaFiscalStatus = async (
  fileId: string,
  status: 'recebida' | 'validada' | 'rejeitada',
  userId: string,
  reason?: string | null,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const patch: Record<string, unknown> = {
    status,
    validated_at: status === 'validada' ? new Date().toISOString() : null,
    validated_by: status === 'validada' ? userId : null,
    reject_reason: status === 'rejeitada' ? (reason?.trim() || null) : null,
  };
  const { error } = await supabase.from('driverpay_nota_fiscal_files').update(patch).eq('id', fileId);
  if (error) throwDbError(error);
};

/**
 * Exclui de vez uma nota anexada (ex.: nota errada) — registro E arquivo (19/08/2026;
 * o comentário antigo dizia que a "trava do storage" impedia apagar o arquivo, mas a
 * policy `driverpay_nf_master_all` é FOR ALL e cobre DELETE pro 2626/9999). O CNPJ
 * volta a aparecer como "faltando" no app pro driver reenviar.
 */
export const deleteNotaFiscalFile = async (fileId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { data: apagada, error } = await supabase
    .from('driverpay_nota_fiscal_files')
    .delete().eq('id', fileId)
    .select('file_path')
    .maybeSingle();
  if (error) throwDbError(error);
  // Linha primeiro, arquivo em melhor esforço (mesma regra do deleteDeliveryProof).
  const path = (apagada as { file_path?: string | null } | null)?.file_path;
  if (path) {
    const { error: rmErr } = await supabase.storage.from(NOTA_FISCAL_BUCKET).remove([path]);
    if (rmErr) console.warn('Não foi possível remover a nota do Storage:', rmErr.message);
  }
};

/** Bucket PRIVADO das notas fiscais anexadas pelo driver. */
const NOTA_FISCAL_BUCKET = 'driverpay-nota-fiscais';

/** Link assinado (bucket privado) pra ver/baixar uma nota. TTL curto. */
export const notaFiscalFileUrl = async (path: string, expiresSec = 300): Promise<string> => {
  const { data, error } = await supabase.storage.from(NOTA_FISCAL_BUCKET).createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) throw new Error(`Falha ao gerar link da nota${error ? ': ' + error.message : ''}`);
  return data.signedUrl;
};

// ─── Aviso de corte das notas (faixa dos espelhos; 1 linha por empresa) ──────

export const getMirrorCutoffNotice = async (companyId: string): Promise<MirrorCutoffNotice | null> => {
  const { data, error } = await supabase
    .from('driverpay_mirror_notice')
    .select('cutoff_time, cutoff_date, late_payment_date')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throwDbError(error);
  return (data as MirrorCutoffNotice | null) ?? null;
};

/** Salva/atualiza o aviso de corte — chamado automaticamente ao gerar espelho. */
export const saveMirrorCutoffNotice = async (
  companyId: string,
  notice: MirrorCutoffNotice,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.generateMirror');
  const { error } = await supabase
    .from('driverpay_mirror_notice')
    .upsert([{ company_id: companyId, ...notice, updated_by: userId, updated_at: new Date().toISOString() }], {
      onConflict: 'company_id',
    });
  if (error) throwDbError(error);
};

/**
 * Renomeia a plataforma E reconecta os pacotes (driverpay_payment_packages guarda o
 * NOME da plataforma, nao o id). Sem isso, renomear deixaria os pacotes orfaos e eles
 * sairiam da soma (o calculo casa por nome ativo). No-op se o nome nao mudou.
 */
export const renamePlatform = async (
  companyId: string,
  platformId: string,
  newName: string,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  const trimmed = newName.trim();
  const { data: cur, error: selErr } = await supabase
    .from('driverpay_platforms')
    .select('name')
    .eq('id', platformId)
    .eq('company_id', companyId)
    .single();
  if (selErr) throwDbError(selErr);
  const oldName = (cur as { name: string } | null)?.name;
  if (!oldName || oldName === trimmed) {
    if (oldName !== trimmed) {
      const { error } = await supabase.from('driverpay_platforms').update({ name: trimmed }).eq('id', platformId);
      if (error) throwDbError(error);
    }
    return;
  }
  const { error: pErr } = await supabase.from('driverpay_platforms').update({ name: trimmed }).eq('id', platformId);
  if (pErr) throwDbError(pErr);
  const { error: pkErr } = await supabase
    .from('driverpay_payment_packages')
    .update({ platform_name: trimmed })
    .eq('company_id', companyId)
    .eq('platform_name', oldName);
  if (pkErr) throwDbError(pkErr);
};

/** Arquiva/reativa varias plataformas (active=false/true). Nao apaga nada. */
export const setPlatformsActive = async (
  ids: string[],
  active: boolean,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  if (ids.length === 0) return;
  const { error } = await supabase.from('driverpay_platforms').update({ active }).in('id', ids);
  if (error) throwDbError(error);
};

/** Adiciona a plataforma "em massa" a todos os drivers ativos (cria rate = default). */
export const applyPlatformToAllDrivers = async (
  companyId: string,
  platformId: string,
  rate: number,
  userId: string
): Promise<number> => {
  await ensurePerm(userId, 'driverpay.managePlatforms');
  const drivers = await getDrivers(companyId, { activeOnly: true });
  if (drivers.length === 0) return 0;
  const rows = drivers.map((d) => ({
    company_id: companyId,
    driver_id: d.id,
    platform_id: platformId,
    rate,
    updated_by: userId,
  }));
  const { error } = await supabase
    .from('driverpay_platform_rates')
    .upsert(rows, { onConflict: 'driver_id,platform_id' });
  if (error) throwDbError(error);
  return rows.length;
};

// ─── Taxa por driver x plataforma ────────────────────────────────────────────

export const getDriverRates = async (driverId: string): Promise<DriverPlatformRate[]> => {
  const { data, error } = await supabase
    .from('driverpay_platform_rates')
    .select('*')
    .eq('driver_id', driverId);
  if (error) throwDbError(error);
  return (data || []).map((r) => ({ ...(r as unknown as DriverPlatformRate), rate: num((r as Record<string, unknown>).rate) }));
};

/**
 * Config de valor/pacote de TODOS os drivers (driverpay_platform_rates), como mapa
 * driverId -> { plataforma: taxa }. A grade usa isto para, em periodo ABERTO, a taxa
 * padrao de cada driver seguir a config do perfil dele (nao o default da plataforma).
 */
export const getAllDriverRates = async (
  companyId: string,
): Promise<Record<string, Record<string, number>>> => {
  const { data, error } = await supabase
    .from('driverpay_platform_rates')
    .select('driver_id, rate, platform:driverpay_platforms(name)')
    .eq('company_id', companyId);
  if (error) throwDbError(error);
  const map: Record<string, Record<string, number>> = {};
  (data ?? []).forEach((r) => {
    const row = r as Record<string, unknown>;
    const driverId = row.driver_id as string;
    const plat = row.platform as { name?: string } | null;
    const rate = num(row.rate);
    if (driverId && plat?.name) {
      (map[driverId] ??= {})[plat.name] = rate;
    }
  });
  return map;
};

export const upsertDriverRate = async (
  companyId: string,
  driverId: string,
  platformId: string,
  rate: number,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.configRate');
  const { error } = await supabase
    .from('driverpay_platform_rates')
    .upsert(
      [{ company_id: companyId, driver_id: driverId, platform_id: platformId, rate, updated_by: userId, updated_at: new Date().toISOString() }],
      { onConflict: 'driver_id,platform_id' }
    );
  if (error) throwDbError(error);
};

/**
 * Taxa/pacote padrao do driver, por plataforma, herdada do ULTIMO pagamento dele.
 * Serve para pre-preencher a rate ao adicionar uma nova rota / um novo driver sem
 * cair no fixo (2,00): pega o rate_snapshot mais recente de cada plataforma no
 * pagamento mais recente do driver. A quinzena aberta ja vem pre-carregada com o
 * snapshot do ultimo periodo concluido (RPC driverpay_conclude_period), entao ler o
 * pagamento mais recente ja reflete "a ultima taxa usada". Fallback: taxas fixas
 * configuradas em driverpay_platform_rates; se nao houver nada, retorna {}.
 */
/**
 * PRIORIDADE por plataforma (fix do bug das taxas do import, 2026-07-18):
 *   1) taxa individual CONFIGURADA no cadastro (driverpay_platform_rates) — o que
 *      o usuário definiu é a verdade;
 *   2) "última taxa usada" (rate_snapshot do pagamento mais recente) — cobre
 *      driver sem config naquela plataforma;
 *   3) (no chamador) default da plataforma.
 * A versão anterior retornava CEDO com qualquer snapshot achado: driver com só a
 * SHOPEE lançada importava eMile/ANJUN pelo default da plataforma, IGNORANDO a
 * config individual (33 lançamentos errados em 18/07 — R$ 1.186,70 a menos).
 */
export const getDriverDefaultRates = async (
  companyId: string,
  driverId: string
): Promise<Record<string, number>> => {
  // "Última taxa usada": pacotes do pagamento mais recente do driver.
  const lastUsed: Record<string, number> = {};
  const { data: payRows, error: payErr } = await supabase
    .from('driverpay_payments')
    .select('id, packages:driverpay_payment_packages(platform_name, rate_snapshot, created_at)')
    .eq('company_id', companyId)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (payErr) throwDbError(payErr);

  const latest = (payRows || [])[0] as { packages?: Record<string, unknown>[] } | undefined;
  const pkgs = latest?.packages;
  if (Array.isArray(pkgs) && pkgs.length > 0) {
    // ordena por created_at asc: o pacote mais recente de cada plataforma sobrescreve.
    const ordered = [...pkgs].sort((a, b) =>
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    );
    for (const row of ordered) {
      const name = typeof row.platform_name === 'string' ? row.platform_name : '';
      const rate = num(row.rate_snapshot);
      if (name && rate > 0) lastUsed[name] = rate;
    }
  }

  // Config individual explícita do cadastro (SEMPRE consultada — sem early-return).
  const config: Record<string, number> = {};
  const { data: rateRows, error: rateErr } = await supabase
    .from('driverpay_platform_rates')
    .select('rate, platform:driverpay_platforms(name)')
    .eq('company_id', companyId)
    .eq('driver_id', driverId);
  if (rateErr) throwDbError(rateErr);
  (rateRows || []).forEach((r: Record<string, unknown>) => {
    const plat = r.platform as { name?: string } | null;
    const rate = num(r.rate);
    if (plat?.name && rate > 0) config[plat.name] = rate;
  });

  return mergeDriverRatePriority(config, lastUsed);
};

/**
 * Config individual explícita GANHA da última taxa usada, plataforma a plataforma
 * (função pura — regressão em tests/unit/driverPayImportRates.spec.ts).
 */
export const mergeDriverRatePriority = (
  config: Record<string, number>,
  lastUsed: Record<string, number>
): Record<string, number> => ({ ...lastUsed, ...config });

// ─── Grupos ──────────────────────────────────────────────────────────────────

export const getGroups = async (companyId: string): Promise<DriverGroup[]> => {
  const { data, error } = await supabase
    .from('driverpay_groups')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) throwDbError(error);
  return (data || []).map((r) => ({ ...(r as unknown as DriverGroup), default_rate: r.default_rate == null ? null : num(r.default_rate) }));
};

export const createGroup = async (
  companyId: string,
  userId: string,
  data: { name: string; description?: string | null; default_rate?: number | null }
): Promise<DriverGroup> => {
  await ensurePerm(userId, 'driverpay.manageGroups');
  const { data: row, error } = await supabase
    .from('driverpay_groups')
    .insert([{ company_id: companyId, name: data.name.trim(), description: data.description ?? null, default_rate: data.default_rate ?? null, created_by: userId }])
    .select()
    .single();
  if (error) throwDbError(error);
  return { ...(row as unknown as DriverGroup), default_rate: row.default_rate == null ? null : num(row.default_rate) };
};

export const updateGroup = async (
  id: string,
  userId: string,
  updates: Partial<Pick<DriverGroup, 'name' | 'description' | 'default_rate'>>
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageGroups');
  const { error } = await supabase.from('driverpay_groups').update(updates).eq('id', id);
  if (error) throwDbError(error);
};

export const deleteGroup = async (id: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageGroups');
  const { error } = await supabase.from('driverpay_groups').delete().eq('id', id);
  if (error) throwDbError(error);
};

/** Define (ou remove, com null) o líder do grupo — quem recebe o PDF do grupo no app (Fase 4). */
export const setGroupLeader = async (groupId: string, userId: string, driverId: string | null): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageGroups');
  const { error } = await supabase.from('driverpay_groups').update({ leader_driver_id: driverId }).eq('id', groupId);
  if (error) throwDbError(error);
};

export const getGroupMembers = async (groupId: string): Promise<string[]> => {
  const { data, error } = await supabase.from('driverpay_group_members').select('driver_id').eq('group_id', groupId);
  if (error) throwDbError(error);
  return (data || []).map((r: Record<string, unknown>) => r.driver_id as string);
};

/** Retorna map driver_id -> group_name (para a grade mostrar o grupo de cada driver). */
export const getDriverGroupMap = async (companyId: string): Promise<Record<string, string>> => {
  const { data, error } = await supabase
    .from('driverpay_group_members')
    .select('driver_id, driverpay_groups(name)')
    .eq('company_id', companyId);
  if (error) throwDbError(error);
  const map: Record<string, string> = {};
  (data || []).forEach((r: Record<string, unknown>) => {
    const g = r.driverpay_groups as { name?: string } | null;
    if (g?.name) map[r.driver_id as string] = g.name;
  });
  return map;
};

export const addDriverToGroup = async (companyId: string, groupId: string, driverId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageGroups');
  const { error } = await supabase
    .from('driverpay_group_members')
    .upsert([{ company_id: companyId, group_id: groupId, driver_id: driverId }], { onConflict: 'group_id,driver_id' });
  if (error) throwDbError(error);
};

export const removeDriverFromGroup = async (groupId: string, driverId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageGroups');
  const { error } = await supabase.from('driverpay_group_members').delete().eq('group_id', groupId).eq('driver_id', driverId);
  if (error) throwDbError(error);
};

/** Aplica o valor/pacote do grupo a todos os membros (para a plataforma dada). */
/**
 * Aplica o valor/pacote do grupo a todos os membros E reflete nos pacotes já
 * lançados das quinzenas ABERTAS (fix 2026-07-18 — relato de usuário por áudio:
 * mudava o preço, a config ficava certa, mas painel/espelho continuavam no valor
 * velho). Mesma regra do planRateReapply (decisão de 04/07): só atualiza as rotas
 * que ainda usavam a taxa efetiva ANTIGA — rota com valor próprio é preservada.
 */
export const applyGroupRate = async (
  companyId: string,
  groupId: string,
  platformId: string,
  rate: number,
  userId: string
): Promise<number> => {
  await ensurePerm(userId, 'driverpay.manageGroups');
  const memberIds = await getGroupMembers(groupId);
  if (memberIds.length === 0) return 0;

  const { data: platRow, error: platErr } = await supabase
    .from('driverpay_platforms')
    .select('name')
    .eq('id', platformId)
    .single();
  if (platErr) throwDbError(platErr);
  const platformName = (platRow as { name: string }).name;

  // Grava a config nova de todos os membros + o default do grupo.
  const rows = memberIds.map((driverId) => ({ company_id: companyId, driver_id: driverId, platform_id: platformId, rate, updated_by: userId }));
  const { error } = await supabase.from('driverpay_platform_rates').upsert(rows, { onConflict: 'driver_id,platform_id' });
  if (error) throwDbError(error);
  await updateGroup(groupId, userId, { default_rate: rate });

  // ══════════════════════════════════════════════════════════════════════════
  // Reflete nos pacotes já lançados das quinzenas ABERTAS.
  //
  // ⚠️ MUDANÇA 05/08/2026 (relato do Victor: *"na config está 2.50, no grupo 2.5, mas
  // está 2 reais a LOGGI e não altera"*).
  //
  // Antes havia duas travas aqui, e as duas prendiam o caso certo:
  //  1. `if (oldRate === rate) continue` — se a config do membro JÁ estava no valor que
  //     você está aplicando, nem olhava os pacotes. Era exatamente o RODRIGO: config
  //     2,50, linha 2,00, apertar "Aplicar" não fazia nada;
  //  2. `.eq('rate_snapshot', oldRate)` — só trocava a linha que ainda estava no valor
  //     antigo, tratando qualquer outro valor como preço combinado daquela rota. Uma
  //     linha que ficou pra trás (veio da planilha no padrão da plataforma e depois a
  //     config subiu) não batia com nada e ficava presa pra sempre.
  //
  // Regra nova, dita por ele: **grupo com valor fixo manda em todas as plataformas dos
  // membros**. O botão "Aplicar" é uma ação explícita — quem aperta está declarando o
  // preço do grupo. Os preços combinados por rota que existem de verdade vivem em grupos
  // SEM valor fixo (conferido em produção: "Dom Lara", "Coleta", "LOGGI QUARTEL" — os
  // três em grupos com `default_rate` nulo), então nada deles passa por aqui.
  // ══════════════════════════════════════════════════════════════════════════
  let linhasAtualizadas = 0;
  for (const driverId of memberIds) {
    const { data: pays, error: payErr } = await supabase
      .from('driverpay_payments')
      .select('id, driverpay_periods!inner(status)')
      .eq('company_id', companyId)
      .eq('driver_id', driverId)
      .eq('driverpay_periods.status', 'aberto');
    if (payErr) throwDbError(payErr);
    for (const pay of pays || []) {
      const paymentId = (pay as { id: string }).id;
      const { data: mudadas, error: pkErr } = await supabase
        .from('driverpay_payment_packages')
        .update({ rate_snapshot: rate })
        .eq('payment_id', paymentId)
        .eq('platform_name', platformName)
        .neq('rate_snapshot', rate) // não reescreve o que já está certo
        .select('id');
      if (pkErr) throwDbError(pkErr);
      linhasAtualizadas += (mudadas ?? []).length;
      if ((mudadas ?? []).length > 0) await recomputePaymentTotals(paymentId);
    }
  }
  console.info(
    `[grupo] ${platformName} a ${rate}: ${rows.length} membro(s), ${linhasAtualizadas} linha(s) de pacote atualizada(s).`,
  );
  return rows.length;
};

// ─── Periodos (quinzenas) ────────────────────────────────────────────────────

export const getPeriods = async (companyId: string): Promise<DriverPaymentPeriod[]> => {
  const { data, error } = await supabase
    .from('driverpay_periods')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throwDbError(error);
  return (data || []) as DriverPaymentPeriod[];
};

export const getOpenPeriod = async (companyId: string): Promise<DriverPaymentPeriod | null> => {
  // Pode haver mais de um periodo aberto por empresa (a trava uq_driverpay_one_open_period
  // foi removida em 20260717 para permitir varios abertos). Retorna o mais recente aberto.
  const { data, error } = await supabase
    .from('driverpay_periods')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'aberto')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwDbError(error);
  return (data as DriverPaymentPeriod) ?? null;
};

/** Cria periodo via RPC (SECURITY DEFINER). Retorna o id do periodo novo. */
export const createPeriod = async (
  companyId: string,
  userId: string,
  label: string,
  startDate: string | null,
  endDate: string | null,
  preload = true
): Promise<string> => {
  await ensurePerm(userId, 'driverpay.managePeriods');
  const { data, error } = await supabase.rpc('driverpay_create_period', {
    p_company_id: companyId,
    p_user_id: userId,
    p_label: label,
    p_start: startDate,
    p_end: endDate,
    p_preload: preload,
  });
  if (error) throwDbError(error);
  return data as string;
};

/** Conclui o periodo (congela + gera proximo) via RPC. Retorna o id do proximo periodo. */
export const concludePeriod = async (
  periodId: string,
  companyId: string,
  userId: string,
  nextLabel: string,
  nextStart: string | null,
  nextEnd: string | null
): Promise<string> => {
  await ensurePerm(userId, 'driverpay.complete');
  const { data, error } = await supabase.rpc('driverpay_conclude_period', {
    p_period_id: periodId,
    p_company_id: companyId,
    p_user_id: userId,
    p_next_label: nextLabel,
    p_next_start: nextStart,
    p_next_end: nextEnd,
  });
  if (error) throwDbError(error);
  return data as string;
};

/** Conclui a quinzena SEM abrir a proxima (congela os totais + marca 'concluido'). */
export const concludePeriodOnly = async (periodId: string, companyId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.complete');
  const { error } = await supabase.rpc('driverpay_conclude_period_only', {
    p_period_id: periodId,
    p_company_id: companyId,
    p_user_id: userId,
  });
  if (error) throwDbError(error);
};

/** Reabre uma quinzena concluida (volta para 'aberto' e libera a edicao). So 2626. */
export const reopenPeriod = async (periodId: string, companyId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePeriods');
  const { error } = await supabase
    .from('driverpay_periods')
    .update({ status: 'aberto', concluded_at: null, concluded_by: null })
    .eq('id', periodId)
    .eq('company_id', companyId);
  if (error) throwDbError(error);
};

/** Edita rotulo e datas de uma quinzena (aberta ou concluida). So 2626. */
export const updatePeriod = async (
  periodId: string,
  companyId: string,
  userId: string,
  data: { label?: string; start?: string | null; end?: string | null },
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePeriods');
  const upd: Record<string, unknown> = {};
  if (data.label != null) upd.label = data.label;
  if (data.start !== undefined) upd.start_date = data.start;
  if (data.end !== undefined) upd.end_date = data.end;
  if (Object.keys(upd).length === 0) return;
  const { error } = await supabase.from('driverpay_periods').update(upd).eq('id', periodId).eq('company_id', companyId);
  if (error) throwDbError(error);
};

/** Exclui uma quinzena inteira (pagamentos + pacotes/descontos/vales via cascade + o periodo). So 2626. */
export const deletePeriod = async (periodId: string, companyId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.managePeriods');
  // Caminhos dos ARQUIVOS antes do delete (19/08/2026): o CASCADE apaga as linhas de
  // prints, notas e publicações do período, e sem isto os arquivos ficavam órfãos nos
  // buckets pra sempre (achado da limpeza de 280 órfãos acumulados).
  const [proofs, notas, pubs] = await Promise.all([
    supabase.from('driverpay_delivery_proofs').select('file_path').eq('period_id', periodId),
    supabase.from('driverpay_nota_fiscal_files').select('file_path').eq('period_id', periodId),
    supabase.from('driverpay_mirror_publications').select('pdf_path').eq('period_id', periodId),
  ]);
  const paths = (rows: { data: unknown } | null, col: string): string[] =>
    ((rows?.data ?? []) as Record<string, string | null>[])
      .map((r) => r[col])
      .filter((p): p is string => !!p);

  const { error: e1 } = await supabase
    .from('driverpay_payments')
    .delete()
    .eq('period_id', periodId)
    .eq('company_id', companyId);
  if (e1) throwDbError(e1);
  const { error: e2 } = await supabase.from('driverpay_periods').delete().eq('id', periodId).eq('company_id', companyId);
  if (e2) throwDbError(e2);

  // Arquivos em melhor esforço, DEPOIS do período sair (falhar aqui = órfão como
  // antes, nunca linha apontando pro nada). Lotes de 100 por folga do storage.
  const porBucket: Array<[string, string[]]> = [
    [PROOF_BUCKET, paths(proofs, 'file_path')],
    [NOTA_FISCAL_BUCKET, paths(notas, 'file_path')],
    [DRIVER_MIRRORS_BUCKET, paths(pubs, 'pdf_path')],
  ];
  for (const [bucket, lista] of porBucket) {
    for (let i = 0; i < lista.length; i += 100) {
      const { error: rmErr } = await supabase.storage.from(bucket).remove(lista.slice(i, i + 100));
      if (rmErr) console.warn(`Não foi possível remover arquivos do período (${bucket}):`, rmErr.message);
    }
  }
};

// ─── Pagamentos do periodo (grade) ───────────────────────────────────────────

export const getPayments = async (
  periodId: string,
  companyId: string
): Promise<DriverPayment[]> => {
  const { data, error } = await supabase
    .from('driverpay_payments')
    .select('*, packages:driverpay_payment_packages(*), discounts:driverpay_discounts(*), vales:driverpay_vales(*), zapex:driverpay_zapex(*)')
    .eq('period_id', periodId)
    .eq('company_id', companyId)
    .order('driver_name_snapshot', { ascending: true });
  if (error) throwDbError(error);
  return (data || []).map(mapPayment);
};

/** Cria (se faltar) e atualiza os pacotes de um driver por (plataforma, rota). */
export const upsertPackage = async (
  companyId: string,
  paymentId: string,
  platformName: string,
  route: string,
  packages: number,
  rateSnapshot: number,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_payment_packages')
    .upsert(
      [{ company_id: companyId, payment_id: paymentId, platform_name: platformName, route, packages, rate_snapshot: rateSnapshot }],
      { onConflict: 'payment_id,platform_name,route' }
    );
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

export const deletePackage = async (id: string, paymentId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase.from('driverpay_payment_packages').delete().eq('id', id);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

/**
 * Apaga TODOS os pacotes de uma rota por (payment_id, route) — sem depender dos ids
 * em cache no cliente. Robusto contra o estado local desatualizado de uma rota
 * recem-criada (cujos pacotes foram gravados via upsert sem refetch): a rota "removida"
 * some de verdade e nao reaparece no reload com o valor ainda no total. O company_id
 * reforca o isolamento ja garantido pela RLS.
 */
export const deletePackagesByRoute = async (
  companyId: string,
  paymentId: string,
  route: string,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_payment_packages')
    .delete()
    .eq('company_id', companyId)
    .eq('payment_id', paymentId)
    .eq('route', route);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

/**
 * Renomeia uma rota de forma ATOMICA: um unico UPDATE do campo `route` em todos os
 * pacotes daquela (payment_id, route). Preserva packages e rate_snapshot por rota,
 * sem janela de perda (nao ha delete+reinsert). Elimina o bug de rota-fantasma/duplicata
 * (que dependia de packageIds locais). Se o novo nome colidir com uma rota ja existente
 * do mesmo pagamento, o UNIQUE(payment_id, platform_name, route) barra o UPDATE inteiro
 * (rollback do statement) e o erro sobe para a UI — sem merge silencioso.
 */
export const renameRoutePackages = async (
  companyId: string,
  paymentId: string,
  fromRoute: string,
  toRoute: string,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_payment_packages')
    .update({ route: toRoute })
    .eq('company_id', companyId)
    .eq('payment_id', paymentId)
    .eq('route', fromRoute);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

/**
 * Marca/desmarca o recebimento das notas fiscais do driver naquele pagamento
 * (check do supervisor na grade). Registra quem marcou (nota_fiscal_by) e, quando
 * marcado, o timestamp (nota_fiscal_at); ao desmarcar, limpa o timestamp. Nao mexe
 * nos totais. O escopo por company_id (alem do id) reforca o isolamento ja garantido
 * pela RLS. O guard de periodo concluido nao bloqueia o mestre 2626 (unico com acesso
 * ao modulo), entao a NF pode ser conferida inclusive apos a conclusao.
 */
export const setNotaFiscal = async (
  companyId: string,
  paymentId: string,
  received: boolean,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_payments')
    .update({
      nota_fiscal_recebida: received,
      nota_fiscal_at: received ? new Date().toISOString() : null,
      nota_fiscal_by: userId,
    })
    .eq('id', paymentId)
    .eq('company_id', companyId);
  if (error) throwDbError(error);
};

/**
 * Marca/desmarca o "espelho conferido" deste pagamento — o operador confirmou que o
 * driver enviou o espelho e a quantidade bate com a planilha. Mesmo padrao da Nota
 * Fiscal: registra quem marcou (espelho_conferido_by) e o timestamp (espelho_conferido_at,
 * limpo ao desmarcar). Nao mexe nos totais. Pode ser marcado inclusive apos a conclusao.
 */
/**
 * Marca "espelho conferido" de quem NÃO ENTREGA na plataforma cobrada (05/08/2026).
 *
 * Decisão do Victor: com a planilha importada, quem ficou com ZERO pacote na plataforma
 * já não manda print — e isso **conta como validado**, senão a equipe fica clicando um por
 * um toda quinzena.
 *
 * Assina `'auto'` igual às outras marcações automáticas, e por isso **nunca passa por cima
 * de quem um humano tocou** (a trava é a mesma da edge function). Devolve quantos marcou.
 */
export const marcarEspelhoPorDispensa = async (
  companyId: string,
  paymentIds: readonly string[],
  userId: string,
): Promise<number> => {
  if (paymentIds.length === 0) return 0;
  await ensurePerm(userId, 'driverpay.editDriver');

  // Respeita o liga/desliga da confirmação automática — mesma chave da conferência do print.
  const { data: settings } = await supabase
    .from('driverpay_settings')
    .select('proof_auto_confirm')
    .eq('company_id', companyId)
    .maybeSingle();
  if (settings?.proof_auto_confirm === false) return 0; // sem linha = ligado (padrão)

  // Só quem NUNCA foi tocado por humano: `espelho_conferido_by` nulo ou 'auto'.
  const { data: atuais } = await supabase
    .from('driverpay_payments')
    .select('id, espelho_conferido, espelho_conferido_by')
    .eq('company_id', companyId)
    .in('id', [...paymentIds]);
  const alvos = (atuais ?? [])
    .filter((p) => !p.espelho_conferido)
    .filter((p) => !p.espelho_conferido_by || p.espelho_conferido_by === 'auto')
    .map((p) => p.id as string);
  if (alvos.length === 0) return 0;

  const { error } = await supabase
    .from('driverpay_payments')
    .update({
      espelho_conferido: true,
      espelho_conferido_at: new Date().toISOString(),
      espelho_conferido_by: 'auto',
    })
    .eq('company_id', companyId)
    .in('id', alvos);
  if (error) throwDbError(error);
  return alvos.length;
};

/**
 * DESMARCA o "espelho conferido" de quem foi dispensado mas voltou a dever print
 * (19/08/2026, decisão do Victor: "desmarca sozinho e solicita o espelho").
 *
 * O caso real: reimportação (ou edição de célula) dá pacote na plataforma cobrada a
 * alguém que tinha sido marcado por dispensa — sem isto ele ficaria "conferido" sem
 * conferência nenhuma. O pedido de print não precisa ser recriado: com pacote > 0 e o
 * pedido da quinzena de pé, o portal do entregador volta a cobrar sozinho.
 *
 * Só desfaz marcação `'auto'` — quem um humano marcou nunca é desmarcado por aqui
 * (mesma trava, no sentido inverso, da `marcarEspelhoPorDispensa`). Grava `'auto'`
 * também ao desmarcar, para a varredura poder remarcar se a planilha zerar de novo.
 */
export const desmarcarEspelhoPorDispensa = async (
  companyId: string,
  paymentIds: readonly string[],
  userId: string,
): Promise<number> => {
  if (paymentIds.length === 0) return 0;
  await ensurePerm(userId, 'driverpay.editDriver');

  // Mesma chave liga/desliga da confirmação automática: desligada, nada automático roda.
  const { data: settings } = await supabase
    .from('driverpay_settings')
    .select('proof_auto_confirm')
    .eq('company_id', companyId)
    .maybeSingle();
  if (settings?.proof_auto_confirm === false) return 0; // sem linha = ligado (padrão)

  const { data: atuais } = await supabase
    .from('driverpay_payments')
    .select('id, espelho_conferido, espelho_conferido_by')
    .eq('company_id', companyId)
    .in('id', [...paymentIds]);
  const alvos = (atuais ?? [])
    .filter((p) => p.espelho_conferido)
    .filter((p) => p.espelho_conferido_by === 'auto')
    .map((p) => p.id as string);
  if (alvos.length === 0) return 0;

  const { error } = await supabase
    .from('driverpay_payments')
    .update({
      espelho_conferido: false,
      espelho_conferido_at: null,
      espelho_conferido_by: 'auto',
    })
    .eq('company_id', companyId)
    .in('id', alvos);
  if (error) throwDbError(error);
  return alvos.length;
};

export const setEspelhoConferido = async (
  companyId: string,
  paymentId: string,
  confirmed: boolean,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_payments')
    .update({
      espelho_conferido: confirmed,
      espelho_conferido_at: confirmed ? new Date().toISOString() : null,
      espelho_conferido_by: userId,
    })
    .eq('id', paymentId)
    .eq('company_id', companyId);
  if (error) throwDbError(error);
};

// ─── Descontos e Vales ───────────────────────────────────────────────────────

/** Bucket publico das provas de desconto (escrita so 2626/9999 via RLS). */
const DISCOUNT_PROOF_BUCKET = 'driverpay-discount-proofs';

/** Extensao a partir do MIME da imagem (default jpg). */
const proofExt = (blob: Blob): string => {
  const t = (blob.type || '').toLowerCase();
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  return 'jpg';
};

/** Extensao a partir do MIME do video (default mp4). */
const videoExt = (blob: Blob): string => {
  const t = (blob.type || '').toLowerCase();
  if (t === 'video/webm') return 'webm';
  if (t === 'video/quicktime') return 'mov';
  return 'mp4';
};

/** URL publica de uma prova de desconto (path do Storage -> URL exibivel). */
export const discountProofUrl = (path: string): string =>
  supabase.storage.from(DISCOUNT_PROOF_BUCKET).getPublicUrl(path).data.publicUrl;

/** Sufixo curto que torna unico o nome de cada prova nova. */
const proofUnique = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, '').slice(0, 8);

/**
 * Sobe UMA prova (imagem ou video) e devolve o caminho gravado, ou null se falhar.
 *
 * Nunca sobrescreve (`upsert: false`): o bucket nao tem policy de UPDATE, entao
 * escrever por cima de um caminho existente seria barrado pela RLS. Cada arquivo
 * novo nasce com nome unico e o antigo e apagado depois, por quem chamou.
 */
const uploadDiscountProof = async (
  companyId: string,
  paymentId: string,
  discountId: string,
  slot: string,
  blob: Blob,
  isVideo: boolean,
): Promise<string | null> => {
  const ext = isVideo ? videoExt(blob) : proofExt(blob);
  const path = `${companyId}/${paymentId}/${proofFileName(discountId, slot, ext, proofUnique())}`;
  const { error } = await supabase.storage
    .from(DISCOUNT_PROOF_BUCKET)
    .upload(path, blob, { contentType: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg'), upsert: false });
  if (error) {
    console.warn(`Upload da prova de desconto (${slot}) falhou:`, error.message);
    return null;
  }
  return path;
};

/**
 * Lanca um desconto e, opcionalmente, sobe ate 2 imagens + 1 video de prova. O
 * desconto e inserido primeiro (fonte da verdade do valor); as provas (imagens e
 * video) sao complementares — se o upload falhar, o desconto continua valendo (so
 * loga o aviso).
 */
export const addDiscount = async (
  companyId: string,
  paymentId: string,
  amount: number,
  packageCode: string | null,
  observation: string | null,
  userId: string,
  packageStatus: 'PNR' | 'LOST' | null = null,
  images?: (Blob | null | undefined)[],
  video?: Blob | null
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageDiscount');
  const { data: inserted, error } = await supabase
    .from('driverpay_discounts')
    .insert([{ company_id: companyId, payment_id: paymentId, amount, package_code: packageCode, observation, package_status: packageStatus, created_by: userId }])
    .select('id')
    .single();
  if (error) throwDbError(error);

  const discountId = (inserted as { id: string }).id;
  const paths: (string | null)[] = [null, null];
  const list = (images ?? []).slice(0, 2);
  for (let i = 0; i < list.length; i++) {
    const blob = list[i];
    if (!blob) continue;
    paths[i] = await uploadDiscountProof(companyId, paymentId, discountId, String(i + 1), blob, false);
  }

  // Video de prova (complementar): sobe apos as imagens, no mesmo bucket.
  const videoPath = video
    ? await uploadDiscountProof(companyId, paymentId, discountId, 'video', video, true)
    : null;

  if (paths[0] || paths[1] || videoPath) {
    const { error: updErr } = await supabase
      .from('driverpay_discounts')
      .update({ proof1_path: paths[0], proof2_path: paths[1], proof_video_path: videoPath })
      .eq('id', discountId)
      .eq('company_id', companyId);
    if (updErr) console.warn('Nao foi possivel gravar os caminhos das provas:', updErr.message);
  }

  await recomputePaymentTotals(paymentId);
};

export const removeDiscount = async (id: string, paymentId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageDiscount');
  // Limpa as provas (imagens + video) do Storage antes de apagar o desconto.
  const { data: existing } = await supabase
    .from('driverpay_discounts')
    .select('proof1_path, proof2_path, proof_video_path')
    .eq('id', id)
    .maybeSingle();
  const proofs = [existing?.proof1_path, existing?.proof2_path, existing?.proof_video_path].filter((p): p is string => !!p);
  if (proofs.length > 0) {
    const { error: rmErr } = await supabase.storage.from(DISCOUNT_PROOF_BUCKET).remove(proofs);
    if (rmErr) console.warn('Nao foi possivel remover as provas do Storage:', rmErr.message);
  }
  const { error } = await supabase.from('driverpay_discounts').delete().eq('id', id);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

// ─── Publicacao de espelho pro app do entregador (Fase 1) ────────────────────

/** Bucket PRIVADO dos espelhos publicados (driver le so por signed URL da edge fn). */
export const DRIVER_MIRRORS_BUCKET = 'driverpay-mirrors';

export interface PublishMirrorInput {
  companyId: string;
  periodId: string;
  driverId: string;
  scope: 'individual' | 'group' | 'selection';
  /** array de nomes de plataforma incluidos; null = todas (filtro D3). */
  platformFilter: string[] | null;
  /**
   * O espelho publicado ABATEU os vales/perdas do driver? (2026-07-27, decisao do Victor)
   * false = pagamento PARCIAL por plataforma: o desconto sai no pagamento das demais.
   * Fica gravado porque a conferencia automatica da NF calcula o valor esperado por aqui.
   */
  includeDeductions?: boolean;
  /**
   * Prazo pra mandar a nota DESTE espelho (04/08/2026), ISO com fuso. O painel exige o
   * preenchimento; fica opcional no tipo só porque as publicacoes antigas nao tem prazo.
   */
  nfDueAt?: string | null;
  pdf: Blob;
  userId: string;
  groupId?: string | null;
  /**
   * O "TOTAL A RECEBER" que saiu IMPRESSO no PDF (07/08/2026). A conferencia da nota passa
   * a usar ESTE numero em vez de recalcular por formula — sem isso, o desconto por saldo
   * (abate parcial) faria a edge fn recusar a nota certa do entregador.
   */
  printedTotal?: number | null;
  /**
   * Quanto de vale/perda este espelho abateu, por pessoa (o grupo abate dos membros).
   * Vira lancamento no livro-caixa; despublicar estorna exatamente estas linhas.
   */
  deductions?: ReadonlyArray<{ driverId: string; amount: number }>;
}

/**
 * Identidade do espelho no livro-caixa: periodo + quem recebeu a publicacao + conjunto de
 * plataformas. Precisa incluir o driver da publicacao porque `platform_key` sozinho se
 * repete (todo mundo tem espelho "SHOPEE") e apagaria o lancamento dos outros.
 */
const mirrorLedgerRef = (driverId: string, platformKey: string): string =>
  `${platformKey}#${driverId}`;

/** Estorna os abates de UM espelho (usado ao republicar e ao despublicar). */
const clearMirrorDeductions = async (
  companyId: string, periodId: string, sourceRef: string,
): Promise<void> => {
  const { error } = await supabase
    .from('driverpay_deduction_ledger')
    .delete()
    .eq('company_id', companyId).eq('period_id', periodId)
    .eq('source', 'espelho').eq('source_ref', sourceRef);
  if (error) throwDbError(error);
};

/**
 * Publica UM espelho (PDF ja gerado) pro app do driver: sobe o PDF no bucket privado
 * e registra a publicacao.
 *
 * 2026-07-28 (decisao do Victor): a identidade do espelho e o CONJUNTO DE PLATAFORMAS
 * (`platformKey`), nao mais so o periodo+driver. Republicar o MESMO conjunto substitui
 * aquele espelho (corrige um valor errado); um conjunto DIFERENTE vira outro espelho e
 * os dois aparecem lado a lado no app. Antes, publicar a SHOPEE apagava a LOGGI — o
 * PDF ia pro mesmo caminho e a publicacao anterior era deletada sem olhar o filtro.
 */
export const publishDriverMirror = async (i: PublishMirrorInput): Promise<void> => {
  await ensurePerm(i.userId, 'driverpay.generateMirror');
  const platformKey = mirrorPlatformKey(i.platformFilter);
  // A plataforma entra no NOME do arquivo: sem isso um espelho sobrescreve o outro.
  const path = `${i.companyId}/${i.periodId}/${i.driverId}${platformKey ? `__${sanitizeMirrorKeyForPath(platformKey)}` : ''}.pdf`;

  const { error: upErr } = await supabase.storage
    .from(DRIVER_MIRRORS_BUCKET)
    .upload(path, i.pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`Falha ao subir o PDF do espelho: ${upErr.message}`);

  // Troca SO o espelho do mesmo conjunto de plataformas (os outros continuam no app).
  const { error: delErr } = await supabase
    .from('driverpay_mirror_publications')
    .delete()
    .eq('company_id', i.companyId)
    .eq('period_id', i.periodId)
    .eq('driver_id', i.driverId)
    .eq('platform_key', platformKey);
  if (delErr) throwDbError(delErr);

  const { error } = await supabase.from('driverpay_mirror_publications').insert([{
    company_id: i.companyId,
    period_id: i.periodId,
    driver_id: i.driverId,
    scope: i.scope,
    group_id: i.groupId ?? null,
    platform_filter: i.platformFilter,
    platform_key: platformKey,
    include_deductions: i.includeDeductions !== false,
    nf_due_at: i.nfDueAt ?? null,
    printed_total: typeof i.printedTotal === 'number' && Number.isFinite(i.printedTotal)
      ? Math.round(i.printedTotal * 100) / 100
      : null,
    deducted_amount: Math.round(
      (i.deductions ?? []).reduce((s, d) => s + (Number.isFinite(d.amount) ? d.amount : 0), 0) * 100,
    ) / 100,
    pdf_path: path,
    delivered_by: i.userId,
  }]);
  if (error) throwDbError(error);

  // LIVRO-CAIXA (07/08/2026): o espelho que abate vale/perda lanca o abate, senao o
  // relatorio das outras plataformas descontaria de novo a mesma gente.
  // ⚠️ Estorna ANTES de lancar: republicar o mesmo espelho (corrigir um valor) tem que
  // substituir o lancamento, nao somar em cima dele.
  const ref = mirrorLedgerRef(i.driverId, platformKey);
  await clearMirrorDeductions(i.companyId, i.periodId, ref);
  if (i.deductions && i.deductions.length > 0) {
    await recordDeductions(i.companyId, i.periodId, i.deductions, 'espelho', ref, i.userId);
  }
};

/** Publicacao de espelho como o painel precisa dela (selo "no app" + aviso de desconto). */
export interface MirrorPublicationRow {
  driverId: string;
  scope: 'individual' | 'group' | 'selection';
  /** O espelho publicado abateu os vales/perdas? (coluna default true = comportamento antigo) */
  includeDeductions: boolean;
  /** Conjunto de plataformas do espelho ('' = quinzena inteira). Identidade dele desde 28/07. */
  platformKey: string;
  /** Plataformas do espelho, como foram publicadas (null = todas). */
  platformFilter: string[] | null;
  /** Prazo pra mandar a nota deste espelho. null = publicado antes de 04/08 (sem prazo). */
  nfDueAt: string | null;
}

/**
 * Espelhos JA publicados no app neste periodo (alimenta o selo "no app" na lista, o
 * "ja publicado" no dialogo e o aviso anti-desconto-duplo). Escopado por empresa+periodo
 * (RLS confirma).
 */
/**
 * Link temporario pro PDF do espelho publicado de um entregador (05/08/2026).
 * Pedido do Victor: "coloque um botão para ver o espelho do driver direto daqui da nota" —
 * pra conferir a nota contra o espelho sem sair da tela e sem procurar o entregador na grade.
 *
 * Devolve null quando nao ha espelho publicado (nao e erro: muita nota chega antes).
 */
export const mirrorPdfUrl = async (
  companyId: string,
  periodId: string,
  driverId: string,
  platformKey: string | null,
  expiresSec = 300,
): Promise<string | null> => {
  let q = supabase
    .from('driverpay_mirror_publications')
    .select('pdf_path, platform_key, delivered_at')
    .eq('company_id', companyId)
    .eq('period_id', periodId)
    .eq('driver_id', driverId);
  // A nota nasce de UM espelho (o conjunto de plataformas dela); sem isso, pega o mais recente.
  if (platformKey !== null) q = q.eq('platform_key', platformKey);
  const { data, error } = await q.order('delivered_at', { ascending: false }).limit(1);
  if (error) throwDbError(error);
  const path = (data ?? [])[0]?.pdf_path as string | undefined;
  if (!path) return null;
  const { data: signed, error: e2 } = await supabase.storage
    .from(DRIVER_MIRRORS_BUCKET)
    .createSignedUrl(path, expiresSec);
  if (e2) throwDbError(e2);
  return signed?.signedUrl ?? null;
};

export const listMirrorPublications = async (
  companyId: string,
  periodId: string,
): Promise<MirrorPublicationRow[]> => {
  const { data, error } = await supabase
    .from('driverpay_mirror_publications')
    .select('driver_id, scope, include_deductions, platform_key, platform_filter, nf_due_at')
    .eq('company_id', companyId)
    .eq('period_id', periodId);
  if (error) throwDbError(error);
  return (data ?? []).map((r) => {
    const row = r as {
      driver_id: string; scope: string; include_deductions: boolean | null;
      platform_key: string | null; platform_filter: string[] | null; nf_due_at: string | null;
    };
    return {
      driverId: row.driver_id,
      scope: (row.scope as MirrorPublicationRow['scope']) ?? 'individual',
      includeDeductions: row.include_deductions !== false,
      platformKey: row.platform_key ?? '',
      platformFilter: Array.isArray(row.platform_filter) && row.platform_filter.length
        ? row.platform_filter : null,
      nfDueAt: row.nf_due_at ?? null,
    };
  });
};

/**
 * Despublica (tira do app) o espelho de UM driver neste periodo — apaga a linha da
 * publicacao. O driver deixa de ver o espelho na hora. O PDF continua no bucket privado
 * (trava do storage nao deixa apagar arquivo), mas some da vista do driver do mesmo jeito.
 * Re-publicar depois recria normalmente (sobrescreve o arquivo).
 */
export const unpublishDriverMirror = async (
  companyId: string,
  periodId: string,
  driverId: string,
  userId: string,
  /**
   * Plataformas do espelho a tirar do app (28/07). Passando o filtro, sai SO aquele
   * espelho e os outros do mesmo periodo continuam no app; `undefined` tira todos os
   * espelhos do driver naquele periodo (comportamento de antes, usado na limpeza geral).
   */
  platformFilter?: string[] | null,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.generateMirror');
  let q = supabase
    .from('driverpay_mirror_publications')
    .delete()
    .eq('company_id', companyId)
    .eq('period_id', periodId)
    .eq('driver_id', driverId);
  if (platformFilter !== undefined) q = q.eq('platform_key', mirrorPlatformKey(platformFilter));

  // Quais espelhos vao sair — preciso saber ANTES do delete pra estornar o livro-caixa
  // e apagar os PDFs do bucket (19/08/2026: antes ficavam órfãos no storage).
  let sel = supabase
    .from('driverpay_mirror_publications')
    .select('platform_key, pdf_path')
    .eq('company_id', companyId).eq('period_id', periodId).eq('driver_id', driverId);
  if (platformFilter !== undefined) sel = sel.eq('platform_key', mirrorPlatformKey(platformFilter));
  const { data: saindo, error: selErr } = await sel;
  if (selErr) throwDbError(selErr);

  const { error } = await q;
  if (error) throwDbError(error);

  // O espelho saiu do app: o abate dele deixa de valer e a pessoa volta a dever.
  for (const p of saindo ?? []) {
    const key = String((p as { platform_key: string | null }).platform_key ?? '');
    await clearMirrorDeductions(companyId, periodId, mirrorLedgerRef(driverId, key));
  }
  // PDFs em melhor esforço, depois das linhas (falhar aqui = órfão como antes, nunca
  // publicação apontando pro nada). Republicar regenera o arquivo do zero.
  const pdfPaths = (saindo ?? [])
    .map((p) => (p as { pdf_path?: string | null }).pdf_path)
    .filter((p): p is string => !!p);
  if (pdfPaths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(DRIVER_MIRRORS_BUCKET).remove(pdfPaths);
    if (rmErr) console.warn('Não foi possível remover o PDF do espelho do Storage:', rmErr.message);
  }
};

/**
 * Despublica TODOS os espelhos do periodo (limpeza em massa — ex.: publicou errado pra
 * muita gente). Retorna quantos sairam. Os PDFs saem do bucket junto (19/08/2026).
 */
export const unpublishAllMirrorsForPeriod = async (
  companyId: string,
  periodId: string,
  userId: string,
): Promise<number> => {
  await ensurePerm(userId, 'driverpay.generateMirror');
  const { data, error } = await supabase
    .from('driverpay_mirror_publications')
    .delete()
    .eq('company_id', companyId)
    .eq('period_id', periodId)
    .select('id, pdf_path');
  if (error) throwDbError(error);
  // PDFs em melhor esforço, em lotes (o remove aceita lista; 100 por vez por folga).
  const pdfPaths = (data ?? [])
    .map((r) => (r as { pdf_path?: string | null }).pdf_path)
    .filter((p): p is string => !!p);
  for (let i = 0; i < pdfPaths.length; i += 100) {
    const { error: rmErr } = await supabase.storage
      .from(DRIVER_MIRRORS_BUCKET).remove(pdfPaths.slice(i, i + 100));
    if (rmErr) console.warn('Não foi possível remover PDFs de espelho do Storage:', rmErr.message);
  }
  // Nenhum espelho do periodo continua no app: nenhum abate vindo de espelho continua
  // valendo. Os abates de RELATORIO (o dinheiro que ja saiu de fato) ficam intactos.
  const { error: ledErr } = await supabase
    .from('driverpay_deduction_ledger')
    .delete()
    .eq('company_id', companyId).eq('period_id', periodId).eq('source', 'espelho');
  if (ledErr) throwDbError(ledErr);
  return (data ?? []).length;
};

/**
 * Reseta a senha do driver no app: apaga a linha de auth -> no proximo login ele volta
 * pra senha inicial 1234 (troca obrigatoria) e o lockout por tentativas e destravado.
 * Via RPC SECURITY DEFINER (migration 20260725100000): o DELETE direto do painel nunca
 * funcionou — sem policy de SELECT na tabela (proposital, protege os hashes), um DELETE
 * com WHERE casa 0 linhas em silencio. A RPC apaga por dentro, checa a authz do chamador
 * (mestre 9999/2626 ou mesma empresa) e devolve quantas linhas apagou.
 * @returns 0 = driver nunca acessou o app (nada pra apagar; ele ja entra com 1234).
 */
export const resetDriverPassword = async (driverId: string, userId: string): Promise<number> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { data, error } = await supabase.rpc('driverpay_reset_driver_password', {
    p_driver_id: driverId,
  });
  if (error) throwDbError(error);
  return typeof data === 'number' ? data : 0;
};

/** Uma linha da busca de pacotes descontados (desconto + driver + status do periodo). */
export interface DiscountSearchRow {
  id: string;
  amount: number;
  package_code: string | null;
  package_status: 'PNR' | 'LOST' | null;
  observation: string | null;
  created_at: string;
  driver_name: string;
  period_label: string;
  period_status: DriverPeriodStatus;
  /** null enquanto o periodo esta aberto; data ISO quando ja foi concluido. */
  concluded_at: string | null;
  proof1_path: string | null;
  proof2_path: string | null;
  proof_video_path: string | null;
}

/**
 * Busca descontos pelo codigo do pacote (ilike). Junta pagamento+periodo para
 * dizer se o desconto ja foi efetivado (periodo concluido) e quando. Sem codigo,
 * lista os descontos mais recentes da empresa (limite 200).
 */
/** Edita um desconto ja lancado (valor, codigo, observacao, marca PNR/LOST). */
export const updateDiscount = async (
  id: string,
  companyId: string,
  paymentId: string,
  userId: string,
  data: { amount?: number; packageCode?: string | null; observation?: string | null; packageStatus?: 'PNR' | 'LOST' | null },
  proofs?: { images: ProofSlot[]; video: ProofSlot | null },
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageDiscount');
  const upd: Record<string, unknown> = {};
  if (data.amount !== undefined) upd.amount = data.amount;
  if (data.packageCode !== undefined) upd.package_code = data.packageCode;
  if (data.observation !== undefined) upd.observation = data.observation;
  if (data.packageStatus !== undefined) upd.package_status = data.packageStatus;

  // Provas (fotos + video): so mexe quando a tela manda `proofs`. Cada item ou e
  // uma prova que ja estava salva ({keep}) ou um arquivo novo ({blob}).
  let orfaos: string[] = [];
  if (proofs) {
    const { data: atual, error: readErr } = await supabase
      .from('driverpay_discounts')
      .select('proof1_path, proof2_path, proof_video_path')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (readErr) throwDbError(readErr);

    // Sobe TUDO que e novo antes de gravar qualquer coisa. Se um upload falhar,
    // desfaz os que subiram e para: prova e prova de dinheiro — perder a antiga
    // por causa de uma foto que nao subiu seria pior que nao trocar nada.
    const subidos: string[] = [];
    const enviar = async (slot: ProofSlot | null, nome: string, isVideo: boolean): Promise<string | null> => {
      if (!slot) return null;
      if (isKeptProof(slot)) return slot.keep;
      const path = await uploadDiscountProof(companyId, paymentId, id, nome, slot.blob, isVideo);
      if (path) subidos.push(path);
      return path;
    };

    const imagens = proofs.images.slice(0, 2);
    const finais: (string | null)[] = [null, null];
    let falhou = false;
    for (let i = 0; i < imagens.length; i++) {
      finais[i] = await enviar(imagens[i], String(i + 1), false);
      if (finais[i] === null) falhou = true;
    }
    const videoPath = await enviar(proofs.video, 'video', true);
    if (proofs.video && videoPath === null) falhou = true;

    if (falhou) {
      if (subidos.length > 0) await supabase.storage.from(DISCOUNT_PROOF_BUCKET).remove(subidos);
      throw new Error('Nao foi possivel enviar a prova. Nada foi alterado — tente de novo.');
    }

    upd.proof1_path = finais[0];
    upd.proof2_path = finais[1];
    upd.proof_video_path = videoPath;
    orfaos = orphanProofPaths(
      [atual?.proof1_path, atual?.proof2_path, atual?.proof_video_path],
      [finais[0], finais[1], videoPath],
    );
  }

  if (Object.keys(upd).length === 0) return;
  const { error } = await supabase.from('driverpay_discounts').update(upd).eq('id', id).eq('company_id', companyId);
  if (error) throwDbError(error);

  // So apaga a prova antiga DEPOIS que o banco confirmou o caminho novo.
  if (orfaos.length > 0) {
    const { error: rmErr } = await supabase.storage.from(DISCOUNT_PROOF_BUCKET).remove(orfaos);
    if (rmErr) console.warn('Nao foi possivel remover provas antigas do Storage:', rmErr.message);
  }

  await recomputePaymentTotals(paymentId);
};

export const searchDiscounts = async (companyId: string, code: string): Promise<DiscountSearchRow[]> => {
  const q = code.trim();
  let query = supabase
    .from('driverpay_discounts')
    .select(
      'id, amount, package_code, package_status, observation, created_at, proof1_path, proof2_path, proof_video_path, payment:driverpay_payments!inner(driver_name_snapshot, period:driverpay_periods!inner(label, status, concluded_at))'
    )
    .eq('company_id', companyId);
  if (q) query = query.ilike('package_code', `%${q}%`);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) throwDbError(error);
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const payment = rec.payment as Record<string, unknown> | null;
    const period = (payment?.period as Record<string, unknown> | null) ?? null;
    return {
      id: String(rec.id),
      amount: num(rec.amount),
      package_code: (rec.package_code as string | null) ?? null,
      package_status: (rec.package_status as 'PNR' | 'LOST' | null) ?? null,
      observation: (rec.observation as string | null) ?? null,
      created_at: String(rec.created_at),
      driver_name: (payment?.driver_name_snapshot as string) ?? '—',
      period_label: (period?.label as string) ?? '—',
      period_status: (period?.status as DriverPeriodStatus) ?? 'aberto',
      concluded_at: (period?.concluded_at as string | null) ?? null,
      proof1_path: (rec.proof1_path as string | null) ?? null,
      proof2_path: (rec.proof2_path as string | null) ?? null,
      proof_video_path: (rec.proof_video_path as string | null) ?? null,
    };
  });
};

export const addVale = async (
  companyId: string,
  paymentId: string,
  amount: number,
  valeDate: string | null,
  observation: string | null,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageVale');
  const { error } = await supabase
    .from('driverpay_vales')
    .insert([{ company_id: companyId, payment_id: paymentId, amount, vale_date: valeDate, observation, created_by: userId }]);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

export const removeVale = async (id: string, paymentId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageVale');
  const { error } = await supabase.from('driverpay_vales').delete().eq('id', id);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

/** Edita um vale ja lancado (valor, data, observacao). */
export const updateVale = async (
  id: string,
  companyId: string,
  paymentId: string,
  userId: string,
  data: { amount?: number; valeDate?: string | null; observation?: string | null },
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageVale');
  const upd: Record<string, unknown> = {};
  if (data.amount !== undefined) upd.amount = data.amount;
  if (data.valeDate !== undefined) upd.vale_date = data.valeDate;
  if (data.observation !== undefined) upd.observation = data.observation;
  if (Object.keys(upd).length === 0) return;
  const { error } = await supabase.from('driverpay_vales').update(upd).eq('id', id).eq('company_id', companyId);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

// ─── Zapex (ganho por item; total = qtd de itens x zapex_rate do driver) ─────

/**
 * Lanca um item Zapex (1 entrega) no pagamento: apenas codigo + data de entrega,
 * sem valor no lancamento — o ganho vem do zapex_rate individual do driver, aplicado
 * no recomputo (view driverpay_payment_computed.calc_zapex = round(count x rate, 2)).
 */
export const addZapex = async (
  companyId: string,
  paymentId: string,
  code: string,
  deliveryDate: string | null,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_zapex')
    .insert([{ company_id: companyId, payment_id: paymentId, code, delivery_date: deliveryDate, created_by: userId }]);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

export const updateZapex = async (
  id: string,
  paymentId: string,
  code: string,
  deliveryDate: string | null,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_zapex')
    .update({ code, delivery_date: deliveryDate })
    .eq('id', id);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

export const removeZapex = async (id: string, paymentId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase.from('driverpay_zapex').delete().eq('id', id);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

/**
 * Define o valor unitario Zapex do driver naquele pagamento (zapex_rate). O total_zapex
 * e sempre derivado (qtd de itens x rate) no recomputo — aqui so persistimos a taxa e
 * disparamos o recomputo para refletir imediatamente no total a receber.
 */
export const setZapexRate = async (
  companyId: string,
  paymentId: string,
  rate: number,
  userId: string
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.configRate');
  const { error } = await supabase
    .from('driverpay_payments')
    .update({ zapex_rate: rate })
    .eq('id', paymentId)
    .eq('company_id', companyId);
  if (error) throwDbError(error);
  await recomputePaymentTotals(paymentId);
};

// ─── Totais (recomputo em tempo real; a conclusao congela via RPC) ───────────

/**
 * Recomputa total_* de um pagamento a partir das filhas, usando a view
 * driverpay_payment_computed (fonte unica da formula) e grava na driverpay_payments.
 * total_net pode ser negativo (vale > pacotes) — sem CHECK no net.
 */
export const recomputePaymentTotals = async (paymentId: string): Promise<void> => {
  const { data, error } = await supabase
    .from('driverpay_payment_computed')
    .select('calc_packages, calc_discounts, calc_vales, calc_zapex, calc_net')
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (error) throwDbError(error);
  if (!data) return;
  const { error: upErr } = await supabase
    .from('driverpay_payments')
    .update({
      total_packages_amount: num(data.calc_packages),
      total_discounts: num(data.calc_discounts),
      total_vales: num(data.calc_vales),
      total_zapex: num(data.calc_zapex),
      total_net: num(data.calc_net),
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId);
  if (upErr) throwDbError(upErr);
};

// ─── Import em massa (seed dos drivers da planilha) ──────────────────────────

export interface DriverSeedRoute {
  city: string;
  packages: Record<string, number>; // platformName -> packages
}
export interface DriverSeed {
  name: string;
  route: string | null;
  pix_key?: string | null;
  cpf?: string | null;
  phone?: string | null;
  rates?: Record<string, number>; // platformName -> rate
  routes?: DriverSeedRoute[]; // multi-rota (opcional)
  discount?: { amount: number; package_code?: string | null } | null;
}

export interface BulkImportResult {
  driversCreated: number;
  errors: string[];
}

/**
 * Importa drivers em massa (bootstrap ou "Importar Excel"). Cria drivers + rates
 * por plataforma. Se `periodId` for informado, tambem cria os pacotes por rota no
 * pagamento do periodo aberto. Nao deduplica por nome (homonimos sao pessoas diferentes).
 */
export const bulkImportDrivers = async (
  companyId: string,
  userId: string,
  seed: DriverSeed[],
  platforms: DriverPlatform[]
): Promise<BulkImportResult> => {
  await ensurePerm(userId, 'driverpay.createDriver');
  const platformByName = new Map(platforms.map((p) => [p.name.toLowerCase(), p]));
  const errors: string[] = [];
  let created = 0;

  for (const s of seed) {
    try {
      const driver = await createDriver(companyId, userId, {
        name: s.name,
        route: s.route ?? (s.routes && s.routes.length ? s.routes.map((r) => r.city).join(', ') : null),
        pix_key: s.pix_key ?? null,
        cpf: s.cpf ?? null,
        phone: s.phone ?? null,
      });
      // rates por plataforma
      if (s.rates) {
        for (const [pName, rate] of Object.entries(s.rates)) {
          const plat = platformByName.get(pName.toLowerCase());
          if (plat) await upsertDriverRate(companyId, driver.id, plat.id, rate, userId);
        }
      }
      created++;
    } catch (e) {
      errors.push(`${s.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { driversCreated: created, errors };
};

// ─── Import de planilha de plataforma: contexto de matching + aplicacao ───────

/** Drivers ativos + apelidos aprendidos + ignorados, para casar os nomes vindos da planilha. */
export const getDriverMatchContext = async (
  companyId: string,
): Promise<{
  drivers: { id: string; name: string }[];
  aliases: { alias_norm: string; driver_id: string }[];
  ignored: { alias_norm: string }[];
}> => {
  const [dRes, aRes, iRes] = await Promise.all([
    supabase.from('driverpay_drivers').select('id, name').eq('company_id', companyId).eq('active', true),
    supabase.from('driverpay_driver_aliases').select('alias_norm, driver_id').eq('company_id', companyId),
    supabase.from('driverpay_driver_ignored').select('alias_norm').eq('company_id', companyId),
  ]);
  if (dRes.error) throwDbError(dRes.error);
  if (aRes.error) throwDbError(aRes.error);
  if (iRes.error) throwDbError(iRes.error);
  return {
    drivers: (dRes.data ?? []) as { id: string; name: string }[],
    aliases: (aRes.data ?? []) as { alias_norm: string; driver_id: string }[],
    ignored: (iRes.data ?? []) as { alias_norm: string }[],
  };
};

/** Grava (aprende) um apelido -> driver. Idempotente por (company_id, alias_norm). */
export const upsertDriverAlias = async (
  companyId: string,
  driverId: string,
  aliasRaw: string,
  aliasNorm: string,
  source: string | null,
  userId: string,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.createDriver');
  const { error } = await supabase.from('driverpay_driver_aliases').upsert(
    [{ company_id: companyId, driver_id: driverId, alias_raw: aliasRaw, alias_norm: aliasNorm, source, created_by: userId }],
    { onConflict: 'company_id,alias_norm' },
  );
  if (error) throwDbError(error);
};

/**
 * Grava (lembra) que este nome de planilha deve ser IGNORADO — pra nao pedir a
 * mesma decisao de novo na proxima importacao (18/08/2026, pedido do Victor:
 * "guarda os rejeitados tambem"). Idempotente por (company_id, alias_norm).
 */
export const upsertDriverIgnored = async (
  companyId: string,
  aliasRaw: string,
  aliasNorm: string,
  source: string | null,
  userId: string,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.createDriver');
  const { error } = await supabase.from('driverpay_driver_ignored').upsert(
    [{ company_id: companyId, alias_raw: aliasRaw, alias_norm: aliasNorm, source, created_by: userId }],
    { onConflict: 'company_id,alias_norm' },
  );
  if (error) throwDbError(error);
};

/** Um vinculo (apelido -> driver) ja aprendido, com o nome do driver pra mostrar na tela. */
export interface DriverAliasRecord {
  id: string;
  aliasRaw: string;
  aliasNorm: string;
  driverId: string;
  driverName: string;
  source: string | null;
  createdAt: string;
}
/** Um nome marcado "ignorar" (nunca vira driver, nunca vincula). */
export interface DriverIgnoredRecord {
  id: string;
  aliasRaw: string;
  aliasNorm: string;
  source: string | null;
  createdAt: string;
}

/**
 * Tudo que ja foi aprendido (vinculos + ignorados) — pra tela de gerenciamento
 * (18/08/2026): ver o que esta salvo, editar um vinculo errado, ou desfazer um
 * "ignorar" (a linha volta a aparecer como pendente no proximo import).
 */
export const listDriverAliasesAndIgnored = async (
  companyId: string,
): Promise<{ aliases: DriverAliasRecord[]; ignored: DriverIgnoredRecord[] }> => {
  const [aRes, iRes] = await Promise.all([
    supabase
      .from('driverpay_driver_aliases')
      .select('id, alias_raw, alias_norm, source, created_at, driver:driverpay_drivers(id, name)')
      .eq('company_id', companyId)
      .order('alias_raw', { ascending: true }),
    supabase
      .from('driverpay_driver_ignored')
      .select('id, alias_raw, alias_norm, source, created_at')
      .eq('company_id', companyId)
      .order('alias_raw', { ascending: true }),
  ]);
  if (aRes.error) throwDbError(aRes.error);
  if (iRes.error) throwDbError(iRes.error);
  type AliasRow = {
    id: string; alias_raw: string; alias_norm: string; source: string | null; created_at: string;
    driver: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const aliases = ((aRes.data ?? []) as AliasRow[]).map((r) => {
    const driver = Array.isArray(r.driver) ? r.driver[0] : r.driver;
    return {
      id: r.id, aliasRaw: r.alias_raw, aliasNorm: r.alias_norm,
      driverId: driver?.id ?? '', driverName: driver?.name ?? '(driver removido)',
      source: r.source, createdAt: r.created_at,
    };
  });
  type IgnoredRow = { id: string; alias_raw: string; alias_norm: string; source: string | null; created_at: string };
  const ignored = ((iRes.data ?? []) as IgnoredRow[]).map((r) => ({
    id: r.id, aliasRaw: r.alias_raw, aliasNorm: r.alias_norm, source: r.source, createdAt: r.created_at,
  }));
  return { aliases, ignored };
};

/** Desfaz um vinculo — o nome volta a pedir decisao no proximo import (nao apaga o driver). */
export const deleteDriverAlias = async (id: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.createDriver');
  const { error } = await supabase.from('driverpay_driver_aliases').delete().eq('id', id);
  if (error) throwDbError(error);
};

/** Edita um vinculo pra apontar pra OUTRO driver (mesmo nome de planilha, driver certo). */
export const updateDriverAliasTarget = async (id: string, newDriverId: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.createDriver');
  const { error } = await supabase.from('driverpay_driver_aliases').update({ driver_id: newDriverId }).eq('id', id);
  if (error) throwDbError(error);
};

/** Desfaz um "ignorar" — o nome volta a aparecer como pendente no proximo import. */
export const deleteDriverIgnored = async (id: string, userId: string): Promise<void> => {
  await ensurePerm(userId, 'driverpay.createDriver');
  const { error } = await supabase.from('driverpay_driver_ignored').delete().eq('id', id);
  if (error) throwDbError(error);
};

/** Acha o pagamento do driver no periodo; cria se faltar (driver novo no periodo). */
const ensurePaymentForDriver = async (
  companyId: string,
  periodId: string,
  driverId: string,
  driverName: string,
  route: string | null,
): Promise<string> => {
  const { data: existing, error: e1 } = await supabase
    .from('driverpay_payments')
    .select('id')
    .eq('company_id', companyId)
    .eq('period_id', periodId)
    .eq('driver_id', driverId)
    .maybeSingle();
  if (e1) throwDbError(e1);
  if (existing) return (existing as { id: string }).id;
  const { data: created, error: e2 } = await supabase
    .from('driverpay_payments')
    .insert([
      { company_id: companyId, period_id: periodId, driver_id: driverId, driver_name_snapshot: driverName, route_snapshot: route },
    ])
    .select('id')
    .single();
  if (e2) throwDbError(e2);
  return (created as { id: string }).id;
};

/**
 * Aplica um import ja resolvido a um periodo: cria os drivers novos, aprende os
 * apelidos e lanca os pacotes por (plataforma, rota) com a taxa ja cadastrada do
 * driver (fallback: default_rate da plataforma). Nao apaga nada — soma via upsert.
 */
export const applyDriverImport = async (
  companyId: string,
  userId: string,
  periodId: string,
  source: string,
  items: ImportResolvedItem[],
): Promise<ImportApplyResult> => {
  await ensurePerm(userId, 'driverpay.editDriver');

  const platforms = await getPlatforms(companyId, false);
  const defaultByPlatform = new Map(platforms.map((p) => [p.name, p.default_rate]));

  // TRAVA (04/08/2026): plataforma que nao existe no cadastro NAO entra.
  // Antes, o `?? 0` da taxa mais abaixo deixava passar com valor ZERO — e a grade,
  // que so desenha coluna de plataforma cadastrada, escondia os pacotes. Foi assim
  // que 1.600 coletas da Shopee entraram invisiveis e sem valor. Falhar aqui e o
  // unico jeito de a regra valer mesmo quando a chamada nao vem da tela do import.
  const faltando = missingImportPlatforms(items, [...defaultByPlatform.keys()]);
  if (faltando.length > 0) {
    const lista = faltando.map((f) => `"${f.name}" (${f.packages} pacote(s))`).join(', ');
    throw new Error(
      `Plataforma nao cadastrada nesta empresa: ${lista}. ` +
        'Cadastre em "Adicionar plataforma" com o valor por pacote antes de importar — ' +
        'sem isso os pacotes entrariam valendo R$ 0,00 e nao apareceriam na grade.',
    );
  }
  const ratesByDriver = new Map<string, Record<string, number>>();
  const createdByRaw = new Map<string, string>();
  const ignoredNormsSaved = new Set<string>();

  let driversCreated = 0;
  let aliasesLearned = 0;
  let packagesApplied = 0;
  let ignored = 0;
  const affected = new Set<string>();

  for (const it of items) {
    if (it.resolution.kind === 'ignore') {
      ignored += 1;
      // Lembra a decisao pra nao pedir de novo na proxima importacao (18/08/2026).
      if (!ignoredNormsSaved.has(it.aliasNorm)) {
        ignoredNormsSaved.add(it.aliasNorm);
        await upsertDriverIgnored(companyId, it.driverRaw, it.aliasNorm, source, userId);
      }
      continue;
    }

    let driverId: string;
    let driverName: string;
    if (it.resolution.kind === 'create') {
      const cached = createdByRaw.get(it.driverRaw);
      if (cached) {
        driverId = cached;
      } else {
        const d = await createDriver(companyId, userId, { name: it.resolution.name, route: it.city || null });
        driverId = d.id;
        createdByRaw.set(it.driverRaw, driverId);
        driversCreated += 1;
        await upsertDriverAlias(companyId, driverId, it.driverRaw, it.aliasNorm, source, userId);
        aliasesLearned += 1;
      }
      driverName = it.resolution.name;
    } else {
      driverId = it.resolution.driverId;
      driverName = it.resolution.driverName;
      if (it.resolution.learnAlias) {
        await upsertDriverAlias(companyId, driverId, it.driverRaw, it.aliasNorm, source, userId);
        aliasesLearned += 1;
      }
    }

    let rates = ratesByDriver.get(driverId);
    if (!rates) {
      rates = await getDriverDefaultRates(companyId, driverId);
      ratesByDriver.set(driverId, rates);
    }
    const rate = rates[it.platform] ?? defaultByPlatform.get(it.platform) ?? 0;

    const paymentId = await ensurePaymentForDriver(companyId, periodId, driverId, driverName, it.city || null);
    await upsertPackage(companyId, paymentId, it.platform, it.city, it.packages, rate, userId);

    packagesApplied += it.packages;
    affected.add(driverId);
  }

  return { driversCreated, aliasesLearned, packagesApplied, driversAffected: affected.size, ignored };
};

// ─── Espelho do app da Shopee (print da tela) — 04/08/2026 ───────────────────
//
// A planilha da Shopee pode vir com a quantidade de pacotes errada por driver.
// O driver anexa pelo portal o print da tela do app dele e o sistema confere.
// Ver supabase/functions/_shared/proofCheck.ts pra regra da conferência.

/** Plataformas com print SOLICITADO nesta quinzena (o botão "Solicitar espelho"). */
export const listProofRequests = async (
  companyId: string, periodId: string,
): Promise<ProofRequest[]> => {
  const { data, error } = await supabase
    .from('driverpay_proof_requests')
    .select('platform_name, driver_id')
    .eq('company_id', companyId)
    .eq('period_id', periodId);
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({
    platformName: String(r.platform_name),
    driverId: (r.driver_id as string | null) ?? null,
  }));
};

/**
 * Abre a "torneira": a partir daqui o portal do driver passa a pedir o print
 * desta plataforma nesta quinzena. Idempotente (apertar de novo não duplica).
 *
 * `driverId` é o ALCANCE (04/08/2026): **null = todo mundo** com pacote na plataforma;
 * **preenchido = só aquele entregador**. Um grupo é uma chamada por membro.
 * O `onConflict` acompanha os dois índices parciais da migration.
 */
export const requestProof = async (
  companyId: string, periodId: string, platformName: string, userId: string,
  driverId: string | null = null,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { error } = await supabase
    .from('driverpay_proof_requests')
    .insert({
      company_id: companyId, period_id: periodId, platform_name: platformName,
      driver_id: driverId, requested_by: userId,
    });
  // 23505 = esse pedido já existe, que é exatamente o resultado desejado (idempotente).
  // ⚠️ Não dá pra usar `upsert` aqui: desde 04/08 a unicidade vem de dois ÍNDICES
  // PARCIAIS (um "pra todos" com driver_id IS NULL, outro por entregador), e o
  // `onConflict` do PostgREST não tem como informar o WHERE do índice — o banco
  // responde 42P10 ("no unique or exclusion constraint matching"). Medido: o E2E 64
  // quebrou exatamente assim e o modal ficava aberto com cara de erro.
  if (error && error.code !== '23505') throwDbError(error);
};

/**
 * Plataformas que **já tiveram print** nesta empresa — pedido ou recebido, em qualquer
 * quinzena. É o que decide onde o pedido automático pós-importação vale (ver
 * `plataformasQuePedemPrint`), em vez de "SHOPEE" escrito no código.
 *
 * Olha as DUAS fontes de propósito: cancelar a solicitação APAGA a linha de pedido, então
 * só ela esqueceria a Shopee no dia em que a quinzena fechasse. Print recebido não é
 * apagado — essa parte é a memória durável.
 */
export const platformsWithProofHistory = async (companyId: string): Promise<Set<string>> => {
  const [{ data: pedidos }, { data: recebidos }] = await Promise.all([
    supabase.from('driverpay_proof_requests').select('platform_name').eq('company_id', companyId),
    supabase.from('driverpay_delivery_proofs').select('platform_name').eq('company_id', companyId),
  ]);
  const nomes = new Set<string>();
  for (const r of pedidos ?? []) nomes.add(String(r.platform_name));
  for (const r of recebidos ?? []) nomes.add(String(r.platform_name));
  return nomes;
};

/**
 * Pede o print de VÁRIOS entregadores de uma vez (um pedido individual por pessoa).
 *
 * Usado pelo automático de depois da importação. Individual de propósito: o pedido "pra
 * todos" voltaria a cobrar print de quem a equipe já validou na mão — decisão do Victor,
 * *"quem já está validado continua validado, já passou dessa parte"*.
 *
 * Devolve quantos entraram de fato. Repetir é inofensivo (23505 = já existe).
 */
export const requestProofForDrivers = async (
  companyId: string, periodId: string, platformName: string,
  driverIds: readonly string[], userId: string,
): Promise<number> => {
  if (driverIds.length === 0) return 0;
  await ensurePerm(userId, 'driverpay.editDriver');
  const linha = (driverId: string) => ({
    company_id: companyId, period_id: periodId, platform_name: platformName,
    driver_id: driverId, requested_by: userId,
  });

  // Tenta de uma vez só. ⚠️ No Postgres, UMA linha repetida derruba o lote inteiro — e
  // `upsert` não serve aqui (a unicidade vem de índices PARCIAIS; o PostgREST responde
  // 42P10, o mesmo tropeço que o E2E 64 pegou em 04/08). Então, se bater repetido, cai
  // pro um a um, que é o caminho lento mas exato.
  const { data, error } = await supabase
    .from('driverpay_proof_requests').insert(driverIds.map(linha)).select('id');
  if (!error) return (data ?? []).length;
  if (error.code !== '23505') throwDbError(error);

  let entraram = 0;
  for (const driverId of driverIds) {
    const { error: e1 } = await supabase.from('driverpay_proof_requests').insert(linha(driverId));
    if (!e1) entraram += 1;
    else if (e1.code !== '23505') throwDbError(e1);
  }
  return entraram;
};

/**
 * Fecha a torneira. Os prints já enviados FICAM — só para de pedir novos.
 * `driverId` null apaga SÓ o pedido geral; `'*'` apaga tudo daquela plataforma
 * (geral + individuais), que é o que o botão "Cancelar solicitação" faz.
 */
export const cancelProofRequest = async (
  companyId: string, periodId: string, platformName: string, userId: string,
  driverId: string | null | '*' = '*',
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  let q = supabase
    .from('driverpay_proof_requests')
    .delete()
    .eq('company_id', companyId).eq('period_id', periodId).eq('platform_name', platformName);
  if (driverId === null) q = q.is('driver_id', null);
  else if (driverId !== '*') q = q.eq('driver_id', driverId);
  const { error } = await q;
  if (error) throwDbError(error);
};

/**
 * RECONFERE, sem chamar a IA, os prints que estavam esperando a planilha.
 *
 * POR QUE EXISTE (04/08/2026): da pra pedir o print ANTES de importar a planilha. Nesse
 * momento nao ha quantidade pra comparar, entao o print entra lido mas sem veredito de
 * quantidade — e o espelho NAO e marcado (seria aprovar as cegas). Quando a planilha chega,
 * alguem precisa fechar essa conta. Era o pedaco que faltava: sem isto o print ficava
 * "recebido" pra sempre, e a janela de solicitar ja PROMETIA que isso aconteceria sozinho.
 *
 * ⚠️ NAO baixa foto e NAO chama a IA: usa o numero que ja esta gravado em `read_packages`.
 * Foi a exigencia do Victor — "nao trave a fila, nao trave a API". Por isso pode rodar em
 * cima de 89 prints logo depois da importacao sem gastar cota nenhuma.
 *
 * So mexe em print que: ja foi lido (`read_packages` preenchido), teve o PERIODO aprovado,
 * e ainda nao foi decidido por um humano. Print recusado ou ilegivel nao e tocado.
 */
export const reconferirPrintsComPlanilha = async (
  companyId: string, periodId: string, userId: string,
  /**
   * Reconferir SO os prints deste entregador. (04/08/2026)
   * Sem isto, corrigir a contagem de UM driver reconferia os ~79 prints da quinzena, com 3
   * idas ao banco cada — quase 240 consultas pra resolver um clique, e a tela travava. A
   * varredura completa continua valendo pra depois da importacao da planilha, que e quando
   * ela faz sentido.
   */
  soDoDriverId?: string,
): Promise<{ conferidos: number; divergentes: number; semBase: number }> => {
  await ensurePerm(userId, 'driverpay.editDriver');

  let q = supabase
    .from('driverpay_delivery_proofs')
    .select('id, driver_id, payment_id, platform_name, read_packages, check_periodo, status, validated_by')
    .eq('company_id', companyId).eq('period_id', periodId)
    .not('read_packages', 'is', null)
    .neq('status', 'rejeitado');
  if (soDoDriverId) q = q.eq('driver_id', soDoDriverId);
  const { data: proofs, error: pErr } = await q;
  if (pErr) throwDbError(pErr);
  if (!proofs?.length) return { conferidos: 0, divergentes: 0, semBase: 0 };

  // Quantidade da planilha por (driver, plataforma). Com `soDoDriverId`, so o dele.
  let qPays = supabase.from('driverpay_payments')
    .select('id, driver_id').eq('company_id', companyId).eq('period_id', periodId);
  if (soDoDriverId) qPays = qPays.eq('driver_id', soDoDriverId);
  const { data: pays } = await qPays;
  const driverDoPagamento = new Map((pays ?? []).map((p) => [p.id as string, p.driver_id as string]));
  const { data: pks } = await supabase.from('driverpay_payment_packages')
    .select('payment_id, platform_name, packages').in('payment_id', (pays ?? []).map((p) => p.id));
  const pacotes = new Map<string, number>(); // `${driverId}|${plataforma}`
  for (const pk of pks ?? []) {
    const dId = driverDoPagamento.get(pk.payment_id as string);
    if (!dId) continue;
    const k = `${dId}|${pk.platform_name as string}`;
    pacotes.set(k, (pacotes.get(k) ?? 0) + (pk.packages ?? 0));
  }

  const { data: settings } = await supabase.from('driverpay_settings')
    .select('proof_auto_confirm, proof_tolerance_packages').eq('company_id', companyId).maybeSingle();
  const tolerancia = Number(settings?.proof_tolerance_packages ?? 0) || 0;
  const autoConfirmar = settings?.proof_auto_confirm !== false; // sem linha = ligado

  let conferidos = 0, divergentes = 0, semBase = 0;
  for (const pr of proofs) {
    // Periodo reprovado nao volta pela quantidade — quem decide isso e a leitura.
    if (pr.check_periodo === false) continue;
    // Um humano ja decidiu: nao passa por cima.
    if (pr.validated_by) continue;

    const esperado = pacotes.get(`${pr.driver_id as string}|${pr.platform_name as string}`) ?? 0;
    const veredito = statusPorQuantidade(pr.read_packages as number, esperado, tolerancia);
    if (veredito === 'pendente') { semBase += 1; continue; } // planilha ainda nao tem ele

    const ok = veredito === 'confirmado';
    const { error: uErr } = await supabase.from('driverpay_delivery_proofs').update({
      status: ok ? 'validado' : 'recebido',
      check_status: ok ? 'ok' : 'divergente',
      check_qtd: ok,
      expected_packages: esperado,
      checked_at: new Date().toISOString(),
      next_check_at: null, // conta fechada: sai da fila
    }).eq('id', pr.id).eq('company_id', companyId);
    if (uErr) throwDbError(uErr);

    if (ok) {
      conferidos += 1;
      // Marca o espelho com a MESMA regra da edge function (05/08/2026): print que
      // bateu MARCA, mesmo que um humano tenha desmarcado antes — foi o pedido do
      // Victor depois do caso do ADRIANO, que ficou apagado com a conferência toda
      // verde. As duas pontas TÊM que decidir igual: se só uma remarcasse, o botão
      // mudaria de estado dependendo de o print ter vindo pelo app ou pela planilha.
      // Continua respeitando o liga/desliga e não mexe no que já está marcado.
      if (autoConfirmar && pr.payment_id) {
        const { data: pay } = await supabase.from('driverpay_payments')
          .select('espelho_conferido').eq('id', pr.payment_id).maybeSingle();
        if (!pay?.espelho_conferido) {
          await supabase.from('driverpay_payments').update({
            espelho_conferido: true,
            espelho_conferido_at: new Date().toISOString(),
            espelho_conferido_by: 'auto',
          }).eq('id', pr.payment_id).eq('company_id', companyId);
        }
      }
    } else {
      divergentes += 1;
    }
  }
  return { conferidos, divergentes, semBase };
};

/**
 * Aplica a correção da quantidade de pacotes escolhida em "Espelhos recebidos" e já
 * reconfere o print (04/08/2026).
 *
 * O plano vem de `planejarCorrecaoDePacotes` (a diferença cai na MAIOR rota — decisão do
 * Victor). Aqui só grava e manda reconferir: a reconferência é a MESMA que roda depois de
 * importar a planilha, então a regra de marcar o espelho é uma só, não duas parecidas.
 *
 * ⚠️ Mexe em DINHEIRO: `upsertPackage` já recalcula o total do pagamento a cada linha.
 * O veredito é sempre um clique do operador — nada aqui roda sozinho.
 */
export const aplicarCorrecaoDePacotes = async (
  companyId: string,
  periodId: string,
  paymentId: string,
  platformName: string,
  ajustes: readonly { route: string; para: number; rate: number }[],
  userId: string,
): Promise<{ conferidos: number; divergentes: number; semBase: number }> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  for (const a of ajustes) {
    await upsertPackage(companyId, paymentId, platformName, a.route, a.para, a.rate, userId);
  }
  // So o print DESTE entregador precisa ser reconferido — corrigir a contagem de um nao
  // muda a de ninguem mais. (Sem isto a tela travava: ~240 consultas por clique.)
  const { data: pay } = await supabase.from('driverpay_payments')
    .select('driver_id').eq('id', paymentId).maybeSingle();
  return reconferirPrintsComPlanilha(companyId, periodId, userId, pay?.driver_id as string | undefined);
};

/** Quem JA RECEBEU nesta quinzena, por (entregador, plataforma). */
/**
 * Desmarca o pagamento de um entregador nesta quinzena (pedido do Victor, 04/08/2026).
 *
 * A marca é gravada AUTOMATICAMENTE ao gerar relatório — inclusive numa geração feita
 * só pra conferir o layout. Sem isto, desfazer só por SQL. Apaga as marcas de TODAS as
 * plataformas dele no período: "desmarcar pagamento" é uma coisa só na cabeça de quem usa.
 *
 * Devolve quantas marcas saíram (0 = não havia nada, e a tela avisa em vez de mentir).
 */
export const unmarkPayment = async (
  companyId: string, periodId: string, driverId: string, userId: string,
): Promise<number> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { data, error } = await supabase
    .from('driverpay_payment_marks')
    .delete()
    .eq('company_id', companyId).eq('period_id', periodId).eq('driver_id', driverId)
    .select('id');
  if (error) throwDbError(error);
  return (data ?? []).length;
};

export const listPaymentMarks = async (
  companyId: string, periodId: string,
): Promise<PaymentMark[]> => {
  const { data, error } = await supabase
    .from('driverpay_payment_marks')
    .select('driver_id, platform_name, paid_at, deductions_applied')
    .eq('company_id', companyId).eq('period_id', periodId);
  if (error) throwDbError(error);
  return (data ?? []).map((r) => ({
    driverId: String(r.driver_id), platformName: String(r.platform_name), paidAt: String(r.paid_at),
    deductionsApplied: (r.deductions_applied as boolean | null) ?? null,
  }));
};

/**
 * Marca como PAGO os pares (entregador, plataforma) que sairam no relatorio.
 *
 * ⚠️ E o REGISTRO DE QUEM JA RECEBEU: guarda quem marcou e quando. Idempotente — remarcar
 * o mesmo par nao duplica nem apaga a data original (`ignoreDuplicates`), porque a data do
 * PRIMEIRO pagamento e a que o operador precisa ver no aviso.
 */
export const markPaymentDone = async (
  companyId: string,
  periodId: string,
  pares: readonly { driverId: string; platformName: string }[],
  /** 'manual' = marcado direto pelo botão da grade, sem gerar relatório (14/08/2026). */
  reportKind: 'geral' | 'simples' | 'manual',
  userId: string,
  /** Os vales/perdas foram descontados NESTE pagamento? (04/08/2026) */
  deductionsApplied = true,
): Promise<number> => {
  await ensurePerm(userId, 'driverpay.exportReport');
  if (pares.length === 0) return 0;
  const { error } = await supabase.from('driverpay_payment_marks').upsert(
    pares.map((p) => ({
      company_id: companyId, period_id: periodId, driver_id: p.driverId,
      platform_name: p.platformName, paid_by: userId, report_kind: reportKind,
      deductions_applied: deductionsApplied,
    })),
    { onConflict: 'company_id,period_id,driver_id,platform_name', ignoreDuplicates: true },
  );
  if (error) throwDbError(error);
  return pares.length;
};

// ────────────────────────────────────────────────────────────────────────────
// LIVRO-CAIXA DO DESCONTO DE VALE/PERDA (07/08/2026)
//
// O desconto virou SALDO: cada pessoa deve (vales + perdas) na quinzena e cada pagamento
// abate um pedaco, gravado aqui. Assim, pagar a Shopee e depois a eMile nao cobra duas
// vezes de quem entrega as duas, e cobra de quem so entrega a eMile.
// A regra de QUANTO abater e pura e mora em `src/utils/descontoSaldo.ts`.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Quanto ja foi abatido de cada driver nesta quinzena (driverId -> R$ somados).
 * Driver ausente do mapa = nada abatido ainda (deve tudo).
 */
export const listDeductionLedger = async (
  companyId: string, periodId: string,
): Promise<Map<string, number>> => {
  const { data, error } = await supabase
    .from('driverpay_deduction_ledger')
    .select('driver_id, amount')
    .eq('company_id', companyId).eq('period_id', periodId);
  if (error) throwDbError(error);
  const out = new Map<string, number>();
  for (const r of data ?? []) {
    const id = String((r as { driver_id: string }).driver_id);
    const v = Number((r as { amount: number | string }).amount) || 0;
    out.set(id, Math.round(((out.get(id) ?? 0) + v) * 100) / 100);
  }
  return out;
};

/**
 * Registra os abates de UM evento (uma planilha de pagamento, uma publicacao de espelho).
 *
 * ⚠️ Idempotente pelo par (source, sourceRef): repetir o MESMO evento nao abate de novo.
 * Pra relatorio o `sourceRef` e o id da rodada; pra espelho e a `platform_key` — assim
 * despublicar e republicar refaz o lancamento em vez de duplicar.
 *
 * Linhas com valor <= 0 sao descartadas: o banco so aceita abate positivo (CHECK), e
 * "abati zero" nao e um fato que precise existir.
 */
export const recordDeductions = async (
  companyId: string,
  periodId: string,
  linhas: readonly { driverId: string; amount: number }[],
  source: 'relatorio' | 'espelho',
  sourceRef: string,
  userId: string,
): Promise<number> => {
  await ensurePerm(userId, 'driverpay.exportReport');
  const validas = linhas.filter((l) => Number.isFinite(l.amount) && l.amount > 0);
  if (validas.length === 0) return 0;
  // upsert com ignoreDuplicates (e nao insert): num INSERT em lote, UMA linha repetida
  // derrubaria o lote inteiro e ninguem seria gravado. Assim a repetida e pulada e as
  // outras entram — mesmo padrao do `markPaymentDone`.
  const { error } = await supabase.from('driverpay_deduction_ledger').upsert(
    validas.map((l) => ({
      company_id: companyId, period_id: periodId, driver_id: l.driverId,
      amount: Math.round(l.amount * 100) / 100,
      source, source_ref: sourceRef, created_by: userId,
    })),
    { onConflict: 'company_id,period_id,driver_id,source,source_ref', ignoreDuplicates: true },
  );
  if (error) throwDbError(error);
  return validas.length;
};

/**
 * Saldo devedor de vale/perda em quinzenas JÁ FECHADAS (14/08/2026, sub-fase A do pedido
 * do Victor "jogar pra próxima quinzena"). Antes disso não existia em lugar nenhum um jeito
 * de ver quem ficou devendo depois que a quinzena fecha — o valor fica preso sem ninguém
 * perceber, porque `saldoDevedor()` só era chamado pra quinzena aberta.
 *
 * Uma consulta por período fechado (getPayments + livro-caixa) — é ação sob demanda (botão),
 * não algo carregado toda hora, então N+1 aqui é aceitável.
 */
export const listClosedPeriodsDebt = async (
  companyId: string,
  periods: readonly DriverPaymentPeriod[],
): Promise<SaldoQuinzenaFechada[]> => {
  const closed = periods.filter((p) => p.status === 'concluido');
  const out: SaldoQuinzenaFechada[] = [];
  for (const period of closed) {
    const [payments, ledger, carriedOut] = await Promise.all([
      getPayments(period.id, companyId),
      listDeductionLedger(companyId, period.id),
      // Já migrado pra outra quinzena conta como "abatido" aqui — sem isso o mesmo saldo
      // continuaria aparecendo como pendente depois de já ter sido movido (15/08/2026).
      listCarryoverFrom(companyId, period.id),
    ]);
    const pessoas = payments.map((pay) => ({
      driverId: pay.driver_id,
      name: pay.driver_name_snapshot,
      total: (pay.discounts ?? []).reduce((s, d) => s + d.amount, 0)
        + (pay.vales ?? []).reduce((s, v) => s + v.amount, 0),
      jaAbatido: (ledger.get(pay.driver_id) ?? 0) + (carriedOut.get(pay.driver_id) ?? 0),
    }));
    out.push(...saldoDevedorDoPeriodo(period.id, period.label, pessoas));
  }
  return out.sort((a, b) => b.saldo - a.saldo);
};

// ────────────────────────────────────────────────────────────────────────────
// SALDO HERDADO ENTRE QUINZENAS (15/08/2026, sub-fase B do pedido do Victor)
// Ver migration `20260815120000_driverpay_deduction_carryover.sql` pro porquê da tabela
// própria. `listCarryoverFrom` mostra o que JÁ saiu de uma quinzena fechada (usado pra
// não contar de novo como pendente em `listClosedPeriodsDebt`); `listCarryoverTo` mostra
// o que CHEGOU numa quinzena aberta (usado por `buildRows` pra alimentar `deductionsOf`).
// ────────────────────────────────────────────────────────────────────────────

const somaPorDriver = (rows: readonly { driver_id: unknown; amount: unknown }[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.driver_id);
    const v = Number(r.amount) || 0;
    out.set(id, Math.round(((out.get(id) ?? 0) + v) * 100) / 100);
  }
  return out;
};

export const listCarryoverFrom = async (companyId: string, fromPeriodId: string): Promise<Map<string, number>> => {
  const { data, error } = await supabase
    .from('driverpay_deduction_carryover')
    .select('driver_id, amount')
    .eq('company_id', companyId).eq('from_period_id', fromPeriodId);
  if (error) throwDbError(error);
  return somaPorDriver(data ?? []);
};

export const listCarryoverTo = async (companyId: string, toPeriodId: string): Promise<Map<string, number>> => {
  const { data, error } = await supabase
    .from('driverpay_deduction_carryover')
    .select('driver_id, amount')
    .eq('company_id', companyId).eq('to_period_id', toPeriodId);
  if (error) throwDbError(error);
  return somaPorDriver(data ?? []);
};

/**
 * Migra o saldo devedor de UM driver de uma quinzena fechada pra uma aberta.
 *
 * Idempotente pela UNIQUE (company_id, from_period_id, driver_id) — tentar migrar o mesmo
 * saldo de novo (duplo clique, ou pra outro destino) dá erro claro em vez de duplicar.
 */
export const recordCarryover = async (
  companyId: string,
  fromPeriodId: string,
  toPeriodId: string,
  driverId: string,
  amount: number,
  userId: string,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageDiscount');
  if (!(amount > 0)) throw new Error('Nada a migrar — saldo zerado.');
  const { error } = await supabase.from('driverpay_deduction_carryover').insert({
    company_id: companyId, from_period_id: fromPeriodId, to_period_id: toPeriodId,
    driver_id: driverId, amount: Math.round(amount * 100) / 100, created_by: userId,
  });
  if (error) {
    if (error.code === '23505') throw new Error('Esse saldo já foi migrado antes — não dá pra migrar de novo.');
    throwDbError(error);
  }
};

/** Um print recebido, com o driver resolvido, pro painel. */
export interface DeliveryProofRow {
  id: string;
  driverId: string;
  driverName: string;
  platformName: string;
  filePath: string;
  fileType: string | null;
  originalFilename: string | null;
  /** Impressão digital do arquivo — o painel usa pra avisar de print repetido entre drivers. */
  fileSha256: string | null;
  /** 'app' = o driver/líder enviou pelo portal; 'painel' = o operador anexou. */
  uploadSource: string;
  uploadedAt: string;
  /** 'recebido' | 'validado' | 'rejeitado'. */
  status: string;
  rejectReason: string | null;
  /** 'ok' | 'divergente' | 'periodo_errado' | 'ilegivel' | 'pendente' | null. */
  checkStatus: string | null;
  checkQtd: boolean | null;
  checkPeriodo: boolean | null;
  /** O que a leitura entendeu do print. */
  readPackages: number | null;
  readStartDate: string | null;
  readEndDate: string | null;
  /** O que a planilha dizia NA HORA da conferência (o painel compara com o de hoje). */
  expectedPackages: number | null;
  checkDetails: Record<string, unknown> | null;
  checkedAt: string | null;
  /** Fila: preenchido = esperando reconferência automática. */
  nextCheckAt: string | null;
  checkAttempts: number;
  validatedBy: string | null;
}

export const listDeliveryProofs = async (
  companyId: string, periodId: string,
): Promise<DeliveryProofRow[]> => {
  const { data, error } = await supabase
    .from('driverpay_delivery_proofs')
    .select('id, driver_id, platform_name, file_path, file_type, original_filename, file_sha256, upload_source, uploaded_at, status, reject_reason, check_status, check_qtd, check_periodo, read_packages, read_start_date, read_end_date, expected_packages, check_details, checked_at, next_check_at, check_attempts, validated_by, driverpay_drivers(name)')
    .eq('company_id', companyId)
    .eq('period_id', periodId)
    .order('uploaded_at', { ascending: true });
  if (error) throwDbError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const drvRaw = r.driverpay_drivers;
    const drv = (Array.isArray(drvRaw) ? drvRaw[0] : drvRaw) as { name?: string } | null;
    return {
      id: String(r.id),
      driverId: String(r.driver_id),
      driverName: drv?.name ?? '(sem nome)',
      platformName: String(r.platform_name),
      filePath: String(r.file_path),
      fileType: (r.file_type as string | null) ?? null,
      originalFilename: (r.original_filename as string | null) ?? null,
      fileSha256: (r.file_sha256 as string | null) ?? null,
      uploadSource: (r.upload_source as string) ?? 'app',
      uploadedAt: String(r.uploaded_at),
      status: (r.status as string) ?? 'recebido',
      rejectReason: (r.reject_reason as string | null) ?? null,
      checkStatus: (r.check_status as string | null) ?? null,
      checkQtd: (r.check_qtd as boolean | null) ?? null,
      checkPeriodo: (r.check_periodo as boolean | null) ?? null,
      readPackages: (r.read_packages as number | null) ?? null,
      readStartDate: (r.read_start_date as string | null) ?? null,
      readEndDate: (r.read_end_date as string | null) ?? null,
      expectedPackages: (r.expected_packages as number | null) ?? null,
      checkDetails: (r.check_details as Record<string, unknown> | null) ?? null,
      checkedAt: (r.checked_at as string | null) ?? null,
      nextCheckAt: (r.next_check_at as string | null) ?? null,
      checkAttempts: Number(r.check_attempts ?? 0),
      validatedBy: (r.validated_by as string | null) ?? null,
    };
  });
};

/**
 * Validar/recusar um print NA MÃO — a palavra final é sempre do operador.
 *
 * Validar aqui também sai da fila (`next_check_at = null`): se um humano decidiu,
 * o automático não tem mais o que reconferir.
 */
export const setProofStatus = async (
  companyId: string, proofId: string, status: 'validado' | 'rejeitado' | 'recebido',
  userId: string, rejectReason?: string,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { data: atualizado, error } = await supabase
    .from('driverpay_delivery_proofs')
    .update({
      status,
      reject_reason: status === 'rejeitado' ? (rejectReason ?? null) : null,
      validated_at: status === 'validado' ? new Date().toISOString() : null,
      validated_by: status === 'validado' ? userId : null,
      next_check_at: null,
    })
    .eq('id', proofId).eq('company_id', companyId)
    .select('payment_id')
    .maybeSingle();
  if (error) throwDbError(error);

  // 🔴 O botão SEMPRE prometeu isto — o title dele é "Aceitar este print (marca o espelho
  // conferido)" — mas o espelho não era marcado. Ficou invisível enquanto existia a coluna
  // "Print" mostrando 1/1 do lado; com a coluna fora (05/08), aceitar o print não mexia em
  // nada na grade e a promessa virava mentira na cara de quem clica.
  //
  // Aqui é decisão HUMANA (alguém olhou a foto e aceitou), então não passa pelo liga/desliga
  // da confirmação automática e fica gravada no nome de quem clicou.
  if (status === 'validado' && atualizado?.payment_id) {
    const { data: pay } = await supabase.from('driverpay_payments')
      .select('espelho_conferido').eq('id', atualizado.payment_id).maybeSingle();
    if (pay && !pay.espelho_conferido) {
      const { error: mErr } = await supabase.from('driverpay_payments').update({
        espelho_conferido: true,
        espelho_conferido_at: new Date().toISOString(),
        espelho_conferido_by: userId,
      }).eq('id', atualizado.payment_id).eq('company_id', companyId);
      if (mErr) throwDbError(mErr);
    }
  }
};

export const deleteDeliveryProof = async (
  companyId: string, proofId: string, userId: string,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const { data: apagado, error } = await supabase
    .from('driverpay_delivery_proofs')
    .delete().eq('id', proofId).eq('company_id', companyId)
    .select('file_path')
    .maybeSingle();
  if (error) throwDbError(error);
  // O ARQUIVO sai junto (19/08/2026): antes só a linha era apagada e a foto ficava
  // órfã no bucket pra sempre. A policy `driverpay_proofs_master_all` é FOR ALL
  // (cobre DELETE pro 2626/9999) — a "trava do storage" do comentário antigo não
  // existia. Linha primeiro (a ação que importa), arquivo em melhor esforço: se o
  // remove falhar fica um órfão como antes, nunca uma linha apontando pro nada.
  const path = (apagado as { file_path?: string | null } | null)?.file_path;
  if (path) {
    const { error: rmErr } = await supabase.storage.from(PROOF_BUCKET).remove([path]);
    if (rmErr) console.warn('Não foi possível remover o print do Storage:', rmErr.message);
  }
};

export const PROOF_BUCKET = 'driverpay-delivery-proofs';

/** Link temporário (5 min) pra ver/baixar o print. Bucket é privado. */
export const proofFileUrl = async (path: string): Promise<string | null> => {
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
};

/** Configuração do print por empresa. Sem linha na tabela = padrão. */
export interface ProofSettings {
  /** Marcar "espelho conferido" sozinho quando o print bate. */
  autoConfirm: boolean;
  /** Folga aceita na quantidade. 0 = tem que bater exato (decisão do Victor). */
  tolerancePackages: number;
}

export const getProofSettings = async (companyId: string): Promise<ProofSettings> => {
  const { data, error } = await supabase
    .from('driverpay_settings')
    .select('proof_auto_confirm, proof_tolerance_packages')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throwDbError(error);
  return {
    autoConfirm: data?.proof_auto_confirm !== false,
    tolerancePackages: Number(data?.proof_tolerance_packages ?? 0) || 0,
  };
};

export const setProofSettings = async (
  companyId: string, settings: Partial<ProofSettings>, userId: string,
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.editDriver');
  const patch: Record<string, unknown> = { company_id: companyId, updated_by: userId, updated_at: new Date().toISOString() };
  if (settings.autoConfirm !== undefined) patch.proof_auto_confirm = settings.autoConfirm;
  if (settings.tolerancePackages !== undefined) patch.proof_tolerance_packages = settings.tolerancePackages;
  const { error } = await supabase
    .from('driverpay_settings').upsert(patch, { onConflict: 'company_id' });
  if (error) throwDbError(error);
};
