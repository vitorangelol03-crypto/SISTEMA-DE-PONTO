/**
 * Busca de texto que IGNORA ACENTO (pedido do Victor, 04/08/2026).
 *
 * Na aba Pagamentos Driver a busca comparava `toLowerCase().includes(...)` cru:
 * quem digitava "jose" não achava "José", "cha" não achava "Chalé" e "conceicao"
 * não achava "Conceição". Como quase todo nome de entregador e de rota da região
 * tem acento, isso obrigava a digitar acentuado no meio da correria.
 *
 * Mantido SIMPLES de propósito: só tira acento e caixa. Diferente do
 * `normalizeDriverName` (driverNameMatch.ts), que também remove prefixo numérico,
 * parênteses e "XPT" — aquilo serve pra CASAR nome de planilha com cadastro, e
 * numa busca livre atrapalharia (procurar "xpt" deixaria de achar).
 */

/** Minúsculas e sem acento. `null`/`undefined` viram string vazia. */
export function semAcento(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * `agulha` aparece em `palheiro`, ignorando acento e caixa?
 * Agulha vazia casa com tudo (é o campo de busca em branco).
 */
export function contemSemAcento(palheiro: string | null | undefined, agulha: string): boolean {
  const q = semAcento(agulha).trim();
  if (!q) return true;
  return semAcento(palheiro).includes(q);
}
