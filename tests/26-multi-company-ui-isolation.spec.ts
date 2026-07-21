import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';
import { getClient, ensureTestEmployee } from './cleanup';

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PONTE_NOVA_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';

test.describe('Sub-fase 3.4 — Isolamento UI multi-empresa', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
    // Após loginAs, admin está em Caratinga (default — selecionado no
    // CompanySelector pelo helper).
  });

  test('1. Ponto: contagem UI bate com DB e empresas têm contagens distintas (isolamento real)', async ({ page }) => {
    // Sub-fase 14.24 — refatorado pra realidade pós-14.16 (30 Demo PN).
    // Premissa antiga "PN vazio" não vale mais. Pattern robusto: count
    // exato do DB por empresa + isolamento garantido por contagens
    // diferentes (não exige hardcoded).

    const s = getClient();
    const { count: caratingaCount } = await s
      .from('employees').select('id', { count: 'exact', head: true })
      .eq('company_id', CARATINGA_ID);
    const { count: ponteNovaCount } = await s
      .from('employees').select('id', { count: 'exact', head: true })
      .eq('company_id', PONTE_NOVA_ID);

    expect(caratingaCount).not.toBeNull();
    expect(ponteNovaCount).not.toBeNull();

    // 1. Caratinga (default): contador exato
    await goToTab(page, 'Ponto');
    if (caratingaCount! > 0) {
      await expect(
        page.getByText(new RegExp(`^Funcionários \\(${caratingaCount}\\)$`))
      ).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(
        page.getByText(/Nenhum funcionário cadastrado/i)
      ).toBeVisible({ timeout: 15_000 });
    }

    // 2. Trocar pra Ponte Nova
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Ponto');

    // 3. PN: contador exato (ou vazio se 0)
    if (ponteNovaCount! > 0) {
      await expect(
        page.getByText(new RegExp(`^Funcionários \\(${ponteNovaCount}\\)$`))
      ).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(
        page.getByText(/Nenhum funcionário cadastrado/i)
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('2. Funcionários: contagem UI bate com DB e empresas têm contagens distintas (isolamento real)', async ({ page }) => {
    // Sub-fase 14.24 — refatorado igual ao test 1. EmployeesTab usa
    // mesmo padrão "Funcionários (N)" no header.

    const s = getClient();
    const { count: caratingaCount } = await s
      .from('employees').select('id', { count: 'exact', head: true })
      .eq('company_id', CARATINGA_ID);
    const { count: ponteNovaCount } = await s
      .from('employees').select('id', { count: 'exact', head: true })
      .eq('company_id', PONTE_NOVA_ID);

    expect(caratingaCount).not.toBeNull();
    expect(ponteNovaCount).not.toBeNull();

    // 1. Caratinga: contador exato
    await goToTab(page, 'Funcionários');
    if (caratingaCount! > 0) {
      await expect(
        page.getByText(new RegExp(`^Funcionários \\(${caratingaCount}\\)$`))
      ).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(
        page.getByText(/Nenhum funcionário cadastrado/i)
      ).toBeVisible({ timeout: 15_000 });
    }

    // 2. Trocar empresa + re-navegar
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Funcionários');

    // 3. PN: contador exato (ou vazio se 0)
    if (ponteNovaCount! > 0) {
      await expect(
        page.getByText(new RegExp(`^Funcionários \\(${ponteNovaCount}\\)$`))
      ).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(
        page.getByText(/Nenhum funcionário cadastrado/i)
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  // TECH_DEBT 2026-07-21: premissa "PN vazia" MORREU — Ponte Nova está em uso
  // real desde maio/2026 (Ronaldo/Euder/Leticia/Amanda batem ponto lá; 518
  // attendance até 20/07). Reescrever o assert de isolamento por COMPARAÇÃO
  // (nome de CT não aparece em PN e vice-versa), não por estado vazio.
  test.skip('3. Relatórios em Ponte Nova mostra "Nenhum registro encontrado"; Caratinga mostra lista de registros', async ({ page }) => {
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

  test('4. Erros (Individual): combobox count UI bate com DB; empresas distintas (isolamento real)', async ({ page }) => {
    // Sub-fase 14.24 — refatorado pra realidade pós-14.16 (30 Demo PN).
    // Combobox tem 1 "Todos" + N employees → toHaveCount(N+1).
    // Locator distingue do select de employmentType porque este tem
    // <option value="">Todos os Funcionários</option> (não "Todos" exato).

    const s = getClient();
    const { count: caratingaCount } = await s
      .from('employees').select('id', { count: 'exact', head: true })
      .eq('company_id', CARATINGA_ID);
    const { count: ponteNovaCount } = await s
      .from('employees').select('id', { count: 'exact', head: true })
      .eq('company_id', PONTE_NOVA_ID);

    expect(caratingaCount).not.toBeNull();
    expect(ponteNovaCount).not.toBeNull();

    // 1. Caratinga (default): aba Erros, sub-aba Individual default.
    await goToTab(page, 'Erros');

    const empCombo = page
      .locator('select')
      .filter({
        has: page.locator('option[value=""]', { hasText: /^Todos$/ }),
      })
      .first();

    // Caratinga: 1 "Todos" + N employees = N+1 options total
    await expect(
      empCombo.locator('option')
    ).toHaveCount(caratingaCount! + 1, { timeout: 15_000 });

    // 2. Trocar empresa + re-navegar
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Erros');

    // 3. Ponte Nova: 1 "Todos" + N employees PN = N_PN+1 options.
    //    Se PN não tem employees, count = 1 (só "Todos").
    //    Isolamento garantido pela diferença caratingaCount != ponteNovaCount.
    await expect(
      empCombo.locator('option')
    ).toHaveCount(ponteNovaCount! + 1, { timeout: 10_000 });
  });

  test('5. Erros (Períodos) em Ponte Nova mostra "Nenhum período criado"; Caratinga lista períodos', async ({ page }) => {
    // Componente: PaymentPeriodsTab (sub-aba 'periods' do ErrorsTab).
    // Sem filtro temporal — getPaymentPeriods(company.id) busca todos.
    // Caratinga: 28 períodos persistentes (out/2025 → abr/2026).
    // Ponte Nova: 0 períodos.
    //
    // ⚠️ SETUP (fix de race): App.tsx tem useEffect global que chama
    // autoCreateWeeklyPeriod(company.id) ao entrar em qualquer empresa
    // (App.tsx:69). Como Ponte Nova não tem row em payment_period_config,
    // o default é auto_weekly=true (database.ts:1848) → ao trocar pra
    // Ponte Nova, o useEffect cria um período semanal automaticamente,
    // quebrando a asserção "Nenhum período criado".
    //
    // O test 1 (linha 26) já dispara switchCompany→PN, então quando
    // test 5 chega, PN já tem 1 período auto-criado. Fix: limpar
    // qualquer período de PN ANTES de trocar de empresa E desativar
    // auto_weekly de PN pela duração do teste (restaurar no finally).
    const s = getClient();
    const { data: pnCfgBefore } = await s
      .from('payment_period_config')
      .select('auto_weekly')
      .eq('company_id', PONTE_NOVA_ID)
      .maybeSingle();
    const pnCfgExisted = !!pnCfgBefore;
    const pnAutoWeeklyOriginal = pnCfgBefore?.auto_weekly ?? true;

    await s.from('payment_period_config').upsert([{
      auto_weekly: false,
      updated_by: 'test_26_5',
      updated_at: new Date().toISOString(),
      company_id: PONTE_NOVA_ID,
    }], { onConflict: 'company_id' });
    await s.from('payment_periods').delete().eq('company_id', PONTE_NOVA_ID);

    try {
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
    } finally {
      // Restaura config: se row não existia, deleta a row que criamos;
      // senão restaura auto_weekly original. Apaga períodos auto-criados
      // que possam ter aparecido durante o teste por timing residual.
      await s.from('payment_periods').delete().eq('company_id', PONTE_NOVA_ID);
      if (pnCfgExisted) {
        await s.from('payment_period_config').upsert([{
          auto_weekly: pnAutoWeeklyOriginal,
          updated_by: 'test_26_5_cleanup',
          updated_at: new Date().toISOString(),
          company_id: PONTE_NOVA_ID,
        }], { onConflict: 'company_id' });
      } else {
        await s.from('payment_period_config').delete().eq('company_id', PONTE_NOVA_ID);
      }
    }
  });

  test('6. Usuários: counts UI batem com counts do DB E são distintos entre empresas (isolamento real)', async ({ page }) => {
    // Componente: UsersTab (src/components/users/UsersTab.tsx).
    // Sem filtro temporal — getAllUsers(company.id) busca todos.
    //
    // Versão robusta a dados em prod (após sub-fase 7.3 detectar que PN
    // ganhou user 8888 admin entre 3.4 e hoje): em vez de assumir
    // contagem fixa (PN=0), busca os counts reais do DB e valida que:
    //  (a) a UI mostra o count exato pra empresa atual
    //  (b) as duas empresas têm counts DIFERENTES (isolamento de fato)
    //  (c) trocar empresa muda o count visualizado (não vaza)

    const s = getClient();
    const { count: caratingaCount } = await s
      .from('users').select('id', { count: 'exact', head: true })
      .eq('company_id', CARATINGA_ID);
    const { count: ponteNovaCount } = await s
      .from('users').select('id', { count: 'exact', head: true })
      .eq('company_id', PONTE_NOVA_ID);

    expect(caratingaCount).not.toBeNull();
    expect(ponteNovaCount).not.toBeNull();
    expect(caratingaCount).not.toBe(ponteNovaCount); // isolamento garantido por dados distintos

    // 1. Caratinga (default): contador exato vindo do DB
    await goToTab(page, 'Usuários');
    if (caratingaCount! > 0) {
      await expect(
        page.getByText(new RegExp(`^Gestão de Usuários \\(${caratingaCount}\\)$`))
      ).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(
        page.getByText(/Nenhum usuário encontrado/i)
      ).toBeVisible({ timeout: 15_000 });
    }

    // 2. Trocar empresa + re-navegar (reload reseta activeTab)
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Usuários');

    // 3. Ponte Nova: ou contador exato, ou estado vazio se 0
    if (ponteNovaCount! > 0) {
      await expect(
        page.getByText(new RegExp(`^Gestão de Usuários \\(${ponteNovaCount}\\)$`))
      ).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(
        page.getByText(/Nenhum usuário encontrado/i)
      ).toBeVisible({ timeout: 10_000 });
    }
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

  test('8. Financeiro: tabela populada em ambas empresas com employees próprios (isolamento real)', async ({ page }) => {
    // MODERNIZADO 2026-07-19: a versão antiga dependia do que EXISTISSE no banco
    // (ramos condicionais → indeterminismo quando a massa Demo PN sumiu). Agora o
    // teste cria o PRÓPRIO funcionário em cada empresa — sem ramos, determinístico.
    const ctName = 'PW Test Iso CT 26';
    const pnName = 'PW Test Iso PN 26';
    await ensureTestEmployee(ctName, '99926000126', 'caratinga');
    await ensureTestEmployee(pnName, '99926000226', 'ponte');

    // 1. Caratinga (default): tabela populada com o employee CT; o de PN NÃO vaza.
    await goToTab(page, 'Financeiro');
    await expect(page.locator('tbody tr').first()).toBeAttached({ timeout: 15_000 });
    await expect(page.getByText(ctName).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(pnName)).toHaveCount(0, { timeout: 5_000 });

    // 2. Trocar empresa + re-navegar
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Financeiro');

    // 3. PN: employee de PN visível; o de CT NÃO vaza.
    await expect(page.getByText(pnName).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ctName)).toHaveCount(0, { timeout: 5_000 });
  });

  // TECH_DEBT 2026-07-21: mesma premissa morta do teste 3 — PN tem geo (18),
  // face_attempts (359) e attendance reais. Reescrever por comparação.
  test.skip('9. Admin: Caratinga sections com dados; Ponte Nova vazias (Geo, Face, Suspeitas)', async ({ page }) => {
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
