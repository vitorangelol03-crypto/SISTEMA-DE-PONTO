import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — ORDEM E FILTRO COMBINADOS (05/08/2026, pedido do Victor: "quero as duas
 * possibilidades"), com CLIQUES DE VERDADE na tela.
 *
 * O que prova:
 *   1) marcar DUAS plataformas filtra por "quem tem AS DUAS" e não por "qualquer uma" —
 *      provado pela aritmética: a interseção nunca pode ser maior que cada conjunto sozinho,
 *      enquanto a união nunca é menor. É o que separa E de OU sem depender de dado fixo;
 *   2) nada marcado não esconde ninguém (o susto que mais custa caro aqui);
 *   3) dois critérios de ORDEM valem juntos: aparecem os selos 1º/2º e o "Limpar ordem (2)";
 *   4) "Limpar ordem" devolve a lista ao estado anterior.
 *
 * Roda numa QUINZENA DE TESTE descartável (o preload traz os drivers/grupos reais; filtro e
 * ordem são só de tela, não gravam nada). No fim a quinzena é excluída pela própria UI.
 */

const MODAL = 'div.fixed.inset-0';
const RUN = Date.now().toString(36);
const PERIOD = `${TEST_EMPLOYEE_NAME_PREFIX}QuinzFiltro ${RUN}`;

const modal = (page: Page): Locator => page.locator(MODAL).last();
const periodSelect = (page: Page, label: string): Locator =>
  page.locator('select').filter({ hasText: label }).first();

/** Linhas de driver na visão Lista (ignora as linhas expandidas de detalhe). */
const driverRows = (page: Page): Locator =>
  page.locator('tbody tr').filter({ has: page.getByTitle(/Selecionar para espelho|Já incluído pelo grupo/) });

async function deleteCurrentPeriod(page: Page): Promise<void> {
  const excluir = page.getByTitle('Excluir esta quinzena e seus lançamentos');
  if (!(await excluir.count())) {
    await page.getByRole('button', { name: /^Concluir$/ }).click();
    await expect(modal(page).getByText('Concluir pagamento')).toBeVisible({ timeout: 10_000 });
    await modal(page).getByRole('button', { name: 'Concluir sem abrir próxima' }).click();
    await expect(excluir).toBeVisible({ timeout: 15_000 });
  }
  await excluir.click();
  await expect(modal(page).getByText('Editar quinzena')).toBeVisible({ timeout: 10_000 });
  await modal(page).getByRole('button', { name: 'Excluir definitivamente' }).click();
  await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
}

test.describe('Pagamentos Driver — ordem e filtro combinados', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
    for (let i = 0; i < 5; i++) {
      const sel = periodSelect(page, TEST_EMPLOYEE_NAME_PREFIX);
      if (!(await sel.count())) break;
      const leftover = sel.locator('option').filter({ hasText: TEST_EMPLOYEE_NAME_PREFIX }).first();
      const value = await leftover.getAttribute('value');
      if (!value) break;
      await sel.selectOption(value);
      await deleteCurrentPeriod(page);
    }
  });

  test('duas plataformas = SÓ quem tem as duas; dois critérios de ordem valem juntos', async ({ page }) => {
    test.setTimeout(240_000);

    // ── Quinzena de teste ───────────────────────────────────────────────────
    await page.getByRole('button', { name: /Novo período/ }).click();
    await modal(page).getByPlaceholder(/1ª Quinzena de Junho/).fill(PERIOD);
    await modal(page).getByRole('button', { name: 'Criar período' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 15_000 });
    await periodSelect(page, PERIOD).selectOption({ label: PERIOD });
    await expect(page.getByText('Aberto').first()).toBeVisible({ timeout: 10_000 });

    // ── A regra tem que estar ESCRITA na tela, não adivinhada ───────────────
    await expect(page.getByText('quem tem TODAS as marcadas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('qualquer um dos marcados')).toBeVisible();

    const plataformaBtn = page.getByRole('button', { name: /Todas as plataformas/ });
    await expect(plataformaBtn).toBeVisible({ timeout: 15_000 });

    // Sem filtro: ninguém escondido. Espera a tabela chegar — contar antes do render
    // devolveria 0 e o teste mentiria dizendo que o filtro escondeu todo mundo.
    await expect(driverRows(page).first()).toBeVisible({ timeout: 30_000 });
    const totalSemFiltro = await driverRows(page).count();
    expect(totalSemFiltro, 'a quinzena de teste tem drivers').toBeGreaterThan(0);

    // Descobre duas plataformas de verdade no painel de opções.
    await plataformaBtn.click();
    const opcoes = page.locator('div.absolute button');
    await expect(opcoes.first()).toBeVisible({ timeout: 10_000 });
    const nomes = await opcoes.allInnerTexts();
    test.skip(nomes.length < 2, 'precisa de 2 plataformas cadastradas');
    const [platA, platB] = nomes.map((n) => n.trim());

    // ── Só a plataforma A ───────────────────────────────────────────────────
    await opcoes.filter({ hasText: platA }).first().click();
    const soA = await driverRows(page).count();

    // ── A + B: interseção ───────────────────────────────────────────────────
    await opcoes.filter({ hasText: platB }).first().click();
    const aEB = await driverRows(page).count();
    await expect(page.getByRole('button', { name: /2 selecionados/ })).toBeVisible({ timeout: 10_000 });

    // ── Só a plataforma B ───────────────────────────────────────────────────
    await opcoes.filter({ hasText: platA }).first().click(); // desmarca A
    const soB = await driverRows(page).count();

    // 🎯 A PROVA de que é "as duas" e não "qualquer uma":
    // interseção ≤ cada conjunto sozinho. Se fosse OU, seria ≥ os dois.
    expect(aEB, `${platA}+${platB} não pode passar de ${platA} sozinha`).toBeLessThanOrEqual(soA);
    expect(aEB, `${platA}+${platB} não pode passar de ${platB} sozinha`).toBeLessThanOrEqual(soB);

    // ── Limpar: volta todo mundo (ninguém fica escondido) ───────────────────
    await page.getByLabel(/Limpar filtro de Plataforma/).click();
    await expect(page.getByRole('button', { name: /Todas as plataformas/ })).toBeVisible({ timeout: 10_000 });
    expect(await driverRows(page).count()).toBe(totalSemFiltro);

    // ── Ordem combinada, na visão Grupos ────────────────────────────────────
    // Esc fecha o painel de opções: aberto, ele cobre o botão "Grupos" logo abaixo.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Grupos$/ }).click();
    // Sem `^`: quando o critério entra na pilha o selo "1º" passa a fazer parte do nome
    // acessível do botão ("1º Total pacotes"), e um seletor ancorado no início pararia de casar.
    const btnPacotes = page.getByRole('button', { name: /Total pacotes/ });
    const btnReceber = page.getByRole('button', { name: /Total a receber/ });
    await expect(btnPacotes).toBeVisible({ timeout: 15_000 });

    // 1 critério: sem selo de posição (número seria ruído)
    await btnPacotes.click();
    await expect(page.getByRole('button', { name: /Limpar ordem$/ })).toBeVisible({ timeout: 10_000 });

    // 2 critérios: os selos 1º e 2º aparecem e o botão diz (2)
    await btnReceber.click();
    await expect(page.getByRole('button', { name: /Limpar ordem \(2\)/ })).toBeVisible({ timeout: 10_000 });
    await expect(btnPacotes.getByText('1º')).toBeVisible();
    await expect(btnReceber.getByText('2º')).toBeVisible();

    // 3º clique no 1º critério tira ELE da pilha, e o outro vira o único
    await btnPacotes.click(); // desc -> asc
    await btnPacotes.click(); // asc -> sai
    await expect(page.getByRole('button', { name: /Limpar ordem$/ })).toBeVisible({ timeout: 10_000 });

    // ── Limpar ordem zera tudo ──────────────────────────────────────────────
    await page.getByRole('button', { name: /Limpar ordem/ }).click();
    await expect(page.getByRole('button', { name: /Limpar ordem/ })).toHaveCount(0, { timeout: 10_000 });

    await deleteCurrentPeriod(page);
    await expect(page.locator('select').filter({ hasText: PERIOD })).toHaveCount(0, { timeout: 10_000 });
  });
});
