import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab, switchCompany } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — filtro por quinzena de origem + migração em massa no "Saldo de quinzenas
 * fechadas" (18/08/2026, pedido do Victor: "coloque para poder filtrar entre as
 * quizenas e migrar em massa").
 *
 * A lógica pura (filtro, seleção, "selecionar todos" nunca extrapola o filtro) já
 * está coberta em tests/unit/closedPeriodsDebtScope.spec.ts. Este spec prova que a
 * fiação real funciona: clique de verdade, banco de verdade, dinheiro de verdade
 * (mesmo que só de driver descartável).
 *
 * 🔒 Segurança: 3 drivers e 3 quinzenas com prefixo "PW Test ", tudo apagado no
 * finally. Migra pra uma quinzena aberta própria do teste — nunca uma quinzena
 * real do Victor.
 */

const RUN = Date.now().toString(36);
const PREF = TEST_EMPLOYEE_NAME_PREFIX;
const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

const NOME_A1 = `${PREF}SaldoA1 ${RUN}`;
const NOME_A2 = `${PREF}SaldoA2 ${RUN}`;
const NOME_B1 = `${PREF}SaldoB1 ${RUN}`;
const LABEL_FECHADA_A = `${PREF}Fechada A ${RUN}`;
const LABEL_FECHADA_B = `${PREF}Fechada B ${RUN}`;
const LABEL_ABERTA = `${PREF}Destino ${RUN}`;

const VALE_A1 = 12;
const VALE_A2 = 8;
const VALE_B1 = 5;

test.describe('Saldo de quinzenas fechadas — filtro + migração em massa', () => {
  test('filtra por origem e migra vários de uma vez, sem tocar na outra quinzena', async ({ page }) => {
    test.setTimeout(240_000);
    const db = getClient();
    const criados = {
      periodoFechadaA: '', periodoFechadaB: '', periodoAberta: '',
      driverA1: '', driverA2: '', driverB1: '',
    };

    try {
      // ── Monta o caso: 2 quinzenas fechadas com saldo devedor + 1 aberta pra migrar ──
      const { data: perA } = await db.from('driverpay_periods').insert({
        company_id: CARATINGA, label: LABEL_FECHADA_A,
        start_date: '2026-06-01', end_date: '2026-06-15', status: 'concluido', created_by: '2626',
      }).select('id').single();
      criados.periodoFechadaA = perA!.id;

      const { data: perB } = await db.from('driverpay_periods').insert({
        company_id: CARATINGA, label: LABEL_FECHADA_B,
        start_date: '2026-06-16', end_date: '2026-06-30', status: 'concluido', created_by: '2626',
      }).select('id').single();
      criados.periodoFechadaB = perB!.id;

      const { data: perAberta } = await db.from('driverpay_periods').insert({
        company_id: CARATINGA, label: LABEL_ABERTA,
        start_date: '2026-07-01', end_date: '2026-07-15', status: 'aberto', created_by: '2626',
      }).select('id').single();
      criados.periodoAberta = perAberta!.id;

      const criarDriverComVale = async (nome: string, periodId: string, valeAmount: number) => {
        const { data: drv } = await db.from('driverpay_drivers').insert({
          company_id: CARATINGA, name: nome, active: true, created_by: '2626',
        }).select('id').single();
        const { data: pay } = await db.from('driverpay_payments').insert({
          company_id: CARATINGA, period_id: periodId, driver_id: drv!.id, driver_name_snapshot: nome,
        }).select('id').single();
        await db.from('driverpay_vales').insert({
          company_id: CARATINGA, payment_id: pay!.id, amount: valeAmount, vale_date: null,
          observation: 'E2E saldo em massa', created_by: '2626',
        });
        return drv!.id;
      };

      criados.driverA1 = await criarDriverComVale(NOME_A1, criados.periodoFechadaA, VALE_A1);
      criados.driverA2 = await criarDriverComVale(NOME_A2, criados.periodoFechadaA, VALE_A2);
      criados.driverB1 = await criarDriverComVale(NOME_B1, criados.periodoFechadaB, VALE_B1);

      // ── Cliques reais ───────────────────────────────────────────────────────
      await page.goto('/', { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
      await loginAs(page, MASTER_2626);
      const trigger = page.locator('button[aria-haspopup="listbox"]').first();
      await expect(trigger).toBeVisible({ timeout: 20_000 });
      if (!/Caratinga/i.test((await trigger.innerText()) ?? '')) await switchCompany(page, 'Caratinga');
      await goToTab(page, 'Pagamentos Driver');

      await page.getByRole('button', { name: /Saldo de quinzenas fechadas/ }).click();
      const modal = page.locator('div.fixed.inset-0').last();
      await expect(modal.getByText('Saldo devedor de quinzenas fechadas')).toBeVisible({ timeout: 15_000 });

      // As 3 linhas dos 3 drivers de teste aparecem (sem filtro = todas as quinzenas).
      await expect(modal.getByText(NOME_A1)).toBeVisible({ timeout: 15_000 });
      await expect(modal.getByText(NOME_A2)).toBeVisible();
      await expect(modal.getByText(NOME_B1)).toBeVisible();

      // 🎯 Filtro: escolhendo "Fechada A", só A1/A2 aparecem — B1 some da tela.
      const filtro = modal.locator('[data-testid="closed-debt-filtro-origem"]');
      await expect(filtro).toBeVisible({ timeout: 10_000 });
      await filtro.selectOption({ label: `quinzena ${LABEL_FECHADA_A}` });
      await expect(modal.getByText(NOME_A1)).toBeVisible();
      await expect(modal.getByText(NOME_A2)).toBeVisible();
      await expect(modal.getByText(NOME_B1)).toBeHidden();

      // 🎯 Selecionar todos (só os VISÍVEIS — B1 não entra, está filtrado fora).
      await modal.locator('[data-testid="closed-debt-selecionar-todos"]').click();
      const barraMassa = modal.locator('[data-testid="closed-debt-barra-massa"]');
      await expect(barraMassa).toBeVisible({ timeout: 10_000 });
      await expect(barraMassa).toContainText('2 selecionado(s)');
      await expect(barraMassa).toContainText(`R$ ${(VALE_A1 + VALE_A2).toFixed(2).replace('.', ',')}`);

      // Migra os 2 selecionados pra quinzena aberta do teste, de uma vez só.
      await modal.locator('[data-testid="closed-debt-destino-massa"]').selectOption({ label: LABEL_ABERTA });
      await modal.locator('[data-testid="closed-debt-migrar-massa"]').click();
      await expect(page.getByText(/2 saldo\(s\) migrado\(s\)/)).toBeVisible({ timeout: 20_000 });

      // A1/A2 migraram — filtro "Fechada A" agora não tem mais ninguém pendente.
      await expect(modal.getByText('Nenhum saldo pendente dessa quinzena.')).toBeVisible({ timeout: 15_000 });

      // B1 (quinzena B, nunca selecionado) continua intocado — muda o filtro pra ver.
      await filtro.selectOption({ label: 'Todas as quinzenas fechadas' });
      await expect(modal.getByText(NOME_B1)).toBeVisible({ timeout: 10_000 });
      await expect(modal.getByText(NOME_A1)).toBeHidden();
      await expect(modal.getByText(NOME_A2)).toBeHidden();

      // ── O que o banco diz ───────────────────────────────────────────────────
      const { data: carryovers } = await db.from('driverpay_deduction_carryover')
        .select('driver_id, from_period_id, to_period_id, amount')
        .in('driver_id', [criados.driverA1, criados.driverA2, criados.driverB1]);
      const porDriver = new Map((carryovers ?? []).map((c) => [c.driver_id, c]));

      expect(porDriver.get(criados.driverA1)?.to_period_id, 'A1 migrou pra quinzena aberta').toBe(criados.periodoAberta);
      expect(Number(porDriver.get(criados.driverA1)?.amount)).toBe(VALE_A1);
      expect(porDriver.get(criados.driverA2)?.to_period_id, 'A2 migrou pra quinzena aberta').toBe(criados.periodoAberta);
      expect(Number(porDriver.get(criados.driverA2)?.amount)).toBe(VALE_A2);
      expect(porDriver.get(criados.driverB1), 'B1 NÃO migrou — não estava selecionado (fora do filtro)').toBeUndefined();
    } finally {
      const driverIds = [criados.driverA1, criados.driverA2, criados.driverB1].filter(Boolean);
      if (driverIds.length > 0) {
        await db.from('driverpay_deduction_carryover').delete().in('driver_id', driverIds);
        const { data: pays } = await db.from('driverpay_payments').select('id').in('driver_id', driverIds);
        const payIds = (pays ?? []).map((p) => p.id);
        if (payIds.length > 0) await db.from('driverpay_vales').delete().in('payment_id', payIds);
        await db.from('driverpay_payments').delete().in('driver_id', driverIds);
        await db.from('driverpay_drivers').delete().in('id', driverIds);
      }
      const periodIds = [criados.periodoFechadaA, criados.periodoFechadaB, criados.periodoAberta].filter(Boolean);
      if (periodIds.length > 0) await db.from('driverpay_periods').delete().in('id', periodIds);
    }
  });
});
