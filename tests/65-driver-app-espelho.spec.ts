import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — PORTAL DO ENTREGADOR enviando o ESPELHO DO APP, com CLIQUES REAIS e a
 * FOTO REAL do Victor. Pedido dele em 04/08/2026: "teste todos os cenários possíveis".
 *
 * É o PRIMEIRO spec E2E do portal do entregador (/driver) do projeto.
 *
 * ⚠️ Este spec fala com a edge fn `driver-public-api` DEPLOYADA — é o único jeito
 * de provar a conferência de ponta a ponta (a leitura da imagem acontece lá). Cada
 * envio consome uma leitura da cota do Gemini (20/dia por modelo, com rodízio de 9).
 * Por isso são 4 envios, não mais: cada um cobre um desfecho diferente.
 *
 * OS CENÁRIOS
 *   A. sem solicitação  -> o portal não pede nada
 *   B. print CERTO      -> aceito, e o "Espelho conferido" fica marcado SOZINHO
 *   C. quantidade DIFERENTE da planilha -> aceito EM SILÊNCIO; o driver não vê nada
 *   D. print de OUTRA quinzena -> RECUSADO na hora, com o motivo na tela
 *   E. foto que não é a tela do app -> RECUSADO na hora
 *   F. reenvio depois da recusa -> funciona
 *   G. GRUPO -> o líder vê um cartão POR MEMBRO (um print por driver)
 *
 * Segurança: tudo com prefixo "PW Test ", em quinzenas descartáveis, apagado no
 * final — inclusive os arquivos que subiram pro bucket.
 */

const RUN = Date.now().toString(36);
const PREF = TEST_EMPLOYEE_NAME_PREFIX;
const COMPANY = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc'; // Caratinga
const PLAT = 'SHOPEE';
const BUCKET = 'driverpay-delivery-proofs';

/** O que a FOTO REAL mostra: "Encerrado (1808)", 2026/07/01 - 2026/07/15. */
const FOTO_PKGS = 1808;
const FOTO_INI = '2026-07-01';
const FOTO_FIM = '2026-07-15';

const FOTO_CERTA = path.resolve('tests', 'fixtures', 'espelho-shopee-real.jpg');
const FOTO_ERRADA = path.resolve('tests', 'fixtures', 'nao-e-a-tela.jpg');

/** Cada cenário tem seu driver, pra um não interferir no outro. */
const CPF = {
  certo: '99911100011',
  divergente: '99911100022',
  outraQuinzena: '99911100033',
  lider: '99911100044',
  membro: '99911100055',
};

/** Senha que o portal obriga a criar no 1o acesso (nao pode ser 1234). */
const SENHA_NOVA = 'pwtest2026';

const db = getClient();
const criados = { periodos: [] as string[], drivers: [] as string[], grupos: [] as string[] };

/** Cria quinzena + driver + pacotes + solicitação. Devolve os ids. */
async function cenario(opts: {
  label: string; cpf: string; nome: string;
  inicio: string; fim: string; pacotes: number; solicitar?: boolean;
}) {
  const { data: per } = await db.from('driverpay_periods').insert({
    company_id: COMPANY, label: `${PREF}${opts.label} ${RUN}`,
    start_date: opts.inicio, end_date: opts.fim, status: 'aberto', created_by: '2626',
  }).select('id').single();
  criados.periodos.push(per!.id);

  const { data: drv } = await db.from('driverpay_drivers').insert({
    company_id: COMPANY, name: `${PREF}${opts.nome} ${RUN}`, cpf: opts.cpf, active: true, created_by: '2626',
  }).select('id').single();
  criados.drivers.push(drv!.id);

  const { data: pay } = await db.from('driverpay_payments').insert({
    company_id: COMPANY, period_id: per!.id, driver_id: drv!.id,
    driver_name_snapshot: `${PREF}${opts.nome} ${RUN}`,
  }).select('id').single();

  await db.from('driverpay_payment_packages').insert({
    company_id: COMPANY, payment_id: pay!.id,
    platform_name: PLAT, route: '', packages: opts.pacotes, rate_snapshot: 2.0,
  });

  if (opts.solicitar !== false) {
    await db.from('driverpay_proof_requests').insert({
      company_id: COMPANY, period_id: per!.id, platform_name: PLAT, requested_by: '2626',
    });
  }
  return { periodId: per!.id, driverId: drv!.id, paymentId: pay!.id };
}

/** Entra no portal do entregador e abre a tela do espelho. */
async function entrarNoPortal(page: Page, cpf: string) {
  await page.goto('/driver', { timeout: 120_000, waitUntil: 'domcontentloaded' });
  // A senha inicial é "1234" e o portal OBRIGA a trocar no 1º acesso. Como o mesmo
  // driver entra em mais de um cenário, na segunda vez o "1234" já não vale — então
  // tenta a senha nova antes de desistir.
  const entrar = async (senha: string): Promise<boolean> => {
    await page.getByPlaceholder('Somente numeros').fill(cpf);
    await page.getByPlaceholder(/primeira vez: 1234/).fill(senha);
    await page.getByRole('button', { name: /Entrar/i }).click();
    // ⚠️ isVisible() NAO aceita timeout (retorna na hora). Esperar de verdade
    // exige waitFor/expect — foi o que fez o cenario B falhar na 1a versao.
    // ⚠️ NAO usar "Meus Pagamentos" como prova de que entrou: esse texto tambem
    // e o TITULO da tela de login, entao dava falso positivo (o print da falha
    // mostrou o teste "logado" com o botao ainda girando). O "Sair" so existe
    // depois de entrar de verdade.
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
  // Chegou na lista de espelhos (com ou sem pedido de print pendente).
  await expect(page.getByRole('button', { name: /Sair/i })).toBeVisible({ timeout: 30_000 });
}

/** A faixa que aparece quando a CD está esperando print. */
const faixaPrint = (page: Page) => page.getByRole('button', { name: /est[áa] esperando .* espelho/i });

async function abrirEspelho(page: Page) {
  await faixaPrint(page).click();
  await expect(page.getByText('Print da tela do aplicativo')).toBeVisible({ timeout: 15_000 });
}

/** Guarda um print da tela pro Victor ver o que o entregador enxerga. */
let seq = 0;
async function print(page: Page, nome: string) {
  seq += 1;
  await page.screenshot({
    path: `prints-espelho-app/${String(seq).padStart(2, '0')}-${nome}.png`,
    fullPage: true,
  });
}

/** Envia a imagem pelo cartão e espera a conferência (a leitura leva ~45s). */
async function enviarPrint(page: Page, arquivo: string) {
  await page.locator('input[type="file"]').first().setInputFiles(arquivo);
  await expect(page.getByText(/Enviando/i)).toBeVisible({ timeout: 15_000 }).catch(() => {});
  await expect(page.getByText(/Enviando/i)).toHaveCount(0, { timeout: 180_000 });
}

test.describe.serial('Portal do entregador — espelho do app (04/08/2026)', () => {
  test.afterAll(async () => {
    for (const id of criados.periodos) await db.from('driverpay_periods').delete().eq('id', id);
    for (const id of criados.drivers) {
      const { data: files } = await db.from('driverpay_delivery_proofs').select('file_path').eq('driver_id', id);
      if (files?.length) await db.storage.from(BUCKET).remove(files.map((f) => f.file_path));
      await db.from('driverpay_delivery_proofs').delete().eq('driver_id', id);
      await db.from('driverpay_driver_auth').delete().eq('driver_id', id);
      await db.from('driverpay_group_members').delete().eq('driver_id', id);
      await db.from('driverpay_drivers').delete().eq('id', id);
    }
    for (const id of criados.grupos) await db.from('driverpay_groups').delete().eq('id', id);
  });

  test('A. sem solicitação, o portal não pede print nenhum', async ({ page }) => {
    test.setTimeout(180_000);
    await cenario({
      label: 'SemPedido', cpf: CPF.certo, nome: 'SemPedido',
      inicio: FOTO_INI, fim: FOTO_FIM, pacotes: FOTO_PKGS, solicitar: false,
    });
    await entrarNoPortal(page, CPF.certo);
    // A "torneira" fechada: a faixa de pedido nem aparece pro driver.
    await expect(faixaPrint(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await print(page, 'A-portal-sem-pedido');
  });

  test('B. print CERTO: aceito e o espelho fica conferido SOZINHO', async ({ page }) => {
    test.setTimeout(300_000);
    // Reaproveita o driver do teste A, agora com a solicitação aberta.
    const periodId = criados.periodos[0];
    await db.from('driverpay_proof_requests').insert({
      company_id: COMPANY, period_id: periodId, platform_name: PLAT, requested_by: '2626',
    });

    await entrarNoPortal(page, CPF.certo);
    await print(page, 'B-faixa-a-CD-esta-esperando');
    await abrirEspelho(page);
    await print(page, 'B-tela-do-print-como-tirar');

    // O passo a passo de como tirar o print aparece.
    await expect(page.getByText(/Como tirar o print/i)).toBeVisible();
    await expect(page.getByText(/Selecionar data/i)).toBeVisible();
    // ⚠️ E NENHUM número: o driver não pode saber quanto a planilha diz.
    await expect(page.getByText(String(FOTO_PKGS))).toHaveCount(0);

    await enviarPrint(page, FOTO_CERTA);
    await expect(page.getByText(/Espelho enviado/i)).toBeVisible({ timeout: 20_000 });
    await print(page, 'B-print-CERTO-aceito');
    await expect(page.getByText(/enviado\(s\)/i).first()).toBeVisible({ timeout: 20_000 });

    // No banco: leu certo, conferiu e marcou o pagamento.
    const { data: proof } = await db.from('driverpay_delivery_proofs')
      .select('*').eq('period_id', periodId).order('uploaded_at', { ascending: false }).limit(1).single();
    expect(proof!.read_packages, 'quantidade lida da foto').toBe(FOTO_PKGS);
    expect(proof!.read_start_date).toBe(FOTO_INI);
    expect(proof!.check_status).toBe('ok');
    expect(proof!.status).toBe('validado');

    const { data: pay } = await db.from('driverpay_payments')
      .select('espelho_conferido, espelho_conferido_by').eq('period_id', periodId).single();
    expect(pay!.espelho_conferido, '🎯 espelho conferido sozinho').toBe(true);
    expect(pay!.espelho_conferido_by).toBe('auto');
  });

  test('C. quantidade DIFERENTE: aceito em silêncio, o driver não vê nada', async ({ page }) => {
    test.setTimeout(300_000);
    // A planilha diz 1750; a foto mostra 1808. É o caso que o Victor precisa pegar.
    const { periodId, paymentId } = await cenario({
      label: 'Divergente', cpf: CPF.divergente, nome: 'Divergente',
      inicio: FOTO_INI, fim: FOTO_FIM, pacotes: 1750,
    });

    await entrarNoPortal(page, CPF.divergente);
    await abrirEspelho(page);
    await enviarPrint(page, FOTO_CERTA);

    // Pro driver: exatamente a MESMA mensagem do print certo.
    await expect(page.getByText(/Espelho enviado/i)).toBeVisible({ timeout: 20_000 });
    await print(page, 'C-quantidade-DIFERENTE-driver-nao-ve-nada');
    await expect(page.getByText(/recusad/i)).toHaveCount(0);
    await expect(page.getByText(/1750|1808|diferen|divergen|a mais|a menos/i)).toHaveCount(0);

    // Pro painel: divergente, com os dois números guardados.
    const { data: proof } = await db.from('driverpay_delivery_proofs')
      .select('*').eq('period_id', periodId).single();
    expect(proof!.check_status).toBe('divergente');
    expect(proof!.check_qtd).toBe(false);
    expect(proof!.read_packages).toBe(FOTO_PKGS);
    expect(proof!.expected_packages).toBe(1750);
    expect(proof!.status, 'aceito, não recusado').toBe('recebido');
    // E o espelho NÃO foi marcado: quem decide é o operador.
    const { data: pay } = await db.from('driverpay_payments')
      .select('espelho_conferido').eq('id', paymentId).single();
    expect(pay!.espelho_conferido).toBe(false);
  });

  test('D. print de OUTRA quinzena: RECUSADO na hora, com o motivo na tela', async ({ page }) => {
    test.setTimeout(300_000);
    // Quinzena 16/07–31/07, mas a foto é de 01/07–15/07.
    const { periodId } = await cenario({
      label: 'OutraQuinz', cpf: CPF.outraQuinzena, nome: 'OutraQuinz',
      inicio: '2026-07-16', fim: '2026-07-31', pacotes: FOTO_PKGS,
    });

    await entrarNoPortal(page, CPF.outraQuinzena);
    await abrirEspelho(page);
    await enviarPrint(page, FOTO_CERTA);

    // O driver vê o motivo e o que fazer — as duas datas aparecem.
    await expect(page.getByText(/Espelho recusado/i).first()).toBeVisible({ timeout: 30_000 });
    await print(page, 'D-quinzena-ERRADA-recusado-na-hora');
    await expect(page.getByText(/01\/07\/2026/).first()).toBeVisible();
    await expect(page.getByText(/16\/07\/2026/).first()).toBeVisible();
    await expect(page.getByText(/Selecionar data/i).first()).toBeVisible();

    const { data: proof } = await db.from('driverpay_delivery_proofs')
      .select('*').eq('period_id', periodId).single();
    expect(proof!.check_status).toBe('periodo_errado');
    expect(proof!.status).toBe('rejeitado');
    expect(proof!.check_periodo).toBe(false);
  });

  test('E. foto que NÃO é a tela do app: RECUSADO — e o reenvio funciona', async ({ page }) => {
    test.setTimeout(360_000);
    const { periodId, paymentId } = await cenario({
      label: 'Ilegivel', cpf: CPF.lider, nome: 'Ilegivel',
      inicio: FOTO_INI, fim: FOTO_FIM, pacotes: FOTO_PKGS,
    });

    await entrarNoPortal(page, CPF.lider);
    await abrirEspelho(page);

    // Foto de etiqueta de pacote — o engano mais provável de um driver.
    await enviarPrint(page, FOTO_ERRADA);
    await expect(page.getByText(/Espelho recusado|Não consegui ler|Nao consegui ler/i).first())
      .toBeVisible({ timeout: 30_000 });
    await print(page, 'E-foto-que-nao-e-a-tela-recusada');

    const { data: p1 } = await db.from('driverpay_delivery_proofs')
      .select('*').eq('period_id', periodId).single();
    expect(p1!.status).toBe('rejeitado');
    expect(p1!.check_status).toBe('ilegivel');
    // Não inventou número nenhum a partir da etiqueta.
    expect(p1!.read_packages).toBeNull();

    // F. O driver reenvia, agora com o print certo — a tela continua aberta.
    await enviarPrint(page, FOTO_CERTA);
    await expect(page.getByText(/Espelho enviado/i)).toBeVisible({ timeout: 20_000 });
    await print(page, 'F-reenvio-depois-da-recusa-aceito');

    const { data: pay } = await db.from('driverpay_payments')
      .select('espelho_conferido').eq('id', paymentId).single();
    expect(pay!.espelho_conferido, 'reenvio certo marca o espelho').toBe(true);
  });

  test('G. GRUPO: o líder vê um cartão POR MEMBRO (um print por driver)', async ({ page }) => {
    test.setTimeout(180_000);
    // Reusa o driver do teste E como líder e cria um membro na MESMA quinzena.
    const periodId = criados.periodos[criados.periodos.length - 1];
    const liderId = criados.drivers[criados.drivers.length - 1];

    const { data: membro } = await db.from('driverpay_drivers').insert({
      company_id: COMPANY, name: `${PREF}Membro ${RUN}`, cpf: CPF.membro, active: true, created_by: '2626',
    }).select('id').single();
    criados.drivers.push(membro!.id);

    const { data: pay2 } = await db.from('driverpay_payments').insert({
      company_id: COMPANY, period_id: periodId, driver_id: membro!.id,
      driver_name_snapshot: `${PREF}Membro ${RUN}`,
    }).select('id').single();
    await db.from('driverpay_payment_packages').insert({
      company_id: COMPANY, payment_id: pay2!.id,
      platform_name: PLAT, route: '', packages: 900, rate_snapshot: 2.0,
    });

    const { data: grupo } = await db.from('driverpay_groups').insert({
      company_id: COMPANY, name: `${PREF}Grupo ${RUN}`, leader_driver_id: liderId,
    }).select('id').single();
    criados.grupos.push(grupo!.id);
    await db.from('driverpay_group_members').insert([
      { company_id: COMPANY, group_id: grupo!.id, driver_id: liderId },
      { company_id: COMPANY, group_id: grupo!.id, driver_id: membro!.id },
    ]);

    await entrarNoPortal(page, CPF.lider);
    await abrirEspelho(page);

    // O líder vê a seção do grupo e o cartão do membro, com o NOME dele.
    await expect(page.getByText(/Do seu grupo/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`${PREF}Membro ${RUN}`)).toBeVisible();
    // Dois lugares de envio: o dele e o do membro — "um print por driver".
    await print(page, 'G-lider-ve-um-cartao-por-membro');
    await expect(page.locator('input[type="file"]')).toHaveCount(2);
    // E continua sem número nenhum na tela.
    await expect(page.getByText('900')).toHaveCount(0);
  });
});
