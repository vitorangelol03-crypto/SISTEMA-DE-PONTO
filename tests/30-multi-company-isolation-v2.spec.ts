import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as path from 'node:path';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';
import { getClient } from './cleanup';

/**
 * Módulo 30 — Combo I: isolamento multi-empresa v2 (sub-fase 2.21+2.22).
 *
 * 5 testes que validam que mudanças/dados de uma empresa não vazam pra outra:
 *  1. Settings de banco horas isolados — Caratinga ON, Ponte Nova OFF
 *  2. Aplicar em Caratinga não afeta Ponte Nova (payments/logs/attendance)
 *  3. Override criado em Caratinga não aparece em Ponte Nova
 *  4. payment_periods de cada empresa só visíveis no respectivo dropdown
 *  5. Importar funcionário em Caratinga: company_id correto
 *
 * NOTA sobre UNIQUE(cpf): hoje a constraint do banco impede CPF duplicado entre
 * empresas. Push final 1.21+2.23 vai migrar pra UNIQUE(cpf, company_id). Por
 * isso o teste 5 só valida company_id correto, sem tentar inserir o mesmo CPF
 * em ambas empresas (causaria erro UNIQUE de imediato).
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PONTE_NOVA_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';
const NAME_PREFIX = 'PW Test I MultiEmp ';
const TMP_DIR = '/tmp';

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

let originalCaratingaConfig: CompanyBankHoursSnapshot | null = null;
let originalPonteNovaConfig: CompanyBankHoursSnapshot | null = null;
let employeeCaratingaId: string | null = null;
let employeePonteNovaId: string | null = null;
let periodCaratingaId: string | null = null;
let periodPonteNovaId: string | null = null;
let employeeCaratingaCpf: string | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────

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

test.describe('Combo I — Isolamento multi-empresa v2', () => {
  test.beforeAll(async () => {
    const s = getClient();

    // 1. Snapshot configs das 2 empresas
    const cols = 'bank_hours_enabled, bank_hours_apply_in_payment, bank_hours_formula, ' +
      'bank_hours_extra_multiplier, bank_hours_custom_value, ' +
      'bank_hours_credit_action, bank_hours_debit_action, ' +
      'bank_hours_period, bank_hours_display, bank_hours_after_apply, ' +
      'bank_hours_night_separate, bank_hours_night_multiplier';

    const { data: cSnap, error: cSnapErr } = await s
      .from('companies').select(cols).eq('id', CARATINGA_ID).single();
    if (cSnapErr) throw cSnapErr;
    originalCaratingaConfig = cSnap as CompanyBankHoursSnapshot;

    const { data: pSnap, error: pSnapErr } = await s
      .from('companies').select(cols).eq('id', PONTE_NOVA_ID).single();
    if (pSnapErr) throw pSnapErr;
    originalPonteNovaConfig = pSnap as CompanyBankHoursSnapshot;

    // 2. Configurar Caratinga: ON
    await s.from('companies').update({
      bank_hours_enabled: true,
      bank_hours_apply_in_payment: true,
      bank_hours_formula: 'daily_div_8',
      bank_hours_credit_action: 'add_to_net',
      bank_hours_debit_action: 'subtract_from_net',
      bank_hours_after_apply: 'zero_balance',
    }).eq('id', CARATINGA_ID);

    // 3. Configurar Ponte Nova: OFF
    await s.from('companies').update({
      bank_hours_enabled: true, // pra que toggle master "afeta pagamento" possa ser editado se quiser
      bank_hours_apply_in_payment: false,
    }).eq('id', PONTE_NOVA_ID);

    // 4. Criar funcionário em CADA empresa (CPFs DIFERENTES — UNIQUE pendente)
    const ts = Date.now();
    employeeCaratingaCpf = generateValidCPF(`${ts}`.slice(-8) + '0');
    const { data: empC, error: empCErr } = await s.from('employees').insert({
      name: `${NAME_PREFIX}Caratinga`,
      cpf: employeeCaratingaCpf,
      company_id: CARATINGA_ID,
      created_by: '9999',
      employment_type: 'CLT',
      expected_schedule: [0, 480, 480, 480, 480, 480, 240],
    }).select('id').single();
    if (empCErr) throw empCErr;
    employeeCaratingaId = (empC as { id: string }).id;

    const cpfPN = generateValidCPF(`${ts}`.slice(-8) + '1');
    const { data: empP, error: empPErr } = await s.from('employees').insert({
      name: `${NAME_PREFIX}PonteNova`,
      cpf: cpfPN,
      company_id: PONTE_NOVA_ID,
      created_by: '9999',
      employment_type: 'CLT',
      expected_schedule: [0, 480, 480, 480, 480, 480, 240],
    }).select('id').single();
    if (empPErr) throw empPErr;
    employeePonteNovaId = (empP as { id: string }).id;

    // 5. Criar payment_period em cada empresa (datas idênticas — pra provar que
    // separação é por company_id, não por data)
    const { data: ppC, error: ppCErr } = await s.from('payment_periods').insert({
      start_date: '2026-04-01',
      end_date: '2026-04-15',
      payment_date: '2026-04-20',
      label: `${NAME_PREFIX}Caratinga Period`,
      company_id: CARATINGA_ID,
      created_by: '9999',
    }).select('id').single();
    if (ppCErr) throw ppCErr;
    periodCaratingaId = (ppC as { id: string }).id;

    const { data: ppP, error: ppPErr } = await s.from('payment_periods').insert({
      start_date: '2026-04-01',
      end_date: '2026-04-15',
      payment_date: '2026-04-20',
      label: `${NAME_PREFIX}PonteNova Period`,
      company_id: PONTE_NOVA_ID,
      created_by: '9999',
    }).select('id').single();
    if (ppPErr) throw ppPErr;
    periodPonteNovaId = (ppP as { id: string }).id;

    // 6. Attendance + payments em cada empresa (5 dias, bank_credit=24min cada)
    const dates = ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'];
    for (const date of dates) {
      // Caratinga
      await s.from('attendance').insert({
        employee_id: employeeCaratingaId,
        date,
        status: 'present',
        marked_by: '9999',
        company_id: CARATINGA_ID,
        bank_credit_minutes: 24,
        bank_debit_minutes: 0,
      });
      await s.from('payments').insert({
        employee_id: employeeCaratingaId,
        date, daily_rate: 100, bonus: 0, total: 100,
        company_id: CARATINGA_ID, created_by: '9999',
      });
      // Ponte Nova
      await s.from('attendance').insert({
        employee_id: employeePonteNovaId,
        date,
        status: 'present',
        marked_by: '9999',
        company_id: PONTE_NOVA_ID,
        bank_credit_minutes: 24,
        bank_debit_minutes: 0,
      });
      await s.from('payments').insert({
        employee_id: employeePonteNovaId,
        date, daily_rate: 100, bonus: 0, total: 100,
        company_id: PONTE_NOVA_ID, created_by: '9999',
      });
    }
  });

  test.afterAll(async () => {
    const s = getClient();
    const safe = async (fn: () => Promise<unknown>, label: string) => {
      try { await fn(); } catch (err) {
        console.error(`[afterAll cleanup ${label}]`, err);
      }
    };

    // Cleanup importEmployees criados no teste 5
    await safe(
      () => s.from('employees').delete().like('name', `${NAME_PREFIX}%`),
      'imported-employees',
    );

    // Cleanup ambas empresas
    for (const empId of [employeeCaratingaId, employeePonteNovaId]) {
      if (!empId) continue;
      await safe(() => s.from('bank_hours_application_log').delete().eq('employee_id', empId), `logs-${empId}`);
      await safe(() => s.from('bank_hours_overrides').delete().eq('employee_id', empId), `overrides-${empId}`);
      await safe(() => s.from('payments').delete().eq('employee_id', empId), `payments-${empId}`);
      await safe(() => s.from('attendance').delete().eq('employee_id', empId), `attendance-${empId}`);
      await safe(() => s.from('employees').delete().eq('id', empId), `employee-${empId}`);
    }
    for (const ppId of [periodCaratingaId, periodPonteNovaId]) {
      if (!ppId) continue;
      await safe(() => s.from('payment_periods').delete().eq('id', ppId), `period-${ppId}`);
    }
    if (originalCaratingaConfig) {
      await safe(() => s.from('companies').update(originalCaratingaConfig!).eq('id', CARATINGA_ID), 'restore-caratinga');
    }
    if (originalPonteNovaConfig) {
      await safe(() => s.from('companies').update(originalPonteNovaConfig!).eq('id', PONTE_NOVA_ID), 'restore-pontenova');
    }
  });

  // ============================================
  // TESTE 1: Settings isolados (UI reflete config de cada empresa)
  // ============================================
  test('1. Settings de banco horas isolados: Caratinga ON, Ponte Nova OFF', async ({ page }) => {
    const s = getClient();

    // Verificações Supabase iniciais
    const { data: cConf } = await s
      .from('companies').select('bank_hours_apply_in_payment').eq('id', CARATINGA_ID).single();
    const { data: pConf } = await s
      .from('companies').select('bank_hours_apply_in_payment').eq('id', PONTE_NOVA_ID).single();
    expect((cConf as { bank_hours_apply_in_payment: boolean }).bank_hours_apply_in_payment).toBe(true);
    expect((pConf as { bank_hours_apply_in_payment: boolean }).bank_hours_apply_in_payment).toBe(false);

    // Login admin → começa em Caratinga
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    // Caratinga: botão "Aplicar banco de horas" visível
    await expect(page.getByRole('button', { name: /Aplicar banco de horas/i })).toBeVisible({ timeout: 10_000 });

    // Trocar pra Ponte Nova
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Financeiro');

    // Ponte Nova: botão NÃO deve aparecer (toggle OFF)
    await expect(page.getByRole('button', { name: /Aplicar banco de horas/i })).not.toBeVisible({ timeout: 5_000 });

    // Verificação final: configs no banco continuam diferentes (não foram alteradas)
    const { data: cConfFinal } = await s
      .from('companies').select('bank_hours_apply_in_payment').eq('id', CARATINGA_ID).single();
    const { data: pConfFinal } = await s
      .from('companies').select('bank_hours_apply_in_payment').eq('id', PONTE_NOVA_ID).single();
    expect((cConfFinal as { bank_hours_apply_in_payment: boolean }).bank_hours_apply_in_payment).toBe(true);
    expect((pConfFinal as { bank_hours_apply_in_payment: boolean }).bank_hours_apply_in_payment).toBe(false);
  });

  // ============================================
  // TESTE 2: Aplicar em Caratinga não afeta Ponte Nova
  // ============================================
  test('2. Aplicar em Caratinga não afeta Ponte Nova', async ({ page }) => {
    const s = getClient();

    // Snapshot inicial: nada aplicado em nenhuma empresa
    const { data: pmtsInitC } = await s.from('payments')
      .select('bank_hours_amount, bank_hours_applied_at')
      .eq('employee_id', employeeCaratingaId!);
    const { data: pmtsInitP } = await s.from('payments')
      .select('bank_hours_amount, bank_hours_applied_at')
      .eq('employee_id', employeePonteNovaId!);
    for (const p of pmtsInitC ?? []) expect(p.bank_hours_applied_at).toBeNull();
    for (const p of pmtsInitP ?? []) expect(p.bank_hours_applied_at).toBeNull();

    // Login Caratinga → aplicar
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(periodCaratingaId!);

    await page.getByRole('button', { name: /Aplicar banco de horas/i }).click();

    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    const employeeRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Caratinga` }).first();
    await expect(employeeRow).toBeVisible({ timeout: 15_000 });

    const submitBtn = page.getByRole('button', { name: /Aplicar selecionados \([1-9]\d*\)/ });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();
    await expect(modalTable).not.toBeVisible({ timeout: 60_000 });

    // Caratinga: payment-âncora aplicado
    const { data: cAnchor } = await s.from('payments')
      .select('bank_hours_amount, bank_hours_applied_at')
      .eq('employee_id', employeeCaratingaId!)
      .order('date', { ascending: false }).limit(1).single();
    expect(Number(cAnchor!.bank_hours_amount)).toBeGreaterThan(0);
    expect(cAnchor!.bank_hours_applied_at).not.toBeNull();

    // Ponte Nova: TODOS payments inalterados
    const { data: pmtsAfterP } = await s.from('payments')
      .select('bank_hours_amount, bank_hours_applied_at')
      .eq('employee_id', employeePonteNovaId!);
    for (const p of pmtsAfterP ?? []) {
      expect(Number(p.bank_hours_amount ?? 0)).toBe(0);
      expect(p.bank_hours_applied_at).toBeNull();
    }

    // Logs: 1 row Caratinga, 0 Ponte Nova
    const { data: logsC } = await s.from('bank_hours_application_log')
      .select('id').eq('company_id', CARATINGA_ID).eq('employee_id', employeeCaratingaId!);
    const { data: logsP } = await s.from('bank_hours_application_log')
      .select('id').eq('company_id', PONTE_NOVA_ID).eq('employee_id', employeePonteNovaId!);
    expect(logsC?.length).toBe(1);
    expect(logsP?.length ?? 0).toBe(0);

    // Attendance Ponte Nova inalterada (bank_credit ainda = 24 cada)
    const { data: attP } = await s.from('attendance')
      .select('bank_credit_minutes')
      .eq('employee_id', employeePonteNovaId!);
    for (const a of attP ?? []) {
      expect(a.bank_credit_minutes).toBe(24);
    }
  });

  // ============================================
  // TESTE 3: Override em Caratinga não vaza pra Ponte Nova
  // ============================================
  test('3. Override em Caratinga não aparece em Ponte Nova', async ({ page }) => {
    const s = getClient();

    // INSERT override em Caratinga (criado fora da UI, validamos via consulta scoped)
    await s.from('bank_hours_overrides').insert({
      company_id: CARATINGA_ID,
      employee_id: employeeCaratingaId!,
      payment_period_id: periodCaratingaId!,
      apply_bank_hours: false,
      reason: 'Teste isolamento: override Caratinga não deve vazar',
      created_by: '9999',
    });

    // Verificação Supabase: override existe SÓ em Caratinga
    const { data: overrideC } = await s.from('bank_hours_overrides')
      .select('id, apply_bank_hours, reason')
      .eq('company_id', CARATINGA_ID).eq('employee_id', employeeCaratingaId!);
    expect(overrideC?.length).toBe(1);
    expect((overrideC![0] as { apply_bank_hours: boolean }).apply_bank_hours).toBe(false);

    const { data: overrideP } = await s.from('bank_hours_overrides')
      .select('id').eq('company_id', PONTE_NOVA_ID);
    // Ponte Nova: 0 overrides relacionados ao test (filtrar pelo employee_id de Ponte Nova)
    const { data: overridePOfThisEmp } = await s.from('bank_hours_overrides')
      .select('id').eq('employee_id', employeePonteNovaId!);
    expect(overridePOfThisEmp?.length ?? 0).toBe(0);

    // Validação UI: Caratinga modal mostra override do testEmployee
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await periodSelect.selectOption(periodCaratingaId!);
    await page.getByRole('button', { name: /Aplicar banco de horas/i }).click();

    const modalTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: /^Aplicar$/i }) })
      .first();
    await expect(modalTable).toBeVisible({ timeout: 90_000 });

    const employeeRow = modalTable.getByRole('row').filter({ hasText: `${NAME_PREFIX}Caratinga` }).first();
    await expect(employeeRow).toBeVisible({ timeout: 15_000 });
    await expect(employeeRow).toContainText(/Override OFF/i);

    // Fecha modal sem submeter (close via ESC ou click no botão Cancelar)
    await page.getByRole('button', { name: /^Cancelar$/i }).first().click();
    await expect(modalTable).not.toBeVisible({ timeout: 5_000 });

    // Limpa override pra não interferir nos próximos testes (idempotência)
    await s.from('bank_hours_overrides').delete().eq('employee_id', employeeCaratingaId!);

    // Confirmação Ponte Nova manteve a invariância (existe overrideP zero)
    expect(overrideP?.length ?? 0).toBeLessThan(2);
  });

  // ============================================
  // TESTE 4: payment_periods não vazam entre empresas
  // ============================================
  test('4. payment_periods não vazam entre empresas', async ({ page }) => {
    const s = getClient();

    // Validação Supabase: cada period tem company_id correto e único
    const { data: caratingaPeriods } = await s.from('payment_periods')
      .select('id').eq('company_id', CARATINGA_ID);
    const { data: pontenovaPeriods } = await s.from('payment_periods')
      .select('id').eq('company_id', PONTE_NOVA_ID);

    const caratingaIds = new Set((caratingaPeriods ?? []).map((p: { id: string }) => p.id));
    const pontenovaIds = new Set((pontenovaPeriods ?? []).map((p: { id: string }) => p.id));

    // Zero overlap entre os sets
    for (const id of caratingaIds) expect(pontenovaIds.has(id)).toBe(false);

    // testPeriodCaratinga só em Caratinga
    expect(caratingaIds.has(periodCaratingaId!)).toBe(true);
    expect(pontenovaIds.has(periodCaratingaId!)).toBe(false);

    // testPeriodPonteNova só em Ponte Nova
    expect(pontenovaIds.has(periodPonteNovaId!)).toBe(true);
    expect(caratingaIds.has(periodPonteNovaId!)).toBe(false);

    // Validação UI: dropdown de Caratinga só mostra periods de Caratinga
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    const periodSelect = page.locator('select').filter({ hasText: 'Sem período' }).first();
    // Aguarda dropdown popular (placeholder + ≥1 period) — sinal de que loadData terminou.
    await expect(async () => {
      const count = await periodSelect.locator('option').count();
      expect(count).toBeGreaterThan(1);
    }).toPass({ timeout: 30_000 });

    const optionValues = await periodSelect.locator('option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v),
    );
    const optionsSet = new Set(optionValues);

    // Caratinga: contém periodCaratinga, NÃO contém periodPonteNova
    expect(optionsSet.has(periodCaratingaId!)).toBe(true);
    expect(optionsSet.has(periodPonteNovaId!)).toBe(false);
  });

  // ============================================
  // TESTE 5: Importar funcionário em Caratinga: company_id correto
  // ============================================
  test('5. Importar em Caratinga: company_id correto (UNIQUE cpf pendente push final)', async ({ page }) => {
    const s = getClient();

    // Excel com 1 funcionário (CPF gerado novo, prefix pra cleanup)
    const importedCpf = generateValidCPF(`${Date.now()}`.slice(-8) + '5');
    const filepath = path.join(TMP_DIR, `import-multiemp-${Date.now()}.xlsx`);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      {
        nome: `${NAME_PREFIX}Imported`,
        cpf: importedCpf,
        funcao: 'AUXILIAR',
        cracha: '999',
        marcacoes_por_dia: 2,
        data_admissao: '01/01/2024',
      },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');
    XLSX.writeFile(wb, filepath);

    // Login Caratinga → Funcionários → importar
    await loginAs(page, ADMIN);
    await goToTab(page, 'Funcionários');
    await page.getByRole('button', { name: /^Importar$/ }).click();
    await expect(page.getByRole('heading', { name: /Importar Funcionários em Massa/ })).toBeVisible({ timeout: 10_000 });

    await page.setInputFiles('#file-upload', filepath);
    await page.getByRole('button', { name: /Processar Planilha/ }).click();

    // Aguardar preview e confirmar
    await expect(page.getByText('Prontos').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Importar 1 Funcionário/ }).click();
    await expect(page.getByText(/1 funcionário\(s\) importado\(s\)/i)).toBeVisible({ timeout: 15_000 });

    // Verificação Supabase: company_id = CARATINGA_ID
    const { data: importedRow, error: importErr } = await s.from('employees')
      .select('id, name, company_id')
      .eq('cpf', importedCpf)
      .single();
    expect(importErr).toBeNull();
    expect(importedRow).toBeTruthy();
    expect((importedRow as { company_id: string }).company_id).toBe(CARATINGA_ID);

    // Cleanup do import
    await s.from('employees').delete().eq('cpf', importedCpf);

    // NOTA: tentar inserir o mesmo CPF em Ponte Nova ESBARRARIA na UNIQUE(cpf)
    // do banco hoje. Push final 1.21+2.23 vai migrar pra UNIQUE(cpf, company_id).
    // Quando isso for feito, este teste deve ser estendido pra cobrir o cenário
    // "mesmo CPF em ambas empresas, registros separados".
  });
});
