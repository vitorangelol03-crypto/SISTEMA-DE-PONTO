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
import { faixasDoEspelho } from './nfSplit';

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
  /**
   * TOTAL A RECEBER = packagesValue − discountsValue − valesValue (pode ser negativo).
   * Pagamento PARCIAL por plataforma (2026-07-27): quando `deductionsApplied` do espelho
   * é `false`, os descontos/vales continuam LISTADOS (o driver vê o que vem por aí) mas
   * NÃO entram nesta conta — `toReceive` fica igual a `packagesValue`.
   */
  toReceive: number;
  /**
   * Quanto este espelho REALMENTE abateu (19/08/2026) — o número da regra de saldo
   * (`deductionOverride`), que pode ser MENOR que `discountsValue + valesValue` quando a
   * dívida não coube no que a pessoa recebe nesta conta ("guardar o que sobrou", 07/08).
   * Ausente = espelho antigo/caminho sem regra de saldo: abate cheio quando
   * `deductionsApplied`.
   */
  deductedValue?: number;
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
  /**
   * Data do pagamento tardio — **informativa e OPCIONAL** (09/09/2026).
   *
   * 🔴 Era obrigatória de fato, sem nunca ter sido pedida: o diálogo só montava o
   * `cutoff` quando os TRÊS campos estavam preenchidos, e este nascia VAZIO. Resultado
   * real: os espelhos da 1ª quinzena de agosto saíram SEM NENHUM prazo escrito, embora
   * o prazo (`nf_due_at`) tivesse sido gravado no banco — 16 notas foram marcadas como
   * atrasadas contra um prazo que o entregador nunca viu no documento.
   * Vazia agora só omite a 2ª linha da faixa; o aviso principal sai sempre.
   */
  lateDate?: string;
}

/**
 * O prazo da nota está completo o bastante pra gerar/publicar um espelho?
 *
 * 🔒 09/09/2026 — pedido do Victor: "coloque a trava obrigatória agora pra tudo que for
 * publicado não passar sem colocar a data limite pra anexar nota". Só DATA e HORA são
 * exigidas: são elas que viram o `nf_due_at` e, portanto, o que o sistema usa depois pra
 * dizer quem atrasou.
 */
export function prazoDeNotaIncompleto(time: string, date: string): boolean {
  return !time.trim() || !date.trim();
}

/**
 * Monta o aviso de corte que é impresso no espelho.
 *
 * 🔴 O BUG QUE ISTO CORRIGE (09/09/2026): antes o aviso só era montado com os TRÊS campos
 * preenchidos, e a data do pagamento tardio — que é só informativa e não mede nada —
 * nascia VAZIA. Quem publicava preenchia data e hora, o `nf_due_at` era gravado no banco,
 * mas a faixa NÃO era impressa. Aconteceu de verdade na 1ª quinzena de agosto: todos os
 * espelhos foram pro app sem prazo escrito e 16 notas foram marcadas como atrasadas
 * contra um prazo que o entregador nunca viu.
 */
export function montarAvisoDeCorte(
  time: string,
  dateCurta: string,
  lateDate: string,
): MirrorCutoffLine | null {
  if (prazoDeNotaIncompleto(time, dateCurta)) return null;
  const late = lateDate.trim();
  return { time: time.trim(), date: dateCurta.trim(), lateDate: late || undefined };
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
  /**
   * Pagamento PARCIAL por plataforma (2026-07-27, decisão do Victor): `false` = os vales
   * e perdas listados NÃO foram abatidos deste espelho (saem no pagamento das demais
   * plataformas). Ausente/`true` = comportamento de sempre (abatidos do total).
   */
  deductionsApplied?: boolean;
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
  /** Igual ao do espelho individual: `false` = vales/perdas listados mas não abatidos. */
  deductionsApplied?: boolean;
  generatedAt?: string;
}

/**
 * Os vales/perdas deste espelho foram abatidos do total? Ausente = `true` (todo espelho
 * gerado antes de 2026-07-27 abatia; a leitura por omissão preserva o comportamento).
 */
export function areDeductionsApplied(
  data: { deductionsApplied?: boolean } | null | undefined,
): boolean {
  return data?.deductionsApplied !== false;
}

/**
 * Abate PARCIAL (19/08/2026, pedido do Victor): a regra de saldo abateu só um PEDAÇO da
 * dívida — o resto não coube no que a pessoa recebe nesta conta. Sem este tratamento o
 * papel imprimia a dívida CHEIA com sinal de menos e o total subtraindo só o pedaço:
 * a conta impressa não fechava (mesma família do caso "abate zero" da Andrea).
 *
 * Devolve os três números do caso (abatido / listado / restante) ou `null` quando NÃO é
 * parcial: sem `deductedValue` (espelho antigo, abate cheio), abate zero (a flag
 * `deductionsApplied` já desce e trata), ou abate maior/igual ao listado (cheio).
 */
export function partialDeduction(
  totals: { discountsValue: number; valesValue: number; deductedValue?: number },
  applied: boolean,
): { applied: number; listed: number; remaining: number } | null {
  if (!applied) return null;
  const a = totals.deductedValue;
  if (typeof a !== 'number' || !Number.isFinite(a)) return null;
  const listed = totals.discountsValue + totals.valesValue;
  if (a <= 0 || a >= listed - 0.005) return null;
  return {
    applied: a,
    listed,
    remaining: Math.round((listed - a) * 100) / 100,
  };
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

/**
 * Uma faixa amarela do espelho (06/10/2026): a plataforma separada JÁ com o vale/perda que a
 * regra de 10/09 pôs nela. `amount` é o que a faixa IMPRIME.
 */
export interface SeparatedBand extends SeparatedPlatformTotal {
  /** Pacotes × taxa da plataforma — o que a tabela de valores mostra. */
  gross: number;
  /** Vale/perda abatido DESTA faixa (0 = nenhum). */
  deducted: number;
}

/** O que as faixas do espelho imprimem (06/10/2026). */
export interface MirrorBands {
  /** Bruto da faixa verde: plataformas não separadas + Zapex. */
  greenGross: number;
  /** Vale/perda abatido da faixa verde. */
  greenDeducted: number;
  /** O "TOTAL A RECEBER" impresso na faixa verde. */
  green: number;
  /** Faixas amarelas, uma por plataforma separada (vazio = espelho sem separação). */
  separated: SeparatedBand[];
  /** Vale/perda abatido no espelho inteiro (todas as faixas). */
  deductedTotal: number;
}

/** Centavos inteiros — dinheiro nas faixas nunca carrega resto de float. */
const toCents = (v: number): number => Math.round(v * 100);

/**
 * As faixas de um conjunto de linhas de plataforma com o total já abatido.
 *
 * ACHADO REAL (06/10/2026, ANDRE — só eMile, R$ 225,50 de descontos da iMile): o papel fazia
 * "verde = total − bruto separado", ou seja, TODO vale/perda saía da faixa verde. Sem verde, ela
 * ficou −R$ 225,50 e a amarela saiu com o bruto cheio (R$ 1.244,00) — e foi esse o valor da nota
 * dele. Agora as faixas saem de `faixasDoEspelho`, a mesma conta da conferência da nota e do
 * relatório (regra do Victor de 10/09: o vale/perda sai da faixa de MAIOR valor).
 *
 * Sem nenhuma linha fora da plataforma separada (só eMile, como o André), não há o que separar:
 * o espelho sai como um espelho normal, com o desconto abatido no TOTAL A RECEBER (decisão do
 * Victor, 06/10/2026).
 */
function bandsFromLines(lines: DriverPlatformLine[], packagesValue: number, toReceive: number): MirrorBands {
  const deductedCents = toCents(packagesValue) - toCents(toReceive);
  const sep = separatedPlatformTotals(lines);
  const temVerde = lines.some((p) => !p.separateValue);
  if (sep.length === 0 || (!temVerde && sep.length === 1)) {
    return {
      greenGross: packagesValue,
      greenDeducted: deductedCents / 100,
      green: toReceive,
      separated: [],
      deductedTotal: deductedCents / 100,
    };
  }
  const greenGrossCents = toCents(packagesValue) - sep.reduce((s, x) => s + toCents(x.amount), 0);
  const faixa = new Map(
    faixasDoEspelho(
      [
        { chave: '', bruto: greenGrossCents / 100 },
        ...sep.map((s) => ({ chave: s.platform, bruto: s.amount })),
      ],
      deductedCents / 100,
    ).map((f) => [f.chave, toCents(f.total)]),
  );
  const greenCents = faixa.get('') ?? greenGrossCents;
  return {
    greenGross: greenGrossCents / 100,
    greenDeducted: (greenGrossCents - greenCents) / 100,
    green: greenCents / 100,
    separated: sep.map((s) => {
      const amountCents = faixa.get(s.platform) ?? toCents(s.amount);
      return {
        platform: s.platform,
        packages: s.packages,
        gross: s.amount,
        deducted: (toCents(s.amount) - amountCents) / 100,
        amount: amountCents / 100,
      };
    }),
    deductedTotal: deductedCents / 100,
  };
}

/** As faixas de um espelho individual (06/10/2026). */
export function mirrorBands(data: Pick<DriverMirrorData, 'platforms' | 'totals'>): MirrorBands {
  return bandsFromLines(data.platforms, data.totals.packagesValue, data.totals.toReceive);
}

/** "EMILE" / "EMILE + X" — o nome das faixas separadas como os rótulos do espelho escrevem. */
export function separatedNames(bands: MirrorBands): string {
  return bands.separated.map((s) => s.platform.toUpperCase()).join(' + ');
}

/**
 * A conta de uma faixa amarela que teve vale/perda abatido (06/10/2026, caso ANDRE): sem ela o
 * entregador vê um número menor que o da tabela de valores e não sabe de onde veio.
 * null = a faixa não teve abate (sai só o valor, como sempre). PDF e prévia usam esta frase;
 * `fmt` deixa a prévia esconder os valores de quem não tem permissão de vê-los.
 */
export function separatedBandBreakdown(
  band: SeparatedBand,
  fmt: (valor: number) => string = fmtBRL,
): string | null {
  if (toCents(band.deducted) <= 0) return null;
  // Hífen comum de propósito: a fonte padrão do PDF (WinAnsi) não tem o sinal de menos "−".
  return `${fmt(band.gross)} em pacotes - ${fmt(band.deducted)} de descontos e vales (listados acima)`;
}

/** Uma linha do resumo do espelho individual: soma, informação neutra ou abate (vermelho). */
export interface MirrorSummaryLine {
  rotulo: string;
  valor: number;
  tipo: 'soma' | 'info' | 'abate';
}

/**
 * O resumo quando o vale/perda NÃO saiu todo da faixa verde (06/10/2026): a regra de 10/09 tirou
 * tudo ou um pedaço dele de uma faixa amarela. O resumo de sempre ("pacotes − descontos − vales")
 * não fecharia com o TOTAL A RECEBER, então ele diz de onde saiu cada parte.
 *
 * null = o verde absorveu tudo (ou não há separação): o resumo é o de sempre.
 */
export function resumoComAbateNasFaixas(
  bands: MirrorBands,
  totals: Pick<DriverMirrorTotals, 'discountsValue' | 'valesValue'>,
): MirrorSummaryLine[] | null {
  if (bands.separated.length === 0 || toCents(bands.greenDeducted) === toCents(bands.deductedTotal)) {
    return null;
  }
  const linhas: MirrorSummaryLine[] = [
    { rotulo: `Total de pacotes (sem ${separatedNames(bands)})`, valor: bands.greenGross, tipo: 'soma' },
    { rotulo: 'Vales e perdas da quinzena', valor: totals.discountsValue + totals.valesValue, tipo: 'info' },
  ];
  for (const s of bands.separated) {
    if (toCents(s.deducted) > 0) {
      linhas.push({
        rotulo: `Abatido do total ${s.platform.toUpperCase()} (faixa amarela abaixo)`,
        valor: s.deducted,
        tipo: 'info',
      });
    }
  }
  if (toCents(bands.greenDeducted) !== 0) {
    linhas.push({ rotulo: 'Abatido neste total', valor: bands.greenDeducted, tipo: 'abate' });
  }
  return linhas;
}

/** Faixas do espelho de GRUPO + a parte de cada membro na faixa verde. */
export interface GroupMirrorBands extends MirrorBands {
  /** Bruto de cada membro na faixa verde, na ordem de `drivers`. */
  memberGreenGross: number[];
  /** "A Receber" de cada membro na tabela do resumo (a parte dele na faixa verde). */
  memberGreen: number[];
}

/**
 * As faixas do espelho de GRUPO (06/10/2026). A regra vale pro GRUPO inteiro, igual à
 * conferência da nota (o líder emite uma nota por CNPJ pelo grupo) e ao relatório.
 *
 * A coluna "A Receber" de cada membro é a parte dele na faixa verde: o bruto verde dele menos a
 * parte do vale/perda que a regra pôs no verde, repartida na proporção do que cada um teve
 * abatido. Quando o verde absorve tudo (o caso comum), é exatamente o abate de cada um — igual
 * a sempre; quando nada sai do verde, ninguém tem abate na coluna. A soma da coluna fecha
 * sempre, centavo por centavo, com o TOTAL A RECEBER do grupo.
 */
export function groupMirrorBands(data: Pick<DriverGroupMirrorData, 'drivers'>): GroupMirrorBands {
  const { drivers } = data;
  const bands = bandsFromLines(
    drivers.flatMap((d) => d.platforms),
    drivers.reduce((s, d) => s + d.totals.packagesValue, 0),
    drivers.reduce((s, d) => s + d.totals.toReceive, 0),
  );
  const separa = bands.separated.length > 0;
  const grossCents = drivers.map(
    (d) => toCents(d.totals.packagesValue) - (separa ? toCents(separatedPlatformTotals(d.platforms).reduce((s, x) => s + x.amount, 0)) : 0),
  );
  const pesos = drivers.map((d) => Math.max(0, toCents(d.totals.packagesValue) - toCents(d.totals.toReceive)));
  const somaPesos = pesos.reduce((s, p) => s + p, 0);
  const noVerdeCents = toCents(bands.greenDeducted);

  // Repartição proporcional em centavos (maior resto): a soma bate exata com o abatido no verde.
  const quotas = pesos.map((p) => (somaPesos > 0 && noVerdeCents > 0 ? (noVerdeCents * p) / somaPesos : 0));
  const abate = quotas.map((q) => Math.floor(q));
  let sobra = (noVerdeCents > 0 ? noVerdeCents : 0) - abate.reduce((s, a) => s + a, 0);
  const porResto = quotas
    .map((q, i) => ({ i, resto: q - Math.floor(q) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of porResto) {
    if (sobra <= 0) break;
    abate[i] += 1;
    sobra -= 1;
  }
  // O que não coube na proporção (abate negativo ou sem peso) fica no maior bruto verde, pra
  // coluna nunca deixar de somar o TOTAL A RECEBER impresso.
  const restoCents = toCents(bands.green) - grossCents.reduce((s, g, i) => s + g - abate[i], 0);
  if (restoCents !== 0 && drivers.length > 0) {
    const maior = grossCents.reduce((m, g, i) => (g > grossCents[m] ? i : m), 0);
    abate[maior] -= restoCents;
  }

  return {
    ...bands,
    memberGreenGross: grossCents.map((g) => g / 100),
    memberGreen: grossCents.map((g, i) => (g - abate[i]) / 100),
  };
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
