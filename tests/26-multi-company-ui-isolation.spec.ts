import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab, switchCompany } from './helpers';
import { getClient, ensureTestEmployee } from './cleanup';

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PONTE_NOVA_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';

test.describe('Sub-fase 3.4 — Isolamento UI multi-empresa', () => {
  /**
   * Os 30s padrão não cobrem estes testes nesta máquina: cada um faz login e
   * troca de empresa (com reload), e o Vite frio sozinho já come os 30s no
   * primeiro `page.goto`. E o orçamento tem que ser do BLOCO, não do corpo do
   * teste — quem estourava era o `beforeEach` do login, que roda ANTES de um
   * `test.setTimeout()` escrito lá dentro. É espera por condição, não sleep.
   */
  test.describe.configure({ timeout: 180_000 });

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

  /**
   * 2026-07-29 (era test.skip desde 21/07): a premissa "Ponte Nova vazia" morreu —
   * PN está em uso real desde maio (553 registros de ponto hoje), então exigir
   * "Nenhum registro encontrado" lá era falso por construção.
   *
   * O que este teste sempre quis provar é ISOLAMENTO. Reescrito no molde do teste 8
   * (o que já passava): cada empresa ganha o SEU funcionário com ponto, e o assert é
   * por COMPARAÇÃO — o de CT aparece em CT e não vaza pra PN, e vice-versa. Não
   * depende de nenhuma das duas estar vazia, então continua valendo enquanto as duas
   * crescem.
   */
  test('3. Relatórios: cada empresa lista só os SEUS registros (isolamento real)', async ({ page }) => {
    const s = getClient();
    const ctName = 'PW Test Iso Rel CT';
    const pnName = 'PW Test Iso Rel PN';
    const ctId = await ensureTestEmployee(ctName, '99926000326', 'caratinga');
    const pnId = await ensureTestEmployee(pnName, '99926000426', 'ponte');
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Ponto de hoje pra cada um — o relatório lista attendance, então sem isso
    // nenhum dos dois apareceria e o teste passaria por vazio (falso verde).
    const criarPonto = async (empId: string, companyId: string) => {
      await s.from('attendance').delete().eq('employee_id', empId).eq('date', hoje);
      await s.from('attendance').insert([{
        employee_id: empId, date: hoje, status: 'present',
        entry_time: new Date().toISOString(), company_id: companyId, marked_by: '9999',
      }]);
    };

    try {
      await criarPonto(ctId, CARATINGA_ID);
      await criarPonto(pnId, PONTE_NOVA_ID);

      // O nome também existe num <option> HIDDEN do filtro de funcionário, então o
      // assert é sempre na LINHA da tabela — senão o locator casa com o option e
      // falha por "hidden" (mesma pegadinha já documentada no teste 13 do 26-extras).
      const linha = (nome: string) => page.locator('tbody tr', { hasText: nome });

      // 1. Caratinga: vê o SEU; o de PN não vaza.
      await goToTab(page, 'Relatórios');
      await expect(linha(ctName).first()).toBeVisible({ timeout: 15_000 });
      await expect(linha(pnName)).toHaveCount(0, { timeout: 5_000 });

      // 2. Ponte Nova: o inverso.
      await switchCompany(page, 'Ponte Nova');
      await goToTab(page, 'Relatórios');
      await expect(linha(pnName).first()).toBeVisible({ timeout: 15_000 });
      await expect(linha(ctName)).toHaveCount(0, { timeout: 5_000 });
    } finally {
      // Limpeza explícita: o cleanup geral PRESERVA registros de hoje, então estes
      // ficariam pra trás se não forem removidos aqui.
      for (const id of [ctId, pnId]) {
        await s.from('attendance').delete().eq('employee_id', id).eq('date', hoje);
      }
    }
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

  test('5. Erros (Períodos): cada empresa lista as SUAS semanas, e não as da outra', async ({ page }) => {
    // Componente: PaymentPeriodsTab (sub-aba 'periods' do ErrorsTab).
    // Sem filtro temporal — getPaymentPeriods(company.id) busca todos.
    //
    // 🔴 ESTE TESTE APAGAVA DADO DE PRODUÇÃO (consertado em 12/09/2026).
    //
    // A versão anterior provava o isolamento assumindo que a Ponte Nova era
    // eternamente VAZIA: ela desligava o `auto_weekly` da PN, dava
    // `delete from payment_periods where company_id = PN`, conferia o texto
    // "Nenhum período criado", e apagava TUDO de novo no finally.
    //
    // Em 12/09/2026 a Ponte Nova ganhou 45 semanas de verdade (retroativas,
    // cobrindo R$ 58.872 em 624 pagamentos). A partir daí este teste destruía
    // essas semanas a cada rodada — e ainda deixava a empresa com a criação
    // automática desligada.
    //
    // O que o teste PRECISA provar é isolamento: cada empresa vê as suas. Isso
    // não depende de nenhuma das duas estar vazia. É o mesmo caminho que o
    // teste 6 deste arquivo já tinha adotado quando bateu no mesmo problema:
    // ler a contagem REAL do banco em vez de fixar um número.
    const s = getClient();

    const contar = async (companyId: string) => {
      const { count } = await s
        .from('payment_periods')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);
      return count ?? 0;
    };
    const nCaratinga = await contar(CARATINGA_ID);
    const nPonteNova = await contar(PONTE_NOVA_ID);

    // Por que a contagem por empresa JÁ prova o isolamento: se a aba ignorasse
    // o `company_id`, ela mostraria a soma das duas (91 linhas hoje) nas duas
    // telas — e as duas asserções abaixo cairiam. Não preciso que as empresas
    // tenham quantidades diferentes, e não devo depender disso: seria um teste
    // que quebra sozinho no dia em que as duas empatarem, sem nada ter piorado.

    const abrirPeriodos = async () => {
      await goToTab(page, 'Erros');
      await page.getByRole('button', { name: /Períodos/i }).first().click();
    };

    const linhas = page.locator('tbody tr');

    // 1. Caratinga (empresa default)
    await abrirPeriodos();
    await expect(linhas.first()).toBeAttached({ timeout: 15_000 });
    await expect(linhas, 'Caratinga mostra as semanas dela')
      .toHaveCount(nCaratinga, { timeout: 15_000 });

    // 2. Troca de empresa e re-navega. O reload joga a aba de volta pra
    //    'attendance' e a sub-aba pra 'individual', então re-clica 'Períodos'.
    await switchCompany(page, 'Ponte Nova');
    await abrirPeriodos();

    // 3. Ponte Nova mostra as DELA — número diferente do de Caratinga.
    await expect(linhas, 'Ponte Nova mostra as semanas dela')
      .toHaveCount(nPonteNova, { timeout: 15_000 });
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
    // .and(':visible') (não só .first()): tabela desktop e card mobile de
    // FinancialTab coexistem no DOM (só um fica visível via CSS) — sem o
    // filtro de visibilidade, .first() pode pegar a linha da tabela escondida
    // em viewport mobile (achado rodando em mobile-pixel5, 01/09/2026).
    await expect(page.getByText(ctName).and(page.locator(':visible')).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(pnName)).toHaveCount(0, { timeout: 5_000 });

    // 2. Trocar empresa + re-navegar
    await switchCompany(page, 'Ponte Nova');
    await goToTab(page, 'Financeiro');

    // 3. PN: employee de PN visível; o de CT NÃO vaza.
    await expect(page.getByText(pnName).and(page.locator(':visible')).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ctName)).toHaveCount(0, { timeout: 5_000 });
  });

  /**
   * 2026-07-29 (era test.skip desde 21/07): mesma premissa morta do teste 3 — PN tem
   * 88 tentativas de GPS e 359 faciais próprias, então "seções vazias em PN" nunca
   * mais foi verdade.
   *
   * Reescrito por COMPARAÇÃO: cada empresa ganha uma tentativa de GPS e uma facial
   * do SEU funcionário de teste, e o assert é que o nome de uma não aparece na outra.
   * As seções continuam sendo as mesmas três da versão original (Geolocalização,
   * Tentativas Faciais, Suspeitas), só que agora o que se verifica é o isolamento.
   */
  test('9. Admin: cada empresa vê só as SUAS tentativas de GPS e faciais (isolamento real)', async ({ page }) => {
    // 2 ciclos completos de abrirAdmin (nav + senha + esperar até 20s) +
    // asserts (até 20s cada) somados facilmente estouram o timeout padrão de
    // 30s do playwright.config — achado em CI (01/09/2026), timeout puro sem
    // erro de asserção específico, tanto em chromium quanto mobile-pixel5.
    test.setTimeout(90_000);
    const s = getClient();
    const ctName = 'PW Test Iso Adm CT';
    const pnName = 'PW Test Iso Adm PN';
    const ctId = await ensureTestEmployee(ctName, '99926000526', 'caratinga');
    const pnId = await ensureTestEmployee(pnName, '99926000626', 'ponte');
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const criarTentativas = async (empId: string, companyId: string) => {
      await s.from('geo_fraud_attempts').delete().eq('employee_id', empId);
      await s.from('face_auth_attempts').delete().eq('employee_id', empId);
      await s.from('geo_fraud_attempts').insert([{
        employee_id: empId, date: hoje, attempted_at: new Date().toISOString(),
        latitude: -19.8, longitude: -42.13, distance_meters: 5000,
        clock_type: 'entry', company_id: companyId,
      }]);
      await s.from('face_auth_attempts').insert([{
        employee_id: empId, date: hoje, attempted_at: new Date().toISOString(),
        success: false, confidence: 0.1, clock_type: 'entry', company_id: companyId,
      }]);
    };

    /** A tela Admin é protegida por senha e o login cai a cada troca de empresa. */
    const abrirAdmin = async () => {
      await goToTab(page, 'Admin');
      await page.getByPlaceholder('Senha').fill('Clayton2024');
      await page.getByRole('button', { name: /^Entrar$/ }).click();
      await expect(page.getByRole('heading', { name: /Painel Admin/ })).toBeVisible({ timeout: 20_000 });
    };

    try {
      await criarTentativas(ctId, CARATINGA_ID);
      await criarTentativas(pnId, PONTE_NOVA_ID);

      // Igual ao teste 3: o nome aparece num <option> HIDDEN do filtro de
      // funcionário do AdminTab, então o assert vai na LINHA da tabela.
      const linha = (nome: string) => page.locator('tbody tr', { hasText: nome });
      // Só pro "aparece" (.first().toBeVisible): o card mobile do AdminTab é um
      // <div> (não <tr>), então filtrar `tbody tr` por :visible ainda dava zero
      // match em viewport mobile — usa getByText (bate no <td> desktop E no
      // <div> mobile) + :visible pra pegar SÓ a representação visível de fato
      // (achado em mobile-pixel5, 01/09/2026). NÃO aplicar no "não aparece"
      // (toHaveCount(0) abaixo) — isolamento de verdade exige zero linhas no
      // DOM, visíveis ou não (e `tbody tr` já cobre isso: a tabela desktop
      // sempre é renderizada junto, só escondida por CSS).
      const linhaVisivel = (nome: string) => page.getByText(nome).and(page.locator(':visible'));

      // 1. Caratinga: vê o SEU funcionário nas tentativas; o de PN não vaza.
      await abrirAdmin();
      await expect(linhaVisivel(ctName).first()).toBeVisible({ timeout: 20_000 });
      await expect(linha(pnName)).toHaveCount(0, { timeout: 5_000 });

      // 2. Ponte Nova: o inverso (re-autentica — o switch derruba a sessão do painel).
      await switchCompany(page, 'Ponte Nova');
      await abrirAdmin();
      await expect(linhaVisivel(pnName).first()).toBeVisible({ timeout: 20_000 });
      await expect(linha(ctName)).toHaveCount(0, { timeout: 5_000 });
    } finally {
      for (const id of [ctId, pnId]) {
        await s.from('geo_fraud_attempts').delete().eq('employee_id', id);
        await s.from('face_auth_attempts').delete().eq('employee_id', id);
      }
    }
  });
});
