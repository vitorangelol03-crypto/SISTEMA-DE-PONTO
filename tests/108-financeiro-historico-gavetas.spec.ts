import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * E2E — HISTÓRICO DE PAGAMENTOS EM GAVETAS (Etapa 2, 11/09/2026).
 *
 * Navega de verdade: entra no painel, abre o Financeiro, clica na aba nova, abre
 * e fecha gaveta, passa o mouse no erro, clica na tag, abre a lista do PDF e
 * filtra por vínculo.
 *
 * 🎯 O QUE ESTE ARQUIVO EXISTE PRA PROVAR — o bug de R$ 82.980 de 11/09/2026:
 * a gaveta ABERTA somava R$ 16.194 enquanto a linha FECHADA dizia R$ 8.472,
 * porque produção tem semanas SOBREPOSTAS e o mesmo pagamento caía em todas as
 * que o continham. O teste lê os dois números da TELA e exige que batam. Se
 * alguém voltar a contar em dobro, ele quebra.
 *
 * Roda contra dados REAIS da empresa (não cria nada e não apaga nada): a conta
 * que interessa é a da produção, com as semanas sobrepostas que só existem lá.
 */

const BRL_NA_TELA = /R\$\s*[\d.]+,\d{2}/;

/** "R$ 8.472,00" → 8472 */
function paraNumero(txt: string): number {
  const m = txt.match(/R\$\s*([\d.]+,\d{2})/);
  if (!m) throw new Error(`não achei valor em "${txt}"`);
  return Number(m[1].replace(/\./g, '').replace(',', '.'));
}

async function abrirHistorico(page: Page) {
  await goToTab(page, 'Financeiro');
  await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('payments-history-btn').click();
  // A carga é própria da aba e busca período a período — dá tempo.
  await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });
}

test.describe('Histórico de pagamentos em gavetas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('a aba abre já no mês em andamento, sem piscar "nenhum período"', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await expect(page.getByRole('heading', { name: /Gestão Financeira/ }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('payments-history-btn').click();

    // 🎯 Nunca pode aparecer "Nenhum período" antes da busca terminar — era o
    // susto de meio segundo dizendo que não existe nada (achado em 11/09).
    await expect(page.getByText(/Nenhum período de pagamento cadastrado/)).toBeHidden();

    await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });
    await expect(page.getByText('EM ANDAMENTO').first()).toBeVisible({ timeout: 30_000 });
  });

  test('o mês em andamento já vem ABERTO, e o botão fecha e abre', async ({ page }) => {
    await abrirHistorico(page);

    const semanas = page.getByTestId('semana-do-historico');
    await expect(semanas.first(), 'abre sozinho no período corrente').toBeVisible({ timeout: 30_000 });
    const quantas = await semanas.count();
    expect(quantas).toBeGreaterThan(0);

    // O botão de abrir/fechar é o PEQUENO, à esquerda — não a linha inteira.
    const botaoDaGaveta = page.getByRole('button', { name: /^(Abrir|Fechar) \w+ de \d{4}$/ }).first();
    await botaoDaGaveta.click();
    await expect(semanas).toHaveCount(0);
    await botaoDaGaveta.click();
    await expect(semanas).toHaveCount(quantas);
  });

  test('🎯 a gaveta ABERTA fecha com a linha FECHADA (o erro de R$ 82.980)', async ({ page }) => {
    await abrirHistorico(page);

    const mes = page.getByTestId('gaveta-mes').filter({ hasText: 'EM ANDAMENTO' }).first();
    await expect(mes).toBeVisible({ timeout: 30_000 });

    const totalFechado = paraNumero(await mes.innerText());
    expect(totalFechado, 'o mês em andamento tem valor').toBeGreaterThan(0);

    // NÃO clicar: o mês em andamento JÁ abre sozinho (pedido do Victor). Clicar
    // aqui fechava a gaveta e o teste não achava semana nenhuma.
    const semanas = page.getByTestId('semana-do-historico');
    await expect(semanas.first()).toBeVisible({ timeout: 30_000 });

    const linhas = await semanas.allInnerTexts();
    const somaDasSemanas = linhas
      .filter((t) => BRL_NA_TELA.test(t))
      .reduce((s, t) => s + paraNumero(t), 0);

    // 🎯 A invariante: abrir a gaveta não pode mudar o número.
    expect(
      Math.abs(somaDasSemanas - totalFechado),
      `soma das semanas (${somaDasSemanas}) tem que bater com a linha fechada (${totalFechado})`,
    ).toBeLessThan(0.01);
  });

  test('o balão dos erros aparece no hover e o popup abre no clique', async ({ page }) => {
    await abrirHistorico(page);

    // Pelo testid da PRÓPRIA tag: filtrar por texto pegava a LINHA do mês, que
    // contém o texto da tag — e passar o mouse na linha não abre balão nenhum.
    const tagComErro = page.getByTestId('tag-erros').filter({ hasText: /\d+ erros?/ }).first();
    if (await tagComErro.count() === 0) {
      test.skip(true, 'nenhum mês com erro no banco agora');
    }

    // DENTRO da tag que recebeu o mouse, não na página: há um balão por mês, e
    // `page.getByText(...).first()` conferia o de OUTRO mês, que continua oculto.
    await tagComErro.hover();
    await expect(tagComErro.getByText(/erros? no período/)).toBeVisible({ timeout: 10_000 });

    await tagComErro.click();
    // O popup separa por vínculo — foi o pedido do Victor.
    const popup = page.getByRole('dialog').or(page.locator('.fixed.inset-0').last());
    await expect(popup.getByText(/Diaristas/).first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
  });

  test('"sem erro" NÃO abre popup vazio', async ({ page }) => {
    await abrirHistorico(page);

    const semErro = page.getByTestId('tag-erros').filter({ hasText: /^sem erro$/ }).first();
    if (await semErro.count() === 0) test.skip(true, 'todos os meses têm erro agora');

    await semErro.click({ force: true });
    // Não pode abrir nada: sem erro é notícia boa, não tem o que listar.
    await expect(page.getByText(/Nenhum erro deste tipo no período/)).toBeHidden();
  });

  test('o botão de PDF abre a lista de quem entra, com filtro por vínculo', async ({ page }) => {
    await abrirHistorico(page);

    // Pelo BOTÃO, não pela linha: a linha do mês contém o texto "PDF do mês" e,
    // enquanto ela era `role="button"`, o clique caía nela e fechava a gaveta.
    await page.getByRole('button', { name: /^PDF do mês$/ }).first().click();
    await expect(page.getByText(/marque quem entra/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Buscando quem foi pago nesse período…/)).toBeHidden({ timeout: 120_000 });

    // Os 3 filtros do pedido do Victor, e a contagem de escolhidos.
    await expect(page.getByRole('button', { name: /^Todos \(\d+\)$/ })).toBeVisible();
    const soDiaristas = page.getByRole('button', { name: /^Diaristas \(\d+\)$/ });
    await expect(soDiaristas).toBeVisible();
    await expect(page.getByRole('button', { name: /^Carteira assinada \(\d+\)$/ })).toBeVisible();
    await expect(page.getByText(/\d+ escolhidos/)).toBeVisible();

    // 🎯 Filtrar por vínculo NÃO pode desmarcar ninguém — é o que permite
    // misturar alguns diaristas com alguns de carteira assinada.
    const antes = await page.getByText(/\d+ escolhidos/).innerText();
    await soDiaristas.click();
    await expect(page.getByText(/\d+ escolhidos/)).toHaveText(antes);

    // E os dois botões são SEPARADOS (decisão do Victor: conferir antes de mandar).
    await expect(page.getByRole('button', { name: /Baixar/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Publicar/ })).toBeVisible();
  });
});
