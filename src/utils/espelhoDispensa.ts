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
