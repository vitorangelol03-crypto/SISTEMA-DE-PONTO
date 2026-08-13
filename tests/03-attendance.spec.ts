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
 * Regra vigente (masters.ts):
 *   - junho/2026: horários (manual/inline), editar histórico e Reset — SÓ o mestre 2626;
 *   - 13/08/2026: marcar Presente/Falta TAMBÉM virou exclusivo do 2626. Motivo: marcar
 *     pelo painel cria ponto SEM batida nenhuma, indistinguível na tela de quem bateu de
 *     verdade, e o Financeiro paga como dia trabalhado. Em 04/08 o 9999 marcou 3 pessoas
 *     que não trabalharam e as 3 receberam diária.
 *
 * Molde: o spec cria o PRÓPRIO funcionário (PW Test, via service role), age só na linha
 * dele (nunca na primeira linha real da base viva) e limpa o ponto dele antes de cada
 * teste. A regra é testada dos DOIS lados: o 2626 consegue; o 9999 nem vê os controles.
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

  test('REGRA de junho: 9999 NÃO vê horário manual (💾) nem Reset na linha', async ({ page }) => {
    const row = await openPontoRow(page, ADMIN);
    await expect(row.locator('input[type="time"]')).toHaveCount(0);
    await expect(row.getByRole('button', { name: '💾' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: /^Reset$/ })).toHaveCount(0);
  });

  /**
   * Regressão do incidente de 04/08/2026: o 9999 marcou "Presente" em 3 pessoas que não
   * trabalharam e o Financeiro pagou a diária das 3. Desde 13/08 registrar ponto é só do
   * 2626 — e o banco recusa mesmo que alguém contorne a tela (gatilho
   * enforce_ponto_master_only).
   */
  test('REGRA de 13/08: 9999 não consegue marcar Presente/Falta (botão morto, sem seleção em massa)', async ({ page }) => {
    const row = await openPontoRow(page, ADMIN);

    // Os botões continuam na tela, mas MORTOS e com o motivo no title — some seria pior,
    // porque a equipe não saberia por que sumiu.
    const btnPresente = row.getByRole('button', { name: /^Presente$/ });
    const btnFalta = row.getByRole('button', { name: /^Falta$/ });
    await expect(btnPresente).toBeDisabled();
    await expect(btnFalta).toBeDisabled();
    await expect(btnPresente).toHaveAttribute('title', /não tem permissão/i);

    // Sem caixa de seleção na linha nem no cabeçalho => marcação em massa impossível.
    await expect(row.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Marcar como Presente/ })).toHaveCount(0);

    // Clicar não muda nada: a linha continua "Não marcado" (beforeEach limpou o ponto).
    await btnPresente.click({ force: true }).catch(() => {});
    await expect(row.locator('span').filter({ hasText: /^Não marcado$/ }).first()).toBeVisible();
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
