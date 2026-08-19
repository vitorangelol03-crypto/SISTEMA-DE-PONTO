import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — VARREDURA AUTOMÁTICA DO "ESPELHO CONFERIDO" POR DISPENSA (19/08/2026).
 *
 * O caso real que motivou: 20 entregadores em grupo sem pacote SHOPEE ficaram sem a
 * marca na 2ª quinzena de julho, porque a dispensa só rodava DEPOIS de importar
 * planilha — e as importações de 18/08 aconteceram com o `proof_auto_confirm` ainda
 * desligado. Decisões do Victor (19/08): marca os dispensados em qualquer recarga da
 * grade; se depois a planilha DER pacote, "desmarca sozinho e solicita o espelho".
 *
 * O que este teste prova, com cliques reais e SEM importar planilha nenhuma:
 *   1) criado o pedido de espelho (por grupo), quem está no grupo SEM pacote na
 *      plataforma é marcado sozinho — gatilho novo, fora do fluxo de importação;
 *   2) quem TEM pacote não é marcado (deve print de verdade);
 *   3) dando pacote ao dispensado (edição de célula, como uma reimportação faria),
 *      a marca 'auto' é DESFEITA sozinha — ele volta a dever print;
 *   4) zerando de novo, a dispensa volta — sem ping-pong em nenhum passo;
 *   5) tela e banco concordam em cada passo (espelho_conferido + by='auto').
 *
 * Mesmo desenho do tests/75: driver/quinzena descartáveis "PW Test …", grupo criado
 * direto no banco, limpeza no finally (o período CASCADE apaga pagamentos e pedidos;
 * driver/grupo saem na limpeza por prefixo).
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER_X = `${TEST_EMPLOYEE_NAME_PREFIX}DispensaLider ${RUN}`; // com pacote: deve print
const DRIVER_Y = `${TEST_EMPLOYEE_NAME_PREFIX}DispensaSem ${RUN}`;   // sem pacote: dispensado
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzDisp ${RUN}`;
const GRUPO = `${TEST_EMPLOYEE_NAME_PREFIX}Grupo Disp ${RUN}`;

const PKGS_X = 100;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const rowOf = (page: Page, nome: string): Locator =>
  page.locator('tbody tr').filter({ hasText: nome }).first();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

/** O botão da célula Espelho: title muda conforme o estado — é a asserção da tela. */
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

/** Índice das colunas de plataforma na grade (pra digitar os pacotes na certa). */
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

test.describe('Varredura automática do espelho por dispensa (19/08/2026)', () => {
  test('marca sem pacote ao criar o pedido, desmarca quando ganha pacote, remarca ao zerar', async ({ page }) => {
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
        await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Disp');
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
      // A busca vem ANTES de ler o cabeçalho: garante a tabela renderizada (o 75 faz
      // igual — ler as colunas com a grade ainda carregando devolve 0 colunas).
      await buscar(page, DRIVER_X);
      const columns = await platformColumns(page);
      expect(columns.length, 'plataformas na grade').toBeGreaterThan(0);
      const plataforma = columns[0];
      const inputX = rowOf(page, DRIVER_X).locator('td').nth(plataforma.index).locator('input').first();
      await inputX.fill(String(PKGS_X));
      await inputX.blur();
      await expect(rowOf(page, DRIVER_X)).toContainText('200,00', { timeout: 10_000 }); // 100 × R$2

      // ── Grupo com X (líder) e Y — igual ao caso real (líder entrega, membro não) ──
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

      // ── Pedido de espelho POR GRUPO (alcança só X e Y — nada dos drivers reais) ──
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
      await modal(page).getByTestId('proof-scope-grupo').check();
      await modal(page).getByTestId('proof-scope-grupo-select')
        .selectOption({ label: `${GRUPO} (2 entregador(es))` });
      await modal(page).getByRole('button', { name: /Solicitar espelho|Parar de pedir/ }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

      // ══ 1. Y (sem pacote) é marcado SOZINHO — sem importar planilha nenhuma ══
      await buscar(page, DRIVER_Y);
      await expect(espelhoConferidoDe(page, DRIVER_Y)).toBeVisible({ timeout: 25_000 });

      const { data: per } = await db.from('driverpay_periods').select('id').eq('label', PERIOD).single();
      const payDe = async (driverId: string) => {
        const { data } = await db.from('driverpay_payments')
          .select('id, espelho_conferido, espelho_conferido_by')
          .eq('period_id', per!.id).eq('driver_id', driverId).single();
        return data!;
      };
      const payY1 = await payDe(dy!.id);
      expect(payY1.espelho_conferido, 'Y conferido no banco').toBe(true);
      expect(payY1.espelho_conferido_by, 'assinatura da varredura').toBe('auto');

      // ══ 2. X (com pacote) segue devendo print — NÃO foi marcado ══════════════
      await buscar(page, DRIVER_X);
      await expect(espelhoPendenteDe(page, DRIVER_X)).toBeVisible({ timeout: 15_000 });
      expect((await payDe(dx!.id)).espelho_conferido, 'X segue pendente').toBe(false);

      // ══ 3. Y ganha pacote (como uma reimportação faria) → DESMARCA sozinho ═══
      await buscar(page, DRIVER_Y);
      const inputY = rowOf(page, DRIVER_Y).locator('td').nth(plataforma.index).locator('input').first();
      await inputY.fill('50');
      await inputY.blur();
      await expect(espelhoPendenteDe(page, DRIVER_Y)).toBeVisible({ timeout: 25_000 });
      const payY2 = await payDe(dy!.id);
      expect(payY2.espelho_conferido, 'Y desmarcado no banco').toBe(false);
      expect(payY2.espelho_conferido_by, 'desmarcado pela varredura, não por gente').toBe('auto');

      // ══ 4. Zerando de novo, a dispensa volta — e o estado é estável ══════════
      await inputY.fill('0');
      await inputY.blur();
      await expect(espelhoConferidoDe(page, DRIVER_Y)).toBeVisible({ timeout: 25_000 });
      const payY3 = await payDe(dy!.id);
      expect(payY3.espelho_conferido, 'Y volta a ser dispensado').toBe(true);
      expect(payY3.espelho_conferido_by).toBe('auto');
    } finally {
      // ── Limpeza: a quinzena CASCADE apaga pagamentos, pacotes e pedidos; o
      //    driver e o grupo "PW Test" saem na limpeza por prefixo (cleanup.ts). ──
      const sel = periodSelect(page, PERIOD);
      if (await sel.count()) {
        await sel.selectOption({ label: PERIOD }).catch(() => {});
        await deleteCurrentPeriod(page).catch(() => {});
      }
    }
  });
});
