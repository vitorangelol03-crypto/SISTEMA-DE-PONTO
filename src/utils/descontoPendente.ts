/**
 * Quem REALMENTE ficou devendo o desconto de vale/perda (05/08/2026).
 *
 * ## O que estava errado
 *
 * O aviso vermelho do relatório dizia *"55 entregador(es) já foram pagos SEM o desconto de
 * vale/perda — o desconto deles ficou pendente"* e listava os 55 nomes. Medido no banco na
 * hora em que o Victor perguntou:
 *
 * - **38 dos 55 não têm vale nem perda nenhum** — não havia nada a descontar;
 * - os **17 restantes** já tinham tido o desconto abatido **na outra plataforma** (pagos sem
 *   abater na eMile, com abate na Shopee/LOGGI);
 * - ou seja: **pendente de verdade = zero**, e o aviso assustava do mesmo jeito.
 *
 * Pior: ele empurrava pra marcar "Descontar vales e perdas", o que **descontaria de novo**
 * de 25 pessoas — R$ 1.885,14 cobrados duas vezes.
 *
 * ## A regra
 *
 * Só é pendente quem tem **valor a descontar** E foi pago **sem abater** E **não** teve o
 * abate em nenhum outro lugar (outra plataforma ou espelho publicado com desconto).
 */

/** O que se sabe de uma pessoa que aparece na lista de "já pago". */
export interface PessoaPaga {
  driverId: string;
  name: string;
  /** Foi pago em ALGUMA plataforma sem abater o vale/perda. */
  pagoSemDesconto: boolean;
  /** Foi pago em ALGUMA plataforma JÁ abatendo o vale/perda. */
  pagoComDesconto: boolean;
  /** Vales + perdas dele nesta quinzena, em R$. */
  valeOuPerda: number;
  /** Já teve o abate num espelho publicado deste período. */
  abatidoEmEspelho: boolean;
}

/** Uma pendência de verdade: tem valor e ninguém abateu ainda. */
export interface DescontoPendente {
  driverId: string;
  name: string;
  valor: number;
}

/**
 * Filtra só quem ficou devendo o desconto de fato.
 *
 * ⚠️ A ordem das condições importa pra entender o caso real: a pessoa pode ter sido paga
 * SEM abate numa plataforma e COM abate em outra. Aí não há pendência — o dinheiro já saiu
 * do bolso dela uma vez, e cobrar de novo seria desconto duplo.
 */
export function descontosPendentes(pessoas: readonly PessoaPaga[]): DescontoPendente[] {
  const out: DescontoPendente[] = [];
  for (const p of pessoas) {
    if (p.valeOuPerda <= 0) continue; // nada a descontar
    if (!p.pagoSemDesconto) continue; // não foi pago sem abater
    if (p.pagoComDesconto) continue; // já abateu em outra plataforma
    if (p.abatidoEmEspelho) continue; // já abateu no espelho publicado
    out.push({ driverId: p.driverId, name: p.name, valor: p.valeOuPerda });
  }
  return out.sort((a, b) => b.valor - a.valor);
}

/** Soma do que está pendente — o número que o aviso deve mostrar. */
export function totalPendente(pendentes: readonly DescontoPendente[]): number {
  return Math.round(pendentes.reduce((s, p) => s + p.valor, 0) * 100) / 100;
}
