import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — Gerenciar grupos: vínculo exclusivo + busca por rota (pedido 2026-07-18).
 *
 *   1) Driver já vinculado a um grupo NÃO aparece na lista dos OUTROS grupos
 *      (continua no próprio, marcado, para poder ser desmarcado).
 *   2) O campo "Buscar driver ou rota…" também filtra pelo nome da ROTA
 *      (o nome do driver continua funcionando), sem sensibilidade a acento/caixa.
 *
 * Roda contra o banco real (Caratinga): cria SÓ grupos de teste (prefixo
 * 'PW Test Grupo'), vincula/desvincula UM driver real de forma reversível e
 * apaga os grupos no fim — driverpay_group_members tem FK ON DELETE CASCADE,
 * então excluir o grupo limpa os vínculos. Nenhum dado real fica alterado.
 */

const TEST_GROUP_MARK = `${TEST_EMPLOYEE_NAME_PREFIX}Grupo`; // 'PW Test Grupo'
// Card de grupo = div com `border` (molde do spec 55).
const GROUP_CARD = 'div.border.rounded-lg.overflow-hidden';

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Abre o modal "Gerenciar grupos" (assume aba Pagamentos Driver já aberta). */
async function openGroupManager(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Gerenciar grupos/ }).first().click();
  await expect(page.getByPlaceholder(/Nome do grupo/)).toBeVisible({ timeout: 10_000 });
}

/** Apaga (via UI) todos os grupos de teste que existirem — usado antes E depois. */
async function deleteTestGroups(page: Page): Promise<void> {
  if (!(await page.getByPlaceholder(/Nome do grupo/).count())) return;
  const cards = page.locator(GROUP_CARD).filter({ hasText: TEST_GROUP_MARK });
  for (let i = 0; i < 10; i++) {
    const n = await cards.count();
    if (n === 0) break;
    await cards.first().getByTitle('Excluir grupo').click({ timeout: 5_000 });
    await expect(cards).toHaveCount(n - 1, { timeout: 6_000 });
  }
}

/** Cria um grupo sem valor e retorna o card dele. */
async function createGroup(page: Page, name: string): Promise<Locator> {
  await page.getByPlaceholder(/Nome do grupo/).fill(name);
  await page.getByRole('button', { name: /^Criar$/ }).click();
  const card = page.locator(GROUP_CARD).filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  return card;
}

/** Abre a gaveta de membros de um card e espera a lista carregar. */
async function openMembers(card: Locator): Promise<void> {
  await card.getByTitle('Membros').click();
  await expect(card.getByPlaceholder(/Buscar driver/)).toBeVisible({ timeout: 10_000 });
  await expect(card.locator('label').first()).toBeVisible({ timeout: 10_000 });
}

/** Lê (nome, rota) das linhas da gaveta em UMA ida ao navegador (evita timeout no WSL). */
async function readRows(card: Locator): Promise<{ name: string; route: string }[]> {
  return card.locator('label').evaluateAll((labels) =>
    labels.slice(0, 60).map((l) => ({
      name: (l.querySelector('span.text-sm')?.textContent ?? '').trim(),
      route: (l.querySelector('span.text-xs')?.textContent ?? '').trim(),
    }))
  );
}

test.describe('Pagamentos Driver — grupos: vínculo exclusivo + busca por rota', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept()); // window.confirm do excluir grupo
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
    await openGroupManager(page);
    await deleteTestGroups(page); // higiene: sobras de runs anteriores
  });

  test.afterEach(async ({ page }) => {
    try {
      await deleteTestGroups(page);
    } catch {
      /* limpeza definitiva via service-role/MCP se a UI já fechou */
    }
  });

  test('driver vinculado a um grupo some da lista dos outros grupos (e volta ao desvincular)', async ({ page }) => {
    const cardA = await createGroup(page, `${TEST_GROUP_MARK} Alfa`);
    const cardB = await createGroup(page, `${TEST_GROUP_MARK} Beta`);

    // Vincula o primeiro driver disponível ao grupo Alfa.
    await openMembers(cardA);
    const firstRow = cardA.locator('label').first();
    const driverName = (await firstRow.locator('span.text-sm').innerText()).trim();
    // click() (e não check()): o checkbox é controlado e só marca depois que o
    // banco confirma o vínculo — o toBeChecked abaixo espera essa confirmação.
    await firstRow.locator('input[type="checkbox"]').click();
    await expect(firstRow.locator('input[type="checkbox"]')).toBeChecked({ timeout: 10_000 });

    // No grupo Beta a lista continua tendo gente…
    await openMembers(cardB);
    // …mas o driver do Alfa NÃO aparece (vínculo exclusivo).
    await expect(cardB.locator('label').filter({ hasText: driverName })).toHaveCount(0, { timeout: 10_000 });

    // No Alfa ele continua listado e marcado (dá pra desmarcar).
    await openMembers(cardA);
    const rowInA = cardA.locator('label').filter({ hasText: driverName }).first();
    await expect(rowInA.locator('input[type="checkbox"]')).toBeChecked({ timeout: 10_000 });

    // Desvincula (restaura o estado original do driver)…
    await rowInA.locator('input[type="checkbox"]').click();
    await expect(rowInA.locator('input[type="checkbox"]')).not.toBeChecked({ timeout: 10_000 });

    // …e ele VOLTA a aparecer na lista do Beta.
    await openMembers(cardB);
    await expect(cardB.locator('label').filter({ hasText: driverName }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('busca filtra por nome da rota (com/sem acento) e por nome do driver', async ({ page }) => {
    const card = await createGroup(page, `${TEST_GROUP_MARK} Rota`);
    await openMembers(card);
    const search = card.getByPlaceholder(/Buscar driver/);

    const rows = await readRows(card);
    const withRoute = rows.filter((r) => r.route);
    test.skip(withRoute.length === 0, 'nenhum driver com rota na base — nada a testar');

    // Preferir uma rota COM acento para provar a busca acento-insensível.
    const target = withRoute.find((r) => stripAccents(r.route) !== r.route) ?? withRoute[0];
    // Um driver de OUTRA rota, cujo nome não contenha a rota-alvo (para provar o filtro).
    const other = rows.find(
      (r) =>
        r.route !== target.route &&
        !stripAccents(r.name.toLowerCase()).includes(stripAccents(target.route.toLowerCase()))
    );

    // 1) Busca pela rota exata: o driver da rota aparece; o de outra rota some.
    await search.fill(target.route);
    await expect(card.locator('label').filter({ hasText: target.name }).first()).toBeVisible({ timeout: 5_000 });
    if (other) {
      await expect(card.locator('label').filter({ hasText: other.name })).toHaveCount(0, { timeout: 5_000 });
    }

    // 2) Busca pela rota SEM acentos (ex.: "sao sebastiao") continua achando.
    const noAccents = stripAccents(target.route.toLowerCase());
    if (noAccents !== target.route.toLowerCase()) {
      await search.fill(noAccents);
      await expect(card.locator('label').filter({ hasText: target.name }).first()).toBeVisible({ timeout: 5_000 });
    }

    // 3) Regressão: busca por trecho do NOME do driver continua funcionando.
    await search.fill(target.name.slice(0, 8));
    await expect(card.locator('label').filter({ hasText: target.name }).first()).toBeVisible({ timeout: 5_000 });
  });
});
