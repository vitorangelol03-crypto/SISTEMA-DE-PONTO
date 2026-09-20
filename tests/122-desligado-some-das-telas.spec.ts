import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, insertPaymentRow, cleanupByPrefix } from './integrity-helpers';

/**
 * DESLIGADO SOME DAS TELAS — mas os dados antigos ficam (19/09/2026).
 *
 * O caso, nas palavras do Victor: *"se o funcionário trabalhou até o mês 8, ele recebeu
 * no mês 8, no mês 9 ele foi desligado, no mês 8 nos registros financeiros vai estar ele
 * lá, mas no mês 9 ele já está como desligado"*.
 *
 * Este spec percorre exatamente isso no navegador: agosto mostra, outubro não — e
 * outubro volta a mostrar se houver dinheiro lá.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Desligado`;
/**
 * Uma pessoa ATIVA com pagamento nos dois períodos.
 *
 * Ela é a âncora do teste: é a linha dela aparecendo que prova que a lista terminou de
 * recarregar para o período novo. Sem âncora, "o desligado sumiu" e "a lista ainda não
 * carregou" seriam indistinguíveis — e o teste passaria por engano.
 */
const ANCORA = `${PREFIX}Ancora Ativa`;
const SAIDA = '2026-09-15';

const AGOSTO = { inicio: '2026-08-01', fim: '2026-08-31' };
const OUTUBRO = { inicio: '2026-10-01', fim: '2026-10-31' };

let employeeId = '';
let ancoraId = '';

/** Entra na lista de pagamentos e recorta o período. */
async function verFinanceiro(page: Page, p: { inicio: string; fim: string }): Promise<void> {
  const de = page.locator('input[type="date"]').first();
  const ate = page.locator('input[type="date"]').nth(1);
  await expect(de).toBeVisible({ timeout: 60_000 });
  await de.fill(p.inicio);
  await ate.fill(p.fim);
  /**
   * ⚠️ O BLUR NÃO É ENFEITE. A tela só busca os dados do período novo quando o campo
   * PERDE o foco (`isEditingDate`, para não consultar o banco a cada tecla digitada).
   * O `fill()` deixa o cursor dentro do campo, então sem isto a lista continua sendo a
   * do período anterior — e o teste afirmaria coisas sobre a tela errada.
   *
   * Custou uma investigação: com a lista velha, "o desligado sumiu" e "os dados nem
   * foram buscados" davam exatamente o mesmo vermelho.
   */
  await ate.blur();
  // Espera por CONDIÇÃO: a ÂNCORA (pessoa ativa, com pagamento nos dois períodos)
  // aparecer é o sinal de que a lista terminou de recarregar para este período.
  const linhaDaAncora = page.locator('tr').filter({ hasText: ANCORA }).first();
  await expect(linhaDaAncora).toBeVisible({ timeout: 60_000 });
  // A âncora tem pagamento nos DOIS períodos: enquanto a lista for a antiga (ou não
  // tiver carregado), ela aparece zerada. Esperar o valor dela é o que prova que os
  // dados DESTE período chegaram.
  await expect(linhaDaAncora).not.toContainText('R$ 0,00', { timeout: 60_000 });
}

const linhaDaPessoa = (page: Page) => page.locator('tr, div').filter({ hasText: NOME });

test.describe('Desligado nas telas', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX, ['2026-08-10', '2026-10-10']);
    employeeId = await createTestEmployee({ name: NOME, employmentType: 'Diarista' });
    const s = getClient();
    const { error } = await s.from('employees')
      .update({ hire_date: '2025-01-02', termination_date: SAIDA, termination_reason: 'pedido-de-demissao' })
      .eq('id', employeeId);
    if (error) throw error;
    // Trabalhou e recebeu em AGOSTO — o dado antigo que tem que continuar aparecendo.
    await insertPaymentRow(employeeId, '2026-08-10', { daily_rate: 100, total: 100 });

    // A âncora: ativa, com pagamento nos DOIS períodos.
    ancoraId = await createTestEmployee({ name: ANCORA, employmentType: 'Diarista' });
    await insertPaymentRow(ancoraId, '2026-08-10', { daily_rate: 100, total: 100 });
    await insertPaymentRow(ancoraId, '2026-10-10', { daily_rate: 100, total: 100 });
  });

  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX, ['2026-08-10', '2026-10-10']);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
  });

  test('🎯 em AGOSTO ele continua na lista, com o que recebeu', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
    await verFinanceiro(page, AGOSTO);
    await expect(linhaDaPessoa(page).first()).toBeVisible({ timeout: 30_000 });
  });

  test('🎯 em OUTUBRO ele SOME — saiu em setembro e não tem nada lá', async ({ page }) => {
    await goToTab(page, 'Financeiro');
    await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
    await verFinanceiro(page, OUTUBRO);
    await expect(linhaDaPessoa(page)).toHaveCount(0);
    // E a âncora continua lá: o que sumiu foi o desligado, não a lista.
    await expect(page.locator('tr, div').filter({ hasText: ANCORA }).first()).toBeVisible();
  });

  test('🎯 mas volta a aparecer em OUTUBRO se tiver dinheiro lá', async ({ page }) => {
    // Um pagamento atrasado, lançado depois da saída: não pode sumir da tela.
    await insertPaymentRow(employeeId, '2026-10-10', { daily_rate: 100, total: 100 });

    // O teste confere o PRÓPRIO dado antes de olhar a tela: sem isto, "a tela escondeu"
    // e "o dado não existe" dão o mesmo vermelho e a investigação começa do lado errado.
    const { data: conferencia } = await getClient()
      .from('payments')
      .select('id, date, total, company_id')
      .eq('employee_id', employeeId)
      .eq('date', '2026-10-10');
    expect(conferencia, 'o pagamento de outubro tem que existir no banco').toHaveLength(1);

    try {
      await goToTab(page, 'Financeiro');
      await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
      await verFinanceiro(page, OUTUBRO);
      await expect(linhaDaPessoa(page).first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await getClient().from('payments').delete().eq('employee_id', employeeId).eq('date', '2026-10-10');
    }
  });

  test('🎯 no cadastro ele fica escondido até você pedir', async ({ page }) => {
    await goToTab(page, 'Funcionários');
    const busca = page.getByPlaceholder('Buscar por nome ou CPF...');
    await expect(busca).toBeVisible({ timeout: 60_000 });
    await busca.fill('Desligado');

    // Escondido por padrão — mesmo procurando pelo nome.
    await expect(page.locator('tr, li').filter({ hasText: NOME })).toHaveCount(0);

    // O botão diz quantos são, e traz eles.
    const botao = page.getByTestId('mostrar-desligados');
    await expect(botao).toBeVisible({ timeout: 15_000 });
    await expect(botao).toContainText('Mostrar desligados');
    await botao.click();
    await expect(page.locator('tr, li').filter({ hasText: NOME }).first()).toBeVisible({ timeout: 15_000 });

    // E some de novo ao desligar o botão.
    await botao.click();
    await expect(page.locator('tr, li').filter({ hasText: NOME })).toHaveCount(0);
  });
});
