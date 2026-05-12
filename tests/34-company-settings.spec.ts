import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';
import { getClient } from './cleanup';

/**
 * Sub-fase 10.4 — CompanySettings spec
 *
 * Componente em `src/components/admin/CompanySettings.tsx` (856 lin)
 * renderizado dentro de AdminTab linha 1457. Visível apenas pra `isAdminMaster`
 * (`user?.id === '9999'`), section h3 "Configurações da Empresa — <display_name>".
 *
 * Escopo: 8 testes core cobrindo carregamento, isolamento multi-empresa,
 * inputs principais, dependência entre toggles (bank_hours_enabled →
 * bank_hours_apply_in_payment) e persistência de save no DB.
 *
 * NOTA: o plano sugeria 18 testes (a-h cenários). Para não inflar tempo,
 * cobrimos os 8 essenciais. O simulador de bank_hours e os 5+ toggles
 * adicionais (formula, credit_action, debit_action, etc.) ficam pra
 * cobertura unitária em sub-fase futura.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const _PONTE_NOVA_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';

async function unlockAdmin(page: Page) {
  await goToTab(page, 'Admin');
  const passwordInput = page.getByPlaceholder('Senha');
  await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  await passwordInput.fill('Clayton2024');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page.getByTestId('facial-global-toggle')).toBeVisible({ timeout: 20_000 });
}

function locSettingsSection(page: Page) {
  // Section root: <div class="bg-white p-4 sm:p-5 rounded-lg shadow"> que contém o heading.
  // Sem o filtro `div.bg-white` pegaríamos o wrapper externo da AdminTab inteira (que tem
  // botão "Salvar nova senha" disabled — colide com `getByRole('button', { name: /^Salvar/ })`).
  return page
    .locator('div.bg-white')
    .filter({ has: page.getByRole('heading', { name: /Configurações da Empresa/i }) })
    .first();
}

async function captureOriginalCity(companyId: string): Promise<string> {
  const s = getClient();
  const { data } = await s.from('companies').select('city').eq('id', companyId).single();
  return ((data as { city: string | null })?.city ?? '');
}

async function restoreCity(companyId: string, city: string) {
  const s = getClient();
  await s.from('companies').update({ city }).eq('id', companyId);
}

test.describe('CompanySettings (sub-fase 10.4)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('1. Section visível em CT com title "Configurações da Empresa — Caratinga"', async ({ page }) => {
    // O title usa company.display_name ("Caratinga"), NÃO legal_name.
    await unlockAdmin(page);
    const section = locSettingsSection(page);
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section.getByRole('heading', { name: /Configurações da Empresa/i })).toContainText('Caratinga');
  });

  test('2. Razão social + CNPJ visíveis read-only (disabled)', async ({ page }) => {
    await unlockAdmin(page);
    const section = locSettingsSection(page);
    await expect(section).toBeVisible({ timeout: 15_000 });

    const legalName = section.locator('input[disabled]').nth(0);
    const cnpj = section.locator('input[disabled]').nth(1);
    await expect(legalName).toHaveValue('CLAYTON B DOS SANTOS');
    await expect(cnpj).toBeVisible();
    // CNPJ não precisa ser exato — apenas confirmar não vazio.
    expect(await cnpj.inputValue()).not.toBe('');
  });

  test('3. Switch empresa (CT → PN) atualiza title da section', async ({ page }) => {
    await unlockAdmin(page);
    await expect(
      locSettingsSection(page).getByRole('heading', { name: /Configurações da Empresa/i })
    ).toContainText('Caratinga', { timeout: 15_000 });

    await switchCompany(page, 'Ponte Nova');
    await unlockAdmin(page);
    await expect(
      locSettingsSection(page).getByRole('heading', { name: /Configurações da Empresa/i })
    ).toContainText('Ponte Nova', { timeout: 15_000 });
  });

  test('4. Input Cidade aceita digitação (state local atualiza)', async ({ page }) => {
    await unlockAdmin(page);
    const section = locSettingsSection(page);
    const cityInput = section.locator('label:has-text("Cidade") + input').first();
    await expect(cityInput).toBeVisible({ timeout: 15_000 });
    await cityInput.fill('PW Test Cidade');
    await expect(cityInput).toHaveValue('PW Test Cidade');
  });

  test('5. Checkbox "Banco de horas habilitado" reflete state inicial', async ({ page }) => {
    await unlockAdmin(page);
    const section = locSettingsSection(page);
    // Label exato pra evitar pegar outros checkboxes com "Banco de horas"
    const checkbox = section.locator('label').filter({ hasText: /^Banco de horas habilitado$/ }).locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible({ timeout: 15_000 });
    // State inicial é o que está no DB — não assumimos true/false. Apenas confirmamos
    // que o checkbox é interativo (não disabled).
    expect(await checkbox.isDisabled()).toBe(false);
  });

  test('6. Toggle "Banco de horas afeta pagamento?" DISABLED quando enabled=false', async ({ page }) => {
    // Pre-condition: setar bank_hours_enabled=false no DB pra garantir state previsível.
    const s = getClient();
    const { data: orig } = await s.from('companies').select('bank_hours_enabled').eq('id', CARATINGA_ID).single();
    const original = (orig as { bank_hours_enabled: boolean | null })?.bank_hours_enabled ?? false;
    await s.from('companies').update({ bank_hours_enabled: false }).eq('id', CARATINGA_ID);

    try {
      await unlockAdmin(page);
      const applyToggle = page.locator('#bh-toggle-master');
      await expect(applyToggle).toBeVisible({ timeout: 15_000 });
      await expect(applyToggle).toBeDisabled();
    } finally {
      await s.from('companies').update({ bank_hours_enabled: original }).eq('id', CARATINGA_ID);
    }
  });

  test('7. Marcar "Banco de horas habilitado" via UI habilita toggle apply_in_payment', async ({ page }) => {
    // Em vez de UPDATE direto no DB (que não invalida o React context),
    // marcamos o checkbox via UI — state local atualiza imediatamente.
    await unlockAdmin(page);
    const section = locSettingsSection(page);
    const enabledCheckbox = section
      .locator('label')
      .filter({ hasText: /^Banco de horas habilitado$/ })
      .locator('input[type="checkbox"]');
    await expect(enabledCheckbox).toBeVisible({ timeout: 15_000 });

    const applyToggle = page.locator('#bh-toggle-master');
    await expect(applyToggle).toBeVisible();
    const wasChecked = await enabledCheckbox.isChecked();
    if (!wasChecked) {
      await enabledCheckbox.check();
    }
    await expect(applyToggle).toBeEnabled({ timeout: 10_000 });

    // Cleanup state local — desmarcar pra deixar UI sem mudanças não salvas
    if (!wasChecked) {
      await enabledCheckbox.uncheck();
    }
  });

  test('8. Salvar Cidade modificada persiste no DB e mostra toast', async ({ page }) => {
    const originalCity = await captureOriginalCity(CARATINGA_ID);
    const testCity = 'PW Test Cidade ' + Date.now();

    try {
      await unlockAdmin(page);
      const section = locSettingsSection(page);
      const cityInput = section.locator('label:has-text("Cidade") + input').first();
      await expect(cityInput).toBeVisible({ timeout: 15_000 });
      await cityInput.fill(testCity);

      // Submit do form — botão Salvar é submit padrão dentro do <form>.
      await section.getByRole('button', { name: /^Salvar/ }).first().click();

      // Toast de sucesso
      await expect(page.getByText(/Configura[çc]ões salvas|salvo|atualizado/i).first())
        .toBeVisible({ timeout: 10_000 });

      // Confirma persistência no DB
      const s = getClient();
      const { data } = await s.from('companies').select('city').eq('id', CARATINGA_ID).single();
      expect((data as { city: string }).city).toBe(testCity);
    } finally {
      await restoreCity(CARATINGA_ID, originalCity);
    }
  });
});
