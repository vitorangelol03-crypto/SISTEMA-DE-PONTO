import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab, logout } from './helpers';
import { getClient } from './cleanup';

/**
 * Fase A do rework de Usuários (01/09/2026, pedido do Victor): "os usuários
 * agora vão ter que ter nome completo, número de telefone, e vai ter o botão
 * pra redefinir a senha normal, padrão".
 *
 * Cobre o que 37-create-user-e2e.spec.ts ainda não cobria:
 *   1) Admin edita nome/telefone de um supervisor existente (popup Editar).
 *   2) Admin redefine a senha de um supervisor pra senha padrão.
 *   3) O supervisor loga com a senha padrão → tela obrigatória "defina uma
 *      senha nova" (must_change_password) → troca → cai no painel normal →
 *      login seguinte já usa a senha nova, sem a tela obrigatória de novo.
 *
 * IDs de teste: prefix `98` (não colide com o prefix `97` de 37-create-user-e2e).
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const TEST_ID = '98001';
const NEW_OWN_PASSWORD = 'novaSenha123';
// bcrypt válido pra uma senha que nunca é usada nos testes (só ocupa a coluna
// até o reset real acontecer) — mesmo valor usado em 37-create-user-e2e.
const THROWAWAY_HASH = '$2a$10$abcdefghijklmnopqrstuv1234567890ABCDEFGHIJKLMNOPQRSTUV';

async function cleanup(): Promise<void> {
  const s = getClient();
  await s.from('user_permissions').delete().eq('user_id', TEST_ID);
  await s.from('users').delete().eq('id', TEST_ID);
}

test.describe('Fase A — cadastro completo + redefinir senha (01/09/2026)', () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async () => {
    await cleanup();
    const s = getClient();
    const { error } = await s.from('users').insert({
      id: TEST_ID,
      password_hash: THROWAWAY_HASH,
      role: 'supervisor',
      created_by: '9999',
      company_id: CARATINGA_ID,
      name: 'PW Fase A Original',
      phone: '31900000000',
    });
    if (error) throw new Error(`Setup fixture falhou: ${error.message}`);
  });

  test.afterAll(cleanup);

  test('1. Admin edita nome/telefone do supervisor via popup Editar', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');

    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: TEST_ID }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    // getByRole (não getByTitle): no card mobile o botão só tem texto "Editar"
    // (sem atributo title, diferente do ícone-só da tabela desktop) — o nome
    // acessível bate em ambos os layouts.
    await row.getByRole('button', { name: /Editar/i }).click();

    const heading = page.getByRole('heading', { name: `Editar Usuário — ID ${TEST_ID}` });
    await expect(heading).toBeVisible({ timeout: 5_000 });

    const nameInput = page.getByPlaceholder('Digite o nome completo');
    await expect(nameInput).toHaveValue('PW Fase A Original');
    await nameInput.fill('PW Fase A Editado');
    await page.getByPlaceholder('(00) 00000-0000').fill('31988887777');

    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText(/Usuário atualizado com sucesso/i)).toBeVisible({ timeout: 15_000 });

    const s = getClient();
    const { data } = await s.from('users').select('name, phone').eq('id', TEST_ID).single();
    expect(data?.name).toBe('PW Fase A Editado');
    expect(data?.phone).toBe('31988887777');

    // Lista já reflete o novo nome, sem precisar recarregar a página.
    await expect(page.locator('[data-testid="user-row"]:visible').filter({ hasText: 'PW Fase A Editado' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('2. Admin redefine a senha do supervisor → toast mostra a senha padrão + DB atualizado', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');

    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: TEST_ID }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    page.once('dialog', dialog => dialog.accept());
    await row.getByRole('button', { name: /Redefinir Senha/i }).click();

    // bcrypt(10) no edge fn — mesma tolerância de cold-start de 37-create-user-e2e.
    await expect(page.getByText(/Senha redefinida! Nova senha padrão: mudar123/i)).toBeVisible({ timeout: 180_000 });

    const s = getClient();
    const { data } = await s.from('users').select('password_hash, must_change_password').eq('id', TEST_ID).single();
    expect(data?.must_change_password).toBe(true);
    expect(data?.password_hash).toMatch(/^\$2a\$10\$/);
    expect(data?.password_hash).not.toBe(THROWAWAY_HASH);
  });

  test('3. Supervisor loga com a senha padrão → tela obrigatória de trocar senha → dashboard → login seguinte já usa a senha nova', async ({ page }) => {
    // Depende do reset do test 2 (mesma fixture 98001, execução sequencial no describe).
    await page.goto('/');
    await page.locator('#id').fill(TEST_ID);
    await page.locator('#password').fill('mudar123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Gate bloqueia ANTES do dashboard — nada de "Ponto" visível ainda.
    const forceHeading = page.getByRole('heading', { name: 'Defina uma senha nova' });
    await expect(forceHeading).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Ponto', exact: true })).not.toBeVisible();

    await page.locator('#new-password').fill(NEW_OWN_PASSWORD);
    await page.locator('#confirm-new-password').fill(NEW_OWN_PASSWORD);
    await page.getByRole('button', { name: 'Salvar nova senha e entrar' }).click();

    await expect(page.getByText(/Senha alterada com sucesso/i)).toBeVisible({ timeout: 180_000 });
    // Sem CompanySelector (supervisor tem empresa fixa) — vai direto ao painel.
    await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });

    const s = getClient();
    const { data } = await s.from('users').select('must_change_password').eq('id', TEST_ID).single();
    expect(data?.must_change_password).toBe(false);

    await logout(page);

    // Login seguinte com a senha NOVA (não mais mudar123) → direto ao painel, sem o gate.
    await page.locator('#id').fill(TEST_ID);
    await page.locator('#password').fill(NEW_OWN_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
