import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { cleanupAllTestArtifacts, readSuiteStart } from './cleanup';

/**
 * Testes do CRUD de funcionários.
 * Cria e remove um funcionário de teste com CPF gerado dinamicamente.
 */

// Gera um CPF válido dinamicamente (mesmo algoritmo de src/utils/validation.ts).
function generateValidCPF(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  // Evita CPFs com todos os dígitos iguais
  if (base.every(d => d === base[0])) base[0] = (base[0] + 1) % 10;

  const calcDigit = (nums: number[]) => {
    const len = nums.length;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += nums[i] * (len + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };

  const d1 = calcDigit(base);
  const d2 = calcDigit([...base, d1]);
  return [...base, d1, d2].join('');
}

function formatCPF(cpf: string): string {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

test.describe('Funcionários', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Funcionários');
    await expect(page.getByRole('heading', { name: /Gestão de Funcionários|Funcionários/ }).first()).toBeVisible();
  });

  // Remove qualquer PW Test employee remanescente (caso o "exclui" do teste
  // tenha falhado no meio).
  test.afterAll(async () => {
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('lista mostra funcionários', async ({ page }) => {
    await expect(page.locator('tbody tr, .md\\:hidden > div').first()).toBeVisible({ timeout: 10_000 });
  });

  test('busca por nome filtra corretamente', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar" i], input[placeholder*="nome" i], input[type="text"]').first();
    await expect(searchInput).toBeVisible();

    // Digita um nome que provavelmente não existe
    await searchInput.fill('zzznaoexistefuncionario');
    await page.waitForTimeout(500);

    const rows = page.locator('tbody tr');
    await expect.poll(async () => await rows.count(), { timeout: 5_000 }).toBe(0);

    await searchInput.fill('');
  });

  test('busca por letras aleatórias NÃO retorna todos (regressão do bug de filtro de CPF)', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar" i], input[placeholder*="nome" i], input[type="text"]').first();

    // Conta total sem filtro
    await searchInput.fill('');
    await page.waitForTimeout(300);
    const total = await page.locator('tbody tr').count();

    // Filtra com letras sem sentido → deve retornar 0 (ou pelo menos menos que o total)
    await searchInput.fill('xyzqwjklmn');
    await page.waitForTimeout(500);
    const filtered = await page.locator('tbody tr').count();

    expect(filtered).toBeLessThan(total);

    await searchInput.fill('');
  });

  test('cria funcionário, edita PIN e exclui', async ({ page }) => {
    const cpfRaw = generateValidCPF();
    const cpfFormatted = formatCPF(cpfRaw);
    const testName = `PW Test ${Date.now()}`;

    // Abre modal "Novo Funcionário"
    await page.getByRole('button', { name: /Novo Funcionário/ }).click();
    await expect(page.getByRole('heading', { name: /Novo Funcionário/ })).toBeVisible();

    // Labels não têm htmlFor — usa placeholders dentro do modal
    const modal = page.locator('form').filter({ has: page.getByText('Nome Completo') }).first();
    await modal.getByPlaceholder('Digite o nome completo').fill(testName);
    await modal.getByPlaceholder('000.000.000-00').fill(cpfRaw);

    await page.getByRole('button', { name: /^Cadastrar$/ }).click();

    // Aguarda o modal fechar
    await expect(page.getByRole('heading', { name: /Novo Funcionário/ })).toBeHidden({ timeout: 10_000 });

    // O funcionário aparece na lista
    const searchInput = page.locator('input[placeholder*="Buscar" i], input[placeholder*="nome" i], input[type="text"]').first();
    await searchInput.fill(testName);
    await page.waitForTimeout(500);
    await expect(page.getByText(testName).first()).toBeVisible({ timeout: 5_000 });

    // Definir PIN — localizar botão na linha
    const row = page.locator('tbody tr').filter({ hasText: testName }).first();
    await row.getByRole('button', { name: 'Definir PIN' }).or(row.locator('button[title="Definir PIN"]')).first().click();

    await expect(page.getByRole('heading', { name: /Definir PIN/ })).toBeVisible();
    await page.getByPlaceholder(/4 a 6 dígitos/).fill('1234');
    await page.getByRole('button', { name: /Salvar PIN/ }).click();
    await expect(page.getByRole('heading', { name: /Definir PIN/ })).toBeHidden({ timeout: 10_000 });

    // Campo PIN agora mostra "Configurado ✓"
    await expect(row.getByText(/Configurado/)).toBeVisible();

    // Excluir o funcionário de teste
    page.once('dialog', dialog => dialog.accept());
    await row.locator('button[title="Excluir"]').first().click();

    // Confirma que saiu da lista
    await page.waitForTimeout(1_000);
    await expect(page.getByText(testName)).toHaveCount(0);
  });
});
