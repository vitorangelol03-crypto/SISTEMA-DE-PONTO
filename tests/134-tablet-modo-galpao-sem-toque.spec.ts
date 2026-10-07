import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { loginAs, goToTab, MASTER_2626, irAoCampoDeCpfDoPonto } from './helpers';
import { getClient } from './cleanup';

/**
 * MODO GALPÃO — o tablet SEM TOQUE, com o rosto de verdade (06/10/2026, plano do tablet sem toque,
 * entrega A). Critério combinado com o Victor antes de programar: com o modo galpão ligado, a pessoa
 * bate a próxima marcação na ordem certa só parando na frente do tablet — e o teste conta ZERO
 * toques na tela do tablet.
 *
 * A facial RODA de verdade (como no tests/127): a câmera falsa do Chromium transmite o rosto A
 * (tests/fixtures/facial), o face-api calcula o rosto no navegador e o servidor compara.
 *
 * Igual ao galpão de verdade (Caratinga + Ponte Nova num tablet só — decisão 7): o tablet atende 2
 * empresas e MORA na A; a pessoa é da B (4 marcações, facial obrigatória). Fora do modo galpão a
 * câmera da A nunca a reconheceria (procura só na A).
 *
 * O caminho, na ordem:
 *   1. o 2626 gera o código pras 2 empresas e o tablet ativa (toques de INSTALAÇÃO, do responsável);
 *   2. a pessoa cadastra o rosto pelo CPF + senha (o plano B, com toque) e sai SEM bater;
 *   3. o 2626 liga o MODO GALPÃO no cartão do tablet;
 *   4. o tablet abre de novo e, DAQUI EM DIANTE, o teste conta os toques: a tela começa na CÂMERA
 *      (a empresa A abre no CPF!); a pessoa só fica na frente → reconhecida na OUTRA empresa e a
 *      "Entrada manhã" (a 1ª das 4 da empresa B) gravada NA B, com o nome GRANDE na tela;
 *   5. ela continua na frente: ignorada por 1 minuto; depois a saída do almoço a menos de 10 min
 *      vira o AVISO sem botão e NADA é gravado;
 *   6. ZERO toques na tela do tablet desde o passo 4.
 *
 * 🔑 Empresas FIXTURE ("PW Test"), criadas aqui e apagadas no fim — nada de Caratinga/Ponte Nova.
 */

const LAT = -19.5;
const LNG = -42.6;
const STAMP = Date.now();
const EMPRESA_A = `PW Test Galpao Casa ${STAMP}`;
const EMPRESA_B = `PW Test Galpao Vizinha ${STAMP}`;
const PESSOA_NOME = `PW Test Galpao Maria ${STAMP}`;
const TABLET_NOME = 'PW Tablet Sem Toque';
const PIN = ['4', '3', '2', '1'];
const ROSTO_A = path.resolve('tests/fixtures/facial/rosto-a.y4m');
const CHAVE_EMPRESA = 'sistema_ponto_company_id';
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
/** Relógio contínuo (o relógio de parede do WSL dá saltos — ver tests/132). */
const agora = () => performance.now();

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

type JanelaComToques = Window & { __toques?: number; __toquesPorTipo?: Record<string, number> };

test.describe.serial('modo galpão — o tablet sem toque, com o rosto de verdade', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'câmera falsa com arquivo só existe no Chromium');
  test.setTimeout(300_000);

  let empresaA = '';
  let empresaB = '';
  let pessoaId = '';
  let cpf = '';
  const navegadores: Browser[] = [];
  let tablet: { context: BrowserContext; page: Page };
  const consoleDoTablet: string[] = [];

  test.beforeAll(async () => {
    const s = getClient();
    const criar = async (nome: string, extra: Record<string, unknown>) => {
      const { data, error } = await s.from('companies').insert([{
        legal_name: `${nome} LTDA`, cnpj: randomDigits(12), display_name: nome, city: 'Teste, MG',
        default_geo_lat: LAT, default_geo_lng: LNG, default_geo_radius: 150, ...extra,
      }]).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    };
    // A (a "casa" do tablet) abre no CPF: prova que o modo galpão abre SEMPRE na câmera.
    empresaA = await criar(EMPRESA_A, { default_marking_count: 2, require_facial_clock: false, face_identify_default: false });
    // B (a da pessoa): 4 marcações e facial obrigatória — o servidor reconfere o rosto 1:1 (a 2ª foto).
    empresaB = await criar(EMPRESA_B, { default_marking_count: 4, require_facial_clock: true, face_identify_default: false });

    cpf = randomDigits(11);
    const { data: pessoa, error: e2 } = await s.from('employees').insert([{
      name: PESSOA_NOME,
      cpf,
      company_id: empresaB,
      employment_type: 'Diarista',
      created_by: '9999',
      pin: PIN.join(''),
      pin_configured: true,
      face_registered: false,
    }]).select('id').single();
    if (e2) throw e2;
    pessoaId = (pessoa as { id: string }).id;
  });

  test.afterEach(async () => {
    const info = test.info();
    if (info.status !== info.expectedStatus) {
      console.log(`── console do tablet (últimas 60 linhas) ──\n${consoleDoTablet.slice(-60).join('\n')}`);
      if (empresaB) {
        const s = getClient();
        const { data: tentativas } = await s.from('face_auth_attempts')
          .select('attempted_at, company_id, success, outcome, best_distance, second_distance')
          .in('company_id', [empresaA, empresaB]).order('attempted_at');
        const { data: ponto } = await s.from('attendance')
          .select('date, company_id, entry_1_time, exit_1_time, entry_time, geo_valid').eq('employee_id', pessoaId);
        console.log('── tentativas de rosto ──', JSON.stringify(tentativas));
        console.log('── attendance ──', JSON.stringify(ponto));
      }
    }
  });

  test.afterAll(async () => {
    for (const b of navegadores) await b.close().catch(() => undefined);
    const s = getClient();
    const empresas = [empresaA, empresaB].filter(Boolean);
    if (!empresas.length) return;
    const { data: vinculos } = await s.from('clock_device_companies').select('device_id').in('company_id', empresas);
    const tablets = [...new Set((vinculos ?? []).map((v: { device_id: string }) => v.device_id))];
    if (pessoaId) {
      await s.from('attendance').delete().eq('employee_id', pessoaId);
      await s.from('geo_fraud_attempts').delete().eq('employee_id', pessoaId);
      await s.from('bonus_blocks').delete().eq('employee_id', pessoaId);
      await s.storage.from('employee-photos').remove([`${pessoaId}/face.jpg`]);
    }
    for (const id of empresas) {
      await s.from('face_auth_attempts').delete().eq('company_id', id);
      await s.from('error_logs').delete().eq('company_id', id);
      await s.from('payment_periods').delete().eq('company_id', id);
    }
    if (pessoaId) await s.from('employees').delete().eq('id', pessoaId);
    if (tablets.length) await s.from('clock_devices').delete().in('id', tablets);
    for (const id of empresas) await s.from('companies').delete().eq('id', id);
  });

  test('1–3. instalação: tablet das 2 empresas, rosto cadastrado pelo CPF (sem bater) e o 2626 liga o modo galpão', async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Configurações');
    const cartao = page.getByTestId('clock-devices-card');
    await expect(cartao).toBeVisible({ timeout: 20_000 });
    await cartao.getByLabel('Nome do tablet').fill(TABLET_NOME);
    // Só as 2 empresas de teste: Caratinga, Ponte Nova (e qualquer outra) desmarcadas.
    const caixas = cartao.locator('label:has(input[type="checkbox"])');
    const n = await caixas.count();
    for (let i = 0; i < n; i++) {
      const rotulo = caixas.nth(i);
      const texto = ((await rotulo.textContent()) ?? '').trim();
      const caixa = rotulo.locator('input[type="checkbox"]');
      if (texto === EMPRESA_A || texto === EMPRESA_B) await caixa.check(); else await caixa.uncheck();
    }
    await cartao.getByRole('button', { name: 'Gerar código de ativação' }).click();
    const valor = cartao.getByTestId('codigo-de-ativacao-valor');
    await expect(valor).toHaveText(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, { timeout: 15_000 });
    const codigo = (await valor.textContent()) ?? '';

    const browser = await chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${ROSTO_A}`],
    });
    navegadores.push(browser);
    const context = await browser.newContext({
      baseURL: 'http://localhost:5173',
      geolocation: { latitude: LAT, longitude: LNG },
      permissions: ['geolocation', 'camera'],
      viewport: { width: 800, height: 1100 },
    });
    // O tablet "mora" na empresa A (como o tablet do galpão mora na Caratinga).
    await context.addInitScript(
      ({ chave, empresa }) => { if (!localStorage.getItem(chave)) localStorage.setItem(chave, empresa); },
      { chave: CHAVE_EMPRESA, empresa: empresaA },
    );
    // Conta TODO toque/clique/tecla que chega na página (a cada abertura, recomeça do zero).
    await context.addInitScript(() => {
      const w = window as JanelaComToques;
      w.__toques = 0;
      w.__toquesPorTipo = {};
      for (const tipo of ['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown']) {
        window.addEventListener(tipo, () => {
          w.__toques = (w.__toques ?? 0) + 1;
          const porTipo = w.__toquesPorTipo ?? {};
          porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
          w.__toquesPorTipo = porTipo;
        }, true);
      }
    });
    tablet = { context, page: await context.newPage() };
    const t = tablet.page;
    t.on('console', (m) => consoleDoTablet.push(`${m.type()}: ${m.text().slice(0, 300)}`));
    t.on('pageerror', (e) => consoleDoTablet.push(`pageerror: ${String(e).slice(0, 300)}`));

    await t.goto('/clock');
    await irAoCampoDeCpfDoPonto(t);
    await t.getByRole('button', { name: 'Ativar este aparelho como tablet de ponto' }).click();
    await t.getByLabel('Código de ativação').fill(codigo);
    await t.getByRole('button', { name: 'Ativar tablet' }).click();
    await expect(t.getByText(`Tablet ativado: ${TABLET_NOME}`)).toBeVisible({ timeout: 20_000 });
    await t.getByRole('button', { name: 'Começar', exact: true }).click();

    // Cadastro do rosto pelo CPF + senha (plano B, com toque) — e sai SEM bater o ponto.
    const campo = await irAoCampoDeCpfDoPonto(t);
    await campo.fill(cpf);
    await t.getByRole('button', { name: 'Continuar' }).click();
    for (const d of PIN) await t.getByRole('button', { name: d, exact: true }).click();
    await t.getByRole('button', { name: /Confirmar PIN/i }).click();
    await expect(t.getByText('Cadastro Facial')).toBeVisible({ timeout: 30_000 });
    await expect(t.getByRole('button', { name: /Bater Entrada manhã/i })).toBeVisible({ timeout: 90_000 });
    await t.getByRole('button', { name: 'Sair' }).click();

    const s = getClient();
    const { data: ficha } = await s.from('employees').select('face_registered').eq('id', pessoaId).single();
    expect((ficha as { face_registered: boolean }).face_registered).toBe(true);
    const { data: ponto } = await s.from('attendance').select('id').eq('employee_id', pessoaId).eq('date', hoje());
    expect(ponto ?? []).toHaveLength(0); // ainda não bateu

    // 3. O 2626 liga o modo galpão no cartão do tablet.
    await cartao.getByRole('button', { name: 'Atualizar lista' }).click();
    const linha = cartao.getByTestId(`tablet-${TABLET_NOME}`);
    await expect(linha.getByText('Ativo', { exact: true })).toBeVisible({ timeout: 15_000 });
    await cartao.getByTestId(`modo-galpao-${TABLET_NOME}`).click();
    await cartao.getByTestId('confirmar-modo-galpao').click();
    await expect(linha.getByText('Modo galpão', { exact: true })).toBeVisible({ timeout: 15_000 });
    const { data: vinculo } = await s.from('clock_device_companies').select('device_id').eq('company_id', empresaA).single();
    await expect.poll(async () => {
      const { data } = await s.from('clock_devices').select('modo_galpao').eq('id', (vinculo as { device_id: string }).device_id).single();
      return (data as { modo_galpao: boolean } | null)?.modo_galpao;
    }, { timeout: 15_000 }).toBe(true);
  });

  test('4–6. modo galpão: abre na câmera, reconhece quem é da OUTRA empresa e bate sozinho; saída rápida vira aviso — ZERO toques', async () => {
    const t = tablet.page;
    const s = getClient();
    await t.goto('/clock'); // o tablet abre de novo — daqui em diante, nenhum toque
    const inicio = agora();

    // 4. Começa na CÂMERA (a empresa A abre no CPF) e grava a 1ª marcação da B só com a pessoa na frente.
    await expect(t.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 60_000 });
    await expect(t.locator('input[placeholder="000.000.000-00"]')).toHaveCount(0);
    const resultado = t.getByTestId('galpao-resultado');
    await expect(resultado).toBeVisible({ timeout: 90_000 });
    await expect(resultado).toContainText(PESSOA_NOME);
    await expect(t.getByTestId('galpao-resultado-mensagem')).toContainText(/Entrada manhã registrada às \d{2}:\d{2}/, { timeout: 30_000 });
    console.log(`[tempo] tablet aberto → entrada gravada: ${((agora() - inicio) / 1000).toFixed(1)}s (inclui carregar a página e o reconhecimento)`);
    const { data: entrada } = await s.from('attendance').select('company_id, entry_1_time, exit_1_time, geo_valid')
      .eq('employee_id', pessoaId).eq('date', hoje()).single();
    const reg = entrada as { company_id: string; entry_1_time: string | null; exit_1_time: string | null; geo_valid: boolean | null };
    expect(reg.company_id).toBe(empresaB); // gravado na empresa DA PESSOA, não na do tablet
    expect(reg.entry_1_time).toBeTruthy();
    expect(reg.geo_valid).toBe(true);

    // A tela volta sozinha pra câmera — e pra empresa de casa do tablet.
    await expect(resultado).toHaveCount(0, { timeout: 20_000 });
    await expect(t.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => t.getByTestId('tela-de-ponto').getAttribute('data-empresa'), { timeout: 10_000 }).toBe(empresaA);

    // 5. Continua na frente: ignorada por 1 minuto; depois, a saída do almoço a menos de 10 min vira AVISO.
    const aviso = t.getByTestId('aviso-batida-recente');
    await expect(aviso).toBeVisible({ timeout: 120_000 });
    await expect(aviso).toContainText(/já bateu a entrada às \d{2}:\d{2}/);
    await expect(aviso.getByRole('button')).toHaveCount(0);
    await expect(t.getByTestId('confirmar-saida-rapida')).toHaveCount(0);
    await expect(aviso).toHaveCount(0, { timeout: 10_000 }); // some sozinho
    const { data: depois } = await s.from('attendance').select('exit_1_time').eq('employee_id', pessoaId).eq('date', hoje()).single();
    expect((depois as { exit_1_time: string | null }).exit_1_time).toBeNull(); // a saída NÃO foi gravada

    // 6. Nenhum toque na tela do tablet desde que ele abriu.
    const toques = await t.evaluate(() => ({
      total: (window as JanelaComToques).__toques,
      porTipo: (window as JanelaComToques).__toquesPorTipo,
    }));
    console.log(`[toques] ${JSON.stringify(toques)}`);
    expect(toques.total).toBe(0);
  });
});
