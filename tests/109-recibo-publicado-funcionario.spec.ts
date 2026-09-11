import { test, expect, Page } from '@playwright/test';
import { getClient } from './cleanup';
import {
  createTestEmployee,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * E2E — O RECIBO PUBLICADO CHEGANDO NA TELA DO FUNCIONÁRIO (11/09/2026).
 *
 * Pedido do Victor (10/09): *"coloca também pra esse espelho, esses PDF, ele
 * aparecer na aba de erros do funcionário, pra gente poder publicar lá pra eles
 * também, lançar pra eles"*.
 *
 * Entra de verdade no `/erros` com CPF + PIN, como o funcionário faz no celular,
 * e confere que o recibo aparece com título, valor e um link que ABRE o PDF.
 *
 * O upload usa o `service_role` de propósito: no navegador quem sobe é a CD, com
 * a permissão dela; aqui o que se prova é o outro lado da corrente — o que o
 * FUNCIONÁRIO recebe. Ele não tem login no Supabase, então o link tem que vir
 * assinado pela edge fn, e é isso que o teste verifica.
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Recibo `;
const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PIN = '1234';

/** Um PDF minúsculo, mas PDF de verdade — o teste confere a assinatura %PDF. */
const PDF_DE_MENTIRA = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

interface ReciboDaProva {
  inicio: string;
  fim: string;
  titulo: string;
  valor: number;
}

const RECIBOS: ReciboDaProva[] = [
  { inicio: '2026-09-01', fim: '2026-09-07', titulo: 'Semana 1 (01 – 07/09) — SETEMBRO/2026', valor: 640 },
  { inicio: '2026-08-01', fim: '2026-08-31', titulo: 'AGOSTO/2026', valor: 2480.5 },
];

const caminho = (empId: string, r: ReciboDaProva) =>
  `${CARATINGA}/${r.inicio}_${r.fim}/${empId}.pdf`;

async function publicarRecibos(empId: string) {
  const s = getClient();
  for (const r of RECIBOS) {
    const path = caminho(empId, r);
    const { error: upErr } = await s.storage
      .from('payment-receipts')
      .upload(path, PDF_DE_MENTIRA, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(`upload do recibo falhou: ${upErr.message}`);
    const { error } = await s.from('payment_receipt_publications').upsert([{
      company_id: CARATINGA,
      employee_id: empId,
      period_start: r.inicio,
      period_end: r.fim,
      titulo: r.titulo,
      pdf_path: path,
      total_net: r.valor,
    }], { onConflict: 'company_id,employee_id,period_start,period_end' });
    if (error) throw new Error(`registro do recibo falhou: ${error.message}`);
  }
}

async function limparRecibos(empId: string) {
  const s = getClient();
  await s.from('payment_receipt_publications').delete().eq('employee_id', empId);
  await s.storage.from('payment-receipts').remove(RECIBOS.map((r) => caminho(empId, r)));
}

async function cpfDe(empId: string): Promise<string> {
  const { data } = await getClient().from('employees').select('cpf').eq('id', empId).single();
  return (data as { cpf: string }).cpf;
}

async function entrarComoFuncionario(page: Page, cpf: string) {
  await page.goto('/erros');
  await page.locator('#cpf').fill(cpf);
  await page.getByRole('button', { name: /^Continuar$/ }).click();
  await expect(page.getByPlaceholder('••••')).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('••••').fill(PIN);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page.getByText('Meus Erros').first()).toBeVisible({ timeout: 20_000 });
}

test.describe('Recibo publicado na tela do funcionário', () => {
  // Esta máquina roda o robô da Shopee junto (6 Chromes, ~5 GB) e a primeira
  // navegação passa dos 15s do config. Mesmo remédio do spec 107 e do 110:
  // esperar pela CONDIÇÃO (a página carregou), não por um tempo fixo.
  test.use({ navigationTimeout: 120_000, actionTimeout: 30_000 });

  test.beforeAll(() => cleanupByPrefix(PREFIX));
  test.afterAll(() => cleanupByPrefix(PREFIX));

  test('🎯 o funcionário vê os recibos, com valor, e o link abre o PDF', async ({ page }) => {
    test.setTimeout(180_000);
    const empId = await createTestEmployee({ name: `${PREFIX}Maria`, pin: PIN });
    const cpf = await cpfDe(empId);

    try {
      await publicarRecibos(empId);
      await entrarComoFuncionario(page, cpf);

      // 🎯 O PIN e obrigatorio no SERVIDOR (auditoria de 11/09): sem ele, quem
      // soubesse o CPF baixava o holerite alheio. A pessoa ja digitou o PIN pra
      // entrar, entao a tela so repassa — se isso quebrar, a lista vem vazia.
      // O bloco dos recibos, com a contagem.
      await expect(page.getByText(/Meus recibos de pagamento/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('(2)')).toBeVisible();

      // Cada recibo com o título e o valor que a CD publicou.
      await expect(page.getByText('Semana 1 (01 – 07/09) — SETEMBRO/2026')).toBeVisible();
      await expect(page.getByText('AGOSTO/2026')).toBeVisible();
      await expect(page.getByText(/R\$\s*640,00/)).toBeVisible();
      await expect(page.getByText(/R\$\s*2\.480,50/)).toBeVisible();

      // 🎯 O link tem que ABRIR UM PDF DE VERDADE — o bucket é privado e o
      // funcionário não tem login, então isso só funciona com link assinado.
      const abrir = page.getByRole('link', { name: /Abrir/ }).first();
      await expect(abrir).toBeVisible();
      const href = await abrir.getAttribute('href');
      expect(href, 'o link tem que existir').toBeTruthy();
      const resp = await page.request.get(href!);
      expect(resp.status(), 'o link assinado responde').toBe(200);
      expect((await resp.body()).subarray(0, 4).toString(), 'e o que vem é um PDF').toBe('%PDF');

      // O print vai pra test-results (artefato de teste), nunca pra raiz do projeto.
      await page.screenshot({ path: 'test-results/recibo-do-funcionario.png', fullPage: true });
    } finally {
      await limparRecibos(empId);
    }
  });

  test('quem não tem recibo não vê o bloco (nem um vazio)', async ({ page }) => {
    test.setTimeout(180_000);
    const empId = await createTestEmployee({ name: `${PREFIX}Joao`, pin: PIN });
    const cpf = await cpfDe(empId);

    await entrarComoFuncionario(page, cpf);
    // Sem recibo, o bloco não existe — nem um "nenhum recibo", que só ocuparia
    // espaço numa tela de celular.
    await expect(page.getByText(/Meus recibos de pagamento/)).toBeHidden();
    await expect(page.getByText(/Nenhum erro registrado/)).toBeVisible({ timeout: 30_000 });
  });
});
