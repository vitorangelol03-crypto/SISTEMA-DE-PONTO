import { test, expect, Page } from '@playwright/test';
import { jsPDF } from 'jspdf';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — NOTA DIVIDIDA no portal do entregador, com CLIQUES REAIS e PDFs de verdade.
 *
 * Pedido do Victor em 05/09/2026 ("valida isso de ponta a ponta, não quero ter dor de
 * cabeça com isso mais"), depois de 4 idas e vindas no mesmo assunto no mesmo dia:
 *
 *   1. quem está habilitado escolhe, JÁ ao abrir a tela, entre nota integral e dividida
 *   2. a divisão é sempre meio a meio, uma fatia por CNPJ (o 70/30 deixou de existir)
 *   3. a tela avisa que cada nota vai num CNPJ DIFERENTE e mostra QUEM pode emitir
 *   4. a conferência recusa valor errado, nome errado e CNPJ de emitente errado
 *   5. a nota do LÍDER tem que cobrir o GRUPO (a parte só dele não vale)
 *
 * ⚠️ Fala com a edge fn `driver-public-api` DEPLOYADA — é o único jeito de provar a
 * conferência de verdade (ela roda lá). PDF com texto de verdade (jsPDF), não fixture.
 *
 * Cenário (números escolhidos pra dividir redondo):
 *   líder  : eMile 150 × R$ 2,00 = R$ 300,00  ·  SHOPEE 200 × R$ 2,20 = R$ 440,00
 *   membro : SHOPEE 100 × R$ 2,20 = R$ 220,00
 *   → grupo: iMile R$ 300,00 + Shopee/Anjun/Loggi R$ 660,00 = R$ 960,00
 *   → dividido meio a meio: R$ 480,00 em cada CNPJ
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
const FATIA = 480.0;
const SO_DO_LIDER_SHOPEE = 440.0; // o valor que o sistema aceitava errado até hoje

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

/** Envia o PDF pelo input do cartão daquele CNPJ. */
async function enviarNota(page: Page, cnpjDoCartao: string, pdf: Buffer) {
  const cartao = page.locator('div.bg-white.rounded-xl').filter({ hasText: `CNPJ ${cnpjDoCartao}` }).first();
  await cartao.locator('input[type="file"]').setInputFiles({
    name: `nota-${Date.now()}.pdf`, mimeType: 'application/pdf', buffer: pdf,
  });
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

  test('A. a escolha aparece já na abertura, com o aviso do CNPJ e quem pode emitir', async ({ page }) => {
    test.setTimeout(240_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();

    // 1. A pergunta vem antes de qualquer botão de enviar
    await expect(page.getByText(/Como você vai emitir as notas desta quinzena/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Notas no valor integral/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Dividir em 2 notas/i })).toBeVisible();

    // 2. O valor da divisão sai calculado: 960,00 → 480,00 + 480,00
    await expect(page.getByText(/R\$ 480,00/).first()).toBeVisible();

    // 3. O aviso do CNPJ diferente
    await expect(page.getByText(/Cada nota tem que ser emitida em um CNPJ DIFERENTE/i)).toBeVisible();

    // 4. Quem pode emitir, com nome E CNPJ
    await expect(page.getByText(/A nota tem que ser emitida por/i)).toBeVisible();
    await expect(page.getByText(EMISSOR_A.nome, { exact: false })).toBeVisible();
    await expect(page.getByText(EMISSOR_A.cnpj, { exact: false })).toBeVisible();
    await expect(page.getByText(EMISSOR_B.cnpj, { exact: false })).toBeVisible();

    // 5. Sem escolher, não existe botão de enviar (era assim que o driver mandava errado)
    await expect(page.getByText(/Escolha lá em cima como você vai emitir/i).first()).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test('B. valor errado é RECUSADO — inclusive a parte só do líder', async ({ page }) => {
    test.setTimeout(300_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await page.getByRole('button', { name: /Dividir em 2 notas/i }).click();

    // R$ 440,00 = SHOPEE só do líder. Era exatamente isso que passava antes de hoje.
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: SO_DO_LIDER_SHOPEE, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/não bate com o valor|nao bate com o valor/i)).toBeVisible({ timeout: 90_000 });

    const { data } = await db.from('driverpay_nota_fiscal_files')
      .select('id').eq('driver_id', criados.drivers[0]);
    expect(data ?? [], 'nota recusada não pode ficar gravada').toHaveLength(0);
  });

  test('C. CNPJ de quem emite fora do cadastro é RECUSADO', async ({ page }) => {
    test.setTimeout(300_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await page.getByRole('button', { name: /Dividir em 2 notas/i }).click();

    // Valor CERTO, nome CERTO, mas emitida por um CNPJ que não é o cadastrado.
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: '11.111.111/0001-11', tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/não foi emitida pelo CNPJ cadastrado|nao foi emitida pelo CNPJ cadastrado/i))
      .toBeVisible({ timeout: 90_000 });

    const { data } = await db.from('driverpay_nota_fiscal_files')
      .select('id').eq('driver_id', criados.drivers[0]);
    expect(data ?? [], 'nota recusada não pode ficar gravada').toHaveLength(0);
  });

  test('D. a dupla certa passa: R$ 480,00 em cada CNPJ, em nomes cadastrados', async ({ page }) => {
    test.setTimeout(420_000);
    await entrarNoPortal(page, CPF_LIDER);
    await page.getByRole('button', { name: /Anexar nota|Nota|Enviar/i }).first().click();
    await page.getByRole('button', { name: /Dividir em 2 notas/i }).click();

    // 1ª nota: CNPJ da iMile, emitida pelo emissor A
    await enviarNota(page, CNPJ_IMILE, notaPdf({
      valor: FATIA, emitenteNome: EMISSOR_A.nome,
      emitenteCnpj: EMISSOR_A.cnpj, tomadorCnpj: CNPJ_IMILE,
    }));
    await expect(page.getByText(/1ª nota recebida/i)).toBeVisible({ timeout: 90_000 });

    // O outro cartão passa a pedir a 2ª, com o valor que falta
    await expect(page.getByText(/Envie a 2ª AQUI/i)).toBeVisible({ timeout: 30_000 });

    // 2ª nota: CNPJ da Shopee, emitida pelo emissor B (nome diferente, CNPJ diferente)
    await enviarNota(page, CNPJ_SHOPEE, notaPdf({
      valor: FATIA, emitenteNome: EMISSOR_B.nome,
      emitenteCnpj: EMISSOR_B.cnpj, tomadorCnpj: CNPJ_SHOPEE,
    }));
    await expect(page.getByText(/Dupla completa/i)).toBeVisible({ timeout: 90_000 });

    // No banco: 2 notas validadas, uma em cada CNPJ, R$ 480,00 cada
    const { data: notas } = await db.from('driverpay_nota_fiscal_files')
      .select('status, read_value, nota_emitter_id, split_part, matched_name')
      .eq('driver_id', criados.drivers[0]).order('uploaded_at');
    expect(notas ?? []).toHaveLength(2);
    expect(notas!.every((n) => n.status === 'validada'), 'as duas têm que validar').toBe(true);
    expect(notas!.map((n) => Number(n.read_value))).toEqual([FATIA, FATIA]);
    expect(new Set(notas!.map((n) => n.nota_emitter_id)).size, 'CNPJs diferentes').toBe(2);
    expect(notas!.map((n) => n.split_part)).toEqual([1, 2]);
  });
});
