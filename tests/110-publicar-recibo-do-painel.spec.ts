import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import {
  createTestEmployee,
  insertPaymentRow,
  cleanupByPrefix,
  TEST_EMPLOYEE_NAME_PREFIX,
} from './integrity-helpers';

/**
 * E2E — PUBLICAR O RECIBO A PARTIR DO PAINEL, COM CLIQUE DE VERDADE (11/09/2026).
 *
 * 🎯 POR QUE ESTE ARQUIVO EXISTE: o upload pro bucket `payment-receipts` depende
 * de uma POLICY em `storage.objects` (migration 20260911051000). Tudo o mais já
 * estava provado — o PDF sobe pelo service_role, a edge fn assina o link, o
 * funcionário abre. O que faltava provar era justamente o elo que depende da
 * policy: **o navegador, com o JWT de quem usa o sistema, consegue publicar?**
 *
 * Sem a policy, o Supabase recusa com "row-level security policy" e a tela mostra
 * o aviso apontando pra migration. Este teste falha nesse caso — que é o certo.
 *
 * ⚠️ Publica pra um funcionário de TESTE, nunca pra uma pessoa de verdade. O
 * teste cria a pessoa e um pagamento dela na semana em andamento, procura o nome
 * dela na lista e publica só pra ela. Se o processo morresse no meio com uma
 * pessoa real escolhida, ela veria um documento aparecer na tela dela.
 */

const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Publicar `;

/** O dia de hoje no fuso do Brasil (é o que a tela usa pra achar a semana). */
function hojeBr(): string {
  const agora = new Date();
  return new Date(agora.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

test.describe('Publicar recibo pelo painel', () => {
  // Esta máquina roda o robô da Shopee junto (6 Chromes, ~5 GB), e com ela
  // carregada a primeira navegação passa dos 15s do config. Mesmo remédio do
  // spec 107, que navega com 120s: esperar pela CONDIÇÃO (a página carregou),
  // não por um tempo fixo.
  test.use({ navigationTimeout: 120_000 });

  test.beforeAll(() => cleanupByPrefix(PREFIX));
  test.afterAll(() => cleanupByPrefix(PREFIX));

  test('🎯 o clique em "Publicar" sobe o PDF e marca a pessoa como "no app"', async ({ page }) => {
    test.setTimeout(240_000);
    const db = getClient();

    // Uma pessoa de TESTE, com pagamento na semana em andamento — é ela que vai
    // aparecer na lista e receber o recibo.
    const nome = `${PREFIX}Ana`;
    const empId = await createTestEmployee({ name: nome, employmentType: 'Diarista', pin: '1234' });
    await insertPaymentRow(empId, hojeBr(), { daily_rate: 120, bonus_b: 30 });

    const { data: antes } = await db
      .from('payment_receipt_publications')
      .select('id')
      .eq('company_id', CARATINGA);
    const idsAntes = new Set((antes ?? []).map((r) => (r as { id: string }).id));

    let publicados: string[] = [];
    try {
      await loginAs(page, ADMIN);
      await goToTab(page, 'Financeiro');
      await page.getByTestId('payments-history-btn').click();
      await expect(page.getByText(/Montando o histórico…/)).toBeHidden({ timeout: 120_000 });

      // Abre a lista de quem entra, pelo botão do mês em andamento.
      await page.getByRole('button', { name: /^PDF do mês$/ }).first().click();
      await expect(page.getByText(/marque quem entra/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Buscando quem foi pago nesse período…/)).toBeHidden({ timeout: 120_000 });

      // Desmarca todo mundo e marca SÓ a pessoa de teste, achando pelo nome.
      await page.getByRole('button', { name: /^Desmarcar$/ }).click();
      await expect(page.getByText(/^0 escolhidos/)).toBeVisible();
      await page.getByPlaceholder(/Procurar pelo nome/).fill(nome);
      const linhaDela = page.locator('label').filter({ hasText: nome });
      await expect(linhaDela, 'a pessoa de teste tem que aparecer na lista').toHaveCount(1);
      await linhaDela.click();
      await expect(page.getByText(/^1 escolhidos/)).toBeVisible();

      // 🎯 O clique que depende da policy.
      await page.getByRole('button', { name: /^Publicar pro funcionário$/ }).click();

      // Deu certo? O toast diz. Se a policy faltasse, viria o aviso apontando a migration.
      await expect(
        page.getByText(/Recibo publicado — já aparece pro funcionário/),
        'se falhar aqui, leia o toast: provavelmente falta a policy do bucket',
      ).toBeVisible({ timeout: 60_000 });

      // E o selo "no app" aparece na linha da pessoa.
      await expect(page.getByText('no app').first()).toBeVisible({ timeout: 15_000 });

      // No BANCO: a publicação existe, com caminho e valor.
      const { data: depois } = await db
        .from('payment_receipt_publications')
        .select('id, employee_id, titulo, pdf_path, total_net, period_start, period_end')
        .eq('company_id', CARATINGA);
      const novos = (depois ?? []).filter((r) => !idsAntes.has((r as { id: string }).id));
      publicados = novos.map((r) => (r as { id: string }).id);

      expect(novos, 'uma publicação nova no banco').toHaveLength(1);
      expect(
        (novos[0] as { employee_id: string }).employee_id,
        'publicou pra pessoa de TESTE, não pra outra qualquer',
      ).toBe(empId);
      const nova = novos[0] as {
        pdf_path: string; titulo: string; total_net: number | null;
        period_start: string; period_end: string; employee_id: string;
      };
      expect(nova.titulo, 'o título é o do mês').toMatch(/\/20\d{2}$/);
      expect(nova.pdf_path, 'o caminho começa pela empresa').toMatch(
        new RegExp(`^${CARATINGA}/${nova.period_start}_${nova.period_end}/${nova.employee_id}\\.pdf$`),
      );

      // 🎯 E o arquivo está MESMO no bucket, e é um PDF.
      const { data: baixado, error } = await db.storage
        .from('payment-receipts')
        .download(nova.pdf_path);
      expect(error, 'o PDF tem que estar no bucket').toBeNull();
      const bytes = Buffer.from(await baixado!.arrayBuffer());
      expect(bytes.subarray(0, 4).toString(), 'e ser um PDF de verdade').toBe('%PDF');
      expect(bytes.length, 'com conteúdo, não vazio').toBeGreaterThan(1000);
    } finally {
      for (const id of publicados) {
        const { data } = await db
          .from('payment_receipt_publications').select('pdf_path').eq('id', id).maybeSingle();
        const p = (data as { pdf_path: string } | null)?.pdf_path;
        if (p) await db.storage.from('payment-receipts').remove([p]);
        await db.from('payment_receipt_publications').delete().eq('id', id);
      }
    }
  });
});
