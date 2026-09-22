import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee } from './integrity-helpers';

/**
 * "O QUE FALTA PRA FOLHA SAIR" — o cartão que quebra o silêncio (22/09/2026).
 *
 * A folha é honesta e calada: sem salário na ficha a pessoa não ganha linha nenhuma; sem
 * data de admissão o direito de férias não é calculado. Quem abre o Financeiro vê "não tem
 * nada" em vez de "falta preencher" — e hoje são **14 de 14** fichas de carteira assinada
 * de Caratinga sem salário, além de 3 pessoas de Ponte Nova batendo ponto com o cadastro
 * ainda `pending`.
 *
 * Este spec não depende do dado real (que muda assim que o Victor preencher): ele cria as
 * duas situações com fixture própria e confere que a tela ACUSA cada uma, com nome.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const RUN = Date.now().toString(36);
const SEM_SALARIO = `${PREFIX}FolhaSemSalario ${RUN}`;
const PENDENTE = `${PREFIX}FolhaPendente ${RUN}`;

const criados: string[] = [];

test.describe('Pendências da folha no Financeiro', () => {
  test.beforeAll(async () => {
    const s = getClient();

    // 1) Carteira assinada, cadastro APROVADO e sem salário: a folha não sai pra ela.
    const semSalario = await createTestEmployee({ name: SEM_SALARIO, employmentType: 'Carteira Assinada' });
    criados.push(semSalario);
    const { error: e1 } = await s.from('employees')
      .update({ registration_status: 'approved', monthly_salary: null, hire_date: null })
      .eq('id', semSalario);
    if (e1) throw e1;

    // 2) Carteira assinada com o cadastro ainda PENDENTE (o caso de Ponte Nova): pode estar
    //    batendo ponto todo dia e não entra em folha nenhuma.
    const pendente = await createTestEmployee({ name: PENDENTE, employmentType: 'Carteira Assinada' });
    criados.push(pendente);
    const { error: e2 } = await s.from('employees')
      .update({ registration_status: 'pending' })
      .eq('id', pendente);
    if (e2) throw e2;
  });

  test.afterAll(async () => {
    const s = getClient();
    for (const id of criados) await s.from('employees').delete().eq('id', id);
  });

  test('🎯 o cartão acusa quem está sem salário E quem está com cadastro pendente', async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');

    // O cartão fica fora do seletor de visão: aparece na tela que abre por padrão.
    const cartao = page.getByTestId('folha-pendencias');
    await expect(cartao).toBeVisible({ timeout: 60_000 });
    await expect(cartao).toContainText(/Falta preencher a ficha de \d+ pessoas?/);
    await expect(cartao).toContainText('Sem salário na ficha');

    // Fechado ele é um resumo; aberto, tem nome e o EFEITO de cada falta.
    await cartao.getByRole('button').first().click();
    await expect(cartao).toContainText(SEM_SALARIO, { timeout: 30_000 });
    await expect(cartao).toContainText(PENDENTE);
    await expect(cartao).toContainText(/A folha do mês NÃO sai/);
    await expect(cartao).toContainText(/cadastro ainda NÃO aprovado/i);

    // E diz onde resolver, em português de gente.
    await expect(cartao).toContainText(/Funcionários/);
  });

  test('🎯 preencher o salário tira a pessoa da lista de "sem salário"', async ({ page }) => {
    test.setTimeout(180_000);
    // A prova de que o aviso é vivo: some sozinho quando o dado entra.
    const { error } = await getClient().from('employees')
      .update({ monthly_salary: 2200, hire_date: '2025-05-02', fgts_enabled: true })
      .eq('id', criados[0]);
    if (error) throw error;

    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');

    const cartao = page.getByTestId('folha-pendencias');
    await expect(cartao).toBeVisible({ timeout: 60_000 });
    await cartao.getByRole('button').first().click();
    // O pendente continua acusado; o que foi preenchido saiu da lista de sem salário.
    await expect(cartao).toContainText(PENDENTE, { timeout: 30_000 });
    const texto = await cartao.innerText();
    const blocoSemSalario = texto.split('Sem salário na ficha')[1]?.split('Cadastro')[0] ?? '';
    expect(blocoSemSalario).not.toContain(SEM_SALARIO);
  });
});
