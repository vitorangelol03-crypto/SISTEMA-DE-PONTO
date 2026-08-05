import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';

/**
 * E2E — busca por nome em "Espelhos recebidos" e em "Notas recebidas"
 * (05/08/2026, pedido do Victor: "pode ir escrevendo e já vai aparecendo, ignorar os acentos").
 *
 * Roda na quinzena REAL aberta, porque o ponto é justamente o volume (84 prints, 61 notas);
 * numa quinzena de teste vazia a busca não provaria nada. **Só lê** — digita no campo e
 * confere o que fica na tela. Nenhum clique que grave, nenhum arquivo tocado.
 *
 * O que prova:
 *   1) digitar filtra na hora, sem apertar nada;
 *   2) ACENTO é ignorado nos dois sentidos (digitar sem acento acha nome com acento);
 *   3) limpar volta tudo;
 *   4) nome que não existe mostra a mensagem certa, não uma tela vazia sem explicação.
 */

const MODAL = 'div.fixed.inset-0';
const modal = (page: Page): Locator => page.locator(MODAL).last();

/** Tira acento igual o sistema faz, pra montar a busca a partir de um nome real da tela. */
const semAcento = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

test.describe('Pagamentos Driver — busca por nome nos modais', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
  });

  test('espelhos recebidos: filtra enquanto digita e ignora acento', async ({ page }) => {
    test.setTimeout(180_000);

    // Espera a tela assentar: os cartões de cima chegam depois e os botões "pulam".
    await expect(page.getByText('Total a receber').first()).toBeVisible({ timeout: 40_000 });
    const abrir = page.getByRole('button', { name: /Espelhos recebidos/ }).first();
    await abrir.scrollIntoViewIfNeeded();
    await abrir.click({ timeout: 30_000 });
    const campo = modal(page).getByTestId('print-busca');
    await expect(campo).toBeVisible({ timeout: 20_000 });

    // Vai pra aba "Todos" — é onde há gente independente do estado de conferência.
    await modal(page).getByRole('button', { name: /Todos \(/ }).click();
    const cartoes = modal(page).locator('div.rounded-lg.border').filter({ has: modal(page).locator('img') });
    const antes = await cartoes.count();
    test.skip(antes === 0, 'quinzena sem print — nada a filtrar');

    // Pega um nome real da tela e busca por um pedaço dele SEM acento.
    const nomeReal = (await modal(page).locator('p.font-semibold, .font-semibold').first().innerText()).trim();
    const pedaco = semAcento(nomeReal.split(' ')[0]).toLowerCase();

    await campo.fill(pedaco);
    await expect(modal(page).getByText(/print\(s\) nesta aba/)).toBeVisible({ timeout: 10_000 });
    const depois = await cartoes.count();
    expect(depois, 'a busca tem que reduzir (ou manter) a lista').toBeLessThanOrEqual(antes);
    expect(depois, 'quem eu procurei continua aparecendo').toBeGreaterThan(0);

    // Nome que não existe: mensagem clara, não tela vazia muda.
    await campo.fill('zzzznaoexistezzzz');
    await expect(modal(page).getByText(/Ninguém com esse nome nesta aba/)).toBeVisible({ timeout: 10_000 });

    // Limpar devolve tudo.
    await modal(page).getByLabel('Limpar busca').click();
    await expect.poll(async () => cartoes.count(), { timeout: 10_000 }).toBe(antes);
  });

  test('notas recebidas: filtra enquanto digita e ignora acento', async ({ page }) => {
    test.setTimeout(180_000);

    await page.getByRole('button', { name: /Notas recebidas/ }).first().click();
    const campo = modal(page).getByTestId('nf-busca');
    await expect(campo).toBeVisible({ timeout: 20_000 });

    // O cabeçalho de cada entregador tem testid próprio: pegar ".font-semibold" solto
    // trazia o texto do botão de auto-validação, e a busca por ele não achava ninguém.
    const blocos = modal(page).getByTestId('nf-grupo-driver');
    await expect(blocos.first()).toBeVisible({ timeout: 20_000 });
    const antes = await blocos.count();
    test.skip(antes === 0, 'quinzena sem nota — nada a filtrar');

    const nomeReal = (await blocos.first().innerText()).trim();
    const pedaco = semAcento(nomeReal.split(' ')[0]).toLowerCase();

    await campo.fill(pedaco);
    await expect(modal(page).getByText(/entregador\(es\) ·/)).toBeVisible({ timeout: 10_000 });
    expect(await blocos.count()).toBeLessThanOrEqual(antes);

    await campo.fill('zzzznaoexistezzzz');
    await expect(modal(page).getByText(/Nenhum entregador com esse nome/)).toBeVisible({ timeout: 10_000 });

    await modal(page).getByLabel('Limpar busca').click();
    await expect.poll(async () => blocos.count(), { timeout: 10_000 }).toBe(antes);
  });

  test('nota: valor esperado na tag e botão pra ver o espelho', async ({ page }) => {
    test.setTimeout(180_000);
    await expect(page.getByText('Total a receber').first()).toBeVisible({ timeout: 30_000 });
    const btn = page.getByRole('button', { name: 'Notas recebidas', exact: true });
    await btn.scrollIntoViewIfNeeded();
    await btn.click({ timeout: 30_000 });
    await expect(modal(page).getByTestId('nf-busca')).toBeVisible({ timeout: 20_000 });

    // 1) A TAG DO VALOR (05/08/2026): "assim já sabemos qual valor esperar na nota".
    // Antes esse número só existia dentro da mensagem de recusa.
    const tags = modal(page).getByTestId('nf-valor-esperado');
    await expect(tags.first()).toBeVisible({ timeout: 20_000 });
    const texto = await tags.first().innerText();
    expect(texto, 'a tag mostra dinheiro em reais').toMatch(/R\$\s?[\d.]+,\d{2}/);

    // 2) O BOTÃO DO ESPELHO. Não dá pra checar o endereço da aba nova: o PDF assinado
    // volta como download e o Chromium deixa a aba em "about:blank". O que prova o
    // recurso de verdade é o sistema IR BUSCAR o link do espelho no storage — e o
    // arquivo existir (200). Sem espelho publicado, tem que AVISAR, não ficar mudo.
    const verEspelho = modal(page).getByTitle(/Ver o espelho deste entregador/).first();
    await expect(verEspelho).toBeVisible();
    const pedido = page
      .waitForResponse((r) => r.url().includes('/object/sign/driverpay-mirrors'), { timeout: 25_000 })
      .catch(() => null);
    await verEspelho.click();
    const resp = await pedido;
    if (resp) {
      expect(resp.status(), 'o link assinado do espelho foi criado').toBe(200);
    } else {
      await expect(page.getByText(/ainda não tem espelho publicado/i)).toBeVisible({ timeout: 15_000 });
    }
  });
});
