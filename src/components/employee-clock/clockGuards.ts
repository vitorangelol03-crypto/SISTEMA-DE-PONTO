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
 *  empresa (mesma regra usada em EmployeeClockIn.tsx e recalcAttendance).
 *  06/10/2026: a empresa pode vir só com o padrão — no modo galpão a ficha pode ser da OUTRA
 *  empresa do tablet, e o servidor manda o padrão dela junto com a identificação. */
export function resolveMarkingCount(
  employee: Employee | null,
  company: Pick<Company, 'default_marking_count'> | { default_marking_count?: number | null } | null,
): 2 | 4 {
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

// ─── MODO GALPÃO — o tablet SEM TOQUE (06/10/2026) ───────────────────────────────────────────
// Plano aprovado em 05/10 (.claude-checkpoints/PLANO_TABLET_SEM_TOQUE_2026-10-05.md §2). Tudo
// aqui só vale com o modo galpão LIGADO no tablet (cartão "Tablets de ponto", 2626); desligado,
// a tela segue exatamente como antes.

/**
 * Decisão 2 — "modo econômico" no lugar do descanso com toque: sem ninguém por
 * CAMERA_DESCANSA_APOS_MS a tela escurece (relógio), mas a câmera NÃO desliga — ela olha a cada
 * este tanto e volta ao ritmo normal sozinha quando aparece um rosto. Nenhum toque.
 */
export const GALPAO_ECONOMIA_OLHA_A_CADA_MS = 2_000;

/**
 * Decisão 3 — batida a menos de QUICK_EXIT_CONFIRM_MINUTES da anterior, sem toque: NÃO grava,
 * mostra "Você já bateu ... às HH:MM" por GALPAO_AVISO_MS e ignora a pessoa por
 * GALPAO_IGNORA_APOS_AVISO_MS. Saída real em < 10 min o supervisor ajusta no painel.
 * GALPAO_AVISO_MS vale pros avisos SEM botão do modo galpão (esse e o "ponto NÃO registrado" da
 * 2ª foto): ficam na tela e somem sozinhos.
 */
export const GALPAO_AVISO_MS = 3_000;
export const GALPAO_IGNORA_APOS_AVISO_MS = 60_000;

/** Recuperação sozinha (câmera que não abriu, arquivos do reconhecimento que falharam). */
export const GALPAO_TENTA_DE_NOVO_MS = 30_000;

/**
 * Decisão 8 — GPS do tablet FIXO: aceita uma posição de até 5 min (o tablet não se move) e tenta
 * de novo sozinho uma vez. No galpão a precisão medida foi 24–67 m e a 1ª leitura às vezes falha.
 */
export const GALPAO_GPS_POSICAO_ATE_MS = 5 * 60_000;

/**
 * Tablet (06/10/2026): de quanto em quanto tempo ele reconfere quem é, com a tela LIVRE. É como um
 * tablet que ninguém toca fica sabendo que o 2626 ligou/desligou o modo galpão (antes: só ao
 * recarregar a página).
 */
export const TABLET_RECONFERE_A_CADA_MS = 5 * 60_000;

/** Tablet barrado pelo servidor (removido, ou a empresa saiu dele): reconfere sozinho neste ritmo. */
export const TABLET_BARRADO_RECONFERE_MS = 60_000;

/** "07:42" de um horário ISO (aviso da batida recente). null se não der pra ler. */
export function horaDaMarcacao(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * A 2ª foto, tirada no FIM da contagem (modo galpão — plano §4 "Batida sem toque": "no fim da
 * contagem uma 2ª foto é conferida no próprio tablet (saiu da frente ou trocou de pessoa →
 * cancela)"). Sem o toque do "Não sou eu", é ela que segura a batida errada:
 *  - 'mesma-pessoa' → grava, e é ESTA foto que vai pro 1:1 do servidor (uma amostra NOVA,
 *    independente da que fez o 1:N — antes o servidor reconferia a mesma foto);
 *  - 'outra-pessoa' → trocou quem está na frente durante a contagem: NÃO grava;
 *  - 'sem-rosto'    → a pessoa saiu da frente antes do fim: NÃO grava (ela não viu o ✅; se
 *    continuar ali, é reconhecida de novo na hora).
 * `distancia` = distância entre a 2ª e a 1ª foto (null = nenhum rosto na 2ª).
 */
export type DecisaoDaSegundaFoto = 'mesma-pessoa' | 'outra-pessoa' | 'sem-rosto';

export function decidirSegundaFoto(distancia: number | null | undefined): DecisaoDaSegundaFoto {
  if (distancia == null || !Number.isFinite(distancia)) return 'sem-rosto';
  return distancia < FACE_MATCH_THRESHOLD ? 'mesma-pessoa' : 'outra-pessoa';
}

/** Quantas vezes a 2ª foto procura o rosto antes de concluir "saiu da frente" (um quadro tremido
 *  sozinho não pode cancelar a batida de quem continua parado ali). */
export const GALPAO_SEGUNDA_FOTO_TENTATIVAS = 3;
