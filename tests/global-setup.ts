import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { SUITE_START_FILE } from './cleanup';

const BASE_URL = 'http://localhost:5173';

/**
 * ESQUENTA O SERVIDOR ANTES DA SUÍTE COMEÇAR.
 *
 * 🔴 O flake que mais custou tempo nesta máquina (12/09/2026): o PRIMEIRO
 * `page.goto('/')` de cada arquivo estourava, e o teste morria no `beforeEach`
 * do login — sempre um teste diferente, sempre sem relação com o que tinha sido
 * mexido.
 *
 * A causa não é lentidão genérica: o `webServer.url` do Playwright só espera o
 * Vite RESPONDER (ele devolve o HTML na hora). O que demora é o Vite compilar o
 * grafo de módulos na primeira navegação de verdade — e isso acontecia DENTRO do
 * primeiro teste, comendo o orçamento dele.
 *
 * Aqui a primeira navegação acontece FORA de qualquer teste: abre a página uma
 * vez, espera a tela de login existir (condição, não tempo), e fecha. A partir
 * daí o Vite já tem tudo em cache e todo `goto` seguinte é rápido.
 *
 * Se não der certo, NÃO derruba a suíte: só avisa. A suíte ainda roda — só volta
 * a ter o flake do primeiro teste.
 */
async function esquentarOServidor(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 180_000 });
    // A tela de login é a prova de que o app compilou e montou, não só que o
    // servidor respondeu um HTML vazio.
    await page.locator('#id').waitFor({ state: 'visible', timeout: 180_000 });
    console.log('[global-setup] Servidor esquentado — o Vite já compilou o app.');
  } catch (err) {
    console.warn(
      `[global-setup] ⚠️ Não consegui esquentar o servidor (${(err as Error).message}). `
      + 'A suíte continua, mas o primeiro teste de cada arquivo pode estourar o tempo.',
    );
  } finally {
    await browser.close();
  }
}

/**
 * Registra o timestamp de início da suíte — usado por globalTeardown e pelos
 * afterAll dos specs para identificar "dados criados durante a suíte".
 *
 * Usa uma pequena folga de 1s para trás para evitar race conditions.
 */
export default async function globalSetup() {
  const start = new Date(Date.now() - 1000).toISOString();
  fs.mkdirSync(path.dirname(SUITE_START_FILE), { recursive: true });
  fs.writeFileSync(SUITE_START_FILE, start, 'utf8');
  process.env.PW_SUITE_START = start;

  await esquentarOServidor();
}
