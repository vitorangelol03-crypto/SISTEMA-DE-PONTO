import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Módulo 42 — Fluxos UI de APLICAR banco de horas em pagamento.
 *
 * Complementa (não duplica) 27-bank-hours-payment.spec.ts (visibilidade do
 * botão + dropdown) e 29-bank-hours-integrity.spec.ts (integridade matemática
 * E2E do apply real + idempotência + override).
 *
 * O spec 29 já cobre o caminho feliz "apply E2E real" assertando colunas do
 * payment, log e attendance zerada. AQUI focamos nos elementos UI específicos
 * do modal que o spec 29 não verifica detalhadamente:
 *
 *  1. Estado pré-modal — botão "Aplicar banco de horas" + seção UI quando
 *     period selecionado: tooltip, ícone, label, estado disabled→enabled.
 *  2. Preview no modal — todas as colunas/cards de cálculo aparecem com
 *     valores formatados (saldo "+02:00", "R$ 25,00", "Total a creditar",
 *     "Total a debitar", "Líquido geral", "Líq. antes/depois").
 *  3. Confirma aplicação → toast de sucesso + verifica payment.bank_hours_amount
 *     + bank_hours_minutes + bank_hours_applied_at + bank_hours_application_log
 *     com snapshot completo (formula_used, hour_value_used, etc.).
 *  4. SKIPPED — Reverter aplicação: não há UI de revert no sistema (verificado
 *     em src/ — função apenas comenta "não pode reaplicar sem reverter primeiro",
 *     sem botão/endpoint UI).
 *
 * Setup robusto: snapshot/restore da config Caratinga, employee+period+
 * attendance+payments isolados em beforeAll, cleanup completo em afterAll
 * com try/catch em cada DELETE (mesmo padrão do spec 29).
 *
 * Período de teste: 2026-07-01 a 2026-07-15 (período distinto dos specs 27/29
 * pra evitar colisão de dados entre suítes se rodarem juntas).
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const NAME_PREFIX = 'PW Test 42 ';

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
let period1Id: string | null = null; // teste 1, 3 (UI smoke + cancel — não aplica)
let period2Id: string | null = null; // teste 2 (apply real isolado)

// ─── CPF generator (algoritmo Mod 11 — DV calculado) ──────────────────────
// Idêntico ao spec 29 (mesma estratégia de CPFs válidos sequenciais).

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

test.describe('Módulo 42 — Fluxos UI de aplicar banco de horas', () => {
  test.beforeAll(async () => {
    const s = getClient();

    // 1. Snapshot config Caratinga
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

    // 2. Configura Caratinga pro teste (formula daily_div_8, after_apply=zero_balance)
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

    // 3. Funcionário de teste
    testEmployeeCpf = generateValidCPF(`${Date.now()}42`.slice(-9));
    const empName = `${NAME_PREFIX}ApplyUI`;
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

    // 4. Period 1: 2026-07-01 a 2026-07-15 (testes 1 e 3 — NÃO aplicam,
    //    inspeção de UI e cancel respectivamente).
    const { data: pp1, error: pp1Err } = await s
      .from('payment_periods')
      .insert({
        start_date: '2026-07-01',
        end_date: '2026-07-15',
        payment_date: '2026-07-20',
        label: `${NAME_PREFIX}Period1`,
        company_id: CARATINGA_ID,
        created_by: '9999',
      })
      .select('id')
      .single();
    if (pp1Err) throw pp1Err;
    period1Id = (pp1 as { id: string }).id;

    // 5. Period 2: 2026-07-16 a 2026-07-31 (teste 2 — apply real isolado)
    const { data: pp2, error: pp2Err } = await s
      .from('payment_periods')
      .insert({
        start_date: '2026-07-16',
        end_date: '2026-07-31',
        payment_date: '2026-08-05',
        label: `${NAME_PREFIX}Period2`,
        company_id: CARATINGA_ID,
        created_by: '9999',
      })
      .select('id')
      .single();
    if (pp2Err) throw pp2Err;
    period2Id = (pp2 as { id: string }).id;

    // 6. Attendance + payments — 5 dias por period, bank_credit=24min cada
    //    (total 120min=2h, hora R$ 12.50, valor R$ 25.00, igual spec 29).
    const datesP1 = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-07'];
    const datesP2 = ['2026-07-16', '2026-07-17', '2026-07-20', '2026-07-21', '2026-07-22'];

    for (const date of [...datesP1, ...datesP2]) {
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
  });

  test.afterAll(async () => {
    const s = getClient();

    const safeDelete = async (fn: () => Promise<unknown>, label: string) => {
      try { await fn(); } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[afterAll cleanup ${label}]`, err);
      }
    };

    if (testEmployeeId) {
      await safeDelete(() => s.from('bank_hours_application_log').delete().eq('employee_id', testEmployeeId!), 'logs');
      await safeDelete(() => s.from('bank_hours_overrides').delete().eq('employee_id', testEmployeeId!), 'overrides');
      await safeDelete(() => s.from('payments').delete().eq('employee_id', testEmployeeId!), 'payments');
      await safeDelete(() => s.from('attendance').delete().eq('employee_id', testEmployeeId!), 'attendance');
      await safeDelete(() => s.from('employees').delete().eq('id', testEmployeeId!), 'employee');
    }
    if (period1Id) {
      await safeDelete(() => s.from('payment_periods').delete().eq('id', period1Id!), 'period1');
    }
    if (period2Id) {
      await safeDelete(() => s.from('payment_periods').delete().eq('id', period2Id!), 'period2');
    }
    if (originalConfig) {
      await safeDelete(() => s.from('companies').update(originalConfig!).eq('id', CARATINGA_ID), 'restore-config');
    }
  });

  // ============================================================
  // TESTE 1: FinancialTab UI — período selecionado mostra botão + tooltip
  // ============================================================
  test('1. Admin seleciona payment período → botão "Aplicar banco de horas" visível e habilitado', async ({ page }) => {
    expect(testEmployeeId).toBeTruthy();
    expect(period1Id).toBeTruthy();

    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    // a) Header da seção Financeira visível (sanity)
    await expect(page.getByRole('heading', { name: /Gestão Financeira/i })).toBeVisible({ timeout: 15_000 });

    // b) Botão "Aplicar banco de horas" renderiza (toggle ON via beforeAll) mas
    //    está disabled SEM period selecionado.
    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await expect(applyBtn).toBeVisible({ timeout: 10_000 });
    await expect(applyBtn).toBeDisabled();

    // c) Tooltip avisa a precondição quando sem period.
    await expect(applyBtn).toHaveAttribute('title', /Selecione um período primeiro/i);

    // d) Seleciona o period de teste — botão habilita + tooltip muda.
    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(period1Id!);

    await expect(applyBtn).toBeEnabled({ timeout: 5_000 });
    await expect(applyBtn).toHaveAttribute('title', /Aplica saldo do banco de horas/i);

    // e) Inputs de data ficam readonly quando period selecionado (UX de período).
    const startDateInput = page.locator('input[type="date"]').first();
    await expect(startDateInput).toHaveAttribute('readonly', '');
  });

  // ============================================================
  // TESTE 2: Click "Aplicar" → modal com preview completo + apply → toast + DB
  // ============================================================
  test('2. Modal preview mostra cálculo (saldo, valor, líquidos, totais) + apply gera toast/log/payment', async ({ page }) => {
    expect(testEmployeeId).toBeTruthy();
    expect(period2Id).toBeTruthy();
    const s = getClient();

    // Pré: nenhum log existe ainda pro period2
    const { data: logsBefore } = await s
      .from('bank_hours_application_log')
      .select('id')
      .eq('employee_id', testEmployeeId!)
      .eq('payment_period_id', period2Id!);
    expect(logsBefore?.length ?? 0).toBe(0);

    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(period2Id!);

    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await expect(applyBtn).toBeEnabled({ timeout: 10_000 });
    await applyBtn.click();

    // ─── Modal abre ──────────────────────────────────────────────
    // Título inclui o range BR do period.
    await expect(
      page.getByRole('heading', { name: /Aplicar Banco de Horas — Período/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Subtítulo com empresa.
    await expect(page.getByText(/Empresa:/i)).toBeVisible();

    // ─── Tabela de preview com colunas esperadas ────────────────
    // Tabela escopada via coluna única "Aplicar".
    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    // Todas as colunas do preview (creditos/débitos/líquido) estão presentes.
    await expect(modalTable.getByRole('columnheader', { name: /^Funcionário$/i })).toBeVisible();
    await expect(modalTable.getByRole('columnheader', { name: /^Saldo$/i })).toBeVisible();
    await expect(modalTable.getByRole('columnheader', { name: /^Valor$/i })).toBeVisible();
    await expect(modalTable.getByRole('columnheader', { name: /Líq\. antes/i })).toBeVisible();
    await expect(modalTable.getByRole('columnheader', { name: /Líq\. depois/i })).toBeVisible();
    await expect(modalTable.getByRole('columnheader', { name: /^Status$/i })).toBeVisible();

    // ─── Linha do funcionário de teste com cálculo correto ──────
    const empRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}ApplyUI` }).first();
    await expect(empRow).toBeVisible({ timeout: 15_000 });

    // Status "Pendente" (preview novo, nada aplicado ainda).
    await expect(empRow).toContainText(/Pendente/i);
    // Saldo formatado "+02:00" (2 horas em saldo).
    await expect(empRow).toContainText(/\+02:00/);
    // Valor R$ 25,00 (formula daily_div_8: 100/8=12.50 × 2h = 25.00).
    await expect(empRow).toContainText(/R\$\s*25,00/);

    // ─── Resumo agregado (totais creditos/débitos/líquido) ──────
    // Cards de summary aparecem fora da tabela.
    await expect(page.getByText(/Total a creditar/i)).toBeVisible();
    await expect(page.getByText(/Total a debitar/i)).toBeVisible();
    await expect(page.getByText(/Líquido geral/i)).toBeVisible();
    // Use exact match no card de summary (evita strict mode contra botões "Aplicar selecionados (N)").
    await expect(page.getByText('Selecionados', { exact: true })).toBeVisible();

    // ─── Confirma aplicação ─────────────────────────────────────
    // Botão "Aplicar selecionados (N)" com N>=1 (testEmployee marcado por default
    // — status='pending'). Pode haver outros funcionários Caratinga marcados, daí o regex.
    const submitBtn = page.getByRole('button', { name: /Aplicar selecionados \([1-9]\d*\)/ });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();

    // Modal fecha após onApplied() (loop sequencial terminou).
    await expect(modalTable).not.toBeVisible({ timeout: 60_000 });

    // ─── Toast de sucesso ────────────────────────────────────────
    // react-hot-toast renderiza com texto "X aplicados" no caminho success.
    // O toast some em ~4s default — assert com timeout curto.
    await expect(page.getByText(/\d+ aplicados/i).first()).toBeVisible({ timeout: 8_000 });

    // ─── Verificações Supabase ───────────────────────────────────
    // a) Payment-âncora (último do period — 2026-07-22) tem aplicação.
    const { data: anchorPayment } = await s
      .from('payments')
      .select('date, bank_hours_amount, bank_hours_minutes, bank_hours_applied_at, total')
      .eq('employee_id', testEmployeeId!)
      .gte('date', '2026-07-16')
      .lte('date', '2026-07-31')
      .order('date', { ascending: false })
      .limit(1)
      .single();
    expect(anchorPayment).toBeTruthy();
    expect(anchorPayment!.date).toBe('2026-07-22');
    expect(Number(anchorPayment!.bank_hours_amount)).toBe(25);
    expect(anchorPayment!.bank_hours_minutes).toBe(120);
    expect(anchorPayment!.bank_hours_applied_at).not.toBeNull();
    expect(Number(anchorPayment!.total)).toBe(125); // 100 (daily_rate) + 25 (credit)

    // b) Log criado com snapshot completo (formula_used, hour_value etc.).
    const { data: logRows } = await s
      .from('bank_hours_application_log')
      .select('amount_credit, amount_debit, amount_net, bank_credit_minutes, bank_debit_minutes, net_balance_minutes, formula_used, hour_value_used, payment_total_before, payment_total_after, applied_by, payment_period_id')
      .eq('employee_id', testEmployeeId!)
      .eq('payment_period_id', period2Id!);
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
    expect(log.applied_by).toBe('9999'); // admin que aplicou
  });

  // ============================================================
  // TESTE 3: Cancelar modal — fecha sem alterar DB
  // ============================================================
  test('3. Cancelar no modal fecha sem aplicar (nenhuma mutação no DB)', async ({ page }) => {
    expect(testEmployeeId).toBeTruthy();
    expect(period1Id).toBeTruthy();
    const s = getClient();

    // Pré-snapshot do estado do period1 ANTES de abrir o modal — vamos
    // comparar depois pra garantir que cancel realmente não tocou em nada.
    const { data: paymentsBefore } = await s
      .from('payments')
      .select('id, bank_hours_amount, bank_hours_minutes, bank_hours_applied_at, total')
      .eq('employee_id', testEmployeeId!)
      .gte('date', '2026-07-01')
      .lte('date', '2026-07-15');
    expect(paymentsBefore?.length).toBe(5);
    for (const p of paymentsBefore!) {
      expect(p.bank_hours_applied_at).toBeNull();
      expect(Number(p.total)).toBe(100);
    }

    const { data: logsBefore } = await s
      .from('bank_hours_application_log')
      .select('id')
      .eq('employee_id', testEmployeeId!)
      .eq('payment_period_id', period1Id!);
    expect(logsBefore?.length ?? 0).toBe(0);

    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(period1Id!);

    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await applyBtn.click();

    // Modal abre + tabela carregada.
    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    const empRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}ApplyUI` }).first();
    await expect(empRow).toBeVisible({ timeout: 15_000 });

    // Clica Cancelar — modal deve fechar sem chamar applyBankHoursToPayment.
    // Botão "Cancelar" só existe no modal (estamos no escopo).
    const cancelBtn = page.getByRole('button', { name: /^Cancelar$/i });
    await expect(cancelBtn).toBeEnabled();
    await cancelBtn.click();

    // Modal fecha (tabela some).
    await expect(modalTable).not.toBeVisible({ timeout: 10_000 });

    // ─── Verificações Supabase: estado IDÊNTICO ao pré-snapshot ───
    const { data: paymentsAfter } = await s
      .from('payments')
      .select('id, bank_hours_amount, bank_hours_minutes, bank_hours_applied_at, total')
      .eq('employee_id', testEmployeeId!)
      .gte('date', '2026-07-01')
      .lte('date', '2026-07-15');
    expect(paymentsAfter?.length).toBe(5);
    for (const p of paymentsAfter!) {
      expect(p.bank_hours_applied_at).toBeNull();
      expect(Number(p.bank_hours_amount ?? 0)).toBe(0);
      expect(p.bank_hours_minutes ?? 0).toBe(0);
      expect(Number(p.total)).toBe(100);
    }

    // Nenhum log criado.
    const { data: logsAfter } = await s
      .from('bank_hours_application_log')
      .select('id')
      .eq('employee_id', testEmployeeId!)
      .eq('payment_period_id', period1Id!);
    expect(logsAfter?.length ?? 0).toBe(0);

    // Attendance permanece intacta (bank_credit ainda 24 cada).
    const { data: attAfter } = await s
      .from('attendance')
      .select('bank_credit_minutes, bank_debit_minutes')
      .eq('employee_id', testEmployeeId!)
      .gte('date', '2026-07-01')
      .lte('date', '2026-07-15');
    expect(attAfter?.length).toBe(5);
    for (const a of attAfter!) {
      expect(a.bank_credit_minutes).toBe(24);
      expect(a.bank_debit_minutes).toBe(0);
    }
  });

  // ============================================================
  // TESTE 4: Reverter aplicação — SKIPPED (sem UI de revert)
  // ============================================================
  test.skip(
    '4. Reverter aplicação de banco de horas — SKIPPED: UI não suportada',
    async () => {
      // Não há fluxo UI de "Reverter banco de horas aplicado":
      //
      //  - Grep em src/ por "Reverter|reverter|revertBank|undoBank|cancel.*bank.*apply"
      //    retorna apenas um comentário em src/services/database.ts:149 dizendo
      //    "se já tem timestamp, não pode reaplicar sem reverter primeiro" —
      //    nenhum botão, modal, action, RPC ou service function de revert.
      //
      //  - applyBankHoursToPayment respeita idempotência (status='already_applied')
      //    mas não expõe operação inversa.
      //
      //  - Workaround manual no banco (UPDATE payment SET bank_hours_applied_at=NULL
      //    + DELETE FROM bank_hours_application_log) existe pra emergência mas
      //    está FORA do fluxo UI — testar isso seria duplicar 29-bank-hours-integrity
      //    teste 1 (que já valida o caminho feliz do apply real).
      //
      // Quando a sub-fase de revert chegar (se chegar), substituir este skip por
      // um teste real: abrir modal de revert pelo period aplicado → confirmar →
      // assert payment volta pro estado original + log auxiliar de revert.
    },
  );
});
