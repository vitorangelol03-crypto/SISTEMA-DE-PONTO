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
import { validateCPF } from '../../utils/validation';
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
  /**
   * Quanto de vale/perda foi REALMENTE abatido nesta conta (07/08/2026). Pode ser menos que
   * `discounts + vales` quando o desconto por saldo so coube em parte, e 0 quando a pessoa
   * ja tinha sido descontada num pagamento anterior. `discounts`/`vales` seguem mostrando os
   * valores reais, que e o que as colunas da tela exibem.
   */
  deducted: number;
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
  /** Desfaz a marca de "pago" deste entregador na quinzena (04/08/2026). */
  onDesmarcarPagamento: (driverId: string, driverName: string) => void;
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

/**
 * Chave de um "lugar de nota" = (espelho, CNPJ). `null` no espelho vira '*': é a nota
 * antiga (mandada antes de 28/07) ou enviada sem espelho publicado — ela vale pra
 * QUALQUER espelho daquele CNPJ, senão quem já mandou apareceria devendo.
 */
export function nfSlotKey(mirrorKey: string | null, emitterId: string): string {
  return `${mirrorKey ?? '*'}|${emitterId}`;
}

/** Espelho publicado, no mínimo que o cálculo de NF precisa saber. */
export interface MirrorPubForNf {
  platformKey: string;
  platformFilter: string[] | null;
  /**
   * Prazo pra mandar a nota deste espelho (04/08/2026, decisão do Victor: **por espelho**).
   * ISO com fuso. `null` só nos espelhos publicados ANTES desta feature — neles não dá pra
   * inventar prazo, então a nota nunca fica atrasada.
   */
  nfDueAt?: string | null;
}

/** Como a nota se saiu em relação ao prazo daquele espelho. */
export type NfPrazoStatus =
  /** chegou dentro do prazo */
  | 'no_prazo'
  /** chegou depois do prazo — é o que o Victor quer filtrar */
  | 'atrasada'
  /** o espelho não tem prazo (publicado antes de 04/08) — não dá pra cobrar */
  | 'sem_prazo';

/**
 * Compara quando a nota CHEGOU com o prazo do espelho. Usa a hora do envio (não a da
 * validação): o driver não controla quando alguém confere.
 *
 * Calculado na hora de mostrar, de propósito — não fica gravado. Se o prazo for corrigido
 * depois, a tela se ajusta sozinha em vez de guardar um "atrasada" que virou mentira.
 */
export function nfPrazoStatus(uploadedAt: string, dueAt: string | null | undefined): NfPrazoStatus {
  if (!dueAt) return 'sem_prazo';
  const enviada = new Date(uploadedAt).getTime();
  const limite = new Date(dueAt).getTime();
  if (Number.isNaN(enviada) || Number.isNaN(limite)) return 'sem_prazo';
  return enviada > limite ? 'atrasada' : 'no_prazo';
}

/** "2 h e 15 min depois" — o quanto passou do prazo, pra explicar o selo sem abrir nada. */
export function nfAtrasoLabel(uploadedAt: string, dueAt: string | null | undefined): string | null {
  if (nfPrazoStatus(uploadedAt, dueAt) !== 'atrasada') return null;
  const minutos = Math.round((new Date(uploadedAt).getTime() - new Date(dueAt as string).getTime()) / 60_000);
  if (minutos < 60) return `${minutos} min depois`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto ? `${horas} h e ${resto} min depois` : `${horas} h depois`;
  }
  const dias = Math.floor(horas / 24);
  const restoH = horas % 24;
  return restoH ? `${dias} dia(s) e ${restoH} h depois` : `${dias} dia(s) depois`;
}

/** Uma nota, no mínimo que a contagem por prazo precisa saber. */
export interface NotaComPrazo {
  prazo: NfPrazoStatus;
  driverId: string;
}

/** Quantas notas em cada situação de prazo — os números que a tela mostra no filtro. */
export interface ContagemPrazo {
  no_prazo: number;
  atrasada: number;
  sem_prazo: number;
  total: number;
  /** Quantas PESSOAS diferentes atrasaram (uma pessoa pode ter mandado 2 notas atrasadas). */
  atrasadosDrivers: number;
}

/**
 * Conta as notas por situação de prazo (06/08/2026, pedido do Victor: *"filtro em notas
 * recebidas para ver quem enviou as notas atrasadas"*).
 *
 * 🔑 O filtro já existia — o que faltava era ele DIZER que tem atrasada. Com 75 notas na
 * tela e 3 atrasadas, quem não desconfia nunca abre o filtro. O número aparece antes de
 * procurar; a lista de nomes continua sendo o filtro.
 *
 * Conta PESSOAS além de notas porque a pergunta dele é "quem", não "quantas": 3 notas
 * atrasadas podem ser de 1 entregador só.
 */
export function contaPorPrazo(itens: readonly NotaComPrazo[]): ContagemPrazo {
  const atrasados = new Set<string>();
  const c: ContagemPrazo = { no_prazo: 0, atrasada: 0, sem_prazo: 0, total: itens.length, atrasadosDrivers: 0 };
  for (const i of itens) {
    c[i.prazo] += 1;
    if (i.prazo === 'atrasada') atrasados.add(i.driverId);
  }
  c.atrasadosDrivers = atrasados.size;
  return c;
}

/**
 * Prazo padrão sugerido ao publicar um espelho: **2 dias depois, às 18:00** (decisão do
 * Victor, 04/08 — "sim, com padrão, muda se quiser"). Devolve no formato que os campos
 * `date` e `time` do HTML esperam, no fuso do navegador.
 */
export function prazoNfPadrao(agora: Date): { date: string; time: string } {
  const d = new Date(agora.getTime());
  d.setDate(d.getDate() + 2);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: '18:00' };
}

/**
 * Lugares de nota que o driver precisa preencher (decisão do Victor, 28/07: "uma nota
 * por espelho — se tem 2 espelhos, 2 notas").
 *
 * SEM espelho publicado: um por CNPJ com pacote (exatamente a regra de antes).
 * COM espelho: um por (espelho × CNPJ que aquele espelho envolve) — então o espelho só
 * da LOGGI pede 1 nota, e a quinzena inteira de quem roda eMile + LOGGI pede 2, como já
 * era. Pagando LOGGI e SHOPEE em separado saem 2 notas mesmo sendo o MESMO CNPJ.
 */
export function expectedNfSlotKeys(
  row: DriverRowData,
  platforms: EmitterPlatform[],
  pubs: readonly MirrorPubForNf[],
): string[] {
  const emitterOf = new Map(platforms.map((p) => [p.name, p.nota_emitter_id]));
  const comPacote = platforms.filter((p) => platformPackages(row, p.name) > 0).map((p) => p.name);
  if (!pubs.length) {
    return [...new Set(comPacote.map((n) => emitterOf.get(n)).filter(Boolean) as string[])]
      .map((id) => nfSlotKey(null, id));
  }
  const out = new Set<string>();
  for (const pub of pubs) {
    const nomes = (pub.platformFilter ?? comPacote).filter((n) => comPacote.includes(n));
    for (const n of nomes) {
      const id = emitterOf.get(n);
      if (id) out.add(nfSlotKey(pub.platformKey, id));
    }
  }
  return [...out];
}

/**
 * A nota cobre este slot?
 *
 * Aceita TRÊS formatos de propósito, e a ordem importa menos que a compatibilidade:
 *  1. `espelho|CNPJ` — a nota daquele espelho (formato de 28/07);
 *  2. `*|CNPJ` — nota mandada sem espelho publicado: vale pra qualquer espelho do CNPJ;
 *  3. `CNPJ` puro — formato ANTERIOR a 28/07. Aceitar isso não é gentileza: qualquer
 *     caller que ainda monte o conjunto pelo id do emitente continua funcionando, em
 *     vez de a coluna NF zerar silenciosamente pra todo mundo.
 */
export function slotCoberto(slot: string, chavesDasNotas: ReadonlySet<string>): boolean {
  if (chavesDasNotas.has(slot)) return true;
  const emitterId = slot.slice(slot.indexOf('|') + 1);
  return chavesDasNotas.has(nfSlotKey(null, emitterId)) || chavesDasNotas.has(emitterId);
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
  /**
   * Espelhos publicados por driver (28/07). Ausente/vazio = conta por CNPJ, igual antes;
   * com espelho, cada um pede a sua nota (um slot por espelho x CNPJ).
   */
  pubsByDriver?: ReadonlyMap<string, readonly MirrorPubForNf[]>,
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
    // ══════════════════════════════════════════════════════════════════════════
    // As publicacoes do GRUPO valem pra unidade inteira (05/08/2026).
    //
    // 🔴 O comentario abaixo sempre disse isso, mas o codigo passava a publicacao de CADA
    // LINHA. No grupo so o LIDER tem publicacao — entao cada membro caia no ramo "sem
    // espelho" e gerava a vaga CORINGA `*|CNPJ`, enquanto a nota do lider chegava com a
    // chave do espelho dele (`|CNPJ`). Duas vagas para a MESMA nota: a do lider, coberta, e
    // a coringa dos membros, que nada cobria.
    //
    // Caso que denunciou (grupo Alvarenga): o lider OTHON tem 0 pacote, entao a unica vaga
    // era a coringa dos membros — a nota dele estava validada e a grade dizia "0/1". Nos
    // grupos em que o lider tambem entrega, o efeito era o numero inflado que aparecia na
    // tela: "NF 1/2 — falta 1", "NF 2/4 — falta 2".
    // ══════════════════════════════════════════════════════════════════════════
    const pubsDaUnidade = unitRows.flatMap((r) => [...(pubsByDriver?.get(r.driverId) ?? [])]);

    const expectedSlots = new Set<string>();
    const validatedKeys = new Set<string>();
    const receivedKeys = new Set<string>();
    let manual = false;
    for (const row of unitRows) {
      for (const slot of expectedNfSlotKeys(row, platforms, pubsDaUnidade)) {
        expectedSlots.add(slot);
      }
      const nf = notesByDriver.get(row.driverId);
      if (nf) {
        for (const k of nf.validated) validatedKeys.add(k);
        for (const k of nf.received) receivedKeys.add(k);
      }
      if (row.notaFiscal) manual = true;
    }
    const slots = [...expectedSlots];
    const expected = slots.length;
    const validated = slots.filter((s) => slotCoberto(s, validatedKeys)).length;
    const pending = slots.filter((s) => !slotCoberto(s, validatedKeys) && slotCoberto(s, receivedKeys)).length;
    const complete = manual || (expected > 0 && validated >= expected);
    const progress: NfProgress = { expected, validated, pending, complete, manual };
    for (const row of unitRows) out.set(row.paymentId, progress);
  }
  return out;
}

// ─── Espelho do app da Shopee (print da tela) — 04/08/2026 ──────────────────
//
// ⚠️ Diferente da NF em um ponto que muda tudo: a nota fiscal é AGREGADA POR
// GRUPO (o líder manda uma que vale pelos membros), mas o print é UM POR DRIVER
// — o líder envia, porém cada print é do pacote de um membro e marca o pagamento
// DAQUELE membro. Por isso aqui não há agregação por grupo: é por pagamento,
// direto. (O cabeçalho verde do grupo continua saindo de `every()` na DriverList,
// como já acontece com o "espelho conferido".)

/** Como está o print de um driver numa plataforma. */
export type ProofState =
  /** conferido: período e quantidade batem — autoriza o "espelho conferido" */
  | 'confirmado'
  /** chegou, mas a quantidade não bate com a planilha — precisa da sua atenção */
  | 'divergente'
  /** chegou e ainda não foi lido (fila) ou a leitura falhou — conferir na mão */
  | 'pendente'
  /** recusado na hora (data errada / ilegível): o driver precisa reenviar */
  | 'recusado'
  /** ainda não mandou nada */
  | 'faltando';

/**
 * Um pedido de print gravado em `driverpay_proof_requests`.
 *
 * `driverId` é o ALCANCE do pedido (04/08/2026): **null = todo mundo** com pacote naquela
 * plataforma (como sempre foi); **preenchido = só aquele entregador**. Pedir de um grupo
 * inteiro é gravar uma linha por membro — não existe conceito de "pedido de grupo".
 */
export interface ProofRequest {
  platformName: string;
  driverId: string | null;
}

/**
 * REGRA DE LOGÍSTICA (decisão do Victor, 04/08/2026): o pedido **"pra todos" só cobra quem
 * está EM GRUPO**. Na prática quem anexa é o líder, que já vê um cartão por membro — e quem
 * não tem grupo nenhum não deve receber pedido pelo portal, fica pra alguém resolver na mão
 * (ou colocar num grupo). Um pedido **individual** continua valendo mesmo sem grupo: ali o
 * operador escolheu aquela pessoa de propósito.
 */
function pedidoAlcanca(req: ProofRequest, row: DriverRowData): boolean {
  if (req.driverId === null) return row.groupName !== null;
  return req.driverId === row.driverId;
}

/**
 * Plataformas cuja **planilha ainda não chegou** nesta quinzena: NINGUÉM tem pacote nelas.
 *
 * Pedido do Victor (04/08): dá pra solicitar o print ANTES de importar a planilha, pra
 * adiantar. Sem planilha o sistema não sabe quem entregou o quê — então cobra todo mundo
 * que está em grupo (decisão dele: "somente entregadores que estiverem em grupos").
 *
 * ⚠️ É por PLATAFORMA de propósito: importar a eMile não pode fazer o sistema achar que a
 * planilha da Shopee chegou. E se alguém já tem pacote na plataforma, a planilha chegou —
 * aí vale a regra normal (só quem tem pacote), senão voltaríamos a cobrar quem não entregou.
 */
export function plataformasSemPlanilha(
  rows: readonly DriverRowData[],
  platformNames: readonly string[],
): Set<string> {
  const semPlanilha = new Set(platformNames);
  for (const row of rows) {
    for (const rl of row.routes) {
      for (const [nome, qtd] of Object.entries(rl.packages)) {
        if ((qtd ?? 0) > 0) semPlanilha.delete(nome);
      }
    }
  }
  return semPlanilha;
}

/**
 * Uma linha de rota que vai ser corrigida, com o efeito em dinheiro.
 */
export interface AjusteDeRota {
  /** Índice da rota em `row.routes`. */
  indice: number;
  route: string;
  /** id da linha em `driverpay_payment_packages` (null = rota sem linha gravada ainda). */
  packageId: string | null;
  de: number;
  para: number;
  /** Valor por pacote DESTA rota — é o que faz a diferença mudar de tamanho. */
  rate: number;
}

/**
 * Uma rota do driver nesta plataforma, com o antes/depois — INCLUSIVE as que não
 * mudam. Existe porque, com duas rotas, mostrar só a que mudou esconde a pergunta
 * que o operador faz: "e a outra, ficou como?". Com preços diferentes por rota,
 * saber ONDE a diferença caiu é o que explica o valor.
 */
export interface LinhaDeRota {
  indice: number;
  route: string;
  /** Pacotes hoje nesta rota. */
  de: number;
  /** Pacotes depois da correção (igual a `de` quando a rota não muda). */
  para: number;
  /** Valor por pacote DESTA rota. */
  rate: number;
  /** true na rota que recebeu (ou perdeu) a diferença. */
  mudou: boolean;
}

export interface PlanoDeCorrecao {
  ajustes: AjusteDeRota[];
  /** TODAS as rotas do driver nesta plataforma, na ordem da grade. */
  linhas: LinhaDeRota[];
  totalAntes: number;
  totalDepois: number;
  /** Quanto o "Total a receber" do driver muda em R$ (positivo = ele recebe mais). */
  deltaReais: number;
  /** true quando as rotas têm preços DIFERENTES — aí onde a diferença cai muda o valor. */
  precosDiferentes: boolean;
  /** Não deu pra chegar no total pedido (ex.: pedir mais do que dá pra tirar). */
  erro: string | null;
}

/**
 * Planeja a correção da quantidade de pacotes de um driver numa plataforma.
 *
 * REGRA (decisão do Victor, 04/08/2026): **a diferença vai pra MAIOR rota**. Isso resolve
 * 87 dos 95 casos de múltiplas rotas medidos em produção sem ninguém ter que pensar.
 *
 * ⚠️ Se não couber na maior (tirar mais do que ela tem), continua na próxima maior — uma
 * rota NUNCA fica negativa. E quando as rotas têm **preços diferentes** (8 casos medidos), a
 * escolha muda o valor a receber: por isso `deltaReais` e `precosDiferentes` saem daqui, pra
 * tela avisar ANTES de aplicar. O veredito final é sempre um clique do operador.
 */
export function planejarCorrecaoDePacotes(
  row: DriverRowData,
  platformName: string,
  novoTotal: number,
): PlanoDeCorrecao {
  const rateDa = (rl: RouteLine): number =>
    rl.rates[platformName] ?? row.ratesByPlatform[platformName] ?? 0;

  const linhas = row.routes
    .map((rl, indice) => ({
      indice,
      route: rl.route,
      packageId: rl.packageIds[platformName] ?? null,
      atual: rl.packages[platformName] ?? 0,
      rate: rateDa(rl),
    }))
    .filter((l) => l.atual > 0 || l.packageId !== null);

  const totalAntes = linhas.reduce((s, l) => s + l.atual, 0);
  const precosDiferentes = new Set(linhas.map((l) => l.rate)).size > 1;
  const alvo = Math.max(0, Math.round(novoTotal));

  /** Retrato das rotas quando NADA muda (todas iguais ao que já está lançado). */
  const linhasParadas = (): LinhaDeRota[] =>
    linhas.map((l) => ({ indice: l.indice, route: l.route, de: l.atual, para: l.atual, rate: l.rate, mudou: false }));

  if (linhas.length === 0) {
    return { ajustes: [], linhas: [], totalAntes: 0, totalDepois: 0, deltaReais: 0, precosDiferentes: false,
             erro: 'Este driver não tem pacote lançado nesta plataforma — lance na grade primeiro.' };
  }
  if (alvo === totalAntes) {
    return { ajustes: [], linhas: linhasParadas(), totalAntes, totalDepois: totalAntes, deltaReais: 0,
             precosDiferentes, erro: null };
  }

  // Da MAIOR pra menor: a diferença cai na maior; o que não couber escorre pra próxima.
  const ordem = [...linhas].sort((a, b) => b.atual - a.atual);
  let falta = alvo - totalAntes;
  const novos = new Map<number, number>();
  for (const l of ordem) {
    if (falta === 0) break;
    if (falta > 0) {
      // Sobrando pacotes: joga TUDO na maior (não há teto pra somar).
      novos.set(l.indice, l.atual + falta);
      falta = 0;
      break;
    }
    const podeTirar = Math.min(l.atual, -falta);
    if (podeTirar > 0) {
      novos.set(l.indice, l.atual - podeTirar);
      falta += podeTirar;
    }
  }
  if (falta !== 0) {
    return { ajustes: [], linhas: linhasParadas(), totalAntes, totalDepois: totalAntes, deltaReais: 0, precosDiferentes,
             erro: `Não dá pra chegar em ${alvo}: o driver só tem ${totalAntes} pacote(s) nesta plataforma.` };
  }

  const ajustes: AjusteDeRota[] = [];
  const linhasFinais: LinhaDeRota[] = [];
  let deltaReais = 0;
  for (const l of linhas) {
    const para = novos.get(l.indice);
    const mudou = para !== undefined && para !== l.atual;
    linhasFinais.push({ indice: l.indice, route: l.route, de: l.atual, para: mudou ? para! : l.atual, rate: l.rate, mudou });
    if (!mudou) continue;
    ajustes.push({ indice: l.indice, route: l.route, packageId: l.packageId, de: l.atual, para: para!, rate: l.rate });
    deltaReais += (para! - l.atual) * l.rate;
  }
  return { ajustes, linhas: linhasFinais, totalAntes, totalDepois: alvo, deltaReais, precosDiferentes, erro: null };
}

// ─── TAG DE PAGAMENTO CONCLUÍDO (04/08/2026) ─────────────────────────────────
// Quem JÁ RECEBEU, por (entregador, plataforma). Decisões do Victor:
//  · pagar só a SHOPEE marca **só a SHOPEE** — as outras continuam podendo ser pagas;
//  · num GRUPO, o dinheiro sai numa linha só do líder mas cobre os N membros, então
//    marcar o relatório marca **os N membros**, não só o líder.

export interface PaymentMark {
  driverId: string;
  platformName: string;
  /** ISO. É a data que a tela mostra: "já pago em 04/08". */
  paidAt: string;
  /**
   * Neste pagamento os vales e perdas foram descontados? (04/08/2026)
   * `false` = saiu PARCIAL, o desconto ficou pendente pro pagamento das demais plataformas.
   * `null` = marca antiga, de antes desta coluna existir.
   */
  deductionsApplied?: boolean | null;
}

export type EstadoPagamento =
  /** todas as plataformas em que ele tem pacote já foram pagas */
  | 'concluido'
  /** algumas pagas, outras não */
  | 'parcial'
  /** nenhuma paga */
  | 'pendente'
  /** não tem pacote nenhum nesta quinzena — não há o que pagar */
  | 'sem_pacote';

export interface PagamentoDoDriver {
  estado: EstadoPagamento;
  pagas: string[];
  faltando: string[];
  /** Data do pagamento mais recente dele (ISO), pra mostrar no aviso. */
  ultimoPagamento: string | null;
  /**
   * Ele foi pago em ALGUMA plataforma SEM o desconto de vales/perdas ter saído?
   * (04/08/2026) — o desconto ficou pendente e é fácil esquecer de aplicar depois.
   */
  descontoPendente: boolean;
}

/** Índice rápido `driverId|plataforma` -> a marca daquele pagamento. */
export function indexarMarcas(marcas: readonly PaymentMark[]): Map<string, PaymentMark> {
  const m = new Map<string, PaymentMark>();
  for (const x of marcas) {
    const k = `${x.driverId}|${x.platformName}`;
    const atual = m.get(k);
    // Se marcaram duas vezes, vale a mais recente (é a que o operador lembra).
    if (!atual || x.paidAt > atual.paidAt) m.set(k, x);
  }
  return m;
}

/**
 * Situação de pagamento de UM entregador, olhando só as plataformas em que ele tem pacote.
 *
 * ⚠️ "concluído" NUNCA aparece pra quem ainda tem plataforma a receber — foi a razão de a
 * marca ser por plataforma, e não um simples "pago sim/não" no pagamento.
 */
export function pagamentoDoDriver(
  row: DriverRowData,
  platformNames: readonly string[],
  indice: ReadonlyMap<string, PaymentMark>,
): PagamentoDoDriver {
  const comPacote = platformNames.filter((nome) => platformPackages(row, nome) > 0);
  if (comPacote.length === 0) {
    return { estado: 'sem_pacote', pagas: [], faltando: [], ultimoPagamento: null, descontoPendente: false };
  }
  const pagas: string[] = [];
  const faltando: string[] = [];
  let ultimo: string | null = null;
  let descontoPendente = false;
  for (const nome of comPacote) {
    const m = indice.get(`${row.driverId}|${nome}`);
    if (m) {
      pagas.push(nome);
      if (!ultimo || m.paidAt > ultimo) ultimo = m.paidAt;
      // `false` explícito = saiu parcial de propósito. `null`/undefined = marca antiga,
      // de antes de a gente registrar isso — não dá pra afirmar nada, então não acusa.
      if (m.deductionsApplied === false) descontoPendente = true;
    } else {
      faltando.push(nome);
    }
  }
  const estado: EstadoPagamento =
    pagas.length === 0 ? 'pendente' : faltando.length === 0 ? 'concluido' : 'parcial';
  return { estado, pagas, faltando, ultimoPagamento: ultimo, descontoPendente };
}

/**
 * Os pares (entregador, plataforma) que um relatório vai marcar como pagos.
 * São as plataformas DO RELATÓRIO em que cada linha tem pacote — linha de grupo entra
 * membro por membro, porque `rows` já vem com todos eles.
 */
export function marcasDoRelatorio(
  rows: readonly DriverRowData[],
  platformNames: readonly string[],
  allowed?: ReadonlySet<string>,
): Array<{ driverId: string; platformName: string }> {
  const escopo = allowed && allowed.size > 0 ? platformNames.filter((n) => allowed.has(n)) : platformNames;
  const out: Array<{ driverId: string; platformName: string }> = [];
  for (const row of rows) {
    for (const nome of escopo) {
      if (platformPackages(row, nome) > 0) out.push({ driverId: row.driverId, platformName: nome });
    }
  }
  return out;
}

/** Quem, nesse relatório, JÁ tinha sido pago naquelas plataformas — com a data. */
export function jaPagosNoRelatorio(
  rows: readonly DriverRowData[],
  platformNames: readonly string[],
  indice: ReadonlyMap<string, PaymentMark>,
  allowed?: ReadonlySet<string>,
): Array<{
  driverId: string; name: string; platformName: string; paidAt: string;
  deductionsApplied?: boolean | null; valeOuPerda: number;
}> {
  const nomeDe = new Map(rows.map((r) => [r.driverId, r.name]));
  // 05/08/2026: o valor de vale/perda vem junto porque o aviso de "desconto pendente"
  // precisa saber se existe o que descontar — sem isso ele listava 38 pessoas que não
  // devem nada (ver src/utils/descontoPendente.ts).
  const valeDe = new Map(rows.map((r) => [r.driverId, deductionsOf(r)]));
  const out: Array<{
    driverId: string; name: string; platformName: string; paidAt: string;
    deductionsApplied?: boolean | null; valeOuPerda: number;
  }> = [];
  for (const { driverId, platformName } of marcasDoRelatorio(rows, platformNames, allowed)) {
    const m = indice.get(`${driverId}|${platformName}`);
    if (m) {
      out.push({ driverId, name: nomeDe.get(driverId) ?? '', platformName,
                 paidAt: m.paidAt, deductionsApplied: m.deductionsApplied,
                 valeOuPerda: valeDe.get(driverId) ?? 0 });
    }
  }
  return out;
}

/** Plataformas em que este driver deve mandar print: as SOLICITADAS PRA ELE onde tem pacote. */
export function expectedProofPlatforms(
  row: DriverRowData,
  requests: readonly ProofRequest[],
  /** Plataformas sem planilha importada: aí cobra sem exigir pacote (ver acima). */
  semPlanilha?: ReadonlySet<string>,
): string[] {
  const nomes = new Set<string>();
  for (const req of requests) {
    if (!pedidoAlcanca(req, row)) continue;
    const temPacote = platformPackages(row, req.platformName) > 0;
    if (temPacote || semPlanilha?.has(req.platformName)) nomes.add(req.platformName);
  }
  return [...nomes];
}

/**
 * Veredito da QUANTIDADE quando a planilha finalmente chega, usando o número que a IA
 * **já leu** e está guardado no print. É conta pura: nenhuma foto é baixada e nenhuma
 * chamada de IA é feita — foi a exigência do Victor ("não trave a fila, não trave a API").
 *
 * ⚠️ Tem que dar o MESMO veredito que o `runProofCheck` da edge function. Existe um teste
 * (`driverPaySemPlanilha.spec.ts`) que roda os dois lado a lado justamente pra travar isso.
 */
export function statusPorQuantidade(
  readPackages: number | null,
  expectedPackages: number,
  tolerancePackages = 0,
): 'confirmado' | 'divergente' | 'pendente' {
  if (readPackages === null) return 'pendente';       // nunca foi lido: nada a comparar
  if (!(expectedPackages > 0)) return 'pendente';     // ainda sem planilha pra ele
  const tol = Math.max(0, tolerancePackages);
  return Math.abs(readPackages - expectedPackages) <= tol ? 'confirmado' : 'divergente';
}

/**
 * Plataformas em que ele foi cobrado mas, **com a planilha já importada, não tem pacote** —
 * ou seja, não entregou naquela plataforma nesta quinzena e **não precisa mandar print**.
 *
 * Pedido do Victor (04/08): assim que a planilha entra, a pendência dessa gente some sozinha
 * (o líder para de caçar print de quem não roda Shopee), mas em vez de virar um traço mudo o
 * painel mostra uma **marca própria** — pra dar pra distinguir "não precisava" de "não foi
 * pedido". ⚠️ Isto resolve **só o print**: não marca o "Espelho conferido" do pagamento.
 */
export function proofDispensadoSemPacote(
  row: DriverRowData,
  requests: readonly ProofRequest[],
  semPlanilha?: ReadonlySet<string>,
): string[] {
  const nomes = new Set<string>();
  for (const req of requests) {
    if (!pedidoAlcanca(req, row)) continue;
    // Planilha ainda não chegou: ele continua pendente, não dispensado.
    if (semPlanilha?.has(req.platformName)) continue;
    if (platformPackages(row, req.platformName) <= 0) nomes.add(req.platformName);
  }
  return [...nomes];
}

/**
 * Plataformas em que este driver TERIA pacote pra mandar, mas ficou de fora **por não estar
 * em grupo nenhum**. Não entra no contador de prints (senão ele nunca fecharia — decisão do
 * Victor: "marca separado, fora da conta"); serve pro selo cinza "sem grupo — não pedido"
 * e pro aviso da janela de solicitar.
 */
export function proofForaPorSemGrupo(
  row: DriverRowData,
  requests: readonly ProofRequest[],
): string[] {
  if (row.groupName !== null) return [];
  const nomes = new Set<string>();
  for (const req of requests) {
    if (req.driverId !== null) continue;                        // pedido geral só
    if (platformPackages(row, req.platformName) <= 0) continue; // sem pacote, nada a mandar
    nomes.add(req.platformName);
  }
  // Se alguém pediu dele individualmente, ele ESTÁ sendo cobrado — não é "de fora".
  for (const req of requests) if (req.driverId === row.driverId) nomes.delete(req.platformName);
  return [...nomes];
}

export interface ProofProgress {
  /** quantos prints este driver deve mandar */
  expected: number;
  /** quantos já bateram (período + quantidade) */
  confirmed: number;
  /** quantos chegaram com quantidade diferente da planilha — SÓ o painel vê */
  divergent: number;
  /** quantos chegaram e ainda não foram lidos (na fila) ou falharam na leitura */
  pending: number;
  /** quantos foram recusados e esperam o driver reenviar */
  rejected: number;
  /** quantos ainda não chegaram */
  missing: number;
  /** verde: todos os esperados conferidos */
  complete: boolean;
  /** âmbar: tem divergência de quantidade — é o que você precisa olhar */
  needsAttention: boolean;
}

/**
 * Progresso do print por pagamento. `stateByDriverPlatform` traz o estado de cada
 * print já recebido, na chave `driverId|plataforma`. Puro/testável.
 *
 * Sem plataforma solicitada (ninguém apertou "Solicitar espelho"), `expected` é 0
 * e `complete` é false — a coluna some da tela em vez de aparecer verde de graça.
 */
export function computeProofProgressByPayment(
  rows: readonly DriverRowData[],
  requests: readonly ProofRequest[],
  stateByDriverPlatform: ReadonlyMap<string, ProofState>,
  /** Plataformas sem planilha importada: cobra sem exigir pacote (ver expectedProofPlatforms). */
  semPlanilha?: ReadonlySet<string>,
): Map<string, ProofProgress> {
  const out = new Map<string, ProofProgress>();
  for (const row of rows) {
    const plataformas = expectedProofPlatforms(row, requests, semPlanilha);
    const contagem: Record<ProofState, number> = {
      confirmado: 0, divergente: 0, pendente: 0, recusado: 0, faltando: 0,
    };
    for (const nome of plataformas) {
      contagem[stateByDriverPlatform.get(`${row.driverId}|${nome}`) ?? 'faltando'] += 1;
    }
    const expected = plataformas.length;
    out.set(row.paymentId, {
      expected,
      confirmed: contagem.confirmado,
      divergent: contagem.divergente,
      pending: contagem.pendente,
      rejected: contagem.recusado,
      missing: contagem.faltando,
      complete: expected > 0 && contagem.confirmado >= expected,
      needsAttention: contagem.divergente > 0,
    });
  }
  return out;
}

/**
 * Traduz a linha do banco (`driverpay_delivery_proofs`) pro estado que a tela usa.
 *
 * Note que `divergente` vem do `check_status`, não do `status`: o print divergente
 * é ACEITO (status 'recebido'), e a diferença só existe pro painel.
 */
export function proofStateFromRow(row: {
  status: string;
  checkStatus: string | null;
}): ProofState {
  if (row.status === 'rejeitado') return 'recusado';
  if (row.status === 'validado') return 'confirmado';
  if (row.checkStatus === 'divergente') return 'divergente';
  return 'pendente';
}

/**
 * Qual print vale, quando o driver mandou mais de um pra mesma plataforma.
 *
 * Ordem de prioridade — pensada pra tela não mentir: um print confirmado depois de
 * uma recusa apaga a recusa (o driver corrigiu), e uma divergência nunca some por
 * causa de um envio pendente posterior, senão a linha que você precisa olhar
 * sumiria sozinha.
 */
export function melhorEstado(estados: readonly ProofState[]): ProofState {
  const ordem: ProofState[] = ['confirmado', 'divergente', 'pendente', 'recusado', 'faltando'];
  for (const e of ordem) if (estados.includes(e)) return e;
  return 'faltando';
}

/**
 * Formula do pagamento (net pode ser negativo).
 *
 * D3 — espelho por plataforma: quando `allowedPlatformNames` e informado, SO conta os
 * pacotes das plataformas desse conjunto (e o Zapex so se 'Zapex' estiver nele), pra que o
 * TOTAL do espelho filtrado bata com as linhas exibidas. Quando ausente (todos os callers
 * atuais), comporta-se EXATAMENTE como antes — soma todas as plataformas do row.
 *
 * Pagamento PARCIAL (2026-07-27, decisao do Victor): descontos e vales sao do DRIVER, nao
 * de uma plataforma — pagar so a ANJUN abatendo tudo e depois pagar o resto abateria duas
 * vezes. `includeDeductions=false` deixa o net BRUTO (so pacotes), sem mexer nos campos
 * `discounts`/`vales`, que continuam com os valores reais pra exibicao ("vem por ai").
 */
export function computeRowTotals(
  row: DriverRowData,
  allowedPlatformNames?: ReadonlySet<string>,
  includeDeductions = true,
  /**
   * Quanto abater DESTE driver nesta conta, em R$ (07/08/2026, decisao do Victor).
   *
   * Quando informado, manda em cima do `includeDeductions`: e o valor que a regra de saldo
   * (`descontoSaldo.ts`) decidiu pra esta pessoa neste pagamento — pode ser 0 (ja foi
   * descontada antes) ou um pedaco do que ela deve (o desconto nao cabia no que ela recebe).
   * Ausente = comportamento de sempre, tudo-ou-nada pelo `includeDeductions`.
   */
  deductionOverride?: number,
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
  const temOverride = typeof deductionOverride === 'number'
    && Number.isFinite(deductionOverride)
    && deductionOverride >= 0;
  const deducted = temOverride
    ? (deductionOverride as number)
    : (includeDeductions ? discounts + vales : 0);
  return {
    totalPackages,
    packagesAmount,
    zapex: zapexAmount,
    discounts,
    vales,
    deducted,
    net: packagesAmount + zapexAmount - deducted,
  };
}

/** Vales + perdas (descontos) do driver neste pagamento, em R$. Puro/testavel. */
export function deductionsOf(row: DriverRowData): number {
  return (
    row.discounts.reduce((sum, d) => sum + d.amount, 0) +
    row.vales.reduce((sum, v) => sum + v.amount, 0)
  );
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
  includeDeductions = true,
): DriverMirrorData {
  const isAllowed = (name: string) => !allowedPlatformNames || allowedPlatformNames.has(name);
  const totals = computeRowTotals(row, allowedPlatformNames, includeDeductions);
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
    // false = descontos/vales aparecem listados mas NAO foram abatidos (pagamento parcial).
    deductionsApplied: includeDeductions,
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
  includeDeductions = true,
): DriverGroupMirrorData {
  const drivers = rows.map((r) =>
    buildDriverMirrorData(r, platforms, company, period, allowedPlatformNames, includeDeductions),
  );
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
    deductionsApplied: includeDeductions,
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
  includeDeductions = true,
): { groups: DriverGroupMirrorData[]; singles: DriverMirrorData[] } {
  const groupOf = (r: DriverRowData): string => r.groupName ?? NO_GROUP_LABEL;
  const groups = Array.from(selectedGroups)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((name) => {
      const groupRows = rows.filter((r) => groupOf(r) === name);
      return groupRows.length > 0
        ? buildGroupMirrorData(name, groupRows, platforms, company, period, allowedPlatformNames, includeDeductions)
        : null;
    })
    .filter((g): g is DriverGroupMirrorData => g !== null);
  const singles = rows
    .filter((r) => selectedDrivers.has(r.paymentId) && !selectedGroups.has(groupOf(r)))
    .map((r) => buildDriverMirrorData(r, platforms, company, period, allowedPlatformNames, includeDeductions));
  return { groups, singles };
}

// ── O QUE A ETIQUETA "PAGO" DIZ (05/08/2026, pedido do Victor) ──────────────
// "altera a TAG de pago e especifica quais plataformas foram pagas".
//
// Antes: pagamento COMPLETO mostrava só a data ("✓ pago 05/08/2026") e as plataformas
// ficavam escondidas na dica; só o PARCIAL nomeava ("pago SHOPEE+LOGGI"). Agora os dois
// nomeiam — a pergunta na hora de pagar é "o que já saiu pra ele?", não "que dia foi".
//
// ⚠️ Com 5 plataformas o texto estoura a coluna do nome, então a etiqueta mostra até 3 e
// resume o resto ("+2"). A LISTA COMPLETA continua na dica: encurtar é problema de espaço,
// esconder seria problema de dinheiro.

const MAX_PLATAFORMAS_NA_ETIQUETA = 3;

export function resumirPlataformas(nomes: readonly string[], max = MAX_PLATAFORMAS_NA_ETIQUETA): string {
  if (nomes.length === 0) return '';
  if (nomes.length <= max) return nomes.join('+');
  return `${nomes.slice(0, max).join('+')}+${nomes.length - max}`;
}

/** Data curta (05/08) — o ano é o da quinzena, e a etiqueta é apertada. */
function dataCurtaBr(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** O texto da etiqueta na linha do entregador. */
export function rotuloDaEtiquetaDePagamento(p: PagamentoDoDriver): string {
  const plats = resumirPlataformas(p.pagas);
  if (p.estado === 'concluido') {
    const data = dataCurtaBr(p.ultimoPagamento);
    return `✓ pago ${plats}${data ? ` · ${data}` : ''}`;
  }
  return `pago ${plats}`;
}

/**
 * Plataformas pagas de um GRUPO. Só dá pra nomear quando TODOS os membros foram pagos nas
 * mesmas — se um recebeu SHOPEE e outro SHOPEE+LOGGI, dizer "SHOPEE+LOGGI" mentiria sobre o
 * primeiro, e dizer "SHOPEE" esconderia o segundo. Aí a etiqueta fica genérica e a dica
 * explica.
 */
export function plataformasPagasDoGrupo(
  situacoes: readonly PagamentoDoDriver[],
): { iguais: boolean; plataformas: string[] } {
  if (situacoes.length === 0) return { iguais: false, plataformas: [] };
  const chave = (p: PagamentoDoDriver) => [...p.pagas].sort().join('|');
  const primeira = chave(situacoes[0]);
  const iguais = situacoes.every((p) => chave(p) === primeira);
  const uniao = [...new Set(situacoes.flatMap((p) => p.pagas))].sort();
  return { iguais, plataformas: iguais ? [...situacoes[0].pagas] : uniao };
}

// ── FILTRO "PAGOS × NÃO PAGOS" (05/08/2026, pedido do Victor) ───────────────
// A tag "pagamento concluído" já existia na grade; faltava poder filtrar por ela.
//
// ⚠️ Duas decisões que evitam erro de dinheiro:
//  · PARCIAL entra em "não pagos" — quem recebeu só a SHOPEE ainda tem dinheiro a
//    receber, e some-lo dos "pagos" faria alguém ser esquecido;
//  · quem NÃO TEM PACOTE fica fora dos dois — não há o que pagar, e ele só encheria
//    a lista de "não pagos" com gente que não devia estar lá.

export type FiltroDePagamento = '' | 'pago' | 'nao_pago';

export function passaNoFiltroDePagamento(
  estado: PagamentoDoDriver['estado'] | undefined,
  filtro: FiltroDePagamento,
): boolean {
  if (!filtro) return true;
  if (estado === 'sem_pacote' || estado === undefined) return false;
  return filtro === 'pago' ? estado === 'concluido' : estado !== 'concluido';
}

// ── QUANTOS JÁ E QUANTOS FALTAM, nos botões de ordenar (05/08/2026) ─────────
// "coloca os numerozinhos aqui também: quantos já validou e quantos ainda falta".
//
// ⚠️ Tem que usar EXATAMENTE a regra dos selos que já aparecem no cabeçalho de cada grupo,
// senão o botão diz um número e a lista mostra outro:
//   · NF ............. só conta grupo que ESPERA nota (expected > 0); verde = `complete`;
//   · espelho no app . verde se QUALQUER membro recebeu — no grupo o espelho vai só pro
//                      líder (decisão "Opção A", 24/07), exigir todos daria sempre zero;
//   · print conferido  verde só quando TODOS os membros estão conferidos (é por driver).

export interface ContagemDoCriterio {
  feitos: number;
  faltam: number;
}

export function contagemDoCriterio(
  grupos: ReadonlyArray<{ rows: DriverRowData[] }>,
  key: 'nf' | 'espelho' | 'espelhoApp',
  nfProgress?: ReadonlyMap<string, { expected: number; complete: boolean }>,
  publicados?: ReadonlySet<string>,
): ContagemDoCriterio {
  let feitos = 0;
  let faltam = 0;
  for (const g of grupos) {
    if (g.rows.length === 0) continue;
    if (key === 'nf') {
      const nf = nfProgress?.get(g.rows[0].paymentId);
      if (!nf || nf.expected === 0) continue; // não espera nota: não entra na conta
      if (nf.complete) feitos += 1;
      else faltam += 1;
    } else if (key === 'espelhoApp') {
      if (g.rows.some((r) => publicados?.has(r.driverId))) feitos += 1;
      else faltam += 1;
    } else {
      if (g.rows.every((r) => r.espelhoConferido)) feitos += 1;
      else faltam += 1;
    }
  }
  return { feitos, faltam };
}

// ── OS NUMEROZINHOS DOS BOTÕES DO CABEÇALHO (05/08/2026, pedido do Victor) ──
// "coloca o numerozinho do lado de Notas recebidas e Espelhos recebidos, igual o
//  Despublicar todos. Se tiver pendência, mostra quantas faltam validar; não tendo
//  pendência, mostra em verdinho o total já validado."
//
// ⚠️ O número do botão TEM que ser o mesmo que aparece dentro da tela ao abrir. Por isso
// a contagem dos prints usa a MESMA `proofPrecisaAtencao` da aba "Precisam de você", e os
// repetidos saem da MESMA função — dois cálculos parecidos acabariam divergindo.

export interface SeloDeBotao {
  numero: number;
  /** 'pendente' = falta gente validar (âmbar) · 'ok' = tudo validado (verde) · 'vazio' = sem selo. */
  estado: 'pendente' | 'ok' | 'vazio';
}

export function seloDoBotao(pendentes: number, concluidos: number): SeloDeBotao {
  if (pendentes > 0) return { numero: pendentes, estado: 'pendente' };
  if (concluidos > 0) return { numero: concluidos, estado: 'ok' };
  return { numero: 0, estado: 'vazio' };
}

/**
 * Prints que são o MESMO arquivo em drivers diferentes → id do print ➜ nomes dos outros.
 * O app da Shopee não mostra o nome do entregador na tela, então o sistema não tem como
 * saber de quem é a foto: ele avisa, não trava.
 */
export function printsRepetidos(
  proofs: readonly { id: string; driverId: string; driverName: string; fileSha256: string | null }[],
): Map<string, string[]> {
  const porHash = new Map<string, Set<string>>();
  for (const p of proofs) {
    if (!p.fileSha256) continue;
    const s = porHash.get(p.fileSha256) ?? new Set<string>();
    s.add(p.driverId);
    porHash.set(p.fileSha256, s);
  }
  const out = new Map<string, string[]>();
  for (const p of proofs) {
    if (!p.fileSha256) continue;
    const donos = porHash.get(p.fileSha256);
    if (donos && donos.size > 1) {
      out.set(
        p.id,
        proofs.filter((o) => o.fileSha256 === p.fileSha256 && o.driverId !== p.driverId).map((o) => o.driverName),
      );
    }
  }
  return out;
}

// ── QUAL VALOR ESPERAR NA NOTA (05/08/2026, pedido do Victor) ────────────────
// "coloca para aparecer o valor do espelho na tagzinha, assim já sabemos qual valor
// esperar na nota". Hoje esse número só aparecia DENTRO da mensagem de recusa — ou seja,
// só depois de dar errado. Agora aparece sempre, do lado dos selos.
//
// De onde vem: a conferência automática já guarda em `check_details.candidates` todos os
// valores que a nota PODIA ter (o do espelho publicado, o líquido, a soma por CNPJ) e, em
// `matchedCandidates`, qual deles a nota bateu.

export interface ValorEsperadoDaNota {
  valor: number;
  /** true = a nota bateu com este valor; false = é o valor que se espera dela. */
  bateu: boolean;
  /** Veio do espelho publicado (o número que o entregador viu no app). */
  doEspelho: boolean;
  /** A chave crua do candidato (`espelho_group_cheio`, …) — vira o texto da dica. */
  origem: string;
  /** De onde saiu o número, em português, pra dica da tela. */
  rotulo: string;
}

/**
 * Traduz a chave do candidato pra português.
 *
 * ⚠️ ISTO PRECISA APARECER NA TELA. Um mesmo entregador tem VÁRIOS valores possíveis ao
 * mesmo tempo — o dele, o do grupo, com e sem os vales abatidos, por CNPJ. Mostrar só o
 * número deixa a tag brigando com a mensagem de recusa (que escolhe o candidato mais
 * PRÓXIMO do que o entregador digitou, só pra explicar o erro). Medido em produção: tag
 * dizendo R$ 18.885,87 e recusa dizendo R$ 4.338,10 — os dois certos, coisas diferentes.
 */
export function rotuloDoCandidato(chave: string): string {
  if (chave.startsWith('espelho_')) {
    const resto = chave.slice('espelho_'.length);
    if (resto.startsWith('group')) {
      return resto.includes('abatido')
        ? 'espelho do GRUPO, com vales/perdas já abatidos'
        : 'espelho do GRUPO (valor cheio)';
    }
    if (resto.startsWith('individual')) {
      return resto.includes('abatido')
        ? 'espelho individual, com vales/perdas já abatidos'
        : 'espelho individual (valor cheio)';
    }
    if (resto.startsWith('selection_')) return `espelho só de ${resto.slice('selection_'.length)}`;
    return 'espelho publicado';
  }
  if (chave === 'liquido_grupo') return 'total líquido do grupo';
  if (chave === 'liquido_individual') return 'total líquido do entregador';
  if (chave.startsWith('somaCnpj_grupo')) {
    return chave.includes('abatido') ? 'soma do grupo neste CNPJ, com abate' : 'soma do grupo neste CNPJ';
  }
  if (chave.startsWith('somaCnpj_individual')) {
    return chave.includes('abatido') ? 'soma dele neste CNPJ, com abate' : 'soma dele neste CNPJ';
  }
  return chave;
}

export function valorEsperadoDaNota(
  checkDetails: Record<string, unknown> | null | undefined,
): ValorEsperadoDaNota | null {
  const cands = checkDetails?.candidates;
  if (!cands || typeof cands !== 'object') return null;
  const mapa = cands as Record<string, number>;
  const matched = Array.isArray(checkDetails?.matchedCandidates)
    ? (checkDetails.matchedCandidates as string[])
    : [];

  // 1) Bateu: mostra o valor que bateu — é a verdade do que aconteceu.
  const bateu = matched.find((k) => typeof mapa[k] === 'number');
  if (bateu) {
    return {
      valor: Number(mapa[bateu]), bateu: true, doEspelho: bateu.startsWith('espelho'),
      origem: bateu, rotulo: rotuloDoCandidato(bateu),
    };
  }
  // 2) Não bateu (ou nem foi conferida): mostra o valor DO ESPELHO, que é o que o
  // entregador viu no app e o que a nota dele deveria ter.
  const doEspelho = Object.keys(mapa).find((k) => k.startsWith('espelho') && typeof mapa[k] === 'number');
  if (doEspelho) {
    return {
      valor: Number(mapa[doEspelho]), bateu: false, doEspelho: true,
      origem: doEspelho, rotulo: rotuloDoCandidato(doEspelho),
    };
  }
  return null;
}

// ── CADASTRO DE ENTREGADOR: só as taxas de plataforma QUE EXISTEM (05/08/2026) ──
// O painel ficou com uma plataforma na memória que já tinha sido apagada no banco (a tela
// estava aberta desde antes). Ao cadastrar, o sistema tentou gravar o valor por pacote
// dela → o banco recusou pela chave estrangeira, e a mensagem crua apareceu pro Victor:
// "violates foreign key constraint driverpay_platform_rates_platform_id_fkey".
//
// Pior: o entregador já tinha sido gravado antes do erro, então cada nova tentativa criava
// outro. O Othon virou 3 cadastros.
//
// Aqui a peneira: só passa taxa de plataforma que ainda existe no banco AGORA.

export interface TaxaDeCadastro {
  platformId: string;
  rate: number;
}

export function taxasDePlataformasQueExistem(
  taxas: readonly TaxaDeCadastro[],
  plataformasNoBanco: readonly { id: string }[],
): { validas: TaxaDeCadastro[]; fantasmas: string[] } {
  const existe = new Set(plataformasNoBanco.map((p) => p.id));
  const validas: TaxaDeCadastro[] = [];
  const fantasmas: string[] = [];
  for (const t of taxas) {
    // Taxa zerada não é gravada (é o "usa o valor padrão da plataforma") — nem entra na conta.
    if (!(t.rate > 0)) continue;
    if (existe.has(t.platformId)) validas.push(t);
    else fantasmas.push(t.platformId);
  }
  return { validas, fantasmas };
}

// ── TRIAGEM DOS PRINTS RECEBIDOS (05/08/2026) ────────────────────────────────
// "já está conferida e validada mas não sai daqui" — o print do Meirivaldo ficava preso
// em "Precisam de você" mesmo com o selo verde "confere ✓" ao lado.
//
// CAUSA: a triagem olhava só o `checkStatus`. Ele foi lido quando a planilha ainda dizia
// 1401 (o print dizia 1402), ficou gravado 'divergente' — e ninguém apaga esse carimbo.
// A planilha depois foi corrigida pra 1402, o operador validou na mão, e mesmo assim o
// carimbo velho continuava mandando na tela. Uma vez divergente, divergente pra sempre.
//
// REGRA: **validação humana encerra o assunto.** Se uma pessoa abriu a foto e disse
// "confere", nenhum carimbo antigo pode segurar o print na fila de pendências. Só a
// RECUSA continua pedindo atenção, porque aí o entregador precisa mandar de novo.

/** Só o que a triagem precisa saber — `DeliveryProofRow` encaixa aqui por estrutura. */
export interface ProofParaTriagem {
  id: string;
  /** 'recebido' | 'validado' | 'rejeitado'. */
  status: string;
  /** 'ok' | 'divergente' | 'periodo_errado' | 'ilegivel' | 'pendente' | null. */
  checkStatus: string | null;
  /** Quem validou: id do usuário = PESSOA; null = o sistema sozinho. */
  validatedBy: string | null;
  /** Tem releitura agendada? Então está na fila, não é pendência do operador. */
  nextCheckAt: string | null;
}

/** Uma pessoa olhou a foto e aprovou (≠ aprovação automática, que grava null). */
export function validadoPorPessoa(p: ProofParaTriagem): boolean {
  return p.status === 'validado' && !!p.validatedBy;
}

export function proofPrecisaAtencao(
  p: ProofParaTriagem,
  repetidos: ReadonlySet<string> = new Set(),
): boolean {
  // Recusado sempre pede ação: o entregador tem que mandar outro print.
  if (p.status === 'rejeitado') return true;
  // 🎯 O conserto: gente > carimbo.
  if (validadoPorPessoa(p)) return false;
  if (p.checkStatus === 'divergente') return true;
  // Nem validado nem na fila = parado esperando alguém.
  if (p.status !== 'validado' && !p.nextCheckAt) return true;
  return repetidos.has(p.id);
}

// ── ORDEM E FILTRO COMBINADOS (05/08/2026, pedido do Victor) ─────────────────
// "quero as duas possibilidades": empilhar CRITÉRIOS DE ORDEM e marcar VÁRIOS VALORES
// no mesmo filtro. As duas coisas moram aqui porque a tela do painel e a visão de grupos
// usam a mesma mecânica — e porque regra que decide o que some da tela merece teste.

export type SortDir = 'asc' | 'desc';
export interface SortCriterion {
  key: string;
  dir: SortDir;
}

/**
 * Mesma mecânica de 3 cliques de sempre, agora empilhando:
 * 1º clique entra no FIM da pilha (maior→menor) · 2º inverte SEM sair do lugar · 3º remove.
 *
 * Inverter sem mudar de posição é o que faz a coisa ser previsível: se "Total a receber" é
 * o 2º critério, apertar de novo pra inverter não pode promovê-lo a 1º e reordenar a tela
 * inteira sem o Victor pedir.
 */
export function toggleSortCriteria(
  atual: readonly SortCriterion[],
  key: string,
): SortCriterion[] {
  const i = atual.findIndex((c) => c.key === key);
  if (i < 0) return [...atual, { key, dir: 'desc' }];
  if (atual[i].dir === 'desc') {
    const out = [...atual];
    out[i] = { key, dir: 'asc' };
    return out;
  }
  return atual.filter((c) => c.key !== key);
}

/**
 * Compara em cascata: o 1º critério manda; empatou, o 2º desempata; e assim por diante.
 * Devolve 0 se empatou em TODOS — quem chama aplica o desempate estável dele (índice
 * original ou nome), pra a lista nunca "tremer" entre renders.
 */
export function compararPorCriterios<T>(
  a: T,
  b: T,
  criterios: readonly SortCriterion[],
  metrica: (item: T, key: string) => number | string | null,
): number {
  for (const c of criterios) {
    const va = metrica(a, c.key);
    const vb = metrica(b, c.key);
    // `null` = "não se aplica" → vai SEMPRE pro fim, nos dois sentidos (05/08/2026).
    //
    // Relato do Victor: ordenando por nota validada, "está subindo pessoas sem notas
    // primeiro que pessoal com nota validada". Quem não tem nota a mandar (0 pacote na
    // quinzena) valia o mesmo que "tudo validado" e subia junto — e a lista respondia a
    // pergunta errada. Não é "pronto" nem "falta": é OUTRA COISA, e por isso não inverte
    // com a direção — invertendo, ele voltaria a atrapalhar, agora no topo do "quem falta".
    if (va === null || vb === null) {
      if (va === null && vb === null) continue; // empatou: quem desempata é o próximo critério
      return va === null ? 1 : -1;
    }
    const d =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb), 'pt-BR')
        : (va as number) - (vb as number);
    if (d !== 0) return c.dir === 'asc' ? d : -d;
  }
  return 0;
}

/** Marcar/desmarcar um valor num filtro de múltipla escolha. */
export function toggleValorDeFiltro(atual: readonly string[], valor: string): string[] {
  return atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor];
}

/**
 * PLATAFORMA — decisão do Victor (05/08): marcando SHOPEE e LOGGI aparece **só quem tem as
 * duas**; quem tem uma só some, e grupo que ficou sem ninguém some da tela junto.
 * Nada marcado = não filtra nada.
 */
export function temTodasAsPlataformas(row: DriverRowData, nomes: readonly string[]): boolean {
  if (nomes.length === 0) return true;
  return nomes.every((n) => platformPackages(row, n) > 0);
}

/** ROTA — mesma régua da plataforma: marcou duas, tem que rodar as duas. */
export function temTodasAsRotas(row: DriverRowData, rotas: readonly string[]): boolean {
  if (rotas.length === 0) return true;
  const minhas = new Set<string>([...(row.route ? [row.route] : []), ...row.routes.map((r) => r.route)]);
  return rotas.every((r) => minhas.has(r));
}

/**
 * GRUPO — aqui é "QUALQUER UM dos marcados", e NÃO "todos", porque um entregador está em
 * **um grupo só**: exigir dois daria lista vazia sempre. A tela diz isso escrito, pro
 * comportamento não ser adivinhação.
 */
export function estaEmAlgumGrupo(
  row: DriverRowData,
  grupos: readonly string[],
  rotuloSemGrupo: string,
): boolean {
  if (grupos.length === 0) return true;
  if (!row.groupName) return grupos.includes(rotuloSemGrupo);
  return grupos.includes(row.groupName);
}

// ── ESPELHO É SEMPRE DO GRUPO, SEMPRE PRO LÍDER (04/08/2026) ─────────────────
// Decisão do Victor: "o espelho nunca vai ser lançado por driver, sempre por grupo e
// sempre para líder do grupo".
//
// POR QUÊ existe esta função: a mesma regra precisa valer em DOIS lugares — no que a tela
// AVISA antes de publicar e no que a publicação FAZ. Quando eram dois códigos, a prévia
// mostrava o espelho do grupo e a publicação mandava um individual por pessoa. Uma função
// só = impossível divergirem de novo.
//
// Quem NÃO está em grupo continua recebendo o seu: não há líder pra quem mandar.

export interface GrupoAPublicar {
  groupName: string;
  groupId: string | null;
  /** Destinatário: o líder do CADASTRO, mesmo que ele não esteja entre os membros da lista. */
  leaderId: string;
  /** Quem entra nos números do PDF (só quem está no relatório). */
  membros: DriverRowData[];
}

export interface PlanoDePublicacao {
  grupos: GrupoAPublicar[];
  /** Recebem espelho individual — não estão em grupo nenhum. */
  avulsos: DriverRowData[];
  /** Grupos sem líder definido: NÃO são publicados, viram aviso na tela. */
  semLider: string[];
}

export function planejarPublicacao(
  rows: DriverRowData[],
  groups: ReadonlyArray<{ id: string; name: string; leader_driver_id: string | null }>,
): PlanoDePublicacao {
  const porGrupo = new Map<string, DriverRowData[]>();
  const avulsos: DriverRowData[] = [];
  for (const r of rows) {
    if (!r.groupName) {
      avulsos.push(r);
      continue;
    }
    const lista = porGrupo.get(r.groupName) ?? [];
    lista.push(r);
    porGrupo.set(r.groupName, lista);
  }

  const gruposOut: GrupoAPublicar[] = [];
  const semLider: string[] = [];
  for (const [groupName, membros] of porGrupo) {
    const g = groups.find((x) => x.name === groupName);
    if (!g?.leader_driver_id) {
      semLider.push(groupName);
      continue;
    }
    gruposOut.push({ groupName, groupId: g.id, leaderId: g.leader_driver_id, membros });
  }
  gruposOut.sort((a, b) => a.groupName.localeCompare(b.groupName, 'pt-BR'));
  semLider.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { grupos: gruposOut, avulsos, semLider };
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

/**
 * Identidade de um espelho publicado = o CONJUNTO de plataformas dele (2026-07-28).
 *
 * Nomes ORDENADOS e unidos por '+'; string vazia = espelho da quinzena inteira. Ordenar
 * é o que faz ["LOGGI","ANJUN"] e ["ANJUN","LOGGI"] serem o MESMO espelho — senão o
 * driver receberia duas cópias do mesmo pagamento só porque os chips foram clicados em
 * ordem diferente. Precisa bater com o backfill da migration 20260728140000.
 */
export function mirrorPlatformKey(filter: string[] | null | undefined): string {
  if (!filter || filter.length === 0) return '';
  return [...new Set(filter.map((s) => String(s ?? '').trim()).filter(Boolean))].sort().join('+');
}

/** A chave vira parte do nome do arquivo no bucket — só o que é seguro em path. */
export function sanitizeMirrorKeyForPath(key: string): string {
  return asciiSafe(key).replace(/[^A-Za-z0-9+]+/g, '-').replace(/^-+|-+$/g, '') || 'filtro';
}

/** Rótulo do espelho pro driver leigo: "SOMENTE LOGGI" / "Quinzena completa". */
export function mirrorPlatformLabel(filter: string[] | null | undefined): string {
  const key = mirrorPlatformKey(filter);
  if (!key) return 'Quinzena completa';
  return `SOMENTE ${key.split('+').join(' + ').toUpperCase()}`;
}

/** Remove acentos (coluna A do relatório simples pede nome do líder SEM acento). */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Texto 100% ASCII para os relatórios (decisão do Victor, 28/07): o arquivo é jogado
 * direto no banco, que não aceita acento nem símbolo. Além dos acentos, troca os
 * símbolos "bonitos" que o Excel gera (travessão, aspas curvas, bullet, nbsp) pelos
 * equivalentes simples, e derruba o que sobrar de fora da tabela ASCII.
 */
export function asciiSafe(s: string): string {
  return stripAccents(String(s ?? ''))
    .replace(/[\u2010-\u2015\u2212]/g, '-')                 // hifens/travessoes/menos unicode
    .replace(/[\u2018\u2019\u201B]/g, "'")                  // aspas simples curvas
    .replace(/[\u201C\u201D\u201F]/g, '"')                  // aspas duplas curvas
    .replace(/\u2026/g, '...')                              // reticencias
    .replace(/[\u00B7\u2022]/g, '-')                        // ponto medio / bullet
    .replace(/[\u00A0\u2007\u2009\u202F\u200B]/g, ' ')      // espacos nao-quebraveis
    .replace(/\u00BA/g, 'o').replace(/\u00AA/g, 'a')         // simbolos ordinais
    .replace(/\u20AC/g, 'EUR').replace(/\u00A9/g, '(c)').replace(/\u00AE/g, '(r)')
    .replace(/[^\x20-\x7E\n\r\t]/g, '');                    // o que sobrou de nao-ASCII cai fora
}

/** CNPJ pelo dígito verificador (Mod 11) — irmão do validateCPF de utils/validation. */
export function isValidCNPJ(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (base: string, pesoInicial: number): number => {
    let peso = pesoInicial;
    let soma = 0;
    for (const ch of base) {
      soma += Number(ch) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calc(digits.slice(0, 12), 5);
  const d2 = calc(digits.slice(0, 13), 6);
  return d1 === Number(digits[12]) && d2 === Number(digits[13]);
}

/**
 * Chave PIX como o banco quer (decisão do Victor, 28/07): CPF e CNPJ saem SÓ com os
 * números, sem ponto, traço ou barra.
 *
 * Só mexe quando o dígito verificador confirma que é mesmo CPF ou CNPJ. E-mail,
 * telefone e chave aleatória saem intocados de propósito — nelas o hífen faz parte
 * da chave, e limpar quebraria o pagamento. Celular com DDD também tem 11 dígitos:
 * é a validação do DV que impede confundir com CPF.
 */
export function sanitizePixKey(key: string | null | undefined): string {
  const original = String(key ?? '').trim();
  if (!original) return '';
  const digits = original.replace(/\D/g, '');
  if (digits.length === 11 && validateCPF(digits)) return digits;
  if (digits.length === 14 && isValidCNPJ(digits)) return digits;
  return original;
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
 * Opções dos relatórios (2026-07-27, decisões do Victor):
 *  - `allowedPlatformNames`: gera o relatório SÓ das plataformas escolhidas (colunas,
 *    TOTAL PACOTES e TOTAL A RECEBER contam só elas). Ausente/vazio = todas, igual sempre.
 *  - `includeDeductions=false`: vales/perdas NÃO são abatidos do total (pagamento parcial
 *    por plataforma — o abate sai no pagamento das demais). As colunas DESCONTO/VALE
 *    continuam mostrando o valor real, e o export marca "não abatido" no cabeçalho.
 */
export interface ReportBuildOptions {
  allowedPlatformNames?: ReadonlySet<string>;
  includeDeductions?: boolean;
  /**
   * Quanto abater de CADA driver (driverId -> R$), decidido pela regra de saldo
   * (`descontoSaldo.ts`, 07/08/2026). Presente = manda em cima do `includeDeductions`,
   * driver a driver: quem ja foi descontado vem com 0, quem deve vem com o que cabe.
   * Ausente = tudo-ou-nada pelo `includeDeductions`, como sempre foi.
   */
  deductionByDriver?: ReadonlyMap<string, number>;
}

/** Normaliza as opções: conjunto vazio = sem filtro (evita relatório vazio por engano). */
function normalizeReportOptions(opts: ReportBuildOptions): {
  allowed?: ReadonlySet<string>;
  includeDeductions: boolean;
  deductionByDriver?: ReadonlyMap<string, number>;
} {
  const allowed =
    opts.allowedPlatformNames && opts.allowedPlatformNames.size > 0 ? opts.allowedPlatformNames : undefined;
  const deductionByDriver =
    opts.deductionByDriver && opts.deductionByDriver.size > 0 ? opts.deductionByDriver : undefined;
  return { allowed, includeDeductions: opts.includeDeductions !== false, deductionByDriver };
}

/** A unidade tem movimento nas plataformas do escopo? (pacotes ou itens Zapex). */
function hasPackagesInScope(totals: RowTotals): boolean {
  return totals.totalPackages > 0 || totals.zapex !== 0;
}

/**
 * Filtros de conferência dos relatórios (04/08/2026): baixar só quem já está com o
 * ESPELHO CONFERIDO e/ou a NOTA VALIDADA. Desmarcados = arquivo idêntico ao de sempre.
 */
export interface ChecksFilterOptions {
  /** Só quem está com o botão "Espelho conferido" marcado no pagamento. */
  onlyEspelhoConferido?: boolean;
  /** Só quem está com a nota validada — mesma regra da coluna NF da lista. */
  onlyNfValidada?: boolean;
  /** Só quem mandou a nota DENTRO do prazo do espelho dele (04/08/2026). */
  onlyNfNoPrazo?: boolean;
}

export type ChecksFilterReason = 'espelho' | 'nota' | 'atraso' | 'ambos';

export interface ChecksFilterResult {
  kept: DriverRowData[];
  /** Quem saiu e por quê — o operador precisa ver ANTES de baixar. */
  removed: { paymentId: string; name: string; group: string | null; reason: ChecksFilterReason }[];
  /** Linhas de recebedor antes/depois: denuncia quando uma unidade INTEIRA some. */
  recipientsBefore: number;
  recipientsAfter: number;
}

/**
 * Aplica os filtros driver a driver — regra "PAGA O RESTO" (decisão do Victor, 04/08/2026):
 * num grupo de 10 em que 1 não está pronto, a linha do líder continua saindo com os 9; o
 * que falta entra no próximo pagamento. O grupo só some quando NINGUÉM dele passa.
 *
 * `nfCompleteByPayment` vem de fora justamente pra este módulo não ter que saber de onde a
 * NF é lida — o painel monta com a MESMA regra do filtro "NF ok (validada)" da lista.
 */
export function applyChecksFilter(
  rows: DriverRowData[],
  nfCompleteByPayment: ReadonlyMap<string, boolean>,
  leaderNameByGroup: ReadonlyMap<string, string>,
  opts: ChecksFilterOptions,
  /** paymentId -> mandou TODAS as notas dentro do prazo? (só usado com `onlyNfNoPrazo`) */
  nfNoPrazoByPayment?: ReadonlyMap<string, boolean>,
): ChecksFilterResult {
  const wantEspelho = opts.onlyEspelhoConferido === true;
  const wantNf = opts.onlyNfValidada === true;
  const wantPrazo = opts.onlyNfNoPrazo === true;
  const recipientsBefore = groupReportUnits(rows, leaderNameByGroup).length;

  if (!wantEspelho && !wantNf && !wantPrazo) {
    return { kept: rows, removed: [], recipientsBefore, recipientsAfter: recipientsBefore };
  }

  const kept: DriverRowData[] = [];
  const removed: ChecksFilterResult['removed'] = [];
  for (const row of rows) {
    const faltaEspelho = wantEspelho && !row.espelhoConferido;
    const faltaNf = wantNf && !(nfCompleteByPayment.get(row.paymentId) ?? false);
    // Sem informação de prazo o driver NÃO é cortado: espelho publicado antes da feature
    // não tem prazo, e cortar aí seria punir por horário que ninguém combinou.
    const atrasou = wantPrazo && (nfNoPrazoByPayment?.get(row.paymentId) ?? true) === false;
    if (!faltaEspelho && !faltaNf && !atrasou) {
      kept.push(row);
      continue;
    }
    const motivos = [faltaEspelho && 'espelho', faltaNf && 'nota', atrasou && 'atraso'].filter(Boolean);
    removed.push({
      paymentId: row.paymentId,
      name: row.name,
      group: row.groupName,
      reason: motivos.length > 1 ? 'ambos' : (motivos[0] as ChecksFilterReason),
    });
  }
  return {
    kept,
    removed,
    recipientsBefore,
    recipientsAfter: groupReportUnits(kept, leaderNameByGroup).length,
  };
}

/**
 * Relatório GERAL com o líder como recebedor, dividido POR ROTA (decisões do Victor):
 * cada unidade vira N linhas (1 por rota), colunas por plataforma. Desconto/vale/TOTAL A
 * RECEBER (net = já abatido) saem na 1ª linha da unidade (blank nas demais) pra o SUM do
 * rodapé fechar certo. `name` só na 1ª linha (bloco do recebedor). Membros não viram linha.
 *
 * Filtrado por plataforma: só as plataformas escolhidas viram coluna, rota sem pacote
 * nelas não vira linha e unidade sem nenhum pacote nelas SOME do relatório (linha zerada
 * não serve pra pagar — decisão do Victor).
 */
export function buildLeaderReportRows(
  rows: DriverRowData[],
  platforms: DriverPlatform[],
  leaderNameByGroup: ReadonlyMap<string, string>,
  opts: ReportBuildOptions = {},
): DriverReportRow[] {
  const { allowed, includeDeductions, deductionByDriver } = normalizeReportOptions(opts);
  const scopedPlatforms = allowed ? platforms.filter((pl) => allowed.has(pl.name)) : platforms;
  const out: DriverReportRow[] = [];
  for (const unit of groupReportUnits(rows, leaderNameByGroup)) {
    const recipient = unitRecipientInfo(unit);
    let discount = 0;
    let vale = 0;
    let net = 0;
    let unitHasPackages = false;
    const routeMap = new Map<string, Record<string, { packages: number; value: number }>>();
    const routeOrder: string[] = [];
    for (const row of unit.rows) {
      const t = computeRowTotals(row, allowed, includeDeductions, deductionByDriver?.get(row.driverId));
      discount += t.discounts;
      vale += t.vales;
      net += t.net;
      if (hasPackagesInScope(t)) unitHasPackages = true;
      for (const rl of row.routes) {
        const rname = (rl.route || '').trim() || '(sem rota)';
        let rec = routeMap.get(rname);
        if (!rec) {
          rec = {};
          routeMap.set(rname, rec);
          routeOrder.push(rname);
        }
        for (const pl of scopedPlatforms) {
          const pkgs = rl.packages[pl.name] ?? 0;
          if (pkgs === 0) continue;
          const rate = rl.rates[pl.name] ?? row.ratesByPlatform[pl.name] ?? pl.default_rate ?? 0;
          const cell = rec[pl.name] ?? (rec[pl.name] = { packages: 0, value: 0 });
          cell.packages += pkgs;
          cell.value += pkgs * rate;
        }
      }
    }
    // Filtrado: unidade sem pacote nas plataformas escolhidas sai fora.
    if (allowed && !unitHasPackages) continue;
    const routesWithPackages = routeOrder.filter((rname) =>
      Object.values(routeMap.get(rname) ?? {}).some((c) => c.packages > 0),
    );
    const routeNames = allowed
      ? routesWithPackages.length
        ? routesWithPackages
        : ['(sem rota)']
      : routeOrder.length
      ? routeOrder
      : ['(sem rota)'];
    routeNames.forEach((rname, i) => {
      const rec = routeMap.get(rname) ?? {};
      const platformsRec: Record<string, { packages: number; value: number }> = {};
      let routeGross = 0;
      for (const pl of scopedPlatforms) {
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

/** Publicação de espelho já registrada no período (o que o painel precisa saber dela). */
export interface MirrorPublicationInfo {
  driverId: string;
  scope: 'individual' | 'group' | 'selection';
  /** O espelho publicado ABATEU os vales/perdas do driver? */
  includeDeductions: boolean;
}

/** Driver que já teve vales/perdas abatidos — alimenta o aviso anti-desconto-duplo. */
export interface AlreadyDeductedDriver {
  driverId: string;
  name: string;
  amount: number;
}

/**
 * Quem, dentre `scopeRows`, JÁ teve os vales/perdas abatidos numa publicação deste período
 * (proteção contra descontar duas vezes — decisão do Victor, 2026-07-27). Espelho de GRUPO
 * é publicado no líder mas cobre todos os membros, então o grupo inteiro conta como abatido.
 * `allRows` (padrão: o próprio escopo) resolve a composição dos grupos. Puro/testável.
 */
export function alreadyDeductedDrivers(
  scopeRows: DriverRowData[],
  publications: readonly MirrorPublicationInfo[],
  allRows: DriverRowData[] = scopeRows,
): AlreadyDeductedDriver[] {
  const groupOfDriver = new Map<string, string | null>();
  const membersOfGroup = new Map<string, string[]>();
  for (const r of allRows) {
    groupOfDriver.set(r.driverId, r.groupName);
    if (!r.groupName) continue;
    const arr = membersOfGroup.get(r.groupName);
    if (arr) arr.push(r.driverId);
    else membersOfGroup.set(r.groupName, [r.driverId]);
  }

  const covered = new Set<string>();
  for (const pub of publications) {
    if (!pub.includeDeductions) continue;
    covered.add(pub.driverId);
    if (pub.scope !== 'group') continue;
    const groupName = groupOfDriver.get(pub.driverId);
    if (groupName) for (const id of membersOfGroup.get(groupName) ?? []) covered.add(id);
  }

  const out: AlreadyDeductedDriver[] = [];
  for (const r of scopeRows) {
    if (!covered.has(r.driverId)) continue;
    const amount = deductionsOf(r);
    if (amount > 0) out.push({ driverId: r.driverId, name: r.name, amount });
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
 *
 * Mesmas opções do relatório geral: filtrado por plataforma, o total conta só as escolhidas
 * e quem não tem pacote nelas some da lista; `includeDeductions=false` não abate vales/perdas.
 */
export function buildSimpleReportRows(
  rows: DriverRowData[],
  leaderNameByGroup: ReadonlyMap<string, string>,
  opts: ReportBuildOptions = {},
): SimpleReportRow[] {
  const { allowed, includeDeductions, deductionByDriver } = normalizeReportOptions(opts);
  const out: SimpleReportRow[] = [];
  for (const unit of groupReportUnits(rows, leaderNameByGroup)) {
    const recipient = unitRecipientInfo(unit);
    let total = 0;
    let unitHasPackages = false;
    for (const row of unit.rows) {
      const t = computeRowTotals(row, allowed, includeDeductions, deductionByDriver?.get(row.driverId));
      total += t.net;
      if (hasPackagesInScope(t)) unitHasPackages = true;
    }
    if (allowed && !unitHasPackages) continue;
    out.push({ name: stripAccents(recipient.name), total, pix: recipient.pix });
  }
  return out;
}
