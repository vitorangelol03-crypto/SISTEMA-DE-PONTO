/**
 * Tipos e helpers puros da aba "Pagamentos Driver".
 *
 * Este modulo concentra:
 *  - formatadores (BRL / inteiro pt-BR);
 *  - o modelo de linha editavel da grade (DriverRowData) e sua derivacao a
 *    partir dos DriverPayment vindos do servico;
 *  - o calculo da formula (fonte unica no frontend, espelhando a view
 *    driverpay_payment_computed do banco): net = pacotes*rate - descontos - vales;
 *  - a montagem dos dados do ESPELHO (individual/grupo) e do RELATORIO GERAL,
 *    no formato exato exportado por ../../utils/driverMirrorPdf e ../../utils/driverReport.
 *
 * Nada aqui toca banco: recebe dados prontos do servico e devolve estruturas de
 * apresentacao. Toda escrita passa pelo servico driverPay.ts (que faz ensurePerm + RLS).
 */
import type { Company } from '../../services/database';
import type {
  Driver,
  DriverPlatform,
  DriverPayment,
  DriverPaymentPeriod,
  DriverDiscount,
  DriverVale,
} from '../../services/driverPay';
import type { DriverMirrorData, DriverGroupMirrorData } from '../../utils/driverMirrorPdf';
import type { DriverReportRow } from '../../utils/driverReport';

// ─── Formatadores ────────────────────────────────────────────────────────────

export const formatBRL = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export const formatInt = (n: number): string =>
  new Intl.NumberFormat('pt-BR').format(Math.round(n));

/** Sanitiza um trecho para uso em nome de arquivo (espelha holeritePdf/MirrorMassDialog). */
export const sanitizeFile = (s: string): string =>
  (s || 'arquivo').replace(/\s+/g, '_').replace(/[^\w\-.]/g, '');

// ─── Modelo de linha editavel da grade ───────────────────────────────────────

/** Uma rota/cidade do driver, com os pacotes por plataforma daquela rota. */
export interface RouteLine {
  route: string;
  /** platformName -> pacotes */
  packages: Record<string, number>;
  /** platformName -> id da linha driverpay_payment_packages (para delete/rename) */
  packageIds: Record<string, string>;
  /**
   * platformName -> valor por pacote DESTA rota (rate_snapshot do pacote).
   * Taxa por rota: rota 1 pode ser 2,00 e rota 2 pode ser 2,50 na mesma plataforma.
   * Ausente/rota vazia => cai no fallback row.ratesByPlatform[platform].
   */
  rates: Record<string, number>;
}

/** Linha da grade: um pagamento (driver x periodo) com rotas, taxas, descontos e vales. */
export interface DriverRowData {
  paymentId: string;
  driverId: string;
  name: string;
  route: string | null;
  groupName: string | null;
  routes: RouteLine[];
  /** platformName -> valor por pacote (snapshot do pacote, ou taxa do driver, ou default) */
  ratesByPlatform: Record<string, number>;
  discounts: DriverDiscount[];
  vales: DriverVale[];
  pixKey: string | null;
  cpf: string | null;
  phone: string | null;
  active: boolean;
  /** true quando o operador confirmou que o driver ja enviou as notas fiscais deste pagamento. */
  notaFiscal: boolean;
}

export interface RowTotals {
  totalPackages: number;
  packagesAmount: number;
  discounts: number;
  vales: number;
  net: number;
}

/** Callbacks que a grade (DriverList/DriverRow) dispara para o container (DriverPayTab). */
export interface RowHandlers {
  onPackageChange: (paymentId: string, routeIndex: number, platformName: string, value: number) => void;
  onPackageBlur: (paymentId: string, routeIndex: number, platformName: string) => void;
  onCityChange: (paymentId: string, routeIndex: number, value: string) => void;
  onCityBlur: (paymentId: string, routeIndex: number, prevRoute: string) => void;
  onAddRoute: (paymentId: string) => void;
  onRemoveRoute: (paymentId: string, routeIndex: number) => void;
  /** Edita a taxa (R$/pacote) de uma plataforma NUMA rota especifica (por rota, nao global). */
  onRateChange: (paymentId: string, routeIndex: number, platformName: string, value: number) => void;
  /** Persiste a taxa da rota ao sair do campo (reupsert do pacote com o novo rate_snapshot). */
  onRateBlur: (paymentId: string, routeIndex: number, platformName: string) => void;
  /** Alterna o check de nota fiscal recebida deste pagamento (current = valor atual). */
  onToggleNota: (paymentId: string, current: boolean) => void;
  onConfigDriver: (row: DriverRowData) => void;
  onDiscount: (row: DriverRowData) => void;
  onVale: (row: DriverRowData) => void;
  onMirror: (row: DriverRowData) => void;
  onToggleExpand: (paymentId: string) => void;
}

/** Total de pacotes de uma plataforma somando todas as rotas do driver. */
export function platformPackages(row: DriverRowData, platformName: string): number {
  return row.routes.reduce((sum, rl) => sum + (rl.packages[platformName] ?? 0), 0);
}

/** Formula do pagamento (net pode ser negativo). */
export function computeRowTotals(row: DriverRowData): RowTotals {
  let packagesAmount = 0;
  let totalPackages = 0;
  for (const rl of row.routes) {
    for (const platformName of Object.keys(rl.packages)) {
      const pkgs = rl.packages[platformName] ?? 0;
      // Taxa POR ROTA: usa o rate desta rota; fallback no default por plataforma do driver.
      const rate = rl.rates[platformName] ?? row.ratesByPlatform[platformName] ?? 0;
      packagesAmount += pkgs * rate;
      totalPackages += pkgs;
    }
  }
  const discounts = row.discounts.reduce((sum, d) => sum + d.amount, 0);
  const vales = row.vales.reduce((sum, v) => sum + v.amount, 0);
  return { totalPackages, packagesAmount, discounts, vales, net: packagesAmount - discounts - vales };
}

/** True quando o driver tem mais de uma rota (grade mostra soma + expansao por rota). */
export function isMultiRoute(row: DriverRowData): boolean {
  return row.routes.length > 1;
}

/**
 * Deriva as linhas editaveis a partir dos pagamentos do periodo. Agrupa os
 * pacotes por rota (preservando a ordem de chegada) e resolve a taxa de cada
 * plataforma: rate_snapshot do pacote existente, senao o default da plataforma.
 */
export function buildRows(
  payments: DriverPayment[],
  drivers: Driver[],
  platforms: DriverPlatform[],
  groupMap: Record<string, string>,
): DriverRowData[] {
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  return payments.map((p) => {
    const driver = driverById.get(p.driver_id);
    const pkgs = p.packages ?? [];

    const order: string[] = [];
    const byRoute = new Map<string, Record<string, number>>();
    const idsByRoute = new Map<string, Record<string, string>>();
    const ratesByRoute = new Map<string, Record<string, number>>();
    const rateByPlatform: Record<string, number> = {};

    for (const pk of pkgs) {
      let rp = byRoute.get(pk.route);
      let ids = idsByRoute.get(pk.route);
      let rt = ratesByRoute.get(pk.route);
      if (!rp || !ids || !rt) {
        rp = {};
        ids = {};
        rt = {};
        byRoute.set(pk.route, rp);
        idsByRoute.set(pk.route, ids);
        ratesByRoute.set(pk.route, rt);
        order.push(pk.route);
      }
      rp[pk.platform_name] = (rp[pk.platform_name] ?? 0) + pk.packages;
      ids[pk.platform_name] = pk.id;
      // Taxa POR ROTA: cada rota guarda o proprio rate_snapshot por plataforma.
      rt[pk.platform_name] = pk.rate_snapshot;
      // Default por plataforma do driver (fallback p/ rota nova): ultimo rate visto.
      rateByPlatform[pk.platform_name] = pk.rate_snapshot;
    }

    for (const pl of platforms) {
      if (rateByPlatform[pl.name] == null) rateByPlatform[pl.name] = pl.default_rate;
    }

    const routes: RouteLine[] =
      order.length === 0
        ? [{ route: p.route_snapshot ?? driver?.route ?? '', packages: {}, packageIds: {}, rates: {} }]
        : order.map((r) => ({
            route: r,
            packages: { ...(byRoute.get(r) ?? {}) },
            packageIds: { ...(idsByRoute.get(r) ?? {}) },
            rates: { ...(ratesByRoute.get(r) ?? {}) },
          }));

    return {
      paymentId: p.id,
      driverId: p.driver_id,
      name: p.driver_name_snapshot,
      route: p.route_snapshot ?? driver?.route ?? null,
      groupName: groupMap[p.driver_id] ?? null,
      routes,
      ratesByPlatform: rateByPlatform,
      discounts: p.discounts ?? [],
      vales: p.vales ?? [],
      pixKey: driver?.pix_key ?? null,
      cpf: driver?.cpf ?? null,
      phone: driver?.phone ?? null,
      active: driver?.active ?? true,
      notaFiscal: Boolean(p.nota_fiscal_recebida),
    };
  });
}

// ─── Montagem de dados de ESPELHO / RELATORIO ────────────────────────────────

/** Nome fixo do CD no cabecalho do espelho (definido pelo Victor). */
export const MIRROR_COMPANY_NAME = 'CD LOGISTICA';

function companyInfo(company: Company): DriverMirrorData['company'] {
  return {
    name: MIRROR_COMPANY_NAME,
    cnpj: company.cnpj ?? null,
    city: company.city ?? null,
  };
}

function periodInfo(period: DriverPaymentPeriod): DriverMirrorData['period'] {
  return {
    label: period.label,
    start: period.start_date,
    end: period.end_date,
    status: period.status,
  };
}

/** Monta o espelho individual (dados prontos; o PDF nao recalcula dinheiro). */
export function buildDriverMirrorData(
  row: DriverRowData,
  platforms: DriverPlatform[],
  company: Company,
  period: DriverPaymentPeriod,
): DriverMirrorData {
  const totals = computeRowTotals(row);
  return {
    company: companyInfo(company),
    period: periodInfo(period),
    driver: {
      name: row.name,
      routes: row.routes.map((rl) => ({
        city: rl.route,
        totalPackages: Object.values(rl.packages).reduce((s, n) => s + n, 0),
      })),
      group: row.groupName,
    },
    platforms: platforms
      .map((pl) => {
        // Taxa POR ROTA: subtotal = Σ_rotas (pacotes da rota × taxa da rota).
        let packages = 0;
        let subtotal = 0;
        for (const rl of row.routes) {
          const pkgs = rl.packages[pl.name] ?? 0;
          if (pkgs === 0) continue;
          const rate = rl.rates[pl.name] ?? row.ratesByPlatform[pl.name] ?? pl.default_rate;
          packages += pkgs;
          subtotal += pkgs * rate;
        }
        // Media ponderada -> mantem a identidade subtotal = packages × unitValue.
        const unitValue = packages > 0 ? subtotal / packages : (row.ratesByPlatform[pl.name] ?? pl.default_rate);
        return { platform: pl.name, packages, unitValue, subtotal };
      })
      .filter((p) => p.packages > 0),
    discounts: row.discounts.map((d) => ({
      packageId: d.package_code ?? '',
      value: d.amount,
      description: d.observation,
    })),
    vales: row.vales.map((v) => ({
      date: v.vale_date ?? '',
      value: v.amount,
      note: v.observation,
    })),
    totals: {
      packagesValue: totals.packagesAmount,
      discountsValue: totals.discounts,
      valesValue: totals.vales,
      toReceive: totals.net,
    },
  };
}

/** Monta o espelho de grupo (resumo + espelhos individuais dos membros). */
export function buildGroupMirrorData(
  groupName: string,
  rows: DriverRowData[],
  platforms: DriverPlatform[],
  company: Company,
  period: DriverPaymentPeriod,
): DriverGroupMirrorData {
  const drivers = rows.map((r) => buildDriverMirrorData(r, platforms, company, period));
  const groupTotals = drivers.reduce(
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
    company: companyInfo(company),
    period: periodInfo(period),
    groupName,
    drivers,
    groupTotals,
  };
}

/** Deriva as linhas do relatorio geral (plataformas dinamicas + totais). */
export function buildReportRows(rows: DriverRowData[], platforms: DriverPlatform[]): DriverReportRow[] {
  return rows.map((row) => {
    const t = computeRowTotals(row);
    const route = row.routes.map((r) => r.route).filter(Boolean).join(', ') || (row.route ?? '');
    const platformsRec: Record<string, { packages: number; value: number }> = {};
    for (const pl of platforms) {
      // Taxa POR ROTA: value = Σ_rotas (pacotes da rota × taxa da rota).
      let packages = 0;
      let value = 0;
      for (const rl of row.routes) {
        const pkgs = rl.packages[pl.name] ?? 0;
        if (pkgs === 0) continue;
        const rate = rl.rates[pl.name] ?? row.ratesByPlatform[pl.name] ?? pl.default_rate ?? 0;
        packages += pkgs;
        value += pkgs * rate;
      }
      platformsRec[pl.name] = { packages, value };
    }
    return {
      name: row.name,
      route,
      group: row.groupName ?? '',
      platforms: platformsRec,
      totalPackages: t.packagesAmount,
      discount: t.discounts,
      vale: t.vales,
      totalToReceive: t.net,
    };
  });
}
