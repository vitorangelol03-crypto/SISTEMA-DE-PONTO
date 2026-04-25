import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Cobertura completa de Períodos de Pagamento (PaymentPeriodsTab):
 *  - Criar período manual (start, end, payment date, label)
 *  - Validação data inicial < final
 *  - Fechar período (status='paid')
 *  - Toggle auto-weekly
 *  - Listagem
 */

const TEST_LABEL_PREFIX = 'PW Test Period ';

async function cleanupPeriods() {
  const s = getClient();
  await s.from('payment_periods').delete().like('label', `${TEST_LABEL_PREFIX}%`);
}

test.describe('Payment Periods — completo', () => {
  test.beforeAll(cleanupPeriods);
  test.afterAll(cleanupPeriods);

  test.beforeEach(async ({ page }) => {
    await cleanupPeriods();
    await loginAs(page, ADMIN);
    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /Per[íi]odos/i }).first().click();
  });

  test('criar período manual válido (start, end, payment_date, label)', async ({ page }) => {
    const label = `${TEST_LABEL_PREFIX}Criação`;
    await page.getByRole('button', { name: /Novo Per[íi]odo/i }).first().click();
    // Modal abre
    await expect(page.getByRole('heading', { name: /Novo Per[íi]odo/i })).toBeVisible();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2030-07-01');
    await dateInputs.nth(1).fill('2030-07-07');
    await dateInputs.nth(2).fill('2030-07-08');

    // Label opcional (último input text)
    await page.getByPlaceholder(/Ex: Semana/i).fill(label);

    await page.getByRole('button', { name: /^Criar$/ }).click();
    await expect(page.getByText(/criado/i).first()).toBeVisible({ timeout: 10_000 });

    const s = getClient();
    const { data } = await s.from('payment_periods').select('*').eq('label', label).single();
    expect(data?.start_date).toBe('2030-07-01');
    expect(data?.end_date).toBe('2030-07-07');
    expect(data?.payment_date).toBe('2030-07-08');
    expect(data?.status).toBe('open');
  });

  test('validação: data inicial > final → erro', async ({ page }) => {
    await page.getByRole('button', { name: /Novo Per[íi]odo/i }).first().click();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2030-07-15');
    await dateInputs.nth(1).fill('2030-07-01'); // anterior
    await dateInputs.nth(2).fill('2030-07-16');

    await page.getByRole('button', { name: /^Criar$/ }).click();
    await expect(page.getByText(/anterior\s+à\s+final|Data inicial/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('fechar período: status open → paid', async ({ page }) => {
    const label = `${TEST_LABEL_PREFIX}Fechar`;
    const s = getClient();
    await s.from('payment_periods').insert([{
      start_date: '2030-08-01',
      end_date: '2030-08-07',
      payment_date: '2030-08-08',
      label,
      status: 'open',
      created_by: '9999',
    }]);

    await page.reload();
    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /Per[íi]odos/i }).first().click();

    const row = page.locator('tr', { hasText: label }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: /Fechar/i }).first().click();
    await page.waitForTimeout(1500);

    const { data } = await s.from('payment_periods').select('status').eq('label', label).single();
    expect(data?.status).toBe('paid');
  });

  test('toggle auto-weekly altera config', async ({ page }) => {
    const s = getClient();
    // Estado inicial
    const { data: cfgBefore } = await s.from('payment_period_config').select('auto_weekly').single();
    const before = !!cfgBefore?.auto_weekly;

    const toggle = page.getByText(/Criar per[íi]odos semanais automaticamente/i);
    if (!(await toggle.isVisible().catch(() => false))) {
      test.skip(true, 'Toggle auto-weekly não disponível nesta UI');
    }
    // Toggle button próximo
    await page.locator('button[role="switch"], input[type="checkbox"]').first().click({ trial: false }).catch(() => {});
    await page.waitForTimeout(1000);

    const { data: cfgAfter } = await s.from('payment_period_config').select('auto_weekly').single();
    expect(!!cfgAfter?.auto_weekly).not.toBe(before);

    // Restaura
    await s.from('payment_period_config').update({ auto_weekly: before }).neq('id', '00000000-0000-0000-0000-000000000000');
  });

  test('listagem mostra todos os períodos criados', async ({ page }) => {
    const label1 = `${TEST_LABEL_PREFIX}List1`;
    const label2 = `${TEST_LABEL_PREFIX}List2`;
    const s = getClient();
    await s.from('payment_periods').insert([
      {
        start_date: '2030-09-01', end_date: '2030-09-07',
        payment_date: '2030-09-08', label: label1, status: 'open', created_by: '9999',
      },
      {
        start_date: '2030-09-08', end_date: '2030-09-14',
        payment_date: '2030-09-15', label: label2, status: 'paid', created_by: '9999',
      },
    ]);

    await page.reload();
    await goToTab(page, 'Erros');
    await page.getByRole('button', { name: /Per[íi]odos/i }).first().click();

    await expect(page.locator('tr', { hasText: label1 }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr', { hasText: label2 }).first()).toBeVisible();
  });
});
