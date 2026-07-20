/**
 * Aba "Pagamentos Driver" (iMile CTGA) — gerador de DADOS PUROS do espelho.
 *
 * Espelha o padrão de `mirrorGenerator.ts` (espelho de ponto): funções puras,
 * sem DOM e sem jsPDF, testáveis isoladamente. A camada de apresentação
 * (`driverMirrorPdf.ts`) consome estes tipos/dados e NÃO recalcula dinheiro —
 * os totais vêm prontos do serviço (`driverpay_payment_computed` é a fonte
 * única da fórmula), exatamente como o holerite recebe `totalNet` pronto.
 *
 * Fórmula (calculada no banco, apenas refletida aqui):
 *   total_net = Σ(pacotes × rate) − Σ(descontos) − Σ(vales)   (pode ser negativo)
 *
 * Os formatadores de moeda/quantidade vivem aqui e são reexportados para o PDF,
 * evitando duplicação. `formatDateBR`/`formatCnpj` são reaproveitados de
 * `mirrorGenerator.ts` (mesmos helpers do espelho de ponto).
 */

import type {
  DriverPayment,
  DriverPaymentPackage,
  DriverPeriodStatus,
} from '../services/driverPay';
import { formatDateBR, formatCnpj } from './mirrorGenerator';

// Reexport dos helpers de data (fonte única — não reimplementa).
export { formatDateBR, formatCnpj };

// ─── Formatadores (Intl pt-BR) ────────────────────────────────────────────────

/** Moeda BRL — espelha `holeritePdf.fmtBRL` / mockup `money()`. */
export function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/** Quantidade inteira com separador de milhar pt-BR — espelha o mockup `int()`. */
export function fmtQty(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n);
}

// ─── Tipos de apresentação (contrato com o Agente Componentes) ────────────────

/** Uma cidade/rota do driver. O breakdown por plataforma só é usado na tabela multi-rota. */
export interface DriverRoute {
  city: string;
  /** pacotes por plataforma (nome → qtd) nesta rota. Ausente quando o driver tem 1 rota. */
  packagesByPlatform?: Record<string, number> | null;
  /** total de pacotes da rota (Σ plataformas). Informativo. */
  totalPackages?: number | null;
}

/** Linha de pacotes agregada por plataforma (eMile, ANJUN, …). subtotal = Σ(pacotes×rate). */
export interface DriverPlatformLine {
  platform: string;
  packages: number;
  unitValue: number;
  subtotal: number;
  /**
   * Espelhos (2026-07-20): driver com MAIS DE UMA rota com pacotes na plataforma
   * gera uma linha POR ROTA (cada uma com a taxa real daquela rota) — nunca uma
   * linha única com taxa média. `route` identifica a rota da linha; ausente/null
   * quando a plataforma tem uma rota só (linha agregada, como sempre foi).
   */
  route?: string | null;
  /**
   * Espelhos (2026-07-19): coluna/linha destacada em amarelo. Como o array
   * `platforms` só contém plataformas com pacotes>0, a regra de presença do
   * Victor (não destacar onde a plataforma não existe) sai de graça.
   */
  highlight?: boolean;
  /** Aviso grande/chamativo da plataforma (acoplado ao destaque; com setas). */
  notice?: string | null;
  /**
   * Espelhos (2026-07-20): valor da plataforma sai numa faixa separada e FORA do
   * TOTAL A RECEBER exibido (acoplado ao destaque). Só afeta a APRESENTAÇÃO dos
   * espelhos — os totais persistidos continuam cheios.
   */
  separateValue?: boolean;
}

/** Desconto: valor + ID do pacote (coluna "ID PACOTE" da planilha) + motivo opcional. */
export interface DriverDiscountLine {
  packageId: string;
  value: number;
  description?: string | null;
  /** Marca do pacote (2026-07-19): 'PNR' | 'LOST' | null — usada na seção de descontos do espelho de grupo. */
  status?: 'PNR' | 'LOST' | null;
}

/** Vale/adiantamento: valor + data + observação. */
export interface DriverValeLine {
  /** YYYY-MM-DD ou '' quando não informada. */
  date: string;
  value: number;
  note?: string | null;
}

export interface DriverMirrorTotals {
  packagesValue: number;
  discountsValue: number;
  valesValue: number;
  /** TOTAL A RECEBER = packagesValue − discountsValue − valesValue (pode ser negativo). */
  toReceive: number;
}

export interface DriverMirrorCompany {
  name: string;
  cnpj?: string | null;
  city?: string | null;
}

export interface DriverMirrorPeriod {
  /** Rótulo humano ("1ª QUINZENA DE JUNHO/2026") — fonte da verdade do título. */
  label: string;
  start?: string | null;
  end?: string | null;
  /** Quando 'concluido', o espelho ganha o carimbo "CONCLUÍDO". */
  status?: DriverPeriodStatus;
}

/**
 * Aviso de corte das notas (2026-07-19): faixa amarela presente em TODO espelho.
 * "as notas deverão ser enviadas até as {time}H do dia {date}…
 *  Caso exceda o horário de corte seu pagamento vai ocorrer dia {lateDate}"
 */
export interface MirrorCutoffLine {
  time: string;
  date: string;
  lateDate: string;
}

export interface DriverMirrorData {
  company: DriverMirrorCompany;
  period: DriverMirrorPeriod;
  /** Aviso de corte (injetado pelo diálogo na geração; null/ausente = sem faixa). */
  cutoff?: MirrorCutoffLine | null;
  driver: {
    name: string;
    routes: DriverRoute[];
    group?: string | null;
    pixKey?: string | null;
  };
  platforms: DriverPlatformLine[];
  discounts: DriverDiscountLine[];
  vales: DriverValeLine[];
  totals: DriverMirrorTotals;
  /** default: `new Date().toLocaleString('pt-BR')` no momento da geração do PDF. */
  generatedAt?: string;
}

export interface DriverGroupMirrorTotals {
  driverCount: number;
  packagesValue: number;
  discountsValue: number;
  valesValue: number;
  toReceive: number;
}

/** Espelho de grupo: resumo do grupo + os espelhos individuais dos membros. */
export interface DriverGroupMirrorData {
  company: DriverMirrorCompany;
  period: DriverMirrorPeriod;
  /** Aviso de corte (injetado pelo diálogo na geração; null/ausente = sem faixa). */
  cutoff?: MirrorCutoffLine | null;
  groupName: string;
  drivers: DriverMirrorData[];
  groupTotals: DriverGroupMirrorTotals;
  generatedAt?: string;
}

// ─── Builders (DriverPayment do serviço → dados de apresentação) ──────────────

/**
 * Agrega os pacotes (por plataforma×rota) em uma linha por plataforma.
 * `unitValue` é a taxa efetiva (Σsubtotal/Σpacotes) — para taxa uniforme por
 * plataforma (o caso real) equivale exatamente ao valor configurado.
 * `platformOrder` (opcional) fixa a ordem das colunas (ex.: eMile antes de ANJUN);
 * plataformas não listadas seguem por ordem de primeira aparição.
 */
export function aggregatePlatforms(
  packages: DriverPaymentPackage[],
  platformOrder?: string[] | null,
): DriverPlatformLine[] {
  const acc = new Map<string, { packages: number; subtotal: number; firstRate: number }>();
  const seen: string[] = [];
  for (const p of packages) {
    let entry = acc.get(p.platform_name);
    if (!entry) {
      entry = { packages: 0, subtotal: 0, firstRate: p.rate_snapshot };
      acc.set(p.platform_name, entry);
      seen.push(p.platform_name);
    }
    entry.packages += p.packages;
    entry.subtotal += p.packages * p.rate_snapshot;
  }

  const ordered =
    platformOrder && platformOrder.length
      ? [
          ...platformOrder.filter((name) => acc.has(name)),
          ...seen.filter((name) => !platformOrder.includes(name)),
        ]
      : seen;

  return ordered.map((name) => {
    const entry = acc.get(name)!;
    const unitValue = entry.packages > 0 ? entry.subtotal / entry.packages : entry.firstRate;
    return { platform: name, packages: entry.packages, unitValue, subtotal: entry.subtotal };
  });
}

/** Deriva as rotas (com breakdown por plataforma) a partir dos pacotes. */
export function deriveRoutes(packages: DriverPaymentPackage[]): DriverRoute[] {
  const byCity = new Map<string, Record<string, number>>();
  const order: string[] = [];
  for (const p of packages) {
    const city = (p.route || '').trim() || '—';
    let rec = byCity.get(city);
    if (!rec) {
      rec = {};
      byCity.set(city, rec);
      order.push(city);
    }
    rec[p.platform_name] = (rec[p.platform_name] ?? 0) + p.packages;
  }
  return order.map((city) => {
    const packagesByPlatform = byCity.get(city)!;
    const totalPackages = Object.values(packagesByPlatform).reduce((s, n) => s + n, 0);
    return { city, packagesByPlatform, totalPackages };
  });
}

export interface BuildDriverMirrorInput {
  company: DriverMirrorCompany;
  period: DriverMirrorPeriod;
  /** Pagamento do serviço com `packages`/`discounts`/`vales` embutidos (via getPayments). */
  payment: DriverPayment;
  pixKey?: string | null;
  group?: string | null;
  /** Sobrescreve as rotas derivadas dos pacotes (ex.: incluir cidade sem pacote). */
  routesOverride?: DriverRoute[] | null;
  /** Ordem das plataformas nas tabelas. */
  platformOrder?: string[] | null;
  generatedAt?: string;
}

/**
 * Constrói `DriverMirrorData` a partir de um `DriverPayment` do serviço.
 * Money vem dos totais persistidos (fonte única do cálculo); pacotes/rotas são
 * agregados dos filhos apenas para exibição.
 */
export function buildDriverMirrorData(input: BuildDriverMirrorInput): DriverMirrorData {
  const { payment } = input;
  const packages = payment.packages ?? [];

  const platforms = aggregatePlatforms(packages, input.platformOrder);

  let routes = input.routesOverride ?? deriveRoutes(packages);
  if (routes.length === 0) {
    const snapshot = (payment.route_snapshot || '').trim();
    routes = snapshot
      ? snapshot
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
          .map((city) => ({ city }))
      : [];
  }

  const discounts: DriverDiscountLine[] = (payment.discounts ?? []).map((d) => ({
    packageId: d.package_code ?? '',
    value: d.amount,
    description: d.observation,
  }));

  const vales: DriverValeLine[] = (payment.vales ?? []).map((v) => ({
    date: v.vale_date ?? '',
    value: v.amount,
    note: v.observation,
  }));

  const totals: DriverMirrorTotals = {
    packagesValue: payment.total_packages_amount,
    discountsValue: payment.total_discounts,
    valesValue: payment.total_vales,
    toReceive: payment.total_net,
  };

  return {
    company: input.company,
    period: input.period,
    driver: {
      name: payment.driver_name_snapshot,
      routes,
      group: input.group ?? null,
      pixKey: input.pixKey ?? null,
    },
    platforms,
    discounts,
    vales,
    totals,
    generatedAt: input.generatedAt,
  };
}

export interface BuildDriverGroupMirrorInput {
  company: DriverMirrorCompany;
  period: DriverMirrorPeriod;
  groupName: string;
  /** Espelhos individuais já construídos via `buildDriverMirrorData`. */
  drivers: DriverMirrorData[];
  generatedAt?: string;
}

/** Constrói `DriverGroupMirrorData` somando os totais dos espelhos individuais. */
export function buildDriverGroupMirrorData(
  input: BuildDriverGroupMirrorInput,
): DriverGroupMirrorData {
  const groupTotals = input.drivers.reduce<DriverGroupMirrorTotals>(
    (acc, d) => ({
      driverCount: acc.driverCount + 1,
      packagesValue: acc.packagesValue + d.totals.packagesValue,
      discountsValue: acc.discountsValue + d.totals.discountsValue,
      valesValue: acc.valesValue + d.totals.valesValue,
      toReceive: acc.toReceive + d.totals.toReceive,
    }),
    { driverCount: 0, packagesValue: 0, discountsValue: 0, valesValue: 0, toReceive: 0 },
  );

  return {
    company: input.company,
    period: input.period,
    groupName: input.groupName,
    drivers: input.drivers,
    groupTotals,
    generatedAt: input.generatedAt,
  };
}

/** Nome do driver → cidades unidas ("Caratinga, Entre Folhas, Vargem Alegre"). */
export function joinRouteCities(routes: DriverRoute[]): string {
  return routes
    .map((r) => r.city)
    .filter((c) => c && c.trim().length > 0)
    .join(', ');
}

/**
 * Pacotes de um driver numa plataforma específica (0 se ausente).
 * SOMA todas as linhas da plataforma — multi-rota (2026-07-20) pode gerar uma
 * linha por rota para a mesma plataforma.
 */
export function packagesForPlatform(data: DriverMirrorData, platform: string): number {
  return data.platforms.reduce((s, p) => (p.platform === platform ? s + p.packages : s), 0);
}

/** Rótulo da linha de plataforma: "SHOPEE — COLETA" quando a linha é de uma rota. */
export function platformLineLabel(p: DriverPlatformLine): string {
  return p.route ? `${p.platform} — ${p.route}` : p.platform;
}

/** Total de uma plataforma com "valor separado" (soma por nome; 2026-07-20). */
export interface SeparatedPlatformTotal {
  platform: string;
  packages: number;
  amount: number;
}

/**
 * Totais das plataformas com `separateValue` num conjunto de linhas (ordem de
 * primeira aparição). Multi-rota soma as linhas da mesma plataforma.
 */
export function separatedPlatformTotals(platforms: DriverPlatformLine[]): SeparatedPlatformTotal[] {
  const acc = new Map<string, SeparatedPlatformTotal>();
  const order: string[] = [];
  for (const p of platforms) {
    if (!p.separateValue) continue;
    let entry = acc.get(p.platform);
    if (!entry) {
      entry = { platform: p.platform, packages: 0, amount: 0 };
      acc.set(p.platform, entry);
      order.push(p.platform);
    }
    entry.packages += p.packages;
    entry.amount += p.subtotal;
  }
  return order.map((name) => acc.get(name)!);
}

/** Soma (R$) de tudo que sai separado do total exibido nos espelhos. */
export function separatedAmount(platforms: DriverPlatformLine[]): number {
  return platforms.reduce((s, p) => (p.separateValue ? s + p.subtotal : s), 0);
}

/** União ordenada dos nomes de plataforma presentes num conjunto de espelhos. */
export function collectPlatformNames(list: DriverMirrorData[]): string[] {
  const seen: string[] = [];
  for (const d of list) {
    for (const p of d.platforms) {
      if (!seen.includes(p.platform)) seen.push(p.platform);
    }
  }
  return seen;
}
