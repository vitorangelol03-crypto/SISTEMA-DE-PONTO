/**
 * HISTÓRICO DE PAGAMENTOS EM GAVETAS — a conta por trás da tela (Etapa 2 do
 * `PLANO_FINANCEIRO_2026-09.md`, desenhado com o Victor em 10/09/2026).
 *
 * Uma gaveta por MÊS; dentro dela, as SEMANAS. O mês fechado já mostra tudo que
 * importa — *"sem precisar abrir as gavetas"* (palavras dele): valor, quantos
 * foram pagos, a divisão diarista × carteira assinada, quantos descontados e
 * quantos erros, estes últimos também separados por vínculo.
 *
 * Funções PURAS de propósito: a tela só desenha o que sai daqui, e o teste
 * prova a conta sem precisar de navegador.
 */

/**
 * Vínculo do pagamento — os valores REAIS do banco (`employees.employment_type`).
 *
 * ⚠️ A ficha tem DOIS campos de vínculo e eles discordam em 21 pessoas (achado em
 * 11/09/2026): `employment_type` ('Diarista' / 'Carteira Assinada') é o OPERACIONAL —
 * é por ele que o sistema filtra — e `contract_type` ('CLT' / 'Diarista') é só
 * cadastro. Aqui e no carimbo do pagamento vale o operacional.
 */
export type Vinculo = 'Diarista' | 'Carteira Assinada';

/** Um pagamento já com o vínculo do dia em que foi feito. */
export interface PagamentoDoHistorico {
  id: string;
  employeeId: string;
  /** Dia do pagamento (ISO, `YYYY-MM-DD`). */
  date: string;
  /**
   * O valor. **`null` = MASCARADO** (quem não pode ver dinheiro), não zero.
   *
   * A distinção importa: a RPC devolve `total = NULL` pra quem não tem
   * `financial.viewPayments` + `c6payment.viewValues`, e tratar isso como 0
   * fazia a gaveta dizer **"0 pagos (0 diaristas · 0 CLT)"** — número errado, em
   * vez de valor escondido. A pessoa existe e foi paga; o que ela não pode é
   * ver quanto. (Achado em revisão, 11/09/2026.)
   */
  total: number | null;
  /**
   * O vínculo CARIMBADO (`payments.employment_type_snapshot`), não o da ficha.
   *
   * Regra do Victor (10/09/2026): quem começa diarista e vira carteira assinada
   * mantém o histórico — os pagamentos antigos continuam contando como diarista.
   * Ler da ficha faria o passado se reescrever sozinho a cada mudança de vínculo.
   */
  vinculo: Vinculo;
}

/** Um erro lançado a alguém, já com o vínculo e a equipe. */
export interface ErroDoHistorico {
  id: string;
  employeeId: string;
  nome: string;
  /** A equipe/função da pessoa (`employees.function_role`), ex.: "Triagem - Shopee". */
  equipe: string;
  vinculo: Vinculo;
  /** Dia do erro (ISO). */
  date: string;
  /** Quantos pacotes. */
  quantidade: number;
  /** Quanto foi descontado em R$ (0 = erro só de quantidade; `null` = mascarado). */
  valor: number | null;
  /** O que aconteceu, em texto ("3 fora de rota e 2 não bipados…"). */
  descricao: string;
}

/** Um período de pagamento cadastrado (as semanas que já existem desde julho). */
export interface PeriodoDePagamento {
  id: string;
  label: string | null;
  startDate: string;
  endDate: string;
  /**
   * O dia em que foi pago — é ele que decide de qual MÊS é a semana.
   *
   * Decisão do Victor (10/09/2026): *"ela cai no mês que foi paga"*. A semana
   * 29/09–05/10, paga em outubro, aparece na gaveta de OUTUBRO. Nem o início
   * nem o fim da semana mandam: manda o pagamento, que é como o caixa fecha.
   */
  paymentDate: string;
  status: string | null;
}

/** Os números que aparecem na linha fechada, sem abrir nada. */
export interface ResumoDoPeriodo {
  valor: number;
  /** Quantas PESSOAS foram pagas (não quantos pagamentos). */
  pagos: number;
  pagosDiarista: number;
  pagosClt: number;
  descontados: number;
  erros: number;
  errosDiarista: number;
  errosClt: number;
}

export interface SemanaDoHistorico extends ResumoDoPeriodo {
  periodoId: string;
  /** "Semana 1", "Semana 2"… — a posição dela DENTRO da gaveta do mês. */
  numero: string;
  /** "01 – 07/09" */
  intervalo: string;
  label: string;
  startDate: string;
  endDate: string;
  paymentDate: string;
  status: string | null;
  /** Os erros daquela semana, pro balão e pro popup. */
  listaErros: ErroDoHistorico[];
}

export interface MesDoHistorico extends ResumoDoPeriodo {
  /** `YYYY-MM` — a chave da gaveta. */
  chave: string;
  /** "SETEMBRO" */
  nome: string;
  /** "2026" */
  ano: string;
  /** É o mês corrente? (a gaveta que abre sozinha) */
  emAndamento: boolean;
  semanas: SemanaDoHistorico[];
  /** Todos os erros do mês — a soma das semanas, pro popup do mês. */
  listaErros: ErroDoHistorico[];
  /** O bloco do carteira assinada, que é mensal e não tem semana. */
  carteiraAssinada: { valor: number; pessoas: number; descontados: number; erros: number };
}

const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

const round2 = (v: number) => Math.round(v * 100) / 100;

/** `YYYY-MM-DD` → `YYYY-MM`, sem passar por Date (fuso não muda a gaveta). */
export function mesDaData(iso: string): string {
  return (iso || '').slice(0, 7);
}

/** `2026-09-01` → `01/09` */
function diaMes(iso: string): string {
  const [, m, d] = (iso || '').split('-');
  return d && m ? `${d}/${m}` : '';
}

/**
 * O intervalo como o Victor lê: "01 – 07/09" quando fecha no mesmo mês,
 * "28/07 – 03/08" quando atravessa.
 */
export function intervaloDaSemana(inicio: string, fim: string): string {
  const [, mi] = (inicio || '').split('-');
  const [, mf] = (fim || '').split('-');
  if (mi && mi === mf) {
    const [, , di] = inicio.split('-');
    return `${di} – ${diaMes(fim)}`;
  }
  return `${diaMes(inicio)} – ${diaMes(fim)}`;
}

/**
 * Monta o "de quem é este dia": o PRIMEIRO período da ordem global que o cobre.
 * Ordem global = começa antes ganha; empate, termina antes; empate, id — estável,
 * então o mesmo dia cai sempre na mesma semana.
 */
function fazerDonoDoDia(periodos: readonly PeriodoDePagamento[]): (data: string) => string | null {
  const ordem = [...periodos].sort(
    (a, b) =>
      (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0)
      || (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return (data: string) => ordem.find((p) => dentro(data, p.startDate, p.endDate))?.id ?? null;
}

/**
 * O que NÃO cabe em gaveta nenhuma — e por isso precisa aparecer, não sumir.
 *
 * Duas maneiras de um lançamento ficar órfão:
 *  1. o dia não está em NENHUM período cadastrado (buraco entre as semanas);
 *  2. está num período, mas esse período não tem data de pagamento — e é a data
 *     de pagamento que decide de qual mês a semana é.
 *
 * Antes esses lançamentos simplesmente evaporavam: dinheiro real fora de toda
 * soma, sem uma linha na tela dizendo isso. Em produção são 15 erros. A tela usa
 * este retorno pra avisar; corrigir é cadastrar o período que falta.
 * (Achado em revisão, 11/09/2026.)
 */
export function foraDasGavetas(
  periodos: readonly PeriodoDePagamento[],
  pagamentos: readonly PagamentoDoHistorico[],
  erros: readonly ErroDoHistorico[],
): { pagamentos: PagamentoDoHistorico[]; erros: ErroDoHistorico[] } {
  const donoDoDia = fazerDonoDoDia(periodos);
  const comMes = new Set(periodos.filter((p) => mesDaData(p.paymentDate)).map((p) => p.id));
  const orfao = (data: string): boolean => {
    const dono = donoDoDia(data);
    return dono === null || !comMes.has(dono);
  };
  return {
    pagamentos: pagamentos.filter((p) => contou(p) && orfao(p.date)),
    erros: erros.filter((e) => orfao(e.date)),
  };
}

/**
 * O pagamento conta como "pago"? Positivo, ou MASCARADO (a pessoa foi paga, só
 * não podemos mostrar quanto). Zero de verdade não conta.
 */
function contou(p: PagamentoDoHistorico): boolean {
  return p.total === null || p.total > 0;
}

/** O pagamento cai dentro deste período? (datas ISO comparam como texto) */
function dentro(data: string, inicio: string, fim: string): boolean {
  return data >= inicio && data <= fim;
}

/**
 * Monta as gavetas.
 *
 * `mesCorrente` (`YYYY-MM`) é quem ganha o selo "EM ANDAMENTO" e abre sozinha —
 * vem de fora porque `new Date()` dentro de função pura estraga o teste.
 */
export function montarHistorico(
  periodos: readonly PeriodoDePagamento[],
  pagamentos: readonly PagamentoDoHistorico[],
  erros: readonly ErroDoHistorico[],
  mesCorrente: string,
): MesDoHistorico[] {
  // ══════════════════════════════════════════════════════════════════════════
  // CADA PAGAMENTO PERTENCE A UMA SEMANA SÓ.
  //
  // Em produção há semanas SOBREPOSTAS — duas séries que convivem desde que o
  // dia de início mudou. Deixar um pagamento cair em todas as semanas que o
  // contêm produzia duas mentiras, as duas pegas em revisão (11/09/2026):
  //
  //  1. abrir a gaveta de setembro somava R$ 16.194 enquanto a linha fechada
  //     dizia R$ 8.472 — a regra do Victor é que o mês é a SOMA das semanas;
  //  2. pior: o dia 27/07 está na semana 21–27/07 (paga em julho) E na
  //     27/07–02/08 (paga em agosto), então R$ 1.748 apareciam em DUAS gavetas,
  //     inflando o total do ano.
  //
  // Regra: a semana que COMEÇA ANTES fica com o dia (empate: a que termina
  // antes, depois o id — ordem estável). Assim a soma das semanas é o mês, e a
  // soma dos meses é o caixa, sem nada em dobro.
  // ══════════════════════════════════════════════════════════════════════════
  const donoDoDia = fazerDonoDoDia(periodos);
  const donoPagamento = new Map(pagamentos.map((p) => [p.id, donoDoDia(p.date)]));
  const donoErro = new Map(erros.map((e) => [e.id, donoDoDia(e.date)]));

  // ── As semanas vão pra gaveta do mês em que FORAM PAGAS ──────────────────
  const porMes = new Map<string, PeriodoDePagamento[]>();
  for (const p of periodos) {
    const chave = mesDaData(p.paymentDate);
    if (!chave) continue;
    const lista = porMes.get(chave) ?? [];
    lista.push(p);
    porMes.set(chave, lista);
  }

  // ⚠️ O bloco do carteira assinada é um RECORTE do mês, não uma parcela à parte.
  //
  // Os pagamentos de CLT estão DENTRO das semanas — decisão do Victor
  // (10/09/2026): *"a semana tem os dois, tira o 'Diaristas' do título"*. O bloco
  // roxo só repete, separado, a fatia deles. Somar bloco + semanas conta duas
  // vezes: em produção são R$ 3.879 que apareciam nos dois lugares como se
  // fossem dinheiros diferentes. A tela diz isso em letra fina.
  // (Achado em revisão, 11/09/2026.)
  const pagamentosClt = pagamentos.filter((p) => p.vinculo === 'Carteira Assinada');

  const meses: MesDoHistorico[] = [];

  for (const [chave, doMes] of porMes) {
    const ordenados = [...doMes].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

    const semanas: SemanaDoHistorico[] = ordenados.map((per, i) => {
      // `donoPagamento`/`donoErro`: cada lançamento cai em UMA semana só (ver o
      // bloco no topo). Sem isso, semanas sobrepostas contavam o mesmo dinheiro
      // duas vezes e a gaveta aberta não fechava com a fechada.
      const pgs = pagamentos.filter((p) => donoPagamento.get(p.id) === per.id && contou(p));
      const errs = erros.filter((e) => donoErro.get(e.id) === per.id);
      return {
        periodoId: per.id,
        numero: `Semana ${i + 1}`,
        intervalo: intervaloDaSemana(per.startDate, per.endDate),
        label: per.label ?? intervaloDaSemana(per.startDate, per.endDate),
        startDate: per.startDate,
        endDate: per.endDate,
        paymentDate: per.paymentDate,
        status: per.status,
        listaErros: errs,
        ...resumir(pgs, errs),
      };
    });

    // O mês é LITERALMENTE a soma das semanas dele — a gaveta fechada não pode
    // dizer um número e a aberta outro. Como cada lançamento já tem um dono
    // único, somar as listas das semanas é exato, sem dedupe nenhum.
    const idsDoMes = new Set(ordenados.map((p) => p.id));
    const pgsDoMes = pagamentos.filter((p) => {
      const dono = donoPagamento.get(p.id);
      return contou(p) && dono !== null && dono !== undefined && idsDoMes.has(dono);
    });
    const errosDoMes = semanas.flatMap((s) => s.listaErros);

    const cltDoMes = pagamentosClt.filter((p) => {
      const dono = donoPagamento.get(p.id);
      return contou(p) && dono !== null && dono !== undefined && idsDoMes.has(dono);
    });
    const errosCltMes = errosDoMes.filter((e) => e.vinculo === 'Carteira Assinada');

    const [ano, mes] = chave.split('-');
    meses.push({
      chave,
      nome: MESES[Number(mes) - 1] ?? '',
      ano,
      emAndamento: chave === mesCorrente,
      semanas,
      listaErros: errosDoMes,
      carteiraAssinada: {
        valor: round2(cltDoMes.reduce((s, p) => s + (p.total ?? 0), 0)),
        pessoas: new Set(cltDoMes.map((p) => p.employeeId)).size,
        descontados: new Set(
          errosCltMes.filter((e) => e.valor === null || e.valor > 0).map((e) => e.employeeId),
        ).size,
        erros: errosCltMes.length,
      },
      ...resumir(pgsDoMes, errosDoMes),
    });
  }

  // Mais recente em cima: é o que se confere.
  return meses.sort((a, b) => (a.chave > b.chave ? -1 : 1));
}

/** Os números de um conjunto de pagamentos e erros. */
function resumir(
  pagamentos: readonly PagamentoDoHistorico[],
  erros: readonly ErroDoHistorico[],
): ResumoDoPeriodo {
  // Por PESSOA, não por lançamento: quem recebeu 5 diárias na semana é UM pago.
  const pessoas = new Set(pagamentos.map((p) => p.employeeId));
  const pessoasD = new Set(pagamentos.filter((p) => p.vinculo === 'Diarista').map((p) => p.employeeId));
  const pessoasC = new Set(pagamentos.filter((p) => p.vinculo === 'Carteira Assinada').map((p) => p.employeeId));
  // "Descontado" é quem teve valor tirado — erro só de quantidade não desconta.
  // Mascarado (`null`) conta como descontado: o desconto existe, o valor é que
  // está escondido. Zero não conta — erro só de quantidade não desconta nada.
  const descontados = new Set(
    erros.filter((e) => e.valor === null || e.valor > 0).map((e) => e.employeeId),
  );
  return {
    valor: round2(pagamentos.reduce((s, p) => s + (p.total ?? 0), 0)),
    pagos: pessoas.size,
    pagosDiarista: pessoasD.size,
    pagosClt: pessoasC.size,
    descontados: descontados.size,
    erros: erros.length,
    errosDiarista: erros.filter((e) => e.vinculo === 'Diarista').length,
    errosClt: erros.filter((e) => e.vinculo === 'Carteira Assinada').length,
  };
}

/** "4 erros (3 D · 1 C)" — o texto da linha fechada. Vazio quando não há erro. */
export function textoErros(total: number, diarista: number, clt: number): string {
  if (total === 0) return 'sem erro';
  const plural = total === 1 ? '1 erro' : `${total} erros`;
  return `${plural} (${diarista} D · ${clt} C)`;
}
