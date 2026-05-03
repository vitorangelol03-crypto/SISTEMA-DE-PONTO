import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Módulo 27 — Combo G: Banco de horas no pagamento (sub-fases 2.16 + 2.17).
 *
 * Cobertura E2E:
 *  1. Admin master vê Seção 10 ("Banco de Horas no Pagamento") em
 *     Configurações da Empresa, com aviso de permissão e simulador.
 *  2. Toggle master expande/colapsa os campos condicionais sem salvar.
 *  3. Simulador calcula valores corretos em tempo real (smoke do calculator
 *     puro embutido na UI).
 *  4. FinancialTab carrega dropdown de payment_periods da empresa atual.
 *  5. Botão "Aplicar banco de horas" só fica visível e habilitado quando
 *     (a) empresa tem `bank_hours_apply_in_payment=true` e (b) period está
 *     selecionado. Validamos o (b) — visibilidade do (a) depende do estado
 *     atual do banco e é coberta no apply real.
 *
 * Snapshot/restore da config da Caratinga: o teste 5 LIGA o toggle no DB pra
 * tornar o botão visível, depois restaura no afterAll. Testes 1-4 não tocam
 * estado persistido (apenas UI in-memory).
 *
 * Isolamento: serial (workers: 1) — sem race com outros specs.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const ADMIN_SECRET = 'Clayton2024'; // mesma senha que o spec 12-admin-tab usa

async function enterAdminSection(page: import('@playwright/test').Page) {
  await goToTab(page, 'Admin');
  await page.getByPlaceholder('Senha').fill(ADMIN_SECRET);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  // Painel Admin abre depois da auth — sanity check
  await expect(page.getByRole('heading', { name: /Painel Admin/ })).toBeVisible({ timeout: 15_000 });
}

interface CompanyBankHoursSnapshot {
  bank_hours_enabled: boolean | null;
  bank_hours_apply_in_payment: boolean | null;
  bank_hours_formula: string | null;
  bank_hours_extra_multiplier: number | null;
  bank_hours_custom_value: number | null;
  bank_hours_credit_action: string | null;
  bank_hours_debit_action: string | null;
  bank_hours_period: string | null;
  bank_hours_display: string | null;
  bank_hours_after_apply: string | null;
  bank_hours_night_separate: boolean | null;
  bank_hours_night_multiplier: number | null;
}

let originalConfig: CompanyBankHoursSnapshot | null = null;

test.describe('Combo G — Banco de horas no pagamento', () => {
  test.beforeAll(async () => {
    const s = getClient();
    const { data, error } = await s
      .from('companies')
      .select(
        'bank_hours_enabled, bank_hours_apply_in_payment, bank_hours_formula, ' +
        'bank_hours_extra_multiplier, bank_hours_custom_value, ' +
        'bank_hours_credit_action, bank_hours_debit_action, ' +
        'bank_hours_period, bank_hours_display, bank_hours_after_apply, ' +
        'bank_hours_night_separate, bank_hours_night_multiplier'
      )
      .eq('id', CARATINGA_ID)
      .single();
    if (error) throw error;
    originalConfig = data as CompanyBankHoursSnapshot;
  });

  test.afterAll(async () => {
    if (!originalConfig) return;
    const s = getClient();
    await s.from('companies').update(originalConfig).eq('id', CARATINGA_ID);
  });

  test('1. Admin vê Seção 10 (Banco de Horas no Pagamento) com toggle e header', async ({ page }) => {
    await loginAs(page, ADMIN);
    await enterAdminSection(page);

    // Procura o cabeçalho da Seção 10. O componente CompanySettings é renderizado
    // dentro da AdminTab — vamos rolar até o título da seção.
    const sectionHeading = page.getByRole('heading', { name: /Banco de Horas no Pagamento/i });
    await expect(sectionHeading).toBeVisible({ timeout: 15_000 });

    // Subtítulo descritivo presente
    await expect(page.getByText(/Configura como o saldo de horas/i)).toBeVisible();

    // Toggle master pelo label
    await expect(page.getByText(/Banco de horas afeta pagamento\?/i)).toBeVisible();
  });

  test('2. Toggle master expande/colapsa campos condicionais sem salvar', async ({ page }) => {
    await loginAs(page, ADMIN);
    await enterAdminSection(page);

    const sectionHeading = page.getByRole('heading', { name: /Banco de Horas no Pagamento/i });
    await expect(sectionHeading).toBeVisible({ timeout: 15_000 });

    // Pré-condição: o toggle master é desabilitado quando "Banco de horas habilitado"
    // está OFF (relação UX intencional). Liga esse primeiro pra poder testar o master.
    const enabledCheckbox = page.getByLabel('Banco de horas habilitado');
    await enabledCheckbox.scrollIntoViewIfNeeded();
    const enabledWasOn = await enabledCheckbox.isChecked();
    if (!enabledWasOn) await enabledCheckbox.check();

    // Toggle master agora deve estar interagível.
    const masterCheckbox = page.locator('#bh-toggle-master');
    const masterWasOn = await masterCheckbox.isChecked();
    if (!masterWasOn) await masterCheckbox.check();

    // Campos condicionais aparecem.
    const formulaLabel = page.getByText(/Fórmula de conversão hora → R\$/i);
    await expect(formulaLabel).toBeVisible({ timeout: 5_000 });

    // Desliga master → campos somem.
    await masterCheckbox.uncheck();
    await expect(formulaLabel).not.toBeVisible();

    // Restaura estado original em memória (não salvou).
    if (masterWasOn) await masterCheckbox.check();
    if (!enabledWasOn) await enabledCheckbox.uncheck();
  });

  test('3. Simulador de banco de horas calcula em tempo real', async ({ page }) => {
    await loginAs(page, ADMIN);
    await enterAdminSection(page);

    const sectionHeading = page.getByRole('heading', { name: /Banco de Horas no Pagamento/i });
    await expect(sectionHeading).toBeVisible({ timeout: 15_000 });

    // Liga "Banco de horas habilitado" + master pra renderizar o simulador.
    const enabledCheckbox = page.getByLabel('Banco de horas habilitado');
    await enabledCheckbox.scrollIntoViewIfNeeded();
    const enabledWasOn = await enabledCheckbox.isChecked();
    if (!enabledWasOn) await enabledCheckbox.check();

    const masterCheckbox = page.locator('#bh-toggle-master');
    const masterWasOn = await masterCheckbox.isChecked();
    if (!masterWasOn) await masterCheckbox.check();

    // Simulador aparece
    const simHeading = page.getByRole('heading', { name: /Simulador de cálculo/i });
    await expect(simHeading).toBeVisible();

    // Por padrão o simulador inicializa com dailyRate=100, jornada=8h, crédito=2h.
    // Com formula='daily_div_8' (default): hora = 100/8 = 12.50; crédito = 2 × 12.50 = 25.00.
    await expect(page.getByText(/R\$\s*12,50\/h/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/\+R\$\s*25,00/i)).toBeVisible();

    // Restaura (sem salvar)
    if (!masterWasOn) await masterCheckbox.uncheck();
    if (!enabledWasOn) await enabledCheckbox.uncheck();
  });

  test('4. FinancialTab carrega dropdown de payment_periods da empresa', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    // O label "Período de pagamento" identifica o dropdown adicionado pelo combo G.
    const periodLabel = page.getByText(/Período de pagamento/i).first();
    await expect(periodLabel).toBeVisible({ timeout: 15_000 });

    // Pega o select adjacente ao label e checa que tem opções (placeholder + ≥1 period)
    const select = page.locator('select').filter({ hasText: 'Sem período' }).first();
    await expect(select).toBeVisible();
    const optionCount = await select.locator('option').count();
    expect(optionCount).toBeGreaterThan(1); // placeholder + pelo menos 1 period
  });

  test('5. Botão "Aplicar banco de horas" disabled sem period; habilita ao selecionar', async ({ page }) => {
    // Pré: liga toggle no DB pra renderizar o botão (visibilidade depende disso).
    const s = getClient();
    await s
      .from('companies')
      .update({ bank_hours_enabled: true, bank_hours_apply_in_payment: true })
      .eq('id', CARATINGA_ID);

    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    // Botão deve estar visível (toggle ON no DB) mas disabled (sem period selecionado).
    const applyBtn = page.getByRole('button', { name: /Aplicar banco de horas/i });
    await expect(applyBtn).toBeVisible({ timeout: 15_000 });
    await expect(applyBtn).toBeDisabled();

    // Seleciona o primeiro period real do dropdown.
    const select = page.locator('select').filter({ hasText: 'Sem período' }).first();
    const firstRealOption = await select.locator('option').nth(1).getAttribute('value');
    expect(firstRealOption).toBeTruthy();
    await select.selectOption(firstRealOption!);

    // Botão deve habilitar.
    await expect(applyBtn).toBeEnabled({ timeout: 5_000 });

    // Verifica que datas viraram readonly (auto-fill do period).
    const startDate = page.locator('input[type="date"]').first();
    await expect(startDate).toHaveAttribute('readonly', '');
  });
});
