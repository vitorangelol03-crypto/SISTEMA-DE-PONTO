import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { createTestEmployee, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * E2E — dois achados do Victor usando a aba Funcionários ao vivo (01/09/2026):
 *
 * 1) "quando clico para editar ele ainda não abre [rola até] pra te pedir para
 *    editar o funcionário" — o `useEffect` que rola até o formulário disparava
 *    só na transição `showForm` false→true. Clicar "Editar" num OUTRO
 *    funcionário com o formulário JÁ aberto (troca só os dados, `showForm`
 *    continua true) não disparava o efeito de novo — a pessoa ficava presa
 *    onde estava rolada, sem ver o formulário trocar de conteúdo lá em cima.
 *    Fix: gatilho passou a ser `formOpenSeq` (incrementa em TODO clique de
 *    abrir), não mais `showForm`.
 *
 * 2) "coloque os pendentes sempre em primeiro em amarelo" — a lista misturava
 *    pendentes com aprovados em ordem alfabética; agora pendente (2626) sempre
 *    ordena antes de quem não é pendente, com a linha toda destacada em
 *    amarelo (além do badge que já era amarelo).
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Emp83 `;

test.describe('EmployeesTab — rolagem ao editar + ordenação de pendentes', () => {
  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test('clicar Editar em funcionário diferente com o formulário já aberto rola até ele de novo', async ({ page }) => {
    test.setTimeout(60_000);
    const nomeA = `${PREFIX}A ${Date.now()}`;
    const nomeB = `${PREFIX}B ${Date.now() + 1}`;
    const idA = await createTestEmployee({ name: nomeA });
    const idB = await createTestEmployee({ name: nomeB });
    const s = getClient();
    await s.from('employees').update({ registration_status: 'approved' }).in('id', [idA, idB]);

    try {
      await loginAs(page, MASTER_2626);
      await goToTab(page, 'Funcionários');

      const search = page.getByPlaceholder('Buscar por nome ou CPF...');
      const nameInput = page.getByPlaceholder('Digite o nome completo');

      // ── 1ª abertura: edita A, confirma que rola até o formulário ──
      await search.fill(nomeA);
      const rowA = page.getByTestId('employee-row').filter({ hasText: nomeA });
      await expect(rowA).toBeVisible({ timeout: 10_000 });
      await rowA.getByTitle('Editar').click();
      await expect(nameInput).toHaveValue(nomeA);
      await expect(page.getByRole('heading', { name: 'Editar Funcionário' })).toBeInViewport({ timeout: 5_000 });

      // ── Limpa a busca (lista cheia, ~90 funcionários reais) e força rolar
      //    pro fim — simula ter ido procurar B lá embaixo, longe do formulário.
      await search.fill('');
      await expect(page.getByTestId('employee-row').first()).toBeVisible({ timeout: 10_000 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const yFundoDaLista = await page.evaluate(() => window.scrollY);
      expect(yFundoDaLista).toBeGreaterThan(500);

      // ── Edita B SEM fechar o formulário — era aqui que o bug acontecia.
      //    O .click() do Playwright rola até a LINHA de B primeiro (onde quer
      //    que ela esteja na lista); o que este teste prova é que, depois do
      //    clique, o app rola de novo — desta vez até o FORMULÁRIO. ──
      const rowB = page.getByTestId('employee-row').filter({ hasText: nomeB });
      await rowB.getByTitle('Editar').click();
      await expect(nameInput).toHaveValue(nomeB);
      await expect(page.getByRole('heading', { name: 'Editar Funcionário' })).toBeInViewport({ timeout: 5_000 });
    } finally {
      await s.from('employees').delete().in('id', [idA, idB]);
    }
  });

  test('funcionário pendente sempre aparece antes de quem não é pendente, com a linha em amarelo', async ({ page }) => {
    test.setTimeout(60_000);
    // createTestEmployee não passa registration_status → fica 'pending' (default da coluna).
    const nome = `${PREFIX}Pendente ${Date.now()}`;
    const id = await createTestEmployee({ name: nome });

    try {
      await loginAs(page, MASTER_2626);
      await goToTab(page, 'Funcionários');
      await expect(page.getByRole('button', { name: /^Ativos/ })).toBeVisible({ timeout: 10_000 });

      const rows = page.getByTestId('employee-row');
      await expect(rows.first()).toBeVisible({ timeout: 10_000 });

      const info = await rows.evaluateAll((els, nome) => {
        const idx = els.findIndex(el => el.textContent?.includes(nome));
        const classesBeforeFixture = els.slice(0, idx).map(el => el.className);
        return {
          idx,
          fixtureClass: idx >= 0 ? els[idx].className : '',
          allBeforeAreYellow: classesBeforeFixture.every(c => c.includes('bg-yellow-50')),
        };
      }, nome);

      expect(info.idx).toBeGreaterThanOrEqual(0);
      // Toda linha ANTES da nossa fixture também precisa ser pendente (amarela)
      // — prova "pendente sempre em primeiro" sem depender de quantos
      // pendentes reais existem hoje em produção.
      expect(info.allBeforeAreYellow).toBe(true);
      expect(info.fixtureClass).toContain('bg-yellow-50');

      const rowFixture = rows.filter({ hasText: nome });
      await expect(rowFixture.getByText('Pendente')).toBeVisible();
    } finally {
      await getClient().from('employees').delete().eq('id', id);
    }
  });
});
