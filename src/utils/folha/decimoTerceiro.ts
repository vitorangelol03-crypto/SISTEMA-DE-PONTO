/**
 * 13º SALÁRIO (gratificação natalina) — leva 2 do que ficou da folha, 19/09/2026.
 *
 * ⚠️ LEIA ANTES DE CONFIAR NUM NÚMERO: **este cálculo não tem gabarito.** Os 12 recibos
 * reais da contabilidade Arruda que provaram o salário, o FGTS e o INSS são de JULHO —
 * nenhum deles tem 13º. Aqui está a regra da CLT como ela é escrita, e o papel sai com
 * a mesma tarja de "valores em conferência" que o IRRF, pelo mesmo motivo: o sistema não
 * é fonte oficial antes de rodar em paralelo com o contador.
 *
 * ## As três decisões do Victor (19/09/2026)
 *
 * 1. **As duas opções de parcela**, escolhidas na hora: 1ª + 2ª, ou parcela única.
 * 2. **A base é salário + média do adicional noturno** do ano (o correto pela lei), e
 *    não só o salário.
 * 3. **Avos pela regra dos 15 dias**: só conta o mês em que a pessoa trabalhou 15 dias
 *    ou mais.
 *
 * ## O que a lei manda, e que este módulo implementa
 *
 * · **Avos:** 1/12 por mês trabalhado. O mês do meio (admissão) entra se sobraram 15
 *   dias ou mais; faltas SEM atestado derrubam o mês se o que sobrou ficar abaixo de 15.
 * · **1ª parcela (adiantamento):** metade do 13º bruto, **sem nenhum desconto**. Não é
 *   esquecimento: a lei manda descontar tudo na segunda.
 * · **2ª parcela:** INSS e IRRF incidem sobre o **13º INTEIRO**, não sobre a parcela —
 *   e saem todos aqui, junto com o abatimento do que a 1ª já pagou.
 * · **IRRF do 13º é tributação EXCLUSIVA na fonte:** não se mistura com o salário do
 *   mês, é uma conta à parte com a mesma tabela. Por isso este módulo não recebe nem
 *   devolve nada do salário de dezembro.
 * · **FGTS incide sobre as duas parcelas**, e é custo da empresa: não abate o líquido.
 *
 * ## Uma escolha de engenharia que muda centavo
 *
 * Trunca em centavos, como o FGTS e o INSS — é o que o papel da contabilidade faz e o
 * que provou bater em 12 de 12 recibos (ver `folhaCalc`). Arredondar aqui criaria uma
 * diferença sistemática contra o mesmo gabarito.
 */

import type { LinhaDaFolha } from './folhaCalc';
import { truncaCentavos } from './dinheiro';
import {
  calcularInss,
  calcularIrrf,
  faixaAplicada,
  type TabelaDoInss,
  type TabelaDoIrrf,
} from './impostos';

/** Qual pedaço do 13º este papel paga. */
export type ParcelaDoDecimo = 'primeira' | 'segunda' | 'unica';

export interface EntradaDoDecimo {
  /** Salário do contrato, cheio. */
  salarioMensal: number;
  /**
   * Média mensal do adicional noturno no ano, em R$ (decisão 2 do Victor).
   *
   * Vem pronta de fora (`decimoDaPessoa`) porque depende do PONTO do ano inteiro, e
   * este módulo é a conta pura — do mesmo jeito que o `folhaCalc` recebe o adicional
   * noturno do mês já em dinheiro em vez de recalcular hora.
   */
  mediaDoNoturno?: number;
  /** Quantos doze avos a pessoa tem direito. 0 a 12. */
  avos: number;
  parcela: ParcelaDoDecimo;
  /**
   * O que a 1ª parcela JÁ PAGOU, em R$. Só a 2ª usa.
   *
   * Vem do que foi gravado, e não de uma conta refeita: se o salário mudou entre
   * novembro e dezembro, o adiantamento continua sendo o que saiu do caixa. Refazer a
   * conta abateria um valor que a pessoa nunca recebeu.
   */
  jaPagoNaPrimeira?: number;
  /** Dependentes do IRRF (hoje o mesmo campo dos filhos do salário família). */
  dependentes?: number;
  percentualFgts: number;
  fgtsAtivo: boolean;
  tabelaInss?: TabelaDoInss;
  tabelaIrrf?: TabelaDoIrrf;
  tabelasConfirmadas?: boolean;
}

export interface DecimoCalculado {
  avos: number;
  /** Salário + média do noturno — a remuneração que o 13º usa como referência. */
  base: number;
  /** O 13º do ano INTEIRO, bruto: base ÷ 12 × avos. */
  bruto: number;
  parcela: ParcelaDoDecimo;
  /** Quanto desta parcela é bruto, antes de imposto. */
  brutoDaParcela: number;
  /** INSS sobre o 13º inteiro. Zero na 1ª parcela, por lei. */
  inss: number;
  irrf: number;
  baseIrrf: number;
  caminhoDoIrrf: 'simplificado' | 'deducoes' | null;
  /** Abatimento do adiantamento, só na 2ª parcela. */
  adiantamento: number;
  /** O que sai pro bolso da pessoa nesta parcela. */
  valor: number;
  /** FGTS desta parcela — custo da empresa, não abate o líquido. */
  fgts: number;
  totalProventos: number;
  totalDescontos: number;
  /** Igual ao `valor`; existe pra casar com o formato da folha mensal. */
  liquido: number;
  tabelasConfirmadas: boolean;
  /**
   * A 2ª parcela ficou NEGATIVA — o imposto do 13º inteiro passou do que sobrou.
   *
   * Acontece quando a 1ª parcela pagou metade e o INSS + IRRF juntos passam de 50% do
   * bruto (salário alto). Não é escondido nem zerado de propósito: zerar faria a empresa
   * engolir um imposto que ela tem que recolher, e ninguém saberia.
   */
  parcelaNegativa: boolean;
  linhas: LinhaDaFolha[];
}

const doisDecimais = (valor: number): number => Number(valor.toFixed(2));

const formataReferencia = (valor: number): string => valor.toFixed(2).replace('.', ',');

/** Dias corridos do mês. `new Date(ano, mes, 0)` cai no último dia do mês pedido. */
const diasDoMes = (ano: number, mes: number): number => new Date(ano, mes, 0).getDate();

/**
 * Quantos dias de VÍNCULO a pessoa teve naquele mês do ano.
 *
 * Comparação pelo texto 'YYYY-MM-DD', sem `new Date(string)`: o parse de ISO puxa UTC e
 * já custou dia trocado neste projeto.
 */
function diasDeVinculoNoMes(
  admissao: string | null | undefined,
  ano: number,
  mes: number,
  desligamento?: string | null,
): number {
  const total = diasDoMes(ano, mes);
  let primeiro = 1;
  let ultimo = total;

  const adm = (admissao ?? '').trim();
  if (adm) {
    const [a, m, d] = adm.split('-').map(Number);
    if (a && m && d) {
      if (a > ano || (a === ano && m > mes)) return 0;
      if (a === ano && m === mes) primeiro = d;
    }
  }

  const fim = (desligamento ?? '').trim();
  if (fim) {
    const [a, m, d] = fim.split('-').map(Number);
    if (a && m && d) {
      if (a < ano || (a === ano && m < mes)) return 0;
      if (a === ano && m === mes) ultimo = d;
    }
  }

  return Math.max(0, ultimo - primeiro + 1);
}

/**
 * Os MESES do ano que dão direito a um avo (decisão 3 do Victor: a regra dos 15 dias).
 *
 * Um mês conta quando sobraram **15 dias ou mais** depois de tirar o que a pessoa não
 * estava na empresa e as faltas SEM atestado. Exemplo do papel: admitida em 20/03 tem 12
 * dias de março → março não conta, e ela sai com 9/12. Admitida em 10/03 tem 22 → conta,
 * e ela sai com 10/12.
 *
 * Devolve os meses (1 a 12) em vez de só a contagem porque a média do adicional noturno
 * precisa saber QUAIS meses entram na conta.
 */
export function mesesComAvo(
  admissao: string | null | undefined,
  ano: number,
  faltasInjustificadas: readonly string[] = [],
  desligamento?: string | null,
): number[] {
  const faltasPorMes = new Map<number, number>();
  for (const data of faltasInjustificadas) {
    const [a, m] = (data ?? '').split('-').map(Number);
    if (a !== ano || !m) continue;
    faltasPorMes.set(m, (faltasPorMes.get(m) ?? 0) + 1);
  }

  const meses: number[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const vinculo = diasDeVinculoNoMes(admissao, ano, mes, desligamento);
    if (vinculo <= 0) continue;
    if (vinculo - (faltasPorMes.get(mes) ?? 0) >= 15) meses.push(mes);
  }
  return meses;
}

/**
 * A média mensal de uma parcela variável (o adicional noturno) no ano.
 *
 * Divide pelo número de AVOS, não por 12: quem entrou em julho e tem 6 avos teria a
 * média cortada pela metade se o divisor fosse 12, e o 13º sairia menor do que o devido.
 * Sem avos, não há média — devolve 0 em vez de dividir por zero.
 */
export function mediaMensalNoAno(valorPorMes: ReadonlyMap<number, number>, meses: readonly number[]): number {
  if (meses.length === 0) return 0;
  const soma = meses.reduce((s, mes) => s + (valorPorMes.get(mes) ?? 0), 0);
  return truncaCentavos(soma / meses.length);
}

export function calcularDecimoTerceiro({
  salarioMensal,
  mediaDoNoturno,
  avos,
  parcela,
  jaPagoNaPrimeira,
  dependentes,
  percentualFgts,
  fgtsAtivo,
  tabelaInss,
  tabelaIrrf,
  tabelasConfirmadas,
}: EntradaDoDecimo): DecimoCalculado {
  const salario = Math.max(0, Number(salarioMensal) || 0);
  const noturno = Math.max(0, Number(mediaDoNoturno) || 0);
  const avosValidos = Math.min(12, Math.max(0, Math.trunc(Number(avos) || 0)));

  const base = doisDecimais(salario + noturno);
  const bruto = truncaCentavos((base / 12) * avosValidos);

  // Quanto desta parcela é bruto. A 1ª é metade do 13º; a 2ª é o que sobrou dela.
  const brutoDaPrimeira = truncaCentavos(bruto / 2);
  const brutoDaParcela =
    parcela === 'primeira' ? brutoDaPrimeira
      : parcela === 'segunda' ? doisDecimais(bruto - brutoDaPrimeira)
        : bruto;

  /**
   * A 1ª parcela sai LIMPA, por lei. Não é esquecimento — o INSS e o IRRF do 13º inteiro
   * são descontados na segunda, e cobrar metade aqui faria a pessoa pagar imposto duas
   * vezes sobre o mesmo dinheiro.
   */
  const cobraImposto = parcela !== 'primeira';
  const inss = cobraImposto && tabelaInss ? calcularInss(bruto, tabelaInss) : 0;
  const doIrrf = cobraImposto && tabelaIrrf
    ? calcularIrrf(bruto, inss, dependentes ?? 0, tabelaIrrf)
    : null;
  const irrf = doIrrf?.valor ?? 0;

  const adiantamento = parcela === 'segunda' ? doisDecimais(Math.max(0, Number(jaPagoNaPrimeira) || 0)) : 0;
  const valor = doisDecimais(bruto - inss - irrf - adiantamento);

  // Na 1ª parcela o que sai é a metade bruta, sem desconto nenhum.
  const valorDaParcela = parcela === 'primeira' ? brutoDaPrimeira : valor;

  const fgts = fgtsAtivo ? truncaCentavos((brutoDaParcela * percentualFgts) / 100) : 0;

  const linhas: LinhaDaFolha[] = [];
  if (brutoDaParcela > 0 || avosValidos > 0) {
    linhas.push({
      descricao:
        parcela === 'primeira' ? 'Adiantamento do 13º salário'
          : parcela === 'segunda' ? '13º salário (2ª parcela)'
            : '13º salário',
      referencia: `${formataReferencia(avosValidos)}/12`,
      // A 2ª parcela mostra o 13º INTEIRO como provento e abate o adiantamento como
      // desconto, em vez de imprimir só o resto: é assim que o papel explica de onde
      // saiu o imposto, que incide sobre o total.
      provento: parcela === 'segunda' ? bruto : brutoDaParcela,
      desconto: 0,
    });
  }
  if (adiantamento > 0) {
    linhas.push({ descricao: 'Adiantamento já pago', provento: 0, desconto: adiantamento });
  }
  if (inss > 0 && tabelaInss) {
    linhas.push({
      descricao: 'INSS sobre 13º',
      referencia: `${formataReferencia(faixaAplicada(bruto, tabelaInss.faixas))}%`,
      provento: 0,
      desconto: inss,
    });
  }
  if (doIrrf && doIrrf.valor > 0 && tabelaIrrf) {
    linhas.push({
      descricao: 'IRRF sobre 13º',
      referencia: `${formataReferencia(faixaAplicada(doIrrf.base, tabelaIrrf.faixas))}%`,
      provento: 0,
      desconto: doIrrf.valor,
    });
  }

  const totalProventos = doisDecimais(linhas.reduce((s, l) => s + l.provento, 0));
  const totalDescontos = doisDecimais(linhas.reduce((s, l) => s + l.desconto, 0));

  return {
    avos: avosValidos,
    base,
    bruto,
    parcela,
    brutoDaParcela,
    inss,
    irrf,
    baseIrrf: doIrrf?.base ?? 0,
    caminhoDoIrrf: doIrrf?.caminho ?? null,
    adiantamento,
    valor: valorDaParcela,
    fgts,
    totalProventos,
    totalDescontos,
    liquido: doisDecimais(totalProventos - totalDescontos),
    tabelasConfirmadas: Boolean(tabelasConfirmadas),
    parcelaNegativa: parcela === 'segunda' && valor < 0,
    linhas,
  };
}
