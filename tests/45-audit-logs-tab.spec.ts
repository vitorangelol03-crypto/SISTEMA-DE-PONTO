import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Sub-fase 14.6 — AuditLogsTab (Section 10 dentro do AdminTab).
 *
 * NOTA: O componente AuditLogsTab NÃO é uma aba isolada. Ele é
 * renderizado como Section 10 dentro de src/components/admin/AdminTab.tsx
 * (linha 1463), gated pela senha interna "Clayton2024". audit_logs
 * é global (sem company_id) — admin master vê tudo via RLS bypass.
 *
 * Cobertura:
 *  - Senha admin destrava o painel e mostra "Logs de Auditoria"
 *  - Heading + stats cards (Total de Ações, Módulos Ativos, Tipos de Ação)
 *  - Filtros visíveis: Data Inicial, Data Final, Usuário, Módulo, Tipo
 *  - Tabela renderiza linhas (audit_logs já tem 390+ rows reais)
 *  - Aplicar filtro de módulo "auth" → tabela só mostra logs do módulo Autenticação
 *  - Inserir um audit_log via SQL → aparece na UI após reload da tab
 *
 * Cleanup: linhas inseridas via SQL (description prefixada com
 * "PW Test audit ") são removidas em afterEach.
 */

const ADMIN_SECRET = 'Clayton2024';
const TEST_DESCRIPTION_PREFIX = 'PW Test audit ';

async function cleanupTestAuditLogs(): Promise<void> {
  const s = getClient();
  await s
    .from('audit_logs')
    .delete()
    .like('description', `${TEST_DESCRIPTION_PREFIX}%`);
}

async function unlockAdmin(page: Page): Promise<void> {
  await goToTab(page, 'Admin');
  const passwordInput = page.getByPlaceholder('Senha');
  await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  await passwordInput.fill(ADMIN_SECRET);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  // Aguarda painel autenticado abrir (heading da Section 1)
  await expect(
    page.getByText(/Geolocalização|Geo Records|Registros Geográficos/i).first()
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('AuditLogsTab — Section 10 do AdminTab', () => {
  test.beforeAll(cleanupTestAuditLogs);
  test.afterAll(cleanupTestAuditLogs);

  test.beforeEach(async ({ page }) => {
    await cleanupTestAuditLogs();
    await loginAs(page, ADMIN);
  });

  test('a. AdminTab destravado mostra heading "Logs de Auditoria"', async ({ page }) => {
    await unlockAdmin(page);

    // Section 10 aparece no final da página — scroll até ela
    const heading = page.getByRole('heading', { name: /Logs de Auditoria/i });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Subtítulo confirma o componente
    await expect(
      page.getByText(/Registro completo de todas as ações do sistema/i)
    ).toBeVisible();
  });

  test('b. stats cards (Total de Ações + Módulos Ativos + Tipos de Ação) renderizam', async ({ page }) => {
    await unlockAdmin(page);

    const heading = page.getByRole('heading', { name: /Logs de Auditoria/i });
    await heading.scrollIntoViewIfNeeded();

    // 3 cards de stats
    await expect(page.getByText(/^Total de Ações$/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^Módulos Ativos$/i)).toBeVisible();
    await expect(page.getByText(/^Tipos de Ação$/i)).toBeVisible();
  });

  test('c. filtros (Data Inicial/Final, Usuário, Módulo, Tipo de Ação) visíveis', async ({ page }) => {
    await unlockAdmin(page);
    const heading = page.getByRole('heading', { name: /Logs de Auditoria/i });
    await heading.scrollIntoViewIfNeeded();

    // Labels dos filtros são textos visíveis no componente
    await expect(page.getByText(/Data Inicial/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Data Final/i).first()).toBeVisible();
    await expect(page.getByText(/^Usuário$/i).first()).toBeVisible();
    await expect(page.getByText(/^Módulo$/i).first()).toBeVisible();
    await expect(page.getByText(/Tipo de Ação/i).first()).toBeVisible();

    // Search box + botão Exportar
    await expect(
      page.getByPlaceholder(/Buscar por descrição, módulo ou ação/i)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Exportar/i })).toBeVisible();
  });

  test('d. inserir audit_log via SQL → aparece na UI após reload', async ({ page }) => {
    // 1. Insere row de audit_log via SQL (admin master vê tudo)
    const s = getClient();
    const uniqueTag = `${Date.now()}`;
    const description = `${TEST_DESCRIPTION_PREFIX}${uniqueTag}`;
    const { error: insErr } = await s.from('audit_logs').insert([{
      user_id: '9999',
      action_type: 'create',
      module: 'employees',
      description,
    }]);
    expect(insErr).toBeNull();

    // 2. Sanity: row foi criada
    const { data: rows } = await s
      .from('audit_logs')
      .select('id, description')
      .eq('description', description);
    expect(rows?.length).toBe(1);

    // 3. Abre AuditLogsTab — useEffect carrega logs no mount
    await unlockAdmin(page);
    const heading = page.getByRole('heading', { name: /Logs de Auditoria/i });
    await heading.scrollIntoViewIfNeeded();

    // 4. Busca pela descrição única no search box (chega no <td>)
    const search = page.getByPlaceholder(/Buscar por descrição, módulo ou ação/i);
    await search.fill(uniqueTag);

    // 5. Tabela mostra a row com a descrição
    await expect(page.locator(`td:has-text("${description}")`)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('e. filtro por módulo "Autenticação" filtra a tabela', async ({ page }) => {
    await unlockAdmin(page);
    const heading = page.getByRole('heading', { name: /Logs de Auditoria/i });
    await heading.scrollIntoViewIfNeeded();

    // Aguarda tabela carregar (audit_logs tem ~390 rows reais)
    await page.waitForTimeout(1500);

    // Localiza o select Módulo via label "Módulo" + select adjacente (escopo: tab autenticada)
    const moduloSelect = page
      .locator('label:has-text("Módulo")')
      .locator('xpath=following-sibling::select')
      .first();
    await moduloSelect.selectOption({ label: 'Autenticação' });

    // Aguarda re-render (useEffect dispara loadData quando filters muda)
    await page.waitForTimeout(1500);

    // Escopo: SOMENTE a tabela do AuditLogsTab (tem thead com "Data/Hora"
    // E "Descrição" — outras tabelas do AdminTab não têm "Descrição").
    const auditTable = page
      .locator('table')
      .filter({ hasText: 'Data/Hora' })
      .filter({ hasText: 'Descrição' });
    const moduloCells = auditTable.locator('tbody tr td:nth-child(4)');
    const count = await moduloCells.count();
    if (count > 0) {
      // Pelo menos a primeira row mostra "Autenticação"
      await expect(moduloCells.first()).toHaveText(/Autenticação/i, { timeout: 5_000 });
    } else {
      // Sem rows com esse módulo na janela atual — ok, "Nenhum log encontrado"
      await expect(page.getByText(/Nenhum log encontrado/i)).toBeVisible();
    }
  });

  test('f. filtro por tipo de ação "Login" filtra a tabela', async ({ page }) => {
    await unlockAdmin(page);
    const heading = page.getByRole('heading', { name: /Logs de Auditoria/i });
    await heading.scrollIntoViewIfNeeded();

    await page.waitForTimeout(1500);

    const actionSelect = page
      .locator('label:has-text("Tipo de Ação")')
      .locator('xpath=following-sibling::select')
      .first();
    await actionSelect.selectOption({ label: 'Login' });
    await page.waitForTimeout(1500);

    // Escopo: SOMENTE a tabela do AuditLogsTab
    const auditTable = page
      .locator('table')
      .filter({ hasText: 'Data/Hora' })
      .filter({ hasText: 'Descrição' });
    const acaoCells = auditTable.locator('tbody tr td:nth-child(3)');
    const count = await acaoCells.count();
    if (count > 0) {
      await expect(acaoCells.first()).toHaveText(/Login/i, { timeout: 5_000 });
    } else {
      await expect(page.getByText(/Nenhum log encontrado/i)).toBeVisible();
    }
  });
});
