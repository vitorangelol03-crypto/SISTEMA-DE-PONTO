/**
 * Testes unit para applyBankHoursToPayment (combo G — sub-fase 2.17).
 *
 * Framework: vitest. Roda com: npx vitest run applyBankHoursToPayment
 *
 * Estratégia: mocka `src/lib/supabase` via vi.hoisted/vi.mock — substitui o
 * client por um chainable customizado por teste, configurado via fila FIFO
 * por tabela. Permite testar o fluxo da função sem hit no banco real.
 *
 * Cobertura: 19 casos cobrindo idempotência, override individual, todas as 3
 * ações de débito, fórmulas + período (month/accumulated/payment_period),
 * after_apply (zero_balance/keep_history) e edge cases (employee/period/payment
 * inexistentes, log insert falha).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted garante que `mockSupabase` exista antes do `vi.mock` factory
// rodar (mocks são içados pro topo do módulo pelo vitest).
const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() as unknown as ReturnType<typeof vi.fn> },
}));

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));

// IMPORT após o vi.mock — garante que a função real importe o cliente mockado.
import { applyBankHoursToPayment, previewBankHoursForPeriod } from '../../src/services/database';

// ─── Helpers de mock ──────────────────────────────────────────────────────

type SupabaseResponse = { data?: any; error?: any };

/**
 * Cria um query builder mockável: encadeável em select/eq/etc, terminal em
 * single/maybeSingle/await direto. Resolve com `response` em qualquer terminal.
 */
function chainable(response: SupabaseResponse) {
  const obj: any = {};
  const passthrough = () => obj;
  obj.select = vi.fn(passthrough);
  obj.insert = vi.fn(passthrough);
  obj.update = vi.fn(passthrough);
  obj.delete = vi.fn(passthrough);
  obj.eq = vi.fn(passthrough);
  obj.neq = vi.fn(passthrough);
  obj.in = vi.fn(passthrough);
  obj.gte = vi.fn(passthrough);
  obj.lte = vi.fn(passthrough);
  obj.gt = vi.fn(passthrough);
  obj.lt = vi.fn(passthrough);
  obj.order = vi.fn(passthrough);
  obj.limit = vi.fn(passthrough);
  obj.single = vi.fn(() => Promise.resolve(response));
  obj.maybeSingle = vi.fn(() => Promise.resolve(response));
  // Thenable: suporta `await query` sem terminal explícito.
  obj.then = (resolve: any, reject?: any) => Promise.resolve(response).then(resolve, reject);
  return obj;
}

/**
 * Configura `mockSupabase.from(table)` pra retornar a próxima resposta da
 * fila daquela tabela (FIFO). Útil pra distinguir SELECT vs UPDATE quando
 * a mesma tabela é tocada múltiplas vezes na mesma execução.
 */
function setupSupabaseQueue(queueByTable: Record<string, SupabaseResponse[]>) {
  const indices: Record<string, number> = {};
  const fromMock = vi.fn((table: string) => {
    const queue = queueByTable[table] ?? [];
    const idx = indices[table] ?? 0;
    indices[table] = idx + 1;
    const response = queue[idx] ?? { data: null, error: null };
    return chainable(response);
  });
  mockSupabase.from = fromMock as any;
  return fromMock;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

function fixtureCompany(overrides: Record<string, any> = {}) {
  return {
    id: 'comp-1',
    bank_hours_apply_in_payment: true,
    bank_hours_formula: 'daily_div_8',
    bank_hours_extra_multiplier: 1.5,
    bank_hours_custom_value: 0,
    bank_hours_credit_action: 'add_to_net',
    bank_hours_debit_action: 'subtract_from_net',
    bank_hours_period: 'payment_period',
    bank_hours_display: 'separate_line',
    bank_hours_after_apply: 'zero_balance',
    bank_hours_night_separate: false,
    bank_hours_night_multiplier: 1.2,
    ...overrides,
  };
}

function fixtureEmployee(company: any, overrides: Record<string, any> = {}) {
  return {
    id: 'emp-1',
    company_id: company.id,
    expected_schedule: [0, 480, 480, 480, 480, 480, 240],
    companies: company,
    ...overrides,
  };
}

const PERIOD = { id: 'period-1', start_date: '2026-04-01', end_date: '2026-04-15' };

function paymentRow(overrides: Record<string, any> = {}) {
  return {
    id: 'p1',
    daily_rate: 100,
    total: 1000,
    bank_hours_applied_at: null,
    ...overrides,
  };
}

const ARGS = {
  employeeId: 'emp-1',
  paymentPeriodId: 'period-1',
  supervisorId: 'sup-1',
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('applyBankHoursToPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. throw quando employeeId vazio', async () => {
    await expect(
      applyBankHoursToPayment({ ...ARGS, employeeId: '' }),
    ).rejects.toThrow();
  });

  it('2. employee_not_found quando employee não existe', async () => {
    setupSupabaseQueue({
      employees: [{ data: null, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('employee_not_found');
  });

  it('3. no_payment_in_period quando period_id não existe', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: null, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(false);
    expect(r.reason).toBe('no_payment_in_period');
  });

  it('4. toggle_off quando empresa OFF e sem override', async () => {
    const company = fixtureCompany({ bank_hours_apply_in_payment: false });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: paymentRow(), error: null }],
      attendance: [{ data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('toggle_off');
  });

  it('5. saldo zero → applied=true, amountNet=0 (idempotência marca applied_at)', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null }, // UPDATE
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 0, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null }, // UPDATE zero_balance
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(0);
    expect(r.paymentBefore).toBe(1000);
    expect(r.paymentAfter).toBe(1000);
  });

  it('6. crédito 2h dailyRate 100 (daily_div_8) → amountNet=25, payment +25, log criado', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(25);
    expect(r.result?.amountNet).toBe(25);
    expect(r.paymentBefore).toBe(1000);
    expect(r.paymentAfter).toBe(1025);
    expect(r.logId).toBe('log-1');
  });

  it('7. débito 1h dailyRate 100 → amountNet=-12.50, payment subtraído', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 0, bank_debit_minutes: 60 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountDebit).toBe(12.5);
    expect(r.result?.amountNet).toBe(-12.5);
    expect(r.paymentAfter).toBe(987.5);
  });

  it('8. payment.bank_hours_applied_at != null → already_applied', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow({ bank_hours_applied_at: '2026-04-15T12:00:00Z' }), error: null },
      ],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('already_applied');
  });

  it('9. override.apply_bank_hours=false e empresa ON → override_skip', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [{ apply_bank_hours: false, reason: 'férias' }], error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('override_skip');
  });

  it('10. override.apply_bank_hours=true força aplicação mesmo com empresa OFF', async () => {
    const company = fixtureCompany({ bank_hours_apply_in_payment: false });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [{ apply_bank_hours: true, reason: 'política excepcional' }], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(25);
  });

  it('11. forceOverride=true ignora override OFF (admin força)', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [{ apply_bank_hours: false, reason: 'antigo' }], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment({ ...ARGS, forceOverride: true });
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(25);
  });

  it('12. after_apply=zero_balance → attendance UPDATE chamado (2 calls: SELECT + UPDATE)', async () => {
    const company = fixtureCompany({ bank_hours_after_apply: 'zero_balance' });
    const fromMock = setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    await applyBankHoursToPayment(ARGS);
    const attCalls = fromMock.mock.calls.filter((c) => c[0] === 'attendance');
    expect(attCalls.length).toBe(2);
  });

  it('13. after_apply=keep_history → attendance só SELECT (sem UPDATE)', async () => {
    const company = fixtureCompany({ bank_hours_after_apply: 'keep_history' });
    const fromMock = setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [{ data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null }],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    await applyBankHoursToPayment(ARGS);
    const attCalls = fromMock.mock.calls.filter((c) => c[0] === 'attendance');
    expect(attCalls.length).toBe(1);
  });

  it('14. credit_action=no_apply zera amountCredit (mas applied=true)', async () => {
    const company = fixtureCompany({ bank_hours_credit_action: 'no_apply' });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(0);
    expect(r.result?.amountNet).toBe(0);
  });

  it('15. debit_action=warn_only zera amountDebit + reason warn_only_no_subtract', async () => {
    const company = fixtureCompany({ bank_hours_debit_action: 'warn_only' });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 0, bank_debit_minutes: 60 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountDebit).toBe(0);
    expect(r.result?.reason).toBe('warn_only_no_subtract');
  });

  it('16. period=month expande range pra mês inteiro (aplica e sucede)', async () => {
    const company = fixtureCompany({ bank_hours_period: 'month' });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: { id: 'period-1', start_date: '2026-04-10', end_date: '2026-04-20' }, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(25);
  });

  it('17. period=accumulated expande range pra epoch (aplica e sucede)', async () => {
    const company = fixtureCompany({ bank_hours_period: 'accumulated' });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(25);
  });

  it('18. 0 payments no período → no_payment_in_period', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: null, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(false);
    expect(r.reason).toBe('no_payment_in_period');
  });

  it('19. log insert falha NÃO rollbacka payment update (estado: aplicado, log ausente)', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: null, error: { message: 'log insert failed' } }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.logId).toBeUndefined();
    expect(r.paymentAfter).toBe(1025);
  });
});

describe('previewBankHoursForPeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const PREVIEW_ARGS = { companyId: 'comp-1', paymentPeriodId: 'period-1' };

  // Sub-fase 8.1 (TECH_DEBT 6.7): previewBankHoursForPeriod refatorado de
  // N+1 (5×N queries em loop) pra batch (6 queries fixas). Os mocks abaixo
  // refletem o novo flow:
  //   Batch 1: companies + payment_periods (Promise.all)
  //   Batch 2: employees + bank_hours_overrides (Promise.all)
  //   Batch 3: payments + attendance (Promise.all, WHERE employee_id IN(...))
  // Cada tabela mockada uma vez só (1 entry na fila), independente de N.

  it('1. Lista vazia se empresa sem funcionários', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [], error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items).toEqual([]);
  });

  it('2. Funcionário com saldo positivo: status=pending, valorAplicar=25', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [{ id: 'emp-1', name: 'Renata', expected_schedule: [0, 480, 480, 480, 480, 480, 240] }], error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: [{ ...paymentRow(), employee_id: 'emp-1' }], error: null }],
      attendance: [{ data: [{ employee_id: 'emp-1', bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('pending');
    expect(items[0].valorAplicar).toBe(25);
    expect(items[0].employeeName).toBe('Renata');
    expect(items[0].saldoLabel).toBe('+02:00');
    expect(items[0].liquidoAntes).toBe(1000);
    expect(items[0].liquidoDepois).toBe(1025);
  });

  it('3. Funcionário já aplicado: status=already_applied, appliedAt definido', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [{ id: 'emp-1', name: 'Renata', expected_schedule: [0, 480, 480, 480, 480, 480, 240] }], error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: [{ ...paymentRow({ bank_hours_applied_at: '2026-04-15T12:00:00Z' }), employee_id: 'emp-1' }], error: null }],
      attendance: [{ data: [], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('already_applied');
    expect(items[0].appliedAt).toBe('2026-04-15T12:00:00Z');
  });

  it('4. Funcionário sem payment no período: status=no_payment', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [{ id: 'emp-1', name: 'Renata', expected_schedule: [0, 480, 480, 480, 480, 480, 240] }], error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: [], error: null }],
      attendance: [{ data: [], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('no_payment');
  });

  it('5. Funcionário com saldo zero: status=zero_balance, valorAplicar=0', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [{ id: 'emp-1', name: 'Renata', expected_schedule: [0, 480, 480, 480, 480, 480, 240] }], error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: [{ ...paymentRow(), employee_id: 'emp-1' }], error: null }],
      attendance: [{ data: [{ employee_id: 'emp-1', bank_credit_minutes: 0, bank_debit_minutes: 0 }], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('zero_balance');
    expect(items[0].valorAplicar).toBe(0);
    expect(items[0].saldoLabel).toBe('00:00');
  });

  it('6. Override OFF: status=override_skip', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [{ id: 'emp-1', name: 'Renata', expected_schedule: [0, 480, 480, 480, 480, 480, 240] }], error: null }],
      bank_hours_overrides: [{ data: [{ employee_id: 'emp-1', apply_bank_hours: false, created_at: '2026-04-10T00:00:00Z' }], error: null }],
      payments: [{ data: [{ ...paymentRow(), employee_id: 'emp-1' }], error: null }],
      attendance: [{ data: [], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('override_skip');
  });

  it('7. Empresa toggle OFF: TODOS funcionários com status=toggle_off', async () => {
    const company = fixtureCompany({ bank_hours_apply_in_payment: false });
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [
        { id: 'emp-1', name: 'Renata', expected_schedule: [0, 480, 480, 480, 480, 480, 240] },
        { id: 'emp-2', name: 'João', expected_schedule: [0, 480, 480, 480, 480, 480, 240] },
      ], error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: [
        { ...paymentRow(), employee_id: 'emp-1' },
        { ...paymentRow(), employee_id: 'emp-2' },
      ], error: null }],
      attendance: [{ data: [
        { employee_id: 'emp-1', bank_credit_minutes: 120, bank_debit_minutes: 0 },
        { employee_id: 'emp-2', bank_credit_minutes: 60, bank_debit_minutes: 0 },
      ], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe('toggle_off');
    expect(items[1].status).toBe('toggle_off');
  });

  it('8. Mix de status na mesma chamada (pending + already_applied + no_payment)', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      companies: [{ data: company, error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      employees: [{ data: [
        { id: 'emp-1', name: 'A', expected_schedule: [0, 480, 480, 480, 480, 480, 240] },
        { id: 'emp-2', name: 'B', expected_schedule: [0, 480, 480, 480, 480, 480, 240] },
        { id: 'emp-3', name: 'C', expected_schedule: [0, 480, 480, 480, 480, 480, 240] },
      ], error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: [
        { ...paymentRow(), employee_id: 'emp-1' },                                                  // A → pending
        { ...paymentRow({ bank_hours_applied_at: '2026-04-15T12:00:00Z' }), employee_id: 'emp-2' }, // B → already_applied
        // emp-3 sem payment → no_payment (não vem na resposta)
      ], error: null }],
      attendance: [{ data: [
        { employee_id: 'emp-1', bank_credit_minutes: 120, bank_debit_minutes: 0 },
        // emp-2 e emp-3 sem attendance — irrelevante porque retornam earlier (already_applied / no_payment)
      ], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items).toHaveLength(3);
    expect(items[0].status).toBe('pending');
    expect(items[1].status).toBe('already_applied');
    expect(items[2].status).toBe('no_payment');
  });
});

// ─── Edge cases extremos — Combo I (sub-fase 2.21+2.22) ───────────────────
//
// 11 testes que cobrem cenários patológicos / extremos / robustez:
// - Saldos extremos (1min, 50h, débito gigante)
// - Idempotência (10x consecutivos)
// - forceOverride / override ON
// - after_apply variantes side-by-side
// - Caso sem payment no período

describe('Edge cases extremos - Combo I', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // === GRUPO A: Saldos extremos ===

  it('1. Débito de 10h dailyRate=100 → amountNet=-125 (movido do E2E)', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null }, // UPDATE
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 0, bank_debit_minutes: 600 }], error: null }, // 10h débito
        { data: null, error: null }, // UPDATE (zero_balance)
      ],
      bank_hours_application_log: [{ data: { id: 'log-edge-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(0);
    expect(r.result?.amountDebit).toBe(125); // (600/60) × 12.50 = 125 (positivo absoluto)
    expect(r.result?.amountNet).toBe(-125);
    expect(r.paymentBefore).toBe(1000);
    expect(r.paymentAfter).toBe(875); // 1000 - 125
  });

  it('2. Saldo de 1 hora exata (60min) dailyRate=100 → amountNet=12.50', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 60, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-edge-2' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.result?.amountCredit).toBe(12.5); // (60/60) × 12.50
    expect(r.result?.amountNet).toBe(12.5);
  });

  it('3. Saldo de 1 minuto (1/60h) dailyRate=100 → arredondamento 0.21', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 1, bank_debit_minutes: 0 }], error: null }, // 1 minuto
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-edge-3' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    // 1min × 12.50/60 = 0.20833... → round2 = 0.21
    expect(r.result?.amountCredit).toBe(0.21);
    expect(r.applied).toBe(true);
  });

  it('4. Crédito gigante (50h = 3000min) dailyRate=100 → amountNet=625.00', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 3000, bank_debit_minutes: 0 }], error: null }, // 50h
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-edge-4' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.result?.amountCredit).toBe(625); // 50h × 12.50
    expect(r.result?.amountNet).toBe(625);
    expect(r.paymentAfter).toBe(1625); // 1000 + 625
  });

  // === GRUPO B: Idempotência / overrides ===

  it('5. forceOverride=true sobrepõe override OFF (admin força aplicação)', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      // Override OFF presente
      bank_hours_overrides: [{ data: [{ apply_bank_hours: false, reason: 'antigo' }], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-edge-5' }, error: null }],
    });
    // forceOverride=true: ignora o override OFF
    const r = await applyBankHoursToPayment({ ...ARGS, forceOverride: true });
    expect(r.applied).toBe(true);
    expect(r.skipped).toBe(false);
    expect(r.result?.amountNet).toBe(25);
  });

  it('6. Override ON com forceOverride=false default: aplica mesmo com toggle empresa OFF', async () => {
    // Empresa toggle OFF — mas override.apply_bank_hours=true força ON
    const company = fixtureCompany({ bank_hours_apply_in_payment: false });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [{ apply_bank_hours: true, reason: 'política excepcional' }], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-edge-6' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS); // forceOverride não passado (default false)
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(25);
  });

  // === GRUPO C: after_apply variantes ===

  it('7. after_apply=keep_history: log e payment ok, attendance NÃO é zerada', async () => {
    const company = fixtureCompany({ bank_hours_after_apply: 'keep_history' });
    const fromMock = setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      // SÓ 1 entry pra attendance — keep_history NÃO chama UPDATE
      attendance: [{ data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null }],
      bank_hours_application_log: [{ data: { id: 'log-edge-7' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(25);
    // Attendance só foi chamado 1x (SELECT) — não houve UPDATE
    const attendanceCalls = fromMock.mock.calls.filter((c) => c[0] === 'attendance');
    expect(attendanceCalls.length).toBe(1);
  });

  it('8. Side-by-side: zero_balance vs keep_history → MESMO cálculo, DIFERENTE side-effect', async () => {
    // Run 1: zero_balance
    const companyZB = fixtureCompany({ bank_hours_after_apply: 'zero_balance' });
    const fromMockZB = setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(companyZB), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null }, // UPDATE pra zerar
      ],
      bank_hours_application_log: [{ data: { id: 'log-zb' }, error: null }],
    });
    const rZB = await applyBankHoursToPayment(ARGS);

    // Run 2: keep_history
    const companyKH = fixtureCompany({ bank_hours_after_apply: 'keep_history' });
    const fromMockKH = setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(companyKH), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [{ data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null }],
      bank_hours_application_log: [{ data: { id: 'log-kh' }, error: null }],
    });
    const rKH = await applyBankHoursToPayment(ARGS);

    // Mesmo cálculo: ambos resultados financeiros idênticos
    expect(rZB.result?.amountNet).toBe(rKH.result?.amountNet);
    expect(rZB.paymentBefore).toBe(rKH.paymentBefore);
    expect(rZB.paymentAfter).toBe(rKH.paymentAfter);
    expect(rZB.applied).toBe(true);
    expect(rKH.applied).toBe(true);

    // Diferença ÚNICA: zero_balance chama attendance.update (2 calls); keep_history não (1 call)
    const zbAttCalls = fromMockZB.mock.calls.filter((c) => c[0] === 'attendance').length;
    const khAttCalls = fromMockKH.mock.calls.filter((c) => c[0] === 'attendance').length;
    expect(zbAttCalls).toBe(2); // SELECT + UPDATE
    expect(khAttCalls).toBe(1); // só SELECT
  });

  // === GRUPO D: Robustez ===

  it('9. 10x consecutivos no mesmo período: 1ª aplica, 9 retornam already_applied', async () => {
    let appliedCount = 0;
    let alreadyAppliedCount = 0;

    for (let i = 0; i < 10; i++) {
      const company = fixtureCompany();
      // 1ª iteração: payment limpo. 2ª-10ª: payment já com applied_at.
      const paymentData = i === 0
        ? paymentRow()
        : paymentRow({ bank_hours_applied_at: '2026-04-15T12:00:00Z' });
      setupSupabaseQueue({
        employees: [{ data: fixtureEmployee(company), error: null }],
        payment_periods: [{ data: PERIOD, error: null }],
        bank_hours_overrides: [{ data: [], error: null }],
        payments: i === 0
          ? [{ data: paymentData, error: null }, { data: null, error: null }]
          : [{ data: paymentData, error: null }], // só SELECT, não chega no UPDATE
        attendance: i === 0
          ? [
              { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
              { data: null, error: null },
            ]
          : [],
        bank_hours_application_log: i === 0 ? [{ data: { id: `log-9-${i}` }, error: null }] : [],
      });
      const r = await applyBankHoursToPayment(ARGS);
      if (r.applied) appliedCount++;
      if (r.reason === 'already_applied') alreadyAppliedCount++;
    }
    expect(appliedCount).toBe(1);
    expect(alreadyAppliedCount).toBe(9);
  });

  it('10. Saldo positivo de 0.01h (1 minuto): cálculo arredonda + payment correto', async () => {
    // Mesmo input do teste 3 — aqui validamos o EFEITO no payment, não só amountCredit
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 1, bank_debit_minutes: 0 }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-edge-10' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountNet).toBe(0.21);
    // payment vai de 1000 → 1000.21
    expect(r.paymentAfter).toBe(1000.21);
  });

  it('11. Mês sem nenhum payment: reason=no_payment_in_period (sem UPDATE/INSERT)', async () => {
    const company = fixtureCompany();
    const fromMock = setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: null, error: null }], // SELECT vazio
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.success).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('no_payment_in_period');
    // Nenhum INSERT no log e nenhum UPDATE em payment
    const logCalls = fromMock.mock.calls.filter((c) => c[0] === 'bank_hours_application_log').length;
    expect(logCalls).toBe(0);
    // payments só foi chamado 1x (SELECT que retornou vazio)
    const paymentsCalls = fromMock.mock.calls.filter((c) => c[0] === 'payments').length;
    expect(paymentsCalls).toBe(1);
  });
});

// Sub-fase 8.3 (TECH_DEBT 6.6, D1=C "diurno primeiro"): valida algoritmo de
// derivação de nightCreditMinutes a partir de attendances reais. 4 cenários
// cobrindo todas as ramificações da fórmula:
//   daytime_extra = max(0, daytime - expected)
//   nightCreditDay = max(0, credit - daytime_extra)
//
// Testa via comportamento end-to-end: company.bank_hours_night_separate=true
// + multiplier=1.5 → amountCredit varia conforme split day/night.
describe('Sub-fase 8.3 — nightCreditMinutes derivação (D1=C diurno primeiro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // dailyRate=100, formula=daily_div_8 → hora=12.50.
  // night_separate=true, multiplier=1.5 → night vale 12.50 × 1.5 = 18.75 R$/h.
  const NIGHT_COMPANY = () => fixtureCompany({
    bank_hours_night_separate: true,
    bank_hours_night_multiplier: 1.5,
  });

  it('1. Caso turno noturno típico CD Logística: night=179, day=307, exp=240, credit=246 → night_credit=179 (preenche 67 do daytime_extra primeiro)', async () => {
    // Sample REAL de Caratinga (validado via SQL em 2026-05-11).
    // daytime_extra = max(0, 307-240) = 67
    // night_credit = max(0, 246-67) = 179
    // day_credit = 246 - 179 = 67
    // amountCredit = (67/60 × 12.50) + (179/60 × 12.50 × 1.5)
    //             = 13.96 + 55.94 = 69.90 (aproximado)
    const company = NIGHT_COMPANY();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{
          bank_credit_minutes: 246,
          bank_debit_minutes: 0,
          daytime_minutes: 307,
          nighttime_minutes: 179,
          expected_minutes: 240,
        }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-night-1' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    // Day: 67min × 12.50/60 = 13.95833 → 13.96
    // Night: 179min × 12.50 × 1.5 / 60 = 55.9375 → 55.94
    // Total: 69.90
    expect(r.result?.amountCredit).toBeCloseTo(69.90, 1);
  });

  it('2. Caso 100% diurno (todo daytime, zero nighttime): toda credit fica day, night_credit=0', async () => {
    // daytime=600 (10h), nighttime=0, expected=480 (8h), credit=120 (2h extras)
    // daytime_extra = 600-480 = 120
    // night_credit = max(0, 120-120) = 0
    // amountCredit = 120/60 × 12.50 = 25.00 (sem multiplier noturno)
    const company = NIGHT_COMPANY();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{
          bank_credit_minutes: 120,
          bank_debit_minutes: 0,
          daytime_minutes: 600,
          nighttime_minutes: 0,
          expected_minutes: 480,
        }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-night-2' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(25);
  });

  it('3. Caso 100% noturno (todo nighttime, zero daytime): toda credit fica night → multiplier aplicado', async () => {
    // daytime=0, nighttime=540 (9h), expected=480 (8h), credit=60 (1h extra)
    // daytime_extra = max(0, 0-480) = 0
    // night_credit = max(0, 60-0) = 60
    // amountCredit = 60/60 × 12.50 × 1.5 = 18.75 (multiplier 1.5)
    const company = NIGHT_COMPANY();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{
          bank_credit_minutes: 60,
          bank_debit_minutes: 0,
          daytime_minutes: 0,
          nighttime_minutes: 540,
          expected_minutes: 480,
        }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-night-3' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(18.75);
  });

  it('4. Caso daytime < expected (turno cumprido com mistura): credit total vira night_credit', async () => {
    // daytime=240, nighttime=300, expected=480, credit=60
    // daytime_extra = max(0, 240-480) = 0 (daytime nem cobriu expected!)
    // night_credit = max(0, 60-0) = 60 (todo credit veio do noturno)
    // amountCredit = 60/60 × 12.50 × 1.5 = 18.75
    const company = NIGHT_COMPANY();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{
          bank_credit_minutes: 60,
          bank_debit_minutes: 0,
          daytime_minutes: 240,
          nighttime_minutes: 300,
          expected_minutes: 480,
        }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-night-4' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(18.75);
  });

  it('5. Multiplas attendances mistas: night_credit somado por dia (não agregado)', async () => {
    // Dia 1: daytime=600, night=0, expected=480, credit=120 → day_extra=120, night_credit=0
    // Dia 2: daytime=0, night=540, expected=480, credit=60 → day_extra=0, night_credit=60
    // Total credit = 180 (120 day + 60 night).
    // day_credit = 120, night_credit = 60.
    // amountCredit = (120/60 × 12.50) + (60/60 × 12.50 × 1.5) = 25 + 18.75 = 43.75
    const company = NIGHT_COMPANY();
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [
          { bank_credit_minutes: 120, bank_debit_minutes: 0, daytime_minutes: 600, nighttime_minutes: 0, expected_minutes: 480 },
          { bank_credit_minutes: 60, bank_debit_minutes: 0, daytime_minutes: 0, nighttime_minutes: 540, expected_minutes: 480 },
        ], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-night-5' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(43.75);
  });

  it('6. night_separate=false: nightCreditMinutes calculado mas IGNORADO pelo calculator', async () => {
    // mesmo cenário do #3 mas night_separate=false.
    // applyBankHours ignora night → multiplier=1 sempre.
    // amountCredit = 60/60 × 12.50 = 12.50 (sem multiplier)
    const company = fixtureCompany({ bank_hours_night_separate: false });
    setupSupabaseQueue({
      employees: [{ data: fixtureEmployee(company), error: null }],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [
        { data: paymentRow(), error: null },
        { data: null, error: null },
      ],
      attendance: [
        { data: [{
          bank_credit_minutes: 60, bank_debit_minutes: 0,
          daytime_minutes: 0, nighttime_minutes: 540, expected_minutes: 480,
        }], error: null },
        { data: null, error: null },
      ],
      bank_hours_application_log: [{ data: { id: 'log-night-6' }, error: null }],
    });
    const r = await applyBankHoursToPayment(ARGS);
    expect(r.applied).toBe(true);
    expect(r.result?.amountCredit).toBe(12.5);
  });
});
