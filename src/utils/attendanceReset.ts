/**
 * Quem o "Reset Geral" da tela de Ponto realmente afeta.
 *
 * Motivo desta função existir (28/07): o Reset Geral montava a lista de alvos a partir
 * de TODOS os registros do dia (`attendances`), ignorando a busca da tela. Quem filtrasse
 * por um funcionário e clicasse em "Reset Geral" apagava o ponto do dia inteiro, de todo
 * mundo — sem aviso. Isso destruiu ponto REAL de Ponte Nova durante a bateria E2E
 * (`tests/04-bonus.spec.ts` roda em PN e clica no botão), e o mesmo estrago era possível
 * em produção com dois cliques.
 *
 * Pura de propósito: a regra do que vai ser apagado precisa ser testável sem browser.
 */

/** O mínimo que precisamos de um registro de ponto para decidir o alvo. */
export interface ResetAttendanceLike {
  employee_id: string;
}

/** O mínimo que precisamos de um funcionário visível na tela. */
export interface ResetEmployeeLike {
  id: string;
}

/**
 * Registros que o Reset Geral deve apagar: SOMENTE os dos funcionários que estão
 * visíveis na tela agora (a lista já filtrada pela busca).
 *
 * Sem busca ativa, `visibleEmployees` é a lista inteira e o resultado é o mesmo de antes —
 * a mudança só aparece quando há filtro, que é exatamente o caso perigoso.
 */
export function attendancesToReset<A extends ResetAttendanceLike, E extends ResetEmployeeLike>(
  attendances: readonly A[],
  visibleEmployees: readonly E[],
): A[] {
  const visiveis = new Set(visibleEmployees.map((e) => e.id));
  return attendances.filter((a) => visiveis.has(a.employee_id));
}

/**
 * O Reset Geral está prestes a pegar gente que NÃO está na busca? Serve pro aviso do
 * modal: com filtro ativo, o operador precisa ver que o "todos" é só o que está na tela.
 */
export function resetIsFiltered<A extends ResetAttendanceLike, E extends ResetEmployeeLike>(
  attendances: readonly A[],
  visibleEmployees: readonly E[],
): boolean {
  return attendancesToReset(attendances, visibleEmployees).length < attendances.length;
}
