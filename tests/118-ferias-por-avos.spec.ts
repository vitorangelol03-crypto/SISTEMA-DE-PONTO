import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, cleanupByPrefix } from './integrity-helpers';

/**
 * FÉRIAS POR AVOS — a tela do direito adquirido (19/09/2026).
 *
 * Prova as três coisas que fazem esta tela existir:
 *   1. quem já fechou período aquisitivo aparece com os dias a tirar;
 *   2. quem passou do prazo aparece como VENCIDA — a lei manda pagar em dobro, e é o
 *      erro mais caro que uma folha pequena comete sem ver;
 *   3. quem não tem data de admissão na ficha NÃO ganha um número inventado (decisão
 *      do Victor), e sim uma lista dizendo o que falta preencher.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const VENCIDA = `${PREFIX}Ferias Vencida`;
const EM_DIA = `${PREFIX}Ferias Em Dia`;
const SEM_DATA = `${PREFIX}Ferias Sem Data`;

const ids: Record<string, string> = {};

async function abrirFerias(page: Page): Promise<void> {
  await page.getByTestId('ferias-btn').click();
  await expect(page.getByTestId('ferias-panel')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('ferias-calcular').click();
  // Espera por CONDIÇÃO: a linha de quem tem data aparecer.
  await expect(page.locator('tr').filter({ hasText: EM_DIA })).toBeVisible({ timeout: 90_000 });
}

const linha = (page: Page, nome: string) => page.locator('tr').filter({ hasText: nome }).first();

test.describe('Férias — o direito adquirido', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
    const s = getClient();

    for (const [nome, admissao] of [
      // Admitida há mais de 2 anos e nunca tirou: o 1º período venceu.
      [VENCIDA, '2023-01-10'],
      // Admitida há pouco mais de 1 ano: fechou 1 período, prazo ainda longe.
      [EM_DIA, '2025-06-10'],
      // Sem data: não pode virar número.
      [SEM_DATA, null],
    ] as Array<[string, string | null]>) {
      const id = await createTestEmployee({ name: nome, employmentType: 'Carteira Assinada' });
      ids[nome] = id;
      const patch: Record<string, unknown> = { monthly_salary: 1700, fgts_enabled: true };
      if (admissao) patch.hire_date = admissao;
      const { error } = await s.from('employees').update(patch).eq('id', id);
      if (error) throw error;
    }
  });

  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');
  });

  test('🎯 quem fechou período aquisitivo tem dias para tirar', async ({ page }) => {
    await abrirFerias(page);
    const l = linha(page, EM_DIA);
    // Admitida em 10/06/2025: um período fechado = 30 dias, nada tirado.
    await expect(l).toContainText('10/06/2025');
    await expect(l.getByTestId('ferias-saldo')).toHaveText('30');
  });

  test('🎯 férias VENCIDA aparece em destaque e no alerta do topo', async ({ page }) => {
    await abrirFerias(page);
    await expect(page.getByTestId('ferias-vencidas')).toBeVisible();
    await expect(page.getByTestId('ferias-vencidas')).toContainText(/pagar em dobro/i);

    const l = linha(page, VENCIDA);
    await expect(l).toContainText('⚠');
    // Admitida 10/01/2023: o 1º período fechou 09/01/2024, prazo até 09/01/2025.
    await expect(l).toContainText('09/01/2025');
  });

  test('🎯 sem data de admissão, o sistema NÃO inventa — pede a data', async ({ page }) => {
    await abrirFerias(page);
    const aviso = page.getByTestId('ferias-sem-data');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(SEM_DATA);
    await expect(aviso).toContainText(/Data de Admiss/i);

    // E ela não aparece na tabela com um número qualquer.
    await expect(page.locator('tr').filter({ hasText: SEM_DATA })).toHaveCount(0);
  });

  test('férias já lançadas abatem do saldo', async ({ page }) => {
    const s = getClient();
    const { data: emp } = await s.from('employees').select('company_id').eq('id', ids[EM_DIA]).single();
    const companyId = (emp as { company_id: string }).company_id;

    // 10 dias de férias tirados.
    const { error } = await s.from('employee_vacations').insert([{
      employee_id: ids[EM_DIA],
      company_id: companyId,
      start_date: '2026-08-01',
      end_date: '2026-08-10',
      created_by: '2626',
    }]);
    if (error) throw error;

    try {
      await abrirFerias(page);
      await expect(linha(page, EM_DIA).getByTestId('ferias-saldo')).toHaveText('20');
    } finally {
      await s.from('employee_vacations').delete().eq('employee_id', ids[EM_DIA]);
    }
  });
});
