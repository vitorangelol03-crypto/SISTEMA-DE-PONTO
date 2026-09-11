import { test, expect, Page } from '@playwright/test';
import { jsPDF } from 'jspdf';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — NOTA DIVIDIDA no portal do entregador, com CLIQUES REAIS e PDFs de verdade.
 *
 * 🔴 REESCRITO EM 10/09/2026 — A DIVISÃO VIROU DE LADO.
 * A Shopee e a iMile não aceitam nota misturada: "a Shopee não pode misturar com a
 * nota que vai no CNPJ da iMile, e vice-versa". Até 09/09 a dupla era UMA METADE EM
 * CADA TOMADOR, sobre o total somado — o que jogava dinheiro de um CNPJ na nota do
 * outro (caso real do GESSILEY em 06/09). Agora a divisão é DENTRO de um CNPJ: o
 * valor daquele CNPJ, partido entre as DUAS PESSOAS cadastradas.
 *
 * O que este arquivo prova:
 *   1. cada CARTÃO (CNPJ) escolhe sozinho entre nota inteira e dividida, com o valor
 *      DAQUELE CNPJ na frente
 *   2. a divisão é meio a meio dentro do CNPJ, sempre
 *   3. 🎯 a metade do total COMBINADO — o valor que o sistema mandava emitir até
 *      09/09 — passou a ser RECUSADA
 *   4. a 2ª nota tem que ser do MESMO CNPJ tomador e de OUTRA pessoa
 *   5. com uma dupla em andamento, o outro CNPJ fica travado (um de cada vez)
 *   6. a nota do LÍDER tem que cobrir o GRUPO (a parte só dele não vale)
 *
 * ⚠️ Fala com a edge fn `driver-public-api` DEPLOYADA — é o único jeito de provar a
 * conferência de verdade (ela roda lá). PDF com texto de verdade (jsPDF), não fixture.
 *
 * Cenário (números escolhidos pra dividir redondo):
 *   líder  : eMile 150 × R$ 2,00 = R$ 300,00  ·  SHOPEE 200 × R$ 2,20 = R$ 440,00
 *   membro : SHOPEE 100 × R$ 2,20 = R$ 220,00
 *   → iMile = R$ 300,00 (dividido: 150 + 150)
 *   → Shopee/Anjun/Loggi = R$ 660,00 (dividido: 330 + 330)
 *   → R$ 480,00 (metade do combinado) NÃO é valor válido de nota nenhuma
 */

const RUN = Date.now().toString(36);
const PREF = TEST_EMPLOYEE_NAME_PREFIX;
const COMPANY = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc'; // Caratinga
const BUCKET = 'driverpay-nota-fiscais';

const CNPJ_IMILE = '53.824.315/0001-10';
const CNPJ_SHOPEE = '11.802.464/0001-38';

/** Os dois emissores CADASTRADOS na ficha do driver (nome + CNPJ). */
const EMISSOR_A = { nome: `${PREF}Emissor Um ${RUN}`, cnpj: '12.345.678/0001-95' };
const EMISSOR_B = { nome: `${PREF}Emissor Dois ${RUN}`, cnpj: '98.765.432/0001-10' };

const TOTAL_GRUPO = 960.0;
const TOTAL_SHOPEE = 660.0;   // 200×2,20 do líder + 100×2,20 do membro
const TOTAL_IMILE = 300.0;    // 150×2,00 do líder
const FATIA_SHOPEE = 330.0;
const FATIA_IMILE = 150.0;
/** 🔴 A metade do total COMBINADO: o que o sistema mandava emitir até 09/09. */
const FATIA_MISTURADA = 480.0;
const SO_DO_LIDER_SHOPEE = 440.0; // o valor que o sistema aceitava errado até 05/09

const SENHA_NOVA = 'pwtest2026';
const CPF_LIDER = '99922200011';

const db = getClient();
const criados = { periodos: [] as string[], drivers: [] as string[], grupos: [] as string[] };

/** Um PDF de nota com texto de verdade — o robô lê o texto, não a imagem. */
function notaPdf(opts: { valor: number; emitenteNome: string; emitenteCnpj: string; tomadorCnpj: string }): Buffer {
  const doc = new jsPDF();
  const valorBr = opts.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const linhas = [
    'DANFSe v1.0 - Documento Auxiliar da NFS-e',
    'Municipio de Caratinga',
    'EMITENTE DA NFS-e / Prestador do Servico',
    'CNPJ / CPF / NIF',
    opts.emitenteCnpj,
    'Nome / Nome Empresarial',
    opts.emitenteNome,
    'TOMADOR DO SERVICO',
    'Nome / Nome Empresarial',
    'CD LOGISTICA LTDA',
    'CNPJ / CPF / NIF',
    opts.tomadorCnpj,
    'SERVICO PRESTADO',
    '16.02.01 - Outros servicos de transporte de natureza municipal.',
    'VALOR TOTAL DA NFS-E',
    `Valor do Servico R$ ${valorBr}`,
    `Valor Liquido da NFS-e R$ ${valorBr}`,
  ];
  linhas.forEach((l, i) => doc.text(l, 10, 15 + i * 8));
  return Buffer.from(doc.output('arraybuffer'));
}

/** "660" → "R$ 660,00" — as asserções da tela saem dos MESMOS números do cenário. */
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** O cartão daquele CNPJ na tela de anexar nota. */
function cartao(page: Page, cnpj: string) {
  return page.locator('div.bg-white.rounded-xl').filter({ hasText: `CNPJ ${cnpj}` }).first();
}

/**
 * Escolhe "dividir" NAQUELE cartão (10/09/2026: a escolha deixou de ser uma só pra
 * quinzena e passou a ser por CNPJ — dá pra dividir a Shopee e mandar a iMile inteira).
 */
async function escolherDividir(page: Page, cnpj: string) {
  await cartao(page, cnpj).getByRole('button', { name: /Dividir em 2 notas/i }).click();
}

/** Envia o PDF pelo input do cartão daquele CNPJ. */
async function enviarNota(page: Page, cnpjDoCartao: string, pdf: Buffer) {
  await cartao(page, cnpjDoCartao).locator('input[type="file"]').setInputFiles({
    name: `nota-${Date.now()}.pdf`, mimeType: 'application/pdf', buffer: pdf,
  });
}

/** Apaga as notas do líder (os testes seriais precisam começar do zero). */
async function limparNotas() {
  const { data } = await db.from('driverpay_nota_fiscal_files')
    .select('file_path').eq('driver_id', criados.drivers[0]);
  if (data?.length) await db.storage.from(BUCKET).remove(data.map((n) => n.file_path));
  await db.from('driverpay_nota_fiscal_files').delete().eq('driver_id', criados.drivers[0]);
}

async function entrarNoPortal(page: Page, cpf: string) {
  await page.goto('/driver', { timeout: 120_000, waitUntil: 'domcontentloaded' });
  const entrar = async (senha: string): Promise<boolean> => {
    await page.getByPlaceholder('Somente numeros').fill(cpf);
    await page.getByPlaceholder(/primeira vez: 1234/).fill(senha);
    await page.getByRole('button', { name: /Entrar/i }).click();
    const chegou = page.getByRole('button', { name: /Sair/i });
    const trocaSenha = page.getByPlaceholder('Ao menos 4 caracteres');
    try {
      await expect(chegou.or(trocaSenha).first()).toBeVisible({ timeout: 25_000 });
      return true;
    } catch { return false; }
  };
  if (!(await entrar('1234'))) {
    expect(await entrar(SENHA_NOVA), `login de ${cpf}`).toBe(true);
  }
  const novaSenha = page.getByPlaceholder('Ao menos 4 caracteres');
  if (await novaSenha.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await novaSenha.fill(SENHA_NOVA);
    await page.getByPlaceholder('Digite de novo').fill(SENHA_NOVA);
    await page.getByRole('button', { name: /Salvar|Trocar|Confirmar|Continuar/i }).first().click();
  }
  await expect(page.getByRole('button', { name: /Sair/i })).toBeVisible({ timeout: 30_000 });
}

test.describe('Nota dividida — portal do entregador (05/09/2026)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const { data: per } = await db.from('driverpay_periods').insert({
      company_id: COMPANY, label: `${PREF}Dividida ${RUN}`,
      start_date: '2026-08-01', end_date: '2026-08-15', status: 'aberto', created_by: '2626',
    }).select('id').single();
    criados.periodos.push(per!.id);

    const criarDriver = async (nome: string, cpf: string | null) => {
      const { data } = await db.from('driverpay_drivers').insert({
        company_id: COMPANY, name: `${PREF}${nome} ${RUN}`, cpf, active: true, created_by: '2626',
      }).select('id').single();
      criados.drivers.push(data!.id);
      return data!.id;
    };
    const lider = await criarDriver('Lider Dividida', CPF_LIDER);
    const membro = await criarDriver('Membro Dividida', null);

    const pagamento = async (driverId: string, nome: string) => {
      const { data } = await db.from('driverpay_payments').insert({
        company_id: COMPANY, period_id: per!.id, driver_id: driverId,
        driver_name_snapshot: `${PREF}${nome} ${RUN}`,
      }).select('id').single();
      return data!.id;
    };
    const payLider = await pagamento(lider, 'Lider Dividida');
    const payMembro = await pagamento(membro, 'Membro Dividida');

    await db.from('driverpay_payment_packages').insert([
      { company_id: COMPANY, payment_id: payLider, platform_name: 'eMile', route: '', packages: 150, rate_snapshot: 2.0 },
      { company_id: COMPANY, payment_id: payLider, platform_name: 'SHOPEE', route: '', packages: 200, rate_snapshot: 2.2 },
      { company_id: COMPANY, payment_id: payMembro, platform_name: 'SHOPEE', route: '', packages: 100, rate_snapshot: 2.2 },
    ]);

    const { data: grp } = await db.from('driverpay_groups').insert({
      company_id: COMPANY, name: `${PREF}Grupo Dividida ${RUN}`, leader_driver_id: lider,
    }).select('id').single();
    criados.grupos.push(grp!.id);
    await db.from('driverpay_group_members').insert([
      { company_id: COMPANY, group_id: grp!.id, driver_id: lider },
      { company_id: COMPANY, group_id: grp!.id, driver_id: membro },
    ]);

    // Espelho do GRUPO publicado (é ele que gera os 2 cartões de CNPJ).
    await db.from('driverpay_mirror_publications').insert({
      company_id: COMPANY, period_id: per!.id, driver_id: lider, scope: 'group',
      group_id: grp!.id, platform_filter: null, platform_key: '',
      pdf_path: `${COMPANY}/${per!.id}/${lider}-teste.pdf`,
      delivered_at: new Date().toISOString(), delivered_by: '2626',
      include_deductions: true, printed_total: TOTAL_GRUPO,
    });

    // A HABILITAÇÃO da divisão: os 2 emissores cadastrados, com nome E CNPJ.
    await db.from('driverpay_driver_nota_names').insert([
      { company_id: COMPANY, driver_id: lider, name: EMISSOR_A.nome, cnpj: EMISSOR_A.cnpj, created_by: '2626' },
      { company_id: COMPANY, driver_id: lider, name: EMISSOR_B.nome, cnpj: EMISSOR_B.cnpj, created_by: '2626' },
    ]);
  });

  test.afterAll(async () => {
    for (const id of criados.drivers) {
      const { data: notas } = await db.from('driverpay_nota_fiscal_files').select('file_path').eq('driver_id', id);
      if (notas?.length) await db.storage.from(BUCKET).remove(notas.map((n) => n.file_path));
      await db.from('driverpay_nota_fiscal_files').delete().eq('driver_id', id);
      await db.from('driverpay_driver_nota_names').delete().eq('driver_id', id);
      await db.from('driverpay_mirror_publications').delete().eq('driver_id', id);
      await db.from('driverpay_driver_auth').delete().eq('driver_id', id);
      await db.from('driverpay_group_members').delete().eq('driver_id', id);
    }
    for (const id of criados.periodos) await db.from('driverpay_periods').delete().eq('id', id);
    for (const id of criados.grupos) await db.from('driverpay_groups').delete().eq('id', id);
    for (const id of criados.drivers) await db.from('driverpay_drivers').delete().eq('id', id);
  });

  test('A. cada CARTÃO escolhe sozinho, com o valor DAQUELE CNPJ na frente', async ({ page }) => {
    test.setTimeout(240_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();

    const shopee = cartao(page, CNPJ_SHOPEE);
    const imile = cartao(page, CNPJ_IMILE);
    await expect(shopee).toBeVisible({ timeout: 30_000 });

    // 1. Cada cartão mostra o valor DELE — nunca a soma dos dois.
    await expect(shopee.getByText(/Valor desta nota:/i)).toContainText(brl(TOTAL_SHOPEE));
    await expect(imile.getByText(/Valor desta nota:/i)).toContainText(brl(TOTAL_IMILE));

    // 2. A escolha está DENTRO do cartão, com as fatias daquele CNPJ.
    await expect(shopee.getByRole('button', { name: /Uma nota só/i })).toBeVisible();
    await expect(shopee.getByRole('button', { name: /Dividir em 2 notas/i })).toBeVisible();
    await expect(shopee.getByText(new RegExp(`${brl(FATIA_SHOPEE)}.*\\+.*${brl(FATIA_SHOPEE)}`.replace(/\$/g, '\\$')))).toBeVisible();
    await expect(imile.getByText(new RegExp(`${brl(FATIA_IMILE)}.*\\+.*${brl(FATIA_IMILE)}`.replace(/\$/g, '\\$')))).toBeVisible();

    // 3. 🎯 O valor da mistura (metade do combinado) não aparece em lugar nenhum.
    await expect(page.getByText(brl(FATIA_MISTURADA))).toHaveCount(0);

    // 4. Quem pode emitir, com nome E CNPJ, e o aviso de que cada CNPJ é separado.
    await expect(page.getByText(/Quem pode emitir as suas notas/i)).toBeVisible();
    await expect(page.getByText(/Cada cartão abaixo é uma nota separada/i)).toBeVisible();
    await expect(page.getByText(EMISSOR_A.cnpj, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(EMISSOR_B.cnpj, { exact: false }).first()).toBeVisible();

    // 5. Sem escolher, não existe botão de enviar naquele cartão.
    await expect(shopee.getByText(/Escolha uma das duas opções/i)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    // 6. A escolha é POR CARTÃO: dividir a Shopee não mexe na iMile.
    await escolherDividir(page, CNPJ_SHOPEE);
    await expect(shopee.locator('input[type="file"]')).toHaveCount(1);
    await expect(imile.getByText(/Escolha uma das duas opções/i)).toBeVisible();
  });

  test('B. 🎯 a metade do total COMBINADO (o erro de 06/09) é RECUSADA', async ({ page }) => {
    test.setTimeout(300_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await escolherDividir(page, CNPJ_SHOPEE);

    // R$ 480,00 = (660 + 300) / 2. Era EXATAMENTE o que o sistema mandava emitir até
    // 09/09 — e é o que jogava dinheiro da Shopee dentro da nota da iMile.
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA_MISTURADA, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/não bate com o valor|nao bate com o valor/i)).toBeVisible({ timeout: 90_000 });

    const { data } = await db.from('driverpay_nota_fiscal_files')
      .select('id').eq('driver_id', criados.drivers[0]);
    expect(data ?? [], 'nota recusada não pode ficar gravada').toHaveLength(0);
  });

  test('B2. valor errado é RECUSADO — inclusive a parte só do líder', async ({ page }) => {
    test.setTimeout(300_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await escolherDividir(page, CNPJ_SHOPEE);

    // R$ 440,00 = SHOPEE só do líder, sem o membro. O líder responde pelo grupo.
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: SO_DO_LIDER_SHOPEE, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/não bate com o valor|nao bate com o valor/i)).toBeVisible({ timeout: 90_000 });

    const { data } = await db.from('driverpay_nota_fiscal_files')
      .select('id').eq('driver_id', criados.drivers[0]);
    expect(data ?? []).toHaveLength(0);
  });

  test('C. CNPJ de quem emite fora do cadastro é RECUSADO', async ({ page }) => {
    test.setTimeout(300_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await escolherDividir(page, CNPJ_SHOPEE);

    // Valor CERTO, nome CERTO, mas emitida por um CNPJ que não é o cadastrado.
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA_SHOPEE, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: '11.111.111/0001-11', tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/não foi emitida pelo CNPJ cadastrado|nao foi emitida pelo CNPJ cadastrado/i))
      .toBeVisible({ timeout: 90_000 });

    const { data } = await db.from('driverpay_nota_fiscal_files')
      .select('id').eq('driver_id', criados.drivers[0]);
    expect(data ?? [], 'nota recusada não pode ficar gravada').toHaveLength(0);
  });

  /**
   * E. As 2 notas da dupla têm que ser de PESSOAS diferentes (trava de 07/09/2026).
   * Caso real: GESSILEY emitiu as duas no CNPJ do Joaerson e o pagamento saiu com as
   * duas metades no mesmo nome.
   */
  test('E. a 2ª nota do MESMO emissor da 1ª é RECUSADA', async ({ page }) => {
    test.setTimeout(420_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await escolherDividir(page, CNPJ_SHOPEE);

    // 1ª nota: emissor A, no CNPJ da Shopee — correta, abre a dupla.
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA_SHOPEE, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/1ª nota recebida/i)).toBeVisible({ timeout: 90_000 });

    // A tela diz QUEM tem que emitir a 2ª.
    await expect(page.getByText(/A 2ª tem que ser emitida por/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(EMISSOR_B.nome, { exact: false }).first()).toBeVisible();

    // 2ª nota: mesmo CNPJ tomador (certo), mas o MESMO EMISSOR da 1ª → recusa.
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA_SHOPEE, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/emitidas por PESSOAS diferentes/i)).toBeVisible({ timeout: 90_000 });

    const { data: notas } = await db.from('driverpay_nota_fiscal_files')
      .select('split_part, status, matched_cnpj').eq('driver_id', criados.drivers[0]);
    expect(notas ?? [], 'a 2ª do mesmo emissor não pode ser gravada').toHaveLength(1);
    expect(notas![0].split_part).toBe(1);
    expect(String(notas![0].matched_cnpj)).toBe(EMISSOR_A.cnpj.replace(/\D/g, ''));

    await limparNotas();
  });

  /**
   * F. 🎯 O CORAÇÃO DA MUDANÇA DE 10/09/2026: a 2ª nota NÃO pode ir pro outro CNPJ.
   * Era assim que o sistema funcionava até 09/09 — e é a mistura que a Shopee e a
   * iMile recusam. Enquanto a dupla da Shopee não fecha, o cartão da iMile fica
   * travado na tela (decisão do Victor: um CNPJ de cada vez).
   */
  test('F. a 2ª nota no OUTRO CNPJ é recusada, e o outro cartão fica travado', async ({ page }) => {
    test.setTimeout(420_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await escolherDividir(page, CNPJ_SHOPEE);

    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA_SHOPEE, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/1ª nota recebida/i)).toBeVisible({ timeout: 90_000 });

    // A tela TRAVA o outro CNPJ e explica o porquê — antes ela deixava clicar.
    const imile = cartao(page, CNPJ_IMILE);
    await expect(imile.getByText(/Termine as duas notas do cartão/i)).toBeVisible({ timeout: 30_000 });
    await expect(imile.locator('input[type="file"]')).toHaveCount(0);

    // E o aviso da 2ª está no MESMO cartão da 1ª, não no outro.
    await expect(cartao(page, CNPJ_SHOPEE).getByText(/Falta a 2ª/i)).toBeVisible();

    await limparNotas();
  });

  test('D. a dupla certa passa: R$ 330,00 + R$ 330,00 no MESMO CNPJ', async ({ page }) => {
    test.setTimeout(420_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await escolherDividir(page, CNPJ_SHOPEE);

    // 1ª nota: CNPJ da Shopee, emitida pelo emissor A
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA_SHOPEE, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/1ª nota recebida/i)).toBeVisible({ timeout: 90_000 });
    // NO CARTÃO DA SHOPEE, não na página: com a dupla aberta, o cartão da iMile
    // também escreve "Falta a 2ª" (ele é o que fica travado — é o que o caso F
    // prova). Procurar na página inteira achava os dois e o Playwright recusava
    // por strict mode. Os dois textos estão certos; a busca é que era ampla.
    await expect(cartao(page, CNPJ_SHOPEE).getByText(/Falta a 2ª/i)).toBeVisible({ timeout: 30_000 });

    // 2ª nota: MESMO CNPJ da Shopee, emitida pelo emissor B
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA_SHOPEE, emitenteNome: EMISSOR_B.nome,
      emitenteCnpj: EMISSOR_B.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/Dupla completa/i)).toBeVisible({ timeout: 90_000 });

    // No banco: 2 notas validadas, AS DUAS no CNPJ da Shopee, R$ 330,00 cada
    const { data: notas } = await db.from('driverpay_nota_fiscal_files')
      .select('status, read_value, nota_emitter_id, split_part, matched_name')
      .eq('driver_id', criados.drivers[0]).order('uploaded_at');
    expect(notas ?? []).toHaveLength(2);
    expect(notas!.every((n) => n.status === 'validada'), 'as duas têm que validar').toBe(true);
    expect(notas!.map((n) => Number(n.read_value))).toEqual([FATIA_SHOPEE, FATIA_SHOPEE]);
    // 🎯 O MESMO tomador nas duas — é isso que a Shopee e a iMile exigem.
    expect(new Set(notas!.map((n) => n.nota_emitter_id)).size, 'as 2 no MESMO CNPJ tomador').toBe(1);
    expect(notas!.map((n) => n.split_part)).toEqual([1, 2]);
    // E as duas somam o total DAQUELE CNPJ, não o combinado.
    expect(notas!.reduce((s, n) => s + Number(n.read_value), 0)).toBe(TOTAL_SHOPEE);

    // 09/09/2026 — a lista "Notas enviadas" mostra data E HORA. Antes saía só a data:
    // uma entregadora enviou às 20:34 com o corte às 17:00 do mesmo dia, leu "04/09/2026"
    // na tela e ficou convencida de que estava no prazo. A hora tem que aparecer.
    const comHora = page.getByText(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
    await expect(comHora.first()).toBeVisible({ timeout: 30_000 });
    expect(await comHora.count(), 'as 2 notas enviadas mostram data e hora').toBeGreaterThanOrEqual(2);

    // A iMile continua livre pra mandar a dela — o bloco dela é independente.
    await expect(cartao(page, CNPJ_IMILE).getByText(/Valor desta nota:/i)).toContainText(brl(TOTAL_IMILE));
  });
});
