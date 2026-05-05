import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Módulo 29 — Combo I: integridade financeira E2E do banco de horas (sub-fase 2.21+2.22).
 *
 * 3 testes essenciais que SÓ E2E pode validar:
 *  1. Apply real: payment.bank_hours_amount, log com snapshot, attendance zerado
 *  2. Idempotência via UI: linha aparece "já aplicado" e checkbox disabled
 *  3. Override com motivo: bloqueia aplicação + persiste em bank_hours_overrides
 *
 * Cenários só-matemática (saldo zero, débito grande, after_apply variantes,
 * credit/debit_action variantes) ficam em vitest com mocks — cobrem a mesma
 * lógica via helper compartilhado `_previewBankHoursForEmployee`.
 *
 * Setup robusto: snapshot/restore da config Caratinga, employee+period+
 * attendance+payments criados em beforeAll, cleanup completo em afterAll
 * com try/catch em cada DELETE pra não vazar dados em caso de falha.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const NAME_PREFIX = 'PW Test I ';

interface CompanyBankHoursSnapshot {
  bank_hours_enabled: boolean | null;
  bank_hours_apply_in_payment: boolean | null;
  bank_hours_formula: string | null;
  bank_hours_extra_multiplier: number | null;
  bank_hours_custom_value: number | null;
  bank_hours_credit_action: string | null;
  bank_hours_debit_action: string | null;
  bank_hours_period: string | null;
  bank_hours_display: string | null;
  bank_hours_after_apply: string | null;
  bank_hours_night_separate: boolean | null;
  bank_hours_night_multiplier: number | null;
}

let originalConfig: CompanyBankHoursSnapshot | null = null;
let testEmployeeId: string | null = null;
let testEmployeeCpf: string | null = null;
let testPaymentPeriodId: string | null = null;
let period2Id: string | null = null;
// COMBO I FIX #1 — testes 4 e 5: períodos e employees auxiliares
let period3Id: string | null = null;       // teste 4 (override-only)
let period4Id: string | null = null;       // teste 5 (mix flow)
let testEmployeeId2: string | null = null; // teste 5 (segundo funcionário)
let testEmployeeId3: string | null = null; // teste 5 (terceiro funcionário)

// ─── CPF generator (algoritmo Mod 11 — DV calculado) ──────────────────────

function generateValidCPF(base9: string): string {
  const digits = base9.replace(/\D/g, '').padStart(9, '0').slice(0, 9);
  const arr = digits.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += arr[i]! * (10 - i);
  let dv1 = (sum * 10) % 11;
  if (dv1 === 10) dv1 = 0;
  arr.push(dv1);
  sum = 0;
  for (let i = 0; i < 10; i++) sum += arr[i]! * (11 - i);
  let dv2 = (sum * 10) % 11;
  if (dv2 === 10) dv2 = 0;
  arr.push(dv2);
  return arr.join('');
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Combo I — Integridade financeira E2E', () => {
  test.beforeAll(async () => {
    const s = getClient();

    // 1. Snapshot config atual da Caratinga
    const { data: snap, error: snapErr } = await s
      .from('companies')
      .select(
        'bank_hours_enabled, bank_hours_apply_in_payment, bank_hours_formula, ' +
        'bank_hours_extra_multiplier, bank_hours_custom_value, ' +
        'bank_hours_credit_action, bank_hours_debit_action, ' +
        'bank_hours_period, bank_hours_display, bank_hours_after_apply, ' +
        'bank_hours_night_separate, bank_hours_night_multiplier',
      )
      .eq('id', CARATINGA_ID)
      .single();
    if (snapErr) throw snapErr;
    originalConfig = snap as CompanyBankHoursSnapshot;

    // 2. Configurar Caratinga pro teste
    await s.from('companies').update({
      bank_hours_enabled: true,
      bank_hours_apply_in_payment: true,
      bank_hours_formula: 'daily_div_8',
      bank_hours_credit_action: 'add_to_net',
      bank_hours_debit_action: 'subtract_from_net',
      bank_hours_period: 'payment_period',
      bank_hours_after_apply: 'zero_balance',
      bank_hours_night_separate: false,
    }).eq('id', CARATINGA_ID);

    // 3. Criar funcionário de teste
    testEmployeeCpf = generateValidCPF(`${Date.now()}`.slice(-9));
    const empName = `${NAME_PREFIX}Integrity`;
    const { data: empRow, error: empErr } = await s
      .from('employees')
      .insert({
        name: empName,
        cpf: testEmployeeCpf,
        company_id: CARATINGA_ID,
        created_by: '9999',
        employment_type: 'CLT',
        expected_schedule: [0, 480, 480, 480, 480, 480, 240],
      })
      .select('id')
      .single();
    if (empErr) throw empErr;
    testEmployeeId = (empRow as { id: string }).id;

    // 4. Criar payment_period (01/04 a 15/04 — primeira quinzena de abril 2026)
    const { data: ppRow, error: ppErr } = await s
      .from('payment_periods')
      .insert({
        start_date: '2026-04-01',
        end_date: '2026-04-15',
        payment_date: '2026-04-20',
        label: `${NAME_PREFIX}Period1`,
        company_id: CARATINGA_ID,
        created_by: '9999',
      })
      .select('id')
      .single();
    if (ppErr) throw ppErr;
    testPaymentPeriodId = (ppRow as { id: string }).id;

    // 5. Criar 5 attendances (dias 01 a 05) com bank_credit=24min cada (total 120min=2h)
    const attDates = ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'];
    for (const date of attDates) {
      await s.from('attendance').insert({
        employee_id: testEmployeeId,
        date,
        status: 'present',
        marked_by: '9999',
        company_id: CARATINGA_ID,
        bank_credit_minutes: 24,
        bank_debit_minutes: 0,
      });
    }

    // 6. Criar 5 payments (1 por dia) — daily_rate=100, total=100, NÃO aplicado
    for (const date of attDates) {
      await s.from('payments').insert({
        employee_id: testEmployeeId,
        date,
        daily_rate: 100,
        bonus: 0,
        total: 100,
        company_id: CARATINGA_ID,
        created_by: '9999',
      });
    }
  });

  test.afterAll(async () => {
    const s = getClient();

    // Cleanup robusto — try/catch em cada DELETE pra não vazar dados em falha parcial.
    const safeDelete = async (fn: () => Promise<unknown>, label: string) => {
      try { await fn(); } catch (err) {
        console.error(`[afterAll cleanup ${label}]`, err);
      }
    };

    // Helper local: cleanup completo dos artefatos por employee_id.
    const cleanupEmployee = async (id: string, label: string) => {
      await safeDelete(() => s.from('bank_hours_application_log').delete().eq('employee_id', id), `logs-${label}`);
      await safeDelete(() => s.from('bank_hours_overrides').delete().eq('employee_id', id), `overrides-${label}`);
      await safeDelete(() => s.from('payments').delete().eq('employee_id', id), `payments-${label}`);
      await safeDelete(() => s.from('attendance').delete().eq('employee_id', id), `attendance-${label}`);
      await safeDelete(() => s.from('employees').delete().eq('id', id), `employee-${label}`);
    };

    if (testEmployeeId) await cleanupEmployee(testEmployeeId, 'emp1');
    if (testEmployeeId2) await cleanupEmployee(testEmployeeId2, 'emp2');
    if (testEmployeeId3) await cleanupEmployee(testEmployeeId3, 'emp3');

    if (testPaymentPeriodId) {
      await safeDelete(
        () => s.from('payment_periods').delete().eq('id', testPaymentPeriodId!),
        'period1',
      );
    }
    if (period2Id) {
      await safeDelete(
        () => s.from('payment_periods').delete().eq('id', period2Id!),
        'period2',
      );
    }
    if (period3Id) {
      await safeDelete(
        () => s.from('payment_periods').delete().eq('id', period3Id!),
        'period3',
      );
    }
    if (period4Id) {
      await safeDelete(
        () => s.from('payment_periods').delete().eq('id', period4Id!),
        'period4',
      );
    }
    if (originalConfig) {
      await safeDelete(
        () => s.from('companies').update(originalConfig!).eq('id', CARATINGA_ID),
        'restore-config',
      );
    }
  });

  // ============================================
  // TESTE 1: Apply E2E real
  // ============================================
  test('1. Apply E2E real: payment.bank_hours_amount + log + attendance zerado', async ({ page }) => {
    expect(testEmployeeId).toBeTruthy();
    expect(testPaymentPeriodId).toBeTruthy();
    const s = getClient();

    // Estado inicial: 0 logs, attendance bank_credit=24 cada
    const { data: logsBefore } = await s
      .from('bank_hours_application_log')
      .select('id')
      .eq('employee_id', testEmployeeId!);
    expect(logsBefore?.length ?? 0).toBe(0);

    // ─── Fluxo UI ─────────────────────────────────────────────────────────
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    // Seleciona o period de teste no dropdown
    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(testPaymentPeriodId!);

    // Clicar botão "Aplicar banco de horas"
    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10_000 });
    await applyBtn.click();

    // Tabela do modal — escopo via colunas únicas ("Aplicar" só existe lá).
    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();

    // Aguarda preview terminar (N+1 com 30+ funcionários da Caratinga pode demorar).
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    // Tabela populada — funcionário de teste presente
    const employeeRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Integrity` }).first();
    await expect(employeeRow).toBeVisible({ timeout: 15_000 });

    // Submit — botão deve mostrar "Aplicar selecionados (N)" com N>=1 (testEmployee marcado por default).
    // Texto "Aplicar selecionados" só existe no modal.
    const submitBtn = page.getByRole('button', { name: /Aplicar selecionados \([1-9]\d*\)/ });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();

    // Aguarda aplicação concluir: o modal fecha após onApplied() chamar setShowApplyModal(false).
    // Tabela do modal sumir é o sinal canônico de que o loop sequencial terminou.
    await expect(modalTable).not.toBeVisible({ timeout: 60_000 });

    // ─── Verificações via Supabase ────────────────────────────────────────

    // a) Payment-âncora (último do período: 2026-04-05) tem aplicação
    const { data: anchorPayment } = await s
      .from('payments')
      .select('date, bank_hours_amount, bank_hours_minutes, bank_hours_applied_at, total')
      .eq('employee_id', testEmployeeId!)
      .order('date', { ascending: false })
      .limit(1)
      .single();
    expect(anchorPayment).toBeTruthy();
    expect(Number(anchorPayment!.bank_hours_amount)).toBe(25);
    expect(anchorPayment!.bank_hours_minutes).toBe(120);
    expect(anchorPayment!.bank_hours_applied_at).not.toBeNull();
    expect(Number(anchorPayment!.total)).toBe(125); // 100 + 25

    // b) Outros 4 payments do período NÃO foram tocados
    const { data: otherPayments } = await s
      .from('payments')
      .select('date, bank_hours_amount, bank_hours_applied_at, total')
      .eq('employee_id', testEmployeeId!)
      .neq('date', anchorPayment!.date);
    expect(otherPayments?.length).toBe(4);
    for (const p of otherPayments ?? []) {
      expect(Number(p.bank_hours_amount ?? 0)).toBe(0);
      expect(p.bank_hours_applied_at).toBeNull();
      expect(Number(p.total)).toBe(100);
    }

    // c) Log criado com snapshot completo
    const { data: logRows } = await s
      .from('bank_hours_application_log')
      .select('*')
      .eq('employee_id', testEmployeeId!);
    expect(logRows?.length).toBe(1);
    const log = logRows![0]!;
    expect(Number(log.amount_credit)).toBe(25);
    expect(Number(log.amount_debit)).toBe(0);
    expect(Number(log.amount_net)).toBe(25);
    expect(log.bank_credit_minutes).toBe(120);
    expect(log.bank_debit_minutes).toBe(0);
    expect(log.net_balance_minutes).toBe(120);
    expect(log.formula_used).toBe('daily_div_8');
    expect(Number(log.hour_value_used)).toBe(12.5);
    expect(Number(log.payment_total_before)).toBe(100);
    expect(Number(log.payment_total_after)).toBe(125);

    // d) Attendance zerada (after_apply=zero_balance)
    const { data: attAfter } = await s
      .from('attendance')
      .select('date, bank_credit_minutes, bank_debit_minutes')
      .eq('employee_id', testEmployeeId!);
    expect(attAfter?.length).toBe(5);
    for (const a of attAfter ?? []) {
      expect(a.bank_credit_minutes).toBe(0);
      expect(a.bank_debit_minutes).toBe(0);
    }
  });

  // ============================================
  // TESTE 2: Idempotência via UI
  // ============================================
  test('2. Idempotência: linha mostra "já aplicado" + log não duplica', async ({ page }) => {
    // Pré-requisito: teste 1 já aplicou (testes rodam serial, fullyParallel: false)
    const s = getClient();

    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(testPaymentPeriodId!);

    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await applyBtn.click();

    // Tabela do modal — escope via coluna "Aplicar"
    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    // Funcionário aparece com status "Já aplicado"
    const employeeRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Integrity` }).first();
    await expect(employeeRow).toBeVisible({ timeout: 15_000 });
    await expect(employeeRow).toContainText(/Já aplicado/i);

    // Checkbox da linha deve estar disabled
    const rowCheckbox = employeeRow.getByRole('checkbox');
    await expect(rowCheckbox).toBeDisabled();

    // Verificação Supabase: log NÃO duplicou
    const { data: logRows } = await s
      .from('bank_hours_application_log')
      .select('id')
      .eq('employee_id', testEmployeeId!);
    expect(logRows?.length).toBe(1);
  });

  // ============================================
  // TESTE 3: Override com motivo
  // ============================================
  test('3. Override com motivo bloqueia aplicação + persiste em bank_hours_overrides', async ({ page }) => {
    const s = getClient();

    // Setup específico do teste 3 — period2 (16/04 a 30/04).
    const { data: pp2, error: pp2Err } = await s
      .from('payment_periods')
      .insert({
        start_date: '2026-04-16',
        end_date: '2026-04-30',
        payment_date: '2026-05-05',
        label: `${NAME_PREFIX}Period2`,
        company_id: CARATINGA_ID,
        created_by: '9999',
      })
      .select('id')
      .single();
    if (pp2Err) throw pp2Err;
    period2Id = (pp2 as { id: string }).id;

    // Attendance + payments do period2 (5 dias, bank_credit=24min cada)
    const dates2 = ['2026-04-16', '2026-04-17', '2026-04-18', '2026-04-19', '2026-04-20'];
    for (const date of dates2) {
      await s.from('attendance').insert({
        employee_id: testEmployeeId!,
        date,
        status: 'present',
        marked_by: '9999',
        company_id: CARATINGA_ID,
        bank_credit_minutes: 24,
        bank_debit_minutes: 0,
      });
      await s.from('payments').insert({
        employee_id: testEmployeeId!,
        date,
        daily_rate: 100,
        bonus: 0,
        total: 100,
        company_id: CARATINGA_ID,
        created_by: '9999',
      });
    }

    // ─── Fluxo UI ─────────────────────────────────────────────────────────
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(period2Id!);

    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await applyBtn.click();

    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    const employeeRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Integrity` }).first();
    await expect(employeeRow).toBeVisible({ timeout: 15_000 });

    // Desmarcar checkbox → textarea de motivo aparece
    const rowCheckbox = employeeRow.getByRole('checkbox');
    await rowCheckbox.uncheck();
    const reasonTextarea = page.getByPlaceholder(/Ex:.*férias/i).first();
    await expect(reasonTextarea).toBeVisible({ timeout: 5_000 });

    // COMBO I FIX #1: botão fica DISABLED enquanto há skip sem motivo
    // (substituiu o antigo toast.error pós-click). Label indica "preencha N motivo(s)".
    const submitBtnPending = page.getByRole('button', { name: /preencha 1 motivo/i });
    await expect(submitBtnPending).toBeDisabled({ timeout: 5_000 });

    // Preenche motivo → botão muda pra "Salvar overrides (1)" e habilita
    await reasonTextarea.fill('Funcionário em férias programadas');
    const submitBtnFinal = page.getByRole('button', { name: /Salvar overrides \(1\)/i });
    await expect(submitBtnFinal).toBeEnabled({ timeout: 5_000 });
    await submitBtnFinal.click();

    // Aguarda aplicação concluir (modal fecha) — sinal canônico do loop sequencial terminar.
    await expect(modalTable).not.toBeVisible({ timeout: 60_000 });

    // ─── Verificações Supabase ────────────────────────────────────────────

    // a) Override criado com motivo
    const { data: overrides } = await s
      .from('bank_hours_overrides')
      .select('apply_bank_hours, reason, payment_period_id, created_by')
      .eq('employee_id', testEmployeeId!)
      .eq('payment_period_id', period2Id!);
    expect(overrides?.length).toBe(1);
    expect(overrides![0]!.apply_bank_hours).toBe(false);
    expect(overrides![0]!.reason).toBe('Funcionário em férias programadas');
    expect(overrides![0]!.payment_period_id).toBe(period2Id);

    // b) Payments do period2 NÃO aplicados (applied_at null)
    const { data: pmts2 } = await s
      .from('payments')
      .select('bank_hours_applied_at, total')
      .eq('employee_id', testEmployeeId!)
      .gte('date', '2026-04-16')
      .lte('date', '2026-04-30');
    expect(pmts2?.length).toBe(5);
    for (const p of pmts2 ?? []) {
      expect(p.bank_hours_applied_at).toBeNull();
      expect(Number(p.total)).toBe(100);
    }
  });

  // ============================================
  // TESTE 4 (COMBO I FIX #1): Override-only flow
  // ============================================
  test('4. Override-only: 1 funcionário desmarcado salva apenas override (sem aplicar)', async ({ page }) => {
    expect(testEmployeeId).toBeTruthy();
    const s = getClient();

    // Setup: period3 (01/05 a 15/05) + 5 attendance/payments pro testEmployee
    const { data: pp3, error: pp3Err } = await s
      .from('payment_periods')
      .insert({
        start_date: '2026-05-01',
        end_date: '2026-05-15',
        payment_date: '2026-05-20',
        label: `${NAME_PREFIX}Period3`,
        company_id: CARATINGA_ID,
        created_by: '9999',
      })
      .select('id')
      .single();
    if (pp3Err) throw pp3Err;
    period3Id = (pp3 as { id: string }).id;

    const dates3 = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'];
    for (const date of dates3) {
      await s.from('attendance').insert({
        employee_id: testEmployeeId!,
        date,
        status: 'present',
        marked_by: '9999',
        company_id: CARATINGA_ID,
        bank_credit_minutes: 24,
        bank_debit_minutes: 0,
      });
      await s.from('payments').insert({
        employee_id: testEmployeeId!,
        date,
        daily_rate: 100,
        bonus: 0,
        total: 100,
        company_id: CARATINGA_ID,
        created_by: '9999',
      });
    }

    // ─── Fluxo UI ─────────────────────────────────────────────────────────
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(period3Id!);

    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await applyBtn.click();

    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    const employeeRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Integrity` }).first();
    await expect(employeeRow).toBeVisible({ timeout: 15_000 });

    // Desmarca testEmployee → textarea aparece, label muda pra "preencha 1 motivo" + disabled
    await employeeRow.getByRole('checkbox').uncheck();
    const reasonTextarea = page.getByPlaceholder(/Ex:.*férias/i).first();
    await expect(reasonTextarea).toBeVisible({ timeout: 5_000 });

    const pendingBtn = page.getByRole('button', { name: /preencha 1 motivo/i });
    await expect(pendingBtn).toBeDisabled({ timeout: 5_000 });

    // Preenche motivo → label muda pra "Salvar overrides (1)" + enabled
    await reasonTextarea.fill('Funcionário em afastamento médico');
    const overrideBtn = page.getByRole('button', { name: /Salvar overrides \(1\)/i });
    await expect(overrideBtn).toBeEnabled({ timeout: 5_000 });
    await overrideBtn.click();

    // Modal fecha — sinal canônico do loop sequencial terminar
    await expect(modalTable).not.toBeVisible({ timeout: 60_000 });

    // ─── Verificações Supabase ────────────────────────────────────────────
    // a) Override criado para period3
    const { data: overrides3 } = await s
      .from('bank_hours_overrides')
      .select('apply_bank_hours, reason, payment_period_id')
      .eq('employee_id', testEmployeeId!)
      .eq('payment_period_id', period3Id!);
    expect(overrides3?.length).toBe(1);
    expect(overrides3![0]!.apply_bank_hours).toBe(false);
    expect(overrides3![0]!.reason).toBe('Funcionário em afastamento médico');

    // b) Payments do period3 NÃO aplicados (applied_at null)
    const { data: pmts3 } = await s
      .from('payments')
      .select('bank_hours_applied_at, total')
      .eq('employee_id', testEmployeeId!)
      .gte('date', '2026-05-01')
      .lte('date', '2026-05-15');
    expect(pmts3?.length).toBe(5);
    for (const p of pmts3 ?? []) {
      expect(p.bank_hours_applied_at).toBeNull();
      expect(Number(p.total)).toBe(100);
    }
  });

  // ============================================
  // TESTE 5 (COMBO I FIX #1): Mix flow
  // ============================================
  test('5. Mix flow: 2 marcados aplicados + 1 desmarcado salva override', async ({ page }) => {
    expect(testEmployeeId).toBeTruthy();
    const s = getClient();

    // Setup: 2 employees auxiliares (PW Test I Mix2 e Mix3)
    const cpf2 = generateValidCPF(`${Date.now()}5`.slice(-9));
    const { data: emp2, error: emp2Err } = await s
      .from('employees')
      .insert({
        name: `${NAME_PREFIX}Mix2`,
        cpf: cpf2,
        company_id: CARATINGA_ID,
        created_by: '9999',
        employment_type: 'CLT',
        expected_schedule: [0, 480, 480, 480, 480, 480, 240],
      })
      .select('id')
      .single();
    if (emp2Err) throw emp2Err;
    testEmployeeId2 = (emp2 as { id: string }).id;

    const cpf3 = generateValidCPF(`${Date.now()}6`.slice(-9));
    const { data: emp3, error: emp3Err } = await s
      .from('employees')
      .insert({
        name: `${NAME_PREFIX}Mix3`,
        cpf: cpf3,
        company_id: CARATINGA_ID,
        created_by: '9999',
        employment_type: 'CLT',
        expected_schedule: [0, 480, 480, 480, 480, 480, 240],
      })
      .select('id')
      .single();
    if (emp3Err) throw emp3Err;
    testEmployeeId3 = (emp3 as { id: string }).id;

    // Period4 (16/05 a 31/05) + 5 attendance/payments pra cada um dos 3 employees
    const { data: pp4, error: pp4Err } = await s
      .from('payment_periods')
      .insert({
        start_date: '2026-05-16',
        end_date: '2026-05-31',
        payment_date: '2026-06-05',
        label: `${NAME_PREFIX}Period4`,
        company_id: CARATINGA_ID,
        created_by: '9999',
      })
      .select('id')
      .single();
    if (pp4Err) throw pp4Err;
    period4Id = (pp4 as { id: string }).id;

    const dates4 = ['2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20'];
    const empIds = [testEmployeeId!, testEmployeeId2!, testEmployeeId3!];
    for (const id of empIds) {
      for (const date of dates4) {
        await s.from('attendance').insert({
          employee_id: id,
          date,
          status: 'present',
          marked_by: '9999',
          company_id: CARATINGA_ID,
          bank_credit_minutes: 24,
          bank_debit_minutes: 0,
        });
        await s.from('payments').insert({
          employee_id: id,
          date,
          daily_rate: 100,
          bonus: 0,
          total: 100,
          company_id: CARATINGA_ID,
          created_by: '9999',
        });
      }
    }

    // ─── Fluxo UI ─────────────────────────────────────────────────────────
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(period4Id!);

    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await applyBtn.click();

    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    // Verifica os 3 employees presentes
    const row1 = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Integrity` }).first();
    const row2 = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Mix2` }).first();
    const row3 = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Mix3` }).first();
    await expect(row1).toBeVisible({ timeout: 15_000 });
    await expect(row2).toBeVisible({ timeout: 15_000 });
    await expect(row3).toBeVisible({ timeout: 15_000 });

    // Desmarca o emp3, deixa emp1 e emp2 marcados (default)
    await row3.getByRole('checkbox').uncheck();

    // Botão fica disabled enquanto motivo do emp3 não foi preenchido
    const pendingBtn = page.getByRole('button', { name: /preencha 1 motivo/i });
    await expect(pendingBtn).toBeDisabled({ timeout: 5_000 });

    // Preenche motivo do emp3 (único textarea visível — só 1 desmarcado)
    const reasonTextarea = page.getByPlaceholder(/Ex:.*férias/i).first();
    await expect(reasonTextarea).toBeVisible({ timeout: 5_000 });
    await reasonTextarea.fill('Não foi ao trabalho — pendente justificativa');

    // Botão muda pra "Aplicar (N) + Salvar overrides (1)" e habilita.
    // Como pode haver outros funcionários Caratinga marcados, usa regex tolerante a N.
    const finalBtn = page.getByRole('button', { name: /\+ Salvar overrides \(1\)/i });
    await expect(finalBtn).toBeEnabled({ timeout: 5_000 });
    await finalBtn.click();

    // Aguarda modal fechar
    await expect(modalTable).not.toBeVisible({ timeout: 90_000 });

    // ─── Verificações Supabase ────────────────────────────────────────────
    // a) emp1 e emp2: APENAS o anchor (último payment do period4) tem applied_at != null;
    //    os outros 4 ficam null — applyBankHoursToPayment escreve em UM payment só (design intencional).
    for (const empId of [testEmployeeId!, testEmployeeId2!]) {
      const { data: pmts } = await s
        .from('payments')
        .select('date, bank_hours_applied_at')
        .eq('employee_id', empId)
        .gte('date', '2026-05-16')
        .lte('date', '2026-05-31')
        .order('date', { ascending: false });
      expect(pmts?.length).toBe(5);
      const applied = pmts!.filter(p => p.bank_hours_applied_at !== null);
      expect(applied.length).toBe(1);
      expect(applied[0]!.date).toBe('2026-05-20'); // anchor = última data do period4
    }

    // b) ROBUSTEZ EXTRA: log de aplicação criado para period4 (1 por employee marcado)
    for (const empId of [testEmployeeId!, testEmployeeId2!]) {
      const { data: logs } = await s
        .from('bank_hours_application_log')
        .select('id')
        .eq('employee_id', empId)
        .eq('payment_period_id', period4Id!);
      expect(logs?.length).toBe(1);
    }

    // c) emp3: payments do period4 NÃO aplicados (override criado)
    const { data: pmts3 } = await s
      .from('payments')
      .select('bank_hours_applied_at')
      .eq('employee_id', testEmployeeId3!)
      .gte('date', '2026-05-16')
      .lte('date', '2026-05-31');
    expect(pmts3?.length).toBe(5);
    for (const p of pmts3 ?? []) {
      expect(p.bank_hours_applied_at).toBeNull();
    }

    // d) emp3: override OFF criado com motivo no period4
    const { data: ov3 } = await s
      .from('bank_hours_overrides')
      .select('apply_bank_hours, reason, payment_period_id')
      .eq('employee_id', testEmployeeId3!)
      .eq('payment_period_id', period4Id!);
    expect(ov3?.length).toBe(1);
    expect(ov3![0]!.apply_bank_hours).toBe(false);
    expect(ov3![0]!.reason).toBe('Não foi ao trabalho — pendente justificativa');

    // e) emp1 e emp2: NÃO há override (foram aplicados normalmente)
    for (const empId of [testEmployeeId!, testEmployeeId2!]) {
      const { data: ov } = await s
        .from('bank_hours_overrides')
        .select('id')
        .eq('employee_id', empId)
        .eq('payment_period_id', period4Id!);
      expect(ov?.length ?? 0).toBe(0);
    }
  });
});
