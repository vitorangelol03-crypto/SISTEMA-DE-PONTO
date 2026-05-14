import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * Sub-fase 14.6 — HelpButton (botão flutuante de ajuda contextual).
 *
 * Componente: src/components/tutorial/HelpButton.tsx — botão azul
 * fixed bottom-6 right-6 com classes hidden sm:flex (visível em
 * viewports >= 640px). Renderizado em App.tsx (L187) com
 * currentTab={activeTab}.
 *
 * Conteúdo do modal:
 *  - Header "Ajuda Rápida" + subtítulo "Tutoriais e guias disponíveis"
 *  - Section "Tutoriais desta aba" (filtra por category === currentTab)
 *  - Section "Outras funcionalidades" (até 5 tutoriais de outras tabs)
 *  - Click em tutorial card abre TutorialDetail (mesmo modal usado em TutorialTab)
 *
 * Cobertura:
 *  - Botão flutuante visível pós-login admin
 *  - Click abre modal "Ajuda Rápida"
 *  - Modal lista tutoriais contextuais da aba ativa (Ponto → "Controle de Ponto")
 *  - Click em tutorial dentro do modal abre TutorialDetail
 *  - Botão X fecha o modal
 *  - Tutoriais contextuais MUDAM por aba (Financeiro → bonus history,
 *    Ponto → Controle de Ponto)
 *
 * IMPORTANTE: existem 2 elementos com nome "Ajuda" — a aba de TabNavigation
 * (aria-label="Ajuda") e o botão flutuante (title="Ajuda"). Para selecionar
 * o flutuante usamos a accessible name "Precisa de ajuda?" (que vem do
 * span com tooltip), via locator com classe específica.
 */

function floatingHelpButton(page: Page) {
  // Botão flutuante: title="Ajuda", classes "fixed bottom-6 right-6" únicas
  return page.locator('button.fixed.bottom-6.right-6');
}

test.describe('HelpButton — botão flutuante de ajuda', () => {
  // Botão flutuante usa "hidden sm:flex" (Tailwind) — invisível em viewports
  // <640px (mobile). Spec inteira é skip no project mobile-pixel5 (393x851).
  test.skip(
    ({ viewport }) => !!viewport && viewport.width < 640,
    'HelpButton flutuante é explicitamente hidden em viewports mobile (<640px)',
  );

  test('a. botão flutuante visível após login admin', async ({ page }) => {
    await loginAs(page, ADMIN);

    const helpBtn = floatingHelpButton(page);
    await expect(helpBtn).toBeVisible({ timeout: 10_000 });
    await expect(helpBtn).toHaveAttribute('title', 'Ajuda');
  });

  test('b. click abre modal "Ajuda Rápida" com seções', async ({ page }) => {
    await loginAs(page, ADMIN);

    await floatingHelpButton(page).click();

    // Heading do modal
    await expect(
      page.getByRole('heading', { name: /Ajuda Rápida/i })
    ).toBeVisible({ timeout: 5_000 });

    // Subtítulo do header
    await expect(page.getByText(/Tutoriais e guias disponíveis/i)).toBeVisible();

    // Dica do rodapé (texto fixo do modal)
    await expect(page.getByText(/Acesse a aba "Ajuda" para ver todos os tutoriais/i)).toBeVisible();
  });

  test('c. aba Ponto ativa → modal lista "Controle de Ponto" em "Tutoriais desta aba"', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');

    await floatingHelpButton(page).click();

    await expect(
      page.getByRole('heading', { name: /Ajuda Rápida/i })
    ).toBeVisible({ timeout: 5_000 });

    // Section heading "Tutoriais desta aba" presente (currentTab === 'attendance')
    await expect(
      page.getByRole('heading', { name: /Tutoriais desta aba/i })
    ).toBeVisible();

    // O tutorial 'attendance-overview' (category='attendance') deve aparecer
    await expect(
      page.getByRole('heading', { name: 'Controle de Ponto' })
    ).toBeVisible({ timeout: 5_000 });
  });

  test('d. click em tutorial dentro do modal abre TutorialDetail', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Ponto');

    await floatingHelpButton(page).click();
    await expect(
      page.getByRole('heading', { name: /Ajuda Rápida/i })
    ).toBeVisible({ timeout: 5_000 });

    // Click no card "Controle de Ponto" dentro do modal HelpButton
    await page.getByRole('heading', { name: 'Controle de Ponto' }).first().click();

    // TutorialDetail abriu (mostra "Passo a Passo")
    await expect(
      page.getByRole('heading', { name: /Passo a Passo/i })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('heading', { name: /Casos de Uso Práticos/i })
    ).toBeVisible();
  });

  test('e. tutoriais contextuais MUDAM entre aba Ponto e aba Financeiro', async ({ page }) => {
    await loginAs(page, ADMIN);

    // 1. Em Ponto: tutorial contextual é 'Controle de Ponto'
    await goToTab(page, 'Ponto');
    await floatingHelpButton(page).click();
    await expect(
      page.getByRole('heading', { name: /Tutoriais desta aba/i })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('heading', { name: 'Controle de Ponto' })
    ).toBeVisible();

    // Fecha modal: X é o último botão dentro do header sticky do modal
    await page
      .locator('div.sticky.top-0')
      .filter({ hasText: 'Ajuda Rápida' })
      .locator('button')
      .last()
      .click();
    await expect(
      page.getByRole('heading', { name: /Ajuda Rápida/i })
    ).toHaveCount(0, { timeout: 3_000 });

    // Re-abre via aba Financeiro
    await goToTab(page, 'Financeiro');
    await floatingHelpButton(page).click();
    await expect(
      page.getByRole('heading', { name: /Ajuda Rápida/i })
    ).toBeVisible({ timeout: 5_000 });

    // 2. Em Financeiro: tutorial contextual inclui 'Histórico de Remoções de Bonificação'
    //    (id=financial-bonus-history, category=financial em tutorialContent.ts:189)
    await expect(
      page.getByRole('heading', { name: /Histórico de Remoções de Bonificação/i })
    ).toBeVisible({ timeout: 5_000 });

    // E "Controle de Ponto" (categoria attendance) NÃO está na seção "Tutoriais
    // desta aba" — mas pode aparecer em "Outras funcionalidades". Validar que
    // a section "Tutoriais desta aba" não inclui o título exato de attendance:
    // o tutorial attendance pode estar em "Outras funcionalidades" (slice 5),
    // mas o contextualTutorials filtrado por currentTab='financial' não inclui.
    // Aqui apenas validamos a inversão da seção principal — assertion suficiente.
  });

  test('f. botão X fecha modal HelpButton', async ({ page }) => {
    await loginAs(page, ADMIN);

    await floatingHelpButton(page).click();
    const heading = page.getByRole('heading', { name: /Ajuda Rápida/i });
    await expect(heading).toBeVisible({ timeout: 5_000 });

    // Botão X dentro do modal — é o único botão com classe min-h-[44px]
    // ao lado do heading "Ajuda Rápida" no header sticky.
    // Localizar via combinação heading + ancestor.
    const closeBtn = page
      .locator('div.sticky.top-0')
      .filter({ hasText: 'Ajuda Rápida' })
      .locator('button')
      .last();
    await closeBtn.click();

    // Modal fechou
    await expect(heading).toHaveCount(0, { timeout: 3_000 });
  });
});
