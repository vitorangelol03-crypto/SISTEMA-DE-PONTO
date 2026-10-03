import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — DISPENSA DO ESPELHO QUANDO A QUINZENA SÓ TEM PEDIDO INDIVIDUAL (03/10/2026).
 *
 * 🔴 O bug real: na 1ª quinzena de setembro, 40 entregadores em grupo e sem pacote de Shopee
 * ficaram sem o "Espelho conferido" (print do Victor: Celita, no grupo do João Gabriel,
 * com o grupo travado em "Espelho 2/3"). O pedido automático de depois da planilha só grava
 * pedido INDIVIDUAL de quem tem pacote — e a dispensa só enxergava quem tinha pedido
 * próprio ou o "pra todos". O tests/76 não pegava porque pede "por grupo" (uma linha por
 * MEMBRO, inclusive o que tem 0).
 *
 * O que este teste prova, com cliques reais, no formato do automático (pedido de UM
 * entregador só, o que tem pacote):
 *   1) o membro do grupo SEM pacote e SEM pedido próprio é marcado sozinho;
 *   2) quem tem pacote segue devendo o print;
 *   3) dando pacote ao dispensado, a marca 'auto' cai E o pedido de print dele é criado
 *      (senão o app nunca pediria — ele não tinha pedido nenhum);
 *   4) zerando de novo, a dispensa volta;
 *   5) (2º teste) na troca de quinzena, com os pedidos de print chegando atrasados, o
 *      pedido da quinzena ANTERIOR não marca ninguém na nova.
 *
 * Mesmo desenho do tests/76: driver/quinzena descartáveis "PW Test …", grupo direto no
 * banco, limpeza no finally (o período CASCADE apaga pagamentos e pedidos).
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER_X = `${TEST_EMPLOYEE_NAME_PREFIX}IndivLider ${RUN}`; // com pacote: tem o pedido
const DRIVER_Y = `${TEST_EMPLOYEE_NAME_PREFIX}IndivSem ${RUN}`;   // sem pacote e sem pedido
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzIndiv ${RUN}`;
const GRUPO = `${TEST_EMPLOYEE_NAME_PREFIX}Grupo Indiv ${RUN}`;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const rowOf = (page: Page, nome: string): Locator =>
  page.locator('tbody tr').filter({ hasText: nome }).first();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();
const espelhoConferidoDe = (page: Page, nome: string): Locator =>
  rowOf(page, nome).getByTitle('Espelho conferido (bate com a planilha)');
const espelhoPendenteDe = (page: Page, nome: string): Locator =>
  rowOf(page, nome).getByTitle('Marcar espelho conferido');

async function deleteCurrentPeriod(page: Page): Promise<void> {
  const excluir = page.getByTitle('Excluir esta quinzena e seus lançamentos');
  if (!(await excluir.count())) {
    await page.getByRole('button', { name: /^Concluir$/ }).click();
    await expect(modal(page).getByText('Concluir pagamento')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Concluir sem abrir próxima' }).click();
    await expect(excluir).toBeVisible({ timeout: 15_000 });
  }
  await excluir.click();
  await modal(page).getByRole('button', { name: /Excluir/ }).click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
}

async function platformColumns(page: Page): Promise<{ name: string; index: number }[]> {
  const headers = page.locator('thead th');
  const total = await headers.count();
  const out: { name: string; index: number }[] = [];
  for (let i = 0; i < total; i++) {
    const txt = ((await headers.nth(i).innerText()) ?? '').trim();
    if (/^(Driver|Grupo|Pacotes|ZAPEX|Desconto|Vale|Total a receber|NF|Print|Espelho|Ações)/i.test(txt)) continue;
    if (txt && out.length < 6) out.push({ name: txt.split('\n')[0].trim(), index: i });
  }
  return out;
}

async function buscar(page: Page, nome: string): Promise<void> {
  await page.getByPlaceholder(/Nome do driver/).fill(nome);
  await expect(rowOf(page, nome)).toBeVisible({ timeout: 20_000 });
}

test.describe('Dispensa do espelho com só pedido individual (03/10/2026)', () => {
  test('quem tem 0 no grupo é marcado mesmo sem pedido próprio; ganhando pacote, desmarca e é cobrado', async ({ page }) => {
    test.setTimeout(300_000);
    const db = getClient();

    // Vite frio no WSL: a 1ª navegação estoura o timeout padrão (lição de 19-20/07).
    await page.goto('/', { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});

    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');

    // ── Sobras de rodadas anteriores ────────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const sel = periodSelect(page, TEST_EMPLOYEE_NAME_PREFIX);
      if (!(await sel.count())) break;
      const leftover = sel.locator('option').filter({ hasText: TEST_EMPLOYEE_NAME_PREFIX }).first();
      const value = await leftover.getAttribute('value');
      if (!value) break;
      await sel.selectOption(value);
      await deleteCurrentPeriod(page);
    }

    try {
      // ── Drivers + quinzena de teste ───────────────────────────────────────
      for (const nome of [DRIVER_X, DRIVER_Y]) {
        await page.getByRole('button', { name: /Novo driver/ }).click();
        await modal(page).getByPlaceholder('Nome completo do driver').fill(nome);
        await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Indiv');
        await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
        await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });
      }

      await page.getByRole('button', { name: /Novo período/ }).click();
      await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
      await modal(page).getByRole('button', { name: 'Criar período' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
      await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

      // ── X ganha pacote (a "planilha chegou" nesta plataforma); Y fica com 0 ──
      await buscar(page, DRIVER_X);
      const columns = await platformColumns(page);
      expect(columns.length, 'plataformas na grade').toBeGreaterThan(0);
      const plataforma = columns[0];
      const inputX = rowOf(page, DRIVER_X).locator('td').nth(plataforma.index).locator('input').first();
      await inputX.fill('100');
      await inputX.blur();
      await expect(rowOf(page, DRIVER_X)).toContainText('200,00', { timeout: 10_000 }); // 100 × R$2

      // ── Grupo com X (líder) e Y — o caso do print: líder entrega, membro não ──
      const { data: dx } = await db.from('driverpay_drivers')
        .select('id, company_id').eq('name', DRIVER_X).single();
      const { data: dy } = await db.from('driverpay_drivers')
        .select('id').eq('name', DRIVER_Y).single();
      const { data: g } = await db.from('driverpay_groups').insert({
        company_id: dx!.company_id, name: GRUPO, leader_driver_id: dx!.id,
      }).select('id').single();
      await db.from('driverpay_group_members').insert([
        { company_id: dx!.company_id, group_id: g!.id, driver_id: dx!.id },
        { company_id: dx!.company_id, group_id: g!.id, driver_id: dy!.id },
      ]);
      await page.reload();
      await goToTab(page, 'Pagamentos Driver');
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });

      // ── ANTES do pedido: ninguém marcado (não há o que dispensar) ─────────
      await buscar(page, DRIVER_Y);
      await expect(espelhoPendenteDe(page, DRIVER_Y)).toBeVisible({ timeout: 15_000 });

      // ── Pedido de UM entregador só (X) — o formato do pedido automático ──────
      await page.getByRole('button', { name: 'Solicitar espelho' }).click();
      await expect(modal(page).getByText('Solicitar espelho do app')).toBeVisible({ timeout: 10_000 });
      const datas = modal(page).locator('input[type="date"]');
      await datas.nth(0).fill('2026-07-01');
      await datas.nth(1).fill('2026-07-15');
      const chip = (nome: string) => modal(page).getByRole('button', { name: nome, exact: true });
      if (await chip('SHOPEE').count() && plataforma.name !== 'SHOPEE') {
        const shopeeMarcada = await chip('SHOPEE').evaluate((el) => el.className.includes('bg-blue-600'));
        if (shopeeMarcada) await chip('SHOPEE').click();
      }
      const meuChip = chip(plataforma.name);
      if (await meuChip.count()) {
        const marcado = await meuChip.evaluate((el) => el.className.includes('bg-blue-600'));
        if (!marcado) await meuChip.click();
      }
      await modal(page).getByTestId('proof-scope-driver').check();
      await modal(page).getByTestId('proof-scope-driver-busca').fill(DRIVER_X);
      await modal(page).getByTestId('proof-scope-driver-select').selectOption(dx!.id);
      await modal(page).getByRole('button', { name: /Solicitar espelho|Parar de pedir/ }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

      const { data: per } = await db.from('driverpay_periods').select('id').eq('label', PERIOD).single();
      const pedidosDe = async () => {
        const { data } = await db.from('driverpay_proof_requests')
          .select('driver_id, platform_name').eq('period_id', per!.id);
        return data ?? [];
      };
      // O cenário é o do bug: nenhum "pra todos", e o Y sem pedido próprio.
      const pedidos1 = await pedidosDe();
      expect(pedidos1.filter((r) => r.driver_id === null), 'sem pedido "pra todos"').toHaveLength(0);
      expect(pedidos1.filter((r) => r.driver_id === dy!.id), 'Y sem pedido próprio').toHaveLength(0);
      expect(pedidos1.filter((r) => r.driver_id === dx!.id && r.platform_name === plataforma.name)).toHaveLength(1);

      const payDe = async (driverId: string) => {
        const { data } = await db.from('driverpay_payments')
          .select('id, espelho_conferido, espelho_conferido_by')
          .eq('period_id', per!.id).eq('driver_id', driverId).single();
        return data!;
      };

      // ══ 1. Y (sem pacote, sem pedido próprio) é marcado SOZINHO ═══════════════
      await buscar(page, DRIVER_Y);
      await expect(espelhoConferidoDe(page, DRIVER_Y)).toBeVisible({ timeout: 25_000 });
      const payY1 = await payDe(dy!.id);
      expect(payY1.espelho_conferido, 'Y conferido no banco').toBe(true);
      expect(payY1.espelho_conferido_by, 'assinatura da varredura').toBe('auto');

      // ══ 2. X (com pacote) segue devendo print ═══════════════════════════════
      await buscar(page, DRIVER_X);
      await expect(espelhoPendenteDe(page, DRIVER_X)).toBeVisible({ timeout: 15_000 });
      expect((await payDe(dx!.id)).espelho_conferido, 'X segue pendente').toBe(false);

      // ══ 3. Y ganha pacote → desmarca sozinho E ganha o pedido de print ═══════
      await buscar(page, DRIVER_Y);
      const inputY = rowOf(page, DRIVER_Y).locator('td').nth(plataforma.index).locator('input').first();
      await inputY.fill('50');
      await inputY.blur();
      await expect(espelhoPendenteDe(page, DRIVER_Y)).toBeVisible({ timeout: 25_000 });
      const payY2 = await payDe(dy!.id);
      expect(payY2.espelho_conferido, 'Y desmarcado no banco').toBe(false);
      expect(payY2.espelho_conferido_by, 'desmarcado pela varredura, não por gente').toBe('auto');
      await expect.poll(
        async () => (await pedidosDe()).filter((r) => r.driver_id === dy!.id && r.platform_name === plataforma.name).length,
        { message: 'o app do Y volta a pedir o print (pedido individual criado)', timeout: 15_000 },
      ).toBe(1);

      // ══ 4. Zerando de novo, a dispensa volta ════════════════════════════════
      await inputY.fill('0');
      await inputY.blur();
      await expect(espelhoConferidoDe(page, DRIVER_Y)).toBeVisible({ timeout: 25_000 });
      const payY3 = await payDe(dy!.id);
      expect(payY3.espelho_conferido, 'Y volta a ser dispensado').toBe(true);
      expect(payY3.espelho_conferido_by).toBe('auto');
    } finally {
      const sel = periodSelect(page, PERIOD);
      if (await sel.count()) {
        await sel.selectOption({ label: PERIOD }).catch(() => {});
        await deleteCurrentPeriod(page).catch(() => {});
      }
    }
  });

  /**
   * 🔴 Achado ao rodar o teste acima (03/10/2026): ao trocar de quinzena, as linhas chegam
   * antes dos pedidos de print. Nesse instante a varredura juntava as linhas da quinzena NOVA
   * com os pedidos da ANTIGA — e, com a dispensa por plataforma, um pedido da outra quinzena
   * marcava gente que ninguém cobrou. A resposta dos pedidos é atrasada de propósito (rede
   * lenta) pra o instante misturado durar e o teste enxergar.
   */
  test('na troca de quinzena, pedido da OUTRA quinzena não marca ninguém', async ({ page }) => {
    test.setTimeout(300_000);
    const db = getClient();
    const T1 = `${PERIOD} A`;
    const T2 = `${PERIOD} B`;
    const X = `${DRIVER_X} T`;
    const Y = `${DRIVER_Y} T`;

    await page.goto('/', { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');

    try {
      for (const nome of [X, Y]) {
        await page.getByRole('button', { name: /Novo driver/ }).click();
        await modal(page).getByPlaceholder('Nome completo do driver').fill(nome);
        await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Indiv');
        await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
        await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });
      }
      const { data: dx } = await db.from('driverpay_drivers').select('id, company_id').eq('name', X).single();
      const { data: dy } = await db.from('driverpay_drivers').select('id').eq('name', Y).single();
      const { data: g } = await db.from('driverpay_groups').insert({
        company_id: dx!.company_id, name: `${GRUPO} T`, leader_driver_id: dx!.id,
      }).select('id').single();
      await db.from('driverpay_group_members').insert([
        { company_id: dx!.company_id, group_id: g!.id, driver_id: dx!.id },
        { company_id: dx!.company_id, group_id: g!.id, driver_id: dy!.id },
      ]);

      // ── Duas quinzenas de teste; nas DUAS o X tem pacote e o Y tem 0 ─────────
      let plataforma: { name: string; index: number } | null = null;
      for (const label of [T1, T2]) {
        await page.getByRole('button', { name: /Novo período/ }).click();
        await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(label);
        await modal(page).getByRole('button', { name: 'Criar período' }).click();
        await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
        await periodSelect(page, label).selectOption({ label });
        await buscar(page, X);
        if (!plataforma) {
          const cols = await platformColumns(page);
          expect(cols.length, 'plataformas na grade').toBeGreaterThan(0);
          plataforma = cols[0];
        }
        const input = rowOf(page, X).locator('td').nth(plataforma.index).locator('input').first();
        await input.fill('100');
        await input.blur();
        await expect(rowOf(page, X)).toContainText('200,00', { timeout: 10_000 });
      }
      const plat = plataforma!;
      const { data: p1 } = await db.from('driverpay_periods').select('id').eq('label', T1).single();
      const { data: p2 } = await db.from('driverpay_periods').select('id').eq('label', T2).single();

      // ── Pedido de print SÓ na quinzena A (do X) → o Y de A é dispensado ─────────
      await periodSelect(page, T1).selectOption({ label: T1 });
      await page.getByRole('button', { name: 'Solicitar espelho' }).click();
      await expect(modal(page).getByText('Solicitar espelho do app')).toBeVisible({ timeout: 10_000 });
      const datas = modal(page).locator('input[type="date"]');
      await datas.nth(0).fill('2026-07-01');
      await datas.nth(1).fill('2026-07-15');
      const chip = (nome: string) => modal(page).getByRole('button', { name: nome, exact: true });
      if (await chip('SHOPEE').count() && plat.name !== 'SHOPEE') {
        const shopeeMarcada = await chip('SHOPEE').evaluate((el) => el.className.includes('bg-blue-600'));
        if (shopeeMarcada) await chip('SHOPEE').click();
      }
      const meuChip = chip(plat.name);
      if (await meuChip.count()) {
        const marcado = await meuChip.evaluate((el) => el.className.includes('bg-blue-600'));
        if (!marcado) await meuChip.click();
      }
      await modal(page).getByTestId('proof-scope-driver').check();
      await modal(page).getByTestId('proof-scope-driver-busca').fill(X);
      await modal(page).getByTestId('proof-scope-driver-select').selectOption(dx!.id);
      await modal(page).getByRole('button', { name: /Solicitar espelho|Parar de pedir/ }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
      await buscar(page, Y);
      await expect(espelhoConferidoDe(page, Y)).toBeVisible({ timeout: 25_000 }); // a varredura funciona em A
      const { data: yEmA } = await db.from('driverpay_payments')
        .select('espelho_conferido, espelho_conferido_by').eq('period_id', p1!.id).eq('driver_id', dy!.id).single();
      expect(yEmA!.espelho_conferido, 'Y dispensado na quinzena A').toBe(true);
      expect(yEmA!.espelho_conferido_by).toBe('auto');

      const { data: pedidosB } = await db.from('driverpay_proof_requests').select('id').eq('period_id', p2!.id);
      expect(pedidosB ?? [], 'a quinzena B não tem pedido nenhum').toHaveLength(0);

      // ── Rede lenta SÓ nos pedidos de print, e troca pra B ──────────────────────
      await page.route('**/rest/v1/driverpay_proof_requests*', async (route) => {
        await new Promise((r) => setTimeout(r, 2500)); // simula rede lenta (não é espera por condição)
        await route.continue();
      });
      const pedidosDeB = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/driverpay_proof_requests') && r.url().includes(p2!.id),
        { timeout: 30_000 },
      );
      await periodSelect(page, T2).selectOption({ label: T2 });
      await buscar(page, Y); // as linhas de B já estão na tela; os pedidos ainda são os de A
      await pedidosDeB;
      await page.unroute('**/rest/v1/driverpay_proof_requests*');
      await expect(espelhoPendenteDe(page, Y)).toBeVisible({ timeout: 15_000 });

      // ══ Em B ninguém foi cobrado: ninguém pode ter sido marcado ══════════════
      const { data: marcadosB } = await db.from('driverpay_payments')
        .select('id').eq('period_id', p2!.id).eq('espelho_conferido', true);
      expect(marcadosB ?? [], 'nenhum espelho marcado na quinzena B').toHaveLength(0);
    } finally {
      await page.unroute('**/rest/v1/driverpay_proof_requests*').catch(() => {});
      for (const label of [T2, T1]) {
        const sel = periodSelect(page, label);
        if (await sel.count()) {
          await sel.selectOption({ label }).catch(() => {});
          await deleteCurrentPeriod(page).catch(() => {});
        }
      }
    }
  });
});
