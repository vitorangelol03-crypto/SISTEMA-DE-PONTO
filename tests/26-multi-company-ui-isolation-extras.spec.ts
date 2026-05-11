import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';
import { getClient } from './cleanup';
import {
  createTestEmployee,
  insertPaymentRow,
  cleanupByPrefix,
  SAFE_DATE,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * Sub-fase 9.4 — 4 specs E2E novas (TECH_DEBT 6.18-6.21) cobrindo isolamento
 * UI multi-empresa em tabs que precisam de fixture (pré-condicionamento de
 * dados em apenas UMA empresa pra demonstrar isolamento via UI).
 *
 * Cada teste:
 *   1. Cria/seta fixture só em Caratinga (CT).
 *   2. Asserta UI CT mostra a fixture.
 *   3. Trocar pra Ponte Nova (PN). switchCompany dispara reload
 *      (Layout.tsx:45) → activeTab/state interno reseta.
 *   4. Asserta UI PN exibe o estado vazio exclusivo do componente.
 *   5. Restaura estado prod via cleanup.
 *
 * Restauração de prod é OBRIGATÓRIA. Falha aqui = poluição que
 * vaza pra próximas runs / produção.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PONTE_NOVA_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';
const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}26Extra `;

async function setDateRange(page: Page, start: string, end: string) {
  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs.first()).toBeVisible({ timeout: 10_000 });
  await dateInputs.nth(0).fill(start);
  await dateInputs.nth(1).fill(end);
  // C6PaymentTab desabilita "Importar Dados" enquanto isEditingDate.*=true
  // (foco no input de data). Click fora força blur → handleDateBlur reseta.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
}

async function unlockAdmin(page: Page) {
  await goToTab(page, 'Admin');
  const passwordInput = page.getByPlaceholder('Senha');
  await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  await passwordInput.fill('Clayton2024');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  // Espera painel autenticado abrir (mesma heuristica do spec 24).
  await expect(page.getByTestId('facial-global-toggle')).toBeVisible({ timeout: 20_000 });
}

function todayBR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

test.describe('Isolamento UI multi-empresa — extras (6.18-6.21)', () => {
  test.beforeAll(() => cleanupByPrefix(PREFIX));
  test.afterAll(() => cleanupByPrefix(PREFIX));

  test.beforeEach(async ({ page }) => {
    await cleanupByPrefix(PREFIX);
    await loginAs(page, ADMIN);
  });

  test('10. C6PaymentTab: CT importa fixture; PN toast "Nenhum pagamento encontrado" (6.18)', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}C6` });
    await insertPaymentRow(empId, SAFE_DATE, { daily_rate: 100, bonus_b: 5 });

    // ─── Caratinga (default) ──────────────────────────────────────────────
    await goToTab(page, 'Pagamento C6');
    await setDateRange(page, SAFE_DATE, SAFE_DATE);
    await page.getByRole('button', { name: /^Importar Dados$/ }).click();

    // dataImported=true após sucesso → h3 "2. Revisar e Editar Pagamentos"
    await expect(
      page.getByRole('heading', { name: /Revisar e Editar Pagamentos/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('table tr', { hasText: `${PREFIX}C6` }).first()
    ).toBeVisible();

    // ─── Ponte Nova ───────────────────────────────────────────────────────
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Pagamento C6');
    await setDateRange(page, SAFE_DATE, SAFE_DATE);
    await page.getByRole('button', { name: /^Importar Dados$/ }).click();

    // PN não tem payments no range → toast erro + tela continua em "Importar"
    await expect(
      page.getByText(/Nenhum pagamento encontrado no per[íi]odo/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: /Importar Dados Financeiros/i })
    ).toBeVisible();
  });

  test('11. SettingsTab: valores padrão de bônus distintos por empresa (6.19)', async ({ page }) => {
    const s = getClient();
    // Captura valores originais (pra restaurar após o teste — ambas empresas
    // hoje têm B=15.00, conforme dump de 2026-05-11). Se valor inicial mudar,
    // o restore ainda funciona.
    const { data: origCt } = await s.from('bonus_types').select('default_value')
      .eq('company_id', CARATINGA_ID).eq('code', 'B').maybeSingle();
    const { data: origPn } = await s.from('bonus_types').select('default_value')
      .eq('company_id', PONTE_NOVA_ID).eq('code', 'B').maybeSingle();
    const ctValue = Number(origCt?.default_value ?? 15);
    const pnOriginal = Number(origPn?.default_value ?? 15);

    // Fixture: força PN B = 77 (≠ CT 15) — garante UI distinta.
    await s.from('bonus_types').update({ default_value: 77 })
      .eq('company_id', PONTE_NOVA_ID).eq('code', 'B');

    try {
      // ─── Caratinga (default) ────────────────────────────────────────────
      await goToTab(page, 'Configurações');
      const inputCtB = page.getByLabel('Tipo B');
      await expect(inputCtB).toHaveValue(ctValue.toFixed(2), { timeout: 15_000 });

      // ─── Ponte Nova ─────────────────────────────────────────────────────
      await switchCompany(page, 'Ponte Nova');
      await goToTab(page, 'Configurações');
      const inputPnB = page.getByLabel('Tipo B');
      await expect(inputPnB).toHaveValue('77.00', { timeout: 15_000 });
    } finally {
      // Restaura PN ao valor original (15.00 ou o que era antes).
      await s.from('bonus_types').update({ default_value: pnOriginal })
        .eq('company_id', PONTE_NOVA_ID).eq('code', 'B');
    }
  });

  test('12. TriageTab: CT mostra registro do mês corrente; PN "Nenhum registro neste mês" (6.20)', async ({ page }) => {
    const s = getClient();
    const today = todayBR();

    // Fixture: triage_error com observação prefixada (cleanup mais fácil).
    // O insert direto especifica company_id=CT — o `getTriageErrors` no
    // componente filtra por company_id explicitamente.
    await s.from('triage_errors').insert([{
      date: today,
      triage_type: 'quantity',
      error_count: 42,
      observations: `${PREFIX}TriageRow`,
      created_by: '9999',
      company_id: CARATINGA_ID,
    }]);

    try {
      // ─── Caratinga (default) ────────────────────────────────────────────
      await goToTab(page, 'Erros');
      await page.getByRole('button', { name: /Triagem/i }).first().click();

      // Registros do mês atual: row aparece com observação prefixada
      await expect(
        page.locator('tbody tr', { hasText: `${PREFIX}TriageRow` }).first()
      ).toBeVisible({ timeout: 15_000 });

      // ─── Ponte Nova ─────────────────────────────────────────────────────
      await switchCompany(page, 'Ponte Nova');
      await goToTab(page, 'Erros');
      await page.getByRole('button', { name: /Triagem/i }).first().click();

      await expect(
        page.getByText(/Nenhum registro neste m[êe]s/i)
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      // Cleanup: remove a row inserida.
      await s.from('triage_errors')
        .delete()
        .eq('observations', `${PREFIX}TriageRow`)
        .eq('company_id', CARATINGA_ID);
    }
  });

  test('13. AdminTab Bloqueios: CT mostra block ativo; PN "Nenhum bloqueio encontrado" (6.21)', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}Block` });
    const s = getClient();

    // Fixture: bonus_block ativo em CT (week_end > hoje pra blockActiveOnly=true).
    const today = new Date();
    const weekStart = today.toISOString().slice(0, 10);
    const weekEndDate = new Date(today);
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    await s.from('bonus_blocks').insert([{
      employee_id: empId,
      week_start: weekStart,
      week_end: weekEnd,
      reason: `${PREFIX}BlockReason`,
      blocked_by: '9999',
      company_id: CARATINGA_ID,
    }]);

    // ─── Caratinga (default) ──────────────────────────────────────────────
    await unlockAdmin(page);

    // Section "Bloqueios de Bonificação" lista o block. Usamos `reason`
    // ao invés de emp name porque o name aparece também em <option> hidden
    // do filtro EmployeeSelect (linha 1154 do AdminTab.tsx).
    await expect(
      page.getByText(`${PREFIX}BlockReason`).first()
    ).toBeVisible({ timeout: 15_000 });
    // "Nenhum bloqueio encontrado" NÃO aparece em CT
    await expect(page.getByText(/Nenhum bloqueio encontrado/i)).toHaveCount(0);

    // ─── Ponte Nova ───────────────────────────────────────────────────────
    await switchCompany(page, 'Ponte Nova');
    await unlockAdmin(page);

    await expect(
      page.getByText(/Nenhum bloqueio encontrado/i)
    ).toBeVisible({ timeout: 10_000 });
    // Cleanup do bonus_block é feito por cleanupByPrefix (afterAll +
    // beforeEach do próximo teste), via empIds com prefix.
  });
});
