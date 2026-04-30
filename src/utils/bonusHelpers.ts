import type { Payment, BonusTypeRecord } from '../services/database';

// O JSONB `bonus_breakdown` mapeia bonus_type_id (uuid) → valor aplicado.
// Não está no tipo Payment (database.ts) por compat — usamos extensão local.
type PaymentWithBreakdown = Payment & {
  bonus_breakdown?: Record<string, number> | null;
};

/**
 * Retorna o valor de um tipo de bônus para um payment.
 * Estratégia:
 *  1) bonus_breakdown[bonusType.id] — fonte primária (multi-empresa, JSONB).
 *  2) Fallback nas colunas legacy bonus_b/c1/c2 quando o code corresponder.
 *  3) Zero, caso contrário.
 */
export function getBonusValueForType(
  payment: Payment,
  bonusType: BonusTypeRecord,
): number {
  const breakdown = (payment as PaymentWithBreakdown).bonus_breakdown;
  if (breakdown && typeof breakdown === 'object' && bonusType.id in breakdown) {
    return Number(breakdown[bonusType.id]) || 0;
  }
  if (bonusType.code === 'B') return Number(payment.bonus_b) || 0;
  if (bonusType.code === 'C1') return Number(payment.bonus_c1) || 0;
  if (bonusType.code === 'C2') return Number(payment.bonus_c2) || 0;
  return 0;
}
