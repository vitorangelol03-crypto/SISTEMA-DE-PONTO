import { test, expect, Page, Locator } from '@playwright/test';
import { ADMIN, MASTER_2626, loginAs, switchCompany } from './helpers';
import {
  cleanupAllTestArtifacts,
  readSuiteStart,
  ensureTestEmployee,
  deleteAttendanceForEmployee,
  getClient,
} from './cleanup';

/**
 * Bonificações (B / C1 / C2) — MODERNIZADO 2026-07-19.
 *
 * Por que mudou: a versão de maio aplicava/removia a bonificação do DIA REAL da
 * Caratinga (bonuses é por empresa+dia+tipo!) e usava Reset Geral como 9999 —
 * que desde junho é exclusivo do 2626. Em dia com bônus real da equipe, o spec
 * quebrava E ameaçava dados reais.
 *
 * Molde novo: roda em PONTE NOVA (empresa sem uso real) com funcionário próprio
 * (PW Test) — o bônus aplicado/removido é sempre e somente o de teste. A regra
 * de junho é testada dos dois lados (9999 não vê Reset Geral; 2626 usa).
 */

const EMP_NAME = 'PW Test Bonus PN';
const EMP_CPF = '99904000104';
let empId = '';
let pnCompanyId = '';

const todayIso = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Zera o estado do DIA em Ponte Nova (bônus do dia + ponto do funcionário de teste). */
async function wipePnDayState(): Promise<void> {
  const s = getClient();
  await s.from('bonuses').delete().eq('company_id', pnCompanyId).eq('date', todayIso());
  await deleteAttendanceForEmployee(empId);
}

/** Login + troca pra Ponte Nova + aba Ponto + linha do funcionário de teste. */
async function openPontoPN(page: Page, user: { id: string; password: string }): Promise<Locator> {
  await loginAs(page, user);
  await switchCompany(page, 'Ponte Nova');
  await expect(page.getByRole('heading', { name: /Controle de Ponto/ })).toBeVisible();
  await page.getByRole('button', { name: /Atualizar/ }).click();
  await page.getByPlaceholder(/Buscar por nome ou CPF/).fill(EMP_NAME);
  const row = page.locator('tbody tr').filter({ hasText: EMP_NAME }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

async function markPresent(page: Page, row: Locator): Promise<void> {
  await row.getByRole('button', { name: /^Presente$/ }).click();
  await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });
}

async function applyBonus(page: Page, type: 'B' | 'C1' | 'C2', amount: string): Promise<void> {
  await page.getByRole('button', { name: /^Bonificação$/ }).click();
  await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

  const typeSpan = page.getByText(`Tipo ${type}`, { exact: true });
  const block = typeSpan.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
  await block.locator('input[type="number"]').fill(amount);

  const applyBtn = page.getByRole('button', { name: `Aplicar ${type}`, exact: true });
  await expect(applyBtn).toBeEnabled({ timeout: 5_000 });
  await applyBtn.click();

  await expect(page.getByText(new RegExp(`Bonificação ${type} aplicada com sucesso`))).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /^Fechar$/ }).click();
  await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeHidden();
}

async function removeAllBonuses(page: Page): Promise<void> {
  const removeBtn = page.getByRole('button', { name: /Remover Todas/ });
  if (!(await removeBtn.isVisible().catch(() => false))) return;
  await removeBtn.click();
  await expect(page.getByRole('heading', { name: /Remover Todas as Bonificações/ })).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder(/motivo da remoção/).fill('Limpeza automatizada dos testes Playwright');
  await page.getByRole('button', { name: /Confirmar Remoção em Massa/ }).click();
  await expect(page.getByRole('heading', { name: /Remover Todas as Bonificações/ })).toBeHidden({ timeout: 60_000 });
}

test.describe('Bonificações (B / C1 / C2) — em Ponte Nova, isolado', () => {
  test.beforeAll(async () => {
    empId = await ensureTestEmployee(EMP_NAME, EMP_CPF, 'ponte');
    const s = getClient();
    const { data } = await s.from('companies').select('id, display_name, city').limit(100);
    const pn = (data || []).find((c: Record<string, unknown>) =>
      [c.display_name, c.city].filter(Boolean).some(v => String(v).toLowerCase().includes('ponte')),
    );
    if (!pn) throw new Error('Ponte Nova não encontrada');
    pnCompanyId = (pn as { id: string }).id;
  });

  test.beforeEach(async () => {
    await wipePnDayState();
  });

  test.afterAll(async () => {
    await wipePnDayState();
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('modal de Bonificação abre com 3 campos (B, C1, C2)', async ({ page }) => {
    const row = await openPontoPN(page, ADMIN);
    await markPresent(page, row);
    await page.getByRole('button', { name: /^Bonificação$/ }).click();

    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar B', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar C1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar C2', exact: true })).toBeVisible();
  });

  test('aplicar B=10 faz aparecer card "Tipo B" com R$ 10,00 (como 9999 — bônus é permitido)', async ({ page }) => {
    const row = await openPontoPN(page, ADMIN);
    await markPresent(page, row);
    await applyBonus(page, 'B', '10');

    const painelBonus = page.locator('div').filter({ hasText: /^Bonificações Aplicadas$/ }).first().locator('..');
    await expect(painelBonus.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(painelBonus.getByText(/R\$ 10[.,]00/)).toBeVisible();
  });

  test('aplicar B=10, C1=15 e C2=5 → cards B/C1/C2 aparecem', async ({ page }) => {
    const row = await openPontoPN(page, ADMIN);
    await markPresent(page, row);

    await applyBonus(page, 'B', '10');
    await applyBonus(page, 'C1', '15');
    await applyBonus(page, 'C2', '5');

    const painel = page.locator('div').filter({ hasText: /^Bonificações Aplicadas$/ }).first().locator('..');
    await expect(painel.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(painel.getByText('Tipo C1', { exact: true })).toBeVisible();
    await expect(painel.getByText('Tipo C2', { exact: true })).toBeVisible();
    await expect(painel.getByText(/R\$ 10[.,]00/)).toBeVisible();
    await expect(painel.getByText(/R\$ 15[.,]00/)).toBeVisible();
    await expect(painel.getByText(/R\$ 5[.,]00/)).toBeVisible();
  });

  test('"Remover Todas" faz os cards desaparecerem', async ({ page }) => {
    const row = await openPontoPN(page, ADMIN);
    await markPresent(page, row);
    await applyBonus(page, 'B', '10');
    await expect(page.getByText(/Bonificações Aplicadas/)).toBeVisible();

    await removeAllBonuses(page);

    await expect(page.getByText(/Bonificações Aplicadas/)).toBeHidden();
  });

  test('REGRA de junho: 9999 NÃO vê Reset Geral (mesmo com attendance no dia)', async ({ page }) => {
    const row = await openPontoPN(page, ADMIN);
    await markPresent(page, row);
    await expect(page.getByRole('button', { name: /^Reset Geral$/ })).toHaveCount(0);
  });

  test('2626: Reset Geral do ponto remove bonificações também (regressão)', async ({ page }) => {
    const row = await openPontoPN(page, MASTER_2626);
    await markPresent(page, row);
    await applyBonus(page, 'B', '10');
    await expect(page.getByText(/Bonificações Aplicadas/)).toBeVisible();

    await page.getByRole('button', { name: /^Reset Geral$/ }).click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
    await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();

    await expect(page.getByText(/Bonificações Aplicadas/)).toBeHidden();
  });
});
