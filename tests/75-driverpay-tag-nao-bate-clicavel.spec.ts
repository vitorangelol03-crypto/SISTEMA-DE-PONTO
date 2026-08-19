import { test, expect, Page, Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — TAG "NÃO BATE" CLICÁVEL (19/08/2026, pedido do Victor com print da grade):
 * *"a tag de espelho não bate deixe ela para ser clicavel e quando clicar apare o
 * espelho infromando o porque de não bate e com opção de validar ele ali"*.
 *
 * O que este teste prova, com cliques reais:
 *   1) chegando um print com quantidade DIFERENTE da planilha, a linha do driver
 *      mostra a tag âmbar "não bate";
 *   2) CLICAR na tag abre o modal "Espelhos recebidos" JÁ FILTRADO neste driver
 *      (a busca vem preenchida com o nome dele) — sem procurar na mão;
 *   3) o modal explica o porquê ("N a mais no print") e tem o botão de validar;
 *   4) validar ali fecha o assunto: a tag some e o espelho fica conferido.
 *
 * Reaproveita o desenho do tests/64 (mesma área): quinzena e driver descartáveis
 * "PW Test …", print inserido direto no banco exatamente como a edge fn gravaria
 * (o envio real passa pela `driver-public-api`, coberta em unit + teste real),
 * foto real de fixture, limpeza no finally.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}TagNaoBate ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzTag ${RUN}`;
const BUCKET = 'driverpay-delivery-proofs';

/** O que a planilha diz (diferente do print de propósito — é o caso da tag). */
const PKGS_PLANILHA = 1750;
/** O que a FOTO REAL mostra: "Encerrado (1808)". */
const PKGS_PRINT = 1808;
/** O período que aparece na FOTO REAL: 2026/07/01 - 2026/07/15. */
const INICIO = '2026-07-01';
const FIM = '2026-07-15';

const modal = (page: Page): Locator => page.locator(MODAL).last();
const driverRow = (page: Page): Locator => page.locator('tbody tr').filter({ hasText: DRIVER }).first();
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

test.describe('Tag "não bate" clicável na grade (19/08/2026)', () => {
  test('clicar na tag abre Espelhos recebidos filtrado no driver, com motivo e validação', async ({ page }) => {
    test.setTimeout(240_000);
    const db = getClient();
    let proofId: string | null = null;
    let filePath: string | null = null;

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
      // ── Driver + quinzena de teste ────────────────────────────────────────
      await page.getByRole('button', { name: /Novo driver/ }).click();
      await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
      await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Tag');
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

      // ── Pacotes na 1ª plataforma real da grade ────────────────────────────
      const columns = await platformColumns(page);
      expect(columns.length, 'plataformas na grade').toBeGreaterThan(0);
      const plataforma = columns[0];
      const input = driverRow(page).locator('td').nth(plataforma.index).locator('input').first();
      await input.fill(String(PKGS_PLANILHA));
      await input.blur();
      await expect(driverRow(page)).toContainText('3.500,00', { timeout: 10_000 }); // 1750 × R$2

      // O pedido "pra todos" só cobra quem está EM GRUPO (regra de 04/08) — sem
      // grupo, a tag nunca apareceria. O cleanup apaga pelo prefixo.
      {
        const { data: d } = await db.from('driverpay_drivers')
          .select('id, company_id').eq('name', DRIVER).single();
        const { data: g } = await db.from('driverpay_groups').insert({
          company_id: d!.company_id, name: `${TEST_EMPLOYEE_NAME_PREFIX}Grupo Tag ${RUN}`,
          leader_driver_id: d!.id,
        }).select('id').single();
        await db.from('driverpay_group_members').insert({
          company_id: d!.company_id, group_id: g!.id, driver_id: d!.id,
        });
        await page.reload();
        await goToTab(page, 'Pagamentos Driver');
        await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
        await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
        await expect(driverRow(page)).toBeVisible({ timeout: 20_000 });
      }

      // ── Solicitar espelho (pré-condição pra coluna e pra tag existirem) ───
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
      await expect(modal(page).getByText(/entregador\(es\) com pacote/)).toBeVisible({ timeout: 10_000 });
      await modal(page).getByRole('button', { name: /Solicitar espelho|Parar de pedir/ }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

      // ── Chega um print DIVERGENTE (inserido como a edge fn gravaria) ──────
      const { data: per } = await db.from('driverpay_periods').select('id, company_id').eq('label', PERIOD).single();
      const { data: drv } = await db.from('driverpay_drivers').select('id').eq('name', DRIVER).single();
      const { data: pay } = await db.from('driverpay_payments')
        .select('id').eq('period_id', per!.id).eq('driver_id', drv!.id).single();

      const foto = fs.readFileSync(path.resolve('tests', 'fixtures', 'espelho-shopee-real.jpg'));
      filePath = `${per!.company_id}/${per!.id}/${drv!.id}/${plataforma.name}/pw-test-tag-${RUN}.jpg`;
      const up = await db.storage.from(BUCKET).upload(filePath, foto, { contentType: 'image/jpeg', upsert: true });
      expect(up.error, 'subir a foto real no bucket').toBeNull();

      const { data: ins, error: insErr } = await db.from('driverpay_delivery_proofs').insert({
        company_id: per!.company_id, driver_id: drv!.id, period_id: per!.id, payment_id: pay!.id,
        platform_name: plataforma.name, file_path: filePath, file_type: 'image/jpeg',
        original_filename: 'espelho-shopee-real.jpg', upload_source: 'app', uploaded_by: drv!.id,
        status: 'recebido',
        check_status: 'divergente', check_qtd: false, check_periodo: true,
        read_packages: PKGS_PRINT, read_start_date: INICIO, read_end_date: FIM,
        expected_packages: PKGS_PLANILHA, checked_at: new Date().toISOString(), check_attempts: 1,
      }).select('id').single();
      expect(insErr, 'registrar o print').toBeNull();
      proofId = ins!.id;

      // ══ 1. A TAG "não bate" aparece na linha do driver ════════════════════
      await page.reload();
      await goToTab(page, 'Pagamentos Driver');
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
      await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
      await expect(driverRow(page)).toBeVisible({ timeout: 15_000 });

      const tag = driverRow(page).getByTestId('espelho-atencao');
      await expect(tag).toBeVisible({ timeout: 15_000 });
      await expect(tag).toContainText('não bate');
      // É um BOTÃO de verdade agora, não um aviso morto.
      await expect(tag).toHaveAttribute('title', /clique para ver/i);

      // ══ 2. CLICAR na tag abre o modal JÁ FILTRADO neste driver ════════════
      await tag.click();
      await expect(modal(page).getByText('Espelhos recebidos')).toBeVisible({ timeout: 10_000 });
      // A busca veio preenchida com o nome do driver — este é o ponto da feature.
      await expect(modal(page).getByTestId('print-busca')).toHaveValue(DRIVER);
      // E o cartão dele está na tela, sem procurar nada na mão.
      await expect(modal(page).getByText(DRIVER).first()).toBeVisible({ timeout: 10_000 });

      // ══ 3. O modal explica O PORQUÊ e oferece a validação ═════════════════
      await expect(modal(page).getByText(/58 a mais no print/)).toBeVisible({ timeout: 10_000 });
      await expect(modal(page).getByText('quantidade diferente')).toBeVisible();
      const validar = modal(page).getByTitle(/Aceitar este print/);
      await expect(validar).toBeVisible();

      // ══ 4. VALIDAR ali fecha o assunto ════════════════════════════════════
      await validar.click();
      await expect(modal(page).getByRole('button', { name: /Precisam de voce \(0\)/ }))
        .toBeVisible({ timeout: 15_000 });
      await modal(page).getByRole('button', { name: 'Fechar' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });

      // A tag sumiu e o espelho ficou conferido — banco e tela de acordo.
      await expect(driverRow(page).getByTestId('espelho-atencao')).toHaveCount(0, { timeout: 15_000 });
      await expect(driverRow(page).getByTitle('Espelho conferido (bate com a planilha)'))
        .toBeVisible({ timeout: 15_000 });
      const { data: payDepois } = await db.from('driverpay_payments')
        .select('espelho_conferido').eq('id', pay!.id).single();
      expect(payDepois!.espelho_conferido, 'espelho_conferido no banco').toBe(true);
    } finally {
      // ── Limpeza: print, arquivo e quinzena ───────────────────────────────
      if (proofId) await db.from('driverpay_delivery_proofs').delete().eq('id', proofId);
      if (filePath) await db.storage.from(BUCKET).remove([filePath]);
      const sel = periodSelect(page, PERIOD);
      if (await sel.count()) {
        await sel.selectOption({ label: PERIOD }).catch(() => {});
        await deleteCurrentPeriod(page).catch(() => {});
      }
    }
  });
});
