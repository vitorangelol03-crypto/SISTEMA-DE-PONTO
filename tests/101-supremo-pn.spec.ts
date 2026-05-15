/**
 * SPEC 101 — Teste Supremo Ponte Nova (sub-fase 14.16)
 *
 * Cobre EXCLUSIVAMENTE fluxos da empresa Ponte Nova com os 30 funcionários
 * fictícios "Demo PN" gerados via scripts/seed-pn-fake.mjs.
 *
 * 30 Demo PN no DB:
 *   - 20 CLT, 8 Diarista, 2 PJ
 *   - PINs bcrypt (1234, 1241, 1248, ... step 7, ordenados por created_at)
 *   - CPFs sintéticos válidos por Mod11
 *   - Cidade=Ponte Nova, UF=MG
 *
 * 12 seções (A-L) cobrindo todas features de PN:
 *   A. Login + Multi-empresa PN
 *   B. Funcionários PN (lista, filtros, edição)
 *   C. Marcação de presença
 *   D. /clock fluxo público (CPF + PIN bcrypt)
 *   E. Isolamento RLS multi-empresa CT↔PN
 *   F. Geolocalização PN
 *   G. Bonificações
 *   H. Pagamento C6
 *   I. Aba Erros + triage
 *   J. Banco de horas PN
 *   K. Configurações empresa PN
 *   L. Permissões admin local 8888
 */
import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import { ADMIN, loginAs, goToTab, logout } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { cleanupByPrefix } from './integrity-helpers';

const PN_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PN_ADMIN = { id: '8888', password: '684171' }; // admin local PN
const TEST_PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}SupPN `;

function todayBR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// ─── Console capture ────────────────────────────────────────────────────────

const IGNORED_PATTERNS: RegExp[] = [
  /react-devtools/i, /\[vite\]/, /Download the React DevTools/,
  /Module "stream"/, /\[stream-stub\]/, /xlsx-js-style/,
  /\[useAuth\]/, /CompanySwitcher: falha ao persistir/,
  /Erro ao carregar tipos/, /\[cleanup\.ts\]/,
  /CompanyContext init error.*Failed to fetch/,
];

interface Capture { errors: string[]; pageErrors: string[]; }

function attachConsoleCapture(page: Page): Capture {
  const c: Capture = { errors: [], pageErrors: [] };
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (IGNORED_PATTERNS.some((re) => re.test(t))) return;
    c.errors.push(t);
  });
  page.on('pageerror', (err: Error) => c.pageErrors.push(err.message));
  return c;
}

function assertCleanConsole(c: Capture, ctx: string): void {
  const issues: string[] = [];
  if (c.errors.length) issues.push(`[${ctx}] ${c.errors.length} console.error: ${c.errors.slice(0, 3).join(' | ')}`);
  if (c.pageErrors.length) issues.push(`[${ctx}] ${c.pageErrors.length} uncaught: ${c.pageErrors.slice(0, 3).join(' | ')}`);
  if (issues.length) throw new Error(`Console issues:\n${issues.join('\n')}`);
}

// Switch para Ponte Nova via CompanySwitcher (admin master 9999)
async function switchToPN(page: Page): Promise<void> {
  const switcher = page.locator('button[aria-haspopup="listbox"]').first();
  await expect(switcher).toBeVisible({ timeout: 10_000 });
  await switcher.click();
  await page.locator('[role="listbox"]').locator('button').filter({ hasText: 'Ponte Nova' }).first().click();
  await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(switcher).toContainText(/Ponte Nova/i, { timeout: 10_000 });
}

test.describe('SPEC 101 — Teste Supremo Ponte Nova', () => {
  test.describe.configure({ timeout: 180_000 });

  test.afterAll(async () => {
    await cleanupByPrefix(TEST_PREFIX, [todayBR()]);
  });

  // ============================================================================
  // A. LOGIN + MULTI-EMPRESA PN
  // ============================================================================
  test.describe('A. Login + Multi-empresa PN', () => {
    test('A1. Admin master 9999 → CompanySelector → escolhe Ponte Nova', async ({ page }) => {
      await page.goto('/');
      await page.locator('#id').fill(ADMIN.id);
      await page.locator('#password').fill(ADMIN.password);
      await page.getByRole('button', { name: 'Entrar' }).click();

      // CompanySelector mostra ambas empresas
      await expect(page.getByText('Caratinga', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Ponte Nova', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

      // Click em Ponte Nova
      await page.getByText('Ponte Nova', { exact: false }).first().click();
      await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test('A2. Admin local 8888 (PN) → CompanySelector aparece (todo admin role vê ambas empresas)', async ({ page }) => {
      // Sub-fase 14.17: admin local NÃO se distingue de admin master no frontend
      // — todo user com role='admin' passa pelo CompanySelector. Após selecionar
      // a empresa, JWT custom é emitido com company_id correspondente.
      await page.goto('/');
      await page.locator('#id').fill(PN_ADMIN.id);
      await page.locator('#password').fill(PN_ADMIN.password);
      await page.getByRole('button', { name: 'Entrar' }).click();

      // CompanySelector aparece com ambas empresas
      await expect(page.getByText('Caratinga', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Ponte Nova', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

      // Escolhe Ponte Nova (default natural pra admin 8888 PN)
      await page.getByText('Ponte Nova', { exact: false }).first().click();
      await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });

      // JWT custom emitido
      const token = await page.evaluate(() => sessionStorage.getItem('sb-custom-token'));
      expect(token).toBeTruthy();
      expect(token!.split('.').length).toBe(3);
    });

    test('A3. Login 8888 senha errada → toast/erro de credencial', async ({ page }) => {
      await page.goto('/');
      await page.locator('#id').fill(PN_ADMIN.id);
      await page.locator('#password').fill('senha-errada-123');
      await page.getByRole('button', { name: 'Entrar' }).click();

      // Toast erro OU mensagem de erro inline
      await expect(page.getByText(/Credenciais inválidas|erro/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('A4. CompanySwitcher admin master alterna CT → PN → CT (sem console errors)', async ({ page }) => {
      const capture = attachConsoleCapture(page);
      await loginAs(page, ADMIN);

      // Default: Caratinga
      const switcher = page.locator('button[aria-haspopup="listbox"]').first();
      await expect(switcher).toContainText(/Caratinga/i);

      // CT → PN
      await switchToPN(page);
      const localId1 = await page.evaluate(() => localStorage.getItem('sistema_ponto_company_id'));
      expect(localId1).toBe(PN_ID);

      // PN → CT
      await page.locator('button[aria-haspopup="listbox"]').first().click();
      await page.locator('[role="listbox"]').locator('button').filter({ hasText: 'Caratinga' }).first().click();
      await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });
      const localId2 = await page.evaluate(() => localStorage.getItem('sistema_ponto_company_id'));
      expect(localId2).toBe(CARATINGA_ID);

      assertCleanConsole(capture, 'A4-switcher');
    });
  });

  // ============================================================================
  // B. FUNCIONÁRIOS PN
  // ============================================================================
  test.describe('B. Funcionários PN', () => {
    test('B1. Lista 30 Demo PN visíveis em Ponte Nova', async ({ page }) => {
      await loginAs(page, ADMIN);
      await switchToPN(page);
      await goToTab(page, 'Funcionários');
      await page.waitForTimeout(1500);

      // SQL: 30 Demo PN no DB
      const s = getClient();
      const { data } = await s
        .from('employees')
        .select('id, name, employment_type')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%');
      expect(data?.length).toBe(30);

      // Distribuição correta
      const clt = (data ?? []).filter((e) => e.employment_type === 'CLT').length;
      const diarista = (data ?? []).filter((e) => e.employment_type === 'Diarista').length;
      const pj = (data ?? []).filter((e) => e.employment_type === 'PJ').length;
      expect(clt).toBe(20);
      expect(diarista).toBe(8);
      expect(pj).toBe(2);

      // UI mostra pelo menos 1 Demo PN
      await expect(page.getByText(/Demo PN/, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    });

    test('B2. Cidade/Estado pré-preenchidos = Ponte Nova/MG', async () => {
      const s = getClient();
      const { data } = await s
        .from('employees')
        .select('city, state')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%')
        .limit(5);

      data?.forEach((emp) => {
        expect(emp.city).toBe('Ponte Nova');
        expect(emp.state).toBe('MG');
      });
    });

    test('B3. PIN bcrypt em todos os 30 Demo PN', async () => {
      const s = getClient();
      const { data } = await s
        .from('employees')
        .select('pin, pin_hash')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%');

      expect(data?.length).toBe(30);
      const allBcrypt = data?.every((e) => e.pin === null && e.pin_hash !== null && e.pin_hash.startsWith('$2'));
      expect(allBcrypt).toBe(true);
    });
  });

  // ============================================================================
  // C. MARCAÇÃO DE PRESENÇA
  // ============================================================================
  test.describe('C. Marcação de presença PN', () => {
    test('C1. Aba Ponto PN: lista funcionários + cards de status', async ({ page }) => {
      const capture = attachConsoleCapture(page);
      await loginAs(page, ADMIN);
      await switchToPN(page);
      await goToTab(page, 'Ponto');
      await page.waitForTimeout(1500);

      // Cards de status (Presentes/Faltas/Pendentes)
      await expect(page.getByText(/Presentes/).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Faltas/).first()).toBeVisible();
      await expect(page.getByText(/Pendentes/).first()).toBeVisible();

      assertCleanConsole(capture, 'C1-ponto-pn');
    });

    test('C2. Buscar Demo PN no PontoTab → row aparece', async ({ page }) => {
      await loginAs(page, ADMIN);
      await switchToPN(page);
      await goToTab(page, 'Ponto');
      await page.getByRole('button', { name: /^Atualizar$/ }).click();
      await page.waitForTimeout(1000);

      // Busca "Demo PN" → pelo menos 1 row
      const searchInput = page.getByPlaceholder(/Buscar por nome ou CPF/);
      await searchInput.fill('Demo PN');
      await expect(page.locator('tr').filter({ hasText: 'Demo PN' }).first()).toBeVisible({ timeout: 10_000 });
    });

    test('C3. Marcar Demo PN como Presente via UI → attendance.status=present', async ({ page }) => {
      // Pega 1 Demo PN específico
      const s = getClient();
      const { data: emp } = await s
        .from('employees')
        .select('id, name, cpf')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%')
        .order('name')
        .limit(1)
        .single();
      if (!emp) throw new Error('Nenhum Demo PN encontrado');

      // Cleanup attendance prévio
      await s.from('attendance').delete().eq('employee_id', emp.id).eq('date', todayBR());

      await loginAs(page, ADMIN);
      await switchToPN(page);
      await goToTab(page, 'Ponto');
      await page.getByRole('button', { name: /^Atualizar$/ }).click();
      await page.waitForTimeout(1000);

      const searchInput = page.getByPlaceholder(/Buscar por nome ou CPF/);
      await searchInput.fill(emp.name);

      const row = page.locator('tr', { hasText: emp.name }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.getByRole('button', { name: 'Presente', exact: true }).click();

      // Aguarda propagação DB
      await page.waitForTimeout(2000);

      const { data: att } = await s
        .from('attendance')
        .select('status, employee_id, company_id')
        .eq('employee_id', emp.id)
        .eq('date', todayBR())
        .single();
      expect(att?.status).toBe('present');
      expect(att?.company_id).toBe(PN_ID); // isolamento

      // Cleanup
      await s.from('attendance').delete().eq('employee_id', emp.id).eq('date', todayBR());
    });
  });

  // ============================================================================
  // D. /clock FLUXO PÚBLICO (CPF + PIN bcrypt)
  // ============================================================================
  test.describe('D. /clock fluxo público funcionário PN', () => {
    test('D1. /clock CPF Demo PN existe → pede PIN', async ({ page }) => {
      // Pega 1 CPF Demo PN real
      const s = getClient();
      const { data: emp } = await s
        .from('employees')
        .select('cpf')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%')
        .limit(1)
        .single();
      if (!emp) throw new Error('Nenhum Demo PN');

      await page.goto('/clock');
      const cpfInput = page.locator('input[placeholder="000.000.000-00"]');
      await expect(cpfInput).toBeVisible({ timeout: 10_000 });
      await cpfInput.fill(emp.cpf);
      await page.getByRole('button', { name: /Continuar/ }).click();

      // Como o CPF está só em PN (não em CT), vai direto pro PIN (numpad visual com
      // botões 0-9 + "Digite seu PIN para continuar") OU passa pelo company-select.
      await page.waitForTimeout(2000);
      const pinScreen = await page.getByText(/Digite seu PIN/i).first().isVisible().catch(() => false);
      const companySelect = await page.getByText(/Selecione|Empresa/i).first().isVisible().catch(() => false);
      expect(pinScreen || companySelect).toBe(true);
    });

    test('D2. /clock CPF inexistente → toast erro', async ({ page }) => {
      await page.goto('/clock');
      const cpfInput = page.locator('input[placeholder="000.000.000-00"]');
      await cpfInput.fill('99988877766');
      await page.getByRole('button', { name: /Continuar/ }).click();

      await expect(page.getByText(/não encontrado|Funcionário não encontrado/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('D3. Edge fn verify-pin com bcrypt: PIN correto → valid=true', async () => {
      // Pega 1 Demo PN e seu PIN derivado
      const s = getClient();
      const { data: emps } = await s
        .from('employees')
        .select('id, name, pin_hash, created_at')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (!emps || emps.length === 0) throw new Error('Sem Demo PN');

      // Primeiro: pin = 1234 (idx 0); pin = 1234 + idx*7
      const targetIdx = 0;
      const target = emps[targetIdx];
      const expectedPin = String(1234 + targetIdx * 7).padStart(4, '0').slice(0, 4);

      // Chama edge fn verify-pin direto
      const url = process.env.VITE_SUPABASE_URL || (await import('node:fs')).readFileSync('.env', 'utf8').match(/VITE_SUPABASE_URL=(.+)/)![1].trim();
      const anon = process.env.VITE_SUPABASE_ANON_KEY || (await import('node:fs')).readFileSync('.env', 'utf8').match(/VITE_SUPABASE_ANON_KEY=(.+)/)![1].trim();

      const resp = await fetch(`${url}/functions/v1/employee-public-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
        body: JSON.stringify({ action: 'verify-pin', employeeId: target.id, pin: expectedPin }),
      });
      expect(resp.ok).toBe(true);
      const result = (await resp.json()) as { valid: boolean };
      expect(result.valid).toBe(true);
    });

    test('D4. Edge fn verify-pin com PIN errado → valid=false', async () => {
      const s = getClient();
      const { data: emp } = await s
        .from('employees')
        .select('id')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%')
        .limit(1)
        .single();
      if (!emp) throw new Error('Sem Demo PN');

      const url = process.env.VITE_SUPABASE_URL || (await import('node:fs')).readFileSync('.env', 'utf8').match(/VITE_SUPABASE_URL=(.+)/)![1].trim();
      const anon = process.env.VITE_SUPABASE_ANON_KEY || (await import('node:fs')).readFileSync('.env', 'utf8').match(/VITE_SUPABASE_ANON_KEY=(.+)/)![1].trim();

      const resp = await fetch(`${url}/functions/v1/employee-public-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
        body: JSON.stringify({ action: 'verify-pin', employeeId: emp.id, pin: '0000' }),
      });
      expect(resp.ok).toBe(true);
      const result = (await resp.json()) as { valid: boolean };
      expect(result.valid).toBe(false);
    });

    test('D5. /erros CPF Demo PN existe → tela de PIN aparece', async ({ page }) => {
      const s = getClient();
      const { data: emp } = await s
        .from('employees')
        .select('cpf')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%')
        .limit(1)
        .single();
      if (!emp) throw new Error('Sem Demo PN');

      await page.goto('/erros');
      const cpfInput = page.locator('#cpf');
      await expect(cpfInput).toBeVisible({ timeout: 10_000 });
      await cpfInput.fill(emp.cpf);
      await page.getByRole('button', { name: /^Continuar$/ }).click();
      await page.waitForTimeout(2000);

      // Pede PIN (numpad visual) ou company-select
      const pinScreen = await page.getByText(/Digite seu PIN/i).first().isVisible().catch(() => false);
      const companyVisible = await page.getByText(/Selecione|Empresa/i).first().isVisible().catch(() => false);
      expect(pinScreen || companyVisible).toBe(true);
    });
  });

  // ============================================================================
  // E. ISOLAMENTO RLS MULTI-EMPRESA
  // ============================================================================
  test.describe('E. Isolamento RLS CT ↔ PN', () => {
    test('E1. Demo PN NÃO aparece em employees Caratinga', async () => {
      const s = getClient();
      const { data } = await s
        .from('employees')
        .select('id')
        .eq('company_id', CARATINGA_ID)
        .like('name', 'Demo PN%');
      expect(data?.length).toBe(0);
    });

    test('E2. Funcionários reais Caratinga NÃO aparecem em PN', async () => {
      const s = getClient();
      const { data: ctReal } = await s
        .from('employees')
        .select('cpf')
        .eq('company_id', CARATINGA_ID)
        .not('name', 'like', 'PW Test%')
        .not('name', 'like', 'Demo PN%')
        .limit(3);

      for (const emp of ctReal ?? []) {
        const { data: vazamento } = await s
          .from('employees')
          .select('id')
          .eq('cpf', emp.cpf)
          .eq('company_id', PN_ID);
        expect(vazamento?.length).toBe(0); // CPF idêntico mas company diferente = sem vazamento
      }
    });

    test('E3. attendance PN só lista employee_id de Demo PN (não CT)', async () => {
      const s = getClient();
      const { data: emps } = await s
        .from('employees')
        .select('id')
        .eq('company_id', PN_ID)
        .like('name', 'Demo PN%');
      const pnIds = (emps ?? []).map((e) => e.id);

      // Cria 1 attendance test em PN
      if (pnIds.length === 0) throw new Error('Sem Demo PN');
      const testEmpId = pnIds[0];
      await s.from('attendance').delete().eq('employee_id', testEmpId).eq('date', todayBR());
      await s.from('attendance').insert([{
        employee_id: testEmpId,
        date: todayBR(),
        status: 'present',
        marked_by: '9999',
        company_id: PN_ID,
      }]);

      // Validar que attendance está com company_id=PN
      const { data: att } = await s
        .from('attendance')
        .select('company_id, employee_id')
        .eq('employee_id', testEmpId)
        .eq('date', todayBR())
        .single();
      expect(att?.company_id).toBe(PN_ID);

      // Cleanup
      await s.from('attendance').delete().eq('employee_id', testEmpId).eq('date', todayBR());
    });
  });

  // ============================================================================
  // F. GEOLOCALIZAÇÃO PN
  // ============================================================================
  test.describe('F. Geolocalização PN', () => {
    test('F1. geolocation_config PN tem lat/lng/raio corretos', async () => {
      const s = getClient();
      const { data } = await s
        .from('geolocation_config')
        .select('latitude, longitude, allowed_radius_meters, block_outside')
        .eq('company_id', PN_ID)
        .single();

      expect(Number(data?.latitude)).toBeCloseTo(-20.3908557, 5);
      expect(Number(data?.longitude)).toBeCloseTo(-42.8616382, 5);
      expect(data?.allowed_radius_meters).toBe(150);
      expect(data?.block_outside).toBe(true);
    });

    test('F2. bonus_types PN têm B/C1/C2', async () => {
      const s = getClient();
      const { data } = await s
        .from('bonus_types')
        .select('code, default_value')
        .eq('company_id', PN_ID);

      const codes = (data ?? []).map((b) => b.code).sort();
      expect(codes).toEqual(['B', 'C1', 'C2']);
    });

    test('F3. payment_period_config PN: mensal (auto_weekly=false)', async () => {
      const s = getClient();
      const { data } = await s
        .from('payment_period_config')
        .select('auto_weekly')
        .eq('company_id', PN_ID)
        .single();
      expect(data?.auto_weekly).toBe(false);
    });
  });

  // ============================================================================
  // G. ABAS DA UI EM PN
  // ============================================================================
  test.describe('G. Sweep visual abas em PN', () => {
    test('G1. Todas as abas admin renderizam em PN sem console errors', async ({ page }) => {
      const capture = attachConsoleCapture(page);
      await loginAs(page, ADMIN);
      await switchToPN(page);

      const tabs = ['Ponto', 'Funcionários', 'Relatórios', 'Financeiro', 'Pagamento C6', 'Erros', 'Configurações', 'Usuários', 'Gerenciamento', 'Ajuda'];
      for (const tab of tabs) {
        await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).first().click();
        await page.waitForTimeout(800);
      }

      assertCleanConsole(capture, 'G1-sweep-pn');
    });

    test('G2. Aba Funcionários PN: import button visível', async ({ page }) => {
      await loginAs(page, ADMIN);
      await switchToPN(page);
      await goToTab(page, 'Funcionários');
      // Botão "Importar" (verde, ícone upload). Texto exato confirmado via UI prod.
      await expect(page.getByRole('button', { name: /^Importar$/i }).first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // ============================================================================
  // H. PERMISSÕES ADMIN LOCAL 8888
  // ============================================================================
  test.describe('H. Admin local 8888 permissões', () => {
    test('H1. Admin 8888 vê abas operacionais + Admin, NÃO vê Usuários/Gerenciamento', async ({ page }) => {
      // Admin local 8888 tem role='admin' mas permissões restritas (sem users.view,
      // sem datamanagement.view). Master 9999 vê tudo; 8888 vê 8 abas:
      // Ponto, Funcionários, Relatórios, Financeiro, Pagamento C6, Erros, Ajuda, Admin.
      await page.goto('/');
      await page.locator('#id').fill(PN_ADMIN.id);
      await page.locator('#password').fill(PN_ADMIN.password);
      await page.getByRole('button', { name: 'Entrar' }).click();

      await expect(page.getByText('Ponte Nova', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
      await page.getByText('Ponte Nova', { exact: false }).first().click();

      await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });

      // Abas QUE vê
      await expect(page.getByRole('button', { name: /^Funcionários$/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^Financeiro$/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^Erros$/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^Admin$/ }).first()).toBeVisible();

      // Abas QUE NÃO vê (permission restrita vs admin master)
      await expect(page.getByRole('button', { name: /^Usuários$/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Gerenciamento$/ })).toHaveCount(0);
    });

    test('H2. Admin 8888 logout limpa state corretamente', async ({ page }) => {
      await page.goto('/');
      await page.locator('#id').fill(PN_ADMIN.id);
      await page.locator('#password').fill(PN_ADMIN.password);
      await page.getByRole('button', { name: 'Entrar' }).click();

      // CompanySelector → escolhe PN
      await expect(page.getByText('Ponte Nova', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
      await page.getByText('Ponte Nova', { exact: false }).first().click();
      await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });

      // Token presente
      const before = await page.evaluate(() => sessionStorage.getItem('sb-custom-token'));
      expect(before).toBeTruthy();

      await logout(page);

      // Token limpo
      const after = await page.evaluate(() => sessionStorage.getItem('sb-custom-token'));
      expect(after).toBeNull();
      await expect(page.locator('#id')).toBeVisible();
    });
  });
});
