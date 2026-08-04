/**
 * Provas de desconto (fotos + video): regras puras, sem banco e sem Storage.
 *
 * Existe porque EDITAR um desconto passou a poder trocar as provas, e trocar
 * prova tem duas pegadinhas que precisam de teste proprio:
 *
 * 1. O bucket `driverpay-discount-proofs` tem policy de INSERT, SELECT e DELETE,
 *    mas NAO de UPDATE (migration 20260704120000). Reenviar por cima do mesmo
 *    caminho seria barrado pela RLS — por isso toda prova nova nasce com um
 *    sufixo unico no nome, em vez de sobrescrever a anterior.
 * 2. Como o nome muda, a prova antiga vira lixo no Storage se ninguem apagar.
 */

/** Uma prova no formulario: ou uma que ja estava salva, ou um arquivo novo. */
export type ProofSlot = { keep: string } | { blob: Blob };

/** True quando o slot e uma prova que JA estava salva (so o caminho). */
export const isKeptProof = (slot: ProofSlot): slot is { keep: string } => 'keep' in slot;

/**
 * Caminhos que sairam do desconto e devem ser apagados do Storage.
 *
 * Compara o que estava gravado com o que ficou depois da edicao. Ignora nulos,
 * nao repete caminho (as duas fotos podem, em teoria, apontar pro mesmo arquivo)
 * e preserva a ordem de entrada para o resultado ser previsivel no teste.
 */
export const orphanProofPaths = (
  antigos: (string | null | undefined)[],
  finais: (string | null | undefined)[],
): string[] => {
  const mantidos = new Set(finais.filter((p): p is string => !!p));
  const vistos = new Set<string>();
  const orfaos: string[] = [];
  for (const path of antigos) {
    if (!path || mantidos.has(path) || vistos.has(path)) continue;
    vistos.add(path);
    orfaos.push(path);
  }
  return orfaos;
};

/**
 * Nome do arquivo de uma prova NOVA, sempre unico (ver pegadinha 1 no topo).
 * `unico` entra por parametro para o teste conseguir fixar o valor.
 */
export const proofFileName = (discountId: string, slot: string, ext: string, unico: string): string =>
  `${discountId}-${slot}-${unico}.${ext}`;
