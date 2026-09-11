import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { createTestEmployee, insertPaymentRow, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * E2E — CONFIRMAR QUE A SEMANA FOI PAGA (11/09/2026).
 *
 * 🔴 O QUE ESTE ARQUIVO EXISTE PRA PROVAR: até hoje "pago" era automático. Toda
 * vez que alguém abria o sistema, ele marcava `paid` em TODO período cujo
 * `end_date` já tinha passado. Ninguém confirmava nada — por isso as 45 semanas
 * de Caratinga apareciam todas como pagas.
 *
 * Pedido do Victor: *"na aba de gerar arquivo de pagamento vai ter um
 * botãozinho… e vai marcar como pago. Aí vai abrir um novo ciclo"*. E: erro
 * lançado numa semana já paga é **bloqueado** (decisão dele).
 *
 * ⚠️ Trabalha numa semana de TESTE, criada e apagada aqui — nunca numa semana de
 * verdade. Confirmar pagamento numa semana real mudaria o que a CD vê.
 */

const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const ROTULO = 'PW Test Semana Confirmar';
const PREFIXO = `${TEST_EMPLOYEE_NAME_PREFIX}Confirmar `;

/** Uma semana de teste bem no passado, longe de qualquer dado real. */
const INICIO = '2024-03-04';
const FIM = '2024-03-10';
/** Um dia DENTRO da semana de teste. */
const DIA_DENTRO_DA_SEMANA = '2024-03-06';

/**
 * A semana de teste PRECISA ter pagamento.
 *
 * O botão de confirmar vive DEPOIS da prévia — é o fluxo que o Victor descreveu:
 * revisa o arquivo, aí marca como pago. Numa semana vazia não há prévia, e o
 * botão não aparece (o que está certo: não há o que confirmar). Na primeira
 * versão a semana de teste era vazia e o teste falhou por isso.
 */
async function criarSemanaDeTeste(status: 'open' | 'closed') {
  const db = getClient();
  await cleanupByPrefix(PREFIXO);
  await db.from('payment_periods').delete().eq('label', ROTULO);
  const empId = await createTestEmployee({ name: `${PREFIXO}Ana` });
  await insertPaymentRow(empId, DIA_DENTRO_DA_SEMANA, { daily_rate: 150 });
  const { data, error } = await db.from('payment_periods').insert([{
    company_id: CARATINGA,
    start_date: INICIO,
    end_date: FIM,
    payment_date: FIM,
    label: ROTULO,
    status,
    created_by: '9999',
  }]).select('id').single();
  if (error) throw new Error(`não consegui criar a semana de teste: ${error.message}`);
  return (data as { id: string }).id;
}

async function apagarSemanaDeTeste() {
  await cleanupByPrefix(PREFIXO);
  await getClient().from('payment_periods').delete().eq('label', ROTULO);
}

/**
 * Lança um erro PELA TELA — é o caminho da pessoa de verdade.
 *
 * ⚠️ Não dá pra chamar `insertErrorRecord` direto de um spec do Playwright: o
 * `src/services/database` puxa o cliente do Supabase, que lê `import.meta.env`
 * (coisa do Vite) e não existe aqui — o teste quebraria pelo motivo errado. Os
 * outros specs só importam utilitário PURO do `src/`, e por isso funcionam.
 */
async function lancarErroNaTela(page: Page, dia: string, observacao: string) {
  await goToTab(page, 'Erros');
  await page.getByRole('button', { name: /Registrar Erro/ }).click();
  const modal = page.locator('.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: /Registrar Erro/ }) });
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await modal.locator('select').first().selectOption({ index: 1 });
  await modal.locator('input[type="date"]').fill(dia);
  await modal.getByText('📦 Por Quantidade').click();
  await modal.locator('input[type="number"]').fill('2');
  await modal.getByPlaceholder(/Descreva os erros/).fill(observacao);
  await modal.getByRole('button', { name: /^Registrar$/ }).click();
}

async function abrirOArquivoDePagamento(page: Page) {
  await goToTab(page, 'Financeiro');
  await page.getByRole('button', { name: /^Gerar arquivo de pagamento$/ }).click();
  const popup = page.getByTestId('c6-popup');
  await expect(popup).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByTestId('seletor-de-semana')).toBeVisible({ timeout: 30_000 });
  return popup;
}

/**
 * Vai até a semana de teste no seletor (MARÇO de 2024, bem pra trás).
 *
 * ⚠️ Navega pelo RÓTULO DO MÊS, não pelo texto da semana. Na primeira versão eu
 * procurava um botão com "04/03" e ele casou com a semana **26/02 – 04/03 de
 * 2026** — uma semana REAL, já paga. O teste falhou dizendo que não achou o
 * botão de confirmar, quando na verdade tinha clicado na semana errada. (O
 * produto agiu certo: semana paga não oferece o botão.)
 */
async function irAteASemanaDeTeste(popup: ReturnType<Page['getByTestId']>) {
  const sel = popup.getByTestId('seletor-de-semana');
  const mes = sel.locator('span.font-bold').first();
  for (let i = 0; i < 60 && (await mes.innerText()) !== 'MARÇO 2024'; i++) {
    await sel.getByRole('button', { name: 'Mês anterior' }).click();
  }
  await expect(mes, 'tem que chegar em MARÇO 2024').toHaveText('MARÇO 2024');

  // O intervalo INTEIRO, que é único — só "04/03" aparece em outras semanas.
  const alvo = sel.getByRole('button').filter({ hasText: '04/03 – 10/03' });
  await expect(alvo, 'a semana de teste tem que estar no mês').toHaveCount(1);
  await alvo.click();
  return alvo;
}

test.describe('Confirmar o pagamento da semana', () => {
  test.describe.configure({ timeout: 240_000, mode: 'serial' });
  test.use({ actionTimeout: 30_000 });

  test.afterAll(async () => {
    await getClient().from('error_records').delete().like('observations', 'PW Test%semana%');
    await getClient().from('error_records').delete().like('observations', 'PW Test janela%');
    await apagarSemanaDeTeste();
  });

  test('🎯 o botão confirma, e fica registrado QUEM e QUANDO', async ({ page }) => {
    const id = await criarSemanaDeTeste('closed');
    await loginAs(page, ADMIN);
    const popup = await abrirOArquivoDePagamento(page);
    await irAteASemanaDeTeste(popup);

    // A prévia carrega sozinha ao escolher a semana; o botão vem com ela.
    await expect(popup.locator('table tbody tr').first(), 'a prévia da semana')
      .toBeVisible({ timeout: 60_000 });

    const confirmar = popup.getByTestId('confirmar-pagamento');
    await expect(confirmar, 'semana "a confirmar" oferece o botão').toBeVisible();

    page.once('dialog', (d) => d.accept());
    await confirmar.click();

    await expect(popup.getByTestId('semana-ja-paga'), 'vira "já confirmada"')
      .toBeVisible({ timeout: 30_000 });

    // 🎯 No BANCO: virou paga, com nome e hora — o que antes não existia.
    const { data } = await getClient()
      .from('payment_periods').select('status, paid_by, paid_at').eq('id', id).single();
    const p = data as { status: string; paid_by: string | null; paid_at: string | null };
    expect(p.status).toBe('paid');
    expect(p.paid_by, 'quem confirmou').toBe('9999');
    expect(p.paid_at, 'quando confirmou').toBeTruthy();
  });

  test('🎯 semana JÁ PAGA não aceita lançamento de erro', async ({ page }) => {
    const db = getClient();
    const { data: sem } = await db
      .from('payment_periods').select('status').eq('label', ROTULO).single();
    expect((sem as { status: string }).status, 'vem paga do teste anterior').toBe('paid');

    await loginAs(page, ADMIN);
    await lancarErroNaTela(page, DIA_DENTRO_DA_SEMANA, 'PW Test trava semana paga');

    // 🎯 A tela RECUSA, dizendo qual semana e desde quando.
    await expect(
      page.getByText(/confirmada como PAGA/i),
      'a mensagem tem que explicar o motivo, não só falhar',
    ).toBeVisible({ timeout: 20_000 });

    // E nada foi gravado.
    const { count } = await db
      .from('error_records').select('*', { count: 'exact', head: true })
      .eq('observations', 'PW Test trava semana paga');
    expect(count, 'o erro não pode ter entrado').toBe(0);
  });

  test('🎯 semana A CONFIRMAR AINDA aceita lançamento (a janela pra corrigir)', async ({ page }) => {
    const db = getClient();
    // Volta pra "acabou mas ninguém confirmou" — é a janela pra lançar o que faltou.
    await db.from('payment_periods')
      .update({ status: 'closed', paid_by: null, paid_at: null })
      .eq('label', ROTULO);

    await loginAs(page, ADMIN);
    await lancarErroNaTela(page, DIA_DENTRO_DA_SEMANA, 'PW Test janela aberta');

    await expect(page.getByText(/registrado com sucesso/i)).toBeVisible({ timeout: 20_000 });

    const { count } = await db
      .from('error_records').select('*', { count: 'exact', head: true })
      .eq('observations', 'PW Test janela aberta');
    expect(count, 'antes de confirmar, ainda dá pra lançar').toBe(1);

    await db.from('error_records').delete().eq('observations', 'PW Test janela aberta');
  });
});
