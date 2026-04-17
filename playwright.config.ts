import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — testes E2E do Sistema de Ponto
 *
 * Rodar todos:        npm test
 * Modo UI:            npm run test:ui
 * Com browser visível:npm run test:headed
 * Ver relatório:      npm run test:report
 *
 * Os testes assumem que admin `9999/684171`, supervisor `01/9098`
 * e o funcionário CPF `12232625613` (Victor Angelo — com PIN)
 * existem no Supabase.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,    // ignora cleanup.ts, global-setup.ts etc.
  fullyParallel: false,          // testes mexem no mesmo DB — serializar
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
