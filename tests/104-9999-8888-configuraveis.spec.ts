import { test, expect } from '@playwright/test';
import { ADMIN, MASTER_2626, loginAs, goToTab, switchCompany } from './helpers';
import { getClient } from './cleanup';

/**
 * 02/09/2026 — pedido do Victor: "9999, 8888 e 2626 viram usuários normais do sistema,
 * mais com full acesso, que vão ser os usuários dos chefes mas podendo ser limitados
 * também igual outros usuários". Decisão final: só o 2626 (líder único e fixo) pode
 * editar a permissão do 9999/8888 — nem eles mesmos, nem outro admin com
 * "gerenciar permissões" comum.
 *
 * Este teste prova as duas pontas via UI de verdade (login real → trigger real):
 *   1) o 9999 continua com acesso total por padrão (nada quebrou pra ele).
 *   2) o 9999 (que TEM users.managePermissions=true) é BLOQUEADO de tentar editar a
 *      permissão do 8888 — prova que a trava é exclusiva do 2626, não só "quem tem a
 *      permissão geral".
 */

test.describe('9999/8888 configuráveis — só o 2626 edita', () => {
  test('1. 9999 continua com acesso total por padrão (nada quebrou)', async ({ page }) => {
    const s = getClient();
    const { data } = await s.from('user_permissions').select('permissions').eq('user_id', '9999').maybeSingle();
    expect(data?.permissions?.employees?.edit).toBe(true);
    expect(data?.permissions?.users?.managePermissions).toBe(true);

    await loginAs(page, ADMIN);
    await goToTab(page, 'Funcionários');
    await expect(page.getByRole('button', { name: /Novo Funcionário/i }).first()).toBeVisible({ timeout: 10_000 });
    await goToTab(page, 'Usuários');
    await expect(page.getByRole('button', { name: /Criar Supervisor/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('2. 9999 (tem managePermissions=true) é bloqueado de editar a permissão do 8888', async ({ page }) => {
    await loginAs(page, ADMIN);
    // 8888 é da Ponte Nova — 9999 precisa trocar de empresa pra ver a linha dele.
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Usuários');

    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: '8888' }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: /Permiss/i }).click();

    await expect(page.getByText(/Só o usuário mestre \(2626\) pode alterar as permissões do 9999\/8888/i)).toBeVisible({ timeout: 10_000 });
    // Modal de permissões NÃO deve ter aberto de verdade.
    await expect(page.getByRole('heading', { name: /Gerenciar Permissões/i })).toHaveCount(0);
  });

  test('3. 2626 (o líder) CONSEGUE abrir a tela de permissões do 8888 — não salva nada, só prova que a trava não bloqueia ele', async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Usuários');

    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: '8888' }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: /Permiss/i }).click();

    await expect(page.getByRole('heading', { name: /Gerenciar Permissões/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Só o usuário mestre \(2626\)/i)).toHaveCount(0);
  });
});
