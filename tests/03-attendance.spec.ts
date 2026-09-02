import { test, expect, Page, Locator } from '@playwright/test';
import { ADMIN, MASTER_2626, loginAs } from './helpers';
import {
  cleanupAllTestArtifacts,
  readSuiteStart,
  ensureTestEmployee,
  deleteAttendanceForEmployee,
} from './cleanup';

/**
 * Controle de Ponto — MODERNIZADO 2026-07-19 (era de maio; quebrou quando a base
 * virou produção viva + regra de junho).
 *
 * Histórico: entre junho e 02/09/2026, horários (manual/inline), editar histórico,
 * Reset e marcar Presente/Falta eram EXCLUSIVOS hardcoded do mestre 2626 (nem o 9999
 * podia — motivo: incidente de 04/08, 9999 marcou 3 pessoas que não trabalharam e o
 * Financeiro pagou a diária das 3).
 *
 * ATUALIZADO 02/09/2026 (pedido do Victor, "máximo controle"): essa trava fixa foi
 * removida — virou permissão normal (`attendance.mark/edit/editHistory/manualTime/
 * reset`), configurável por usuário na tela de Permissões. 2626 continua com acesso
 * total fixo (não configurável); 9999/8888 nascem com acesso total mas são limitáveis;
 * supervisores comuns tiveram essas 5 chaves zeradas na migration da transição (não
 * ganharam nada à toa — ver `20260902020000_...`).
 *
 * Molde: o spec cria o PRÓPRIO funcionário (PW Test, via service role), age só na linha
 * dele (nunca na primeira linha real da base viva) e limpa o ponto dele antes de cada
 * teste.
 */

const EMP_NAME = 'PW Test Ponto Spec03';
const EMP_CPF = '99903000103';
let empId = '';

/** Login + aba Ponto + busca a linha do funcionário de teste. */
async function openPontoRow(page: Page, user: { id: string; password: string }): Promise<Locator> {
  await loginAs(page, user);
  await expect(page.getByRole('heading', { name: /Controle de Ponto/ })).toBeVisible();
  // loadData é mount-only: Atualizar garante que o funcionário recém-criado aparece.
  await page.getByRole('button', { name: /Atualizar/ }).click();
  await page.getByPlaceholder(/Buscar por nome ou CPF/).fill(EMP_NAME);
  const row = page.locator('tbody tr').filter({ hasText: EMP_NAME }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

test.describe('Controle de Ponto', () => {
  test.beforeAll(async () => {
    empId = await ensureTestEmployee(EMP_NAME, EMP_CPF);
  });

  test.beforeEach(async () => {
    // Cada teste começa com o funcionário de teste SEM ponto (estado determinístico).
    await deleteAttendanceForEmployee(empId);
  });

  test.afterAll(async () => {
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('marcar Presente (como 2626) → linha vira "Presente" e contador incrementa', async ({ page }) => {
    const row = await openPontoRow(page, MASTER_2626);

    const presentesCard = page
      .locator('.bg-green-50')
      .filter({ has: page.getByText('Presentes', { exact: true }) })
      .first();
    const presentesCount = presentesCard.locator('.text-green-600').last();
    const initial = parseInt((await presentesCount.textContent())?.trim() ?? '0', 10);

    await row.getByRole('button', { name: /^Presente$/ }).click();
    await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });

    // Contador da base viva: só funciona com sistema quieto (documentado).
    await expect
      .poll(async () => parseInt((await presentesCount.textContent())?.trim() ?? '0', 10), { timeout: 10_000 })
      .toBe(initial + 1);
  });

  test('marcar Falta (como 2626) → linha vira "Falta"', async ({ page }) => {
    const row = await openPontoRow(page, MASTER_2626);
    await row.getByRole('button', { name: /^Falta$/ }).click();
    await expect(row.locator('span').filter({ hasText: /^Falta$/ }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('navegar para data anterior carrega dados do dia', async ({ page }) => {
    await loginAs(page, ADMIN);
    const dateInput = page.locator('input[type="date"]').first();
    const initialDate = await dateInput.inputValue();

    await page.getByRole('button', { name: /Anterior/ }).click();

    const newDate = await dateInput.inputValue();
    expect(newDate).not.toBe(initialDate);
    expect(newDate < initialDate).toBe(true);
  });

  test('navegar para data seguinte funciona', async ({ page }) => {
    await loginAs(page, ADMIN);
    const dateInput = page.locator('input[type="date"]').first();
    await page.getByRole('button', { name: /Anterior/ }).click();
    const ontem = await dateInput.inputValue();

    await page.getByRole('button', { name: /Próximo/ }).click();

    const novoValor = await dateInput.inputValue();
    expect(novoValor).not.toBe(ontem);
    expect(novoValor > ontem).toBe(true);
  });

  // ATUALIZADO 02/09/2026: pedido do Victor — as travas exclusivas hardcoded pro 2626
  // (Ponto, Pagamentos Driver, Aprovação de Cadastro) foram removidas e viraram
  // permissão normal. 9999 foi seedado com acesso total (migration
  // `20260902010000_9999_8888_configuraveis_2626_fixo` + a remoção da trava em
  // `20260902020000_...`), então agora TAMBÉM vê horário manual e Reset — controlável
  // depois via tela de Permissões, não mais hardcoded no código.
  test('9999 (acesso total, configurável) VÊ horário manual (💾) e Reset na linha', async ({ page }) => {
    const row = await openPontoRow(page, ADMIN);
    await expect(row.locator('input[type="time"]')).toHaveCount(2);

    // Reset só aparece quando HÁ status marcado (`status && hasPermission('attendance.reset')`
    // em AttendanceTab.tsx) — precisa marcar Presente antes, senão não tem o que resetar.
    await row.getByRole('button', { name: /^Presente$/ }).click();
    await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });
    await expect(row.getByRole('button', { name: /^Reset$/ })).toBeVisible();
  });

  /**
   * Histórico do incidente de 04/08/2026 (9999 marcou "Presente" em 3 pessoas que não
   * trabalharam, pagas como dia trabalhado) — motivo original da trava exclusiva.
   * ATUALIZADO 02/09/2026: a trava caiu (pedido do Victor, "máximo controle" — agora é
   * permissão normal, revogável por usuário). Supervisores comuns (ex: 04) tiveram
   * attendance.mark zerado explicitamente nessa transição pra não reabrir o incidente à
   * toa — só 9999/2626/8888 nascem com a capacidade, e ela é 100% revogável dali em
   * diante pela tela de Permissões.
   */
  test('9999 (acesso total, configurável) CONSEGUE marcar Presente/Falta', async ({ page }) => {
    const row = await openPontoRow(page, ADMIN);

    const btnPresente = row.getByRole('button', { name: /^Presente$/ });
    await expect(btnPresente).toBeEnabled();
    await expect(row.locator('input[type="checkbox"]')).toHaveCount(1);

    await btnPresente.click();
    await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });
  });

  /** Contraprova do teste acima: os MESMOS botões estão vivos para o 2626. Separado em
   *  outro teste porque dois logins no mesmo teste estouram o limite de 30s no WSL. */
  test('REGRA de 13/08 (contraprova): para o 2626 os botões estão vivos', async ({ page }) => {
    const row = await openPontoRow(page, MASTER_2626);
    await expect(row.getByRole('button', { name: /^Presente$/ })).toBeEnabled();
    await expect(row.getByRole('button', { name: /^Falta$/ })).toBeEnabled();
    await expect(row.locator('input[type="checkbox"]')).toHaveCount(1);
  });

  test('2626: horário manual — 💾 desabilita até preencher entrada+saída e SALVA de verdade', async ({ page }) => {
    const row = await openPontoRow(page, MASTER_2626);
    const entryInput = row.locator('input[type="time"]').first();
    const exitInput = row.locator('input[type="time"]').nth(1);
    const saveBtn = row.getByRole('button', { name: '💾' });

    await expect(saveBtn).toBeDisabled();
    await entryInput.fill('08:00');
    await expect(saveBtn).toBeDisabled();
    await exitInput.fill('17:00');
    await expect(saveBtn).toBeEnabled();

    // Acorda o antigo skip (15:88): salva e confere que gravou.
    await saveBtn.click();
    await expect(page.getByText('Horário salvo')).toBeVisible({ timeout: 10_000 });
  });

  test('2626: Reset da linha limpa o ponto marcado', async ({ page }) => {
    const row = await openPontoRow(page, MASTER_2626);
    await row.getByRole('button', { name: /^Presente$/ }).click();
    await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });

    // Acorda o antigo skip (15:208): reset real pela UI, com o dialog da própria tela.
    await row.getByRole('button', { name: /^Reset$/ }).click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
    await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden({ timeout: 10_000 });
    await expect(row.locator('span').filter({ hasText: /^Presente$/ })).toHaveCount(0, { timeout: 10_000 });
  });
});
