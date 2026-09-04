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
  const aba = page.getByRole('button', { name: new RegExp(`^${tabName}$`) }).first();
  if (await aba.isVisible().catch(() => false)) {
    await aba.click();
    return;
  }
  const mais = page.getByTestId('abas-mais');
  if (await mais.count()) {
    await mais.click();
    await aba.waitFor({ state: 'visible', timeout: 5_000 });
  }
  await aba.click();
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
  await trigger.click();
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  await listbox.locator('button').filter({ hasText: targetName }).first().click();
  await expect(trigger).toContainText(new RegExp(targetName, 'i'), { timeout: 10_000 });
}
