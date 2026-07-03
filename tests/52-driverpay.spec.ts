import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E da aba "Pagamentos Driver" (iMile CTGA) — molde do 20-c6-complete.
 *
 * Estado atual do módulo: a fiação (App.tsx, TabNavigation, permissions, i18n)
 * já existe e a aba abre, mas `src/components/driverpay/DriverPayTab.tsx` ainda é
 * um PLACEHOLDER ("Módulo em construção"). A grade de pagamentos (lista de
 * drivers, edição de pacotes, recálculo de total) será montada nas próximas
 * sub-fases pelos agentes de UI.
 *
 * Por isso este arquivo tem DUAS partes:
 *   1) "smoke" (ATIVO): valida que a aba abre para o admin. Passa hoje, contra o
 *      placeholder, e deve continuar passando quando a UI completa entrar (o
 *      cabeçalho "Pagamentos Driver" permanece).
 *   2) "grade e recálculo" (test.describe.skip): fluxo completo que DEPENDE da UI
 *      que ainda não existe. Já traz o seed em driverpay_* (prefixo 'PW Test') e a
 *      limpeza obrigatória, prontos para serem ligados. Ver TODOs para os
 *      seletores a confirmar quando o componente real existir.
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}DriverPay `; // 'PW Test DriverPay '

// ─── Smoke: a aba abre (roda hoje, contra o placeholder) ─────────────────────

test.describe('Pagamentos Driver — smoke (aba abre)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('a aba "Pagamentos Driver" aparece na navegação do admin', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /^Pagamentos Driver$/ }).first(),
    ).toBeVisible();
  });

  test('clicar na aba abre o módulo (cabeçalho "Pagamentos Driver")', async ({ page }) => {
    await goToTab(page, 'Pagamentos Driver');
    // Placeholder e UI final expõem um heading "Pagamentos Driver".
    await expect(
      page.getByRole('heading', { name: /Pagamentos Driver/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Helpers de seed/cleanup em driverpay_* (para os testes de grade) ────────
//
// Escopo de teste: tudo com prefixo 'PW Test' (drivers e período). Requer
// SUPABASE_SERVICE_ROLE_KEY no .env — as tabelas driverpay_* têm RLS que só
// libera por company_id do JWT ou sub in (9999,2626); o service_role bypassa
// RLS e também o trigger de trava de período (migration L186).

interface SeededPayment {
  companyId: string;
  periodId: string;
  driverId: string;
  paymentId: string;
}

/** Busca o id da empresa "Caratinga" (empresa default dos testes). */
async function getCaratingaId(): Promise<string> {
  const s = getClient();
  const { data, error } = await s
    .from('companies')
    .select('id, display_name, legal_name, city')
    .limit(1000);
  if (error) throw error;
  const match = (data || []).find((c: Record<string, unknown>) =>
    [c.display_name, c.legal_name, c.city]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes('caratinga')),
  );
  if (!match) throw new Error('Empresa "Caratinga" não encontrada no banco');
  return (match as { id: string }).id;
}

/**
 * Cria um cenário mínimo: 1 plataforma 'PW Test eMile', 1 driver 'PW Test …',
 * 1 período aberto 'PW Test …', 1 pagamento com 1 linha de pacotes.
 * total_net esperado inicial = packages * rate.
 */
async function seedDriverPayment(opts: {
  driverName: string;
  route: string;
  packages: number;
  rate: number;
}): Promise<SeededPayment> {
  const s = getClient();
  const companyId = await getCaratingaId();

  const { data: platform, error: pErr } = await s
    .from('driverpay_platforms')
    .insert([{ company_id: companyId, name: `${PREFIX}eMile`, default_rate: opts.rate, sort_order: 0 }])
    .select('id, name')
    .single();
  if (pErr) throw pErr;

  const { data: driver, error: dErr } = await s
    .from('driverpay_drivers')
    .insert([{ company_id: companyId, name: opts.driverName, route: opts.route, active: true }])
    .select('id, name, route')
    .single();
  if (dErr) throw dErr;

  const { data: period, error: perErr } = await s
    .from('driverpay_periods')
    .insert([{ company_id: companyId, label: `${PREFIX}Quinzena`, status: 'aberto' }])
    .select('id')
    .single();
  if (perErr) throw perErr;

  const { data: payment, error: payErr } = await s
    .from('driverpay_payments')
    .insert([{
      company_id: companyId,
      period_id: (period as { id: string }).id,
      driver_id: (driver as { id: string }).id,
      driver_name_snapshot: opts.driverName,
      route_snapshot: opts.route,
    }])
    .select('id')
    .single();
  if (payErr) throw payErr;

  const { error: pkgErr } = await s.from('driverpay_payment_packages').insert([{
    company_id: companyId,
    payment_id: (payment as { id: string }).id,
    platform_name: (platform as { name: string }).name,
    route: opts.route,
    packages: opts.packages,
    rate_snapshot: opts.rate,
  }]);
  if (pkgErr) throw pkgErr;

  return {
    companyId,
    periodId: (period as { id: string }).id,
    driverId: (driver as { id: string }).id,
    paymentId: (payment as { id: string }).id,
  };
}

/**
 * Remove TODO artefato de teste driverpay (prefixo 'PW Test'). Respeita a FK
 * driverpay_payments.driver_id ON DELETE RESTRICT: apaga pagamentos ANTES dos
 * drivers. Pagamentos apagam em cascata pacotes/descontos/vales.
 */
async function cleanupDriverPay(): Promise<void> {
  const s = getClient();

  const { data: drivers } = await s
    .from('driverpay_drivers')
    .select('id')
    .like('name', `${PREFIX}%`);
  const driverIds = (drivers || []).map((d: { id: string }) => d.id);

  const { data: periods } = await s
    .from('driverpay_periods')
    .select('id')
    .like('label', `${PREFIX}%`);
  const periodIds = (periods || []).map((p: { id: string }) => p.id);

  // Pagamentos ligados aos drivers OU períodos de teste (cascade → filhas).
  if (driverIds.length > 0) {
    await s.from('driverpay_payments').delete().in('driver_id', driverIds);
  }
  if (periodIds.length > 0) {
    await s.from('driverpay_payments').delete().in('period_id', periodIds);
  }
  if (driverIds.length > 0) {
    await s.from('driverpay_platform_rates').delete().in('driver_id', driverIds);
    await s.from('driverpay_group_members').delete().in('driver_id', driverIds);
    await s.from('driverpay_drivers').delete().in('id', driverIds);
  }
  if (periodIds.length > 0) {
    await s.from('driverpay_periods').delete().in('id', periodIds);
  }
  await s.from('driverpay_groups').delete().like('name', `${PREFIX}%`);
  await s.from('driverpay_platforms').delete().like('name', `${PREFIX}%`);
}

// ─── Grade e recálculo (SKIP até a UI da grade existir) ──────────────────────
//
// TODO(sub-fase UI da grade): remover o `.skip` quando `DriverPayTab.tsx` deixar
// de ser placeholder e renderizar a grade de pagamentos. Ao ligar:
//   1. Confirmar os seletores marcados com TODO abaixo contra o componente real.
//      Recomendação: expor data-testid no molde do C6 (ex.: `driverpay-row-<id>`,
//      `driverpay-pkg-<paymentId>-<platform>`, `driverpay-total-<paymentId>`),
//      o que torna os seletores estáveis e evita depender de texto/ordem.
//   2. Garantir SUPABASE_SERVICE_ROLE_KEY no .env (seed driverpay_* exige bypass
//      de RLS — ver cleanup.ts).
//   3. O seed cria período NOVO 'PW Test Quinzena'; o componente precisa deixar
//      selecionar o período aberto de teste (ou o teste seleciona pelo label).
test.describe.skip('Pagamentos Driver — grade e recálculo [aguarda UI da grade]', () => {
  test.beforeAll(cleanupDriverPay);
  test.afterAll(cleanupDriverPay);

  test.beforeEach(async ({ page }) => {
    await cleanupDriverPay();
    await loginAs(page, ADMIN);
  });

  test('a lista de drivers do período aparece na grade', async ({ page }) => {
    const driverName = `${PREFIX}Lista`;
    await seedDriverPayment({ driverName, route: 'Caratinga', packages: 100, rate: 2.0 });

    await goToTab(page, 'Pagamentos Driver');
    // TODO: selecionar o período de teste 'PW Test Quinzena' quando houver seletor.
    const row = page.locator('table tr', { hasText: driverName }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // 100 pacotes * R$ 2,00 = R$ 200,00 exibido na linha.
    await expect(row).toContainText(/200[.,]00/);
  });

  test('editar pacote recalcula o total a receber (100→150 @ 2,00 = 300,00)', async ({ page }) => {
    const driverName = `${PREFIX}Recalc`;
    const seeded = await seedDriverPayment({
      driverName,
      route: 'Caratinga',
      packages: 100,
      rate: 2.0,
    });

    await goToTab(page, 'Pagamentos Driver');
    const row = page.locator('table tr', { hasText: driverName }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/200[.,]00/);

    // TODO: confirmar o seletor do input de pacotes. No mockup é um input
    // numérico na coluna da plataforma (`.pkg input`). Preferir data-testid.
    const pkgInput = row.locator('input[type="number"]').first();
    await pkgInput.fill('150');
    await pkgInput.blur();

    // Total recalculado: 150 * 2,00 = 300,00. A UI deve refletir após persistir.
    await expect(row).toContainText(/300[.,]00/, { timeout: 10_000 });

    // Verificação de verdade no banco: recompute persistiu total_net = 300.
    const s = getClient();
    const { data } = await s
      .from('driverpay_payments')
      .select('total_net, total_packages_amount')
      .eq('id', seeded.paymentId)
      .single();
    expect(Number((data as { total_net: number }).total_net)).toBe(300);
  });
});
