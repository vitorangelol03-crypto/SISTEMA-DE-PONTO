/**
 * Playwright config — Suite contra URL PROD Vercel.
 *
 * Rodar:
 *   npx playwright test --config=playwright.config.prod.ts --workers=1 --reporter=line
 *
 * Diferenças vs playwright.config.ts (default, dev server):
 *  - baseURL aponta pra Vercel prod
 *  - SEM webServer (não inicia npm run dev)
 *  - Timeouts maiores (rede pública vs localhost)
 *  - Reporter line por padrão (menos verboso pra suite longa)
 */
import { defineConfig, devices } from '@playwright/test';

const PROD_URL = 'https://sistema-ponto-zeta.vercel.app';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  testIgnore: ['**/tests/unit/**'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-prod' }],
  ],
  // Timeouts +50% pra absorver latência pública vs localhost
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: PROD_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true },
    },
  ],

  // SEM webServer — usa URL prod direto.
});
