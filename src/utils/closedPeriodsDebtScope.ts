/**
 * Filtro por quinzena de origem + seleção em massa do modal "Saldo de quinzenas
 * fechadas" (18/08/2026, pedido do Victor).
 *
 * Puro de propósito, mesma razão do `bonusScope.ts`: quem decide pra qual quinzena
 * um saldo real migra não pode depender de React pra ser testado.
 */

export interface SaldoLinha {
  periodId: string;
  periodLabel: string;
  driverId: string;
}

/** Chave única de uma linha (mesmo driver pode aparecer em quinzenas de origem diferentes). */
export function chaveLinha(r: SaldoLinha): string {
  return `${r.periodId}:${r.driverId}`;
}

/** Quinzenas de origem distintas presentes na lista, na ordem em que aparecem. */
export function origensDistintas<R extends SaldoLinha>(
  rows: readonly R[],
): { id: string; label: string }[] {
  const vistos = new Map<string, string>();
  for (const r of rows) if (!vistos.has(r.periodId)) vistos.set(r.periodId, r.periodLabel);
  return [...vistos.entries()].map(([id, label]) => ({ id, label }));
}

/** Só as linhas da quinzena de origem escolhida — `''` (nenhuma escolhida) mostra todas. */
export function filtrarPorOrigem<R extends SaldoLinha>(
  rows: readonly R[],
  origemId: string,
): R[] {
  return rows.filter((r) => !origemId || r.periodId === origemId);
}

/** As linhas VISÍVEIS (já filtradas) que estão marcadas — recalculado, nunca guardado à parte. */
export function linhasSelecionadasVisiveis<R extends SaldoLinha>(
  visiveis: readonly R[],
  selecionados: ReadonlySet<string>,
): R[] {
  return visiveis.filter((r) => selecionados.has(chaveLinha(r)));
}

/** "Selecionar todos" já está marcado? (todas as visíveis estão no conjunto — vazio = não). */
export function todasVisiveisSelecionadas<R extends SaldoLinha>(
  visiveis: readonly R[],
  selecionados: ReadonlySet<string>,
): boolean {
  return visiveis.length > 0 && visiveis.every((r) => selecionados.has(chaveLinha(r)));
}

/**
 * Alterna a seleção das linhas VISÍVEIS (o resto do conjunto, fora do filtro atual,
 * fica intocado). Se já estão todas marcadas, desmarca; senão, marca todas.
 *
 * Mesma regra do Reset Geral e da Bonificação: "selecionar todos" nunca extrapola
 * o que está na tela.
 */
export function alternarTodosVisiveis<R extends SaldoLinha>(
  visiveis: readonly R[],
  selecionados: ReadonlySet<string>,
): Set<string> {
  const marcarTudo = !todasVisiveisSelecionadas(visiveis, selecionados);
  const next = new Set(selecionados);
  for (const r of visiveis) {
    if (marcarTudo) next.add(chaveLinha(r));
    else next.delete(chaveLinha(r));
  }
  return next;
}

/** Alterna uma única linha, preservando o resto da seleção. */
export function alternarUma<R extends SaldoLinha>(
  r: R,
  selecionados: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selecionados);
  const k = chaveLinha(r);
  if (next.has(k)) next.delete(k); else next.add(k);
  return next;
}
