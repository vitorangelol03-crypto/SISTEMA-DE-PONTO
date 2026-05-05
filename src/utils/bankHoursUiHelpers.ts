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

/**
 * COMBO I FIX #2: Estado do checkbox "marcar todos pendentes" no header.
 *
 * Retorna o estado tri-state do checkbox header baseado nos items pending:
 * - checked=true se TODOS pending estão marcados
 * - indeterminate=true se ALGUNS pending estão marcados (mas não todos)
 * - checked=false e indeterminate=false se NENHUM pending está marcado
 *
 * Items não-pending (already_applied, no_payment, etc.) são ignorados —
 * o checkbox header só reflete e controla os pending.
 *
 * @param items - Lista completa de preview items
 * @param applyFlags - Map { [employeeId]: boolean } indicando quais estão marcados
 * @returns { checked, indeterminate, hasPending } estado pro checkbox header
 */
export function selectAllPendingState(
  items: BankHoursPreviewItem[],
  applyFlags: Record<string, boolean>
): { checked: boolean; indeterminate: boolean; hasPending: boolean } {
  const pending = items.filter(i => i.status === 'pending');
  if (pending.length === 0) {
    return { checked: false, indeterminate: false, hasPending: false };
  }

  const checkedCount = pending.filter(i => applyFlags[i.employeeId] === true).length;
  const all = checkedCount === pending.length;
  const some = checkedCount > 0;

  return {
    checked: all,
    indeterminate: !all && some,
    hasPending: true,
  };
}

/**
 * COMBO I FIX #2: Aplica/remove flag em TODOS os items pending.
 *
 * Items não-pending (already_applied, no_payment, etc.) NÃO são tocados —
 * preserva flags atuais ou ausência delas.
 *
 * @param items - Lista completa de preview items
 * @param applyFlags - Map atual
 * @param checked - true pra marcar todos pending, false pra desmarcar
 * @returns Novo map applyFlags com pending atualizados
 */
export function toggleAllPending(
  items: BankHoursPreviewItem[],
  applyFlags: Record<string, boolean>,
  checked: boolean
): Record<string, boolean> {
  const next = { ...applyFlags };
  for (const item of items) {
    if (item.status === 'pending') {
      next[item.employeeId] = checked;
    }
  }
  return next;
}
