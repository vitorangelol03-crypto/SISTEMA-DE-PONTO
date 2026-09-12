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

  test('🎯 o PAINEL DE MESES: clica no nome do mês e escolhe direto, sem setinha', async ({ page }) => {
    // Pedido do Victor: *"coloque tipo uma tabela de mês pra não precisar ficar
    // toda hora clicando na setinha; abre uma janelinha flutuante pequena e a
    // pessoa clica direto no mês que ela quer"*.
    const popup = await abrirArquivoDePagamento(page);
    const sel = popup.getByTestId('seletor-de-semana');
    const rotulo = sel.getByTestId('mes-na-tela');

    const mesAgora = await rotulo.innerText();
    await expect(sel.getByTestId('painel-de-meses'), 'nasce fechado').toHaveCount(0);

    await sel.getByTestId('abrir-painel-de-meses').click();
    const painel = sel.getByTestId('painel-de-meses');
    await expect(painel).toBeVisible();

    // Os 12 meses aparecem SEMPRE — o que não tem semana fica apagado, pra
    // grade não dançar de um ano pro outro.
    const quadrados = painel.locator('div.grid button');
    await expect(quadrados, 'os 12 meses do ano').toHaveCount(12);

    // O mês que está na tela vem marcado de azul, pra pessoa se achar.
    const marcado = painel.locator('div.grid button.bg-blue-600');
    await expect(marcado, 'o mês de agora vem marcado').toHaveCount(1);
    expect(mesAgora, 'e o marcado é mesmo o da tela')
      .toContain(await marcado.innerText());

    // Todo mês desligado explica o porquê — senão parece defeito.
    const desligados = painel.locator('div.grid button:disabled');
    for (let i = 0; i < await desligados.count(); i++) {
      await expect(desligados.nth(i)).toHaveAttribute('title', /Sem semana cadastrada/);
    }

    // Clica num mês que TEM semana e não é o de agora: a tela anda de uma vez.
    // Se este ano só tem um mês com semana, o painel também anda de ano — é a
    // mesma janelinha, e o teste tem que chegar num mês diferente de verdade.
    const outroMes = async () => {
      const livres = painel.locator('div.grid button:not([disabled])');
      for (let i = 0; i < await livres.count(); i++) {
        if (!mesAgora.startsWith(await livres.nth(i).innerText())) return livres.nth(i);
      }
      return null;
    };
    let escolhido = await outroMes();
    if (!escolhido) {
      await painel.getByRole('button', { name: 'Ano anterior' }).click();
      escolhido = await outroMes();
    }
    expect(escolhido, 'tem que existir outro mês pra escolher').not.toBeNull();
    await escolhido!.click();
    await expect(painel, 'escolher fecha a janelinha').toHaveCount(0);
    await expect(rotulo, 'o mês na tela mudou').not.toHaveText(mesAgora);

    // E clicar fora fecha sem escolher nada.
    await sel.getByTestId('abrir-painel-de-meses').click();
    await expect(sel.getByTestId('painel-de-meses')).toBeVisible();
    const depois = await rotulo.innerText();
    await popup.getByText('Qual semana você vai pagar').click();
    await expect(sel.getByTestId('painel-de-meses'), 'clicar fora fecha').toHaveCount(0);
    await expect(rotulo, 'e não troca o mês').toHaveText(depois);
  });

  test('🎯 os filtros de VÍNCULO e FUNÇÃO ficam à vista, mesmo com a prévia carregada', async ({ page }) => {
    // 🔴 Eles viviam dentro do bloco que só existe ANTES de importar: assim que
    // a prévia carregava, sumiam da tela — ninguém conseguia filtrar de novo.
    const popup = await abrirArquivoDePagamento(page);

    // ⚠️ Pelo TESTID, não pelo texto: `getByText('Função')` casa com o rótulo E
    // com a opção "Sem função" lá dentro do próprio combo (strict mode reclama).
    const vinculo = popup.getByTestId('employment-type-filter');
    const funcao = popup.getByTestId('function-role-filter');
    await expect(vinculo).toBeVisible();
    await expect(funcao).toBeVisible();

    // Carrega uma prévia DE VERDADE. Tem que ser a Semana 1 (31/08–06/09), que
    // é a que tem pagamento: a semana ABERTA, onde o popup nasce, ainda não tem
    // — ninguém pagou a semana que está correndo, e prévia vazia não prova nada.
    await popup.getByTestId('seletor-de-semana')
      .getByRole('button', { name: /Semana 1/ }).click();
    await expect(async () => {
      expect(await popup.locator('table tbody tr').count()).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000 });

    await expect(vinculo, 'vínculo não some').toBeVisible();
    await expect(funcao, 'função não some').toBeVisible();

    // E o filtro de função tem as funções da empresa, não só "Todas".
    expect(await funcao.locator('option').count(), 'as funções da empresa')
      .toBeGreaterThan(2);
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
