/**
 * FÉRIAS POR AVOS — o direito adquirido (leva 3 do que ficou da folha, 19/09/2026).
 *
 * As férias que a pessoa JÁ GANHOU, e até quando ela tem que tirar. Não confundir com o
 * `folhaCalc`, que paga as férias já lançadas: ali é o dinheiro do mês, aqui é o direito.
 *
 * ## As decisões do Victor (19/09/2026)
 *
 * 1. **Sem data de admissão, o sistema NÃO inventa.** Devolve `semAdmissao` e quem
 *    desenha manda preencher a ficha. Férias é direito e é dinheiro: um chute aqui vira
 *    pagamento errado. (Hoje 18 das 21 fichas de carteira assinada estão sem a data, e
 *    o "primeiro ponto" não serve de atalho — 11 pessoas têm o primeiro ponto no mesmo
 *    06/11/2025, que é o dia em que o sistema começou, não a admissão delas.)
 * 2. **Os DOIS números aparecem:** os 30 dias cheios e os dias cortados pela tabela de
 *    faltas do art. 130. A decisão de qual usar é do Victor, caso a caso.
 *
 * ## Como a CLT conta
 *
 * · **Período aquisitivo:** 12 meses a partir da admissão. Completou, ganhou 30 dias.
 *   Depois começa outro, e assim por diante.
 * · **Período concessivo:** os 12 meses SEGUINTES são o prazo para tirar. Passou disso,
 *   as férias viram "vencidas" e a lei manda pagar em dobro — é o alerta mais caro
 *   desta tela, e a razão de ela existir.
 * · **Avos** (art. 146): mês com 15 dias ou mais de trabalho conta inteiro. É o mesmo
 *   corte do 13º, só que contado no relógio da ADMISSÃO (10/05 a 09/06), não no
 *   calendário — o período aquisitivo não começa em janeiro.
 * · **Tabela de faltas** (art. 130), dentro de cada período aquisitivo:
 *   até 5 faltas → 30 dias · 6 a 14 → 24 · 15 a 23 → 18 · 24 a 32 → 12 · mais de 32 → 0.
 *
 * ## Uma simplificação honesta, registrada
 *
 * As férias lançadas (`employee_vacations`) **não dizem a qual período aquisitivo
 * pertencem** — a tabela guarda só as datas. Então o abatimento é do total: soma tudo
 * que a pessoa tem direito, soma tudo que ela já tirou, e a diferença é o saldo. Dá o
 * mesmo número no fim; o que ela não consegue é dizer "estas férias mataram o período
 * de 2024". Se um dia isso importar, a tabela ganha uma coluna — não é uma conta nova.
 */

/** O corte do art. 130: quantos dias de férias sobram depois das faltas do período. */
export function diasPelaTabelaDeFaltas(faltasInjustificadas: number): number {
  const faltas = Math.max(0, Math.trunc(Number(faltasInjustificadas) || 0));
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

export interface PeriodoAquisitivo {
  inicio: string;
  /** Último dia do período (o dia anterior ao mesmo dia, 12 meses depois). */
  fim: string;
  completo: boolean;
  /** Meses de 15 dias ou mais dentro do período. 12 num período completo sem falta. */
  avos: number;
  faltasInjustificadas: number;
  /** 30 dias por período completo; proporcional aos avos no que está em curso. */
  diasCheios: number;
  /** O mesmo, cortado pela tabela do art. 130. */
  diasComFaltas: number;
  /** Até quando tem que tirar (fim + 12 meses). `null` enquanto o período não fecha. */
  limiteParaGozar: string | null;
}

export interface FeriasDaPessoa {
  /** `true` quando a ficha não tem data de admissão — e aí não há nada a calcular. */
  semAdmissao: boolean;
  periodos: PeriodoAquisitivo[];
  /**
   * DIREITO DE PERÍODO FECHADO — o que a pessoa pode tirar de férias hoje.
   *
   * ⚠️ NÃO inclui o período em curso, e a separação não é preciosismo: na primeira
   * versão os dois estavam somados, e a tela teria deixado agendar 40 dias para quem
   * só pode tirar 30. O proporcional em formação só vira direito de gozo quando o
   * período fecha — antes disso ele só aparece na rescisão.
   */
  diasCheios: number;
  diasComFaltas: number;
  /** O proporcional do período AINDA EM CURSO. Só conta em rescisão. */
  proporcionalCheio: number;
  proporcionalComFaltas: number;
  diasGozados: number;
  /** Dias que a pessoa pode tirar agora (direito fechado − o que já tirou). */
  saldoCheio: number;
  saldoComFaltas: number;
  /** O limite do período mais antigo que ainda não foi coberto pelas férias tiradas. */
  vencimento: string | null;
  /** Passou do limite: a lei manda pagar em dobro. */
  vencida: boolean;
  /** Vence nos próximos 90 dias — o aviso que dá tempo de agir. */
  perto: boolean;
}

export interface EntradaDasFerias {
  admissao?: string | null;
  /** Hoje, em 'YYYY-MM-DD'. Vem de fora para o cálculo ser testável. */
  hoje: string;
  /** Datas das faltas SEM atestado (todas; são filtradas por período aqui). */
  faltasInjustificadas?: readonly string[];
  /** Férias já lançadas para a pessoa. */
  feriasGozadas?: readonly { start_date: string; end_date: string }[];
  /** Desligamento: o direito para nele. */
  desligamento?: string | null;
}

/** Último dia do mês (ano/mês de 1 a 12). */
const ultimoDiaDoMes = (ano: number, mes: number): number => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

const iso = (ano: number, mes: number, dia: number): string =>
  `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/**
 * Soma meses a uma data, grudando no último dia quando o dia não existe no destino.
 *
 * Admitida em 31/01: o "mês" seguinte acaba em 28/02, não escorrega para 03/03 como o
 * `Date` faria sozinho. Sem isso, quem é admitido dia 29, 30 ou 31 ganharia um período
 * aquisitivo de tamanho errado.
 */
export function somaMeses(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const total = (m - 1) + meses;
  const ano = a + Math.floor(total / 12);
  const mes = (total % 12 + 12) % 12 + 1;
  return iso(ano, mes, Math.min(d, ultimoDiaDoMes(ano, mes)));
}

/** O dia anterior a uma data. */
function diaAnterior(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

/** Dias corridos entre duas datas, inclusive nas duas pontas. */
function diasEntre(de: string, ate: string): number {
  if (de > ate) return 0;
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Os "meses" do período aquisitivo que contam como avo.
 *
 * Cada mês vai do dia da admissão ao dia anterior no mês seguinte (10/05 a 09/06) — é o
 * relógio da admissão, e não o do calendário. Conta o mês quando sobraram 15 dias ou
 * mais depois das faltas sem atestado.
 *
 * O último mês do período em curso só conta se ele já tiver ACABADO: um mês pela metade
 * ainda pode virar falta amanhã, e antecipar o avo mostraria um direito que ainda não
 * existe.
 */
function avosDoPeriodo(
  inicio: string,
  fim: string,
  hoje: string,
  faltas: readonly string[],
  desligamento?: string | null,
): { avos: number; faltasNoPeriodo: number } {
  const limite = desligamento && desligamento < hoje ? desligamento : hoje;
  let avos = 0;
  let faltasNoPeriodo = 0;

  for (let i = 0; i < 12; i++) {
    const de = somaMeses(inicio, i);
    if (de > fim) break;
    const ate = diaAnterior(somaMeses(inicio, i + 1));
    const fechaEm = ate > fim ? fim : ate;
    // Mês que ainda não terminou não vira avo.
    if (fechaEm > limite) break;

    const noMes = faltas.filter(f => f >= de && f <= fechaEm).length;
    faltasNoPeriodo += noMes;
    if (diasEntre(de, fechaEm) - noMes >= 15) avos++;
  }

  return { avos, faltasNoPeriodo };
}

/** Quantos dias de férias a pessoa já tirou (dias distintos, sem contar duas vezes). */
export function diasDeFeriasGozados(
  ferias: readonly { start_date: string; end_date: string }[],
): number {
  const dias = new Set<string>();
  for (const f of ferias) {
    if (!f.start_date || !f.end_date || f.start_date > f.end_date) continue;
    for (
      let d = new Date(`${f.start_date}T00:00:00Z`);
      d.toISOString().slice(0, 10) <= f.end_date;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      dias.add(d.toISOString().slice(0, 10));
    }
  }
  return dias.size;
}

const SEM_ADMISSAO: FeriasDaPessoa = {
  semAdmissao: true,
  periodos: [],
  diasCheios: 0,
  diasComFaltas: 0,
  proporcionalCheio: 0,
  proporcionalComFaltas: 0,
  diasGozados: 0,
  saldoCheio: 0,
  saldoComFaltas: 0,
  vencimento: null,
  vencida: false,
  perto: false,
};

export function feriasPorAvos({
  admissao,
  hoje,
  faltasInjustificadas,
  feriasGozadas,
  desligamento,
}: EntradaDasFerias): FeriasDaPessoa {
  const adm = (admissao ?? '').trim();
  if (!adm || !/^\d{4}-\d{2}-\d{2}$/.test(adm)) return SEM_ADMISSAO;
  if (adm > hoje) return { ...SEM_ADMISSAO, semAdmissao: false };

  const faltas = Array.from(new Set(faltasInjustificadas ?? [])).sort();
  const fimDoVinculo = desligamento && desligamento < hoje ? desligamento : hoje;

  const periodos: PeriodoAquisitivo[] = [];
  let inicio = adm;

  // Até 60 períodos: uma trava contra laço infinito, e 60 anos de casa é mais do que
  // qualquer vínculo real.
  for (let i = 0; i < 60; i++) {
    if (inicio > fimDoVinculo) break;
    const fim = diaAnterior(somaMeses(inicio, 12));
    const completo = fim <= fimDoVinculo;

    const { avos, faltasNoPeriodo } = avosDoPeriodo(inicio, fim, hoje, faltas, desligamento);
    const daTabela = diasPelaTabelaDeFaltas(faltasNoPeriodo);

    periodos.push({
      inicio,
      fim,
      completo,
      avos,
      faltasInjustificadas: faltasNoPeriodo,
      // Período fechado dá os 30; o que está em curso dá o proporcional aos avos.
      diasCheios: completo ? 30 : Math.trunc((avos * 30) / 12),
      diasComFaltas: completo ? daTabela : Math.trunc((avos * daTabela) / 12),
      limiteParaGozar: completo ? somaMeses(fim, 12) : null,
    });

    if (!completo) break;
    inicio = somaMeses(inicio, 12);
  }

  const fechados = periodos.filter(p => p.completo);
  const emCurso = periodos.find(p => !p.completo);

  const diasCheios = fechados.reduce((s, p) => s + p.diasCheios, 0);
  const diasComFaltas = fechados.reduce((s, p) => s + p.diasComFaltas, 0);
  const diasGozados = diasDeFeriasGozados(feriasGozadas ?? []);

  /**
   * O vencimento é o limite do período mais antigo que as férias já tiradas ainda não
   * cobriram — abatendo do mais velho para o mais novo, que é a ordem em que a lei
   * manda gozar.
   */
  let sobrandoParaAbater = diasGozados;
  let vencimento: string | null = null;
  for (const p of periodos) {
    if (!p.completo || p.limiteParaGozar === null) continue;
    if (sobrandoParaAbater >= p.diasCheios) {
      sobrandoParaAbater -= p.diasCheios;
      continue;
    }
    vencimento = p.limiteParaGozar;
    break;
  }

  const emNoventaDias = somaMeses(hoje, 3);

  return {
    semAdmissao: false,
    periodos,
    diasCheios,
    diasComFaltas,
    proporcionalCheio: emCurso?.diasCheios ?? 0,
    proporcionalComFaltas: emCurso?.diasComFaltas ?? 0,
    diasGozados,
    saldoCheio: Math.max(0, diasCheios - diasGozados),
    saldoComFaltas: Math.max(0, diasComFaltas - diasGozados),
    vencimento,
    vencida: vencimento !== null && vencimento < hoje,
    perto: vencimento !== null && vencimento >= hoje && vencimento <= emNoventaDias,
  };
}
