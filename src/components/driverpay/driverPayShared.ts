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
  DriverZapex,
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
  /** true quando o operador conferiu o espelho do driver e a quantidade bate com a planilha. */
  espelhoConferido: boolean;
  /**
   * Itens Zapex lancados neste pagamento (1 item = 1 entrega). Cada item so tem
   * codigo + data; o VALOR vem do zapexRate individual do driver. Total Zapex do
   * driver = zapex.length * zapexRate.
   */
  zapex: DriverZapex[];
  /** Valor unitario individual do driver por item Zapex (driverpay_payments.zapex_rate; default 0). */
  zapexRate: number;
}

export interface RowTotals {
  totalPackages: number;
  packagesAmount: number;
  /** Ganho Zapex em R$ = zapex.length * zapexRate. Soma no net. */
  zapex: number;
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
  /** Alterna o check de "espelho conferido" deste pagamento (current = valor atual). */
  onToggleEspelho: (paymentId: string, current: boolean) => void;
  onConfigDriver: (row: DriverRowData) => void;
  onDiscount: (row: DriverRowData) => void;
  onVale: (row: DriverRowData) => void;
  /** Abre o modal de Zapex (lancar/editar/excluir itens + configurar valor unitario). */
  onZapex: (row: DriverRowData) => void;
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
  // Ganho Zapex: cada item vale zapexRate; soma no total a receber.
  const zapexAmount = row.zapex.length * row.zapexRate;
  const discounts = row.discounts.reduce((sum, d) => sum + d.amount, 0);
  const vales = row.vales.reduce((sum, v) => sum + v.amount, 0);
  return {
    totalPackages,
    packagesAmount,
    zapex: zapexAmount,
    discounts,
    vales,
    net: packagesAmount + zapexAmount - discounts - vales,
  };
}

/** Uma reaplicacao de taxa a decidir: (rota, plataforma) -> nova taxa. */
export interface RateReapplyItem {
  route: string;
  platformName: string;
  packages: number;
  newRate: number;
}

/**
 * Decide QUAIS pacotes do periodo aberto devem receber a nova taxa quando o cadastro
 * do driver muda a taxa padrao de uma plataforma. Regra (corrige o clobber da taxa por
 * rota): reaplica SO nas rotas que ainda usavam a taxa ANTIGA (seguiam o padrao) — as
 * rotas com taxa diferente sao overrides manuais por rota e sao PRESERVADAS. So considera
 * plataformas cuja taxa realmente mudou; se `rateChanges` vier vazio (ex.: editou so
 * PIX/telefone), nao reaplica nada. Comparacao em centavos (robusta a float).
 */
export function planRateReapply(
  routes: RouteLine[],
  ratesByPlatform: Record<string, number>,
  rateChanges: Array<{ platformName: string; oldRate: number; newRate: number }>,
): RateReapplyItem[] {
  if (rateChanges.length === 0) return [];
  const changeByPlatform = new Map(rateChanges.map((c) => [c.platformName, c]));
  const sameCents = (a: number, b: number) =>
    Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
  const out: RateReapplyItem[] = [];
  for (const rl of routes) {
    if (!rl.route) continue;
    for (const [platformName, pkgs] of Object.entries(rl.packages)) {
      const change = changeByPlatform.get(platformName);
      if (!change || pkgs <= 0) continue;
      const currentRate = rl.rates[platformName] ?? ratesByPlatform[platformName] ?? 0;
      if (sameCents(currentRate, change.oldRate)) {
        out.push({ route: rl.route, platformName, packages: pkgs, newRate: change.newRate });
      }
    }
  }
  return out;
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
  /** Config de valor/pacote por driver (driverId -> plataforma -> taxa). */
  driverRates: Record<string, Record<string, number>> = {},
  /** Periodo concluido: taxa congelada (rate_snapshot). Aberto: segue a config. */
  frozen = false,
): DriverRowData[] {
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  // Periodo ABERTO: pacotes de plataforma arquivada (fora de `platforms`, que so traz
  // ativas) saem da soma. Periodo concluido (frozen): mantem tudo congelado.
  const activeNames = new Set(platforms.map((pl) => pl.name));

  return payments.map((p) => {
    const driver = driverById.get(p.driver_id);
    const pkgs = p.packages ?? [];

    const order: string[] = [];
    const byRoute = new Map<string, Record<string, number>>();
    const idsByRoute = new Map<string, Record<string, string>>();
    const ratesByRoute = new Map<string, Record<string, number>>();
    const rateByPlatform: Record<string, number> = {};

    for (const pk of pkgs) {
      // Plataforma arquivada num periodo aberto: ignora (sai da soma). Reversivel:
      // reativar a plataforma faz o pacote voltar. NAO deleta nada.
      if (!frozen && !activeNames.has(pk.platform_name)) continue;
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
      // Congelado (periodo concluido): a taxa padrao do driver e o rate_snapshot.
      if (frozen) rateByPlatform[pk.platform_name] = pk.rate_snapshot;
    }

    const cfg = driverRates[p.driver_id] ?? {};
    for (const pl of platforms) {
      if (frozen) {
        // Periodo concluido: mantem o rate_snapshot congelado; fallback default.
        if (rateByPlatform[pl.name] == null) rateByPlatform[pl.name] = pl.default_rate;
      } else {
        // Periodo ABERTO: a taxa padrao do driver SEGUE a config do perfil dele.
        rateByPlatform[pl.name] = cfg[pl.name] ?? pl.default_rate;
      }
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
      espelhoConferido: Boolean(p.espelho_conferido),
      zapex: p.zapex ?? [],
      zapexRate: Number(p.zapex_rate ?? 0),
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
  // Ganho Zapex (R$) do driver: entra como uma "plataforma" no espelho e soma no packagesValue.
  const zapexAmount = row.zapex.length * row.zapexRate;
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
    platforms: [
      ...platforms.flatMap((pl) => {
        // Destaque/aviso/valor separado (2026-07-19/20): so plataforma ATIVA; o filtro
        // de pacotes>0 abaixo garante a regra de presenca do Victor.
        const highlight = pl.active && pl.highlight_mirror;
        const notice = highlight && pl.mirror_notice?.trim() ? pl.mirror_notice.trim() : null;
        const separateValue = highlight && pl.mirror_separate_value;
        // Taxa POR ROTA (2026-07-20): mais de uma rota com pacotes na plataforma gera
        // uma linha POR ROTA, cada uma com a taxa real daquela rota — NUNCA taxa media
        // (rota a R$2,00 e rota a R$1,50 nao podem virar "R$1,83").
        const perRoute = row.routes
          .map((rl) => ({
            route: rl.route,
            packages: rl.packages[pl.name] ?? 0,
            unitValue: rl.rates[pl.name] ?? row.ratesByPlatform[pl.name] ?? pl.default_rate,
          }))
          .filter((r) => r.packages > 0)
          .map((r) => ({ ...r, subtotal: r.packages * r.unitValue }));
        if (perRoute.length === 0) return [];
        if (perRoute.length === 1) {
          const only = perRoute[0];
          return [
            {
              platform: pl.name,
              packages: only.packages,
              unitValue: only.unitValue,
              subtotal: only.subtotal,
              highlight,
              notice,
              separateValue,
            },
          ];
        }
        return perRoute.map((r) => ({
          platform: pl.name,
          route: r.route || '—',
          packages: r.packages,
          unitValue: r.unitValue,
          subtotal: r.subtotal,
          highlight,
          notice,
          separateValue,
        }));
      }),
      // Zapex como linha propria: pacotes = qtd de itens, valor unit = zapexRate do driver.
      ...(row.zapex.length > 0
        ? [{ platform: 'Zapex', packages: row.zapex.length, unitValue: row.zapexRate, subtotal: zapexAmount }]
        : []),
    ],
    discounts: row.discounts.map((d) => ({
      packageId: d.package_code ?? '',
      value: d.amount,
      description: d.observation,
      status: d.package_status ?? null,
    })),
    vales: row.vales.map((v) => ({
      date: v.vale_date ?? '',
      value: v.amount,
      note: v.observation,
    })),
    totals: {
      // packagesValue inclui o ganho Zapex para casar com a soma dos subtotais (linha Zapex) e com o toReceive.
      packagesValue: totals.packagesAmount + zapexAmount,
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

/** Nome do balde dos drivers sem grupo (mesmo rotulo usado na visao Grupos). */
export const NO_GROUP_LABEL = 'Sem grupo';

/**
 * Monta os dados dos "Espelhos da seleção" (2026-07-18): grupos MARCADOS viram
 * espelho de grupo; drivers marcados avulsos viram espelho individual. Driver
 * cujo grupo esta marcado NAO entra de novo como avulso (a UI ja trava, mas a
 * regra vale aqui tambem — funcao pura, coberta por unit).
 */
export function buildSelectionMirrorData(
  rows: DriverRowData[],
  selectedGroups: ReadonlySet<string>,
  selectedDrivers: ReadonlySet<string>,
  platforms: DriverPlatform[],
  company: Company,
  period: DriverPaymentPeriod,
): { groups: DriverGroupMirrorData[]; singles: DriverMirrorData[] } {
  const groupOf = (r: DriverRowData): string => r.groupName ?? NO_GROUP_LABEL;
  const groups = Array.from(selectedGroups)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((name) => {
      const groupRows = rows.filter((r) => groupOf(r) === name);
      return groupRows.length > 0 ? buildGroupMirrorData(name, groupRows, platforms, company, period) : null;
    })
    .filter((g): g is DriverGroupMirrorData => g !== null);
  const singles = rows
    .filter((r) => selectedDrivers.has(r.paymentId) && !selectedGroups.has(groupOf(r)))
    .map((r) => buildDriverMirrorData(r, platforms, company, period));
  return { groups, singles };
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
    // Zapex como coluna dinamica: pacotes = qtd de itens, value = itens × zapexRate.
    const zapexValue = row.zapex.length * row.zapexRate;
    if (row.zapex.length > 0) {
      platformsRec['Zapex'] = { packages: row.zapex.length, value: zapexValue };
    }
    return {
      name: row.name,
      route,
      group: row.groupName ?? '',
      platforms: platformsRec,
      totalPackages: t.packagesAmount + zapexValue,
      discount: t.discounts,
      vale: t.vales,
      totalToReceive: t.net,
    };
  });
}
