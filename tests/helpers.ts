import { Page, expect } from '@playwright/test';

export const ADMIN = { id: '9999', password: '684171' };
export const SUPERVISOR = { id: '01', password: '9098' };
/** Mestre 2626 — único que acessa a aba Pagamentos Driver (senha fora do git). */
export const MASTER_2626 = { id: '2626', password: 'cdlogistica26' };
export const TEST_EMPLOYEE_CPF = '12232625613';
export const TEST_EMPLOYEE_CPF_MASKED = '122.326.256-13';

/**
 * `require_facial_clock`/`face_identify_default` são reais em produção (04/09/2026)
 * e a suíte tem vários arquivos escritos ANTES delas existirem, que travam se elas
 * estiverem ligadas (funcionário de teste sem rosto real / sem câmera em CI).
 *
 * 🔑 NUNCA desliga isso via UPDATE no banco — já causou incidente real 2x: um
 * processo de teste morto no meio (por algo fora do nosso controle — disco cheio
 * deixando tudo lento) deixou a validação de rosto+geo REALMENTE desligada em
 * produção por minutos, sem ninguém perceber na hora. Em vez disso, intercepta a
 * resposta da API só DENTRO do navegador deste teste — o banco real nunca muda,
 * então não existe "esquecer de restaurar": não há nada pra restaurar.
 */
export async function mockCompanyFacialFlags(
  page: Page,
  companyId: string,
  overrides: { require_facial_clock?: boolean; face_identify_default?: boolean },
): Promise<void> {
  await page.route('**/rest/v1/companies*', async (route) => {
    const response = await route.fetch();
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      await route.fulfill({ response });
      return;
    }
    const patch = (row: Record<string, unknown>) => {
      if (row?.id === companyId) Object.assign(row, overrides);
      return row;
    };
    const patched = Array.isArray(body) ? body.map((r) => patch(r as Record<string, unknown>)) : patch(body as Record<string, unknown>);
    await route.fulfill({ response, json: patched });
  });
}

export async function mockFacialFlagsOff(page: Page, companyIds: string[]): Promise<void> {
  for (const id of companyIds) {
    await mockCompanyFacialFlags(page, id, { require_facial_clock: false, face_identify_default: false });
  }
}

/**
 * Faz login no painel de supervisor. Assume que estamos em `/`.
 *
 * Admin (id === '9999') passa por uma tela de seleção de empresa após o
 * login (sub-fase 1.10). Os testes default selecionam Caratinga.
 */
export async function loginAs(page: Page, user: { id: string; password: string }) {
  await page.goto('/');
  await page.locator('#id').fill(user.id);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Admin/mestre: lidar com CompanySelector — clica em Caratinga (empresa default dos testes).
  if (user.id === '9999' || user.id === '2626') {
    const caratingaCard = page.getByText('Caratinga', { exact: false }).first();
    await expect(caratingaCard).toBeVisible({ timeout: 10_000 });
    await caratingaCard.click();
  }

  // Sanity check: chegou ao painel (aparece botão "Ponto" do TabNavigation).
  // exact:true pra escapar strict mode (heading "Controle de Ponto" também
  // bate em /Ponto/ regex — visível em prod URL com latência maior).
  await expect(page.getByRole('button', { name: 'Ponto', exact: true })).toBeVisible({ timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /Sair/ }).first().click();
  await expect(page.locator('#id')).toBeVisible({ timeout: 10_000 });
}

/**
 * Vai pra uma aba. 06/08/2026: no COMPUTADOR as abas que não cabem na largura
 * passaram a viver no menu "Mais" (no celular/tablet a barra rola e todas
 * continuam visíveis). O helper tenta o caminho normal e, só se a aba não
 * estiver na barra, abre o menu — nenhuma asserção foi afrouxada, é a mesma
 * aba, no mesmo clique que uma pessoa daria.
 */
export async function goToTab(page: Page, tabName: string) {
  // 09/09/2026 — "Pagamento C6" deixou de ser aba: virou botão dentro do Financeiro, que
  // abre a mesma tela num popup já com a prévia pronta. O desvio fica AQUI de propósito:
  // os ~20 usos espalhados pelos specs continuam dizendo "vá pro Pagamento C6" e o helper
  // sabe como chegar lá agora. Quem testa a ausência da ABA faz isso explicitamente.
  if (/^Pagamento C6$/.test(tabName)) {
    await goToTab(page, 'Financeiro');
    const abrir = page.getByRole('button', { name: /^Gerar arquivo de pagamento$/ }).first();
    await abrir.waitFor({ state: 'visible', timeout: 10_000 });
    await abrir.click();
    // O popup carrega a prévia sozinho; espera o título dele aparecer.
    await page.getByRole('heading', { name: /Arquivo de pagamento/ }).first()
      .waitFor({ state: 'visible', timeout: 15_000 });
    return;
  }

  // Um popup aberto (ex.: o do Pagamento C6) cobre a barra de abas com o overlay — o
  // clique na próxima aba iria parar nele. Fecha antes de navegar.
  const fecharPopup = page.getByRole('button', { name: /^Fechar$/ }).first();
  if (await fecharPopup.isVisible().catch(() => false)) {
    await fecharPopup.click().catch(() => undefined);
    await fecharPopup.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  }

  const aba = page.getByRole('button', { name: new RegExp(`^${tabName}$`) }).first();
  if (await aba.isVisible().catch(() => false)) {
    await aba.click();
    await depoisDeAbrirAAba(page, tabName);
    return;
  }
  const mais = page.getByTestId('abas-mais');
  if (await mais.count()) {
    await mais.click();
    await aba.waitFor({ state: 'visible', timeout: 5_000 });
  }
  await aba.click();
  await depoisDeAbrirAAba(page, tabName);
}

/**
 * 11/09/2026 — o Financeiro deixou de abrir na LISTA DE PAGAMENTOS e passou a
 * abrir no HISTÓRICO (as gavetas de mês/semana), que virou a porta de entrada
 * por pedido do Victor. Os ~10 specs que dizem `goToTab('Financeiro')` querem
 * dizer "vá pra lista de pagamentos" — o desvio fica AQUI, como já acontece com
 * o "Pagamento C6", em vez de espalhar um clique a mais por todos eles.
 *
 * ⚠️ Precisa ser chamado nos DOIS caminhos de saída do `goToTab` (a aba visível
 * volta cedo). Na primeira tentativa isto ficou só no fim do arquivo e nunca
 * rodava — os 5 testes do spec 07 quebraram apontando pra isso.
 *
 * Quem testa a porta de entrada NOVA (spec 112) não usa este helper.
 */
async function depoisDeAbrirAAba(page: Page, tabName: string): Promise<void> {
  if (!/^Financeiro$/.test(tabName)) return;
  const listaDePagamentos = page.getByRole('button', { name: /^Pagamentos$/ }).first();
  // ESPERAR, não perguntar: a aba carrega os dados antes de desenhar os botões.
  await listaDePagamentos.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
  if (await listaDePagamentos.isVisible().catch(() => false)) {
    await listaDePagamentos.click();
    // Só volta quando a lista está de fato na tela (os filtros de data são dela).
    await page.locator('input[type="date"]').first()
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
  }
}

/**
 * Troca empresa via dropdown CompanySwitcher (admin vê todas).
 * Aguarda o display_name no header refletir a nova empresa.
 *
 * Pré-requisito: admin logado E availableCompanies.length > 1
 * (caso contrário CompanySwitcher não renderiza no header).
 */
export async function switchCompany(page: Page, targetName: 'Caratinga' | 'Ponte Nova'): Promise<void> {
  const trigger = page.locator('button[aria-haspopup="listbox"]').first();
  await expect(trigger, 'o trocador de empresa tem que estar na tela')
    .toBeVisible({ timeout: 30_000 });
  await trigger.click();
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 15_000 });
  await listbox.locator('button').filter({ hasText: targetName }).first().click();

  /* 🔴 Trocar de empresa RECARREGA a página (12/09/2026).
     O botão some junto com a tela velha e só volta quando a nova monta. Com 10s
     o helper desistia no meio da recarga e o erro saía como "element(s) not
     found" — parecia que o trocador tinha sumido do produto, quando era só a
     página voltando. Derrubou os testes 3 e 9 do spec 26 com a máquina
     carregada (o robô da Shopee roda junto).
     Espera o botão VOLTAR e só então confere o nome: continua sendo espera por
     condição, e se a empresa não trocasse de verdade o texto não bateria. */
  await expect(trigger, 'a tela tem que voltar depois da recarga')
    .toBeVisible({ timeout: 60_000 });
  await expect(trigger).toContainText(new RegExp(targetName, 'i'), { timeout: 30_000 });
}

/**
 * Leva a tela pública do ponto até o campo de CPF, e devolve ele.
 *
 * 🔴 POR QUE PRECISA DISTO (12/09/2026). Desde `cad2c39` (04/09, "ponto sem CPF —
 * reconhecimento facial 1:N direto na câmera"), o `/clock` NÃO abre mais no CPF:
 * abre em "Preparando reconhecimento… Carregando câmera", e o CPF fica atrás do
 * botão **"Prefere digitar CPF e senha?"**.
 *
 * Os testes que iam direto ao `input[placeholder="000.000.000-00"]` falhavam de
 * dois jeitos, os dois confusos: `locator.fill: Timeout` (o campo nem existia) ou
 * "element was detached from the DOM" (o campo existia por um instante e a tela
 * trocava pra facial embaixo do teste). O produto está certo — o teste é que
 * ficou pra trás.
 *
 * O clique é CONDICIONAL de propósito: a facial só aparece quando a empresa tem
 * `face_identify_default` ligado. Onde não tem, a tela já abre no CPF e este
 * helper não faz nada além de esperar o campo.
 */
export async function irAoCampoDeCpfDoPonto(page: Page) {
  const cpf = page.locator('input[placeholder="000.000.000-00"]');
  const atalho = page.getByRole('button', { name: /Prefere digitar CPF e senha/i });

  // Espera a tela decidir o que é: ou já veio o CPF, ou veio a facial.
  await expect(cpf.or(atalho).first(), 'a tela do ponto tem que carregar')
    .toBeVisible({ timeout: 30_000 });
  if (await atalho.isVisible().catch(() => false)) await atalho.click();

  // E espera o campo ficar ESTÁVEL: sem isto o `fill` pega o campo no meio da
  // troca de tela e morre com "element was detached from the DOM".
  await expect(cpf).toBeVisible({ timeout: 15_000 });
  await expect(cpf).toBeEditable({ timeout: 15_000 });
  return cpf;
}
