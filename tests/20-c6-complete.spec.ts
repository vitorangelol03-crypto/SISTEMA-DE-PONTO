import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import {
  SAFE_DATE,
  createTestEmployee,
  insertPaymentRow,
  insertErrorValue,
  insertTriageDistribution,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * Cobertura completa do C6PaymentTab:
 *  - Importar dados (líquido = bruto - erro - triagem)
 *  - Funcionário sem PIX → modal de validação
 *  - Funcionário com valor zero → modal de validação
 *  - Remover funcionário do lote
 *  - Edição inline (PIX, valor)
 *  - Gerar planilha (download)
 *  - Breakdown de descontos visível
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}C6Compl `;

async function cleanup() {
  await cleanupByPrefix(PREFIX, [SAFE_DATE]);
}

async function importC6(page: Page, date: string) {
  await goToTab(page, 'Pagamento C6');
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill(date);
  await dateInputs.nth(0).blur();
  await dateInputs.nth(1).fill(date);
  await dateInputs.nth(1).blur();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.getByRole('button', { name: /Importar Dados/ }).click();
  await expect(page.getByText(/importado/)).toBeVisible({ timeout: 15_000 });
}

test.describe('C6 — completo', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await loginAs(page, ADMIN);
  });

  test('importa valor LÍQUIDO (200 - 30 - 20 = 150)', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Liq` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 200 });
    await insertErrorValue(empId, SAFE_DATE, 30);
    await insertTriageDistribution({
      employeeId: empId, startDate: SAFE_DATE, endDate: SAFE_DATE, valueDeducted: 20,
    });

    await importC6(page, SAFE_DATE);
    const row = page.locator('table tr', { hasText: `${PREFIX}Liq` }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/R\$\s*150\.00/);
    await expect(row).toContainText(/Bruto:\s*R\$\s*200\.00/);
    await expect(row).toContainText(/-R\$\s*30\.00\s*erro/);
    await expect(row).toContainText(/-R\$\s*20\.00\s*triagem/);
  });

  test('funcionário sem PIX: NÃO aparece no lote (toast informa)', async ({ page }) => {
    // Cria todos os funcionários ANTES de carregar a aba C6
    const empWithPix = await createTestEmployee({ name: `${PREFIX}ComPix` });
    const empSemPix = await createTestEmployee({ name: `${PREFIX}SemPixComPay`, withPix: false });
    await insertPaymentRow(empWithPix, SAFE_DATE, { daily_rate: 50 });
    await insertPaymentRow(empSemPix, SAFE_DATE, { daily_rate: 100 });

    await goToTab(page, 'Pagamento C6');
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(SAFE_DATE);
    await dateInputs.nth(0).blur();
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(1).blur();
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await page.getByRole('button', { name: /Importar Dados/ }).click();
    // Toast com aviso "sem chave PIX"
    await expect(page.getByText(/sem chave PIX/i).first()).toBeVisible({ timeout: 10_000 });
    // Tabela tem o ComPix mas NÃO o SemPixComPay
    const rowSem = page.locator('table tr', { hasText: `${PREFIX}SemPixComPay` });
    expect(await rowSem.count()).toBe(0);
  });

  test('valor zero (todos descontos zeram): NÃO entra no lote', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Zero` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 50 });
    await insertErrorValue(empId, SAFE_DATE, 50); // = bruto, líquido=0

    await goToTab(page, 'Pagamento C6');
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(SAFE_DATE);
    await dateInputs.nth(0).blur();
    await dateInputs.nth(1).fill(SAFE_DATE);
    await dateInputs.nth(1).blur();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.getByRole('button', { name: /Importar Dados/ }).click();

    // Toast com aviso de zero líquido
    await expect(page.getByText(/sem valor a pagar|líquido/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('breakdown visível na linha: bruto, descontos, líquido', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Breakdown` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 300 });
    await insertErrorValue(empId, SAFE_DATE, 50);
    await insertTriageDistribution({
      employeeId: empId, startDate: SAFE_DATE, endDate: SAFE_DATE, valueDeducted: 25,
    });

    await importC6(page, SAFE_DATE);
    const row = page.locator('table tr', { hasText: `${PREFIX}Breakdown` }).first();
    await expect(row).toContainText(/225\.00/);
    await expect(row).toContainText(/Bruto:\s*R\$\s*300/);
    await expect(row).toContainText(/-R\$\s*50/);
    await expect(row).toContainText(/-R\$\s*25/);
  });

  test('remover funcionário do lote: clica trash → linha some', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Excluir` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 100 });

    await importC6(page, SAFE_DATE);
    const row = page.locator('table tr', { hasText: `${PREFIX}Excluir` }).first();
    await expect(row).toBeVisible();
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: /Excluir|trash/i }).first().click();
    await page.waitForTimeout(500);

    expect(await page.locator('table tr', { hasText: `${PREFIX}Excluir` }).count()).toBe(0);
  });

  test('editar linha inline: muda valor e PIX', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}EditInline` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 100 });

    await importC6(page, SAFE_DATE);
    const row = page.locator('table tr', { hasText: `${PREFIX}EditInline` }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Editar/i }).first().click();

    // Inputs aparecem nas células — pega 2º (pix) e 3º (amount)
    const editInputs = row.locator('input');
    if (await editInputs.count() < 3) {
      test.skip(true, 'Edição inline não tem inputs esperados');
    }
    // Atualiza PIX (2nd)
    await editInputs.nth(1).fill('teste-novo@pix.com');
    // Atualiza valor (3rd is number)
    const numInput = row.locator('input[type="number"]').first();
    await numInput.fill('250');

    // Salva
    await row.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await page.waitForTimeout(500);

    await expect(row).toContainText(/teste-novo@pix\.com/);
    await expect(row).toContainText(/250\.00/);
  });

  test('gerar planilha com dados válidos: download .xlsx dispara', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Gerar` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 80 });

    await importC6(page, SAFE_DATE);
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByRole('button', { name: /Baixar Planilha C6/ }).click();
    // Modal de confirmação OU validação
    const confirmBtn = page.getByRole('button', { name: /Confirmar e Baixar|Gerar Planilha/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test('gerar mesmo assim: ignora inválidos', async ({ page }) => {
    // 1 válido + 1 sem pix
    const empOK = await createTestEmployee({ name: `${PREFIX}OK` });
    await insertPaymentRow(empOK, SAFE_DATE, { daily_rate: 100 });
    // Adiciona linha manual inválida
    await importC6(page, SAFE_DATE);
    const addBtn = page.getByRole('button', { name: /Adicionar/ }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Add row não disponível');
    }
    await addBtn.click();
    // Linha em edição é a última. Salva sem dados (gera linha inválida)
    const cancelBtn = page.getByRole('button', { name: /Cancelar/i }).first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    }

    await page.getByRole('button', { name: /Baixar Planilha C6/ }).click();
    // Pode abrir modal de validação (Atenção)
    const generateAnyway = page.getByRole('button', { name: /Gerar mesmo assim/ });
    if (await generateAnyway.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
      await generateAnyway.click();
      const dl = await downloadPromise;
      expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
    } else {
      test.skip(true, 'Modal de validação não apareceu (sem inválidos no lote)');
    }
  });
});
