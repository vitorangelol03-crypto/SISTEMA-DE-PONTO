/**
 * INSS E IMPOSTO DE RENDA da folha de carteira assinada.
 *
 * Segunda leva da Etapa 3 do `PLANO_FINANCEIRO_2026-09.md`, aprovada pelo Victor em
 * 18/09/2026 ("1 sim, 2 sim, 3 sim, pode ir").
 *
 * ⚠️ O QUE ESTÁ PROVADO E O QUE NÃO ESTÁ — leia antes de confiar num número:
 *
 * **INSS — provado contra 11 dos 12 recibos reais de Julho/2026** (a Silvia fica de fora:
 * o INSS dela incidiu sobre férias pagas num recibo à parte). Derivado do papel, não
 * deduzido de tabela: desconto progressivo, 7,5% até o limite da 1ª faixa e 9% sobre o
 * que passar, **truncado** em centavos. As duas primeiras faixas reproduzem os 11
 * recibos exatamente.
 *
 * ❌ **As faixas de 12% e 14% NÃO são provadas por nada**: o maior salário do gabarito é
 * R$ 2.200 e ninguém chega nelas. Vêm da tabela cadastrada, que nasce marcada como
 * **não confirmada** até o contador do Victor conferir.
 *
 * ❌ **O IMPOSTO DE RENDA não é provado por nada.** Nenhum dos 12 pagou IRRF — todos
 * estão abaixo da isenção, e o papel só mostra a "Base IRRF". Tentei derivar a regra da
 * base e ela não fecha (o desconto varia de R$ 423 a R$ 514 entre as pessoas, sem padrão
 * que o papel explique). O cálculo aqui segue a regra da Receita; o número sai da tabela
 * cadastrada, também não confirmada.
 *
 * Por isso o recibo sai com aviso de "valores em conferência" enquanto a tabela do ano
 * não estiver confirmada (decisão 3 do Victor) — o sistema não é fonte oficial antes de
 * rodar em paralelo com a contabilidade.
 */

import { truncaCentavos } from './dinheiro';

/** Uma faixa da tabela progressiva. `ate` nulo = a última, sem teto. */
export interface FaixaDeImposto {
  ate: number | null;
  aliquota: number;
}

export interface TabelaDoInss {
  faixas: FaixaDeImposto[];
  /** Teto do salário de contribuição: acima disso o INSS para de crescer. */
  teto: number;
}

export interface TabelaDoIrrf {
  faixas: FaixaDeImposto[];
  /** Quanto cada dependente abate da base (caminho das deduções legais). */
  deducaoPorDependente: number;
  /** Abatimento único do caminho simplificado. */
  descontoSimplificado: number;
}

/**
 * Soma progressiva: cada faixa incide só sobre a parte do valor que cai dentro dela.
 *
 * É o erro clássico de quem lê o recibo: a Camila aparece com "9,00%" e base 1.772,87,
 * mas paga 135,23 — 7,6% efetivos, não 9%. Os 9% valem só sobre o que passa da 1ª faixa.
 */
function somaProgressiva(valor: number, faixas: readonly FaixaDeImposto[]): number {
  let imposto = 0;
  let piso = 0;
  for (const faixa of faixas) {
    if (valor <= piso) break;
    const topo = faixa.ate ?? Infinity;
    const dentroDaFaixa = Math.min(valor, topo) - piso;
    if (dentroDaFaixa > 0) imposto += dentroDaFaixa * (faixa.aliquota / 100);
    piso = topo;
  }
  return imposto;
}

/** A faixa em que o valor caiu — é o que a coluna "REFERÊNCIAS" do recibo imprime. */
export function faixaAplicada(valor: number, faixas: readonly FaixaDeImposto[]): number {
  let aplicada = faixas[0]?.aliquota ?? 0;
  for (const faixa of faixas) {
    if (faixa.ate === null || valor <= faixa.ate) return faixa.aliquota;
    aplicada = faixa.aliquota;
  }
  return aplicada;
}

/**
 * INSS sobre a base (salário + adicional noturno + férias, sem o salário família).
 *
 * O teto do salário de contribuição limita a BASE, não o imposto: quem ganha acima dele
 * contribui como se ganhasse o teto.
 */
export function calcularInss(base: number, tabela: TabelaDoInss): number {
  const valor = Math.max(0, Number(base) || 0);
  if (valor <= 0) return 0;
  const limitada = tabela.teto > 0 ? Math.min(valor, tabela.teto) : valor;
  return truncaCentavos(somaProgressiva(limitada, tabela.faixas));
}

export interface ResultadoDoIrrf {
  base: number;
  valor: number;
  /** Qual caminho ganhou — o recibo e a tela mostram, pra ninguém achar que é chute. */
  caminho: 'simplificado' | 'deducoes';
}

/**
 * IRRF sobre o que sobra depois do INSS.
 *
 * A lei deixa escolher entre o **desconto simplificado** (um abatimento único) e as
 * **deduções legais** (INSS + dependentes), e vale o que resultar em MENOS imposto —
 * decisão 2 do Victor, que é também o que a Receita manda.
 */
export function calcularIrrf(
  baseBruta: number,
  inss: number,
  dependentes: number,
  tabela: TabelaDoIrrf,
): ResultadoDoIrrf {
  const bruto = Math.max(0, Number(baseBruta) || 0);
  const contribuicao = Math.max(0, Number(inss) || 0);
  const filhos = Math.max(0, Math.trunc(Number(dependentes) || 0));

  const porDeducoes = Math.max(0, bruto - contribuicao - filhos * tabela.deducaoPorDependente);
  const porSimplificado = Math.max(0, bruto - tabela.descontoSimplificado);

  const impostoDeducoes = truncaCentavos(somaProgressiva(porDeducoes, tabela.faixas));
  const impostoSimplificado = truncaCentavos(somaProgressiva(porSimplificado, tabela.faixas));

  return impostoSimplificado <= impostoDeducoes
    ? { base: porSimplificado, valor: impostoSimplificado, caminho: 'simplificado' }
    : { base: porDeducoes, valor: impostoDeducoes, caminho: 'deducoes' };
}

/**
 * TABELAS DE 2026 — ponto de partida, **não confirmadas**.
 *
 * A 1ª e a 2ª faixa do INSS saíram do próprio recibo da contabilidade (reproduzem 11 de
 * 11). O resto — o limite exato da 1ª faixa dentro do intervalo que o papel permite, as
 * faixas de 12% e 14%, o teto, e a tabela inteira do IRRF — é o melhor que eu sei, e
 * está aqui pra ser corrigido na tela de Configurações, não pra ser confiado.
 */
export const TABELA_INSS_2026: TabelaDoInss = {
  faixas: [
    { ate: 1621.3, aliquota: 7.5 },   // provada pelo recibo (intervalo 1.621,23–1.621,34)
    { ate: 3041.65, aliquota: 9 },    // a alíquota é provada; o limite, não
    { ate: 4562.47, aliquota: 12 },   // NÃO provada
    { ate: 9124.94, aliquota: 14 },   // NÃO provada
  ],
  teto: 9124.94,
};

export const TABELA_IRRF_2026: TabelaDoIrrf = {
  faixas: [
    { ate: 2428.8, aliquota: 0 },
    { ate: 2826.65, aliquota: 7.5 },
    { ate: 3751.05, aliquota: 15 },
    { ate: 4664.68, aliquota: 22.5 },
    { ate: null, aliquota: 27.5 },
  ],
  deducaoPorDependente: 189.59,
  descontoSimplificado: 607.2,
};
