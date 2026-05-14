import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * Sub-fase 14.6 — TutorialTab (aba "Ajuda").
 *
 * Cobertura:
 *  - Render do header "Central de Tutoriais"
 *  - Search filtra tutoriais (digitar "ponto" → mostra "Controle de Ponto")
 *  - Filtro por categoria isola tutoriais de "Funcionários"
 *  - Click no card → TutorialDetail modal abre com steps + casos de uso
 *  - Botão X fecha o modal
 *  - Estado vazio (busca sem match) mostra "Nenhum tutorial encontrado"
 *  - Tutorial restrito por permissão NÃO aparece pra sup04 (sem users.view)
 *
 * Conteúdo verificado em src/data/tutorialContent.ts:
 *   - 28 tutoriais com 9 categorias
 *   - "users-management" exige users.view (sup04 não tem → fica oculto)
 */

const SUP04 = { id: '04', password: '9847' };

test.describe('TutorialTab — Aba Ajuda', () => {
  test('a. header "Central de Tutoriais" + search + lista de tutoriais renderiza', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ajuda');

    // Heading principal do hero
    await expect(
      page.getByRole('heading', { name: /Central de Tutoriais/i })
    ).toBeVisible({ timeout: 15_000 });

    // Input de busca presente
    await expect(page.getByPlaceholder(/Buscar tutoriais/i)).toBeVisible();

    // Botão "Todos (N)" visível (filtro de categoria default)
    await expect(page.getByRole('button', { name: /^Todos \(\d+\)$/ })).toBeVisible();

    // Pelo menos um card de tutorial visível para admin (acesso total → 28 cards)
    await expect(
      page.getByRole('heading', { name: 'Controle de Ponto' })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('b. busca por "ponto" filtra cards e mantém "Controle de Ponto"', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ajuda');

    await expect(
      page.getByRole('heading', { name: /Central de Tutoriais/i })
    ).toBeVisible({ timeout: 15_000 });

    const search = page.getByPlaceholder(/Buscar tutoriais/i);
    await search.fill('ponto');

    // Tutorial "Controle de Ponto" sobrevive ao filtro
    await expect(
      page.getByRole('heading', { name: 'Controle de Ponto' })
    ).toBeVisible({ timeout: 5_000 });

    // Tutorial irrelevante NÃO sobra (ex.: "Gerenciamento de Usuários")
    await expect(page.getByRole('heading', { name: 'Gerenciamento de Usuários' })).toHaveCount(0);
  });

  test('c. filtro por categoria "Funcionários" mostra só tutoriais dessa categoria', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ajuda');

    await expect(
      page.getByRole('heading', { name: /Central de Tutoriais/i })
    ).toBeVisible({ timeout: 15_000 });

    // Clica botão do filtro "Funcionários (N)" — chip de categoria
    const empBtn = page.getByRole('button', { name: /^Funcionários \(\d+\)$/ });
    await expect(empBtn).toBeVisible({ timeout: 10_000 });
    await empBtn.click();

    // Tutorial da categoria 'employees' deve aparecer
    await expect(
      page.getByRole('heading', { name: 'Gerenciamento de Funcionários' })
    ).toBeVisible({ timeout: 5_000 });

    // Tutoriais de outras categorias somem (ex.: "Controle de Ponto" da categoria attendance)
    await expect(page.getByRole('heading', { name: 'Controle de Ponto' })).toHaveCount(0);
  });

  test('d. click em card abre TutorialDetail modal com "Passo a Passo" e "Casos de Uso"', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ajuda');

    await expect(
      page.getByRole('heading', { name: /Central de Tutoriais/i })
    ).toBeVisible({ timeout: 15_000 });

    // Click no card "Controle de Ponto" (heading dentro do TutorialCard)
    await page.getByRole('heading', { name: 'Controle de Ponto' }).first().click();

    // TutorialDetail tem seções "Passo a Passo" e "Casos de Uso Práticos"
    await expect(
      page.getByRole('heading', { name: /Passo a Passo/i })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('heading', { name: /Casos de Uso Práticos/i })
    ).toBeVisible();
  });

  test('e. botão "Fechar Tutorial" fecha modal e volta pra grid', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ajuda');

    await page.getByRole('heading', { name: 'Controle de Ponto' }).first().click();
    await expect(
      page.getByRole('heading', { name: /Passo a Passo/i })
    ).toBeVisible({ timeout: 5_000 });

    // Botão "Fechar Tutorial" no footer sticky do modal
    await page.getByRole('button', { name: /Fechar Tutorial/i }).click();

    // Passo a Passo desaparece (modal fechou)
    await expect(page.getByRole('heading', { name: /Passo a Passo/i })).toHaveCount(0);

    // Grid de cards volta a estar acessível (header continua visível também)
    await expect(
      page.getByRole('heading', { name: /Central de Tutoriais/i })
    ).toBeVisible();
  });

  test('f. busca sem match mostra estado "Nenhum tutorial encontrado"', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ajuda');

    const search = page.getByPlaceholder(/Buscar tutoriais/i);
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('xyzqqqzzz-no-match-9999');

    await expect(
      page.getByRole('heading', { name: /Nenhum tutorial encontrado/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test('g. sup04 (sem users.view) NÃO vê tutorial "Gerenciamento de Usuários"', async ({ page }) => {
    // tutorialContent.ts:609 → requiredPermission: 'users.view'
    // sup04 não tem essa permissão → o card é filtrado pelo
    // availableTutorials = filter(hasPermission(requiredPermission))
    await loginAs(page, SUP04);
    await goToTab(page, 'Ajuda');

    await expect(
      page.getByRole('heading', { name: /Central de Tutoriais/i })
    ).toBeVisible({ timeout: 15_000 });

    // O tutorial 'users-management' está oculto pra sup04
    await expect(page.getByRole('heading', { name: 'Gerenciamento de Usuários' })).toHaveCount(0);

    // Mas algum tutorial acessível continua sendo exibido (Controle de Ponto)
    await expect(
      page.getByRole('heading', { name: 'Controle de Ponto' })
    ).toBeVisible({ timeout: 5_000 });
  });
});
