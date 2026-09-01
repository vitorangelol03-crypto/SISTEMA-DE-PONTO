/**
 * Helpers PUROS da AttendanceTab — extraídos pra módulo próprio (sem imports
 * pesados como supabase/lazy-loads) pra poder testar isolado.
 */

/**
 * `employee.marking_count` vazio herda o padrão da empresa (mesma semântica
 * de EmployeeClockIn.tsx e recalcAttendance) — sem isso, quem bate 4
 * marcações por herança (sem valor fixo no cadastro) continuava aparecendo
 * com o campo antigo de Entrada/Saída aqui, mesmo tendo
 * entry_1/exit_1/entry_2/exit_2 no banco (achado 01/09/2026, preparação do
 * roadmap item 2 pra ligar 4 marcações pra todo mundo).
 */
export function resolveMarkingCount(
  employeeMarkingCount: 2 | 4 | null | undefined,
  companyDefault: 2 | 4 | undefined,
): 2 | 4 {
  const resolved = employeeMarkingCount ?? companyDefault ?? 2;
  return resolved === 4 ? 4 : 2;
}
