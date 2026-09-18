import { test, expect, Page } from '@playwright/test';
import { ADMIN, MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { createTestEmployee, cleanupByPrefix } from './integrity-helpers';

/**
 * FOLHA DE CARTEIRA ASSINADA — a ficha e a configuração (18/09/2026).
 *
 * Etapa 3 do PLANO_FINANCEIRO_2026-09.md. Prova as três coisas que a leva entregou:
 *   1. o bloco "Folha" grava de verdade e volta preenchido depois de recarregar;
 *   2. quem NÃO tem a permissão nova não enxerga o bloco (decisão do Victor: salário
 *      é permissão própria, separada de "editar funcionário");
 *   3. a configuração por ano (FGTS, cota e teto) aparece nas Configurações.
 *
 * O 9999 é usado de propósito no teste da permissão: ele edita funcionário desde
 * sempre, e é justamente quem NÃO pode ver salário até o Victor ligar na tela.
 */

const PREFIX = TEST_EMPLOYEE_NAME_PREFIX; // 'PW Test '
const NOME = `${PREFIX}Folha CLT`;

/**
 * CPF sintético VÁLIDO (mesmo algoritmo de `src/utils/validation.ts`, igual ao spec 39).
 *
 * Por que precisa: o `createTestEmployee` usa um CPF só ÚNICO, não válido — e o
 * formulário valida o dígito antes de salvar. Sem isto, o "Atualizar" morre em
 * "CPF inválido" e nada é gravado (foi assim que este teste caiu na 1ª rodada).
 */
function cpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 1) % 10;
  const digito = (nums: number[]): number => {
    const soma = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0);
    const d = (soma * 10) % 11;
    return d === 10 ? 0 : d;
  };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}

const CPF = cpfValido();

/**
 * Abre o formulário de edição daquele funcionário pela lista.
 *
 * A busca espera por CONDIÇÃO (o campo existir) e não por tempo: a aba carrega ~98
 * funcionários e, com o servidor frio, o `fill` direto estourava os 10s do clique —
 * a mesma armadilha que custou a rodada do `tests/57` em 15/09.
 */
async function abrirEdicao(page: Page, nome: string): Promise<void> {
  const busca = page.getByPlaceholder('Buscar por nome ou CPF...');
  await expect(busca).toBeVisible({ timeout: 60_000 });
  await busca.fill(nome);
  const linha = page.locator('tr, li').filter({ hasText: nome }).first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await linha.getByTitle('Editar').first().click();
  await expect(page.getByRole('heading', { name: /Editar Funcionário/i })).toBeVisible({ timeout: 15_000 });
}

/** O bloco da folha é ancorado por testid: "Número" sozinho casa com 4 campos da ficha. */
const blocoDaFolha = (page: Page) => page.getByTestId('bloco-folha');

test.describe('Folha CLT — ficha do funcionário e configuração', () => {
  let employeeId: string;

  test.beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
    employeeId = await createTestEmployee({ name: NOME, employmentType: 'Carteira Assinada' });
    // O helper grava um CPF só único; a tela exige um VÁLIDO pra deixar salvar.
    await getClient().from('employees').update({ cpf: CPF }).eq('id', employeeId);
  });

  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test('2626 preenche salário, filhos e FGTS; grava no banco e volta na tela', async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Funcionários');
    await abrirEdicao(page, NOME);

    const bloco = blocoDaFolha(page);
    await expect(bloco).toBeVisible();

    await bloco.getByPlaceholder('Ex.: 1700,00').fill('1700,00');
    // `getByPlaceholder` casa por PEDAÇO: '0' pegava também 'Ex.: 1700,00' e '4141-40'.
    await bloco.getByPlaceholder('0', { exact: true }).fill('1');
    await bloco.getByPlaceholder('Número').fill('1234567');
    await bloco.getByPlaceholder('Série da CTPS').fill('0001');
    await bloco.getByPlaceholder('Ex.: 4141-40').fill('4141-40');

    const fgts = bloco.getByRole('checkbox');
    if (!(await fgts.isChecked())) await fgts.check();

    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible({ timeout: 20_000 });

    // O que interessa é o que ficou GRAVADO, não o que a tela disse.
    const { data, error } = await getClient()
      .from('employees')
      .select('monthly_salary, family_allowance_children, ctps_number, ctps_series, cbo, fgts_enabled')
      .eq('id', employeeId)
      .single();
    expect(error).toBeNull();
    expect(Number(data!.monthly_salary)).toBe(1700);
    expect(data!.family_allowance_children).toBe(1);
    expect(data!.ctps_number).toBe('1234567');
    expect(data!.ctps_series).toBe('0001');
    expect(data!.cbo).toBe('4141-40');
    expect(data!.fgts_enabled).toBe(true);

    // ...e que volta preenchido: é o caminho de leitura, que já quebrou em 03/09 por
    // coluna sem permissão de SELECT (403 silencioso).
    await page.reload();
    await goToTab(page, 'Funcionários');
    await abrirEdicao(page, NOME);
    await expect(blocoDaFolha(page).getByPlaceholder('Ex.: 1700,00')).toHaveValue('1700,00');
    await expect(blocoDaFolha(page).getByPlaceholder('Ex.: 4141-40')).toHaveValue('4141-40');
  });

  test('9999 edita funcionário mas NÃO vê o bloco da folha (permissão própria)', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Funcionários');
    await abrirEdicao(page, NOME);

    // O formulário abriu (ele edita ficha), mas o salário não está ali.
    await expect(page.getByRole('heading', { name: /Editar Funcionário/i })).toBeVisible();
    await expect(blocoDaFolha(page)).toHaveCount(0);
    await expect(page.getByPlaceholder('Ex.: 1700,00')).toHaveCount(0);
  });

  test('a configuração da folha do ano aparece nas Configurações', async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Admin');

    // A aba Admin é protegida por senha própria (`verifyAdminSecret`) — sem destravar,
    // nenhuma seção dela existe no DOM. Mesma senha usada pelo `tests/12`.
    // A aba é `lazy`: sem ESPERAR, o `isVisible` responde "não" antes de ela montar e o
    // teste seguia com a tela de senha na frente (o botão "Entrar" ficava desabilitado).
    const senha = page.getByPlaceholder('Senha');
    await senha.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined);
    if (await senha.isVisible().catch(() => false)) {
      await senha.fill('Clayton2024');
      const entrar = page.getByRole('button', { name: 'Entrar' });
      await expect(entrar).toBeEnabled();
      await entrar.click();
      await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toHaveCount(0, { timeout: 30_000 });
    }

    const ano = new Date().getFullYear();
    const titulo = page.getByRole('heading', { name: new RegExp(`Folha \\(carteira assinada\\) — ${ano}`) });
    // Esperar ANTES de rolar: a aba Admin monta em partes e o `scrollIntoViewIfNeeded`
    // estoura em 10s se o elemento ainda não existe (foi assim que este teste caiu).
    await expect(titulo).toBeVisible({ timeout: 60_000 });
    await titulo.scrollIntoViewIfNeeded();

    // Os valores semeados pela migration, lidos do banco (não chumbados na tela).
    await expect(page.getByPlaceholder('8')).toHaveValue('8', { timeout: 20_000 });
    await expect(page.getByPlaceholder('67,54')).toHaveValue('67,54');
    await expect(page.getByPlaceholder('1906,04')).toHaveValue('1906,04');
  });
});
