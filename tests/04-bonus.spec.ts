import { test, expect, Page, Locator } from '@playwright/test';
import { ADMIN, MASTER_2626, loginAs, switchCompany } from './helpers';
import {
  cleanupAllTestArtifacts,
  readSuiteStart,
  ensureTestEmployee,
  deleteAttendanceForEmployee,
  getClient,
} from './cleanup';

/**
 * Bonificações (B / C1 / C2) — MODERNIZADO 2026-07-19.
 *
 * Por que mudou: a versão de maio aplicava/removia a bonificação do DIA REAL da
 * Caratinga (bonuses é por empresa+dia+tipo!) e usava Reset Geral como 9999 — que
 * de junho até 02/09/2026 foi exclusivo hardcoded do 2626 (virou permissão normal
 * depois, ver nota mais abaixo). Em dia com bônus real da equipe, o spec quebrava
 * E ameaçava dados reais.
 *
 * Molde novo: roda em PONTE NOVA com funcionário próprio (PW Test) — o bônus
 * aplicado/removido é sempre e somente o de teste.
 *
 * ⚠️ 17/08/2026 — Ponte Nova TEM uso real (achado ao rodar: 6 funcionários
 * batendo ponto de verdade no dia). O isolamento não vem de "empresa vazia" —
 * vem de `capturarPnPayments`/`restaurarPnPayments`/`wipePnDayState`
 * (fotografa os payments reais do dia antes, devolve exatamente como estava
 * depois) e de `openPontoPN` buscar só pelo nome do PW Test, que combinado à
 * trava de bonificação (17/08) exclui todo o resto da lista visível.
 *
 * 17/08/2026 — marcar presença era exclusivo do 2626 desde 13/08 (9999 não clicava
 * "Presente" na UI, botão desabilitado). Os testes que precisam de alguém presente
 * como PRÉ-CONDIÇÃO (não estão testando quem marca) inserem a presença direto no
 * banco (`markPresentViaDb`/`openPontoPNPresente`) — padrão mantido mesmo depois da
 * trava cair (02/09/2026), continua sendo a forma mais estável de montar a
 * pré-condição sem depender de UI. Login segue sendo de quem o teste realmente quer
 * verificar.
 */

const EMP_NAME = 'PW Test Bonus PN';
const EMP_CPF = '99904000104';
let empId = '';
let pnCompanyId = '';

const todayIso = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/**
 * Pagamentos de Ponte Nova do dia como estavam ANTES do teste.
 *
 * Por que isso existe (29/07): `applyBonus` aplica a bonificação do DIA na EMPRESA
 * inteira — não só no funcionário de teste. Numa rodada, isso lançou **R$ 10 em cada um
 * dos 5 funcionários REAIS de PN** (R$ 50) e o resíduo ficou no banco. Antes passava
 * despercebido porque o "Reset Geral" apagava o dia inteiro e levava o bônus junto;
 * com o Reset agora restrito ao que está visível (correção de 29/07), o resíduo apareceu.
 *
 * Capturar e restaurar (em vez de "apagar bônus do dia") é o que protege bonificação
 * LEGÍTIMA que o Victor tenha lançado hoje: ela volta exatamente como estava.
 */
let pnPaymentsAntes: Array<Record<string, unknown>> = [];

async function capturarPnPayments(): Promise<void> {
  const s = getClient();
  const { data } = await s.from('payments').select('*')
    .eq('company_id', pnCompanyId).eq('date', todayIso());
  pnPaymentsAntes = (data ?? []) as Array<Record<string, unknown>>;
}

/** Desfaz o que o teste espalhou pelos pagamentos de PN: apaga os criados, devolve os alterados. */
async function restaurarPnPayments(): Promise<void> {
  const s = getClient();
  const { data: agora } = await s.from('payments').select('id')
    .eq('company_id', pnCompanyId).eq('date', todayIso());
  const idsAntes = new Set(pnPaymentsAntes.map((p) => p.id as string));
  const criadosPeloTeste = (agora ?? [])
    .map((p: { id: string }) => p.id)
    .filter((id) => !idsAntes.has(id));
  if (criadosPeloTeste.length > 0) {
    await s.from('payments').delete().in('id', criadosPeloTeste);
  }
  if (pnPaymentsAntes.length > 0) {
    await s.from('payments').upsert(pnPaymentsAntes);
  }
}

/** Zera o estado do DIA em Ponte Nova (bônus do dia + ponto do funcionário de teste). */
async function wipePnDayState(): Promise<void> {
  const s = getClient();
  await s.from('bonuses').delete().eq('company_id', pnCompanyId).eq('date', todayIso());
  await deleteAttendanceForEmployee(empId);
  await restaurarPnPayments();
}

/** Login + troca pra Ponte Nova + aba Ponto + linha do funcionário de teste. */
async function openPontoPN(page: Page, user: { id: string; password: string }): Promise<Locator> {
  await loginAs(page, user);
  await switchCompany(page, 'Ponte Nova');
  await expect(page.getByRole('heading', { name: /Controle de Ponto/ })).toBeVisible();
  await page.getByRole('button', { name: /Atualizar/ }).click();
  await page.getByPlaceholder(/Buscar por nome ou CPF/).fill(EMP_NAME);
  const row = page.locator('tbody tr').filter({ hasText: EMP_NAME }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

async function markPresent(page: Page, row: Locator): Promise<void> {
  await row.getByRole('button', { name: /^Presente$/ }).click();
  await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * 17/08/2026 — marcar presença virou exclusivo do mestre 2626 (13/08), e o botão
 * "Presente" fica desabilitado pro 9999. Os testes deste arquivo que usam ADMIN
 * (9999) não estão testando QUEM marca — precisam de UM presente como pré-condição
 * pra testar bonificação. A marcação entra direto no banco (o que o 2626 faria),
 * e o teste loga como quem realmente quer verificar (9999, na maioria dos casos —
 * a regra de junho é justamente que aplicar bônus continua liberado pra ele).
 */
async function markPresentViaDb(): Promise<void> {
  const s = getClient();
  // company_id é NOT NULL com default apontando pra Caratinga — sem informar explicitamente,
  // a linha nasce na empresa errada e nunca aparece na tela de Ponte Nova (achado 17/08).
  const { error } = await s.from('attendance').upsert([{
    employee_id: empId,
    company_id: pnCompanyId,
    date: todayIso(),
    status: 'present',
    marked_by: '2626',
  }], { onConflict: 'employee_id,date' });
  if (error) throw error;
}

/** openPontoPN + presença já garantida via banco + confere que a UI mostra "Presente". */
async function openPontoPNPresente(page: Page, user: { id: string; password: string }): Promise<Locator> {
  await markPresentViaDb();
  const row = await openPontoPN(page, user);
  await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({ timeout: 10_000 });
  return row;
}

async function applyBonus(page: Page, type: 'B' | 'C1' | 'C2', amount: string): Promise<void> {
  await page.getByRole('button', { name: /^Bonificação$/ }).click();
  await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

  const typeSpan = page.getByText(`Tipo ${type}`, { exact: true });
  const block = typeSpan.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
  await block.locator('input[type="number"]').fill(amount);

  const applyBtn = page.getByRole('button', { name: `Aplicar ${type}`, exact: true });
  await expect(applyBtn).toBeEnabled({ timeout: 5_000 });
  await applyBtn.click();

  await expect(page.getByText(new RegExp(`Bonificação ${type} aplicada com sucesso`))).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /^Fechar$/ }).click();
  await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeHidden();
}

async function removeAllBonuses(page: Page): Promise<void> {
  const removeBtn = page.getByRole('button', { name: /Remover Todas/ });
  if (!(await removeBtn.isVisible().catch(() => false))) return;
  await removeBtn.click();
  await expect(page.getByRole('heading', { name: /Remover Todas as Bonificações/ })).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder(/motivo da remoção/).fill('Limpeza automatizada dos testes Playwright');
  await page.getByRole('button', { name: /Confirmar Remoção em Massa/ }).click();
  await expect(page.getByRole('heading', { name: /Remover Todas as Bonificações/ })).toBeHidden({ timeout: 60_000 });
}

test.describe('Bonificações (B / C1 / C2) — em Ponte Nova, isolado', () => {
  test.beforeAll(async () => {
    empId = await ensureTestEmployee(EMP_NAME, EMP_CPF, 'ponte');
    const s = getClient();
    const { data } = await s.from('companies').select('id, display_name, city').limit(100);
    const pn = (data || []).find((c: Record<string, unknown>) =>
      [c.display_name, c.city].filter(Boolean).some(v => String(v).toLowerCase().includes('ponte')),
    );
    if (!pn) throw new Error('Ponte Nova não encontrada');
    pnCompanyId = (pn as { id: string }).id;
    // Fotografa os pagamentos de PN do dia ANTES de qualquer bônus deste spec — é o que
    // permite devolver bonificação legítima ao valor original no fim.
    await capturarPnPayments();
  });

  test.beforeEach(async ({ page }) => {
    // 17/08/2026: aplicar bônus passou a pedir confirmação (window.confirm) —
    // sem handler, Playwright descarta o dialog por padrão e o clique some sem aplicar.
    page.on('dialog', (d) => d.accept());
    await wipePnDayState();
  });

  test.afterAll(async () => {
    await wipePnDayState();
    await cleanupAllTestArtifacts(readSuiteStart());
  });

  test('modal de Bonificação abre com 3 campos (B, C1, C2)', async ({ page }) => {
    await openPontoPNPresente(page, ADMIN);
    await page.getByRole('button', { name: /^Bonificação$/ }).click();

    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar B', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar C1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar C2', exact: true })).toBeVisible();
  });

  test('aplicar B=10 faz aparecer card "Tipo B" com R$ 10,00 (como 9999 — bônus é permitido)', async ({ page }) => {
    await openPontoPNPresente(page, ADMIN);
    await applyBonus(page, 'B', '10');

    const painelBonus = page.locator('div').filter({ hasText: /^Bonificações Aplicadas$/ }).first().locator('..');
    await expect(painelBonus.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(painelBonus.getByText(/R\$ 10[.,]00/)).toBeVisible();
  });

  test('aplicar B=10, C1=15 e C2=5 → cards B/C1/C2 aparecem', async ({ page }) => {
    await openPontoPNPresente(page, ADMIN);

    await applyBonus(page, 'B', '10');
    await applyBonus(page, 'C1', '15');
    await applyBonus(page, 'C2', '5');

    const painel = page.locator('div').filter({ hasText: /^Bonificações Aplicadas$/ }).first().locator('..');
    await expect(painel.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(painel.getByText('Tipo C1', { exact: true })).toBeVisible();
    await expect(painel.getByText('Tipo C2', { exact: true })).toBeVisible();
    await expect(painel.getByText(/R\$ 10[.,]00/)).toBeVisible();
    await expect(painel.getByText(/R\$ 15[.,]00/)).toBeVisible();
    await expect(painel.getByText(/R\$ 5[.,]00/)).toBeVisible();
  });

  test('"Remover Todas" faz os cards desaparecerem', async ({ page }) => {
    await openPontoPNPresente(page, ADMIN);
    await applyBonus(page, 'B', '10');
    await expect(page.getByText(/Bonificações Aplicadas/)).toBeVisible();

    await removeAllBonuses(page);

    await expect(page.getByText(/Bonificações Aplicadas/)).toBeHidden();
  });

  // ATUALIZADO 02/09/2026 (pedido do Victor, "máximo controle"): a trava exclusiva do
  // 2626 pro Reset Geral caiu — virou permissão normal (attendance.reset), e o 9999 foi
  // seedado com acesso total (configurável dali em diante pela tela de Permissões).
  test('9999 (acesso total, configurável) VÊ Reset Geral (com attendance no dia)', async ({ page }) => {
    await openPontoPNPresente(page, ADMIN);
    await expect(page.getByRole('button', { name: /^Reset Geral$/ })).toBeVisible();
  });

  test('2626: Reset Geral do ponto remove bonificações também (regressão)', async ({ page }) => {
    const s = getClient();
    const row = await openPontoPN(page, MASTER_2626);
    await markPresent(page, row);
    await applyBonus(page, 'B', '10');
    await expect(page.getByText(/Bonificações Aplicadas/)).toBeVisible();

    // ── Blindagem (29/07): este clique JÁ APAGOU ponto REAL de Ponte Nova. ──────
    // O Reset Geral montava os alvos a partir de TODOS os registros do dia, ignorando
    // a busca da tela — e este spec roda em PN, onde há gente de verdade batendo ponto.
    // Some duas coisas agora: o app só apaga quem está VISÍVEL (attendancesToReset), e
    // este teste confere que os registros dos OUTROS continuam intactos.
    const outrosAntes = await s
      .from('attendance')
      .select('id, employee_id')
      .eq('company_id', pnCompanyId)
      .eq('date', todayIso())
      .neq('employee_id', empId);
    const idsAntes = (outrosAntes.data ?? []).map((a: { id: string }) => a.id).sort();

    await page.getByRole('button', { name: /^Reset Geral$/ }).click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
    await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();

    await expect(page.getByText(/Bonificações Aplicadas/)).toBeHidden();

    const outrosDepois = await s
      .from('attendance')
      .select('id')
      .eq('company_id', pnCompanyId)
      .eq('date', todayIso())
      .neq('employee_id', empId);
    const idsDepois = (outrosDepois.data ?? []).map((a: { id: string }) => a.id).sort();
    expect(
      idsDepois,
      `O Reset Geral apagou ponto de quem NÃO estava na busca (antes ${idsAntes.length}, depois ${idsDepois.length}). ` +
      'Era exatamente o bug de 28/07 que destruiu registro real de Ponte Nova.',
    ).toEqual(idsAntes);
  });
});
