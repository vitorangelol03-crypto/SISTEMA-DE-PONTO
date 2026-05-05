import type { BankHoursPreviewItem } from '../services/database';

/**
 * COMBO I FIX #3: Decide se o banner "todos já aplicados" deve aparecer.
 *
 * Retorna true quando:
 * - Há pelo menos 1 item na lista
 * - TODOS os items têm status === 'already_applied'
 *
 * Em qualquer outro caso (lista vazia, mix de status, qualquer item pendente)
 * retorna false.
 *
 * @param items - Lista de preview items vindos de previewBankHoursForPeriod
 * @returns true se deve mostrar banner all-applied
 */
export function shouldShowAllAppliedBanner(
  items: BankHoursPreviewItem[]
): boolean {
  if (items.length === 0) return false;
  return items.every(i => i.status === 'already_applied');
}
