import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab, switchCompany } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — O VALOR POR PACOTE QUE NÃO ALTERAVA DE JEITO NENHUM (05/08/2026).
 *
 * Relato do Victor, com print: *"na config está 2.50, no grupo 2.5, mas está 2 reais a
 * LOGGI e não altera"*. Caso real do RODRIGO SANTOS TATIBANA.
 *
 * ## A causa
 * Duas travas no `applyGroupRate`, e as duas prendiam justamente este caso:
 *  1. `if (oldRate === rate) continue` — a config do membro JÁ estava em 2,50, então
 *     apertar "Aplicar 2,50" nem chegava a olhar os pacotes;
 *  2. `.eq('rate_snapshot', oldRate)` — só trocava a linha que ainda estava no valor
 *     antigo. A linha veio da planilha com o padrão da plataforma (2,00) e a config subiu
 *     depois; ela não batia com nada e ficava presa **para sempre**.
 *
 * Medido em produção antes do conserto: **12 linhas de LOGGI presas em R$ 2,00** contra
 * config de 2,20/2,50/3,00 — R$ 300,00 a menos numa quinzena só.
 *
 * ## O que este teste faz
 * Monta o caso do Rodrigo em miniatura (config 2,50 + linha 2,00), aperta "Aplicar" com
 * CLIQUE REAL e cobra o banco. Sem o conserto, o pacote continuaria em 2,00.
 *
 * 🔒 Segurança: driver, grupo e quinzena descartáveis com prefixo "PW Test ", apagados no
 * fim. O "Aplicar" só alcança MEMBROS DO GRUPO — nenhum entregador real é tocado.
 */

const RUN = Date.now().toString(36);
const PREF = TEST_EMPLOYEE_NAME_PREFIX;
const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PLATAFORMA = 'LOGGI';

const NOME_DRIVER = `${PREF}Taxa ${RUN}`;
const NOME_GRUPO = `${PREF}GrupoTaxa ${RUN}`;
const NOME_PERIODO = `${PREF}QuinzTaxa ${RUN}`;

/** O caso do Rodrigo: a linha ficou no padrão da plataforma, a config já subiu. */
const TAXA_TRAVADA = 2.0;
const TAXA_DA_CONFIG = 2.5;
const PACOTES = 20;

test.describe('Valor por pacote travado (05/08/2026)', () => {
  test('aplicar o valor do grupo destrava a linha que ficou pra trás', async ({ page }) => {
    test.setTimeout(240_000);
    const db = getClient();
    const criados = { periodo: '', driver: '', grupo: '' };

    try {
      // ── Monta o caso ────────────────────────────────────────────────────────
      const { data: per } = await db.from('driverpay_periods').insert({
        company_id: CARATINGA, label: NOME_PERIODO,
        start_date: '2026-07-01', end_date: '2026-07-15', status: 'aberto', created_by: '2626',
      }).select('id').single();
      criados.periodo = per!.id;

      const { data: drv } = await db.from('driverpay_drivers').insert({
        company_id: CARATINGA, name: NOME_DRIVER, active: true, created_by: '2626',
      }).select('id').single();
      criados.driver = drv!.id;

      const { data: grp } = await db.from('driverpay_groups').insert({
        company_id: CARATINGA, name: NOME_GRUPO, default_rate: TAXA_DA_CONFIG,
      }).select('id').single();
      criados.grupo = grp!.id;
      await db.from('driverpay_group_members').insert({
        company_id: CARATINGA, group_id: grp!.id, driver_id: drv!.id,
      });

      // Config individual JÁ no valor do grupo — é o que fazia o "Aplicar" desistir.
      const { data: plat } = await db.from('driverpay_platforms')
        .select('id').eq('company_id', CARATINGA).eq('name', PLATAFORMA).single();
      await db.from('driverpay_platform_rates').insert({
        company_id: CARATINGA, driver_id: drv!.id, platform_id: plat!.id,
        rate: TAXA_DA_CONFIG, updated_by: '2626',
      });

      const { data: pay } = await db.from('driverpay_payments').insert({
        company_id: CARATINGA, period_id: per!.id, driver_id: drv!.id,
        driver_name_snapshot: NOME_DRIVER,
      }).select('id').single();
      // A linha presa: veio da planilha no padrão da plataforma.
      await db.from('driverpay_payment_packages').insert({
        company_id: CARATINGA, payment_id: pay!.id, platform_name: PLATAFORMA,
        route: 'Caratinga', packages: PACOTES, rate_snapshot: TAXA_TRAVADA,
      });

      // ── Cliques reais ───────────────────────────────────────────────────────
      await page.goto('/', { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
      await loginAs(page, MASTER_2626);
      const trigger = page.locator('button[aria-haspopup="listbox"]').first();
      await expect(trigger).toBeVisible({ timeout: 20_000 });
      if (!/Caratinga/i.test((await trigger.innerText()) ?? '')) await switchCompany(page, 'Caratinga');
      await goToTab(page, 'Pagamentos Driver');

      await page.getByRole('button', { name: /Gerenciar grupos/ }).click();
      const modal = page.locator('div.fixed.inset-0').last();
      await expect(modal.getByPlaceholder('Buscar grupo pelo nome...')).toBeVisible({ timeout: 20_000 });
      await modal.getByPlaceholder('Buscar grupo pelo nome...').fill(NOME_GRUPO);

      const linhaDoGrupo = modal.locator('div').filter({ hasText: NOME_GRUPO }).last();
      await expect(linhaDoGrupo).toBeVisible({ timeout: 15_000 });
      await modal.getByPlaceholder('valor/pacote').first().fill(String(TAXA_DA_CONFIG));
      await modal.getByRole('button', { name: 'Aplicar' }).first().click();
      await expect(page.getByText(/Valor por pacote aplicado/i)).toBeVisible({ timeout: 30_000 });

      // ── O que o banco diz ───────────────────────────────────────────────────
      // 🔑 A prova: antes do conserto, isto continuaria 2,00 — o "Aplicar" desistia
      // porque a config do membro já estava em 2,50.
      const { data: pkgDepois } = await db.from('driverpay_payment_packages')
        .select('rate_snapshot').eq('payment_id', pay!.id).single();
      expect(Number(pkgDepois!.rate_snapshot), 'a linha presa tem que ter sido destravada').toBe(TAXA_DA_CONFIG);

      // E o total a receber tem que ter sido recalculado junto — senão a grade mostraria
      // o valor novo com o dinheiro velho.
      const { data: totais } = await db.from('driverpay_payment_computed')
        .select('total_gross').eq('id', pay!.id).maybeSingle();
      if (totais) {
        expect(Number(totais.total_gross)).toBeCloseTo(PACOTES * TAXA_DA_CONFIG, 2);
      }
    } finally {
      if (criados.periodo) await db.from('driverpay_periods').delete().eq('id', criados.periodo);
      if (criados.driver) {
        await db.from('driverpay_platform_rates').delete().eq('driver_id', criados.driver);
        await db.from('driverpay_group_members').delete().eq('driver_id', criados.driver);
        await db.from('driverpay_drivers').delete().eq('id', criados.driver);
      }
      if (criados.grupo) await db.from('driverpay_groups').delete().eq('id', criados.grupo);
    }
  });
});
