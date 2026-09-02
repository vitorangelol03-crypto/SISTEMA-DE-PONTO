import { test, expect } from '@playwright/test';
import { goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Sub-fase 16.3 — Spec supervisor com `users.create` perm
 *
 * Cenário descoberto na auditoria 14.X mas não exercitado em E2E até agora:
 * supervisor (role=supervisor) com permission `users.create=true` deve
 * conseguir criar novo supervisor via UI, com `created_by` = supervisor.
 *
 * Setup: cria supervisor temp `7770` via RPC helper `_test_create_supervisor_with_perms`
 * (cria user + permissions custom em uma transação, com password bcrypt via pgcrypto).
 *
 * Cleanup: deleta supervisor + user criado pelos testes via service_role.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const SUP_TEST_ID = '7770';
const SUP_TEST_PASS = 'sup7770pass';
const NEW_USER_ID = '7771';
const NEW_USER_PASS = 'newuser7771';

async function cleanup() {
  const s = getClient();
  await s.from('user_permissions').delete().eq('user_id', SUP_TEST_ID);
  await s.from('user_permissions').delete().eq('user_id', NEW_USER_ID);
  await s.from('users').delete().eq('id', SUP_TEST_ID);
  await s.from('users').delete().eq('id', NEW_USER_ID);
}

test.describe('Supervisor com users.create perm (sub-fase 16.3)', () => {
  test.beforeAll(async () => {
    await cleanup();
    const s = getClient();

    // Permissions: supervisor com users.view + users.create (mas NÃO delete nem managePermissions)
    // Estrutura espelha UserPermissions (src/types/permissions.ts). Outros perms
    // default false pra escopar o teste em users.create exclusivamente.
    const perms = {
      attendance: { view: true, mark: false, edit: false, delete: false, generateMassMirror: false, viewHistory: false, approve: false, reject: false, bulkApprove: false },
      employees: { view: false, create: false, edit: false, delete: false, import: false },
      reports: { view: false, exportExcel: false, exportPDF: false },
      financial: { view: false, editRate: false, delete: false, clear: false, applyDiscount: false, viewHistory: false, removeBonusByType: false },
      c6payment: { view: false, import: false, bulkEdit: false, edit: false, delete: false },
      errors: { view: false, create: false, createByValue: false, edit: false, delete: false, viewStats: false, viewTriage: false, createTriage: false, distributeTriage: false },
      settings: { view: false, edit: false },
      users: { view: true, create: true, edit: false, delete: false, resetPassword: false, managePermissions: false },
      datamanagement: { view: false, manage: false },
    };

    const { error } = await s.rpc('_test_create_supervisor_with_perms', {
      sup_id: SUP_TEST_ID,
      plain_pass: SUP_TEST_PASS,
      perms_json: perms,
      company_uuid: CARATINGA_ID,
      created_by_id: '9999',
    });
    if (error) throw new Error(`Setup supervisor failed: ${error.message}`);
  });

  test.afterAll(cleanup);

  test('1. Supervisor com users.create logga e vê tab Usuários', async ({ page }) => {
    // Login direto como supervisor — sem CompanySelector (supervisor não tem)
    await page.goto('/');
    await page.locator('#id').fill(SUP_TEST_ID);
    await page.locator('#password').fill(SUP_TEST_PASS);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Sanity: chegou ao painel (tab Ponto sempre visível mesmo sem permission attendance.view
    // mas users.view=true → vê Usuários)
    await expect(page.getByRole('button', { name: 'Usuários', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('2. Supervisor cria novo user via UI (created_by = supervisor)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#id').fill(SUP_TEST_ID);
    await page.locator('#password').fill(SUP_TEST_PASS);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('button', { name: 'Usuários', exact: true })).toBeVisible({ timeout: 15_000 });
    await goToTab(page, 'Usuários');

    // Botão "Criar Supervisor" abre o form (users.create=true → habilitado)
    const newBtn = page.getByRole('button', { name: /Criar Supervisor/i }).first();
    await expect(newBtn).toBeEnabled({ timeout: 10_000 });
    await newBtn.click();

    // Form abre — preencher ID via placeholder específico (nome/telefone viraram
    // obrigatórios na Fase A do rework de Usuários, 01/09/2026)
    await page.getByPlaceholder(/Digite apenas números/).fill(NEW_USER_ID);
    await page.getByPlaceholder('Digite o nome completo').fill('PW Teste Supervisor 2');
    await page.getByPlaceholder('(00) 00000-0000').fill('31999990001');
    await page.getByPlaceholder('Digite uma senha segura').fill(NEW_USER_PASS);
    await page.getByPlaceholder('Confirme a senha').fill(NEW_USER_PASS);

    // Submit: botão "Criar Supervisor" type=submit dentro do form (2º com esse name)
    // .last() pra escapar o botão de abrir form (que tem mesmo texto)
    await page.getByRole('button', { name: /^Criar Supervisor$/ }).last().click();

    // Aguarda lista atualizada com novo user. data-testid="user-row" (Fase A,
    // 01/09/2026) em vez de getByText: desktop tabela + card mobile SEMPRE
    // coexistem no DOM (só um fica visível via CSS `hidden md:block`/`md:hidden`).
    // `:visible` no seletor (não só .first()) é o que garante pegar a linha
    // que REALMENTE aparece no viewport atual — em mobile-pixel5 a linha da
    // tabela vem primeiro no DOM mas fica escondida; só o card mobile é visível.
    await expect(page.locator('[data-testid="user-row"]:visible').filter({ hasText: NEW_USER_ID }).first()).toBeVisible({ timeout: 15_000 });

    // Validação no DB: user criado com created_by = supervisor
    const s = getClient();
    const { data } = await s
      .from('users')
      .select('id, role, created_by, company_id')
      .eq('id', NEW_USER_ID)
      .single();
    expect(data?.id).toBe(NEW_USER_ID);
    expect(data?.role).toBe('supervisor');
    expect(data?.created_by).toBe(SUP_TEST_ID);
    expect(data?.company_id).toBe(CARATINGA_ID);
  });
});
