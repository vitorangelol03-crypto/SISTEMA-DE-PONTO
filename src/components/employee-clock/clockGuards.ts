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

export const QUICK_EXIT_CONFIRM_MINUTES = 10;
export const AUTO_LOGOUT_SECONDS = 35;

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
