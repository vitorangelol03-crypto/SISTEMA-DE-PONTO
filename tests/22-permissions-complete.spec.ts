import { test, expect } from '@playwright/test';
import { loginAs, goToTab } from './helpers';
import { createTestEmployee, insertAttendance, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

function todayBR(): string {
  // YYYY-MM-DD na timezone do Brasil — independente do TZ do servidor.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
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

  // ATUALIZADO 02/09/2026 (pedido do Victor, "máximo controle"): attendance.reset era
  // EXCLUSIVO hardcoded do 2626 (nem o 9999) desde junho até essa data — virou permissão
  // normal configurável. 9999 foi seedado com acesso total (migration
  // 20260902010000_...), então agora AMBOS veem Reset Geral por padrão.
  test('9999 e 2626 (acesso total) VEEM Reset Geral (quando há attendance)', async ({ page }) => {
    const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}PermResetView `;
    await cleanupByPrefix(PREFIX);
    const empId = await createTestEmployee({ name: `${PREFIX}Emp` });
    await insertAttendance(empId, todayBR(), { status: 'present' });

    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');
    await page.waitForLoadState('networkidle');
    expect(await page.getByRole('button', { name: /Reset Geral/i }).count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: /Sair/ }).first().click();
    await expect(page.locator('#id')).toBeVisible({ timeout: 10_000 });
    await loginAs(page, { id: '2626', password: 'cdlogistica26' });
    await goToTab(page, 'Ponto');
    await page.waitForLoadState('networkidle');
    expect(await page.getByRole('button', { name: /Reset Geral/i }).count()).toBeGreaterThan(0);

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

  test('sup04 VÊ aba Admin (sempre visível, gated por senha interna)', async ({ page }) => {
    // Sub-fase 14.11 (TECH_DEBT 6.27): aba Admin tem permission=null em
    // TabNavigation.tsx — sempre visível. Acesso ao AdminTab é gated pela
    // senha interna ("Clayton2024"), não por permission UI. Premissa
    // original do teste (sup04 NÃO tem Admin) estava incorreta.
    await loginAs(page, SUP04);
    await expect(page.getByRole('button', { name: /^Admin$/ })).toBeVisible();
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
    // data-testid+:visible (não getByTitle/tbody tr): tabela desktop e card
    // mobile coexistem no DOM (achado rodando em mobile-pixel5, 01/09/2026).
    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: /01/ }).first();
    await row.getByRole('button', { name: /Permiss/i }).click();
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
    // data-testid+:visible (não getByTitle/tbody tr): tabela desktop e card
    // mobile coexistem no DOM (achado rodando em mobile-pixel5, 01/09/2026).
    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: /01/ }).first();
    await row.getByRole('button', { name: /Permiss/i }).click();
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
    // data-testid+:visible (não getByTitle/tbody tr): tabela desktop e card
    // mobile coexistem no DOM (achado rodando em mobile-pixel5, 01/09/2026).
    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: /01/ }).first();
    await row.getByRole('button', { name: /Permiss/i }).click();
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
