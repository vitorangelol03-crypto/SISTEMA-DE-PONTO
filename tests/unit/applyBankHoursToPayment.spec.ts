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

  it('1. Lista vazia se empresa sem funcionários', async () => {
    setupSupabaseQueue({
      employees: [{ data: [], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items).toEqual([]);
  });

  it('2. Funcionário com saldo positivo: status=pending, valorAplicar=25', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [
        { data: [{ id: 'emp-1', name: 'Renata' }], error: null }, // batch list
        { data: fixtureEmployee(company), error: null },           // detail por employee
      ],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: paymentRow(), error: null }],
      attendance: [{ data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null }],
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
      employees: [
        { data: [{ id: 'emp-1', name: 'Renata' }], error: null },
        { data: fixtureEmployee(company), error: null },
      ],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: paymentRow({ bank_hours_applied_at: '2026-04-15T12:00:00Z' }), error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('already_applied');
    expect(items[0].appliedAt).toBe('2026-04-15T12:00:00Z');
  });

  it('4. Funcionário sem payment no período: status=no_payment', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [
        { data: [{ id: 'emp-1', name: 'Renata' }], error: null },
        { data: fixtureEmployee(company), error: null },
      ],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: null, error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('no_payment');
  });

  it('5. Funcionário com saldo zero: status=zero_balance, valorAplicar=0', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [
        { data: [{ id: 'emp-1', name: 'Renata' }], error: null },
        { data: fixtureEmployee(company), error: null },
      ],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [], error: null }],
      payments: [{ data: paymentRow(), error: null }],
      attendance: [{ data: [{ bank_credit_minutes: 0, bank_debit_minutes: 0 }], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('zero_balance');
    expect(items[0].valorAplicar).toBe(0);
    expect(items[0].saldoLabel).toBe('00:00');
  });

  it('6. Override OFF: status=override_skip', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [
        { data: [{ id: 'emp-1', name: 'Renata' }], error: null },
        { data: fixtureEmployee(company), error: null },
      ],
      payment_periods: [{ data: PERIOD, error: null }],
      bank_hours_overrides: [{ data: [{ apply_bank_hours: false, reason: 'férias' }], error: null }],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items[0].status).toBe('override_skip');
  });

  it('7. Empresa toggle OFF: TODOS funcionários com status=toggle_off', async () => {
    const company = fixtureCompany({ bank_hours_apply_in_payment: false });
    setupSupabaseQueue({
      employees: [
        { data: [{ id: 'emp-1', name: 'Renata' }, { id: 'emp-2', name: 'João' }], error: null },
        { data: fixtureEmployee(company, { id: 'emp-1', name: 'Renata' }), error: null },
        { data: fixtureEmployee(company, { id: 'emp-2', name: 'João' }), error: null },
      ],
      payment_periods: [
        { data: PERIOD, error: null },
        { data: PERIOD, error: null },
      ],
      bank_hours_overrides: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      payments: [
        { data: paymentRow(), error: null },
        { data: paymentRow(), error: null },
      ],
      attendance: [
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
        { data: [{ bank_credit_minutes: 60, bank_debit_minutes: 0 }], error: null },
      ],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe('toggle_off');
    expect(items[1].status).toBe('toggle_off');
  });

  it('8. Mix de status na mesma chamada (pending + already_applied + no_payment)', async () => {
    const company = fixtureCompany();
    setupSupabaseQueue({
      employees: [
        { data: [
          { id: 'emp-1', name: 'A' },
          { id: 'emp-2', name: 'B' },
          { id: 'emp-3', name: 'C' },
        ], error: null },
        { data: fixtureEmployee(company, { id: 'emp-1', name: 'A' }), error: null },
        { data: fixtureEmployee(company, { id: 'emp-2', name: 'B' }), error: null },
        { data: fixtureEmployee(company, { id: 'emp-3', name: 'C' }), error: null },
      ],
      payment_periods: [
        { data: PERIOD, error: null },
        { data: PERIOD, error: null },
        { data: PERIOD, error: null },
      ],
      bank_hours_overrides: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      payments: [
        { data: paymentRow(), error: null },                                                  // A
        { data: paymentRow({ bank_hours_applied_at: '2026-04-15T12:00:00Z' }), error: null }, // B
        { data: null, error: null },                                                          // C → no_payment
      ],
      attendance: [
        // só A consome attendance — B e C retornam earlier
        { data: [{ bank_credit_minutes: 120, bank_debit_minutes: 0 }], error: null },
      ],
    });
    const items = await previewBankHoursForPeriod(PREVIEW_ARGS);
    expect(items).toHaveLength(3);
    expect(items[0].status).toBe('pending');
    expect(items[1].status).toBe('already_applied');
    expect(items[2].status).toBe('no_payment');
  });
});
