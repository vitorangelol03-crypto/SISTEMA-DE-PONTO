/**
 * "Espelho conferido" de quem NÃO ENTREGA na plataforma (05/08/2026, decisão do Victor).
 *
 * Quando a planilha chega e o entregador aparece com ZERO pacote na plataforma que foi
 * cobrada, ele já não precisa mandar print — a coluna Print mostra "não entrega". Mas o
 * "Espelho conferido" dele continuava em branco, e alguém tinha que marcar na mão um por
 * um. Decisão dele: **isso conta como validado**, senão vira trabalho manual toda quinzena.
 *
 * A regra é a MESMA do selo "não entrega" (`proofDispensadoSemPacote` +
 * `expectedProofPlatforms`), de propósito: se divergissem, o painel diria "não entrega" e
 * mesmo assim cobraria o espelho.
 *
 * ⚠️ Dispensado é diferente de "não foi pedido": quem nunca foi cobrado não entra aqui —
 * não há nada a dispensar, e marcar espelho de quem ninguém pediu seria inventar conferência.
 */

/** O mínimo que esta regra precisa saber de uma linha da grade. */
export interface DispensaRowLike {
  paymentId: string;
  espelhoConferido: boolean;
}

/**
 * Ele está 100% dispensado do print nesta quinzena?
 *
 * `esperadas` = plataformas que ainda cobram print dele (de `expectedProofPlatforms`).
 * `dispensadas` = plataformas em que foi cobrado mas ficou sem pacote (de
 * `proofDispensadoSemPacote`).
 *
 * true só quando **não sobrou nada a cobrar** E **houve ao menos uma dispensa** — ou seja,
 * ele foi cobrado e a planilha mostrou que ele não roda ali.
 */
export function espelhoDispensado(
  esperadas: readonly string[],
  dispensadas: readonly string[],
): boolean {
  return esperadas.length === 0 && dispensadas.length > 0;
}

/**
 * Quais pagamentos devem ser marcados como "espelho conferido" por dispensa.
 *
 * Só devolve quem **ainda não está marcado** — assim a chamada é idempotente e não fica
 * reescrevendo a mesma linha a cada importação.
 */
export function pagamentosParaMarcarPorDispensa<R extends DispensaRowLike>(
  rows: readonly R[],
  esperadasDe: (row: R) => readonly string[],
  dispensadasDe: (row: R) => readonly string[],
): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.espelhoConferido) continue;
    if (espelhoDispensado(esperadasDe(row), dispensadasDe(row))) ids.push(row.paymentId);
  }
  return ids;
}

/** O que a regra de DESMARCAR precisa saber de uma linha da grade. */
export interface DesmarcaRowLike {
  paymentId: string;
  espelhoConferido: boolean;
  /** Quem marcou por último ('auto', id de usuário ou null). Ausente = não sei = não mexe. */
  espelhoConferidoBy?: string | null;
}

/**
 * Quais pagamentos devem ter o "espelho conferido" DESFEITO porque a dispensa caducou
 * (19/08/2026, decisão do Victor: "desmarca sozinho e solicita o espelho").
 *
 * O caso real: alguém foi marcado por dispensa (0 pacote na plataforma cobrada) e uma
 * reimportação/edição depois DEU pacote a ele — agora ele deve print e a marca antiga
 * viraria "conferido" sem conferência. Desfaz só quando:
 *
 * - a marca é **da varredura** (`espelhoConferidoBy === 'auto'`) — humano nunca é desfeito;
 * - **sobrou plataforma cobrando** print dele (`esperadas.length > 0`); e
 * - os prints esperados **não estão todos batendo** (`tudoConferidoDe` falso) — quem tem
 *   print validado cobrindo tudo mantém a marca, que aí é legítima.
 *
 * O pedido de print não precisa ser recriado: com pacote > 0 e o pedido da quinzena de
 * pé, o slot volta a aparecer sozinho no portal do entregador.
 */
export function pagamentosParaDesmarcarPorDispensa<R extends DesmarcaRowLike>(
  rows: readonly R[],
  esperadasDe: (row: R) => readonly string[],
  tudoConferidoDe: (row: R) => boolean,
): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (!row.espelhoConferido) continue;
    if (row.espelhoConferidoBy !== 'auto') continue;
    if (esperadasDe(row).length === 0) continue;
    if (tudoConferidoDe(row)) continue;
    ids.push(row.paymentId);
  }
  return ids;
}
