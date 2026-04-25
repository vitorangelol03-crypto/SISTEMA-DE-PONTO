import { test, expect } from '@playwright/test';
import { loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { createTestEmployee, insertAttendance, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

function todayBR(): string {
  const now = new Date();
  const offset = -3 * 60;
  const local = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Cobertura completa de Permissões.
 *
 * Estrutura:
 *  - Admin 9999 (acesso total)
 *  - Supervisor 01 (padrão; usa permissões padrão de supervisor)
 *  - Supervisor 04 (restrito — NÃO tem reset/triage/applyBonus_/manualTime)
 *
 * NOTA: O test 11-permissions.spec.ts já cobre alguns casos. Este expande
 * para cada permissão individual mencionada na spec do usuário.
 */

const ADMIN = { id: '9999', password: '684171' };
const SUP01 = { id: '01', password: '9098' };
const SUP04 = { id: '04', password: '9847' };

test.describe('Permissions — Admin (9999) acesso total', () => {
  test('admin vê todas as abas relevantes', async ({ page }) => {
    await loginAs(page, ADMIN);
    // Verifica presença das abas principais
    await expect(page.getByRole('button', { name: /^Ponto$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Funcionários$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Financeiro$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pagamento C6$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Erros$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Relatórios$/ }).first()).toBeVisible();
  });

  test('admin vê botão Reset Geral em Ponto (quando há attendance)', async ({ page }) => {
    // Reset Geral é condicional a attendances.length > 0 — cria um attendance primeiro
    const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}PermResetView `;
    await cleanupByPrefix(PREFIX);
    const empId = await createTestEmployee({ name: `${PREFIX}Emp` });
    await insertAttendance(empId, todayBR(), { status: 'present' });

    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');
    await page.waitForLoadState('networkidle');
    const resetBtns = page.getByRole('button', { name: /Reset Geral/i });
    expect(await resetBtns.count()).toBeGreaterThan(0);

    // Cleanup pós-teste
    await cleanupByPrefix(PREFIX);
  });

  test('admin vê sub-aba Triagem em Erros', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Erros');
    await expect(page.getByRole('button', { name: /^Triagem$/ })).toBeVisible();
  });

  test('admin vê aba Usuários e botão Criar Supervisor', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    await expect(page.getByRole('button', { name: /Criar Supervisor/i })).toBeVisible();
  });
});

test.describe('Permissions — Supervisor 04 restrito', () => {
  test.describe.configure({ retries: 1 });

  test('sup04 NÃO vê Reset Geral', async ({ page }) => {
    await loginAs(page, SUP04);
    await goToTab(page, 'Ponto');
    await expect(page.getByRole('button', { name: /^Reset Geral$/ })).toHaveCount(0);
  });

  test('sup04 NÃO vê sub-aba Triagem', async ({ page }) => {
    await loginAs(page, SUP04);
    await goToTab(page, 'Erros');
    await expect(page.getByRole('button', { name: /^Triagem$/ })).toHaveCount(0);
  });

  test('sup04 VÊ Aprovações Pendentes (tem permissão approve)', async ({ page }) => {
    await loginAs(page, SUP04);
    await expect(page.getByText(/Aprovações Pendentes/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('sup04 NÃO tem aba Usuários', async ({ page }) => {
    await loginAs(page, SUP04);
    await expect(page.getByRole('button', { name: /^Usuários$/ })).toHaveCount(0);
  });

  test('sup04 NÃO tem aba Admin', async ({ page }) => {
    await loginAs(page, SUP04);
    await expect(page.getByRole('button', { name: /^Admin$/ })).toHaveCount(0);
  });
});

test.describe('Permissions — Supervisor 01 (padrão)', () => {
  test('sup01 VÊ aba Erros', async ({ page }) => {
    await loginAs(page, SUP01);
    await expect(page.getByRole('button', { name: /^Erros$/ }).first()).toBeVisible();
  });

  test('sup01 VÊ aba Relatórios', async ({ page }) => {
    await loginAs(page, SUP01);
    await expect(page.getByRole('button', { name: /^Relatórios$/ }).first()).toBeVisible();
  });
});

test.describe('Permissions — Catálogo no modal de Permissões', () => {
  test('modal lista permissões de Ponto', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    const row = page.locator('tbody tr').filter({ hasText: /01/ }).first();
    await row.getByTitle('Gerenciar Permissões').click();
    const modal = page.locator('[class*="max-w-4xl"]');
    await modal.getByRole('button', { name: /^Ponto/ }).click();
    for (const txt of [
      'Aprovar ponto pendente',
      'Rejeitar ponto pendente',
      'Aprovar ponto em lote',
      'Inserir horário manual',
    ]) {
      await expect(modal.getByText(new RegExp(txt))).toBeVisible();
    }
  });

  test('modal lista permissões financeiras (B/C1/C2)', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    const row = page.locator('tbody tr').filter({ hasText: /01/ }).first();
    await row.getByTitle('Gerenciar Permissões').click();
    const modal = page.locator('[class*="max-w-4xl"]');
    await modal.getByRole('button', { name: /^Financeiro/ }).click();
    for (const txt of [
      'Aplicar bonificação tipo B',
      'Aplicar bonificação tipo C1',
      'Aplicar bonificação tipo C2',
      'Remover bonificação por tipo específico',
    ]) {
      await expect(modal.getByText(new RegExp(txt))).toBeVisible();
    }
  });

  test('modal lista permissões de erros (createByValue, viewTriage, distribuir)', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Usuários');
    const row = page.locator('tbody tr').filter({ hasText: /01/ }).first();
    await row.getByTitle('Gerenciar Permissões').click();
    const modal = page.locator('[class*="max-w-4xl"]');
    await modal.getByRole('button', { name: /^Erros/ }).click();
    for (const txt of [
      'Criar erro por valor',
      'Ver aba Triagem',
      'Registrar erros de triagem',
      'Distribuir erros de triagem',
    ]) {
      await expect(modal.getByText(new RegExp(txt))).toBeVisible();
    }
  });
});
