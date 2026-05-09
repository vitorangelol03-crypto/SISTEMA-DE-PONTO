import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';

test.describe('Sub-fase 3.4 — Isolamento UI multi-empresa', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    // Após loginAs, admin está em Caratinga (default — selecionado no
    // CompanySelector pelo helper).
  });

  test('1. Ponto em Ponte Nova mostra "Nenhum funcionário cadastrado"; Caratinga mostra Funcionários (N)', async ({ page }) => {
    // 1. Caratinga (default): aba Ponto deve mostrar contador.
    await goToTab(page, 'Ponto');
    await expect(
      page.getByText(/^Funcionários \(\d+\)$/)
    ).toBeVisible({ timeout: 15_000 });

    // 2. Trocar pra Ponte Nova. CompanySwitcher dispara
    //    window.location.reload() (Layout.tsx:45), resetando
    //    activeTab pra default 'attendance'. Re-navegar é
    //    necessário pra garantir aba alvo correta.
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Ponto');

    // 3. AttendanceTab em Ponte Nova: estado vazio.
    await expect(
      page.getByText(/Nenhum funcionário cadastrado/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('2. Funcionários em Ponte Nova mostra "Nenhum funcionário cadastrado"; Caratinga mostra Funcionários (N)', async ({ page }) => {
    // 1. Caratinga: aba Funcionários (EmployeesTab) com contador.
    await goToTab(page, 'Funcionários');
    await expect(
      page.getByText(/^Funcionários \(\d+\)$/)
    ).toBeVisible({ timeout: 15_000 });

    // 2. Trocar empresa + re-navegar pra EmployeesTab (reload
    //    do CompanySwitcher reseta activeTab pra Ponto).
    //    SEM o re-navegar, o assert de "Nenhum funcionário
    //    cadastrado" passa em AttendanceTab por coincidência —
    //    cobertura FALSA. O re-navegar garante validação real
    //    de EmployeesTab.
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Funcionários');

    // 3. EmployeesTab em Ponte Nova: estado vazio.
    await expect(
      page.getByText(/Nenhum funcionário cadastrado/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('3. Relatórios em Ponte Nova mostra "Nenhum registro encontrado"; Caratinga mostra lista de registros', async ({ page }) => {
    // 1. Caratinga: aba Relatórios com listagem (DOM count > 0).
    await goToTab(page, 'Relatórios');
    await expect(
      page.locator('tbody tr').first()
    ).toBeVisible({ timeout: 15_000 });

    // 2. Trocar empresa + re-navegar (reload reseta activeTab).
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Relatórios');

    // 3. ReportsTab em Ponte Nova: estado vazio (texto exclusivo
    //    deste componente, conforme auditoria L821/829).
    await expect(
      page.getByText(/Nenhum registro encontrado/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('4. Erros (Individual) em Ponte Nova combobox vazio; Caratinga lista funcionários', async ({ page }) => {
    // Estratégia: contar <option> do combobox de filtro "Funcionário".
    // Esse combobox é populado via getAllEmployees(employmentType,
    // company.id) — INDEPENDENTE do filtro de data hoje-hoje que torna
    // a tabela "Funcionários e Erros" vazia em ambas empresas.
    // Locator distingue do select de employmentType porque este tem
    // <option value="">Todos os Funcionários</option> (não "Todos" exato).

    // 1. Caratinga (default): aba Erros, sub-aba Individual default.
    await goToTab(page, 'Erros');

    const empCombo = page
      .locator('select')
      .filter({
        has: page.locator('option[value=""]', { hasText: /^Todos$/ }),
      })
      .first();

    // Caratinga tem N >= 1 employees → combobox tem >= 2 options
    // (1 "Todos" + N employees). Validar que a 2ª opção (índice 1)
    // existe no DOM. toBeAttached em vez de toBeVisible porque options
    // dentro de <select> fechado não são "visible" no sentido do
    // Playwright. Retry built-in cobre carregamento async.
    await expect(
      empCombo.locator('option').nth(1)
    ).toBeAttached({ timeout: 15_000 });

    // 2. Trocar empresa + re-navegar (reload reseta activeTab e
    //    re-monta ErrorsTab; loadData useEffect dispara automaticamente
    //    porque company?.id está no deps array — confirmado L94, L131-135).
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Erros');

    // 3. Ponte Nova: combobox tem EXATAMENTE 1 option ("Todos") porque
    //    a empresa não tem employees. Se aparecesse > 1 aqui, employees
    //    de Caratinga estariam vazando — esse é o invariante do
    //    isolamento que o teste protege.
    await expect(
      empCombo.locator('option')
    ).toHaveCount(1, { timeout: 10_000 });
  });

  test('5. Erros (Períodos) em Ponte Nova mostra "Nenhum período criado"; Caratinga lista períodos', async ({ page }) => {
    // Componente: PaymentPeriodsTab (sub-aba 'periods' do ErrorsTab).
    // Sem filtro temporal — getPaymentPeriods(company.id) busca todos.
    // Caratinga: 28 períodos persistentes (out/2025 → abr/2026).
    // Ponte Nova: 0 períodos.

    // 1. Caratinga (default): aba Erros, sub-aba 'periods' NÃO é
    //    default (default é 'individual'). Clicar no botão da
    //    sub-aba pra ativar PaymentPeriodsTab.
    await goToTab(page, 'Erros');
    await page
      .getByRole('button', { name: /Períodos/i })
      .first()
      .click();

    // PaymentPeriodsTab carrega 28 períodos. tbody tr first
    // attached é suficiente — toBeAttached cobre <tr> dentro de
    // <table> que pode estar atrás de overflow-x-auto.
    await expect(
      page.locator('tbody tr').first()
    ).toBeAttached({ timeout: 15_000 });

    // 2. Trocar empresa + re-navegar. Reload reseta activeTab pra
    //    'attendance' E activeSubTab do ErrorsTab pra 'individual'
    //    (useState inicial L28). Precisa re-clicar 'Períodos'.
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Erros');
    await page
      .getByRole('button', { name: /Períodos/i })
      .first()
      .click();

    // 3. Ponte Nova: 0 períodos → texto vazio exclusivo (L184).
    await expect(
      page.getByText(/Nenhum período criado/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('6. Usuários em Ponte Nova mostra "Nenhum usuário encontrado"; Caratinga mostra Gestão de Usuários (N)', async ({ page }) => {
    // Componente: UsersTab (src/components/users/UsersTab.tsx).
    // Sem filtro temporal — getAllUsers(company.id) busca todos.
    // Caratinga: 5 users. Ponte Nova: 0 users.

    // 1. Caratinga (default): aba Usuários, contador "Gestão de
    //    Usuários (N)" no <h2>. Regex \d+ pra ser robusto a
    //    mudanças no seed de users.
    await goToTab(page, 'Usuários');
    await expect(
      page.getByText(/^Gestão de Usuários \(\d+\)$/)
    ).toBeVisible({ timeout: 15_000 });

    // 2. Trocar empresa + re-navegar (reload reseta activeTab).
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Usuários');

    // 3. Ponte Nova: 0 users → texto vazio exclusivo (L418).
    //    Pattern simétrico com T1/T2: assertion sobre o texto
    //    exato de estado vazio (não sobre contador "(0)").
    await expect(
      page.getByText(/Nenhum usuário encontrado/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('7. Gerenciamento em Ponte Nova sem registros antigos; Caratinga lista "Mais antigo:" por categoria', async ({ page }) => {
    // Componente: DataManagementTab. activeSection default
    // 'overview' renderiza grid de stats imediatamente. Sem filtro
    // temporal pro overview.
    //
    // Estratégia: contar ocorrências do texto "Mais antigo:" que
    // é renderizado condicionalmente em cada card de categoria
    // ({statistics.X.oldestDate && ...}). Locator independente
    // de locale (evita problema de toLocaleString variar entre
    // "5,433" e "5.433").

    // 1. Caratinga (default): 4 cards com dados (Presenças,
    //    Pagamentos, Erros, Bonificações) → "Mais antigo:" aparece
    //    em 4 lugares. .first() suficiente pra afirmar presença.
    await goToTab(page, 'Gerenciamento');
    await expect(
      page.getByText(/Mais antigo:/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // 2. Trocar empresa + re-navegar. Reload reseta activeTab e
    //    DataManagementTab é re-mountado com activeSection
    //    'overview' default (L55).
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Gerenciamento');

    // 3. Ponte Nova: 0 registros em todas categorias → "Mais
    //    antigo:" não renderiza em nenhum card (renderização
    //    condicional). toHaveCount(0) é assertion afirmativa
    //    do isolamento — se aparecer aqui, dados de Caratinga
    //    vazaram.
    await expect(
      page.getByText(/Mais antigo:/i)
    ).toHaveCount(0, { timeout: 10_000 });
  });

  test('8. Financeiro em Ponte Nova mostra "Nenhum dado financeiro encontrado"; Caratinga lista funcionários', async ({ page }) => {
    // Componente: FinancialTab. activeView default 'financial' (L66)
    // renderiza tabela principal (L979) imediatamente. processFinancialData
    // (L156-209) mapeia 1 entry POR EMPLOYEE, independente de payments
    // visíveis no filtro temporal hoje-hoje default — então Caratinga
    // sempre mostra 30 rows mesmo sem payments do dia.

    // 1. Caratinga (default): aba Financeiro com tabela populada por
    //    employees (não por payments). 30 employees → 30 rows.
    await goToTab(page, 'Financeiro');
    await expect(
      page.locator('tbody tr').first()
    ).toBeAttached({ timeout: 15_000 });

    // 2. Trocar empresa + re-navegar (reload reseta activeTab).
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Financeiro');

    // 3. Ponte Nova: 0 employees → financialData vazio → estado vazio
    //    em <h3> exclusivo deste componente (L1449). Pattern simétrico
    //    com T3/T5: DOM count em Caratinga, texto exato em PN.
    await expect(
      page.getByText(/Nenhum dado financeiro encontrado/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('9. Admin: Caratinga sections com dados; Ponte Nova vazias (Geo, Face, Suspeitas)', async ({ page }) => {
    // Componente: AdminTab. Página única protegida por senha
    // 'Clayton2024' (literal, confirmada em specs 12/24/27).
    //
    // 3 sections testáveis (filtros default vazios + texto
    // vazio EXCLUSIVO de cada section):
    //   - "Registros de Geolocalização" → "Nenhum registro encontrado"
    //   - "Histórico de Tentativas Faciais" → "Nenhuma tentativa registrada"
    //   - "Tentativas Suspeitas" → "Nenhuma tentativa encontrada"
    //
    // Section "Bloqueios de Bonificação" excluída deste teste:
    // blockActiveOnly default true filtra blocks expirados; o
    // único block de CT está expirado, então CT e PN ficam
    // visualmente iguais. → vai pro TECH_DEBT.
    //
    // Re-autenticação obrigatória após switchCompany porque
    // 'authenticated' é useState local sem persistência (reload
    // do CompanySwitcher derruba pra false).

    // ─── Caratinga (default) ──────────────────────────────
    await goToTab(page, 'Admin');
    await page.getByPlaceholder('Senha').fill('Clayton2024');
    await page.getByRole('button', { name: /^Entrar$/ }).click();
    await expect(
      page.getByRole('heading', { name: /Painel Admin/ })
    ).toBeVisible({ timeout: 15_000 });

    // 3 sections com dados em CT → textos vazios NÃO aparecem
    await expect.soft(
      page.getByText(/Nenhum registro encontrado/i)
    ).toHaveCount(0, { timeout: 10_000 });
    await expect.soft(
      page.getByText(/Nenhuma tentativa registrada/i)
    ).toHaveCount(0);
    await expect.soft(
      page.getByText(/Nenhuma tentativa encontrada/i)
    ).toHaveCount(0);

    // ─── Ponte Nova ───────────────────────────────────────
    // switchCompany dispara reload → authenticated reset →
    // re-autenticar.
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Admin');
    await page.getByPlaceholder('Senha').fill('Clayton2024');
    await page.getByRole('button', { name: /^Entrar$/ }).click();
    await expect(
      page.getByRole('heading', { name: /Painel Admin/ })
    ).toBeVisible({ timeout: 15_000 });

    // 3 sections vazias em PN → textos vazios aparecem
    await expect.soft(
      page.getByText(/Nenhum registro encontrado/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect.soft(
      page.getByText(/Nenhuma tentativa registrada/i)
    ).toBeVisible();
    await expect.soft(
      page.getByText(/Nenhuma tentativa encontrada/i)
    ).toBeVisible();
  });
});
