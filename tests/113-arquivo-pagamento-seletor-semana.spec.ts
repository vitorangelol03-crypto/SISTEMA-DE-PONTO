import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * E2E — ESCOLHER A SEMANA NO ARQUIVO DE PAGAMENTO (11/09/2026).
 *
 * Pedido do Victor: *"na aba de arquivo de pagamento eu não quero selecionar do
 * jeito que está. Quero que apareça ali janeiro, tudo dividido… eu seleciono um
 * mês, e dentro do mês a semana. Automaticamente já vem marcando a semana atual
 * que está aberta pra pagamento. Mas a gente consegue ir andando pelas semanas,
 * pelos meses, sem precisar filtrar no calendário. Quero TAMBÉM a opção de
 * filtrar no calendário, sem respeitar a regra da semana."*
 *
 * ⚠️ TODO locator aqui é preso ao `c6-popup`. A tela do Financeiro continua no
 * DOM ATRÁS do popup, com outra tabela de pagamentos — numa sonda anterior eu
 * contei 184 linhas achando que era a prévia, e era a tela de trás. O print é
 * que mostrou a verdade.
 */

function popupDoArquivo(page: Page) {
  return page.getByTestId('c6-popup');
}

async function abrirArquivoDePagamento(page: Page) {
  await goToTab(page, 'Financeiro');
  await page.getByRole('button', { name: /^Gerar arquivo de pagamento$/ }).click();
  const popup = popupDoArquivo(page);
  await expect(popup).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByTestId('seletor-de-semana')).toBeVisible({ timeout: 30_000 });
  return popup;
}

test.describe('Arquivo de pagamento: escolher a semana em dois cliques', () => {
  // Login + abrir o popup + importar a prévia não cabe nos 30s padrão desta
  // máquina (o robô da Shopee roda junto). É espera por condição, não sleep.
  test.describe.configure({ timeout: 180_000 });
  test.use({ actionTimeout: 30_000 });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('🎯 abre marcando a semana ABERTA, sem precisar escolher nada', async ({ page }) => {
    const popup = await abrirArquivoDePagamento(page);
    const sel = popup.getByTestId('seletor-de-semana');

    // A semana aberta existe e está marcada (o botão marcado é o azul).
    const aberta = sel.getByRole('button').filter({ hasText: 'ABERTA' });
    await expect(aberta, 'a semana aberta aparece').toHaveCount(1);
    await expect(aberta).toHaveClass(/bg-blue-600/);
  });

  test('🎯 dá pra andar pelos MESES sem abrir lista nenhuma', async ({ page }) => {
    const popup = await abrirArquivoDePagamento(page);
    const sel = popup.getByTestId('seletor-de-semana');

    const mesAgora = await sel.locator('span.font-bold').first().innerText();
    await sel.getByRole('button', { name: 'Mês anterior' }).click();
    await expect(sel.locator('span.font-bold').first()).not.toHaveText(mesAgora);

    await sel.getByRole('button', { name: 'Mês seguinte' }).click();
    await expect(sel.locator('span.font-bold').first()).toHaveText(mesAgora);
  });

  test('🎯 clicar numa semana REFAZ a prévia com os pagamentos dela', async ({ page }) => {
    const popup = await abrirArquivoDePagamento(page);
    const sel = popup.getByTestId('seletor-de-semana');

    // A Semana 1 de setembro é a que tem pagamento (31/08–06/09).
    const semana1 = sel.getByRole('button', { name: /Semana 1/ });
    await expect(semana1).toBeVisible();
    await semana1.click();

    // A prévia aparece DENTRO do popup, com as linhas daquela semana.
    const linhas = popup.locator('table tbody tr');
    await expect(async () => {
      expect(await linhas.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000 });

    // E a descrição de cada linha carrega o período escolhido, não outro.
    await expect(popup.getByText(/Pagamento ref\. \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/).first())
      .toBeVisible();
  });

  test('🎯 "Datas livres" continua existindo, sem respeitar a regra da semana', async ({ page }) => {
    const popup = await abrirArquivoDePagamento(page);
    const sel = popup.getByTestId('seletor-de-semana');

    // No modo Semanas não há campo de data solto.
    await expect(sel.locator('input[type="date"]')).toHaveCount(0);

    await sel.getByRole('button', { name: /^Datas livres$/ }).click();
    const datas = sel.locator('input[type="date"]');
    await expect(datas, 'as duas datas do calendário').toHaveCount(2);

    // Um período que NÃO é uma semana (3 dias) tem que ser aceito.
    await datas.nth(0).fill('2026-09-01');
    await datas.nth(1).fill('2026-09-03');
    await expect(datas.nth(0)).toHaveValue('2026-09-01');
    await expect(datas.nth(1)).toHaveValue('2026-09-03');

    // E dá pra voltar pro modo rápido sem perder o seletor.
    await sel.getByRole('button', { name: /^Semanas$/ }).click();
    await expect(sel.getByRole('button', { name: /Semana 1/ })).toBeVisible();
  });
});
