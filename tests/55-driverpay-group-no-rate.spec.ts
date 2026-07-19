import { readFileSync } from 'node:fs';
import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E do #8 — "criar grupo SEM valor por pacote".
 *
 * Pedido do Victor: na criação de grupo, poder criar um grupo sem configurar
 * valor de pacote; assim todos os drivers do grupo usam a config individual
 * deles por pacote (o grupo serve só para organizar).
 *
 * Critério de sucesso:
 *   1) criar um grupo deixando o campo de valor em branco → o grupo é criado e
 *      NÃO força valor nenhum (o campo de valor/pacote do card fica em branco);
 *   2) (parte que exige service role — describe.skip abaixo, molde do 52) um
 *      driver com config individual R$5,00 continua com R$5,00 depois de entrar
 *      num grupo sem valor — a config individual não é sobrescrita.
 *
 * A parte ativa não precisa de seed de banco: prova o comportamento pela própria
 * UI (o input de valor do card é sincronizado do default_rate do grupo — vazio
 * ⇔ sem valor). A limpeza é best-effort pela UI (a definitiva é via service role).
 */

const TEST_GROUP_MARK = `${TEST_EMPLOYEE_NAME_PREFIX}Grupo`; // 'PW Test Grupo'
// Card de grupo = div com `border` (a grade é `bg-white ... shadow`, sem border).
const GROUP_CARD = 'div.border.rounded-lg.overflow-hidden';

/** Abre o modal "Gerenciar grupos" (assume aba Pagamentos Driver já aberta). */
async function openGroupManager(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
  await expect(page.getByPlaceholder(/Nome do grupo/)).toBeVisible({ timeout: 10_000 });
}

test.describe('Pagamentos Driver — criar grupo sem valor (#8)', () => {
  test.beforeEach(async ({ page }) => {
    // window.confirm do excluir grupo → aceitar automaticamente.
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
    await openGroupManager(page);
  });

  test.afterEach(async ({ page }) => {
    // Best-effort: apaga os grupos de teste pela UI. A limpeza definitiva é
    // garantida fora do teste (service role / MCP), então não falha o teste.
    try {
      if (!(await page.getByPlaceholder(/Nome do grupo/).count())) return;
      const cards = page.locator(GROUP_CARD).filter({ hasText: TEST_GROUP_MARK });
      for (let i = 0; i < 10; i++) {
        const n = await cards.count();
        if (n === 0) break;
        await cards.first().getByTitle('Excluir grupo').click({ timeout: 5_000 });
        await expect(cards).toHaveCount(n - 1, { timeout: 6_000 });
      }
    } catch {
      /* limpeza garantida via MCP/service-role */
    }
  });

  test('criar grupo deixando o valor em branco: cria e não força valor nenhum', async ({ page }) => {
    const groupName = `${TEST_GROUP_MARK} Sem Valor`;

    await page.getByPlaceholder(/Nome do grupo/).fill(groupName);
    // O campo de valor (placeholder "opcional") fica INTOCADO — cerne do #8.
    await page.getByRole('button', { name: /^Criar$/ }).click();

    await expect(page.getByText('Grupo criado')).toBeVisible({ timeout: 10_000 });

    const card = page.locator(GROUP_CARD).filter({ hasText: groupName }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    // Prova pela UI: o valor/pacote do card fica VAZIO ⇔ grupo sem valor (o input
    // é sincronizado de group.default_rate; null → '').
    await expect(card.getByPlaceholder('valor/pacote')).toHaveValue('', { timeout: 10_000 });
  });

  test('contraste: criar grupo COM valor 3,50 mostra o valor no card', async ({ page }) => {
    const groupName = `${TEST_GROUP_MARK} Com Valor`;

    await page.getByPlaceholder(/Nome do grupo/).fill(groupName);
    await page.getByPlaceholder('opcional').fill('3,50');
    await page.getByRole('button', { name: /^Criar$/ }).click();

    await expect(page.getByText('Grupo criado')).toBeVisible({ timeout: 10_000 });

    const card = page.locator(GROUP_CARD).filter({ hasText: groupName }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    // Com valor definido, o card mostra 3.5 — confirma que "vazio" no outro teste
    // é intencional (sem valor), não uma falha de leitura da UI.
    await expect(card.getByPlaceholder('valor/pacote')).toHaveValue('3.5', { timeout: 10_000 });
  });
});

// ─── Prova de banco: config individual intacta (requer SERVICE_ROLE_KEY) ──────
//
// Molde do 52-driverpay.spec.ts (parte skip): valida no banco que adicionar um
// driver a um grupo SEM valor não sobrescreve o platform_rate individual dele.
// Requer SUPABASE_SERVICE_ROLE_KEY no .env (as tabelas driverpay_* têm RLS que
// só libera por company_id do JWT ou sub in (9999,2626); service_role bypassa).
// Rodar: SUPABASE_SERVICE_ROLE_KEY=… npx playwright test tests/55-* (remover .skip)
const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Grupo `;
const INDIVIDUAL_RATE = 5.0;

async function getCaratingaId(): Promise<string> {
  const s = getClient();
  const { data, error } = await s.from('companies').select('id, display_name, legal_name, city').limit(1000);
  if (error) throw error;
  const match = (data || []).find((c: Record<string, unknown>) =>
    [c.display_name, c.legal_name, c.city].filter(Boolean).some((v) => String(v).toLowerCase().includes('caratinga')),
  );
  if (!match) throw new Error('Empresa "Caratinga" não encontrada no banco');
  return (match as { id: string }).id;
}

async function cleanupDb(): Promise<void> {
  const s = getClient();
  const { data: drivers } = await s.from('driverpay_drivers').select('id').like('name', `${PREFIX}%`);
  const driverIds = (drivers || []).map((d: { id: string }) => d.id);
  if (driverIds.length > 0) {
    await s.from('driverpay_platform_rates').delete().in('driver_id', driverIds);
    await s.from('driverpay_group_members').delete().in('driver_id', driverIds);
    await s.from('driverpay_drivers').delete().in('id', driverIds);
  }
  await s.from('driverpay_groups').delete().like('name', `${PREFIX}%`);
  await s.from('driverpay_platforms').delete().like('name', `${PREFIX}%`);
}

// 2026-07-19: ACORDADO — a SERVICE_ROLE_KEY voltou ao .env; o skip condicional
// abaixo mantém a suíte verde em máquinas sem a chave (ex.: CI restrito).
const hasServiceKey = ((): boolean => {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    return /^SUPABASE_SERVICE_ROLE_KEY=.+/m.test(readFileSync('.env', 'utf8'));
  } catch {
    return false;
  }
})();

test.describe('Pagamentos Driver — config individual intacta [requer service role]', () => {
  test.skip(!hasServiceKey, 'sem SUPABASE_SERVICE_ROLE_KEY no .env');
  test.beforeAll(cleanupDb);
  test.afterAll(cleanupDb);

  test('adicionar driver (R$5,00) a grupo sem valor mantém a config individual', async ({ page }) => {
    const s = getClient();
    const companyId = await getCaratingaId();
    const driverName = `${PREFIX}Angelo`;

    const { data: platform } = await s
      .from('driverpay_platforms')
      .insert([{ company_id: companyId, name: `${PREFIX}eMile`, default_rate: 2.0, sort_order: 0 }])
      .select('id')
      .single();
    const platformId = (platform as { id: string }).id;
    const { data: driver } = await s
      .from('driverpay_drivers')
      .insert([{ company_id: companyId, name: driverName, route: 'Caratinga', active: true }])
      .select('id')
      .single();
    const driverId = (driver as { id: string }).id;
    await s
      .from('driverpay_platform_rates')
      .insert([{ company_id: companyId, driver_id: driverId, platform_id: platformId, rate: INDIVIDUAL_RATE, updated_by: '2626' }]);

    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
    await openGroupManager(page);

    const groupName = `${PREFIX}Organiza`;
    await page.getByPlaceholder(/Nome do grupo/).fill(groupName);
    await page.getByRole('button', { name: /^Criar$/ }).click();
    await expect(page.getByText('Grupo criado')).toBeVisible({ timeout: 10_000 });

    const card = page.locator(GROUP_CARD).filter({ hasText: groupName }).first();
    await card.getByTitle('Membros').click();
    await page.getByPlaceholder(/Buscar driver/).fill(driverName);
    const driverLabel = page.locator('label', { hasText: driverName }).first();
    // click() (nao check()): checkbox controlado so marca apos o banco confirmar.
    await driverLabel.locator('input[type="checkbox"]').click();
    await expect(driverLabel.locator('input[type="checkbox"]')).toBeChecked({ timeout: 10_000 });

    // Prova de verdade: o platform_rate individual continua 5,00 (não sobrescrito).
    await expect(async () => {
      const { data } = await s
        .from('driverpay_platform_rates')
        .select('rate')
        .eq('driver_id', driverId)
        .eq('platform_id', platformId)
        .single();
      expect(Number((data as { rate: number }).rate)).toBe(INDIVIDUAL_RATE);
    }).toPass({ timeout: 10_000 });
  });
});
