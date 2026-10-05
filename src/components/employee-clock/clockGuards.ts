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

/**
 * Tablet de ponto (05/10/2026, decisões do Victor). No tablet a fila espera a tela voltar pra
 * câmera: com 35s, 5 pessoas chegando juntas esperavam quase 3 minutos. No TABLET ATIVO a tela
 * volta em 8s depois de gravar (dá pra ver o ✅ e a hora) e em 15s depois de um erro (antes, depois
 * de um erro ela NUNCA voltava: o painel da pessoa ficava aberto pro próximo da fila). No celular
 * de cada um continua AUTO_LOGOUT_SECONDS e sem volta automática no erro, como sempre.
 */
export const TABLET_VOLTA_APOS_SUCESSO_SEGUNDOS = 8;
export const TABLET_VOLTA_APOS_FALHA_SEGUNDOS = 15;

/**
 * Tablet de ponto (05/10/2026, pedido do Victor): câmera e leitura do rosto ligadas 24h esquentam
 * o aparelho. Sem ninguém na frente da câmera por este tempo, a câmera desliga e a tela mostra
 * "Toque para bater o ponto"; o toque reabre a câmera na hora (o reconhecimento continua carregado).
 */
export const CAMERA_DESCANSA_APOS_MS = 60_000;

/**
 * Tablet (05/10/2026): quem acabou de bater é ignorado pela câmera por este tempo. Com a tela
 * voltando em 8s, quem bateu e continua na frente era reconhecido de novo e caía na pergunta de
 * saída — travando a fila.
 */
export const RECEM_BATIDO_MS = 60_000;

/**
 * Tablet (05/10/2026): CPF, senha, escolha de empresa, erro ou painel abertos SEM nenhum toque por
 * este tempo voltam sozinhos pro início — quem começou e foi embora não deixa a tela presa (com a
 * câmera desligada) pro próximo da fila.
 */
export const TABLET_TELA_LARGADA_SEGUNDOS = 45;

/**
 * Distância máxima (exclusiva) pra facial 1:1 no navegador considerar "é a mesma pessoa".
 * O servidor reconfere com o MESMO número (LIMITE_FACIAL em
 * supabase/functions/_shared/faceIdentify.ts, que desde 30/09/2026 vale também pro 1:N sem
 * CPF) — um teste trava os dois juntos.
 */
export const FACE_MATCH_THRESHOLD = 0.5;

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

/** Timestamp da marcação ANTERIOR a uma saída (pra trava de saída rápida no botão):
 *  saída almoço (2) confere contra a entrada (1); saída final (4) contra a
 *  volta do almoço (3); saída simples (2 marcações) contra a entrada.
 *  05/10/2026: veio do EmployeeClockIn (sem mudar nada) — o painel do celular continua usando. */
export function marcacaoAnteriorDaSaida(att: Attendance | null, pos?: MarkingPosition): string | null {
  if (pos === 2) return getTimestampForPosition(att, 1);
  if (pos === 4) return getTimestampForPosition(att, 3);
  return att?.entry_time ?? null;
}

/**
 * Timestamp da marcação imediatamente anterior — ponto pelo ROSTO (tablet, 05/10/2026). Ali
 * QUALQUER batida a menos de QUICK_EXIT_CONFIRM_MINUTES da anterior pergunta antes, inclusive a
 * volta do almoço (3, contra a saída do almoço): sem botão, a câmera bateria sozinha a volta em quem
 * ficou na frente depois da saída do almoço — almoço de 0 min.
 */
export function marcacaoAnterior(att: Attendance | null, pos?: MarkingPosition): string | null {
  if (pos === 2 || pos === 3 || pos === 4) return getTimestampForPosition(att, (pos - 1) as MarkingPosition);
  return att?.entry_time ?? null;
}

/** Como a tela chama a marcação anterior, pra pergunta de "logo depois de...". */
export function nomeDaMarcacaoAnterior(pos?: MarkingPosition): string {
  if (pos === 3) return 'a saída do almoço';
  if (pos === 4) return 'a volta do almoço';
  return 'a entrada';
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
