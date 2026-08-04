import { test, expect, Page, Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — ESPELHO DO APP DA SHOPEE (print da tela), lado do PAINEL.
 * Pedido do Victor em 04/08/2026, com CLIQUES REAIS e a FOTO REAL dele.
 *
 * O que este teste prova, na ordem em que a equipe usa:
 *   1) "Solicitar espelho" EXIGE as datas da quinzena e avisa quando a duração
 *      está estranha (foi o erro achado em produção hoje: quinzena de 45 dias);
 *   2) depois de solicitar, a coluna "Print" aparece na grade;
 *   3) chegando um print com quantidade DIFERENTE da planilha, o painel mostra a
 *      FOTO ao lado da comparação em português ("58 a mais no print");
 *   4) validar na mão deixa a linha verde.
 *
 * A foto é a de verdade (tests/fixtures/espelho-shopee-real.jpg): tela "Entrega",
 * aba "Encerrado (1808)", período 2026/07/01 - 2026/07/15. A planilha do teste diz
 * 1750 de propósito, pra cair no caso que importa — a divergência.
 *
 * ⚠️ ESCOPO: aqui é o PAINEL. O envio pelo portal do entregador passa pela edge fn
 * `driver-public-api` e só dá pra testar depois do deploy — por isso o print é
 * inserido direto no banco, exatamente como a edge fn o gravaria. A conferência em
 * si (ler a foto, comparar, recusar) tem cobertura própria em tests/unit/proofCheck
 * e foi medida contra a API real com esta mesma foto.
 *
 * Segurança de produção: tudo dentro de uma quinzena descartável "PW Test …",
 * excluída pela própria UI no fim (FK cascade limpa os filhos). O print de teste e
 * o arquivo no bucket são removidos no finally.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Espelho ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzEsp ${RUN}`;
const BUCKET = 'driverpay-delivery-proofs';

/** O que a planilha diz (de propósito diferente do print, pra testar a divergência). */
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

async function closeModal(page: Page): Promise<void> {
  const fechar = modal(page).getByRole('button', { name: /^(Fechar|Cancelar)$/ });
  if (await fechar.count()) await fechar.first().click();
  else await modal(page).getByRole('button').first().click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 5_000 });
}

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
    // As colunas de plataforma ficam entre "Grupo" e "Pacotes".
    if (/^(Driver|Grupo|Pacotes|ZAPEX|Desconto|Vale|Total a receber|NF|Print|Espelho|Ações)/i.test(txt)) continue;
    if (txt && out.length < 6) out.push({ name: txt.split('\n')[0].trim(), index: i });
  }
  return out;
}

test.describe('Espelho do app da Shopee — painel (04/08/2026)', () => {
  test('solicita, recebe print divergente, mostra a foto e valida na mão', async ({ page }) => {
    test.setTimeout(240_000);
    const db = getClient();
    let proofId: string | null = null;
    let filePath: string | null = null;

    // Vite no WSL sobe frio e o `page.goto('/')` do loginAs estoura o timeout padrão
    // de 15s na PRIMEIRA navegação (lição de 19-20/07). Um `page.request.get` não
    // resolve: ele busca o arquivo, mas não faz o navegador puxar a árvore inteira
    // de módulos, que é o que demora. Então a gente faz o próprio goto aqui, com
    // tempo de sobra; o do loginAs, logo depois, já pega tudo compilado.
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
      await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Esp');
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

      // ══ 1. SOLICITAR ESPELHO — as datas são obrigatórias ═════════════════
      await page.getByRole('button', { name: 'Solicitar espelho' }).click();
      await expect(modal(page).getByText('Solicitar espelho do app')).toBeVisible({ timeout: 10_000 });

      const botaoSolicitar = modal(page).getByRole('button', { name: /Solicitar espelho|Parar de pedir/ });
      // Sem datas o botão fica travado — é o que impede o print certo de ser recusado.
      await expect(botaoSolicitar).toBeDisabled();

      const datas = modal(page).locator('input[type="date"]');
      // Duração absurda dispara o aviso (o erro real achado em produção hoje).
      await datas.nth(0).fill(INICIO);
      await datas.nth(1).fill('2026-08-15');
      await expect(modal(page).getByText(/Uma quinzena costuma ter 14 dias/)).toBeVisible({ timeout: 5_000 });

      // Datas certas: o aviso some e o botão libera.
      await datas.nth(1).fill(FIM);
      await expect(modal(page).getByText(/Uma quinzena costuma ter 14 dias/)).toHaveCount(0);
      await expect(modal(page).getByText('14 dias')).toBeVisible();
      await expect(botaoSolicitar).toBeEnabled();

      // Marca a plataforma onde os pacotes foram lançados. O modal já vem com a
      // SHOPEE marcada (decisão do Victor), então aqui a gente garante que o chip
      // escolhido é o da plataforma deste teste — senão a prévia diria "ninguém",
      // que é o comportamento CERTO pra quem não tem pacote na plataforma marcada.
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

      // A prévia diz quem vai ser cobrado (1 driver com pacote).
      await expect(modal(page).getByText(/entregador\(es\) com pacote/)).toBeVisible({ timeout: 10_000 });

      await botaoSolicitar.click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });

      // ══ 2. A coluna "Print" aparece na grade, ainda vazia (0/1) ══════════
      await expect(page.locator('thead').getByText('Print')).toBeVisible({ timeout: 10_000 });
      await expect(driverRow(page)).toContainText('0/1', { timeout: 10_000 });

      // ══ 3. Chega um print DIVERGENTE (a foto real: 1808 × planilha 1750) ══
      // Inserido como a edge fn gravaria — o envio pelo portal depende do deploy.
      const { data: per } = await db.from('driverpay_periods').select('id, company_id').eq('label', PERIOD).single();
      const { data: drv } = await db.from('driverpay_drivers').select('id').eq('name', DRIVER).single();
      const { data: pay } = await db.from('driverpay_payments')
        .select('id').eq('period_id', per!.id).eq('driver_id', drv!.id).single();

      // ⚠️ Nada de __dirname: o projeto é ESM e ali ele não existe (ReferenceError).
      // O Playwright roda com o cwd na raiz, onde está o playwright.config.ts.
      const foto = fs.readFileSync(path.resolve('tests', 'fixtures', 'espelho-shopee-real.jpg'));
      filePath = `${per!.company_id}/${per!.id}/${drv!.id}/${plataforma.name}/pw-test-${RUN}.jpg`;
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

      // ══ 4. O painel mostra a FOTO e a comparação em português ═════════════
      await page.reload();
      await goToTab(page, 'Pagamentos Driver');
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
      await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
      await expect(driverRow(page)).toBeVisible({ timeout: 15_000 });

      // O botão fica âmbar com o número de quem precisa de atenção.
      const botaoRecebidos = page.getByRole('button', { name: /Espelhos recebidos/ });
      await expect(botaoRecebidos).toContainText('(1)', { timeout: 10_000 });
      await botaoRecebidos.click();
      await expect(modal(page).getByText('Espelhos recebidos')).toBeVisible({ timeout: 10_000 });

      // A comparação, em português, com os DOIS números e o tamanho da diferença.
      await expect(modal(page).getByText(String(PKGS_PLANILHA))).toBeVisible({ timeout: 10_000 });
      await expect(modal(page).getByText(String(PKGS_PRINT))).toBeVisible();
      await expect(modal(page).getByText(/58 a mais no print/)).toBeVisible();
      await expect(modal(page).getByText('quantidade diferente')).toBeVisible();

      // A FOTO REAL está na tela (não é só o nome do arquivo).
      const img = modal(page).locator(`img[alt*="${DRIVER}"]`).first();
      await expect(img).toBeVisible({ timeout: 15_000 });
      const src = await img.getAttribute('src');
      expect(src, 'link assinado da foto').toContain(BUCKET);
      // A imagem carregou de verdade no navegador (largura > 0).
      await expect
        .poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
        .toBeGreaterThan(0);

      // ══ 5. Validar na mão → a linha fica verde ═══════════════════════════
      await modal(page).getByTitle(/Aceitar este print/).click();
      await expect(modal(page).getByText('confere ✓')).toBeVisible({ timeout: 15_000 });
      await closeModal(page);

      await expect(driverRow(page)).toContainText('1/1', { timeout: 15_000 });
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
