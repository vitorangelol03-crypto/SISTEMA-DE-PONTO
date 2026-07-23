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

export const createDriver = async (
  companyId: string,
  userId: string,
  data: { name: string; route?: string | null; pix_key?: string | null; cpf?: string | null; phone?: string | null; notes?: string | null }
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
      notes: data.notes ?? null,
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throwDbError(error);
  return mapDriver(row);
};

export const updateDriver = async (
  id: string,
  userId: string,
  updates: Partial<Pick<Driver, 'name' | 'route' | 'pix_key' | 'cpf' | 'phone' | 'active' | 'notes'>>
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

  // Taxa efetiva ANTIGA de cada membro (config individual ?? default da plataforma).
  const { data: platRow, error: platErr } = await supabase
    .from('driverpay_platforms')
    .select('name, default_rate')
    .eq('id', platformId)
    .single();
  if (platErr) throwDbError(platErr);
  const platformName = (platRow as { name: string }).name;
  const platformDefault = num((platRow as { default_rate: unknown }).default_rate);
  const { data: oldRows, error: oldErr } = await supabase
    .from('driverpay_platform_rates')
    .select('driver_id, rate')
    .eq('company_id', companyId)
    .eq('platform_id', platformId)
    .in('driver_id', memberIds);
  if (oldErr) throwDbError(oldErr);
  const oldByDriver = new Map<string, number>(
    (oldRows || []).map((r: Record<string, unknown>) => [r.driver_id as string, num(r.rate)])
  );

  // Grava a config nova de todos os membros + o default do grupo.
  const rows = memberIds.map((driverId) => ({ company_id: companyId, driver_id: driverId, platform_id: platformId, rate, updated_by: userId }));
  const { error } = await supabase.from('driverpay_platform_rates').upsert(rows, { onConflict: 'driver_id,platform_id' });
  if (error) throwDbError(error);
  await updateGroup(groupId, userId, { default_rate: rate });

  // Reflete nos pacotes já lançados das quinzenas abertas (rotas na taxa antiga).
  for (const driverId of memberIds) {
    const oldRate = oldByDriver.get(driverId) ?? platformDefault;
    if (oldRate === rate) continue;
    const { data: pays, error: payErr } = await supabase
      .from('driverpay_payments')
      .select('id, driverpay_periods!inner(status)')
      .eq('company_id', companyId)
      .eq('driver_id', driverId)
      .eq('driverpay_periods.status', 'aberto');
    if (payErr) throwDbError(payErr);
    for (const pay of pays || []) {
      const paymentId = (pay as { id: string }).id;
      const { error: pkErr } = await supabase
        .from('driverpay_payment_packages')
        .update({ rate_snapshot: rate })
        .eq('payment_id', paymentId)
        .eq('platform_name', platformName)
        .eq('rate_snapshot', oldRate);
      if (pkErr) throwDbError(pkErr);
      await recomputePaymentTotals(paymentId);
    }
  }
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
  const { error: e1 } = await supabase
    .from('driverpay_payments')
    .delete()
    .eq('period_id', periodId)
    .eq('company_id', companyId);
  if (e1) throwDbError(e1);
  const { error: e2 } = await supabase.from('driverpay_periods').delete().eq('id', periodId).eq('company_id', companyId);
  if (e2) throwDbError(e2);
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
    const path = `${companyId}/${paymentId}/${discountId}-${i + 1}.${proofExt(blob)}`;
    const { error: upErr } = await supabase.storage
      .from(DISCOUNT_PROOF_BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
    if (upErr) console.warn('Upload da prova de desconto falhou:', upErr.message);
    else paths[i] = path;
  }

  // Video de prova (complementar): sobe apos as imagens, no mesmo bucket.
  let videoPath: string | null = null;
  if (video) {
    const path = `${companyId}/${paymentId}/${discountId}-video.${videoExt(video)}`;
    const { error: vidErr } = await supabase.storage
      .from(DISCOUNT_PROOF_BUCKET)
      .upload(path, video, { contentType: video.type || 'video/mp4', upsert: true });
    if (vidErr) console.warn('Upload do video de prova falhou:', vidErr.message);
    else videoPath = path;
  }

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
  pdf: Blob;
  userId: string;
  groupId?: string | null;
}

/**
 * Publica UM espelho (PDF ja gerado) pro app do driver: sobe o PDF no bucket privado
 * e registra a publicacao. Re-publicar substitui a anterior do mesmo (periodo, driver):
 * o arquivo e sobrescrito (upsert) e a linha antiga e trocada — o driver ve sempre 1
 * espelho atual por quinzena, nao uma pilha de duplicatas.
 */
export const publishDriverMirror = async (i: PublishMirrorInput): Promise<void> => {
  await ensurePerm(i.userId, 'driverpay.generateMirror');
  const path = `${i.companyId}/${i.periodId}/${i.driverId}.pdf`;

  const { error: upErr } = await supabase.storage
    .from(DRIVER_MIRRORS_BUCKET)
    .upload(path, i.pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`Falha ao subir o PDF do espelho: ${upErr.message}`);

  // Troca a publicacao anterior do mesmo periodo+driver (arquivo ja foi sobrescrito).
  const { error: delErr } = await supabase
    .from('driverpay_mirror_publications')
    .delete()
    .eq('company_id', i.companyId)
    .eq('period_id', i.periodId)
    .eq('driver_id', i.driverId);
  if (delErr) throwDbError(delErr);

  const { error } = await supabase.from('driverpay_mirror_publications').insert([{
    company_id: i.companyId,
    period_id: i.periodId,
    driver_id: i.driverId,
    scope: i.scope,
    group_id: i.groupId ?? null,
    platform_filter: i.platformFilter,
    pdf_path: path,
    delivered_by: i.userId,
  }]);
  if (error) throwDbError(error);
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
): Promise<void> => {
  await ensurePerm(userId, 'driverpay.manageDiscount');
  const upd: Record<string, unknown> = {};
  if (data.amount !== undefined) upd.amount = data.amount;
  if (data.packageCode !== undefined) upd.package_code = data.packageCode;
  if (data.observation !== undefined) upd.observation = data.observation;
  if (data.packageStatus !== undefined) upd.package_status = data.packageStatus;
  if (Object.keys(upd).length === 0) return;
  const { error } = await supabase.from('driverpay_discounts').update(upd).eq('id', id).eq('company_id', companyId);
  if (error) throwDbError(error);
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

/** Drivers ativos + apelidos aprendidos, para casar os nomes vindos da planilha. */
export const getDriverMatchContext = async (
  companyId: string,
): Promise<{ drivers: { id: string; name: string }[]; aliases: { alias_norm: string; driver_id: string }[] }> => {
  const [dRes, aRes] = await Promise.all([
    supabase.from('driverpay_drivers').select('id, name').eq('company_id', companyId).eq('active', true),
    supabase.from('driverpay_driver_aliases').select('alias_norm, driver_id').eq('company_id', companyId),
  ]);
  if (dRes.error) throwDbError(dRes.error);
  if (aRes.error) throwDbError(aRes.error);
  return {
    drivers: (dRes.data ?? []) as { id: string; name: string }[],
    aliases: (aRes.data ?? []) as { alias_norm: string; driver_id: string }[],
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
  const ratesByDriver = new Map<string, Record<string, number>>();
  const createdByRaw = new Map<string, string>();

  let driversCreated = 0;
  let aliasesLearned = 0;
  let packagesApplied = 0;
  let ignored = 0;
  const affected = new Set<string>();

  for (const it of items) {
    if (it.resolution.kind === 'ignore') {
      ignored += 1;
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
