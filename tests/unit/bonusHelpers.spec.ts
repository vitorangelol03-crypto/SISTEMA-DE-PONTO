/**
 * Testes unit para src/utils/bonusHelpers.ts
 *
 * Framework: vitest. Roda com: npx vitest run bonusHelpers
 *
 * Cobertura: 10 casos cobrindo a função `getBonusValueForType`, incluindo a
 * estratégia primária via `bonus_breakdown` JSONB (multi-empresa) e o
 * fallback legacy nas colunas `bonus_b/c1/c2`. Edge cases: breakdown
 * null/vazio, valores não-numéricos, valor zero no breakdown (idempotência),
 * códigos não-canônicos.
 */

import { describe, it, expect } from 'vitest';
import { getBonusValueForType } from '../../src/utils/bonusHelpers';
import type { Payment, BonusTypeRecord } from '../../src/services/database';

// Helpers de fixture — reduzem boilerplate dos testes. Override por caso.
function makePayment(overrides: Partial<Payment> & { bonus_breakdown?: Record<string, number> | null } = {}): Payment {
  return {
    id: 'pay-test',
    employee_id: 'emp-test',
    date: '2026-05-11',
    daily_rate: 100,
    bonus: 0,
    bonus_b: 0,
    bonus_c1: 0,
    bonus_c2: 0,
    total: 100,
    created_by: 'test',
    created_at: '2026-05-11T00:00:00Z',
    updated_at: '2026-05-11T00:00:00Z',
    ...overrides,
  } as Payment;
}

function makeBonusType(overrides: Partial<BonusTypeRecord> = {}): BonusTypeRecord {
  return {
    id: 'uuid-bonus-b',
    company_id: 'company-1',
    name: 'Bônus B',
    code: 'B',
    default_value: 10,
    order_index: 1,
    active: true,
    created_at: '2026-04-27T00:00:00Z',
    updated_at: '2026-04-27T00:00:00Z',
    ...overrides,
  };
}

describe('getBonusValueForType', () => {
  it('1. breakdown contém bonusType.id → retorna valor do breakdown (não usa legacy)', () => {
    const payment = makePayment({
      bonus_breakdown: { 'uuid-bonus-b': 50 },
      bonus_b: 999, // legacy ignorado quando breakdown tem o id
    });
    const bonusType = makeBonusType({ id: 'uuid-bonus-b', code: 'B' });
    expect(getBonusValueForType(payment, bonusType)).toBe(50);
  });

  it('2. sem breakdown, code=B → fallback retorna payment.bonus_b', () => {
    const payment = makePayment({ bonus_b: 10 });
    const bonusType = makeBonusType({ code: 'B' });
    expect(getBonusValueForType(payment, bonusType)).toBe(10);
  });

  it('3. sem breakdown, code=C1 → fallback retorna payment.bonus_c1', () => {
    const payment = makePayment({ bonus_c1: 20 });
    const bonusType = makeBonusType({ id: 'uuid-c1', code: 'C1' });
    expect(getBonusValueForType(payment, bonusType)).toBe(20);
  });

  it('4. sem breakdown, code=C2 → fallback retorna payment.bonus_c2', () => {
    const payment = makePayment({ bonus_c2: 30 });
    const bonusType = makeBonusType({ id: 'uuid-c2', code: 'C2' });
    expect(getBonusValueForType(payment, bonusType)).toBe(30);
  });

  it('5. sem breakdown, code não-canônico (ex: X) → retorna 0', () => {
    const payment = makePayment();
    const bonusType = makeBonusType({ id: 'uuid-x', code: 'X' });
    expect(getBonusValueForType(payment, bonusType)).toBe(0);
  });

  it('6. bonus_breakdown = null → cai em fallback legacy', () => {
    const payment = makePayment({ bonus_breakdown: null, bonus_b: 15 });
    const bonusType = makeBonusType({ code: 'B' });
    expect(getBonusValueForType(payment, bonusType)).toBe(15);
  });

  it('7. bonus_breakdown = {} (vazio) → cai em fallback legacy', () => {
    const payment = makePayment({ bonus_breakdown: {}, bonus_b: 25 });
    const bonusType = makeBonusType({ code: 'B' });
    expect(getBonusValueForType(payment, bonusType)).toBe(25);
  });

  it('8. breakdown contém id mas valor não-numérico (ex: string) → Number() retorna 0 ou NaN→0', () => {
    const payment = makePayment({
      bonus_breakdown: { 'uuid-bonus-b': 'abc' as unknown as number },
    });
    const bonusType = makeBonusType({ id: 'uuid-bonus-b' });
    expect(getBonusValueForType(payment, bonusType)).toBe(0);
  });

  it('9. breakdown contém id com valor 0 → retorna 0 (não cai pra fallback)', () => {
    const payment = makePayment({
      bonus_breakdown: { 'uuid-bonus-b': 0 },
      bonus_b: 999, // legacy ignorado: breakdown tem o id mesmo com valor 0
    });
    const bonusType = makeBonusType({ id: 'uuid-bonus-b' });
    expect(getBonusValueForType(payment, bonusType)).toBe(0);
  });

  it('10. legacy: bonus_b = null/0/NaN → retorna 0 sem throw', () => {
    const payment = makePayment({
      bonus_b: null as unknown as number,
    });
    const bonusType = makeBonusType({ code: 'B' });
    expect(getBonusValueForType(payment, bonusType)).toBe(0);
  });
});
