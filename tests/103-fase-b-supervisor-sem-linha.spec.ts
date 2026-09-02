import { test, expect } from '@playwright/test';
import { SUPERVISOR, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * Fase B — regressão do hotfix `20260902000000_fase_b_fix_default_permissions_sem_linha`
 * (02/09/2026, achado na verificação pós-deploy a pedido do Victor: "tudo pronto tem
 * certeza?"). O trigger `enforce_employees_permission_check` (Fase B) tratava "usuário
 * sem linha em user_permissions" como "sem NENHUMA permissão" — mas o supervisor '01'
 * (conta REAL, sempre sem linha própria) sempre teve employees.create/edit/import=true
 * via DEFAULT_SUPERVISOR_PERMISSIONS no frontend. Ficou bloqueado no ar por ~40min até
 * o hotfix. Este teste prova que o caminho de verdade (UI → trigger real, não bypass de
 * mestre nem de service_role) funciona pra exatamente essa conta.
 */
const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}FaseBSemLinha `;

test.describe('Fase B — supervisor sem linha em user_permissions (conta real "01")', () => {
  test.afterAll(async () => {
    const s = getClient();
    await s.from('employees').delete().like('name', `${PREFIX}%`);
  });

  test('supervisor "01" (sem linha própria) consegue criar funcionário via UI de verdade', async ({ page }) => {
    const s = getClient();
    const { data: perms } = await s.from('user_permissions').select('user_id').eq('user_id', '01').maybeSingle();
    expect(perms, '"01" precisa continuar SEM linha própria — é exatamente o caso que quebrou').toBeNull();

    await loginAs(page, SUPERVISOR);
    await goToTab(page, 'Funcionários');

    const nome = `${PREFIX}${Date.now()}`;
    await page.getByRole('button', { name: /Novo Funcionário/i }).first().click();
    await page.getByPlaceholder('Digite o nome completo').fill(nome);
    await page.getByRole('button', { name: /^Cadastrar$/i }).click();

    // Se o trigger da Fase B ainda estivesse bloqueando (bug do hotfix), o insert
    // falharia e nenhum toast de sucesso nem row em DB apareceriam.
    await expect(page.getByText(/sucesso/i).first()).toBeVisible({ timeout: 15_000 });

    const { data } = await s.from('employees').select('id').eq('name', nome).maybeSingle();
    expect(data).not.toBeNull();
  });
});
