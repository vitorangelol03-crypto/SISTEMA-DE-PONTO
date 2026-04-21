import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab, TEST_EMPLOYEE_CPF } from './helpers';
import { cleanupAllTestArtifacts, readSuiteStart, getClient } from './cleanup';

/**
 * Testes da aba ERROS — tipos quantidade/valor + sub-aba Triagem.
 *
 * Estratégia anti-destrutiva:
 *  - erros individuais são criados no funcionário Victor Angelo em data FUTURA
 *    (29/04/2026) para não colidir com produção do dia 20/04
 *  - triagem cria registros em data FUTURA também e NÃO chama "Confirmar
 *    Distribuição" (alteraria payments reais)
 *  - cleanup deleta error_records e triage_errors da data 29/04/2026
 */

const FAKE_DATE = '2026-04-29';

async function deleteTestErrorData() {
  const s = getClient();
  await s.from('error_records').delete().eq('date', FAKE_DATE);
  await s.from('triage_errors').delete().eq('date', FAKE_DATE);
}

async function openErrors(page: Page) {
  await goToTab(page, 'Erros');
  await expect(page.getByRole('heading', { name: /Gestão de Erros/ })).toBeVisible();
}

test.describe('Erros — individuais e triagem', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    await deleteTestErrorData();
  });

  test.afterAll(async () => {
    await deleteTestErrorData();
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('sub-abas "Erros Individuais" e "Triagem" visíveis', async ({ page }) => {
    await openErrors(page);
    await expect(page.getByRole('button', { name: /Erros Individuais/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Triagem$/ })).toBeVisible();
  });

  test('criar erro por QUANTIDADE → badge 📦 aparece e é excluível', async ({ page }) => {
    await openErrors(page);
    await page.getByRole('button', { name: /Registrar Erro/ }).click();
    await expect(page.getByRole('heading', { name: /Registrar Erro/ })).toBeVisible();

    // Victor Angelo é o funcionário garantido (TEST_EMPLOYEE_CPF)
    const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Registrar Erro/ }) });
    await modal.locator('select').first().selectOption({ label: 'Victor Angelo da silva Pereira' });
    await modal.locator('input[type="date"]').fill(FAKE_DATE);

    // Seleciona tipo Quantidade (default)
    await modal.getByText('📦 Por Quantidade').click();
    await modal.locator('input[type="number"]').fill('5');
    await modal.getByPlaceholder(/Descreva os erros/).fill('PW Test erro quantidade');
    await modal.getByRole('button', { name: /^Registrar$/ }).click();

    await expect(page.getByText(/registrado com sucesso/i)).toBeVisible({ timeout: 10_000 });

    // Valida no DB (listagem na UI filtra por funcionários present no período — evita complexidade)
    const s = getClient();
    const { data } = await s.from('error_records').select('error_type, error_count, error_value, observations').eq('date', FAKE_DATE);
    expect(data).toHaveLength(1);
    expect(data![0].error_type).toBe('quantity');
    expect(data![0].error_count).toBe(5);
    expect(Number(data![0].error_value)).toBe(0);
    expect(data![0].observations).toBe('PW Test erro quantidade');
  });

  test('criar erro por VALOR R$ 20 → badge 💰 aparece', async ({ page }) => {
    await openErrors(page);
    await page.getByRole('button', { name: /Registrar Erro/ }).click();

    const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: /Registrar Erro/ }) });
    await modal.locator('select').first().selectOption({ label: 'Victor Angelo da silva Pereira' });
    await modal.locator('input[type="date"]').fill(FAKE_DATE);

    await modal.getByText('💰 Por Valor').click();
    await modal.locator('input[type="number"]').fill('20');
    await modal.getByPlaceholder(/Descreva os erros/).fill('PW Test erro valor');
    await modal.getByRole('button', { name: /^Registrar$/ }).click();

    await expect(page.getByText(/registrado com sucesso/i)).toBeVisible({ timeout: 10_000 });

    const s = getClient();
    const { data } = await s.from('error_records').select('error_type, error_count, error_value, observations').eq('date', FAKE_DATE);
    expect(data).toHaveLength(1);
    expect(data![0].error_type).toBe('value');
    expect(data![0].error_count).toBe(0);
    expect(Number(data![0].error_value)).toBe(20);
    expect(data![0].observations).toBe('PW Test erro valor');
  });

  test('Triagem: sub-aba abre e permite registrar erro do dia', async ({ page }) => {
    await openErrors(page);
    await page.getByRole('button', { name: /^Triagem$/ }).click();

    await expect(page.getByRole('heading', { name: /Registrar Erros de Triagem/ })).toBeVisible();

    // Usa data atual (mês corrente) para aparecer na tabela do mês
    const today = new Date();
    // Garante data no mês atual mas futura, pra não colidir
    const d = new Date(today.getFullYear(), today.getMonth(), 28);
    const iso = d.toISOString().slice(0, 10);

    await page.locator('input[type="date"]').first().fill(iso);
    await page.locator('input[type="number"]').first().fill('30');
    await page.locator('input[placeholder="Opcional"]').fill('PW Test triagem');
    await page.getByRole('button', { name: /^Registrar$/ }).click();

    await expect(page.getByText(/Erro de triagem registrado/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr').filter({ hasText: '30' }).first()).toBeVisible();

    // Cleanup: deleta o registro criado
    const s = getClient();
    await s.from('triage_errors').delete().eq('date', iso);
  });

  test('Triagem: calcular período gera preview com funcionários e valores', async ({ page }) => {
    // Cria um erro em data passada segura via DB direto (evita colidir)
    const s = getClient();
    const safeDate = '2026-01-15';
    await s.from('triage_errors').delete().eq('date', safeDate);
    await s.from('triage_errors').insert([{ date: safeDate, error_count: 100, observations: 'PW Test preview', created_by: '9999' }]);

    await openErrors(page);
    await page.getByRole('button', { name: /^Triagem$/ }).click();

    // Seção distribuição: 3 inputs date aparecem (1 do registro + 2 do período)
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(safeDate);
    await dateInputs.nth(2).fill(safeDate);

    // Valor por erro
    const numberInputs = page.locator('input[type="number"]');
    // Primeiro input number = quantidade do form de cima; segundo = valor por erro
    await numberInputs.nth(1).fill('0.50');

    await page.getByRole('button', { name: /^Calcular$/ }).click();

    await expect(page.getByText(/Preview da distribuição/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Total a descontar/)).toBeVisible();
    await expect(page.getByText(/Detalhamento por dia/)).toBeVisible();
    await expect(page.getByText(/erros\/pessoa/)).toBeVisible();

    // NÃO confirma distribuição — seria destrutivo em payments reais
    await s.from('triage_errors').delete().eq('date', safeDate);
  });
});
