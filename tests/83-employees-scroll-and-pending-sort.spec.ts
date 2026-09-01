import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { createTestEmployee, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * E2E — dois achados do Victor usando a aba Funcionários ao vivo (01/09/2026):
 *
 * 1) "quando clico para editar ele ainda não abre popup flutuante" — a 1ª
 *    tentativa de conserto tinha sido rolar a página até um formulário
 *    embutido no fluxo normal (achado errado do pedido original). Victor
 *    confirmou que queria um popup FLUTUANTE de verdade, independente de
 *    onde a página está rolada — não um scroll-até-lá. Fix definitivo:
 *    "Editar"/"Novo Funcionário" agora abrem um modal de verdade (mesmo
 *    padrão `fixed inset-0` já usado no modal de PIN e no de Importar), que
 *    aparece por cima da tela na hora, sem depender de rolagem nenhuma — e,
 *    por ser um overlay bloqueando a lista por baixo, o bug original (trocar
 *    de funcionário com o form "já aberto" sem fechar) fica estruturalmente
 *    impossível: dá pra editar outro funcionário sem fechar o modal primeiro.
 *
 * 2) "coloque os pendentes sempre em primeiro em amarelo" — a lista misturava
 *    pendentes com aprovados em ordem alfabética; agora pendente (2626) sempre
 *    ordena antes de quem não é pendente, com a linha toda destacada em
 *    amarelo (além do badge que já era amarelo).
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Emp83 `;

test.describe('EmployeesTab — popup flutuante ao editar + ordenação de pendentes', () => {
  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test('Editar abre popup flutuante na hora, sem depender de rolagem da página', async ({ page }) => {
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
      const heading = page.getByRole('heading', { name: 'Editar Funcionário' });
      const closeBtn = page.getByRole('button', { name: '✕' });

      // ── Busca primeiro (isola a linha) e só DEPOIS rola pro fim de propósito
      //    — se rolasse antes, o filtro encolheria a lista e o navegador
      //    ajustaria o scroll sozinho, misturando esse ajuste com o que o
      //    popup realmente faz (mesma pegadinha já vista no tests/78/83
      //    anteriores desta sessão). Só o clique em Editar acontece depois
      //    do scroll estabilizado — prova que o popup aparece flutuando por
      //    cima, sem precisar rolar até ele. ──
      await search.fill(nomeA);
      const rowA = page.getByTestId('employee-row').filter({ hasText: nomeA });
      await expect(rowA).toBeVisible({ timeout: 10_000 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const yAntes = await page.evaluate(() => window.scrollY);
      expect(yAntes).toBeGreaterThan(50);

      await rowA.getByTitle('Editar').click();

      // Popup aparece na hora, SEM a página ter rolado (window.scrollY intacto).
      await expect(heading).toBeInViewport({ timeout: 5_000 });
      await expect(nameInput).toHaveValue(nomeA);
      const yDepois = await page.evaluate(() => window.scrollY);
      expect(yDepois).toBe(yAntes);

      // ── Fecha e edita B — confirma o ciclo fechar→abrir troca de conteúdo certo ──
      await closeBtn.click();
      await expect(heading).toHaveCount(0);

      await search.fill(nomeB);
      const rowB = page.getByTestId('employee-row').filter({ hasText: nomeB });
      await expect(rowB).toBeVisible({ timeout: 10_000 });
      await rowB.getByTitle('Editar').click();
      await expect(heading).toBeInViewport({ timeout: 5_000 });
      await expect(nameInput).toHaveValue(nomeB);
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
