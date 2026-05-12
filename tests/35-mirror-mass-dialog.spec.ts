import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';

/**
 * Sub-fase 10.5 — MirrorMassDialog spec
 *
 * Componente em `src/components/attendance/MirrorMassDialog.tsx` (307 lin)
 * renderizado dentro de AttendanceTab (linha 1742, condicional ao botão
 * "Gerar espelhos" — só visível pra admin com `attendance.generateMassMirror`).
 *
 * Escopo: 8 testes core cobrindo o ciclo de vida do dialog (abrir/fechar,
 * range, busca, multi-select, isolamento por empresa). O download real
 * do PDF NÃO é validado (jsPDF roda client-side — testar via waitForEvent
 * 'download' é frágil e custoso); fica coberto via unit tests do mirrorPdf
 * (414 já passing em vitest).
 */

const _CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

async function openMassDialog(page: Page) {
  await goToTab(page, 'Ponto');
  await page.getByRole('button', { name: /Gerar espelhos/i }).first().click();
  await expect(page.getByRole('heading', { name: /Gerar espelhos em massa/i })).toBeVisible({ timeout: 10_000 });
}

/** Escopo do modal — exclui locators do AttendanceTab atrás. */
function modal(page: Page) {
  return page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: /Gerar espelhos em massa/i }) })
    .first();
}

test.describe('MirrorMassDialog (sub-fase 10.5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('1. Botão "Gerar espelhos" abre o dialog', async ({ page }) => {
    await openMassDialog(page);
    await expect(page.getByRole('heading', { name: /Gerar espelhos em massa/i })).toBeVisible();
  });

  test('2. Dialog mostra inputs de período + busca + lista de funcionários', async ({ page }) => {
    await openMassDialog(page);
    const m = modal(page);
    await expect(m.locator('input[type="date"]')).toHaveCount(2);
    await expect(m.getByPlaceholder(/Buscar por nome ou CPF/i)).toBeVisible();
    await expect(m.getByRole('button', { name: /Mês atual/i })).toBeVisible();
    await expect(m.getByRole('button', { name: /Mês anterior/i })).toBeVisible();
  });

  test('3. Botão "Mês anterior" muda range de datas', async ({ page }) => {
    await openMassDialog(page);
    const m = modal(page);
    const startInput = m.locator('input[type="date"]').nth(0);
    const initialStart = await startInput.inputValue();

    await m.getByRole('button', { name: /Mês anterior/i }).click();
    const newStart = await startInput.inputValue();
    expect(newStart).not.toBe(initialStart);
    expect(newStart < initialStart).toBe(true);
  });

  test('4. Botão "Mês atual" reseta range pra início do mês corrente (BRT)', async ({ page }) => {
    await openMassDialog(page);
    const m = modal(page);
    await m.getByRole('button', { name: /Mês anterior/i }).click();
    await m.getByRole('button', { name: /Mês atual/i }).click();
    const startInput = m.locator('input[type="date"]').nth(0);
    const start = await startInput.inputValue();
    expect(start).toMatch(/^\d{4}-\d{2}-01$/);
  });

  test('5. Buscar por nome filtra a lista', async ({ page }) => {
    await openMassDialog(page);
    const m = modal(page);
    await expect(m.locator('ul li').first()).toBeVisible({ timeout: 15_000 });
    const totalBefore = await m.locator('ul li').count();
    expect(totalBefore).toBeGreaterThan(0);

    await m.getByPlaceholder(/Buscar por nome ou CPF/i).fill('ZZZZZZZ');
    await expect(m.getByText(/Nenhum funcionário encontrado/i)).toBeVisible({ timeout: 5_000 });
  });

  test('6. Toggle "Selecionar visíveis" marca todos e atualiza count', async ({ page }) => {
    await openMassDialog(page);
    const m = modal(page);
    await expect(m.locator('ul li').first()).toBeVisible({ timeout: 15_000 });
    const total = await m.locator('ul li').count();

    await m.getByRole('button', { name: /Selecionar visíveis/i }).click();
    await expect(m.getByText(new RegExp(`Funcionários \\(${total} de`))).toBeVisible({ timeout: 5_000 });
    await expect(m.getByRole('button', { name: /Desmarcar visíveis/i })).toBeVisible();
  });

  test('7. Botão "Gerar PDF" disabled com 0 selecionados; habilita após selecionar', async ({ page }) => {
    await openMassDialog(page);
    const m = modal(page);
    await expect(m.locator('ul li').first()).toBeVisible({ timeout: 15_000 });

    const generateBtn = m.getByRole('button', { name: /Gerar PDF/i });
    await expect(generateBtn).toBeDisabled();

    await m.locator('ul li input[type="checkbox"]').first().check();
    await expect(generateBtn).toBeEnabled({ timeout: 5_000 });
    await expect(generateBtn).toContainText('(1)');
  });

  test('8. Switch CT→PN: dialog mostra lista vazia em PN (isolamento por empresa)', async ({ page }) => {
    await openMassDialog(page);
    let m = modal(page);
    await expect(m.locator('ul li').first()).toBeVisible({ timeout: 15_000 });
    const ctCount = await m.locator('ul li').count();
    expect(ctCount).toBeGreaterThan(0);
    await m.getByRole('button', { name: /^Cancelar$/ }).click();

    await switchCompany(page, 'Ponte Nova');
    await openMassDialog(page);
    m = modal(page);
    await expect(m.getByText(/Nenhum funcionário encontrado/i)).toBeVisible({ timeout: 15_000 });
  });
});
