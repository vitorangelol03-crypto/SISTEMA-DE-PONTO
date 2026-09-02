import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, cleanupAllTestArtifacts, readSuiteStart, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — permissão nova `driverpay.viewValues` (02/09/2026, pedido do Victor: "tenho um
 * funcionário pra lançar os descontos mas não quero que ele veja o valor total do driver").
 *
 * Até aqui isso era impossível: Pagamentos Driver inteiro era 100% exclusivo do 2626 (sem
 * meio-termo). Com a remoção dessa trava (mesma leva, migration
 * `20260902020000_remove_travas_exclusivas_ponto_driverpay_aprovacao.sql`), a permissão
 * granular virou possível — `viewValues=false` esconde os R$ em toda a aba (grade, modal
 * de desconto, espelho, relatório) mas continua deixando ver nome/pacotes/datas e lançar
 * desconto (`manageDiscount`).
 *
 * Setup: supervisor descartável `7772` (RPC `_test_create_supervisor_with_perms`, mesmo
 * padrão do `tests/47`) com SÓ `driverpay.view` + `driverpay.manageDiscount` = true e
 * `viewValues` = false. Driver + desconto são criados pelo 2626 via UI real (prefixo
 * `PW Test`, limpo pelo `globalTeardown`).
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const SUP_ID = '7772';
const SUP_PASS = 'sup7772pass';
const DRIVER_NAME = `${TEST_EMPLOYEE_NAME_PREFIX}Driver ViewValues`;
const MODAL = 'div.fixed.inset-0';
const modal = (page: Page) => page.locator(MODAL).last();
const driverRow = (page: Page) => page.locator('tbody tr').filter({ hasText: DRIVER_NAME }).first();

async function cleanupSupervisor() {
  const s = getClient();
  await s.from('user_permissions').delete().eq('user_id', SUP_ID);
  await s.from('users').delete().eq('id', SUP_ID);
}

test.describe('Pagamentos Driver — permissão "Ver valores" (02/09/2026)', () => {
  test.beforeAll(async () => {
    await cleanupSupervisor();
    const s = getClient();
    // Só driverpay especificado: o resto (attendance, users, ...) cai no default de
    // supervisor (tudo false) via mergePermissionsWithDefaults — não interfere no teste.
    const perms = {
      driverpay: { view: true, manageDiscount: true, viewValues: false },
    };
    const { error } = await s.rpc('_test_create_supervisor_with_perms', {
      sup_id: SUP_ID,
      plain_pass: SUP_PASS,
      perms_json: perms,
      company_uuid: CARATINGA_ID,
      created_by_id: '9999',
    });
    if (error) throw new Error(`Setup supervisor falhou: ${error.message}`);
  });

  test.afterAll(async () => {
    await cleanupSupervisor();
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('2626 cria driver de teste e lança um desconto de R$ 25,00', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');

    await page.getByRole('button', { name: /Novo driver/ }).click();
    await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER_NAME);
    await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Test Rota VV');
    await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

    await expect(driverRow(page)).toBeVisible({ timeout: 10_000 });
    await driverRow(page).getByTitle('Lançar desconto').click();
    await expect(modal(page).getByRole('heading', { name: 'Descontos' })).toBeVisible({ timeout: 10_000 });
    await modal(page).getByPlaceholder('0,00').fill('25,00');
    await modal(page).getByRole('button', { name: 'Lançar desconto' }).click();
    await expect(modal(page).getByText('− R$ 25,00').first()).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
  });

  test('supervisor (viewValues=false) vê "•••" na grade e no modal de desconto, não vê R$', async ({ page }) => {
    await loginAs(page, { id: SUP_ID, password: SUP_PASS });
    await goToTab(page, 'Pagamentos Driver');

    const row = driverRow(page);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('•••');
    await expect(row).not.toContainText('R$');

    await row.getByTitle('Lançar desconto').click();
    await expect(modal(page).getByRole('heading', { name: 'Descontos' })).toBeVisible({ timeout: 10_000 });
    // O desconto de R$ 25,00 lançado pelo 2626 aparece mascarado, não em claro.
    await expect(modal(page).getByText('− •••').first()).toBeVisible({ timeout: 10_000 });
    await expect(modal(page).getByText('R$ 25,00')).toHaveCount(0);
    // Mas continua dando pra lançar um desconto novo (o valor digitado é dele, não segredo).
    await expect(modal(page).getByPlaceholder('0,00')).toBeEditable();
    await modal(page).getByRole('button', { name: 'Fechar' }).click();
  });

  test('contraprova: com viewValues=true, o mesmo supervisor VÊ os R$ normalmente', async ({ page }) => {
    const s = getClient();
    const { error } = await s
      .from('user_permissions')
      .update({ permissions: { driverpay: { view: true, manageDiscount: true, viewValues: true } } })
      .eq('user_id', SUP_ID);
    if (error) throw new Error(`Update de permissão falhou: ${error.message}`);

    await loginAs(page, { id: SUP_ID, password: SUP_PASS });
    await goToTab(page, 'Pagamentos Driver');

    const row = driverRow(page);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('R$');
    await expect(row).not.toContainText('•••');

    await row.getByTitle('Lançar desconto').click();
    await expect(modal(page).getByText('− R$ 25,00').first()).toBeVisible({ timeout: 10_000 });
  });
});
