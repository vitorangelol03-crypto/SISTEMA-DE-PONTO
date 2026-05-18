import type { SupabaseClient } from '@supabase/supabase-js';

export interface BonusSnapshot {
  paymentsBefore: Array<{
    id: string;
    employee_id: string;
    bonus_b: number;
    bonus: number;
    total: number;
  }>;
  realIds: string[];
  companyId: string;
  date: string;
}

/**
 * Snapshot dos payments REAIS antes de aplicar bônus em massa via UI.
 *
 * Necessário em specs que clicam "Aplicar B/C1/C2" no modal Bonificação:
 * a função `applyBonusToAllPresent` aplica em TODOS os funcionários presentes
 * da empresa — não diferencia PW Test de funcionário real. Sem snapshot,
 * REAIS ficam com bônus que o admin não aplicou.
 *
 * Incidente de referência: 2026-05-18 — 4 funcionários reais de Caratinga
 * (Pablo, Lara, Diendrel, Victor Angelo) ficaram com bonus_b=10 em prod
 * por causa do CI rodando spec 100 C2.
 *
 * Filtra como REAL: !name LIKE 'PW Test%' AND !name LIKE 'Demo PN%'
 * (cobre os 2 prefixos sintéticos usados no projeto).
 */
export async function snapshotRealPayments(
  s: SupabaseClient,
  companyId: string,
  date: string
): Promise<BonusSnapshot> {
  const { data: realEmpRows } = await s
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .not('name', 'ilike', 'PW Test%')
    .not('name', 'ilike', 'Demo PN%');
  const realIds = ((realEmpRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  const paymentsResult = realIds.length > 0
    ? await s.from('payments')
        .select('id, employee_id, bonus_b, bonus, total')
        .eq('date', date)
        .in('employee_id', realIds)
    : { data: [] };
  return {
    paymentsBefore: (paymentsResult.data ?? []) as BonusSnapshot['paymentsBefore'],
    realIds,
    companyId,
    date,
  };
}

/**
 * Reverte payments REAIS ao estado pré-snapshot + deleta a row em bonuses
 * criada pela aplicação em massa. Idempotente.
 */
export async function restoreRealPayments(
  s: SupabaseClient,
  snapshot: BonusSnapshot
): Promise<void> {
  const { paymentsBefore, realIds, companyId, date } = snapshot;
  const idsBefore = new Set(paymentsBefore.map((r) => r.id));

  // Restaura cada payment REAL ao estado original
  for (const row of paymentsBefore) {
    await s.from('payments').update({
      bonus_b: row.bonus_b,
      bonus: row.bonus,
      total: row.total,
    }).eq('id', row.id);
  }
  // Deleta payments NOVAS criadas pra REAIS pelo applyBonusToAllPresent
  if (realIds.length > 0 && idsBefore.size > 0) {
    await s.from('payments')
      .delete()
      .eq('date', date)
      .in('employee_id', realIds)
      .not('id', 'in', `(${Array.from(idsBefore).join(',')})`);
  } else if (realIds.length > 0) {
    await s.from('payments')
      .delete()
      .eq('date', date)
      .in('employee_id', realIds);
  }
  // Deleta a row em bonuses do dia (regra criada pelo "Aplicar B" em massa)
  await s.from('bonuses')
    .delete()
    .eq('date', date)
    .eq('company_id', companyId);
}
