/**
 * COMBO I FIX #5: Converte input string em número, aceitando vírgula brasileira.
 *
 * Trata casos comuns de UX em campos numéricos pt-BR:
 * - "1.5" → 1.5
 * - "1,5" → 1.5 (vírgula brasileira)
 * - "2." → 2 (digitação intermediária)
 * - "2," → 2 (digitação intermediária pt-BR)
 * - ".5" → 0.5 (sem zero antes)
 * - ",5" → 0.5 (sem zero antes pt-BR)
 * - "abc" → null
 * - "" → null
 * - " 2.5 " → 2.5 (trim)
 * - "1.5e10" → 15000000000 (notação científica)
 *
 * NOTA: este helper é usado em conjunto com state raw (string) no input,
 * pra preservar digitação intermediária. O número derivado vai pro estado
 * de UI/DB sempre normalizado.
 *
 * @param raw - String do input (e.target.value)
 * @returns número válido ou null se inválido/vazio
 */
export function parseNumericInput(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (normalized === '') return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * COMBO I FIX #5: Verifica se um número está dentro de um range (inclusivo).
 *
 * @param value - Valor a validar
 * @param min - Mínimo inclusivo
 * @param max - Máximo inclusivo
 * @returns true se min <= value <= max
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}
