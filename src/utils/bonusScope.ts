/**
 * Quem realmente recebe a "Bonificação do Dia" (05/08/2026, decisões do Victor).
 *
 * O botão aplicava em TODOS que bateram ponto no dia, **ignorando a busca da tela**
 * e sem dizer quem ia receber. Foi assim que 20 funcionários reais da Caratinga
 * ficaram com R$ 10 que ninguém lançou, e antes deles outros em 18/05.
 *
 * É o MESMO defeito que o "Reset Geral" tinha (corrigido em 29/07): ação em massa
 * que não respeita a lista visível. A solução aqui é a mesma que ele aprovou lá —
 * por isso este arquivo espelha `attendanceReset.ts`.
 *
 * Puro de propósito: quem recebe dinheiro não pode depender de React pra ser testado.
 */

export interface BonusAttendanceLike {
  employee_id: string;
}
export interface BonusEmployeeLike {
  id: string;
  name?: string;
}

/**
 * Presenças que vão receber o bônus: só quem está na lista VISÍVEL.
 * Sem busca ativa a lista visível é a empresa inteira, então nada muda — é o
 * comportamento de sempre.
 */
export function bonusTargets<A extends BonusAttendanceLike, E extends BonusEmployeeLike>(
  attendances: readonly A[],
  visibleEmployees: readonly E[],
): A[] {
  const visiveis = new Set(visibleEmployees.map((e) => e.id));
  return attendances.filter((a) => visiveis.has(a.employee_id));
}

/** Tem gente presente que a busca escondeu? (a tela avisa em destaque) */
export function bonusIsFiltered<A extends BonusAttendanceLike, E extends BonusEmployeeLike>(
  attendances: readonly A[],
  visibleEmployees: readonly E[],
): boolean {
  return bonusTargets(attendances, visibleEmployees).length < attendances.length;
}

/**
 * Quem tem ponto no dia mas está FORA da lista visível — é quem o
 * `applyBonusToAllPresent` precisa pular (ele recebe uma lista de exclusão).
 */
export function bonusExcludedIds<A extends BonusAttendanceLike, E extends BonusEmployeeLike>(
  attendances: readonly A[],
  visibleEmployees: readonly E[],
): string[] {
  const visiveis = new Set(visibleEmployees.map((e) => e.id));
  const fora = new Set<string>();
  for (const a of attendances) if (!visiveis.has(a.employee_id)) fora.add(a.employee_id);
  return [...fora];
}

/**
 * Nomes de quem vai receber, na ordem da lista visível, para a confirmação.
 * `limite` corta a lista (a confirmação mostra alguns e diz "e mais N").
 */
export function bonusTargetNames<A extends BonusAttendanceLike, E extends BonusEmployeeLike>(
  attendances: readonly A[],
  visibleEmployees: readonly E[],
  limite = 5,
): { nomes: string[]; total: number; restantes: number } {
  const alvos = new Set(bonusTargets(attendances, visibleEmployees).map((a) => a.employee_id));
  const nomes = visibleEmployees.filter((e) => alvos.has(e.id)).map((e) => e.name ?? '(sem nome)');
  return {
    nomes: nomes.slice(0, limite),
    total: nomes.length,
    restantes: Math.max(0, nomes.length - limite),
  };
}

/**
 * O valor digitado bate com o configurado para este tipo de bônus?
 *
 * Só AVISA (decisão do Victor) — bonificação de valor diferente é caso real, mas
 * digitar R$ 10 onde o configurado é R$ 15 foi exatamente o que passou despercebido
 * em 04/08. `null` = não há valor configurado, então não há o que comparar.
 */
export function bonusValorDivergente(digitado: number, configurado: number | null | undefined): boolean {
  if (configurado === null || configurado === undefined) return false;
  if (!Number.isFinite(digitado) || !Number.isFinite(configurado)) return false;
  if (configurado <= 0) return false;
  return Math.abs(digitado - configurado) > 0.005;
}
