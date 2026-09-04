/** Proteções da tela de ponto (decisões do Victor, 2026-07-20):
 *
 * 1. Saída "fantasma": histórico mostra saídas registradas 10-15s após a
 *    entrada (funcionário toca no botão de SAÍDA achando que é confirmação
 *    da entrada — acontece até com facial ligada). Saída a menos de
 *    QUICK_EXIT_CONFIRM_MINUTES da marcação anterior exige confirmação.
 * 2. Aparelho compartilhado: a tela volta ao início (CPF) sozinha
 *    AUTO_LOGOUT_SECONDS após registrar o ponto, pra sessão de um
 *    funcionário não sobrar logada pro próximo da fila.
 */
import type { Attendance, Company, Employee } from '../../services/database';

export const QUICK_EXIT_CONFIRM_MINUTES = 10;
export const AUTO_LOGOUT_SECONDS = 35;

// Sub-fase 2.10: 4 marcações. Movido de EmployeeClockIn.tsx (04/09/2026) pra
// ser reaproveitado também pelo reconhecimento facial sem CPF (precisa saber
// qual é a PRÓXIMA marcação sem ter passado pela tela de CPF antes).
export type MarkingPosition = 1 | 2 | 3 | 4;

export const MARKING_LABELS: Record<MarkingPosition, string> = {
  1: 'Entrada manhã',
  2: 'Saída almoço',
  3: 'Volta almoço',
  4: 'Saída final',
};

export function getTimestampForPosition(att: Attendance | null, pos: MarkingPosition): string | null {
  if (!att) return null;
  if (pos === 1) return att.entry_1_time ?? att.entry_time ?? null;
  if (pos === 2) return att.exit_1_time ?? null;
  if (pos === 3) return att.entry_2_time ?? null;
  return att.exit_2_time ?? att.exit_time_full ?? null;
}

export function getNextMarkingPosition(att: Attendance | null): MarkingPosition | null {
  for (const p of [1, 2, 3, 4] as const) {
    if (!getTimestampForPosition(att, p)) return p;
  }
  return null;
}

/** `marking_count` do funcionário manda; sem valor próprio, herda o padrão da
 *  empresa (mesma regra usada em EmployeeClockIn.tsx e recalcAttendance). */
export function resolveMarkingCount(employee: Employee | null, company: Company | null): 2 | 4 {
  const resolved = employee?.marking_count ?? company?.default_marking_count ?? 2;
  return resolved === 4 ? 4 : 2;
}

/** Próxima ação de ponto do dia — unifica os dois modos (2 ou 4 marcações),
 *  usado pelo reconhecimento facial sem CPF (04/09/2026), que precisa decidir
 *  a marcação SEM ter passado pela tela de dashboard primeiro (onde o modo de
 *  2 marcações já decide isso direto por hasEntry/hasExit, sem esta função). */
export function resolveNextClockAction(
  att: Attendance | null,
  markingCount: 2 | 4,
): { type: 'entry' | 'exit'; markingPosition?: MarkingPosition; label: string } | null {
  if (markingCount === 4) {
    const pos = getNextMarkingPosition(att);
    if (pos == null) return null;
    return { type: pos === 1 ? 'entry' : 'exit', markingPosition: pos, label: MARKING_LABELS[pos] };
  }
  if (!att?.entry_time) return { type: 'entry', label: 'Entrada' };
  if (!att?.exit_time_full) return { type: 'exit', label: 'Saída' };
  return null;
}

/** Minutos (inteiros, arredondando pra baixo) desde um timestamp ISO.
 *  null se não há timestamp anterior (sem marcação → sem confirmação). */
export function minutesSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return null;
  const diffMs = now.getTime() - then;
  if (diffMs < 0) return 0; // relógio adiantado/atrasado: trata como "agora mesmo"
  return Math.floor(diffMs / 60_000);
}

/** Saída rápida demais? Retorna os minutos desde a marcação anterior quando
 *  precisa confirmar, ou null quando pode seguir direto. */
export function quickExitMinutes(
  prevMarkingIso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const mins = minutesSince(prevMarkingIso, now);
  if (mins == null) return null;
  return mins < QUICK_EXIT_CONFIRM_MINUTES ? mins : null;
}
