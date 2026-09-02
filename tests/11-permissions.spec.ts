import { test, expect } from '@playwright/test';
import { loginAs, goToTab } from './helpers';

/**
 * Módulo 9 — testa que permissões do Supervisor 04 restringem a UI.
 *
 * Sup 04 config atual:
 *   attendance.reset = false
 *   attendance.approve = true
 *   attendance.bulkApprove = false
 *   attendance.manualTime = false
 *   errors.viewTriage = false
 *   financial.applyBonusB/C1/C2 = false
 *   financial.applyBonus = true (ainda vê o botão — tipo-específico bloqueia no backend)
 */

const SUP04 = { id: '04', password: '9847' };
const ADMIN9999 = { id: '9999', password: '684171' };

test.describe('Permissões — Supervisor 04 restrito', () => {
  test('sup 04 NÃO vê botão Reset Geral', async ({ page }) => {
    await loginAs(page, SUP04);
    await expect(page.getByRole('heading', { name: /Controle de Ponto/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Reset Geral$/ })).toHaveCount(0);
  });

  test('sup 04 CONSEGUE ver Aprovações Pendentes', async ({ page }) => {
    await loginAs(page, SUP04);
    await expect(page.getByText(/Aprovações Pendentes/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('sup 04 NÃO vê sub-aba Triagem em Erros', async ({ page }) => {
    await loginAs(page, SUP04);
    await goToTab(page, 'Erros');
    await expect(page.getByRole('heading', { name: /Gestão de Erros/ })).toBeVisible();
    // "Individuais" (não "Erros Individuais"): em viewport mobile o texto do
    // botão encolhe (`sm:hidden`/`hidden sm:inline` em ErrorsTab.tsx) — o nome
    // acessível vira só "Individuais" abaixo do breakpoint `sm` (achado rodando
    // em mobile-pixel5, 01/09/2026).
    await expect(page.getByRole('button', { name: /Individuais/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Triagem$/ })).toHaveCount(0);
  });
});

test.describe('Permissões — Admin 9999 completo', () => {
  test('admin vê gestão de usuários', async ({ page }) => {
    await loginAs(page, ADMIN9999);
    await goToTab(page, 'Usuários');
    await expect(page.getByRole('heading', { name: /Gestão de Usuários/ })).toBeVisible();
    // data-testid="user-row" + :visible (não `tbody tr`): a tabela desktop e o
    // card mobile de UsersTab.tsx SEMPRE coexistem no DOM (só um fica visível
    // via CSS `hidden md:block`/`md:hidden`) — `tbody tr` sozinho pega a linha
    // escondida em viewport mobile (achado rodando em mobile-pixel5, 01/09/2026).
    await expect(page.locator('[data-testid="user-row"]:visible').first()).toBeVisible();
  });

  test('modal de permissões lista as novas permissões (approve, reject, bulkApprove, manualTime, applyBonusB/C1/C2, removeBonusByType, createByValue, viewTriage)', async ({ page }) => {
    await loginAs(page, ADMIN9999);
    await goToTab(page, 'Usuários');

    // Abre modal de permissões do primeiro supervisor não-admin
    const row = page.locator('[data-testid="user-row"]:visible').filter({ hasText: /01/ }).first();
    // getByRole (não getByTitle): no card mobile o botão só tem texto
    // "Permissões" (sem atributo title, diferente do ícone-só da tabela
    // desktop, que usa title="Gerenciar Permissões") — /Permiss/i bate nos
    // dois nomes acessíveis.
    await row.getByRole('button', { name: /Permiss/i }).click();

    await expect(page.getByRole('heading', { name: /Gerenciar Permissões/ })).toBeVisible();

    // Escopa dentro do modal — usa class*=max-w-4xl para bater tanto com
    // `max-w-4xl` quanto com variantes responsivas (`sm:max-w-4xl`).
    const modal = page.locator('[class*="max-w-4xl"]');

    await modal.getByRole('button', { name: /^Ponto/ }).click();
    await expect(modal.getByText('Aprovar ponto pendente')).toBeVisible();
    await expect(modal.getByText('Rejeitar ponto pendente')).toBeVisible();
    await expect(modal.getByText('Aprovar ponto em lote')).toBeVisible();
    await expect(modal.getByText(/Inserir horário manual/)).toBeVisible();

    await modal.getByRole('button', { name: /^Financeiro/ }).click();
    await expect(modal.getByText('Aplicar bonificação tipo B')).toBeVisible();
    await expect(modal.getByText('Aplicar bonificação tipo C1')).toBeVisible();
    await expect(modal.getByText('Aplicar bonificação tipo C2')).toBeVisible();
    await expect(modal.getByText('Remover bonificação por tipo específico')).toBeVisible();

    await modal.getByRole('button', { name: /^Erros/ }).click();
    await expect(modal.getByText(/Criar erro por valor/)).toBeVisible();
    await expect(modal.getByText(/Ver aba Triagem/)).toBeVisible();
    await expect(modal.getByText(/Registrar erros de triagem/)).toBeVisible();
    await expect(modal.getByText(/Distribuir erros de triagem/)).toBeVisible();
  });
});
