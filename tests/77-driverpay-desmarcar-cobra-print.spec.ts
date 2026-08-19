import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — DESMARCAR O "ESPELHO CONFERIDO" VOLTA A COBRAR O PRINT (19/08/2026, pedido
 * do Victor: *"se o check for desmarcado e tiver pacotes da shopee o sistema volta a
 * cobrar o print daquele líder"*).
 *
 * O que este teste prova, com cliques reais:
 *   1) driver COM pacote na plataforma cobrada, print validado e espelho conferido:
 *      desmarcar o check pede CONFIRMAÇÃO (o entregador vai ver a recusa no app);
 *   2) confirmando: o check apaga, o print vira 'rejeitado' no banco com o motivo
 *      que o entregador vai ler, e a grade mostra a tag "recusado";
 *   3) a varredura automática NÃO remarca (decisão humana é respeitada);
 *   4) o portal volta a cobrar sozinho: com o print rejeitado e o pedido de pé, o
 *      cartão do app entra em "Espelho recusado → reenviar" (regra `sent === 0 &&
 *      rejected > 0`, coberta em unit + tests/65 — aqui conferimos o lado do banco).
 *
 * Mesmo desenho do tests/75/76: driver/quinzena descartáveis "PW Test …", print
 * inserido direto no banco como a edge fn gravaria, limpeza no finally (o período
 * CASCADE apaga pagamentos, pedidos e prints; driver/grupo saem pelo prefixo).
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}DesmarcaCobra ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzDesm ${RUN}`;
const GRUPO = `${TEST_EMPLOYEE_NAME_PREFIX}Grupo Desm ${RUN}`;

const PKGS = 1750;
const INICIO = '2026-07-01';
const FIM = '2026-07-15';

const modal = (page: Page): Locator => page.locator(MODAL).last();
const driverRow = (page: Page): Locator =>
  page.locator('tbody tr').filter({ hasText: DRIVER }).first();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

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

test.describe('Desmarcar espelho volta a cobrar o print (19/08/2026)', () => {
  test('desmarcar com print de pé confirma, recusa o print e a cobrança volta', async ({ page }) => {
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
      // ── Driver + quinzena de teste, pacotes, grupo ────────────────────────
      await page.getByRole('button', { name: /Novo driver/ }).click();
      await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
      await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Desm');
      await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

      await page.getByRole('button', { name: /Novo período/ }).click();
      await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
      await modal(page).getByRole('button', { name: 'Criar período' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
      await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
      await expect(driverRow(page)).toBeVisible({ timeout: 15_000 });
      const columns = await platformColumns(page);
      expect(columns.length, 'plataformas na grade').toBeGreaterThan(0);
      const plataforma = columns[0];
      const input = driverRow(page).locator('td').nth(plataforma.index).locator('input').first();
      await input.fill(String(PKGS));
      await input.blur();
      await expect(driverRow(page)).toContainText('3.500,00', { timeout: 10_000 }); // 1750 × R$2

      const { data: d } = await db.from('driverpay_drivers')
        .select('id, company_id').eq('name', DRIVER).single();
      const { data: g } = await db.from('driverpay_groups').insert({
        company_id: d!.company_id, name: GRUPO, leader_driver_id: d!.id,
      }).select('id').single();
      await db.from('driverpay_group_members').insert({
        company_id: d!.company_id, group_id: g!.id, driver_id: d!.id,
      });
      await page.reload();
      await goToTab(page, 'Pagamentos Driver');
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
      await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
      await expect(driverRow(page)).toBeVisible({ timeout: 20_000 });

      // ── Pedido de espelho (por grupo — alcança só o driver de teste) ──────
      await page.getByRole('button', { name: 'Solicitar espelho' }).click();
      await expect(modal(page).getByText('Solicitar espelho do app')).toBeVisible({ timeout: 10_000 });
      const datas = modal(page).locator('input[type="date"]');
      await datas.nth(0).fill(INICIO);
      await datas.nth(1).fill(FIM);
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
        .selectOption({ label: `${GRUPO} (1 entregador(es))` });
      await modal(page).getByRole('button', { name: /Solicitar espelho|Parar de pedir/ }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

      // ── Print VALIDADO no banco (como a fila gravaria) + espelho conferido ─
      const { data: per } = await db.from('driverpay_periods')
        .select('id, company_id').eq('label', PERIOD).single();
      const { data: pay } = await db.from('driverpay_payments')
        .select('id').eq('period_id', per!.id).eq('driver_id', d!.id).single();

      const { data: ins, error: insErr } = await db.from('driverpay_delivery_proofs').insert({
        company_id: per!.company_id, driver_id: d!.id, period_id: per!.id, payment_id: pay!.id,
        platform_name: plataforma.name,
        file_path: `${per!.company_id}/${per!.id}/${d!.id}/${plataforma.name}/pw-test-desm-${RUN}.jpg`,
        file_type: 'image/jpeg', original_filename: 'espelho.jpg', upload_source: 'app',
        uploaded_by: d!.id, status: 'validado',
        check_status: 'ok', check_qtd: true, check_periodo: true,
        read_packages: PKGS, read_start_date: INICIO, read_end_date: FIM,
        expected_packages: PKGS, checked_at: new Date().toISOString(), check_attempts: 1,
      }).select('id').single();
      expect(insErr, 'registrar o print validado').toBeNull();
      const proofId = ins!.id as string;
      await db.from('driverpay_payments').update({
        espelho_conferido: true,
        espelho_conferido_at: new Date().toISOString(),
        espelho_conferido_by: 'auto',
      }).eq('id', pay!.id);

      await page.reload();
      await goToTab(page, 'Pagamentos Driver');
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
      await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
      await expect(driverRow(page)).toBeVisible({ timeout: 20_000 });
      const conferido = driverRow(page).getByTitle('Espelho conferido (bate com a planilha)');
      await expect(conferido).toBeVisible({ timeout: 15_000 });

      // ══ 1+2. Desmarcar CONFIRMA e recusa o print ══════════════════════════
      let dialogText = '';
      page.on('dialog', (dialog) => {
        dialogText = dialog.message();
        void dialog.accept();
      });
      await conferido.click();
      await expect(driverRow(page).getByTitle('Marcar espelho conferido')).toBeVisible({ timeout: 15_000 });
      expect(dialogText, 'a confirmação avisou o que vai acontecer').toContain('RECUSAR o print');

      // Banco: espelho desmarcado POR GENTE, print rejeitado com o motivo do app.
      const { data: payDepois } = await db.from('driverpay_payments')
        .select('espelho_conferido, espelho_conferido_by').eq('id', pay!.id).single();
      expect(payDepois!.espelho_conferido, 'check desmarcado no banco').toBe(false);
      expect(payDepois!.espelho_conferido_by, 'desmarcado por humano, não pela varredura').not.toBe('auto');
      const { data: proofDepois } = await db.from('driverpay_delivery_proofs')
        .select('status, reject_reason').eq('id', proofId).single();
      expect(proofDepois!.status, 'print recusado — o app volta a cobrar').toBe('rejeitado');
      expect(proofDepois!.reject_reason, 'motivo que o entregador vai ler')
        .toContain('novo print');

      // Grade: a tag "recusado" aparece (o painel também vê que a cobrança voltou).
      await expect(driverRow(page).getByTestId('espelho-atencao')).toBeVisible({ timeout: 15_000 });
      await expect(driverRow(page).getByTestId('espelho-atencao')).toContainText('recusado');

      // ══ 3. A varredura NÃO remarca (decisão humana respeitada) ════════════
      // A grade já recarregou (tag visível acima) e o check segue apagado.
      await expect(driverRow(page).getByTitle('Marcar espelho conferido')).toBeVisible();
      const { data: payFinal } = await db.from('driverpay_payments')
        .select('espelho_conferido').eq('id', pay!.id).single();
      expect(payFinal!.espelho_conferido, 'varredura não desfez a decisão humana').toBe(false);
    } finally {
      // ── Limpeza: a quinzena CASCADE apaga pagamentos, pedidos e prints; o
      //    driver e o grupo "PW Test" saem na limpeza por prefixo (cleanup.ts). ──
      const sel = periodSelect(page, PERIOD);
      if (await sel.count()) {
        await sel.selectOption({ label: PERIOD }).catch(() => {});
        await deleteCurrentPeriod(page).catch(() => {});
      }
    }
  });
});
