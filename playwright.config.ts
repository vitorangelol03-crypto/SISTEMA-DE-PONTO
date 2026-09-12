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
/**
 * CÂMERA FALSA PARA OS TESTES DE FACIAL (12/09/2026, pedido do Victor).
 *
 * O Chromium headless não tem câmera, e desde que o `/clock` passou a abrir na
 * facial (`cad2c39`, 04/09) os testes que passam por ela morriam em "Não foi
 * possível acessar a câmera" — falha de bancada, não do produto.
 *
 * - `--use-fake-device-for-media-stream`: cria uma câmera de mentira.
 * - `--use-fake-ui-for-media-stream`: aceita o pedido de permissão sozinho, sem
 *   o balãozinho do navegador.
 *
 * ⚠️ O QUE ISTO **NÃO** FAZ: a câmera falsa transmite um padrão colorido, não um
 * ROSTO. Então ela resolve "a câmera existe" — e só. Um fluxo que precisa de um
 * rosto DETECTADO continua não passando, e isso é proposital: seria pior um
 * teste "verde" que não provou reconhecimento nenhum. Pra chegar lá seria
 * preciso alimentar um vídeo de rosto de verdade
 * (`--use-file-for-fake-video-capture=arquivo.y4m`).
 *
 * ⚠️ Não afeta o teste 62 ("câmera bloqueada"): ele simula o estado `denied` por
 * `addInitScript` em `navigator.permissions.query`, sem depender da câmera real.
 */
const CAMERA_FALSA_CHROME = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
];

const CAMERA_FALSA_FIREFOX = {
  'media.navigator.streams.fake': true,
  'media.navigator.permission.disabled': true,
};

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,        // ignora cleanup.ts, global-setup.ts etc.
  testIgnore: ['**/tests/unit/**'],  // tests/unit/ rodam no vitest, não Playwright
  fullyParallel: false,              // testes mexem no mesmo DB — serializar
  workers: 1,
  forbidOnly: !!process.env.CI,
  // 2026-07-19: retry 1x local — bateria de 1h+ no WSL tem flake rotativo de
  // carga (subconjunto diferente tropeça a cada rodada; todos passam isolados).
  // Teste que passa no retry vira "flaky" no relatório (VISÍVEL, nada escondido);
  // falha dupla = falha real. CI mantém 2.
  retries: process.env.CI ? 2 : 1,
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  /* 12/09/2026 — de 30s pra 90s. Não é folga pra teste lento: é que o orçamento
     do TESTE precisa caber a navegação. Com `timeout: 30_000` e
     `navigationTimeout: 60_000`, a licença de 60s da navegação não valia nada —
     o teste morria aos 30s no meio dela, e a mensagem ("Test timeout of 30000ms
     exceeded while running beforeEach hook") escondia que o problema era a
     primeira carga do Vite. O `global-setup` agora esquenta o servidor antes da
     suíte, então isto aqui é só a rede de segurança. Continua sendo espera por
     CONDIÇÃO: tela quebrada falha igual, só um pouco depois. */
  timeout: 90_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    /* 11/09/2026 — de 15s pra 60s. Nesta máquina o robô da Shopee roda junto (6
       Chromes, ~5 GB de 12) e a PRIMEIRA navegação de cada spec passava dos 15s,
       derrubando testes que não tinham nada a ver com o que estava sendo mexido.
       Isso é espera por CONDIÇÃO (a página carregou), não por tempo fixo: uma
       página de verdade quebrada continua falhando, só que um pouco depois. */
    navigationTimeout: 60_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        launchOptions: { args: CAMERA_FALSA_CHROME },
      },
    },
    {
      // Subset mobile (sub-fase 14.10): roda via `--project=mobile-pixel5 --grep`
      // para validar viewport Android (393x851, touch). NÃO executa por padrão.
      name: 'mobile-pixel5',
      use: {
        ...devices['Pixel 5'],
        headless: true,
        launchOptions: { args: CAMERA_FALSA_CHROME },
      },
    },
    {
      // Browser compat Firefox (sub-fase 16.2): roda via `--project=firefox`
      // para validar engine Gecko (regressões CSS/JS específicas). NÃO executa por padrão.
      // Suite essencial: tests/01-auth + tests/02-employee-clock + tests/100-supremo-v2.
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        headless: true,
        launchOptions: { firefoxUserPrefs: CAMERA_FALSA_FIREFOX },
      },
    },
    {
      // Browser compat Webkit/Safari (sub-fase 16.2): roda via `--project=webkit`
      // para validar engine Safari (regressões CSS/JS Apple). NÃO executa por padrão.
      // Cobre Safari macOS e iOS (mesmo engine). Suite essencial idêntica ao firefox.
      name: 'webkit',
      use: { ...devices['Desktop Safari'], headless: true },
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
