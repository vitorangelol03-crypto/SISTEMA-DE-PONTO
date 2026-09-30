import { test, expect, chromium, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getClient } from './cleanup';

/**
 * A TELA DE PONTO COMO APLICATIVO NO TABLET (30/09/2026) — com cliques de verdade.
 *
 * O pedido do Victor: "a tela do ponto vai ficar responsiva no touch, encaixadinha na tela...
 * funções de mobile onde você vai no navegador e consegue instalar como se fosse um aplicativo...
 * ocupando a tela certinho sem parecer que está aberto no navegador... na horizontal ou na
 * vertical... sem nada cortado ou com muito zoom". Decidido por ele: nome "Ponto" + o relógio azul
 * do sistema, tela cheia total e tela sempre acesa com o app de ponto aberto.
 *
 * COMO SABER QUE FUNCIONOU (combinado antes de programar):
 *   - no tablet, em pé ou deitado, cada tela do ponto (câmera, CPF, ativação, senha e o painel do
 *     funcionário) aparece INTEIRA — sem rolar, sem nada cortado e sem um botão por cima do outro;
 *   - no celular nada fica mais largo que a tela, e janela que não cabe ROLA (nunca corta o topo);
 *   - o navegador lê o app "Ponto" (tela cheia, abre no /clock, ícones de verdade) só na tela de
 *     ponto — o painel continua sendo site;
 *   - a pinça não dá zoom na tela de ponto (no painel continua dando);
 *   - aberto como app, a tela não apaga; aberto no navegador comum, o sistema não prende a tela.
 *
 * As fotos de cada tela ficam em test-results/tela-de-ponto/ (pra olhar com os olhos também).
 *
 * 🔑 Empresa e pessoa FIXTURE, criadas aqui e apagadas no fim. A câmera falsa do Chromium manda
 * um padrão colorido (sem rosto), então a tela fica "procurando rosto" e ninguém é identificado —
 * nenhuma batida é gravada. Nada de Caratinga/Ponte Nova é tocado.
 */

const LAT = -19.5;
const LNG = -42.6;
const STAMP = Date.now();
const EMPRESA_NOME = `PW Test Tela Ponto ${STAMP}`;
const PESSOA_NOME = `PW Test Tela Ponto Pessoa ${STAMP}`;
const PIN = ['4', '3', '2', '1'];
const CHAVE_EMPRESA = 'sistema_ponto_company_id';
const BASE = 'http://localhost:5173';
const PASTA_FOTOS = path.resolve('test-results', 'tela-de-ponto');
const CAMERA_FALSA = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

interface Tamanho {
  nome: string;
  width: number;
  height: number;
  /** Tablet: a tela inteira tem que caber sem rolar. */
  tablet: boolean;
  /** Tablet de 10": além de caber, letras e teclas crescem (pro dedo). */
  grande: boolean;
}

const TAMANHOS: Tamanho[] = [
  { nome: 'tablet-em-pe', width: 800, height: 1280, tablet: true, grande: true },
  { nome: 'tablet-deitado', width: 1280, height: 800, tablet: true, grande: true },
  { nome: 'tablet7-em-pe', width: 600, height: 1024, tablet: true, grande: false },
  { nome: 'tablet7-deitado', width: 1024, height: 600, tablet: true, grande: false },
  { nome: 'celular', width: 390, height: 844, tablet: false, grande: false },
  { nome: 'celular-deitado', width: 844, height: 390, tablet: false, grande: false },
];

/** Tecla do teclado de senha no tablet de 10": antes 64px de altura (igual ao celular). */
const TECLA_MINIMA_NO_TABLET_GRANDE = 72;

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

// ─── Medidas ────────────────────────────────────────────────────────────────

async function medidas(page: Page) {
  return page.evaluate(() => ({
    larguraDaTela: window.innerWidth,
    alturaDaTela: window.innerHeight,
    larguraDaPagina: document.documentElement.scrollWidth,
    alturaDaPagina: document.documentElement.scrollHeight,
  }));
}

async function semRolagemLateral(page: Page, onde: string) {
  const m = await medidas(page);
  expect.soft(m.larguraDaPagina, `${onde}: a página não pode ficar mais larga que a tela`).toBeLessThanOrEqual(m.larguraDaTela);
}

async function cabeSemRolar(page: Page, onde: string) {
  const m = await medidas(page);
  expect.soft(m.alturaDaPagina, `${onde}: tem que caber na tela sem rolar (página ${m.alturaDaPagina}px, tela ${m.alturaDaTela}px)`)
    .toBeLessThanOrEqual(m.alturaDaTela);
}

/** O elemento inteiro dentro da tela, sem rolar nada. */
async function inteiroNaTela(page: Page, alvo: Locator, onde: string) {
  await expect(alvo, `${onde}: tem que aparecer`).toBeVisible();
  const caixa = await alvo.boundingBox();
  const tela = page.viewportSize();
  if (!caixa || !tela) throw new Error(`${onde}: sem caixa/tela pra medir`);
  expect.soft(caixa.y, `${onde}: cortado em cima (y=${caixa.y})`).toBeGreaterThanOrEqual(0);
  expect.soft(caixa.x, `${onde}: cortado na esquerda (x=${caixa.x})`).toBeGreaterThanOrEqual(0);
  expect.soft(caixa.x + caixa.width, `${onde}: cortado na direita`).toBeLessThanOrEqual(tela.width + 0.5);
  expect.soft(caixa.y + caixa.height, `${onde}: cortado embaixo (vai até ${Math.round(caixa.y + caixa.height)}px de ${tela.height}px)`)
    .toBeLessThanOrEqual(tela.height + 0.5);
}

/** Dois elementos não podem ficar um por cima do outro. */
async function naoEncavalam(a: Locator, b: Locator, onde: string) {
  const ca = await a.boundingBox();
  const cb = await b.boundingBox();
  if (!ca || !cb) throw new Error(`${onde}: sem caixa pra medir`);
  const largura = Math.min(ca.x + ca.width, cb.x + cb.width) - Math.max(ca.x, cb.x);
  const altura = Math.min(ca.y + ca.height, cb.y + cb.height) - Math.max(ca.y, cb.y);
  expect.soft(largura > 0 && altura > 0, `${onde}: um está por cima do outro (${Math.round(largura)}×${Math.round(altura)}px)`).toBe(false);
}

async function altura(alvo: Locator): Promise<number> {
  const caixa = await alvo.boundingBox();
  return caixa ? Math.round(caixa.height) : 0;
}

async function foto(page: Page, t: Tamanho, tela: string) {
  fs.mkdirSync(PASTA_FOTOS, { recursive: true });
  await page.screenshot({ path: path.join(PASTA_FOTOS, `${t.nome}-${tela}.png`) });
}

/**
 * Espera a câmera PRONTA — não basta o aviso "Aproxime o rosto" existir: ele já nasce montado
 * DEBAIXO da janela "Preparando reconhecimento..." (a 1ª rodada deste teste mediu a tela errada
 * por isso). Pronta = a janela de carregamento sumiu e o aviso está à vista.
 */
async function esperarCameraPronta(page: Page) {
  await expect(page.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Preparando reconhecimento/)).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText('Aproxime o rosto da câmera')).toBeVisible();
}

// ─── Testes ─────────────────────────────────────────────────────────────────

test.describe.serial('tela de ponto como app no tablet — cliques reais', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'câmera falsa, pinça e leitura do app só no Chromium');
  test.setTimeout(240_000);

  let empresaId = '';
  let pessoaId = '';
  let cpf = '';
  // Plano B do tablet (CPF + senha + rosto): empresa com facial obrigatória e pessoa com rosto.
  let empresaFacialId = '';
  let pessoaFacialId = '';
  let cpfFacial = '';
  // Primeiro acesso (ainda sem senha): a tela de CRIAR a senha, que tem um texto a mais.
  let pessoaNovaId = '';
  let cpfNovo = '';
  const navegadores: Browser[] = [];

  async function aparelho(t: { width: number; height: number }, opts: { initScript?: () => void; completo?: boolean; empresa?: string } = {}): Promise<{ context: BrowserContext; page: Page; browser: Browser }> {
    // `completo`: o Chromium inteiro (o "headless shell" padrão recusa segurar a tela acesa).
    const browser = await chromium.launch({ args: CAMERA_FALSA, ...(opts.completo ? { channel: 'chromium' } : {}) });
    navegadores.push(browser);
    const context = await browser.newContext({
      baseURL: BASE,
      viewport: { width: t.width, height: t.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      geolocation: { latitude: LAT, longitude: LNG },
      permissions: ['geolocation', 'camera'],
    });
    await context.addInitScript(
      ({ chave, empresa }) => { localStorage.setItem(chave, empresa); },
      { chave: CHAVE_EMPRESA, empresa: opts.empresa ?? empresaId },
    );
    if (opts.initScript) await context.addInitScript(opts.initScript);
    const page = await context.newPage();
    return { context, page, browser };
  }

  test.beforeAll(async () => {
    const s = getClient();
    const { data: empresa, error: e1 } = await s.from('companies').insert([{
      legal_name: `${EMPRESA_NOME} LTDA`,
      cnpj: randomDigits(12),
      display_name: EMPRESA_NOME,
      city: 'Teste, MG',
      default_geo_lat: LAT,
      default_geo_lng: LNG,
      default_geo_radius: 150,
      default_marking_count: 2,
      // Abre na câmera (como Caratinga) — é a 1ª tela que o tablet mostra.
      face_identify_default: true,
      // Sem facial obrigatória: depois da senha vai direto pro painel do funcionário.
      require_facial_clock: false,
    }]).select('id').single();
    if (e1) throw e1;
    empresaId = (empresa as { id: string }).id;

    cpf = randomDigits(11);
    const { data: pessoa, error: e2 } = await s.from('employees').insert([{
      name: PESSOA_NOME,
      cpf,
      company_id: empresaId,
      employment_type: 'Diarista',
      created_by: '9999',
      pin: PIN.join(''),
      pin_configured: true,
      face_registered: false,
    }]).select('id').single();
    if (e2) throw e2;
    pessoaId = (pessoa as { id: string }).id;

    cpfNovo = randomDigits(11);
    const { data: pessoaNova, error: e5 } = await s.from('employees').insert([{
      name: `${PESSOA_NOME} Nova`,
      cpf: cpfNovo,
      company_id: empresaId,
      employment_type: 'Diarista',
      created_by: '9999',
      pin_configured: false,
      face_registered: false,
    }]).select('id').single();
    if (e5) throw e5;
    pessoaNovaId = (pessoaNova as { id: string }).id;

    const { data: empresaFacial, error: e3 } = await s.from('companies').insert([{
      legal_name: `${EMPRESA_NOME} Facial LTDA`,
      cnpj: randomDigits(12),
      display_name: `${EMPRESA_NOME} Facial`,
      city: 'Teste, MG',
      default_geo_lat: LAT,
      default_geo_lng: LNG,
      default_geo_radius: 150,
      default_marking_count: 2,
      face_identify_default: false,
      require_facial_clock: true,
    }]).select('id').single();
    if (e3) throw e3;
    empresaFacialId = (empresaFacial as { id: string }).id;

    cpfFacial = randomDigits(11);
    // Um rosto qualquer (128 números): a câmera falsa não mostra rosto nenhum, então a verificação
    // fica "procurando rosto" — é a tela que se quer medir, e nenhuma batida chega a ser gravada.
    const rosto = Array.from({ length: 128 }, (_, i) => Math.round(Math.sin(i + 1) * 1e4) / 1e5);
    const { data: pessoaFacial, error: e4 } = await s.from('employees').insert([{
      name: `${PESSOA_NOME} Facial`,
      cpf: cpfFacial,
      company_id: empresaFacialId,
      employment_type: 'Diarista',
      created_by: '9999',
      pin: PIN.join(''),
      pin_configured: true,
      face_registered: true,
      face_descriptor: rosto,
    }]).select('id').single();
    if (e4) throw e4;
    pessoaFacialId = (pessoaFacial as { id: string }).id;
  });

  test.afterAll(async () => {
    for (const b of navegadores) await b.close().catch(() => undefined);
    const s = getClient();
    if (pessoaNovaId) await s.from('employees').delete().eq('id', pessoaNovaId);
    for (const [empresa, pessoa] of [[empresaId, pessoaId], [empresaFacialId, pessoaFacialId]]) {
      if (pessoa) {
        await s.from('attendance').delete().eq('employee_id', pessoa);
        await s.from('geo_fraud_attempts').delete().eq('employee_id', pessoa);
        await s.from('bonus_blocks').delete().eq('employee_id', pessoa);
        await s.from('employees').delete().eq('id', pessoa);
      }
      if (!empresa) continue;
      await s.from('face_auth_attempts').delete().eq('company_id', empresa);
      await s.from('error_logs').delete().eq('company_id', empresa);
      await s.from('companies').delete().eq('id', empresa);
    }
  });

  for (const t of TAMANHOS) {
    test(`${t.nome} (${t.width}×${t.height}): câmera, CPF, ativação, senha e painel aparecem inteiros`, async () => {
      const { page } = await aparelho(t);
      await page.goto('/clock');

      // ── 1. Câmera (a 1ª tela do tablet) ──
      const rotulo = page.getByText('Aproxime o rosto da câmera');
      await esperarCameraPronta(page);
      const barra = page.getByText('Reconhecimento facial — Registro de Ponto');
      const botaoCpf = page.getByRole('button', { name: 'Prefere digitar CPF e senha?' });
      await foto(page, t, '1-camera');
      await semRolagemLateral(page, 'câmera');
      await inteiroNaTela(page, barra, 'câmera: barra de cima');
      await inteiroNaTela(page, rotulo, 'câmera: aviso "Aproxime o rosto"');
      await inteiroNaTela(page, botaoCpf, 'câmera: botão "Prefere digitar CPF e senha?"');
      await naoEncavalam(rotulo, botaoCpf, 'câmera: aviso × botão de CPF');

      // ── 2. CPF ──
      await botaoCpf.click();
      const campo = page.locator('input[placeholder="000.000.000-00"]');
      await expect(campo).toBeEditable({ timeout: 15_000 });
      const continuar = page.getByRole('button', { name: 'Continuar' });
      const ativar = page.getByRole('button', { name: 'Ativar este aparelho como tablet de ponto' });
      await foto(page, t, '2-cpf');
      await semRolagemLateral(page, 'CPF');
      if (t.tablet) {
        await cabeSemRolar(page, 'CPF');
        for (const [alvo, nome] of [[campo, 'campo'], [continuar, 'Continuar'], [ativar, 'Ativar tablet']] as const) {
          await inteiroNaTela(page, alvo, `CPF: ${nome}`);
        }
      }
      if (t.grande) {
        const letra = await campo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect.soft(letra, 'CPF: número do CPF maior no tablet (antes 24px)').toBeGreaterThanOrEqual(28);
      }

      // ── 3. Ativação do tablet (e volta) ──
      await ativar.click();
      const codigo = page.getByLabel('Código de ativação');
      await expect(codigo).toBeVisible();
      await foto(page, t, '3-ativar');
      await semRolagemLateral(page, 'ativação');
      if (t.tablet) {
        await cabeSemRolar(page, 'ativação');
        await inteiroNaTela(page, codigo, 'ativação: campo do código');
        await inteiroNaTela(page, page.getByRole('button', { name: 'Ativar tablet' }), 'ativação: botão');
        await inteiroNaTela(page, page.getByRole('button', { name: 'Voltar' }), 'ativação: Voltar');
      }
      await page.getByRole('button', { name: 'Voltar' }).click();
      await esperarCameraPronta(page);

      // ── 4. Senha ──
      await botaoCpf.click();
      await expect(campo).toBeEditable({ timeout: 15_000 });
      await campo.fill(cpf);
      await continuar.click();
      const confirmar = page.getByRole('button', { name: /Confirmar PIN/i });
      await expect(confirmar).toBeVisible({ timeout: 20_000 });
      await foto(page, t, '4-senha');
      await semRolagemLateral(page, 'senha');
      const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => page.getByRole('button', { name: d, exact: true }));
      if (t.tablet) {
        await cabeSemRolar(page, 'senha');
        for (const [i, tecla] of teclas.entries()) await inteiroNaTela(page, tecla, `senha: tecla ${i === 9 ? 0 : i + 1}`);
        await inteiroNaTela(page, confirmar, 'senha: Confirmar PIN');
      }
      const alturaDaTecla = await altura(teclas[0]);
      console.log(`[${t.nome}] tecla da senha: ${alturaDaTecla}px de altura`);
      if (t.grande) {
        expect.soft(alturaDaTecla, 'senha: tecla maior pro dedo no tablet de 10"').toBeGreaterThanOrEqual(TECLA_MINIMA_NO_TABLET_GRANDE);
      }

      // ── 5. Painel do funcionário (o botão de bater o ponto) ──
      for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
      await confirmar.click();
      const baterEntrada = page.getByRole('button', { name: /REGISTRAR ENTRADA/i });
      await expect(baterEntrada).toBeVisible({ timeout: 30_000 });
      const sair = page.getByRole('button', { name: 'Sair' });
      await foto(page, t, '5-painel');
      await semRolagemLateral(page, 'painel');
      if (t.tablet) {
        await cabeSemRolar(page, 'painel');
        await inteiroNaTela(page, baterEntrada, 'painel: REGISTRAR ENTRADA');
        await inteiroNaTela(page, sair, 'painel: Sair');
      }
      await sair.click();
      await esperarCameraPronta(page);
    });
  }

  test('janela maior que a tela ROLA — nunca corta o topo (câmera bloqueada, celular deitado e tablet 7")', async () => {
    for (const t of TAMANHOS.filter((x) => x.nome === 'celular-deitado' || x.nome === 'tablet7-deitado')) {
      const { page } = await aparelho(t, {
        // A câmera bloqueada no navegador: é a janela mais comprida das telas de câmera.
        initScript: () => {
          navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
          const perms = navigator.permissions;
          const query = perms.query.bind(perms);
          perms.query = ((d: PermissionDescriptor) =>
            d?.name === ('camera' as PermissionName)
              ? Promise.resolve({ state: 'denied', onchange: null } as unknown as PermissionStatus)
              : query(d)) as typeof perms.query;
        },
      });
      await page.goto('/clock');
      const janela = page.getByTestId('camera-problem');
      await expect(janela).toBeVisible({ timeout: 60_000 });
      await expect(janela).toHaveAttribute('data-problema', 'bloqueada-no-navegador');
      await foto(page, t, '6-camera-bloqueada');
      await semRolagemLateral(page, 'câmera bloqueada');
      await inteiroNaTela(page, page.getByText('📷 Câmera bloqueada'), `${t.nome}: título da janela (o topo)`);
      // O resto da janela se alcança ROLANDO (antes nem rolava: o que passava da tela sumia) —
      // cada botão rolado até aparecer inteiro, e a saída pro CPF clicada de verdade.
      const tentar = page.getByRole('button', { name: 'Já liberei — vou tentar de novo' });
      await tentar.scrollIntoViewIfNeeded();
      await inteiroNaTela(page, tentar, `${t.nome}: botão "Já liberei" depois de rolar`);
      const sairProCpf = page.getByRole('button', { name: /CPF e senha/ });
      await sairProCpf.scrollIntoViewIfNeeded();
      await inteiroNaTela(page, sairProCpf, `${t.nome}: saída pro CPF depois de rolar`);
      await sairProCpf.click();
      await expect(page.locator('input[placeholder="000.000.000-00"]')).toBeEditable({ timeout: 15_000 });
    }
  });

  test('primeiro acesso no tablet (criar e confirmar a senha): texto, teclado e botões inteiros — no 7" deitado só o "Corrigir" pede rolagem', async () => {
    for (const t of TAMANHOS.filter((x) => x.tablet)) {
      const { page, browser } = await aparelho(t);
      await page.goto('/clock');
      await esperarCameraPronta(page);
      await page.getByRole('button', { name: 'Prefere digitar CPF e senha?' }).click();
      const campo = page.locator('input[placeholder="000.000.000-00"]');
      await expect(campo).toBeEditable({ timeout: 15_000 });
      await campo.fill(cpfNovo);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByText('Criar sua senha de acesso')).toBeVisible({ timeout: 20_000 });
      await foto(page, t, '8-criar-senha');
      await semRolagemLateral(page, `${t.nome}: criar senha`);
      await cabeSemRolar(page, `${t.nome}: criar senha`);
      // Em pé a explicação fica no conteúdo; deitado, na coluna azul — vale a que está à vista.
      const explicacao = page.getByText(/Este é seu primeiro acesso/).filter({ visible: true });
      await expect(explicacao).toHaveCount(1);
      await inteiroNaTela(page, explicacao, `${t.nome}: criar senha — explicação`);
      for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
        await inteiroNaTela(page, page.getByRole('button', { name: d, exact: true }), `${t.nome}: criar senha — tecla ${d}`);
      }
      await inteiroNaTela(page, page.getByRole('button', { name: 'Próximo' }), `${t.nome}: criar senha — Próximo`);

      // 2ª etapa (confirmar a senha) — sem salvar nada. Ela tem um botão a mais ("Corrigir nova
      // senha"): no tablet de 7" deitado esse botão de VOLTAR fica logo abaixo da tela e se
      // alcança rolando; o de seguir ("Salvar senha") aparece inteiro em todos os tablets.
      for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
      await page.getByRole('button', { name: 'Próximo' }).click();
      const salvar = page.getByRole('button', { name: 'Salvar senha' });
      await expect(salvar).toBeVisible();
      await foto(page, t, '9-confirmar-senha');
      await semRolagemLateral(page, `${t.nome}: confirmar senha`);
      await inteiroNaTela(page, salvar, `${t.nome}: confirmar senha — Salvar senha`);
      const corrigir = page.getByRole('button', { name: /Corrigir nova senha/ });
      if (t.nome === 'tablet7-deitado') {
        await corrigir.scrollIntoViewIfNeeded();
      } else {
        await cabeSemRolar(page, `${t.nome}: confirmar senha`);
      }
      await inteiroNaTela(page, corrigir, `${t.nome}: confirmar senha — Corrigir nova senha`);
      await browser.close();
    }
  });

  test('plano B do tablet (CPF + senha + rosto), em pé e deitado: a verificação facial aparece inteira e o aviso não encosta na barra de confiança', async () => {
    for (const t of TAMANHOS.filter((x) => x.tablet && x.nome !== 'tablet7-em-pe')) {
      const { page, browser } = await aparelho(t, { empresa: empresaFacialId });
      await page.goto('/clock');
      const campo = page.locator('input[placeholder="000.000.000-00"]');
      await expect(campo).toBeEditable({ timeout: 30_000 });
      await campo.fill(cpfFacial);
      await page.getByRole('button', { name: 'Continuar' }).click();
      for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
      await page.getByRole('button', { name: /Confirmar PIN/i }).click();
      const bater = page.getByRole('button', { name: /REGISTRAR ENTRADA/i });
      await expect(bater).toBeVisible({ timeout: 30_000 });
      await bater.click();

      // A câmera falsa não tem rosto: a verificação fica procurando — a tela que se quer medir.
      const barra = page.getByText('Verificação Facial');
      await expect(barra).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/Preparando verificação/)).toHaveCount(0, { timeout: 60_000 });
      const aviso = page.getByTestId('face-scan-label');
      await expect(aviso).toHaveText(/Procurando rosto/);
      const confianca = page.getByText('Confiança', { exact: true }).locator('xpath=../..');
      await foto(page, t, '7-verificacao-facial');
      await semRolagemLateral(page, `${t.nome}: verificação facial`);
      await inteiroNaTela(page, barra, `${t.nome}: verificação — barra de cima`);
      await inteiroNaTela(page, aviso, `${t.nome}: verificação — aviso`);
      await inteiroNaTela(page, confianca, `${t.nome}: verificação — barra de confiança`);
      await naoEncavalam(aviso, confianca, `${t.nome}: verificação — aviso × barra de confiança`);
      await browser.close();
    }
  });

  test('o navegador lê o app "Ponto" na tela de ponto (tela cheia, abre no /clock, ícones de verdade) — e o painel continua site', async () => {
    const { page, context } = await aparelho({ width: 800, height: 1280 });
    const cdp = await context.newCDPSession(page);

    await page.goto('/clock');
    await esperarCameraPronta(page);
    const app = await cdp.send('Page.getAppManifest') as {
      url: string;
      errors: Array<{ message: string }>;
      data?: string;
      manifest?: { display?: string; startUrl?: string; scope?: string; id?: string };
    };
    console.log('[app] manifest lido pelo navegador:', JSON.stringify({ url: app.url, errors: app.errors, manifest: app.manifest }));
    expect(app.url, 'a tela de ponto tem que apontar o arquivo do app').toMatch(/\/ponto\.webmanifest$/);
    expect(app.errors, 'o navegador não pode achar erro no arquivo do app').toEqual([]);
    expect(app.manifest?.display, 'tela cheia total (decisão do Victor)').toBe('kFullscreen');
    expect(app.manifest?.startUrl).toBe(`${BASE}/clock`);
    expect(app.manifest?.scope, 'só a tela de ponto é o app').toBe(`${BASE}/clock`);
    const lido = JSON.parse(app.data ?? '{}') as { name?: string; short_name?: string; icons?: Array<{ src: string; sizes: string; purpose?: string }> };
    expect(lido.name).toBe('Ponto');
    expect(lido.short_name).toBe('Ponto');

    // Cada ícone do app é um PNG DE VERDADE no tamanho que diz (os PNGs antigos eram texto).
    const icones = lido.icons ?? [];
    expect(icones.map((i) => `${i.sizes}/${i.purpose ?? 'any'}`).sort()).toEqual(
      ['192x192/any', '192x192/maskable', '512x512/any', '512x512/maskable'],
    );
    const pngs = [
      ...icones.map((i) => ({ src: i.src, lado: Number(i.sizes.split('x')[0]) })),
      { src: '/apple-touch-icon.png', lado: 180 },
      { src: '/favicon-32x32.png', lado: 32 },
      { src: '/favicon-16x16.png', lado: 16 },
    ];
    for (const { src, lado } of pngs) {
      const medida = await page.evaluate(async (url) => {
        const r = await fetch(url);
        const tipo = r.headers.get('content-type');
        try {
          const img = await createImageBitmap(await r.blob());
          return { ok: r.ok, tipo, w: img.width, h: img.height };
        } catch (e) {
          return { ok: r.ok, tipo, erro: String(e) };
        }
      }, src);
      expect(medida, `ícone ${src}`).toEqual({ ok: true, tipo: 'image/png', w: lado, h: lado });
    }

    // Tablet: "Ponto" também no iPhone/iPad (lá o nome vem destas marcas).
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Ponto');

    // O painel (login) NÃO é o app: nenhum arquivo de app ali.
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Entrar/i }).first()).toBeVisible({ timeout: 30_000 });
    const painel = await cdp.send('Page.getAppManifest') as { url: string };
    expect(painel.url, 'o painel não pode virar o app do ponto').toBe('');
  });

  test('a pinça não dá zoom na tela de ponto — e no painel continua dando', async () => {
    const { page, context } = await aparelho({ width: 800, height: 1280 });
    const cdp = await context.newCDPSession(page);
    const pinca = async () => {
      await cdp.send('Input.synthesizePinchGesture', { x: 400, y: 640, scaleFactor: 2, relativeSpeed: 800 });
      return page.evaluate(() => window.visualViewport?.scale ?? 1);
    };

    await page.goto('/clock');
    await esperarCameraPronta(page);
    expect(await pinca(), 'tela de ponto: a pinça não pode aumentar a tela').toBeCloseTo(1, 2);

    await page.getByRole('button', { name: 'Prefere digitar CPF e senha?' }).click();
    await expect(page.locator('input[placeholder="000.000.000-00"]')).toBeEditable({ timeout: 15_000 });
    expect(await pinca(), 'tela do CPF: a pinça não pode aumentar a tela').toBeCloseTo(1, 2);

    // Painel: continua com zoom (acessibilidade de quem usa o painel no celular).
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Entrar/i }).first()).toBeVisible({ timeout: 30_000 });
    expect(await pinca(), 'painel: a pinça continua funcionando').toBeGreaterThan(1.5);
  });

  test('aberto como app (tela cheia) a tela não apaga — e no navegador comum o sistema não prende a tela', async () => {
    /**
     * O navegador de teste não "instala" o app, então o modo app é simulado do único jeito
     * possível: a pergunta "estou em tela cheia de app?" (display-mode) responde sim. O resto é
     * de verdade: o Chromium inteiro, com a permissão de tela acesa, segura a tela de fato — e o
     * teste só observa as travas que o navegador devolveu (sem trocar nada delas).
     */
    const observarTravas = () => {
      const w = window as unknown as { __travas: WakeLockSentinel[] };
      w.__travas = [];
      if (!('wakeLock' in navigator)) return;
      const pedir = navigator.wakeLock.request.bind(navigator.wakeLock);
      navigator.wakeLock.request = async (tipo?: WakeLockType) => {
        const trava = await pedir(tipo);
        w.__travas.push(trava);
        return trava;
      };
    };
    const comoApp = () => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (consulta: string) => {
        if (!/display-mode:\s*fullscreen/.test(consulta)) return original(consulta);
        return {
          matches: true, media: consulta, onchange: null,
          addListener: () => undefined, removeListener: () => undefined,
          addEventListener: () => undefined, removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      };
    };
    const travasAtivas = (page: Page) => page.evaluate(() =>
      (window as unknown as { __travas: WakeLockSentinel[] }).__travas.filter((s) => !s.released).length);
    const travasPedidas = (page: Page) => page.evaluate(() =>
      (window as unknown as { __travas: WakeLockSentinel[] }).__travas.length);

    // ── Como app ──
    const app = await aparelho({ width: 1280, height: 800 }, { completo: true });
    // A permissão de tela acesa vai pro CONTEXTO deste aparelho (sem o id ela cai no contexto
    // padrão do navegador e este continua recusando — provado numa sonda em 30/09/2026). E vai
    // junto com câmera e GPS: a concessão por contexto substitui a lista inteira.
    const { targetInfo } = await (await app.context.newCDPSession(app.page)).send('Target.getTargetInfo');
    const cdpDoNavegador = await app.browser.newBrowserCDPSession();
    await cdpDoNavegador.send('Browser.grantPermissions', {
      permissions: ['wakeLockScreen', 'videoCapture', 'geolocation'],
      origin: BASE,
      browserContextId: targetInfo.browserContextId,
    });
    // As duas funções viajam pro navegador como TEXTO (um initScript não enxerga variáveis daqui).
    await app.context.addInitScript(`(${observarTravas.toString()})(); (${comoApp.toString()})();`);
    await app.page.goto('/clock');
    await esperarCameraPronta(app.page);
    await expect.poll(() => travasAtivas(app.page), { message: 'como app, a tela tem que ficar presa acesa', timeout: 10_000 }).toBe(1);

    // A tela apagou e voltou: o aparelho solta a trava sozinho; quando a tela volta, o app pede de novo.
    await app.page.evaluate(async () => {
      const w = window as unknown as { __travas: WakeLockSentinel[] };
      await w.__travas[0].release();
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => travasAtivas(app.page), { message: 'a tela voltou: trava pedida de novo', timeout: 10_000 }).toBe(1);
    expect(await travasPedidas(app.page)).toBe(2);

    // ── No navegador comum (celular pessoal, por exemplo) ──
    const site = await aparelho({ width: 390, height: 844 }, { completo: true });
    await site.context.addInitScript(`(${observarTravas.toString()})();`);
    await site.page.goto('/clock');
    await esperarCameraPronta(site.page);
    expect(await travasPedidas(site.page), 'no navegador comum o sistema não prende a tela').toBe(0);
  });
});
