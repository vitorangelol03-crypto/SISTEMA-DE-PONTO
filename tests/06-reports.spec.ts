import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * Relatórios — agora DENTRO do Financeiro (12/09/2026).
 *
 * A aba própria saiu do menu a pedido do Victor e virou um botão no Financeiro,
 * com três relatórios (ponto · financeiro · geral), cada um em PDF e planilha,
 * e recorte por semana, mês, ano ou datas livres.
 *
 * O spec antigo testava a tela velha: colunas de bônus na tabela, o toggle
 * "Mostrar rejeitados" (que morreu junto com a aprovação de ponto, no mesmo dia)
 * e os botões "Exportar Excel/PDF". Nada disso existe mais — o que importa agora
 * é o caminho que a pessoa faz: entra, escolhe o que quer, e o arquivo cai.
 */

test.describe('Relatórios (dentro do Financeiro)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');
    await page.getByTestId('relatorios-btn').click();
    await expect(page.getByTestId('relatorios-panel')).toBeVisible({ timeout: 30_000 });
  });

  test('a aba "Relatórios" NÃO existe mais no menu de cima', async ({ page }) => {
    // ⚠️ A afirmação é dentro do <nav>, não na página inteira: DENTRO do
    // Financeiro existe um botão com o mesmo nome — a sub-aba nova — e a primeira
    // versão deste teste tropeçou nele.
    const menu = page.locator('nav').first();
    // Abre o "Mais" antes de afirmar ausência, senão o teste passaria só porque a
    // aba está escondida lá dentro.
    const mais = menu.getByTestId('abas-mais');
    if (await mais.count()) await mais.first().click().catch(() => {});
    await expect(menu.getByRole('button', { name: /^Relatórios$/ })).toHaveCount(0);
  });

  test('os três relatórios aparecem para escolher', async ({ page }) => {
    await expect(page.getByTestId('tipo-ponto')).toBeVisible();
    await expect(page.getByTestId('tipo-financeiro')).toBeVisible();
    await expect(page.getByTestId('tipo-geral')).toBeVisible();
  });

  test('trocar o recorte muda o período que vai sair', async ({ page }) => {
    await page.getByTestId('modo-mes').click();
    const texto = page.getByTestId('periodo-escolhido');
    await expect(texto).toContainText(/de 20\d\d/);

    await page.getByTestId('modo-ano').click();
    await expect(texto).toContainText(/Ano de 20\d\d/);

    await page.getByTestId('modo-livre').click();
    await page.getByTestId('data-inicio').fill('2026-08-01');
    await page.getByTestId('data-fim').fill('2026-08-31');
    await expect(texto).toContainText('01/08/2026 a 31/08/2026');
  });

  test('filtrar por vínculo muda quem entra no relatório', async ({ page }) => {
    const contagem = page.getByTestId('contagem-escolhidos');
    await expect(contagem).toBeVisible({ timeout: 30_000 });
    const todos = (await contagem.textContent()) ?? '';

    // "Carteira Assinada" é o vínculo com menos gente nas duas empresas — se o
    // filtro funciona, a contagem tem que cair.
    await page.getByTestId('relatorios-panel').getByTestId('employment-type-filter').selectOption('Carteira Assinada');
    await expect(contagem).not.toHaveText(todos, { timeout: 15_000 });
  });

  test('🎯 baixa a PLANILHA do mês e o arquivo chega', async ({ page }) => {
    await page.getByTestId('tipo-ponto').click();
    await page.getByTestId('modo-livre').click();
    await page.getByTestId('data-inicio').fill('2026-08-01');
    await page.getByTestId('data-fim').fill('2026-08-31');

    const download = page.waitForEvent('download', { timeout: 90_000 });
    await page.getByTestId('baixar-excel').click();
    const arquivo = await download;

    expect(arquivo.suggestedFilename()).toMatch(/^Relatorio_Ponto_.*\.xlsx$/);
    const caminho = await arquivo.path();
    expect(caminho).toBeTruthy();
  });

  test('🎯 baixa o PDF geral e o arquivo é um PDF de verdade', async ({ page }) => {
    await page.getByTestId('tipo-geral').click();
    await page.getByTestId('modo-livre').click();
    await page.getByTestId('data-inicio').fill('2026-08-01');
    await page.getByTestId('data-fim').fill('2026-08-07');

    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('baixar-pdf').click();
    const arquivo = await download;

    expect(arquivo.suggestedFilename()).toMatch(/^Relatorio_Geral_.*\.pdf$/);

    // Não basta o nome terminar em .pdf: lê os primeiros bytes e confere a
    // assinatura do formato. Arquivo de 0 byte com nome certo já aconteceu aqui.
    const caminho = await arquivo.path();
    expect(caminho).toBeTruthy();
    const fs = await import('node:fs');
    const buffer = fs.readFileSync(caminho!);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1024);
  });
});
