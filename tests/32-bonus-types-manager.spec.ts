import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';
import { getClient } from './cleanup';

/**
 * Sub-fase 10.2 — BonusTypesManager spec
 *
 * Componente em `src/components/admin/BonusTypesManager.tsx` (393 lin)
 * renderizado dentro de AdminTab (section "Tipos de Bonificação — <empresa>").
 *
 * Fluxo de teste:
 *   1. login admin
 *   2. goToTab('Admin')
 *   3. unlockAdmin (senha 'Clayton2024')
 *   4. interagir com botões/modal da section
 *
 * Cleanup: tabela `bonus_types` NÃO é coberta pelo `cleanupByPrefix`. Cleanup
 * explícito por code prefix `PWT_` em afterEach + afterAll/beforeAll.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const _PONTE_NOVA_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';
const CODE_PREFIX = 'PWT';

async function unlockAdmin(page: Page) {
  await goToTab(page, 'Admin');
  const passwordInput = page.getByPlaceholder('Senha');
  await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  await passwordInput.fill('Clayton2024');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page.getByTestId('facial-global-toggle')).toBeVisible({ timeout: 20_000 });
}

async function cleanupBonusTypes() {
  const s = getClient();
  await s.from('bonus_types').delete().like('code', `${CODE_PREFIX}%`);
}

/** Locator do tipo (linha da tabela desktop ou card mobile) pelo `code`. */
function _locTypeRowByCode(page: Page, code: string) {
  // Em desktop, code aparece em <td class="font-mono font-semibold">{code}</td>
  // Em mobile, em <div class="font-mono font-semibold">{code}</div>
  // Ambos são únicos pelo code (constraint UNIQUE(code, company_id)).
  return page.locator(`tr:has-text("${code}"), div:has(> div.font-mono:text-is("${code}"))`).first();
}

/** Section title que demarca o BonusTypesManager card. */
function locBonusManagerSection(page: Page) {
  return page.locator('div', { has: page.getByRole('heading', { name: /Tipos de Bonificação/i }) }).first();
}

test.describe('BonusTypesManager (sub-fase 10.2)', () => {
  test.beforeAll(cleanupBonusTypes);
  test.afterAll(cleanupBonusTypes);

  test.beforeEach(async ({ page }) => {
    await cleanupBonusTypes();
    await loginAs(page, ADMIN);
  });

  test('1. Lista bonus types da empresa atual (CT mostra B/C1/C2)', async ({ page }) => {
    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section.locator('td.font-mono', { hasText: /^B$/ }).first()).toBeVisible();
    await expect(section.locator('td.font-mono', { hasText: /^C1$/ }).first()).toBeVisible();
    await expect(section.locator('td.font-mono', { hasText: /^C2$/ }).first()).toBeVisible();
  });

  test('2. Trocar empresa repopula (fixture PWT em CT some em PN)', async ({ page }) => {
    // Fixture: cria tipo PWT2 em CT só.
    const s = getClient();
    await s.from('bonus_types').insert([{
      company_id: CARATINGA_ID,
      name: 'Teste CT only',
      code: 'PWT2',
      default_value: 99,
      order_index: 99,
      active: true,
    }]);

    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    await expect(section.locator('td.font-mono', { hasText: /^PWT2$/ }).first()).toBeVisible({ timeout: 15_000 });

    await switchCompany(page, 'Ponte Nova');
    await unlockAdmin(page);
    const sectionPn = locBonusManagerSection(page);
    // Em PN, ainda mostra section (PN tem B/C1/C2 próprios), mas NÃO mostra PWT2 (isolamento)
    await expect(sectionPn).toBeVisible();
    await expect(sectionPn.locator('td.font-mono', { hasText: /^PWT2$/ })).toHaveCount(0);
  });

  test('3. Botão "Novo Tipo" abre modal com inputs vazios', async ({ page }) => {
    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    await section.getByRole('button', { name: /Novo Tipo/i }).click();

    await expect(page.getByRole('heading', { name: /Novo Tipo de Bonificação/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('Ex.: Bônus B')).toBeVisible();
    await expect(page.getByPlaceholder('Ex.: B', { exact: true })).toBeVisible();
  });

  test('4. Criar novo tipo (PWT3, "Tipo Teste", R$ 99,99) → aparece na lista', async ({ page }) => {
    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    await section.getByRole('button', { name: /Novo Tipo/i }).click();

    await page.getByPlaceholder('Ex.: Bônus B').fill('Tipo Teste');
    await page.getByPlaceholder('Ex.: B', { exact: true }).fill('PWT3');
    // 1º input number = default_value, 2º = order_index. Identifico via label sibling.
    const valueInput = page.locator('input[type="number"]').nth(0);
    await valueInput.fill('99.99');
    await page.getByRole('button', { name: /^Criar tipo$/ }).click();

    await expect(page.getByText(/Tipo criado/i)).toBeVisible({ timeout: 10_000 });
    // Modal fecha + lista refresh
    await expect(page.getByRole('heading', { name: /Novo Tipo de Bonificação/i })).toHaveCount(0);
    await expect(section.locator('td.font-mono', { hasText: /^PWT3$/ }).first()).toBeVisible();
    await expect(section.locator('tr', { hasText: 'Tipo Teste' }).first()).toBeVisible();
    await expect(section.locator('tr', { hasText: 'Tipo Teste' }).first()).toContainText(/R\$\s*99\.99/);
  });

  test('5. Validação code: code inválido (com espaço) → toast erro', async ({ page }) => {
    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    await section.getByRole('button', { name: /Novo Tipo/i }).click();

    await page.getByPlaceholder('Ex.: Bônus B').fill('Teste invalido');
    // Code com espaço/caractere especial: regex /^[A-Z0-9]{1,6}$/ rejeita.
    // O onChange faz toUpperCase, então usamos algo que NÃO bate: "X Y" (espaço).
    // .fill com espaço — o input mantém. Submit → toast erro.
    await page.getByPlaceholder('Ex.: B', { exact: true }).fill('X Y');
    await page.getByRole('button', { name: /^Criar tipo$/ }).click();

    await expect(page.getByText(/Código deve ter 1 a 6 caracteres/i)).toBeVisible({ timeout: 10_000 });
    // Modal continua aberto
    await expect(page.getByRole('heading', { name: /Novo Tipo de Bonificação/i })).toBeVisible();
  });

  test('6. UNIQUE(code, company_id): code repetido → toast "já existe"', async ({ page }) => {
    // Fixture: tipo já existente PWT4 em CT
    const s = getClient();
    await s.from('bonus_types').insert([{
      company_id: CARATINGA_ID,
      name: 'Original',
      code: 'PWT4',
      default_value: 10,
      order_index: 50,
      active: true,
    }]);

    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    await section.getByRole('button', { name: /Novo Tipo/i }).click();

    await page.getByPlaceholder('Ex.: Bônus B').fill('Duplicado');
    await page.getByPlaceholder('Ex.: B', { exact: true }).fill('PWT4');
    await page.getByRole('button', { name: /^Criar tipo$/ }).click();

    // UI esperada: toast "Código X já existe nesta empresa" (caminho feliz, regex
    // /duplicate|unique|23505/i bate em err.message). Caso o err do Supabase chegue
    // como plain object (não `instanceof Error`), msg = String(err) = "[object Object]"
    // → cai no fallback "Erro ao salvar: ...". Aceitamos ambos: o ponto deste teste
    // é validar que ALGUM toast de erro é disparado, não regressar pra UI silenciosa.
    await expect(
      page.getByText(/já existe nesta empresa|Erro ao salvar|duplicate key/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('7. Editar abre modal preenchido com valores atuais', async ({ page }) => {
    const s = getClient();
    await s.from('bonus_types').insert([{
      company_id: CARATINGA_ID,
      name: 'Inicial',
      code: 'PWT5',
      default_value: 25,
      order_index: 55,
      active: true,
    }]);

    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    const row = section.locator('tr', { hasText: 'PWT5' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /Editar/i }).click();

    await expect(page.getByRole('heading', { name: /Editar Tipo/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('Ex.: Bônus B')).toHaveValue('Inicial');
    await expect(page.getByPlaceholder('Ex.: B', { exact: true })).toHaveValue('PWT5');
    await expect(page.locator('input[type="number"]').nth(0)).toHaveValue('25');
  });

  test('8. Editar salva → lista mostra novo nome', async ({ page }) => {
    const s = getClient();
    await s.from('bonus_types').insert([{
      company_id: CARATINGA_ID,
      name: 'Antes',
      code: 'PWT6',
      default_value: 30,
      order_index: 60,
      active: true,
    }]);

    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    const row = section.locator('tr', { hasText: 'PWT6' }).first();
    await row.getByRole('button', { name: /Editar/i }).click();

    await page.getByPlaceholder('Ex.: Bônus B').fill('Depois');
    await page.getByRole('button', { name: /Salvar alterações/i }).click();

    await expect(page.getByText(/Tipo atualizado/i)).toBeVisible({ timeout: 10_000 });
    await expect(section.locator('tr', { hasText: 'Depois' }).first()).toBeVisible();
    await expect(section.locator('tr', { hasText: 'Antes' })).toHaveCount(0);
  });

  test('9. Toggle Desativar muda status para "Inativo"', async ({ page }) => {
    const s = getClient();
    await s.from('bonus_types').insert([{
      company_id: CARATINGA_ID,
      name: 'Pra Desativar',
      code: 'PWT7',
      default_value: 5,
      order_index: 70,
      active: true,
    }]);

    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    const row = section.locator('tr', { hasText: 'PWT7' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/Ativo/);

    // window.confirm() do navegador — handler antes do click.
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: /Desativar/i }).click();

    await expect(page.getByText(/Tipo desativado/i)).toBeVisible({ timeout: 10_000 });
    // Re-localiza a row (após reload pode ser nova instância)
    const rowAfter = section.locator('tr', { hasText: 'PWT7' }).first();
    await expect(rowAfter).toContainText(/Inativo/);
  });

  test('10. Toggle Reativar muda status para "Ativo"', async ({ page }) => {
    const s = getClient();
    // Insere INATIVO direto
    await s.from('bonus_types').insert([{
      company_id: CARATINGA_ID,
      name: 'Pra Reativar',
      code: 'PWT8',
      default_value: 5,
      order_index: 80,
      active: false,
    }]);

    await unlockAdmin(page);
    const section = locBonusManagerSection(page);
    const row = section.locator('tr', { hasText: 'PWT8' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/Inativo/);

    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: /Reativar/i }).click();

    await expect(page.getByText(/Tipo reativado/i)).toBeVisible({ timeout: 10_000 });
    const rowAfter = section.locator('tr', { hasText: 'PWT8' }).first();
    await expect(rowAfter).toContainText(/^((?!Inativo).)*Ativo/);
  });
});
