import { test, expect } from '@playwright/test';
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

test.describe('CreateUser E2E via UsersTab (sub-fase 14.5)', () => {
  test.beforeAll(cleanupTestUsers);
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

    // Toast de sucesso (react-hot-toast)
    await expect(page.getByText(/Supervisor criado com sucesso/i)).toBeVisible({ timeout: 15_000 });

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

    // Cria primeiro (via UI pra exercitar mesmo fluxo)
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill(TEST_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();
    await expect(page.getByText(/Supervisor criado com sucesso/i)).toBeVisible({ timeout: 15_000 });

    // Reabre form e tenta criar de novo com mesmo ID
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill(TEST_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();

    // Toast de erro (mensagem do edge fn ou frontend)
    await expect(page.getByText(/ID já existe/i)).toBeVisible({ timeout: 15_000 });
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
    const id = TEST_IDS[4];

    // Cria via UI
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    await page.getByRole('button', { name: /Criar Supervisor/ }).first().click();
    await page.locator('input[placeholder*="apenas números"]').fill(id);
    await page.locator('input[placeholder*="senha segura"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder*="Confirme a senha"]').fill(TEST_PASSWORD);
    await page.locator('form').getByRole('button', { name: /^Criar Supervisor$/ }).click();
    await expect(page.getByText(/Supervisor criado com sucesso/i)).toBeVisible({ timeout: 15_000 });

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
