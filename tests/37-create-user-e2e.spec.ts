import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN, loginAs, goToTab, logout } from './helpers';
import { getClient } from './cleanup';

/**
 * Sub-fase 14.5 — Spec E2E end-to-end pra createUser via UI Admin.
 *
 * A sub-fase 11.7 (edge fn create-user com bcrypt) foi validada apenas
 * via curl direto contra prod. Falta cobrir o fluxo COMPLETO via UI:
 *
 *   admin login → UsersTab → form Criar Supervisor → submit → toast →
 *   row em users (password_hash bcrypt) → logout → login do novo supervisor
 *
 * IDs de teste: prefix `97` (improvável em prod). Cleanup via SQL.
 */

const TEST_PREFIX = '97';
const TEST_IDS = ['97001', '97002', '97003', '97004', '97005'];
const TEST_PASSWORD = 'testpw12';
const SHORT_PASSWORD = 'ab';

async function cleanupTestUsers(): Promise<void> {
  const s = getClient();
  // bcrypt + ALL test users (role=supervisor, prefix 97)
  await s.from('users').delete().like('id', `${TEST_PREFIX}%`).eq('role', 'supervisor');
  // Cleanup permissoes vinculadas tambem (FK)
  await s.from('user_permissions').delete().like('user_id', `${TEST_PREFIX}%`);
}

/**
 * Sub-fase 14.9 — Warmup COMPLETO da edge fn `create-user`.
 *
 * Cold-start residual: a primeira chamada pós-idle (>5min) baixa `esm.sh/bcryptjs`
 * e demora até 150s (TECH_DEBT 6.13). Body vazio não força handler full —
 * import bcryptjs ocorre mas `bcrypt.hash()` não roda. Warmup parcial deixa
 * o worker "morno" em vez de quente.
 *
 * Solução: chamar a edge fn com body VÁLIDO no `beforeAll` (fora do test timeout).
 * Faz login admin via auth-login → JWT custom → create-user com user `97000`.
 * O handler roda bcrypt.hash + INSERT completo — worker fica 100% warm.
 * `cleanupTestUsers` no beforeEach limpa o 97000 antes do test 1.
 *
 * Best-effort: se falhar (sem .env, edge fn down), segue. Test timeouts cobrem.
 */
async function warmupCreateUserEdgeFn(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return;

  try {
    // 1) Login admin via auth-login pra obter JWT custom
    const loginCtrl = new AbortController();
    const loginTimer = setTimeout(() => loginCtrl.abort(), 60_000);
    const loginResp = await fetch(`${url}/functions/v1/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({ id: '9999', password: '684171' }),
      signal: loginCtrl.signal,
    });
    clearTimeout(loginTimer);
    if (!loginResp.ok) return;
    const loginData = (await loginResp.json().catch(() => ({}))) as { token?: string };
    const token = loginData.token;
    if (!token) return;

    // 2) create-user com user warmup `97000` (fora do TEST_IDS); cleanupTestUsers
    // do beforeEach do test 1 limpa antes do primeiro test rodar.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    await fetch(`${url}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: '97000',
        password: 'warmup1234',
        role: 'supervisor',
        companyId: '6583bb2a-e334-41a7-b69c-7d98f3b46dfc',
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    /* warmup é best-effort — se falhar, timeouts dos tests cobrem */
  }
}

test.describe('CreateUser E2E via UsersTab (sub-fase 14.5)', () => {
  // ⚠️ Test timeout estendido: a edge fn create-user usa bcrypt(10) que pode
  // levar 400ms (warm) a 150s (cold-start IDLE_TIMEOUT da Supabase Edge
  // Functions). Em batch (após várias specs), workers ficam frios e timeouts
  // são frequentes. 180s acomoda warmup + cold-start residual sem mascarar bugs.
  //
  // Sub-fase 14.9: aumentado de 60s → 90s → 180s + warmup explícito no beforeAll
  // após batch 13/05/2026 revelar test 5 falhando com cold-start >60s.
  // Sub-fase 14.11: aumentado pra 240s (test 1 contra prod URL pega cold-start
  // residual mesmo após warmup beforeAll — TECH_DEBT 6.13).
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async () => {
    // 2026-07-19 — RAIZ do flake histórico deste spec: o timeout do describe.configure
    // vale pros TESTES, não pros hooks; o beforeAll morria em 30s quando a edge fn
    // create-user estava fria (cold start ~150s documentado) → testes falhavam com 0ms.
    test.setTimeout(240_000);
    await cleanupTestUsers();
    // Força cold-start ANTES dos tests reais (ver warmupCreateUserEdgeFn doc).
    await warmupCreateUserEdgeFn();
  });
  test.afterAll(cleanupTestUsers);

  test.beforeEach(async () => {
    // Cleanup defensivo antes de cada teste pra evitar pollution entre runs
    await cleanupTestUsers();
  });

  test('1. Admin cria supervisor com sucesso → row bcrypt em DB', async ({ page }) => {
    const id = TEST_IDS[0];
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');

    // Abre o form
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await expect(page.getByRole('heading', { name: /Criar Novo Supervisor/ })).toBeVisible({ timeout: 10_000 });

    // Preenche
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill(TEST_PASSWORD);

    // Submit (botão dentro do form, type=submit)
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();

    // Toast de sucesso (react-hot-toast). Timeout 60s pra tolerar cold-start
    // da edge fn create-user (bcrypt 10 rounds, ver describe timeout acima).
    await expect(page.getByText(/Supervisor criado com sucesso/i)).toBeVisible({ timeout: 180_000 });

    // Valida row em DB com bcrypt $2a$10$
    const s = getClient();
    const { data, error } = await s
      .from('users')
      .select('id, role, password_hash, created_by, company_id')
      .eq('id', id)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(id);
    expect(data?.role).toBe('supervisor');
    expect(data?.created_by).toBe('9999');
    expect(data?.password_hash).toMatch(/^\$2a\$10\$/);
    expect(data?.password_hash?.length).toBe(60);
  });

  test('2. ID duplicado → toast "ID já existe"', async ({ page }) => {
    const id = TEST_IDS[1];

    // ⚠️ Fix de flakiness: a edge fn create-user usa bcrypt(10 rounds)
    // que pode levar de 400ms a 150s (IDLE_TIMEOUT) por chamada cold-start.
    // O teste anterior fazia 2 chamadas sequenciais via UI — a 2ª frequen-
    // temente pegava cold worker e timeoutava antes do toast de erro
    // aparecer. Solução: pré-criar o user direto via DB (bypassa bcrypt
    // do edge fn) e validar que a 2ª chamada via UI retorna 409 conforme
    // esperado. O fluxo crítico testado (UI → edge fn → 409 → toast)
    // segue coberto, mas agora com APENAS 1 chamada de edge fn.
    const s = getClient();
    await s.from('users').insert([{
      id,
      // password_hash arbitrário válido bcrypt — não vamos logar com ele
      password_hash: '$2a$10$abcdefghijklmnopqrstuv1234567890ABCDEFGHIJKLMNOPQRSTUV',
      role: 'supervisor',
      created_by: '9999',
      company_id: '6583bb2a-e334-41a7-b69c-7d98f3b46dfc',
    }]);

    // Tenta criar via UI com mesmo ID → edge fn deve retornar 409
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill(TEST_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();

    // Toast de erro (mensagem do edge fn ou frontend). Timeout 60s pra
    // tolerar cold-start ocasional da edge fn nessa única chamada.
    await expect(page.getByText(/ID já existe/i)).toBeVisible({ timeout: 180_000 });
  });

  test('3. Senha < 4 caracteres → toast validação frontend', async ({ page }) => {
    const id = TEST_IDS[2];

    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(SHORT_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill(SHORT_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();

    // Toast frontend (validação client-side antes do fetch)
    await expect(page.getByText(/Senha deve ter pelo menos 4 caracteres/i)).toBeVisible({ timeout: 10_000 });

    // User NÃO foi criado
    const s = getClient();
    const { data } = await s.from('users').select('id').eq('id', id).maybeSingle();
    expect(data).toBeNull();
  });

  test('4. Senhas não coincidem → toast validação', async ({ page }) => {
    const id = TEST_IDS[3];

    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill('outra-senha');
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();

    await expect(page.getByText(/Senhas não coincidem/i)).toBeVisible({ timeout: 10_000 });

    const s = getClient();
    const { data } = await s.from('users').select('id').eq('id', id).maybeSingle();
    expect(data).toBeNull();
  });

  test('5. Novo supervisor consegue fazer login após criação', async ({ page }) => {
    // Sub-fase 14.11 / TECH_DEBT 6.28: re-warmup antes do test 5. Tests 2-4
    // são validação local (sem edge fn) — workers da `create-user` podem
    // esfriar e o cold-start absoluto (~150s) excede o expect timeout.
    // Warmup é fora do test timeout do test 5, força worker warm de novo.
    await warmupCreateUserEdgeFn();

    const id = TEST_IDS[4];

    // Cria via UI
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill(TEST_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();
    // Timeout 60s pra cold-start da edge fn create-user (ver test 1).
    await expect(page.getByText(/Supervisor criado com sucesso/i)).toBeVisible({ timeout: 180_000 });

    // Logout do admin
    await logout(page);

    // Login do novo supervisor
    await page.locator('#id').fill(id);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Supervisor vai direto pro painel (sem CompanySelector — só admin '9999' tem)
    await expect(page.getByRole('button', { name: /Ponto/ })).toBeVisible({ timeout: 15_000 });
  });
});
