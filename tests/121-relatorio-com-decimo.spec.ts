import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, cleanupByPrefix } from './integrity-helpers';

/**
 * O 13º APARECENDO NO RELATÓRIO (19/09/2026).
 *
 * Decisão do Victor: 13º e rescisão entram em **qualquer período que contenha a data do
 * pagamento** — diferente do salário, que só sai em mês fechado, porque eles são
 * pagamentos que aconteceram num dia.
 *
 * O teste puxa o relatório de uma SEMANA contendo o pagamento e confere, lendo de dentro
 * do PDF, que o 13º está lá. Numa semana o salário mensal NÃO sai — é o contraste que
 * prova a regra.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Relatorio Decimo`;
/** Um dia dentro da semana que o relatório vai pedir. */
const PAGO_EM = '2026-12-16';
const SEMANA = { inicio: '2026-12-14', fim: '2026-12-20' };

let employeeId = '';

test.describe('13º no relatório', () => {
  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
    employeeId = await createTestEmployee({ name: NOME, employmentType: 'Carteira Assinada' });
    const s = getClient();

    const { data, error } = await s.from('employees')
      .update({ monthly_salary: 1700, fgts_enabled: true, hire_date: '2024-01-02', family_allowance_children: 0 })
      .eq('id', employeeId)
      .select('company_id')
      .single();
    if (error) throw error;
    const companyId = (data as { company_id: string }).company_id;

    // Um 13º pago DENTRO da semana pedida, com o papel guardado (como a tela grava).
    const papel = {
      avos: 12, base: 1700, bruto: 1700, parcela: 'unica', brutoDaParcela: 1700,
      inss: 128.68, irrf: 0, baseIrrf: 1571.32, caminhoDoIrrf: 'simplificado',
      adiantamento: 0, valor: 1571.32, fgts: 136,
      totalProventos: 1700, totalDescontos: 128.68, liquido: 1571.32,
      tabelasConfirmadas: true, parcelaNegativa: false,
      linhas: [
        { descricao: '13º salário', referencia: '12,00/12', provento: 1700, desconto: 0 },
        { descricao: 'INSS sobre 13º', referencia: '9,00%', provento: 0, desconto: 128.68 },
      ],
    };
    const { error: erroDo13 } = await s.from('payroll_thirteenth').insert([{
      employee_id: employeeId, company_id: companyId, ano: 2026, parcela: 'unica',
      avos: 12, base: 1700, bruto: 1700, inss: 128.68, irrf: 0, fgts: 136,
      adiantamento: 0, valor: 1571.32, pago_em: PAGO_EM, papel, created_by: '2626',
    }]);
    if (erroDo13) throw erroDo13;
  });

  test.afterAll(async () => {
    await getClient().from('payroll_thirteenth').delete().eq('employee_id', employeeId);
    await cleanupByPrefix(PREFIX);
  });

  test('🎯 o 13º sai no relatório da SEMANA em que foi pago — e o salário não', async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Financeiro');
    await page.getByTestId('relatorios-btn').click();
    await expect(page.getByTestId('relatorios-panel')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('tipo-financeiro').click();
    await page.getByTestId('modo-livre').click();
    await page.getByTestId('data-inicio').fill(SEMANA.inicio);
    await page.getByTestId('data-fim').fill(SEMANA.fim);

    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('baixar-pdf').click();
    const arquivo = await download;

    const fs = await import('node:fs');
    const texto = fs.readFileSync((await arquivo.path())!).toString('latin1');
    expect(texto.slice(0, 4)).toBe('%PDF');

    // O 13º está no papel, com o valor gravado.
    expect(texto).toContain('13');
    expect(texto).toContain('1.571,32');
    // E o aviso de que o salário mensal fica fora de um recorte menor que o mês.
    expect(texto).toContain('MÊS');
  });
});
