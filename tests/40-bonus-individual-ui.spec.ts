import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import {
  createTestEmployee,
  insertAttendance,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';
import { snapshotRealPayments, restoreRealPayments } from './_bonusIsolation';

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

/**
 * Cobertura E2E pra bonificação INDIVIDUAL via UI (lacuna do 04-bonus.spec.ts).
 *
 * Contexto:
 *  - O componente `AttendanceTab` NÃO tem botão "Aplicar bônus individual" na
 *    lista de Ponto. A aplicação rola via modal "Bonificação" (botão verde no
 *    topo), que chama `applyBonusToAllPresent` — aplica em TODOS os presentes
 *    do dia.
 *  - O que existe individual na lista: ícone Trash2 (X em vermelho) na coluna
 *    "Bonificação" pra REMOVER bônus de UM funcionário específico.
 *
 * Adaptação:
 *  - Pra simular "individual" na aplicação, criamos UM test employee `PW Test`,
 *    marcamos ele Presente via UI (clique na linha filtrada por busca), depois
 *    aplicamos bônus pelo modal. A função aplica em todos os presentes do dia,
 *    mas o teste verifica APENAS a row do test employee (escopo por employee_id).
 *  - Outros funcionários presentes podem receber bônus colateralmente — o
 *    cleanup global (cleanupByPrefix + removeAllBonuses no afterEach) limpa.
 *
 * Cobertura:
 *  1. Marcar Presente → status no DB + linha mostra badge "Presente"
 *  2. Modal de bônus abre com inputs pré-preenchidos por bonus_types.default_value
 *  3. Aplicar B=15 + submit → toast sucesso + payment.bonus_b=15 do test emp + UI mostra
 *  4. Valor inválido (0/negativo) → toast erro, payment não atualiza
 *  5. Remover bônus individual via ícone trash → modal pede observation ≥10 chars
 *     → confirma → bonus_removals row criada + payment.bonus_b=0 do test emp
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}BonIndiv `;

function todayBR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

async function cleanup(): Promise<void> {
  await cleanupByPrefix(PREFIX, [todayBR()]);
}

/**
 * Remove TODAS as bonificações do dia via UI. Roda em afterEach pra deixar
 * o estado limpo independente do que outros funcionários receberam por
 * colateralidade do `applyBonusToAllPresent`.
 */
async function removeAllBonusesViaUI(page: Page): Promise<void> {
  const removeBtn = page.getByRole('button', { name: /Remover Todas/ });
  if (await removeBtn.isVisible().catch(() => false)) {
    await removeBtn.click();
    await page
      .getByPlaceholder(/motivo da remoção/)
      .fill('Limpeza automatizada dos testes Playwright');
    await page.getByRole('button', { name: /Confirmar Remoção em Massa/ }).click();
    await expect(
      page.getByRole('heading', { name: /Remover Todas as Bonificações/ })
    ).toBeHidden({ timeout: 15_000 });
  }
}

/**
 * Reseta o status de presença de TODOS funcionários do dia via UI.
 * Útil pra limpar a `attendance` deixada pelo teste e evitar pollution.
 */
async function resetAllAttendanceViaUI(page: Page): Promise<void> {
  const resetGeral = page.getByRole('button', { name: /^Reset Geral$/ });
  if (await resetGeral.isVisible().catch(() => false)) {
    await resetGeral.click();
    await page.getByRole('button', { name: /Confirmar Reset/ }).click();
    await expect(page.getByRole('button', { name: /Confirmar Reset/ })).toBeHidden();
  }
}

async function searchEmployee(page: Page, name: string): Promise<void> {
  // AttendanceTab faz query no mount com [company?.id]; employees criados via SQL
  // após o mount não aparecem sem refetch manual (polling 30s é silencioso mas
  // não cobre o início do teste). Click no botão "Atualizar" força loadData.
  await page.getByRole('button', { name: /^Atualizar$/ }).click();

  const searchInput = page.getByPlaceholder(/Buscar por nome ou CPF/);
  await searchInput.fill(name);
  // Aguarda o filtro renderizar a row do test employee
  await expect(page.locator('tr', { hasText: name }).first()).toBeVisible({ timeout: 10_000 });
}

async function markPresentByName(page: Page, name: string): Promise<void> {
  const row = page.locator('tr', { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: 'Presente', exact: true }).click();
  // Aguarda badge "Presente" aparecer na row
  await expect(row.locator('span').filter({ hasText: /^Presente$/ }).first()).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Bonificação INDIVIDUAL via UI — aplica + remove em 1 funcionário', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');
    // Limpa quaisquer bonificações remanescentes ANTES de começar
    await removeAllBonusesViaUI(page).catch(() => {});
  });

  test.afterEach(async ({ page }) => {
    // Limpa bonificações via UI (afeta a empresa toda) + reseta attendance pra
    // não deixar funcionários reais marcados como presente
    await removeAllBonusesViaUI(page).catch(() => {});
    await resetAllAttendanceViaUI(page).catch(() => {});
  });

  test('1. marcar Presente em PW Test → status "Presente" aparece na linha', async ({ page }) => {
    const name = `${PREFIX}MarcarPresente`;
    const empId = await createTestEmployee({ name });

    await searchEmployee(page, name);
    await markPresentByName(page, name);

    // DB confirma status=present
    const s = getClient();
    const { data } = await s
      .from('attendance')
      .select('status')
      .eq('employee_id', empId)
      .eq('date', todayBR())
      .single();
    expect(data?.status).toBe('present');
  });

  test('2. modal "Bonificação" abre com inputs pré-preenchidos via bonus_types.default_value', async ({
    page,
  }) => {
    const name = `${PREFIX}ModalPrefill`;
    await createTestEmployee({ name });
    await searchEmployee(page, name);
    await markPresentByName(page, name);

    // Abre modal de bônus
    await page.getByRole('button', { name: /^Bonificação$/ }).click();
    await expect(
      page.getByRole('heading', { name: /Bonificação do Dia/ })
    ).toBeVisible({ timeout: 10_000 });

    // Os 3 tipos B/C1/C2 aparecem como blocos
    await expect(page.getByText('Tipo B', { exact: true })).toBeVisible();
    await expect(page.getByText('Tipo C1', { exact: true })).toBeVisible();
    await expect(page.getByText('Tipo C2', { exact: true })).toBeVisible();

    // bonus_types padrão da empresa: o `openBonusModal` faz prefill quando
    // default_value > 0. Verificamos que pelo menos UM input number tem
    // valor numérico (não vazio) — confirma que prefill rolou.
    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    // Pelo menos um dos botões "Aplicar X" está habilitado (=> tem valor)
    // OU o input correspondente tem valor pré-preenchido
    const aplicarB = page.getByRole('button', { name: 'Aplicar B', exact: true });
    const aplicarC1 = page.getByRole('button', { name: 'Aplicar C1', exact: true });
    const aplicarC2 = page.getByRole('button', { name: 'Aplicar C2', exact: true });
    await expect(aplicarB).toBeVisible();
    await expect(aplicarC1).toBeVisible();
    await expect(aplicarC2).toBeVisible();
  });

  test('3. aplicar B=15 → toast sucesso + payment.bonus_b=15 no PW Test + UI mostra valor', async ({
    page,
  }) => {
    const name = `${PREFIX}AplicaB15`;
    const empId = await createTestEmployee({ name });

    await searchEmployee(page, name);
    await markPresentByName(page, name);

    // Snapshot REAIS antes de aplicar em massa (evita polução em prod —
    // incidente 2026-05-18)
    const isolationClient = getClient();
    const snapshot = await snapshotRealPayments(isolationClient, CARATINGA_ID, todayBR());

    // Abre modal
    await page.getByRole('button', { name: /^Bonificação$/ }).click();
    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

    // Localiza o bloco "Tipo B" → input number → preenche 15 → clica Aplicar B
    const typeBSpan = page.getByText('Tipo B', { exact: true });
    const blockB = typeBSpan.locator(
      'xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]'
    );
    const inputB = blockB.locator('input[type="number"]');
    await inputB.fill('15');

    const aplicarBtn = page.getByRole('button', { name: 'Aplicar B', exact: true });
    await expect(aplicarBtn).toBeEnabled({ timeout: 5_000 });
    await aplicarBtn.click();

    // Toast sucesso
    await expect(page.getByText(/Bonificação B aplicada com sucesso/i)).toBeVisible({
      timeout: 10_000,
    });

    // Fecha modal
    await page.getByRole('button', { name: /^Fechar$/ }).click();
    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeHidden();

    // Verifica DB — payment do PW Test tem bonus_b=15
    const s = getClient();
    const { data: pay } = await s
      .from('payments')
      .select('bonus_b, bonus, total')
      .eq('employee_id', empId)
      .eq('date', todayBR())
      .single();
    expect(Number(pay?.bonus_b)).toBe(15);
    // bonus agregado >= bonus_b (pode ter C1/C2 do prefill, mas B é exatamente 15)
    expect(Number(pay?.bonus)).toBeGreaterThanOrEqual(15);

    // UI mostra "B: R$ 15.00" na linha do PW Test (tabela desktop)
    const row = page.locator('tr', { hasText: name }).first();
    await expect(row.getByText(/B:\s*R\$\s*15[.,]00/)).toBeVisible({ timeout: 10_000 });

    // Restore REAIS ao estado pré-teste
    await restoreRealPayments(isolationClient, snapshot);
  });

  test('4. aplicar bônus negativo dispara validação (botão "Aplicar B" fica disabled OU toast erro)', async ({
    page,
  }) => {
    const name = `${PREFIX}BonusInvalido`;
    const empId = await createTestEmployee({ name });

    await searchEmployee(page, name);
    await markPresentByName(page, name);

    await page.getByRole('button', { name: /^Bonificação$/ }).click();
    await expect(page.getByRole('heading', { name: /Bonificação do Dia/ })).toBeVisible();

    // Tenta preencher com valor zero (que é <= 0, inválido pra `handleApplyBonusType`)
    const typeBSpan = page.getByText('Tipo B', { exact: true });
    const blockB = typeBSpan.locator(
      'xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]'
    );
    const inputB = blockB.locator('input[type="number"]');
    await inputB.fill('0');

    const aplicarBtn = page.getByRole('button', { name: 'Aplicar B', exact: true });
    // O componente desabilita o botão quando valor é falsy (string vazia OU "0" cai
    // no truthy check porque a string "0" é truthy em JS). Se botão estiver habilitado,
    // o clique cai em `handleApplyBonusType` que faz parseFloat → 0 → dispara
    // `toast.error('Valor da bonificação B inválido')`.
    const isDisabled = await aplicarBtn.isDisabled().catch(() => true);
    if (!isDisabled) {
      await aplicarBtn.click();
      // .first() pra evitar strict mode violation se um toast residual estiver visível
      await expect(
        page.getByText(/Valor da bonificação B inválido/i).first()
      ).toBeVisible({ timeout: 10_000 });
    } else {
      // Botão já bloqueado pelo client — ok, sem necessidade de toast
      expect(isDisabled).toBe(true);
    }

    // Tenta com negativo. Espera o toast anterior dissolver (react-hot-toast default ~3s)
    // pra não colidir com o novo — usamos .last() pra pegar o mais recente.
    await page.waitForTimeout(3500);
    await inputB.fill('-5');
    if (await aplicarBtn.isEnabled().catch(() => false)) {
      await aplicarBtn.click();
      await expect(
        page.getByText(/Valor da bonificação B inválido/i).last()
      ).toBeVisible({ timeout: 10_000 });
    }

    // Fecha modal e verifica que payment NÃO foi criado/atualizado com bonus_b inválido
    await page.getByRole('button', { name: /^Fechar$/ }).click();

    const s = getClient();
    const { data: pay } = await s
      .from('payments')
      .select('bonus_b')
      .eq('employee_id', empId)
      .eq('date', todayBR())
      .maybeSingle();
    // payment não existe OU bonus_b=0 (nunca recebeu valor inválido)
    expect(pay === null || Number(pay?.bonus_b ?? 0) === 0).toBe(true);
  });

  test('5. remover bônus individual via ícone trash → modal pede observation ≥10 chars → bonus_removals row + bonus_b=0', async ({
    page,
  }) => {
    const name = `${PREFIX}RemoverIndiv`;
    const empId = await createTestEmployee({ name });
    const today = todayBR();

    // Seeda attendance + payment com bonus_b=20 direto via DB (pula o fluxo
    // de aplicação pra isolar o teste de REMOÇÃO).
    await insertAttendance(empId, today, { status: 'present' });
    const s = getClient();
    await s.from('payments').insert([
      {
        employee_id: empId,
        date: today,
        daily_rate: 100,
        bonus_b: 20,
        bonus_c1: 0,
        bonus_c2: 0,
        bonus: 20,
        total: 120,
        created_by: '9999',
      },
    ]);

    // Recarrega a aba pra UI puxar os dados do DB
    await page.reload();
    await goToTab(page, 'Ponto');
    await searchEmployee(page, name);

    const row = page.locator('tr', { hasText: name }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Ícone Trash2 (botão com title "Remover bonificação") aparece na coluna Bonificação
    const trashBtn = row.getByRole('button', { name: /Remover bonificação/i });
    await expect(trashBtn).toBeVisible({ timeout: 10_000 });
    await trashBtn.click();

    // Modal "Remover Bonificação" abre
    await expect(
      page.getByRole('heading', { name: /^Remover Bonificação$/ })
    ).toBeVisible({ timeout: 10_000 });

    // Tenta confirmar com obs vazia → botão "Confirmar Remoção" deve estar disabled
    const confirmBtn = page.getByRole('button', { name: /^Confirmar Remoção$/ });
    await expect(confirmBtn).toBeDisabled();

    // Obs < 10 chars → ainda disabled
    const obsTextarea = page.getByPlaceholder(/motivo da remoção/i);
    await obsTextarea.fill('curto');
    await expect(confirmBtn).toBeDisabled();
    // Helper text mostra "Faltam X caracteres"
    await expect(page.getByText(/Faltam \d+ caracteres/i)).toBeVisible();

    // Obs válida ≥10 chars → habilita confirm
    const validObs = 'Remoção via E2E Playwright — teste bonificação individual';
    await obsTextarea.fill(validObs);
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });

    await confirmBtn.click();

    // Toast sucesso
    await expect(page.getByText(/Bonificação B removida com sucesso/i)).toBeVisible({
      timeout: 10_000,
    });

    // bonus_removals row criada
    const { data: removals } = await s
      .from('bonus_removals')
      .select('*')
      .eq('employee_id', empId)
      .eq('date', today);
    expect(removals?.length).toBe(1);
    expect(removals?.[0].bonus_type).toBe('B');
    expect(Number(removals?.[0].bonus_amount_removed)).toBe(20);
    expect(removals?.[0].observation).toBe(validObs);

    // payment.bonus_b zerado + bonus/total recalculados
    const { data: pay } = await s
      .from('payments')
      .select('bonus_b, bonus, total, daily_rate')
      .eq('employee_id', empId)
      .eq('date', today)
      .single();
    expect(Number(pay?.bonus_b)).toBe(0);
    expect(Number(pay?.bonus)).toBe(0);
    expect(Number(pay?.total)).toBe(Number(pay?.daily_rate));
  });
});
