/**
 * Sub-fase 1.20 — Isolamento entre empresas.
 *
 * Cria dados em PONTE NOVA (real, não sandbox), com prefixo dedicado
 * `PWTest_isol_` que NUNCA pode aparecer em outros testes.
 *
 * Proteções de segurança:
 *  1. cleanupIsolation no beforeAll — limpa resíduo de runs anteriores
 *  2. cleanupIsolation no afterEach — cada teste limpa seu lixo
 *  3. Verificação no afterAll — alerta visual se sobrou lixo
 *  4. ensureSafePrefix() no início do cleanup — guard contra deletes amplos
 */
import { test, expect } from '@playwright/test';
import { SupabaseClient } from '@supabase/supabase-js';
import { ADMIN } from './helpers';
import { getClient } from './cleanup';

const PREFIX = 'PWTest_isol_';
const SAFE_DATE = '2030-07-15';
const SAFE_DATE_2 = '2030-07-16';

let CARATINGA_ID = '';
let PONTE_NOVA_ID = '';

/** Guard de segurança: nunca rodar cleanup com filtro vazio ou genérico. */
function ensureSafePrefix(value: string): void {
  if (!value || !value.includes('PWTest_isol_')) {
    throw new Error(`Cleanup unsafe: filtro '${value}' não contém o prefix dedicado dos testes de isolamento`);
  }
}

async function discoverCompanies(s: SupabaseClient): Promise<{ caratingaId: string; ponteNovaId: string }> {
  const { data, error } = await s.from('companies').select('id, display_name, legal_name, city');
  if (error) throw error;
  const list = (data ?? []) as Array<{ id: string; display_name: string; legal_name: string; city: string }>;
  const matches = (c: { display_name: string; legal_name: string; city: string }, regex: RegExp): boolean =>
    regex.test(c.display_name) || regex.test(c.legal_name) || regex.test(c.city);
  const caratinga = list.find(c => matches(c, /caratinga/i));
  const pontenova = list.find(c => matches(c, /ponte\s*nova/i));
  if (!caratinga) throw new Error('Empresa "Caratinga" não encontrada no banco');
  if (!pontenova) throw new Error('Empresa "Ponte Nova" não encontrada no banco');
  return { caratingaId: caratinga.id, ponteNovaId: pontenova.id };
}

async function cleanupIsolation(): Promise<void> {
  const s = getClient();
  ensureSafePrefix(`${PREFIX}%`);

  // Coleta IDs de funcionários do PREFIX (qualquer empresa)
  const { data: emps } = await s.from('employees').select('id, name').like('name', `${PREFIX}%`);
  const empIds = (emps ?? [])
    .filter((e: { id: string; name: string }) => e.name.startsWith(PREFIX))
    .map((e: { id: string }) => e.id);

  if (empIds.length > 0) {
    await s.from('triage_distribution_employees').delete().in('employee_id', empIds);
    await s.from('error_records').delete().in('employee_id', empIds);
    await s.from('attendance').delete().in('employee_id', empIds);
    await s.from('payments').delete().in('employee_id', empIds);
    await s.from('bonus_removals').delete().in('employee_id', empIds);
    await s.from('bonus_blocks').delete().in('employee_id', empIds);
    await s.from('geo_fraud_attempts').delete().in('employee_id', empIds);
    await s.from('employees').delete().in('id', empIds);
  }

  // bonus_types criados pelos testes (name começa com PREFIX)
  await s.from('bonus_types').delete().like('name', `${PREFIX}%`);

  // triage_errors em datas seguras dos testes (qualquer empresa)
  await s.from('triage_errors').delete().in('date', [SAFE_DATE, SAFE_DATE_2]);
}

interface CreatedEmployee { id: string; cpf: string; }

async function createEmployeeForCompany(
  s: SupabaseClient,
  companyId: string,
  suffix: string,
  cpfOverride?: string,
): Promise<CreatedEmployee> {
  const cpf = cpfOverride ?? `9${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`.slice(0, 11);
  const { data, error } = await s
    .from('employees')
    .insert([{
      name: `${PREFIX}${suffix}`,
      cpf,
      employment_type: 'CLT',
      created_by: '9999',
      company_id: companyId,
    }])
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id, cpf };
}

test.describe('Isolamento multi-empresa', () => {
  test.beforeAll(async () => {
    const s = getClient();
    const ids = await discoverCompanies(s);
    CARATINGA_ID = ids.caratingaId;
    PONTE_NOVA_ID = ids.ponteNovaId;
    await cleanupIsolation(); // limpa resíduo de runs anteriores
  });

  test.afterEach(async () => {
    await cleanupIsolation();
  });

  test.afterAll(async () => {
    await cleanupIsolation();
    // Verificação final — alerta gritante se sobrou lixo
    const s = getClient();
    const { count } = await s
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .like('name', `${PREFIX}%`);
    if ((count ?? 0) > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n!!!!!!!!!! ATENÇÃO: ${count} funcionário(s) PWTest_isol_ sobraram após cleanup. Limpar manualmente. !!!!!!!!!!\n`);
    }
  });

  test('1. Caratinga tem dados pré-existentes (count > 0)', async () => {
    const s = getClient();
    const { count, error } = await s
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', CARATINGA_ID);
    expect(error).toBeNull();
    expect(count ?? 0).toBeGreaterThan(0);
  });

  test('2. Ponte Nova: cria 2 funcs com prefix → conta 2 → deleta → conta 0', async () => {
    const s = getClient();
    const a = await createEmployeeForCompany(s, PONTE_NOVA_ID, 'PN_count_A');
    const b = await createEmployeeForCompany(s, PONTE_NOVA_ID, 'PN_count_B');

    const { data: list, count } = await s
      .from('employees')
      .select('id, name', { count: 'exact' })
      .eq('company_id', PONTE_NOVA_ID)
      .like('name', `${PREFIX}%`);
    expect(count).toBe(2);
    expect((list ?? []).map((r: { id: string }) => r.id).sort()).toEqual([a.id, b.id].sort());

    await s.from('employees').delete().in('id', [a.id, b.id]);

    const { count: count2 } = await s
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', PONTE_NOVA_ID)
      .like('name', `${PREFIX}%`);
    expect(count2).toBe(0);
  });

  // COMBO I 1.21: reabilitado após migration UNIQUE multi-empresa (commit 0db258b)
  test('3. CPF idêntico em Caratinga e Ponte Nova: cada empresa vê o seu', async () => {
    const s = getClient();
    const sharedCpf = `99${Date.now().toString().slice(-9)}`.slice(0, 11);
    const c = await createEmployeeForCompany(s, CARATINGA_ID, 'shared_C', sharedCpf);
    const p = await createEmployeeForCompany(s, PONTE_NOVA_ID, 'shared_P', sharedCpf);

    const { data: bothEmpresas } = await s.from('employees').select('id, company_id').eq('cpf', sharedCpf);
    expect((bothEmpresas ?? []).length).toBe(2);

    const { data: onlyC } = await s
      .from('employees')
      .select('id')
      .eq('cpf', sharedCpf)
      .eq('company_id', CARATINGA_ID);
    expect((onlyC ?? []).length).toBe(1);
    expect((onlyC?.[0] as { id: string }).id).toBe(c.id);

    const { data: onlyP } = await s
      .from('employees')
      .select('id')
      .eq('cpf', sharedCpf)
      .eq('company_id', PONTE_NOVA_ID);
    expect((onlyP ?? []).length).toBe(1);
    expect((onlyP?.[0] as { id: string }).id).toBe(p.id);
  });

  test('4. bonus_types: cada empresa tem seus B/C1/C2 com IDs distintos', async () => {
    const s = getClient();
    const { data: cTypes } = await s
      .from('bonus_types')
      .select('id, code')
      .eq('company_id', CARATINGA_ID)
      .eq('active', true);
    const { data: pTypes } = await s
      .from('bonus_types')
      .select('id, code')
      .eq('company_id', PONTE_NOVA_ID)
      .eq('active', true);

    const cCodes = new Set((cTypes ?? []).map((b: { code: string }) => b.code));
    const pCodes = new Set((pTypes ?? []).map((b: { code: string }) => b.code));
    expect(cCodes).toEqual(new Set(['B', 'C1', 'C2']));
    expect(pCodes).toEqual(new Set(['B', 'C1', 'C2']));

    // IDs específicos por empresa: o registro 'B' de Caratinga ≠ 'B' de Ponte Nova
    const cB = (cTypes as Array<{ id: string; code: string }>).find(t => t.code === 'B')?.id;
    const pB = (pTypes as Array<{ id: string; code: string }>).find(t => t.code === 'B')?.id;
    expect(cB).toBeTruthy();
    expect(pB).toBeTruthy();
    expect(cB).not.toBe(pB);
  });

  test('5. Tipo customizado em Caratinga não aparece em Ponte Nova', async () => {
    const s = getClient();
    const { data: created, error } = await s
      .from('bonus_types')
      .insert([{
        company_id: CARATINGA_ID,
        code: 'TX',
        name: `${PREFIX}TX_only_C`,
        default_value: 5,
        order_index: 99,
        active: true,
      }])
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(created).toBeTruthy();

    const { data: pTypes } = await s
      .from('bonus_types')
      .select('code, name')
      .eq('company_id', PONTE_NOVA_ID)
      .eq('active', true);
    const pCodes = (pTypes ?? []).map((t: { code: string }) => t.code);
    expect(pCodes).not.toContain('TX');

    const { data: cTypes } = await s
      .from('bonus_types')
      .select('code')
      .eq('company_id', CARATINGA_ID)
      .eq('code', 'TX');
    expect((cTypes ?? []).length).toBe(1);
  });

  test('6. Attendance criado em Caratinga não aparece em Ponte Nova', async () => {
    const s = getClient();
    const emp = await createEmployeeForCompany(s, CARATINGA_ID, 'att_C');
    const { error } = await s.from('attendance').insert([{
      employee_id: emp.id,
      date: SAFE_DATE,
      status: 'present',
      marked_by: '9999',
      company_id: CARATINGA_ID,
    }]);
    expect(error).toBeNull();

    const { data: cAtt } = await s
      .from('attendance')
      .select('id')
      .eq('company_id', CARATINGA_ID)
      .eq('date', SAFE_DATE)
      .eq('employee_id', emp.id);
    expect((cAtt ?? []).length).toBe(1);

    const { data: pAtt } = await s
      .from('attendance')
      .select('id')
      .eq('company_id', PONTE_NOVA_ID)
      .eq('date', SAFE_DATE)
      .eq('employee_id', emp.id);
    expect((pAtt ?? []).length).toBe(0);
  });

  test('7. Payment criado em Caratinga não aparece em Ponte Nova', async () => {
    const s = getClient();
    const emp = await createEmployeeForCompany(s, CARATINGA_ID, 'pay_C');
    const { error } = await s.from('payments').insert([{
      employee_id: emp.id,
      date: SAFE_DATE,
      daily_rate: 100,
      bonus: 0,
      total: 100,
      created_by: '9999',
      company_id: CARATINGA_ID,
    }]);
    expect(error).toBeNull();

    const { data: cPay } = await s
      .from('payments')
      .select('id')
      .eq('company_id', CARATINGA_ID)
      .eq('employee_id', emp.id);
    expect((cPay ?? []).length).toBe(1);

    const { data: pPay } = await s
      .from('payments')
      .select('id')
      .eq('company_id', PONTE_NOVA_ID)
      .eq('employee_id', emp.id);
    expect((pPay ?? []).length).toBe(0);
  });

  test('8. error_records: isolados via employee.company_id', async () => {
    const s = getClient();
    const empC = await createEmployeeForCompany(s, CARATINGA_ID, 'err_C');
    const empP = await createEmployeeForCompany(s, PONTE_NOVA_ID, 'err_P');

    await s.from('error_records').insert([
      { employee_id: empC.id, date: SAFE_DATE, error_count: 1, error_type: 'quantity', error_value: 0, observations: `${PREFIX}err1`, created_by: '9999' },
      { employee_id: empP.id, date: SAFE_DATE, error_count: 1, error_type: 'quantity', error_value: 0, observations: `${PREFIX}err2`, created_by: '9999' },
    ]);

    // Cross-join via employee.company_id pra checar isolamento
    const { data: errsC } = await s
      .from('error_records')
      .select('id, employees!inner(company_id)')
      .eq('employees.company_id', CARATINGA_ID)
      .eq('date', SAFE_DATE)
      .like('observations', `${PREFIX}%`);
    expect((errsC ?? []).length).toBe(1);

    const { data: errsP } = await s
      .from('error_records')
      .select('id, employees!inner(company_id)')
      .eq('employees.company_id', PONTE_NOVA_ID)
      .eq('date', SAFE_DATE)
      .like('observations', `${PREFIX}%`);
    expect((errsP ?? []).length).toBe(1);
  });

  // COMBO I 1.21: reabilitado após migration UNIQUE multi-empresa (commit 0db258b)
  test('9. triage_errors: isolados por company_id direto', async () => {
    const s = getClient();
    await s.from('triage_errors').insert([
      { date: SAFE_DATE, triage_type: 'quantity', error_count: 5, direct_value: 0, observations: `${PREFIX}triag_C`, created_by: '9999', company_id: CARATINGA_ID },
      { date: SAFE_DATE, triage_type: 'quantity', error_count: 8, direct_value: 0, observations: `${PREFIX}triag_P`, created_by: '9999', company_id: PONTE_NOVA_ID },
    ]);

    const { data: tC } = await s
      .from('triage_errors')
      .select('id, error_count')
      .eq('company_id', CARATINGA_ID)
      .eq('date', SAFE_DATE);
    expect((tC ?? []).length).toBe(1);
    expect((tC?.[0] as { error_count: number }).error_count).toBe(5);

    const { data: tP } = await s
      .from('triage_errors')
      .select('id, error_count')
      .eq('company_id', PONTE_NOVA_ID)
      .eq('date', SAFE_DATE);
    expect((tP ?? []).length).toBe(1);
    expect((tP?.[0] as { error_count: number }).error_count).toBe(8);
  });

  test('10. UI: CompanySelector mostra ambas empresas após login admin', async ({ page }) => {
    await page.goto('/');
    await page.locator('#id').fill(ADMIN.id);
    await page.locator('#password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('Caratinga', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ponte Nova', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByText('Ponte Nova', { exact: false }).first().click();
    await expect(page.getByRole('button', { name: /Ponto/ })).toBeVisible({ timeout: 15_000 });
  });

  test('11. Permissão dinâmica usa bt.id distinto por empresa', async () => {
    const s = getClient();
    const { data: cB } = await s
      .from('bonus_types')
      .select('id')
      .eq('company_id', CARATINGA_ID)
      .eq('code', 'B')
      .single();
    const { data: pB } = await s
      .from('bonus_types')
      .select('id')
      .eq('company_id', PONTE_NOVA_ID)
      .eq('code', 'B')
      .single();

    const cId = (cB as { id: string } | null)?.id;
    const pId = (pB as { id: string } | null)?.id;
    expect(cId).toBeTruthy();
    expect(pId).toBeTruthy();
    expect(cId).not.toBe(pId);

    // Permission keys são distintas por empresa: applyBonus_<cId> ≠ applyBonus_<pId>
    expect(`applyBonus_${cId}`).not.toBe(`applyBonus_${pId}`);
  });

  test('12. Insert com company_id=Ponte Nova fica em Ponte Nova, não em Caratinga', async () => {
    const s = getClient();
    const emp = await createEmployeeForCompany(s, PONTE_NOVA_ID, 'bulk_PN');

    const { data: inPN } = await s
      .from('employees')
      .select('id')
      .eq('id', emp.id)
      .eq('company_id', PONTE_NOVA_ID);
    expect((inPN ?? []).length).toBe(1);

    const { data: inC } = await s
      .from('employees')
      .select('id')
      .eq('id', emp.id)
      .eq('company_id', CARATINGA_ID);
    expect((inC ?? []).length).toBe(0);
  });
});
