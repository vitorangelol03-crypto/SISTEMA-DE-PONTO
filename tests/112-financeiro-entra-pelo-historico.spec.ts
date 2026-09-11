import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs } from './helpers';

/**
 * E2E — O FINANCEIRO ENTRA PELO HISTÓRICO (11/09/2026).
 *
 * Pedido do Victor, nas palavras dele:
 *
 *   *"quando abre a aba ela não abre direto na [lista]… aquela parte de
 *   histórico que você colocou é que vai abrir quando a gente clicar na aba do
 *   financeiro. Aí dentro, quando a gente clicar dentro da semana, é que vai
 *   abrir a parte do financeiro filtrada referente só àquela semana. O fluxo:
 *   entra primeiro na aba do financeiro, vai ter lá semanas, meses — aquela vai
 *   ser a principal; clicando dentro dela, a gente abre diretamente dentro da
 *   aba do financeiro referente àquela semana."*
 *
 * E, na mesma conversa, ele escolheu que o MÊS abre as semanas **e** tem um
 * botão pra ver o mês inteiro.
 *
 * ⚠️ Este spec NÃO usa o `goToTab('Financeiro')` de propósito: aquele helper
 * clica em "Pagamentos" pra manter os ~10 specs antigos funcionando. Aqui o que
 * está sendo testado é justamente a porta de entrada, então o clique é na aba
 * crua.
 */

async function abrirAbaFinanceiro(page: Page) {
  await page.getByRole('button', { name: /^Financeiro$/ }).first().click();
  await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first())
    .toBeVisible({ timeout: 30_000 });
}

/** A lista de pagamentos está na tela? (os filtros de data são só dela) */
function listaDePagamentos(page: Page) {
  return page.locator('input[type="date"]').first();
}

test.describe('O Financeiro abre no histórico, e a semana leva pra lista', () => {
  test.use({ actionTimeout: 30_000 });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('🎯 clicar na aba Financeiro abre o HISTÓRICO, não a lista', async ({ page }) => {
    await abrirAbaFinanceiro(page);

    // As gavetas estão na tela…
    await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });
    await expect(page.getByTestId('gaveta-mes').first()).toBeVisible({ timeout: 30_000 });

    // …e a lista de pagamentos NÃO está.
    await expect(listaDePagamentos(page), 'a lista não pode aparecer de cara').toBeHidden();
  });

  test('🎯 clicar na SEMANA abre a lista filtrada SÓ naquela semana', async ({ page }) => {
    await abrirAbaFinanceiro(page);
    await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });

    // A gaveta do mês em andamento já vem aberta; pega a 1ª semana dela.
    const semana = page.getByTestId('semana-do-historico').first();
    await expect(semana).toBeVisible({ timeout: 30_000 });
    const textoDaSemana = await semana.innerText();
    const intervalo = textoDaSemana.match(/(\d{2})\s*–\s*(\d{2}\/\d{2})/)
      ?? textoDaSemana.match(/(\d{2}\/\d{2})\s*–\s*(\d{2}\/\d{2})/);
    expect(intervalo, `não achei o intervalo em "${textoDaSemana}"`).toBeTruthy();

    await semana.click();

    // Agora é a LISTA que está na tela, e o histórico saiu.
    await expect(listaDePagamentos(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gaveta-mes')).toHaveCount(0);

    // 🎯 Filtrada NAQUELA semana: as datas vêm do período escolhido e ficam
    // travadas — é o "só aquela semana" que ele pediu.
    const inicio = page.locator('input[type="date"]').nth(0);
    const fim = page.locator('input[type="date"]').nth(1);
    await expect(inicio).toHaveAttribute('readonly', '');
    await expect(fim).toHaveAttribute('readonly', '');

    const de = await inicio.inputValue();
    const ate = await fim.inputValue();
    expect(de, 'data inicial preenchida').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ate, 'data final preenchida').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Uma semana: no máximo 7 dias entre as pontas.
    const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000;
    expect(dias, `de ${de} até ${ate} tem que ser uma semana`).toBeLessThanOrEqual(7);
    expect(dias).toBeGreaterThanOrEqual(0);

    // E o combo de período está na semana, não em "datas livres".
    await expect(page.locator('select').first()).not.toHaveValue('');
  });

  test('🎯 dá pra VOLTAR pro histórico depois de entrar na semana', async ({ page }) => {
    await abrirAbaFinanceiro(page);
    await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });
    await page.getByTestId('semana-do-historico').first().click();
    await expect(listaDePagamentos(page)).toBeVisible({ timeout: 30_000 });

    const voltar = page.getByRole('button', { name: /Voltar para o histórico/ });
    await expect(voltar, 'sem isto o fluxo seria de mão única').toBeVisible();
    await voltar.click();

    await expect(page.getByTestId('gaveta-mes').first()).toBeVisible({ timeout: 30_000 });
    await expect(listaDePagamentos(page)).toBeHidden();
  });

  test('🎯 "Ver o mês" abre a lista com o mês inteiro (decisão do Victor)', async ({ page }) => {
    await abrirAbaFinanceiro(page);
    await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });

    await page.getByRole('button', { name: /^Ver o mês$/ }).first().click();
    await expect(listaDePagamentos(page)).toBeVisible({ timeout: 30_000 });

    const de = await page.locator('input[type="date"]').nth(0).inputValue();
    const ate = await page.locator('input[type="date"]').nth(1).inputValue();
    const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000;
    expect(dias, `o mês tem que ser maior que uma semana (${de} → ${ate})`).toBeGreaterThan(7);

    // O mês são VÁRIAS semanas, então não é um "período" só: o combo fica livre
    // e as datas ficam editáveis.
    await expect(page.locator('select').first()).toHaveValue('');
    await expect(page.locator('input[type="date"]').nth(0)).not.toHaveAttribute('readonly', '');
  });

  test('o botão "Pagamentos" continua abrindo a lista direto, sem a volta', async ({ page }) => {
    await abrirAbaFinanceiro(page);
    await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });

    await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
    await expect(listaDePagamentos(page)).toBeVisible({ timeout: 30_000 });
    // Quem abriu direto não veio de lugar nenhum — não faz sentido oferecer volta.
    await expect(page.getByRole('button', { name: /Voltar para o histórico/ })).toBeHidden();
  });
});
