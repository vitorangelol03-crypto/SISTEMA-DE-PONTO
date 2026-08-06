import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';

/**
 * E2E — "quem enviou as notas atrasadas" fica VISÍVEL em Notas recebidas
 * (06/08/2026, pedido do Victor: *"vamos colocar um filtro em notas recebida para ver quem
 * envio as notas atrasadas"*).
 *
 * 🔑 O filtro de prazo já existia desde 04/08 — o que faltava era a tela DIZER que existe
 * nota atrasada. Com 75 notas e 3 atrasadas, quem não desconfia nunca abre o filtro.
 *
 * O que este teste prova, na quinzena REAL (só leitura — nenhum clique que grave):
 *   1) cada opção do filtro mostra o seu número, e os três somam o total;
 *   2) havendo atrasada, a faixa laranja aparece dizendo QUANTAS e de QUANTAS PESSOAS;
 *   3) clicar na faixa deixa na tela SÓ as atrasadas — todas com o selo "⏰ atrasada";
 *   4) não havendo atrasada, a faixa não aparece e o filtro explica o vazio em vez de
 *      deixar a tela em branco.
 */

const MODAL = 'div.fixed.inset-0';
const modal = (page: Page): Locator => page.locator(MODAL).last();

/** "Só atrasadas (3)" -> 3 */
const numeroDe = (texto: string): number => {
  const m = texto.match(/\((\d+)\)/);
  return m ? Number(m[1]) : -1;
};

test.describe('Pagamentos Driver — notas atrasadas à vista', () => {
  test('o filtro conta, a faixa avisa e o clique mostra quem atrasou', async ({ page }) => {
    test.setTimeout(180_000);
    page.on('dialog', (d) => d.accept());

    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
    await expect(page.getByText('Total a receber').first()).toBeVisible({ timeout: 40_000 });

    const abrir = page.getByRole('button', { name: /Notas recebidas/ }).first();
    await abrir.scrollIntoViewIfNeeded();
    await abrir.click({ timeout: 30_000 });

    const filtro = modal(page).getByTestId('nf-filtro-prazo');
    await expect(filtro).toBeVisible({ timeout: 20_000 });

    // ── 1) os números aparecem nas opções e fecham a conta ──
    const opcoes = await filtro.locator('option').allInnerTexts();
    expect(opcoes.length, 'quatro opções de prazo').toBe(4);
    const [todas, noPrazo, atrasadas, semPrazo] = opcoes.map(numeroDe);
    for (const n of [todas, noPrazo, atrasadas, semPrazo]) expect(n).toBeGreaterThanOrEqual(0);
    expect(noPrazo + atrasadas + semPrazo, 'as três situações somam o total').toBe(todas);

    const faixa = modal(page).getByTestId('nf-atalho-atrasadas');
    const blocos = modal(page).getByTestId('nf-grupo-driver');

    if (atrasadas === 0) {
      // ── 4) sem atrasada: nada de faixa laranja, e o vazio é explicado ──
      await expect(faixa).toHaveCount(0);
      await filtro.selectOption('atrasada');
      await expect(modal(page).getByTestId('nf-filtro-vazio')).toBeVisible({ timeout: 10_000 });
      await expect(blocos).toHaveCount(0);
      return;
    }

    // ── 2) a faixa avisa quantas notas e de quantas pessoas ──
    await expect(faixa).toBeVisible({ timeout: 10_000 });
    const textoFaixa = await faixa.innerText();
    expect(textoFaixa).toContain(`${atrasadas} nota(s) atrasada(s)`);
    const pessoas = Number(textoFaixa.match(/de\s+(\d+)\s+entregador/)?.[1] ?? -1);
    expect(pessoas, 'a faixa diz de quantas PESSOAS são').toBeGreaterThan(0);
    expect(pessoas, 'no máximo uma pessoa por nota').toBeLessThanOrEqual(atrasadas);
    await page.screenshot({ path: 'test-results/notas-atrasadas/01-faixa-avisa.png' });

    // ── 3) clicar na faixa deixa SÓ as atrasadas ──
    await faixa.click();
    await expect(filtro).toHaveValue('atrasada');
    await expect(blocos).toHaveCount(pessoas, { timeout: 15_000 });
    // Toda nota que sobrou na tela tem o selo de atrasada — nenhuma "no prazo" passou.
    await expect(modal(page).getByTestId('nf-atrasada')).toHaveCount(atrasadas);
    await expect(modal(page).getByText('no prazo', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/notas-atrasadas/02-quem-atrasou.png' });

    // Voltar pra "Todas" devolve a lista inteira — o filtro não esconde nada pra sempre.
    await filtro.selectOption('');
    await expect.poll(async () => modal(page).getByTestId('nf-atrasada').count(), { timeout: 15_000 })
      .toBe(atrasadas);
    await expect(blocos.first()).toBeVisible();
  });
});
