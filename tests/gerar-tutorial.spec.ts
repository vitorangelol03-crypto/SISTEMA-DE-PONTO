import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, insertPaymentRow, cleanupByPrefix } from './integrity-helpers';

/**
 * GERADOR DO TUTORIAL EM PDF (20/09/2026) — não é um teste.
 *
 * ⚠️ As telas são capturadas em JPEG, não PNG: em PNG o tutorial saiu com **9,6 MB**,
 * que é grande demais para um guia que a pessoa vai abrir no celular. Em JPEG de
 * qualidade 72 a leitura continua nítida e o arquivo cabe.
 *
 * Pedido do Victor: um tutorial curto, com telas de verdade e exemplos, pra leigo
 * entender as funções novas da folha.
 *
 * Só roda com `GERAR_TUTORIAL=1` — fora isso fica de fora da suíte, porque gerar um PDF
 * a cada rodada de teste não serve pra nada.
 *
 *   GERAR_TUTORIAL=1 npx playwright test tests/gerar-tutorial.spec.ts --project=chromium
 *
 * As imagens são capturadas do sistema RODANDO, com um funcionário de exemplo que o
 * próprio gerador cria e apaga. Nenhuma tela é desenhada à mão: o que está no papel é o
 * que a pessoa vai ver.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX;
const NOME = `${PREFIX}Exemplo`;
const MES = { inicio: '2026-08-01', fim: '2026-08-31' };
const DIARIAS = ['2026-08-04', '2026-08-05'];

let employeeId = '';
const telas: Record<string, Buffer> = {};

function cpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every(d => d === base[0])) base[0] = (base[0] + 1) % 10;
  const digito = (nums: number[]): number => {
    const soma = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0);
    const d = (soma * 10) % 11;
    return d === 10 ? 0 : d;
  };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}

async function verFinanceiro(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Pagamentos$/ }).first().click();
  const de = page.locator('input[type="date"]').first();
  const ate = page.locator('input[type="date"]').nth(1);
  await expect(de).toBeVisible({ timeout: 60_000 });
  await de.fill(MES.inicio);
  await ate.fill(MES.fim);
  await ate.blur();
  await expect(page.locator('tr').filter({ hasText: NOME }).first()).toBeVisible({ timeout: 60_000 });
}

test.describe('Tutorial da folha', () => {
  test.skip(!process.env.GERAR_TUTORIAL, 'gerador — rode com GERAR_TUTORIAL=1');
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX, DIARIAS);
    employeeId = await createTestEmployee({
      name: NOME, employmentType: 'Carteira Assinada', functionRole: 'Triagem - Shopee',
    });
    const s = getClient();
    const { data, error } = await s.from('employees')
      .update({
        hire_date: '2024-05-10', cpf: cpfValido(),
        monthly_salary: 1700, family_allowance_children: 1, fgts_enabled: true,
      })
      .eq('id', employeeId).select('company_id').single();
    if (error) throw error;
    const companyId = (data as { company_id: string }).company_id;

    for (const dia of DIARIAS) await insertPaymentRow(employeeId, dia, { daily_rate: 100, total: 100 });
    await s.from('payroll_awards').insert([{
      employee_id: employeeId, company_id: companyId,
      data: MES.inicio, valor: 500, descricao: 'Meta de agosto', created_by: '2626',
    }]);
  });

  test.afterAll(async () => {
    const s = getClient();
    for (const t of ['payroll_awards', 'payroll_thirteenth', 'payroll_termination', 'employee_vacations']) {
      await s.from(t).delete().eq('employee_id', employeeId);
    }
    await cleanupByPrefix(PREFIX, DIARIAS);
  });

  test('captura as telas e monta o PDF', async ({ page }) => {
    await loginAs(page, MASTER_2626);

    // ── 1. A ficha, com o bloco Folha preenchido ──
    await goToTab(page, 'Funcionários');
    const busca = page.getByPlaceholder('Buscar por nome ou CPF...');
    await expect(busca).toBeVisible({ timeout: 60_000 });
    await busca.fill('Exemplo');
    const linhaFicha = page.locator('tr, li').filter({ hasText: NOME }).first();
    await expect(linhaFicha).toBeVisible({ timeout: 30_000 });
    await linhaFicha.getByTitle('Editar').first().click();
    const bloco = page.getByTestId('bloco-folha');
    await expect(bloco).toBeVisible({ timeout: 15_000 });
    await bloco.scrollIntoViewIfNeeded();
    telas.ficha = await bloco.screenshot({ type: 'jpeg', quality: 72 });

    // ── 2. A linha do Financeiro, mostrando o salário ──
    /**
     * Capturada no layout de CELULAR, de propósito.
     *
     * A linha da tabela do computador é larguíssima (nome, dias, faltas, erros, valor,
     * ações): encolhida para caber na largura da página, o texto vira formiga e não se
     * lê nada. Pego olhando a página renderizada, não o código. O cartão do celular
     * mostra a MESMA informação num bloco compacto e legível no papel.
     */
    await page.reload();
    await goToTab(page, 'Financeiro');
    await verFinanceiro(page);
    await page.setViewportSize({ width: 430, height: 900 });
    const cartao = page.locator('.md\\:hidden').locator('div').filter({ hasText: NOME }).first();
    await expect(cartao).toBeVisible({ timeout: 30_000 });
    telas.financeiro = await cartao.screenshot({ type: 'jpeg', quality: 72 });
    await page.setViewportSize({ width: 1280, height: 900 });

    // ── 3. O modal de premiação ──
    await page.locator('tr').filter({ hasText: NOME }).first().getByTestId('premiar-btn').click();
    await expect(page.getByTestId('modal-premiacao')).toBeVisible();
    telas.premiacao = await page.getByTestId('modal-premiacao').screenshot({ type: 'jpeg', quality: 72 });
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // ── 4. Férias ──
    await page.getByTestId('ferias-btn').click();
    await expect(page.getByTestId('ferias-panel')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('ferias-calcular').click();
    await expect(page.locator('tr').filter({ hasText: NOME }).first()).toBeVisible({ timeout: 90_000 });
    /**
     * A caixa "sem data de admissão" sai da FOTO, não da tela.
     *
     * Ela lista, pelo nome, todo mundo que ainda falta preencher — é a lista de
     * pendências do Victor, não material de ensino. Num tutorial ela só deixa a página
     * densa e espalha nomes num arquivo que pode ser compartilhado. O aviso sobre ela
     * está no TEXTO da página, que é onde ensina.
     */
    await page.getByTestId('ferias-sem-data')
      .evaluate(el => { (el as HTMLElement).style.display = 'none'; })
      .catch(() => { /* se ninguém estiver sem data, a caixa nem existe */ });
    telas.ferias = await page.getByTestId('ferias-panel').screenshot({ type: 'jpeg', quality: 72 });

    // ── 5. 13º ──
    await page.getByTestId('decimo-btn').click();
    await expect(page.getByTestId('decimo-panel')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('decimo-ano').fill('2026');
    await page.getByTestId('parcela-unica').click();
    await page.getByTestId('decimo-calcular').click();
    await expect(page.locator('tr').filter({ hasText: NOME })).toBeVisible({ timeout: 90_000 });
    telas.decimo = await page.getByTestId('decimo-panel').screenshot({ type: 'jpeg', quality: 72 });

    // ── 6. Rescisão, com a conta aberta ──
    await page.getByTestId('rescisao-btn').click();
    await expect(page.getByTestId('rescisao-panel')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('rescisao-busca').fill('Exemplo');
    await page.getByTestId('rescisao-pessoa').filter({ hasText: NOME }).first().click();
    await page.getByTestId('rescisao-data').fill('2026-08-31');
    await page.getByTestId('rescisao-fgts').fill('5000,00');
    await page.getByTestId('rescisao-calcular').click();
    await expect(page.getByTestId('rescisao-liquido')).toBeVisible({ timeout: 60_000 });
    telas.rescisao = await page.getByTestId('rescisao-panel').screenshot({ type: 'jpeg', quality: 72 });

    // ── Monta o PDF ──
    const { montarTutorialFolha } = await import('../src/utils/tutorialFolhaPdf');
    const fs = await import('node:fs');
    const pdf = montarTutorialFolha(
      Object.fromEntries(Object.entries(telas).map(([k, v]) => [k, `data:image/jpeg;base64,${v.toString('base64')}`])),
    );
    fs.writeFileSync('Tutorial-Folha-de-Pagamento.pdf', Buffer.from(pdf));

    const gerado = fs.readFileSync('Tutorial-Folha-de-Pagamento.pdf');
    expect(gerado.subarray(0, 4).toString()).toBe('%PDF');
    expect(gerado.length).toBeGreaterThan(50_000);
    console.log(`\n✅ Tutorial gerado: Tutorial-Folha-de-Pagamento.pdf (${Math.round(gerado.length / 1024)} KB)\n`);
  });
});
