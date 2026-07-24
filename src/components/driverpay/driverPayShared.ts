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

/**
 * Nome do arquivo de NOTA FISCAL pro download (Fase 3): "Driver - CNPJ - Quinzena[ (n)].ext".
 * Diferente de sanitizeFile: MANTÉM acentos e espaços (nome legível pra contabilidade do Victor);
 * remove só os caracteres proibidos em Windows/Android (/ \ : * ? " < > |) e colapsa espaços.
 * `index` (0-based): quando o mesmo driver mandou mais de uma nota do mesmo CNPJ, numera a partir da 2ª.
 */
export function notaFiscalFileName(
  driverName: string,
  emitterLabel: string,
  periodLabel: string,
  index = 0,
  ext = 'jpg',
): string {
  const clean = (s: string) =>
    (s || '').normalize('NFC').replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'sem-nome';
  const cleanExt = (ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const suffix = index > 0 ? ` (${index + 1})` : '';
  return `${clean(driverName)} - ${clean(emitterLabel)} - ${clean(periodLabel)}${suffix}.${cleanExt}`;
}

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
  /** Recebedor separado (ex.: esposa emite a nota): relatórios saem no nome/PIX dele. Null = o próprio driver. */
  recebedorNome: string | null;
  recebedorPix: string | null;
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

/** Plataforma (subset) usado no cálculo de notas esperadas: nome + CNPJ vinculado. */
export interface EmitterPlatform {
  name: string;
  nota_emitter_id: string | null;
}

/**
 * CNPJs (emitentes) que o driver PRECISA mandar nota neste período: 1 por CNPJ distinto
 * das plataformas em que ele tem pacote (>0). Mesma regra dos "slots" do app do entregador.
 * Ex.: só Shopee → [CNPJ da Shopee]; Shopee + iMile → [CNPJ Shopee, CNPJ iMile].
 */
export function expectedEmitterIds(row: DriverRowData, platforms: EmitterPlatform[]): string[] {
  const ids = new Set<string>();
  for (const pl of platforms) {
    if (pl.nota_emitter_id && platformPackages(row, pl.name) > 0) ids.add(pl.nota_emitter_id);
  }
  return [...ids];
}

/** Progresso da NF de um driver: quantas das CNPJs esperadas já têm nota VALIDADA. */
export interface NfProgress {
  /** nº de CNPJs que o driver precisa mandar nota. */
  expected: number;
  /** nº de CNPJs esperados com nota já validada. */
  validated: number;
  /** nº de CNPJs esperados com nota recebida mas ainda NÃO validada (pendente). */
  pending: number;
  /** verde: manual ligado OU todas as esperadas validadas. */
  complete: boolean;
  /** foi marcado "na mão" (nota_fiscal_recebida) — override manual. */
  manual: boolean;
}

/**
 * Calcula o progresso da NF (validadas/esperadas). `validatedEmitters`/`receivedEmitters`
 * são os CNPJs desse driver com nota validada / recebida-não-rejeitada. `manual` =
 * nota_fiscal_recebida (marca na mão, p/ quem manda por fora do app). Puro/testável.
 */
export function computeNfProgress(
  row: DriverRowData,
  platforms: EmitterPlatform[],
  validatedEmitters: ReadonlySet<string> | undefined,
  receivedEmitters: ReadonlySet<string> | undefined,
  manual: boolean,
): NfProgress {
  const expectedIds = expectedEmitterIds(row, platforms);
  const expected = expectedIds.length;
  const validated = expectedIds.filter((id) => validatedEmitters?.has(id)).length;
  const pending = expectedIds.filter((id) => !validatedEmitters?.has(id) && receivedEmitters?.has(id)).length;
  const complete = manual || (expected > 0 && validated >= expected);
  return { expected, validated, pending, complete, manual };
}

/**
 * Progresso da NF por PAGAMENTO, ciente de GRUPO. Regra do Victor: num grupo, só o líder
 * anexa as notas — então o grupo inteiro é validado pelas notas do grupo (ex.: grupo de 6
 * com 2 CNPJs → 2 notas validadas deixam os 6 verdes). Driver avulso = unidade própria.
 *
 * Agrega por grupo (chave = groupName; avulso = paymentId): esperadas = união dos CNPJs
 * dos membros; validadas/recebidas = união das notas dos membros (o líder é membro, então
 * as notas dele entram). Todos os membros recebem o MESMO progresso. `manual` = qualquer
 * membro marcado na mão (nota_fiscal_recebida). Puro/testável.
 */
export function computeNfProgressByPayment(
  rows: DriverRowData[],
  platforms: EmitterPlatform[],
  notesByDriver: ReadonlyMap<string, { validated: ReadonlySet<string>; received: ReadonlySet<string> }>,
): Map<string, NfProgress> {
  const units = new Map<string, DriverRowData[]>();
  for (const row of rows) {
    const key = row.groupName ? `g:${row.groupName}` : `s:${row.paymentId}`;
    const bucket = units.get(key);
    if (bucket) bucket.push(row);
    else units.set(key, [row]);
  }

  const out = new Map<string, NfProgress>();
  for (const unitRows of units.values()) {
    const expectedIds = new Set<string>();
    const validatedIds = new Set<string>();
    const receivedIds = new Set<string>();
    let manual = false;
    for (const row of unitRows) {
      for (const id of expectedEmitterIds(row, platforms)) expectedIds.add(id);
      const nf = notesByDriver.get(row.driverId);
      if (nf) {
        for (const id of nf.validated) validatedIds.add(id);
        for (const id of nf.received) receivedIds.add(id);
      }
      if (row.notaFiscal) manual = true;
    }
    const expectedArr = [...expectedIds];
    const expected = expectedArr.length;
    const validated = expectedArr.filter((id) => validatedIds.has(id)).length;
    const pending = expectedArr.filter((id) => !validatedIds.has(id) && receivedIds.has(id)).length;
    const complete = manual || (expected > 0 && validated >= expected);
    const progress: NfProgress = { expected, validated, pending, complete, manual };
    for (const row of unitRows) out.set(row.paymentId, progress);
  }
  return out;
}

/**
 * Formula do pagamento (net pode ser negativo).
 *
 * D3 — espelho por plataforma: quando `allowedPlatformNames` e informado, SO conta os
 * pacotes das plataformas desse conjunto (e o Zapex so se 'Zapex' estiver nele), pra que o
 * TOTAL do espelho filtrado bata com as linhas exibidas. Quando ausente (todos os callers
 * atuais), comporta-se EXATAMENTE como antes — soma todas as plataformas do row.
 * Descontos e vales sao do driver (nao de uma plataforma) e NAO sao filtrados aqui: a
 * decisao de exibi-los/abate-los num espelho filtrado fica na camada de UI (Fase 1).
 */
export function computeRowTotals(
  row: DriverRowData,
  allowedPlatformNames?: ReadonlySet<string>,
): RowTotals {
  const isAllowed = (name: string) => !allowedPlatformNames || allowedPlatformNames.has(name);
  let packagesAmount = 0;
  let totalPackages = 0;
  for (const rl of row.routes) {
    for (const platformName of Object.keys(rl.packages)) {
      if (!isAllowed(platformName)) continue;
      const pkgs = rl.packages[platformName] ?? 0;
      // Taxa POR ROTA: usa o rate desta rota; fallback no default por plataforma do driver.
      const rate = rl.rates[platformName] ?? row.ratesByPlatform[platformName] ?? 0;
      packagesAmount += pkgs * rate;
      totalPackages += pkgs;
    }
  }
  // Ganho Zapex: cada item vale zapexRate; Zapex conta como uma "plataforma" pro filtro.
  const zapexAmount = isAllowed('Zapex') ? row.zapex.length * row.zapexRate : 0;
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
      recebedorNome: driver?.recebedor_nome ?? null,
      recebedorPix: driver?.recebedor_pix ?? null,
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

/**
 * Monta o espelho individual (dados prontos; o PDF nao recalcula dinheiro).
 * D3: `allowedPlatformNames` (opcional) filtra as LINHAS e o TOTAL pras plataformas escolhidas.
 * Ausente = todas (comportamento atual). Descontos/vales seguem exibidos (decisao de UI na Fase 1).
 */
export function buildDriverMirrorData(
  row: DriverRowData,
  platforms: DriverPlatform[],
  company: Company,
  period: DriverPaymentPeriod,
  allowedPlatformNames?: ReadonlySet<string>,
): DriverMirrorData {
  const isAllowed = (name: string) => !allowedPlatformNames || allowedPlatformNames.has(name);
  const totals = computeRowTotals(row, allowedPlatformNames);
  // Ganho Zapex (R$) do driver: entra como uma "plataforma" no espelho e soma no packagesValue.
  const includeZapex = isAllowed('Zapex');
  const zapexAmount = includeZapex ? row.zapex.length * row.zapexRate : 0;
  return {
    company: companyInfo(company),
    period: periodInfo(period),
    driver: {
      name: row.name,
      routes: row.routes.map((rl) => ({
        city: rl.route,
        // Filtrado (D3): so os pacotes das plataformas permitidas entram na contagem da cidade.
        totalPackages: Object.entries(rl.packages).reduce(
          (s, [name, n]) => s + (isAllowed(name) ? n : 0),
          0,
        ),
      })),
      group: row.groupName,
    },
    platforms: [
      ...platforms.flatMap((pl) => {
        // D3: fora do filtro de plataformas -> nao gera linha.
        if (!isAllowed(pl.name)) return [];
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
      ...(includeZapex && row.zapex.length > 0
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
  allowedPlatformNames?: ReadonlySet<string>,
): DriverGroupMirrorData {
  const drivers = rows.map((r) => buildDriverMirrorData(r, platforms, company, period, allowedPlatformNames));
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
  allowedPlatformNames?: ReadonlySet<string>,
): { groups: DriverGroupMirrorData[]; singles: DriverMirrorData[] } {
  const groupOf = (r: DriverRowData): string => r.groupName ?? NO_GROUP_LABEL;
  const groups = Array.from(selectedGroups)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((name) => {
      const groupRows = rows.filter((r) => groupOf(r) === name);
      return groupRows.length > 0
        ? buildGroupMirrorData(name, groupRows, platforms, company, period, allowedPlatformNames)
        : null;
    })
    .filter((g): g is DriverGroupMirrorData => g !== null);
  const singles = rows
    .filter((r) => selectedDrivers.has(r.paymentId) && !selectedGroups.has(groupOf(r)))
    .map((r) => buildDriverMirrorData(r, platforms, company, period, allowedPlatformNames));
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

/** Remove acentos (coluna A do relatório simples pede nome do líder SEM acento). */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Uma unidade de recebimento do relatório: grupo (recebedor = líder) ou avulso (ele mesmo). */
export interface ReportUnit {
  recipient: string;
  group: string;
  isGroup: boolean;
  rows: DriverRowData[];
}

/**
 * Agrupa os rows em UNIDADES DE RECEBIMENTO (regra da NF): cada grupo é uma unidade cujo
 * recebedor é o LÍDER; cada avulso é uma unidade dele mesmo. `leaderNameByGroup` mapeia
 * nome do grupo -> nome do líder (fallback: 1º membro se o grupo não tem líder definido).
 */
export function groupReportUnits(
  rows: DriverRowData[],
  leaderNameByGroup: ReadonlyMap<string, string>,
): ReportUnit[] {
  const buckets = new Map<string, DriverRowData[]>();
  const order: string[] = [];
  for (const row of rows) {
    const key = row.groupName ? `g:${row.groupName}` : `s:${row.paymentId}`;
    const b = buckets.get(key);
    if (b) b.push(row);
    else {
      buckets.set(key, [row]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const unitRows = buckets.get(key)!;
    const isGroup = key.startsWith('g:');
    const group = isGroup ? unitRows[0].groupName ?? '' : '';
    const recipient = isGroup ? leaderNameByGroup.get(group) || unitRows[0].name : unitRows[0].name;
    return { recipient, group, isGroup, rows: unitRows };
  });
}

/**
 * Nome + chave PIX de quem RECEBE pela unidade (decisão do Victor, 2026-07-24):
 * se o líder tem um RECEBEDOR configurado (ex.: esposa emite a nota), os relatórios
 * saem SÓ com o nome/PIX do recebedor; senão, nome do líder + pix_key dele.
 * (O ESPELHO não usa isto — continua no nome do líder.)
 */
export function unitRecipientInfo(unit: ReportUnit): { name: string; pix: string | null } {
  // Linha do líder dentro da unidade (avulso = a própria linha). Se o líder não tem
  // linha no período, cai no nome do líder sem PIX — nunca no PIX de um membro.
  const leaderRow = unit.isGroup ? unit.rows.find((r) => r.name === unit.recipient) : unit.rows[0];
  const recebedor = leaderRow?.recebedorNome?.trim();
  if (recebedor) return { name: recebedor, pix: leaderRow?.recebedorPix?.trim() || null };
  return { name: unit.recipient, pix: leaderRow?.pixKey?.trim() || null };
}

/**
 * Relatório GERAL com o líder como recebedor, dividido POR ROTA (decisões do Victor):
 * cada unidade vira N linhas (1 por rota), colunas por plataforma. Desconto/vale/TOTAL A
 * RECEBER (net = já abatido) saem na 1ª linha da unidade (blank nas demais) pra o SUM do
 * rodapé fechar certo. `name` só na 1ª linha (bloco do recebedor). Membros não viram linha.
 */
export function buildLeaderReportRows(
  rows: DriverRowData[],
  platforms: DriverPlatform[],
  leaderNameByGroup: ReadonlyMap<string, string>,
): DriverReportRow[] {
  const out: DriverReportRow[] = [];
  for (const unit of groupReportUnits(rows, leaderNameByGroup)) {
    const recipient = unitRecipientInfo(unit);
    let discount = 0;
    let vale = 0;
    let net = 0;
    const routeMap = new Map<string, Record<string, { packages: number; value: number }>>();
    const routeOrder: string[] = [];
    for (const row of unit.rows) {
      const t = computeRowTotals(row);
      discount += t.discounts;
      vale += t.vales;
      net += t.net;
      for (const rl of row.routes) {
        const rname = (rl.route || '').trim() || '(sem rota)';
        let rec = routeMap.get(rname);
        if (!rec) {
          rec = {};
          routeMap.set(rname, rec);
          routeOrder.push(rname);
        }
        for (const pl of platforms) {
          const pkgs = rl.packages[pl.name] ?? 0;
          if (pkgs === 0) continue;
          const rate = rl.rates[pl.name] ?? row.ratesByPlatform[pl.name] ?? pl.default_rate ?? 0;
          const cell = rec[pl.name] ?? (rec[pl.name] = { packages: 0, value: 0 });
          cell.packages += pkgs;
          cell.value += pkgs * rate;
        }
      }
    }
    const routeNames = routeOrder.length ? routeOrder : ['(sem rota)'];
    routeNames.forEach((rname, i) => {
      const rec = routeMap.get(rname) ?? {};
      const platformsRec: Record<string, { packages: number; value: number }> = {};
      let routeGross = 0;
      for (const pl of platforms) {
        const c = rec[pl.name] ?? { packages: 0, value: 0 };
        platformsRec[pl.name] = c;
        routeGross += c.value;
      }
      const first = i === 0;
      out.push({
        name: first ? recipient.name : '',
        route: rname,
        // Grupo repetido em todas as rotas do bloco (avulso = '' -> "Sem grupo"); nome só na 1ª.
        group: unit.group,
        platforms: platformsRec,
        totalPackages: routeGross,
        discount: first ? discount : 0,
        vale: first ? vale : 0,
        totalToReceive: first ? net : 0,
        pixKey: first ? recipient.pix : null,
      });
    });
  }
  return out;
}

/** Linha do relatório SIMPLES: A nome (sem acento) · B total a receber · C chave PIX · D obs (quinzena). */
export interface SimpleReportRow {
  name: string;
  total: number;
  /** Chave PIX de quem recebe (recebedor configurado ou o próprio líder). */
  pix: string | null;
}

/**
 * Relatório SIMPLES: 1 linha por unidade (líder/avulso) — nome SEM acento (recebedor, se
 * configurado) + TOTAL A RECEBER (net do grupo, já com desconto/vale abatidos) + chave PIX.
 * A coluna OBS (nome da quinzena) é preenchida no export a partir do período.
 */
export function buildSimpleReportRows(
  rows: DriverRowData[],
  leaderNameByGroup: ReadonlyMap<string, string>,
): SimpleReportRow[] {
  return groupReportUnits(rows, leaderNameByGroup).map((unit) => {
    const recipient = unitRecipientInfo(unit);
    return {
      name: stripAccents(recipient.name),
      total: unit.rows.reduce((s, r) => s + computeRowTotals(r).net, 0),
      pix: recipient.pix,
    };
  });
}
