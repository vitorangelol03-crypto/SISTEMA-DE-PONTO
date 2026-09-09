/**
 * Escopo do pagamento C6: QUEM entra no arquivo do banco.
 *
 * 09/09/2026 (pedido do Victor): "geral tudo junto, ou somente carteira assinada, ou
 * diaristas, ou 1 de um e outro de outro".
 *
 * Os três primeiros já saíam pelo filtro de tipo de contrato, que existe desde sempre.
 * O que não existia era o **avulso** — escolher pessoa por pessoa, podendo misturar
 * diarista e carteira assinada. Antes, a exportação sempre pegava a lista inteira: a
 * seleção de linhas só servia pra trocar data em lote.
 *
 * Regra: marcou alguém, sai só quem foi marcado. Não marcou nada, sai a lista toda —
 * que é como funcionava antes, pra ninguém ser surpreendido por um arquivo pela metade.
 */
export function linhasDoEscopo<T extends { id: string }>(
  linhas: readonly T[],
  selecionados: ReadonlySet<string>,
): T[] {
  if (selecionados.size === 0) return [...linhas];
  const escolhidas = linhas.filter((l) => selecionados.has(l.id));
  // Seleção que não corresponde a nenhuma linha visível (ex.: a lista foi recarregada e
  // as marcas ficaram para trás) NÃO pode virar arquivo vazio nem, pior, arquivo com
  // todo mundo: devolve vazio e quem chama trata como "nada pra exportar".
  return escolhidas;
}

/** True quando o arquivo vai sair com um recorte, e não com a lista inteira. */
export function ehEscopoAvulso(selecionados: ReadonlySet<string>): boolean {
  return selecionados.size > 0;
}
