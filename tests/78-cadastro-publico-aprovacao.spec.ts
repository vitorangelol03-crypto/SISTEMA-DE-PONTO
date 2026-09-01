import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { validateCPF } from '../src/utils/validation';

/**
 * E2E — CADASTRO PÚBLICO DE FUNCIONÁRIO + APROVAÇÃO DE CADASTRO (26/08/2026,
 * pedido do Victor):
 *
 *   "vamos fazer uma nova aba... vai ter um link ali, esse link vai gerar
 *   uma página pra cadastrar novos funcionários, sem precisar entrar no
 *   sistema... nome completo, CPF, telefone e chave PIX obrigatórios...
 *   todo funcionário fica pendente... continua batendo ponto... se for
 *   recusado, é bloqueado."
 *
 * O que este teste prova, ponta a ponta, no navegador real:
 *   1) a página pública /cadastro?empresa=... aceita o cadastro sem login;
 *   2) o funcionário cadastrado aparece "Pendente" na aba Funcionários;
 *   3) aprovar não muda o comportamento de bater ponto (chega no setup de PIN);
 *   4) recusar bloqueia no /clock com mensagem clara — mesmo sem PIN configurado.
 *
 * 2ª leva (26/08): todo cadastro por este link entra como Diarista, na
 * função que o candidato escolhe numa lista das funções já usadas na
 * empresa (não texto livre) — prova que grava certo e aparece na aba.
 *
 * 3ª leva (01/09/2026, pedido do Victor): a aba "Aprovação de Cadastro"
 * separada foi removida — tudo isso agora vive embutido na aba
 * "Funcionários" (badge de status + botões Aprovar/Recusar na própria
 * lista), exclusivo do 2626, igual antes.
 */

const RUN = Date.now().toString(36);
const NOME_APROVADO = `${TEST_EMPLOYEE_NAME_PREFIX}CadastroOk ${RUN}`;
const NOME_RECUSADO = `${TEST_EMPLOYEE_NAME_PREFIX}CadastroNo ${RUN}`;

/** Gera um CPF com dígitos verificadores válidos (Mod 11), único por seed. */
function validCpf(seed: number): string {
  const base = String(100000000 + (seed % 799999999)).padStart(9, '0').slice(0, 9);
  const digits = base.split('').map(Number);
  const calcDigit = (arr: number[], factorStart: number) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i] * (factorStart - i);
    let d = (sum * 10) % 11;
    if (d === 10) d = 0;
    return d;
  };
  const d1 = calcDigit(digits, 10);
  const d2 = calcDigit([...digits, d1], 11);
  return base + String(d1) + String(d2);
}

const CPF_APROVADO = validCpf(Date.now());
const CPF_RECUSADO = validCpf(Date.now() + 7);

// Função real já usada por dezenas de funcionários da Caratinga — não é
// dado de teste, só reaproveita o que já existe pro <select> oferecer.
const FUNCAO_TRIAGEM = 'Triagem - Shopee';

test.describe('Cadastro público + Aprovação de Cadastro', () => {
  test.beforeAll(() => {
    expect(validateCPF(CPF_APROVADO)).toBe(true);
    expect(validateCPF(CPF_RECUSADO)).toBe(true);
  });

  test('cadastro público → pendente → aprovado continua batendo ponto, recusado é bloqueado', async ({ page }) => {
    // 2ª leva (26/08): cada cadastro agora faz 1 chamada a mais (busca as
    // funções da empresa) + a própria validação de função no insert faz
    // outra consulta — o teste já fazia 2 cadastros + login + 2 decisões +
    // 2 checagens no /clock, e passou a estourar os 30s padrão.
    test.setTimeout(90_000);
    const supabase = getClient();
    const { data: caratinga, error } = await supabase
      .from('companies')
      .select('id')
      .ilike('display_name', '%caratinga%')
      .limit(1)
      .single();
    if (error || !caratinga) throw new Error('Empresa Caratinga não encontrada para o teste');
    const companyId = (caratinga as { id: string }).id;

    try {
      // ── 1) Cadastro público — dois funcionários novos, sem login ──
      for (const [nome, cpf] of [[NOME_APROVADO, CPF_APROVADO], [NOME_RECUSADO, CPF_RECUSADO]] as const) {
        await page.goto(`/cadastro?empresa=${companyId}`);
        await expect(page.getByText('Cadastro de Funcionário')).toBeVisible({ timeout: 10_000 });
        await page.getByPlaceholder('Seu nome completo').fill(nome);
        await page.getByPlaceholder('000.000.000-00').fill(cpf);
        await page.getByPlaceholder('(00) 00000-0000').fill('33999998888');
        await page.locator('select').nth(0).selectOption('Aleatória');
        await page.getByPlaceholder('Sua chave PIX').fill('a1b2c3d4-e5f6-0000-0000-000000000000');
        // Função: <select> com as funções já usadas na empresa (Caratinga já
        // tem "Triagem - Shopee" real, não é dado de teste).
        await expect(page.locator('select').nth(1)).toBeVisible({ timeout: 10_000 });
        await page.locator('select').nth(1).selectOption(FUNCAO_TRIAGEM);
        await page.getByRole('button', { name: 'Enviar cadastro' }).click();
        await expect(page.getByText('Cadastro enviado!')).toBeVisible({ timeout: 10_000 });
      }

      // Confere no banco: os dois entraram como pending, sem PIN configurado,
      // Diarista, na função escolhida (2ª leva 26/08).
      const { data: created } = await supabase
        .from('employees')
        .select('id, name, registration_status, pin_configured, phone, pix_type, employment_type, function_role')
        .in('name', [NOME_APROVADO, NOME_RECUSADO]);
      expect(created).toHaveLength(2);
      for (const emp of created ?? []) {
        const e = emp as { registration_status: string; employment_type: string; function_role: string };
        expect(e.registration_status).toBe('pending');
        expect(e.employment_type).toBe('Diarista');
        expect(e.function_role).toBe(FUNCAO_TRIAGEM);
      }

      // ── 2) Painel: aprovação embutida na aba Funcionários — EXCLUSIVA do 2626 (nem 9999 vê) ──
      await loginAs(page, MASTER_2626);
      await goToTab(page, 'Funcionários');
      await expect(page.getByRole('heading', { name: /Funcionários/ })).toBeVisible({ timeout: 10_000 });

      // Busca isola cada linha (lista tem centenas de funcionários reais).
      const search = page.getByPlaceholder('Buscar por nome ou CPF...');

      await search.fill(NOME_APROVADO);
      const rowAprovado = page.getByTestId('employee-row').filter({ hasText: NOME_APROVADO });
      await expect(rowAprovado).toBeVisible({ timeout: 10_000 });
      await expect(rowAprovado.getByText('Pendente')).toBeVisible();
      await expect(rowAprovado.getByText('Diarista')).toBeVisible();
      await rowAprovado.getByTitle('Aprovar cadastro').click();
      await expect(rowAprovado.getByText('Pendente')).toHaveCount(0, { timeout: 10_000 });

      await search.fill(NOME_RECUSADO);
      const rowRecusado = page.getByTestId('employee-row').filter({ hasText: NOME_RECUSADO });
      await expect(rowRecusado).toBeVisible({ timeout: 10_000 });
      await expect(rowRecusado.getByText('Pendente')).toBeVisible();
      await expect(rowRecusado.getByText('Diarista')).toBeVisible();
      // Recusa — confirma no dialog nativo (some da view "Ativos" ao virar rejected).
      page.once('dialog', d => d.accept());
      await rowRecusado.getByTitle('Recusar cadastro (bloqueia)').click();
      await expect(rowRecusado).toHaveCount(0, { timeout: 10_000 });

      const { data: afterDecision } = await supabase
        .from('employees')
        .select('name, registration_status')
        .in('name', [NOME_APROVADO, NOME_RECUSADO]);
      const byName = Object.fromEntries((afterDecision ?? []).map((e: { name: string; registration_status: string }) => [e.name, e.registration_status]));
      expect(byName[NOME_APROVADO]).toBe('approved');
      expect(byName[NOME_RECUSADO]).toBe('rejected');

      // ── 3) /clock: aprovado bate ponto normal, recusado é bloqueado ──
      await page.goto('/clock');
      await page.locator('input[placeholder="000.000.000-00"]').fill(CPF_RECUSADO);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByText(/cadastro foi recusado/i)).toBeVisible({ timeout: 10_000 });

      await page.goto('/clock');
      await page.locator('input[placeholder="000.000.000-00"]').fill(CPF_APROVADO);
      await page.getByRole('button', { name: 'Continuar' }).click();
      // Sem PIN configurado ainda: vai pro setup de senha — prova que NÃO foi bloqueado.
      await expect(page.getByText('Criar sua senha de acesso')).toBeVisible({ timeout: 10_000 });
    } finally {
      const { data: toClean } = await supabase
        .from('employees')
        .select('id')
        .in('name', [NOME_APROVADO, NOME_RECUSADO]);
      const ids = (toClean ?? []).map((e: { id: string }) => e.id);
      if (ids.length) {
        await supabase.from('attendance').delete().in('employee_id', ids);
        await supabase.from('employees').delete().in('id', ids);
      }
    }
  });
});
