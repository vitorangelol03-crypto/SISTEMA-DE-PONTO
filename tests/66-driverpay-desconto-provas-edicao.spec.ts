import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — ANEXAR / TROCAR / REMOVER PROVA AO **EDITAR** UM DESCONTO.
 * Bug relatado pelo Victor em 04/08/2026: "estou editando as PNRs e adicionando
 * foto e o sistema não está salvando as fotos".
 *
 * Causa raiz: `updateDiscount` só gravava valor, código, observação e marca — a
 * tela coletava a imagem e a descartava. O aviso azul "as fotos/vídeo não mudam
 * aqui" descrevia a limitação em vez de corrigi-la.
 *
 * Este teste prova, com CLIQUES REAIS e arquivos REAIS subindo pro bucket:
 *   1) lançar desconto com 1 foto continua funcionando (regressão do que já havia);
 *   2) EDITAR e adicionar 2ª foto + vídeo agora GRAVA os dois — o bug relatado;
 *   3) EDITAR e remover uma foto limpa a coluna no banco E apaga o arquivo do
 *      Storage (sem isso o bucket vira depósito de lixo);
 *   4) editar só o valor NÃO apaga as provas que já estavam lá — a regressão mais
 *      perigosa, porque destruiria prova de dinheiro em silêncio.
 *
 * ⚠️ O bucket `driverpay-discount-proofs` tem policy de INSERT/SELECT/DELETE e
 * NÃO de UPDATE: por isso cada prova nova nasce com nome único em vez de
 * sobrescrever. Se alguém reintroduzir `upsert: true` num caminho existente, o
 * cenário 2 quebra — é exatamente o ponto que o teste guarda.
 *
 * Segurança de produção: driver e quinzena descartáveis com prefixo "PW Test ",
 * excluídos no fim; os arquivos que sobrarem no bucket saem no finally.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Prova ${RUN}`;
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzProva ${RUN}`;
const BUCKET = 'driverpay-discount-proofs';

/** PNG 1x1 real (não é placeholder: precisa passar por `type.startsWith('image/')`). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
/** MP4 mínimo — só precisa ter MIME de vídeo e menos de 50 MB. */
const MP4_FAKE = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

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

/** Anexa uma foto pelo input escondido do formulário de prova. */
async function anexarFoto(page: Page, nome: string): Promise<void> {
  await modal(page)
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles({ name: nome, mimeType: 'image/png', buffer: PNG_1X1 });
}

async function anexarVideo(page: Page, nome: string): Promise<void> {
  await modal(page)
    .locator('input[type="file"][accept="video/*"]')
    .setInputFiles({ name: nome, mimeType: 'video/mp4', buffer: MP4_FAKE });
}

/** Miniaturas de prova visíveis no formulário (as já salvas + as novas). */
const miniaturas = (page: Page): Locator => modal(page).locator('img[alt^="prova "]');

test.describe('Desconto: provas ao editar (bug 04/08/2026)', () => {
  test('anexa, troca e remove foto/vídeo editando um desconto já lançado', async ({ page }) => {
    test.setTimeout(300_000);
    const db = getClient();
    let caminhosParaLimpar: string[] = [];

    // Vite no WSL sobe frio: a 1ª navegação estoura o timeout padrão (lição 19-20/07).
    await page.goto('/', { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');

    // Sobras de rodadas anteriores.
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
      await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Prova');
      await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

      await page.getByRole('button', { name: /Novo período/ }).click();
      await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
      await modal(page).getByRole('button', { name: 'Criar período' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
      await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
      await page.getByPlaceholder(/Nome do driver/).fill(DRIVER);
      await expect(driverRow(page)).toBeVisible({ timeout: 20_000 });

      // ══ 1. LANÇAR com 1 foto (regressão do que já funcionava) ════════════
      await driverRow(page).getByTitle('Lançar desconto').click();
      await expect(modal(page).getByText('Descontos')).toBeVisible({ timeout: 10_000 });

      await modal(page).getByPlaceholder('0,00').fill('25,50');
      await modal(page).getByPlaceholder('Ex.: 741412525252').fill('BRTESTE001');
      await anexarFoto(page, 'foto-a.png');
      await expect(miniaturas(page)).toHaveCount(1, { timeout: 10_000 });
      await modal(page).getByRole('button', { name: /Lançar desconto/ }).click();
      await expect(modal(page).getByText('BRTESTE001')).toBeVisible({ timeout: 15_000 });

      const lido1 = await db
        .from('driverpay_discounts')
        .select('id, proof1_path, proof2_path, proof_video_path')
        .eq('package_code', 'BRTESTE001')
        .single();
      const descontoId = lido1.data!.id as string;
      expect(lido1.data!.proof1_path, 'foto do lançamento gravada').toBeTruthy();
      caminhosParaLimpar.push(lido1.data!.proof1_path as string);
      const fotoOriginal = lido1.data!.proof1_path as string;

      // ══ 2. EDITAR: somar 2ª foto + vídeo — O BUG RELATADO ════════════════
      await modal(page).getByTitle('Editar desconto').first().click();
      // As provas já salvas têm que APARECER na edição (antes vinha vazio).
      await expect(miniaturas(page)).toHaveCount(1, { timeout: 10_000 });

      await anexarFoto(page, 'foto-b.png');
      await expect(miniaturas(page)).toHaveCount(2, { timeout: 10_000 });
      await anexarVideo(page, 'video.mp4');
      await modal(page).getByRole('button', { name: /Salvar edição/ }).click();
      await expect(modal(page).getByRole('button', { name: /Lançar desconto/ })).toBeVisible({ timeout: 20_000 });

      const lido2 = await db
        .from('driverpay_discounts')
        .select('proof1_path, proof2_path, proof_video_path')
        .eq('id', descontoId)
        .single();
      // 🔴 O CORAÇÃO DO BUG: antes da correção, proof2_path e proof_video_path
      // continuavam nulos por mais que o usuário anexasse.
      expect(lido2.data!.proof1_path, '1ª foto preservada').toBe(fotoOriginal);
      expect(lido2.data!.proof2_path, '2ª foto anexada na EDIÇÃO').toBeTruthy();
      expect(lido2.data!.proof_video_path, 'vídeo anexado na EDIÇÃO').toBeTruthy();
      const fotoB = lido2.data!.proof2_path as string;
      const videoPath = lido2.data!.proof_video_path as string;
      caminhosParaLimpar.push(fotoB, videoPath);

      // Os arquivos existem MESMO no bucket (não basta o caminho no banco).
      for (const caminho of [fotoOriginal, fotoB, videoPath]) {
        const pasta = caminho.slice(0, caminho.lastIndexOf('/'));
        const arquivo = caminho.slice(caminho.lastIndexOf('/') + 1);
        const { data: lista } = await db.storage.from(BUCKET).list(pasta);
        expect(lista?.some((f) => f.name === arquivo), `arquivo no bucket: ${arquivo}`).toBe(true);
      }

      // ══ 3. EDITAR só o VALOR não pode apagar prova nenhuma ═══════════════
      await modal(page).getByTitle('Editar desconto').first().click();
      await expect(miniaturas(page)).toHaveCount(2, { timeout: 10_000 });
      await modal(page).getByPlaceholder('0,00').fill('31,00');
      await modal(page).getByRole('button', { name: /Salvar edição/ }).click();
      await expect(modal(page).getByRole('button', { name: /Lançar desconto/ })).toBeVisible({ timeout: 20_000 });

      const lido3 = await db
        .from('driverpay_discounts')
        .select('amount, proof1_path, proof2_path, proof_video_path')
        .eq('id', descontoId)
        .single();
      expect(Number(lido3.data!.amount)).toBe(31);
      expect(lido3.data!.proof1_path, 'trocar o valor não pode perder prova').toBe(fotoOriginal);
      expect(lido3.data!.proof2_path).toBe(fotoB);
      expect(lido3.data!.proof_video_path).toBe(videoPath);

      // ══ 4. EDITAR removendo a 1ª foto: limpa o banco E o Storage ═════════
      await modal(page).getByTitle('Editar desconto').first().click();
      await expect(miniaturas(page)).toHaveCount(2, { timeout: 10_000 });
      await modal(page).getByTitle('Remover foto').first().click();
      await expect(miniaturas(page)).toHaveCount(1, { timeout: 10_000 });
      await modal(page).getByTitle('Remover vídeo').click();
      await modal(page).getByRole('button', { name: /Salvar edição/ }).click();
      await expect(modal(page).getByRole('button', { name: /Lançar desconto/ })).toBeVisible({ timeout: 20_000 });

      const lido4 = await db
        .from('driverpay_discounts')
        .select('proof1_path, proof2_path, proof_video_path')
        .eq('id', descontoId)
        .single();
      // A foto que sobrou sobe para o 1º lugar; a 2ª vaga e o vídeo ficam vazios.
      expect(lido4.data!.proof1_path, 'a foto que sobrou continua salva').toBe(fotoB);
      expect(lido4.data!.proof2_path).toBeNull();
      expect(lido4.data!.proof_video_path).toBeNull();

      // E os arquivos removidos saíram DE VERDADE do bucket.
      for (const caminho of [fotoOriginal, videoPath]) {
        const pasta = caminho.slice(0, caminho.lastIndexOf('/'));
        const arquivo = caminho.slice(caminho.lastIndexOf('/') + 1);
        const { data: lista } = await db.storage.from(BUCKET).list(pasta);
        expect(lista?.some((f) => f.name === arquivo), `apagado do bucket: ${arquivo}`).toBe(false);
      }
      caminhosParaLimpar = [fotoB];

      await closeModal(page);
    } finally {
      if (caminhosParaLimpar.length) await db.storage.from(BUCKET).remove(caminhosParaLimpar).catch(() => {});
      const sel = periodSelect(page, PERIOD);
      if (await sel.count()) {
        await sel.selectOption({ label: PERIOD }).catch(() => {});
        await deleteCurrentPeriod(page).catch(() => {});
      }
      await db.from('driverpay_drivers').delete().eq('name', DRIVER);
    }
  });
});
