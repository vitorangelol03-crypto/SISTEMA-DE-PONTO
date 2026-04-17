import { test, expect } from '@playwright/test';
import { ADMIN, SUPERVISOR, loginAs, logout } from './helpers';

test.describe('Autenticação', () => {
  test('login admin mostra badge "Administrador"', async ({ page }) => {
    await loginAs(page, ADMIN);
    // O header tem 2 badges (desktop + mobile); basta ao menos 1 ficar visível
    await expect(page.locator('header').getByText(/Administrador|^Admin$/).first()).toBeVisible();
  });

  test('login supervisor mostra badge "Supervisor"', async ({ page }) => {
    await loginAs(page, SUPERVISOR);
    await expect(page.locator('header').getByText(/Supervisor|^Super$/).first()).toBeVisible();
  });

  test('senha errada mostra mensagem de erro', async ({ page }) => {
    await page.goto('/');
    await page.locator('#id').fill(ADMIN.id);
    await page.locator('#password').fill('senha-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Credenciais inválidas')).toBeVisible({ timeout: 10_000 });
  });

  test('ID inexistente mostra mensagem de erro', async ({ page }) => {
    await page.goto('/');
    await page.locator('#id').fill('999888');
    await page.locator('#password').fill('qualquer');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Credenciais inválidas')).toBeVisible({ timeout: 10_000 });
  });

  test('após login redireciona para aba Ponto', async ({ page }) => {
    await loginAs(page, ADMIN);
    // Aba "Ponto" deve estar ativa: tem o título "Controle de Ponto" na página
    await expect(page.getByRole('heading', { name: /Controle de Ponto/ })).toBeVisible();
  });

  test('botão Sair volta para tela de login', async ({ page }) => {
    await loginAs(page, ADMIN);
    await logout(page);
    await expect(page.locator('#id')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});
