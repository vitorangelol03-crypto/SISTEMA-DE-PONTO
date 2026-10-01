import { test, expect, type Page } from '@playwright/test';

/** Marca posta na aba aberta: some quando a página é recarregada. */
declare global {
  interface Window { __abaVelha?: boolean }
}

/**
 * ATUALIZAÇÃO AUTOMÁTICA DAS TELAS DO FUNCIONÁRIO — no navegador de verdade (01/10/2026).
 *
 * O caso real: às 02:08 de 01/10 o iPhone do Washington usou uma tela de ponto de ANTES de 30/09
 * (o Safari guarda a aba e não busca a página de novo). O servidor já exigia o PIN pro rosto, a
 * tela velha não mandava, e ela disse "Não foi possível acessar a câmera".
 *
 * Aqui a aba fica aberta, "sai uma versão nova" (o /version.json passa a dizer outra coisa — é
 * exatamente o que muda num deploy) e a pessoa "volta pra aba". O que precisa acontecer:
 *   1. /erros na tela inicial: recarrega sozinha — e uma vez só;
 *   2. /erros com o CPF sendo digitado: NÃO recarrega no meio; apagou o CPF, recarrega;
 *   3. /clock na tela inicial: recarrega sozinha.
 * Só abre telas e lê — não bate ponto nem grava nada.
 */

async function abrirEMarcar(page: Page, rota: string): Promise<{ carregamentos: () => number }> {
  let n = 0;
  page.on('load', () => { n += 1; });
  await page.goto(rota);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => { window.__abaVelha = true; });
  return { carregamentos: () => n };
}

/** Um deploy: a etiqueta publicada passa a ser OUTRA — e fica fixa (como num deploy de verdade). */
async function sairVersaoNova(page: Page): Promise<void> {
  const corpo = JSON.stringify({ versao: `versao-nova-${Date.now()}` });
  await page.route('**/version.json*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: corpo,
  }));
}

/** O que o Safari faz quando a pessoa desbloqueia o celular e volta pra aba. */
async function voltarPraAba(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

const abaFoiRecarregada = (page: Page) =>
  page.waitForFunction(() => window.__abaVelha !== true, null, { timeout: 15_000 });

test.describe('atualização automática das telas do funcionário', () => {
  test('1. /erros na tela inicial: versão nova → recarrega sozinha, uma vez só', async ({ page }) => {
    const { carregamentos } = await abrirEMarcar(page, '/erros');
    await sairVersaoNova(page);
    await voltarPraAba(page);
    await abaFoiRecarregada(page);
    await expect(page.locator('#cpf')).toBeVisible();

    // Recarregou e o /version.json continua dizendo outra coisa (o "cache do caminho"): não
    // recarrega em círculo. Provar que algo NÃO acontece exige deixar o tempo passar.
    const depois = carregamentos();
    await voltarPraAba(page);
    await page.waitForTimeout(3000);
    expect(carregamentos()).toBe(depois);
  });

  test('2. /erros com o CPF sendo digitado: espera; apagou, recarrega', async ({ page }) => {
    await abrirEMarcar(page, '/erros');
    await page.locator('#cpf').fill('123.456');
    await sairVersaoNova(page);
    await voltarPraAba(page);

    // Provar que NÃO recarregou no meio da digitação exige deixar o tempo passar.
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => window.__abaVelha)).toBe(true);
    await expect(page.locator('#cpf')).toHaveValue('123.456');

    await page.locator('#cpf').fill('');
    await abaFoiRecarregada(page);
  });

  test('3. /clock na tela inicial: versão nova → recarrega sozinha', async ({ page }) => {
    await abrirEMarcar(page, '/clock');
    await sairVersaoNova(page);
    await voltarPraAba(page);
    await abaFoiRecarregada(page);
  });
});
