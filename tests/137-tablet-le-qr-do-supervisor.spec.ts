import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { getClient } from './cleanup';

/**
 * MODO SUPERVISOR de ponta a ponta — o TABLET lê o QR do celular pela CÂMERA (07/10/2026, plano do
 * tablet sem toque, entrega F). Critério combinado: com o modo galpão ligado, o supervisor cadastra
 * uma pessoa nova só mostrando o celular pro tablet, e ela bate a entrada só parando na frente — e o
 * teste conta ZERO toques na tela do tablet.
 *
 * Dois navegadores:
 *  - TABLET: Chromium com câmera falsa lendo um arquivo de CENA 640×480 (1 quadro). O teste
 *    REESCREVE o quadro com o arquivo aberto (a partir do byte 49, sem truncar nem renomear — o
 *    Chromium relê ao vivo): vazio → QR1 → vazio → QR2 → rosto-a ampliado 2× → vazio → QR2 de novo
 *    → vazio → QR do "refazer" → rosto-b ampliado 2×.
 *    O QR que entra na cena é a FOTO do QR na tela do celular (locator.screenshot), virada em tons
 *    de cinza numa página — é o desenho real do celular que o tablet tem que ler.
 *  - CELULAR: contexto 390×844, sem câmera — o supervisor, com cliques reais.
 * O rosto roda de verdade (face-api no tablet, servidor compara), como no tests/134.
 *
 * 🔑 Empresa, tablet, funcionários e supervisor FIXTURE ("PW Test", usuário 97982), apagados no fim.
 */

const LAT = -19.5;
const LNG = -42.6;
const STAMP = Date.now();
const EMPRESA = `PW Test Tablet QR ${STAMP}`;
const SUPERVISOR = '97982';
const SENHA = 'teste12345'; // senha do supervisor DE TESTE (criado e apagado aqui)
const TABLET_NOME = 'PW Tablet Le QR';
const SEGREDO = randomBytes(32).toString('base64url');
const NOVA = `PW Test Maria Tablet ${STAMP}`;
const ROSTO_A = path.resolve('tests/fixtures/facial/rosto-a.y4m');
const ROSTO_B = path.resolve('tests/fixtures/facial/rosto-b.y4m');
const JOAO = `PW Test Joao ${STAMP}`;
const CENA = path.join(os.tmpdir(), `cena-tablet-qr-${process.pid}-${STAMP}.y4m`);
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ── A cena da câmera falsa: 1 quadro 640×480, YUV 4:2:0 ──────────────────────────────────────────
const W = 640;
const H = 480;
const CABECALHO = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\nFRAME\n`); // 49 bytes
const TAM_QUADRO = (W * H * 3) / 2;
const VAZIO = Buffer.alloc(TAM_QUADRO, 128); // cinza, sem rosto e sem QR

function criarCena(): void {
  fs.writeFileSync(CENA, Buffer.concat([CABECALHO, VAZIO]));
}

/** Troca o que a câmera do tablet vê: escreve o quadro no lugar, com o arquivo aberto (nunca trunca). */
function mostrarNaCamera(quadro: Buffer): void {
  if (quadro.length !== TAM_QUADRO) throw new Error(`quadro com ${quadro.length} bytes`);
  const fd = fs.openSync(CENA, 'r+');
  try {
    fs.writeSync(fd, quadro, 0, quadro.length, CABECALHO.length);
  } finally {
    fs.closeSync(fd);
  }
}

/** O rosto da fixture (1 quadro 320×240) ampliado 2× pra cena 640×480. */
function quadroDoRosto(arquivo: string): Buffer {
  const bruto = fs.readFileSync(arquivo);
  const cab = bruto.subarray(0, bruto.indexOf('\n')).toString();
  const w = Number(/ W(\d+)/.exec(cab)?.[1]);
  const h = Number(/ H(\d+)/.exec(cab)?.[1]);
  if (w * 2 !== W || h * 2 !== H) throw new Error(`fixture ${w}×${h}: esperado ${W / 2}×${H / 2}`);
  const ini = bruto.indexOf('FRAME\n') + 'FRAME\n'.length;
  const Y = bruto.subarray(ini, ini + w * h);
  const U = bruto.subarray(ini + w * h, ini + (w * h * 5) / 4);
  const V = bruto.subarray(ini + (w * h * 5) / 4, ini + (w * h * 3) / 2);
  const out = Buffer.alloc(TAM_QUADRO);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = Y[(y >> 1) * w + (x >> 1)];
  const cw = W / 2;
  const ch = H / 2;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      out[W * H + y * cw + x] = U[(y >> 1) * (w / 2) + (x >> 1)];
      out[W * H + cw * ch + y * cw + x] = V[(y >> 1) * (w / 2) + (x >> 1)];
    }
  }
  return out;
}

/** A FOTO do QR na tela do celular, em tons de cinza, no meio de um quadro cinza 640×480. */
async function quadroDoQrDoCelular(celular: Page): Promise<Buffer> {
  const png = await celular.getByTestId('qr-na-tela').locator('canvas').screenshot();
  const conversor = await celular.context().newPage();
  try {
    const luma = await conversor.evaluate(async ({ b64, w, h }) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const imagem = await createImageBitmap(blob);
      const lado = 360;
      const tela = new OffscreenCanvas(w, h);
      const ctx = tela.getContext('2d');
      if (!ctx) throw new Error('sem contexto 2d');
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imagem, (w - lado) / 2, (h - lado) / 2, lado, lado);
      const d = ctx.getImageData(0, 0, w, h).data;
      const out: number[] = new Array(w * h);
      for (let i = 0; i < w * h; i++) {
        out[i] = Math.round(16 + ((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * 219) / 255);
      }
      return out;
    }, { b64: png.toString('base64'), w: W, h: H });
    const quadro = Buffer.alloc(TAM_QUADRO, 128);
    Buffer.from(luma).copy(quadro, 0);
    return quadro;
  } finally {
    await conversor.close();
  }
}

function cpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 1) % 10;
  const dv = (nums: number[]) => {
    const r = (nums.reduce((acc, d, i) => acc + d * (nums.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join('');
}

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** Rosto "de mentira" pros outros funcionários da empresa: longe de qualquer rosto real. */
const rostoSintetico = (semente: number) => Array.from({ length: 128 }, (_, i) => Math.sin(semente * 13 + i) * 0.3);

type JanelaComToques = Window & { __toques?: number; __toquesPorTipo?: Record<string, number> };

test.describe.serial('o tablet lê o QR do supervisor pela câmera — rosto real, servidor de verdade, zero toques', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'câmera falsa com arquivo só existe no Chromium');
  test.setTimeout(300_000);
  test.use({ viewport: { width: 390, height: 844 } }); // o CELULAR (a página padrão do teste)

  let empresaId = '';
  let deviceId = '';
  let funcSupervisor = '';
  const navegadores: Browser[] = [];
  let tablet: { context: BrowserContext; page: Page };
  const consoleDoTablet: string[] = [];

  test.beforeAll(async () => {
    const s = getClient();
    const { data: c, error: e1 } = await s.from('companies').insert([{
      legal_name: `${EMPRESA} LTDA`, cnpj: randomDigits(12), display_name: EMPRESA, city: 'Teste, MG',
      default_geo_lat: LAT, default_geo_lng: LNG, default_geo_radius: 150, default_marking_count: 2,
      // Facial obrigatória: o servidor reconfere o rosto 1:1 na batida — contra o rosto que o supervisor confirmou.
      require_facial_clock: true,
    }]).select('id').single();
    if (e1) throw e1;
    empresaId = (c as { id: string }).id;
    const { data: d, error: e2 } = await s.from('clock_devices').insert([{
      name: TABLET_NOME, created_by: 'teste', status: 'active', modo_galpao: true,
      token_hash: createHash('sha256').update(SEGREDO).digest('hex'), activated_at: new Date().toISOString(),
    }]).select('id').single();
    if (e2) throw e2;
    deviceId = (d as { id: string }).id;
    const { error: e3 } = await s.from('clock_device_companies').insert([{ device_id: deviceId, company_id: empresaId }]);
    if (e3) throw e3;
    const funcionario = async (nome: string, semente: number) => {
      const { data, error } = await s.from('employees').insert([{
        name: nome, cpf: cpfValido(), company_id: empresaId, employment_type: 'Diarista', created_by: '9999',
        function_role: 'Separador', face_descriptor: rostoSintetico(semente), face_registered: true,
      }]).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    };
    funcSupervisor = await funcionario(`PW Test Supervisor Ana ${STAMP}`, 1);
    await funcionario(JOAO, 7);
    const { error: e4 } = await s.rpc('_test_create_supervisor_with_perms', {
      sup_id: SUPERVISOR, plain_pass: SENHA, perms_json: { employees: { view: true, tabletCreate: true, tabletFaceReset: true } },
      company_uuid: empresaId, created_by_id: '2626',
    });
    if (e4) throw e4;
    const { error: e5 } = await s.from('users').update({ employee_id: funcSupervisor }).eq('id', SUPERVISOR);
    if (e5) throw e5;
    criarCena();
  });

  test.afterEach(async () => {
    const info = test.info();
    if (info.status !== info.expectedStatus) {
      console.log(`── console do tablet (últimas 80 linhas) ──\n${consoleDoTablet.slice(-80).join('\n')}`);
      if (empresaId) {
        const s = getClient();
        const { data: qrs } = await s.from('tablet_qr_tokens').select('kind, status, attempts, quality, read_at, captured_at')
          .in('session_id', ((await s.from('tablet_supervisor_sessions').select('id').eq('user_id', SUPERVISOR)).data ?? []).map((x: { id: string }) => x.id));
        const { data: tentativas } = await s.from('face_auth_attempts')
          .select('attempted_at, success, outcome, best_distance').eq('company_id', empresaId).order('attempted_at');
        console.log('── QRs ──', JSON.stringify(qrs));
        console.log('── tentativas de rosto ──', JSON.stringify(tentativas));
      }
    }
  });

  test.afterAll(async () => {
    for (const b of navegadores) await b.close().catch(() => undefined);
    fs.rmSync(CENA, { force: true });
    const s = getClient();
    const passos: Array<[string, boolean, () => PromiseLike<{ error: { message: string } | null }>]> = [];
    if (empresaId) {
      const { data: emps } = await s.from('employees').select('id').eq('company_id', empresaId);
      const ids = (emps ?? []).map((e: { id: string }) => e.id);
      if (ids.length) {
        passos.push(['attendance', true, () => s.from('attendance').delete().in('employee_id', ids)]);
        passos.push(['geo_fraud_attempts', true, () => s.from('geo_fraud_attempts').delete().in('employee_id', ids)]);
        passos.push(['bonus_blocks', true, () => s.from('bonus_blocks').delete().in('employee_id', ids)]);
      }
      passos.push(['face_auth_attempts', true, () => s.from('face_auth_attempts').delete().eq('company_id', empresaId)]);
      passos.push(['error_logs', true, () => s.from('error_logs').delete().eq('company_id', empresaId)]);
    }
    // Ordem importa: o histórico e os funcionários (created_by → supervisor) saem antes do usuário.
    passos.push(['audit_logs', true, () => s.from('audit_logs').delete().eq('user_id', SUPERVISOR)]);
    passos.push(['employees', !!empresaId, () => s.from('employees').delete().eq('company_id', empresaId)]);
    passos.push(['user_permissions', true, () => s.from('user_permissions').delete().eq('user_id', SUPERVISOR)]);
    passos.push(['users', true, () => s.from('users').delete().eq('id', SUPERVISOR)]);
    passos.push(['clock_devices', !!deviceId, () => s.from('clock_devices').delete().eq('id', deviceId)]);
    passos.push(['payment_periods', !!empresaId, () => s.from('payment_periods').delete().eq('company_id', empresaId)]);
    passos.push(['companies', !!empresaId, () => s.from('companies').delete().eq('id', empresaId)]);
    for (const [nome, rodar, passo] of passos) {
      if (!rodar) continue;
      const { error } = await passo();
      if (error) throw new Error(`limpar ${nome}: ${error.message}`);
    }
  });

  test('o supervisor cadastra a pessoa nova só mostrando o celular; ela bate a entrada só parando na frente', async ({ page: celular }) => {
    const s = getClient();

    // ── O TABLET: ativo, modo galpão, câmera na cena (vazia). Daqui em diante, ninguém toca nele. ──
    const browser = await chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${CENA}`],
    });
    navegadores.push(browser);
    const context = await browser.newContext({
      baseURL: 'http://localhost:5173',
      geolocation: { latitude: LAT, longitude: LNG },
      permissions: ['geolocation', 'camera'],
      viewport: { width: 800, height: 1100 },
    });
    await context.addInitScript(({ segredo, empresa }) => {
      localStorage.setItem('clock_device_token_v1', segredo);
      localStorage.setItem('clock_device_modo_galpao_v1', '1');
      if (!localStorage.getItem('sistema_ponto_company_id')) localStorage.setItem('sistema_ponto_company_id', empresa);
    }, { segredo: SEGREDO, empresa: empresaId });
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
    // Cada chamada do tablet ao servidor do supervisor (ação → status), pro diagnóstico de falha.
    t.on('response', (r) => {
      if (!r.url().includes('/functions/v1/ponto-supervisor-api')) return;
      let acao = '?';
      try { acao = String((JSON.parse(r.request().postData() ?? '{}') as { action?: string }).action); } catch { /* corpo não-JSON */ }
      consoleDoTablet.push(`rede: ${acao} → ${r.status()}`);
    });
    // Quem o servidor reconheceu pelo rosto, e quando (relógio contínuo — o do WSL dá saltos).
    const reconhecidos: Array<{ em: number; id: string | null }> = [];
    t.on('response', async (r) => {
      if (!r.url().includes('/functions/v1/employee-public-api')) return;
      let acao = '';
      try { acao = String((JSON.parse(r.request().postData() ?? '{}') as { action?: string }).action); } catch { return; }
      if (acao !== 'identify-face') return;
      const corpo = (await r.json().catch(() => null)) as { matched?: boolean; employeeId?: string } | null;
      reconhecidos.push({ em: performance.now(), id: corpo?.matched ? corpo.employeeId ?? null : null });
    });
    await t.goto('/clock');
    await expect(t.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 60_000 });
    await expect(t.getByText('🔍 Aproxime o rosto da câmera')).toBeVisible({ timeout: 90_000 }); // modelos prontos

    // ── 1. O CELULAR: entra e mostra o QR de conectar; o tablet lê pela câmera ──
    await celular.goto('/clock?supervisor=1');
    await expect(celular.getByTestId('supervisor-login')).toBeVisible({ timeout: 30_000 });
    await celular.getByLabel('Seu código do painel').fill(SUPERVISOR);
    await celular.getByLabel('Senha do painel').fill(SENHA);
    await celular.getByRole('button', { name: /Entrar como supervisor/ }).click();
    await expect(celular.getByTestId('conectar-ao-tablet')).toBeVisible({ timeout: 20_000 });
    await expect(celular.getByTestId('qr-na-tela')).toBeVisible({ timeout: 20_000 });
    mostrarNaCamera(await quadroDoQrDoCelular(celular));

    await expect(t.getByTestId('tablet-celular-conectado')).toContainText('conectado ✓', { timeout: 30_000 });
    await expect(celular.getByTestId('conectado')).toContainText(`Lido pelo tablet ${TABLET_NOME}`, { timeout: 15_000 });
    mostrarNaCamera(VAZIO); // o celular saiu da frente
    await expect(t.getByTestId('tablet-modo-supervisor')).toHaveCount(0, { timeout: 10_000 }); // volta sozinho

    // ── 2. O celular cadastra a pessoa nova e mostra o QR do rosto (com "bater o ponto agora") ──
    await expect(celular.getByTestId('lista-do-supervisor')).toBeVisible({ timeout: 15_000 });
    await celular.getByRole('button', { name: /Cadastrar funcionário novo/ }).click();
    await celular.getByLabel('Nome completo *').fill(NOVA);
    await celular.getByLabel('CPF *').fill(cpfValido());
    await celular.getByLabel('Telefone *').fill('33999990000');
    await celular.getByLabel('Função *').selectOption('Separador');
    await celular.getByRole('button', { name: /Salvar e cadastrar o rosto/ }).click();
    await expect(celular.getByTestId('rosto-preparar')).toBeVisible({ timeout: 15_000 });
    await expect(celular.getByLabel(/Bater o ponto agora/)).toBeChecked();
    await celular.getByRole('button', { name: /Gerar o código do rosto/ }).click();
    await expect(celular.getByTestId('qr-na-tela')).toBeVisible({ timeout: 15_000 });
    const qr2 = await quadroDoQrDoCelular(celular);
    mostrarNaCamera(qr2);

    // ── 3. O tablet lê o QR2, pede o rosto; a pessoa para na frente ──
    await expect(t.getByTestId('tablet-captura-nome')).toContainText('olhe para a câmera', { timeout: 30_000 });
    await expect(celular.getByTestId('rosto-lendo')).toBeVisible({ timeout: 15_000 });
    mostrarNaCamera(quadroDoRosto(ROSTO_A));

    // ── 4. O celular mostra a foto; o supervisor confirma ──
    const capturado = celular.getByTestId('rosto-capturado');
    await expect(capturado).toBeVisible({ timeout: 60_000 });
    expect(await capturado.getByRole('img').getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/);
    await expect(t.getByTestId('tablet-aguardando-confirmacao')).toBeVisible({ timeout: 10_000 });
    await celular.getByRole('button', { name: 'Confirmar' }).click();
    await expect(celular.getByTestId('rosto-confirmado')).toContainText('cadastrado ✓', { timeout: 15_000 });

    // ── 5. O tablet reconhece a pessoa nova e bate a ENTRADA sozinho; o celular mostra a batida ──
    const resultado = t.getByTestId('galpao-resultado');
    await expect(resultado).toBeVisible({ timeout: 90_000 });
    await expect(resultado).toContainText(NOVA);
    await expect(t.getByTestId('galpao-resultado-mensagem')).toContainText(/Entrada registrada às \d{2}:\d{2}/, { timeout: 30_000 });
    await expect(celular.getByTestId('rosto-ponto')).toHaveText(/^Entrada registrada às \d{2}:\d{2}$/, { timeout: 60_000 });

    // ── 6. No banco: a ficha como o Victor decidiu, o rosto, a entrada de hoje e o histórico ──
    const { data: nova } = await s.from('employees')
      .select('id, employment_type, contract_type, registration_status, created_by, phone, function_role, pix_key, face_registered, face_descriptor, face_photo_url')
      .eq('company_id', empresaId).eq('name', NOVA).single();
    const f = nova as Record<string, unknown>;
    expect([f.employment_type, f.contract_type, f.registration_status, f.created_by, f.function_role, f.pix_key, f.face_registered, f.face_photo_url])
      .toEqual(['Diarista', 'Diarista', 'pending', SUPERVISOR, 'Separador', null, true, null]);
    expect(String(f.phone).replace(/\D/g, '')).toBe('33999990000');
    expect(f.face_descriptor as number[]).toHaveLength(128);
    const { data: ponto } = await s.from('attendance').select('entry_time, geo_valid, company_id')
      .eq('employee_id', f.id as string).eq('date', hoje()).single();
    const p = ponto as { entry_time: string | null; geo_valid: boolean | null; company_id: string };
    expect(p.entry_time).toBeTruthy();
    expect(p.geo_valid).toBe(true);
    expect(p.company_id).toBe(empresaId);
    const { data: historico } = await s.from('audit_logs').select('action_type, module, description').eq('user_id', SUPERVISOR);
    const linhas = (historico ?? []) as Array<{ action_type: string; module: string; description: string }>;
    expect(linhas.some((l) => l.action_type === 'login' && l.module === 'tablet')).toBe(true);
    expect(linhas.some((l) => l.action_type === 'create' && l.module === 'employees')).toBe(true);
    expect(linhas.some((l) => l.action_type === 'update' && l.description.includes(`cadastrado no tablet ${TABLET_NOME}`))).toBe(true);
    const { data: sessoes } = await s.from('tablet_supervisor_sessions').select('id, status, device_id').eq('user_id', SUPERVISOR);
    const sessao = (sessoes ?? [])[0] as { id: string; status: string; device_id: string };
    expect([sessao.status, sessao.device_id]).toEqual(['pareada', deviceId]);
    const { data: qrs } = await s.from('tablet_qr_tokens').select('kind, status, captured_descriptor, captured_thumb').eq('session_id', sessao.id);
    const rostoQr = ((qrs ?? []) as Array<{ kind: string; status: string; captured_descriptor: unknown; captured_thumb: unknown }>)
      .find((q) => q.kind === 'rosto');
    // A biometria temporária sumiu na confirmação.
    expect([rostoQr?.status, rostoQr?.captured_descriptor, rostoQr?.captured_thumb]).toEqual(['confirmado', null, null]);

    // ── 7. O MESMO QR2 mostrado de novo: o tablet lê, o servidor recusa (1 uso) e nada muda ──
    mostrarNaCamera(VAZIO);
    await expect(resultado).toHaveCount(0, { timeout: 30_000 }); // a tela volta sozinha pra câmera
    await expect(t.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 30_000 });
    mostrarNaCamera(qr2);
    await expect(t.getByTestId('tablet-supervisor-aviso')).toBeVisible({ timeout: 30_000 });
    mostrarNaCamera(VAZIO);
    await expect(t.getByTestId('tablet-modo-supervisor')).toHaveCount(0, { timeout: 10_000 });
    const { data: depois } = await s.from('tablet_qr_tokens').select('kind, status').eq('session_id', sessao.id);
    expect(((depois ?? []) as Array<{ kind: string; status: string }>).find((q) => q.kind === 'rosto')?.status).toBe('confirmado');

    // ── 8. REFAZER o rosto do João SEM "bater o ponto agora" (rosto-b): o supervisor confirma e o
    //       tablet reconhece o João pelo rosto NOVO — mas não bate (ele está na frente, o supervisor
    //       disse "não bater agora": ignorado por 2 min) ──
    const { data: joaoAntes } = await s.from('employees').select('id, face_descriptor').eq('company_id', empresaId).eq('name', JOAO).single();
    const joao = joaoAntes as { id: string; face_descriptor: number[] };
    await celular.getByRole('button', { name: /Voltar à lista/ }).click();
    const linhaDoJoao = celular.getByTestId('lista-do-supervisor').getByRole('listitem').filter({ hasText: JOAO });
    await linhaDoJoao.getByRole('button', { name: /Refazer rosto/ }).click();
    await expect(celular.getByTestId('rosto-preparar')).toBeVisible({ timeout: 15_000 });
    await celular.getByLabel(/Bater o ponto agora/).uncheck();
    await celular.getByRole('button', { name: /Gerar o código do rosto/ }).click();
    await expect(celular.getByTestId('qr-na-tela')).toBeVisible({ timeout: 15_000 });
    mostrarNaCamera(await quadroDoQrDoCelular(celular));
    await expect(t.getByTestId('tablet-captura-nome')).toContainText('olhe para a câmera', { timeout: 30_000 });
    mostrarNaCamera(quadroDoRosto(ROSTO_B));
    await expect(celular.getByTestId('rosto-capturado')).toBeVisible({ timeout: 60_000 });
    // O aviso pro supervisor segue o que o servidor mediu: parecido com alguém, ou bem diferente do rosto antigo.
    const { data: capturadoRow } = await s.from('tablet_qr_tokens').select('quality')
      .eq('session_id', sessao.id).eq('status', 'capturado').single();
    const q = (capturadoRow as { quality: { resultado: string; parecidoCom: { nome: string } | null } }).quality;
    await expect(celular.getByTestId('rosto-aviso'))
      .toContainText(q.resultado === 'aviso' && q.parecidoCom ? q.parecidoCom.nome : 'bem diferente do cadastrado antes');
    // Marca ANTES do clique: o tablet pode reconhecer o João (uma vez só — depois ignora sem nem
    // perguntar ao servidor) antes de o celular mostrar o "refeito ✓". O rosto antigo dele nunca bate
    // com o rosto-b, então reconhecido daqui em diante = reconhecido pelo rosto NOVO.
    const antesDeConfirmar = performance.now();
    await celular.getByRole('button', { name: 'Confirmar' }).click();
    await expect(celular.getByTestId('rosto-confirmado')).toContainText('refeito ✓', { timeout: 15_000 });
    await expect(celular.getByTestId('rosto-ponto')).toHaveCount(0); // sem "bater o ponto agora", o celular nem espera batida
    await expect.poll(() => reconhecidos.some((r) => r.em > antesDeConfirmar && r.id === joao.id), { timeout: 60_000 }).toBe(true);
    // Reconhecido pelo rosto novo: em 15 s (reconhecer + contar 2 s + gravar, com folga) nada é batido.
    const fimDaJanela = performance.now() + 15_000;
    let bateu = false;
    await expect.poll(async () => {
      if (await t.getByTestId('galpao-resultado').count()) bateu = true;
      if (bateu) return 'bateu';
      return performance.now() > fimDaJanela ? 'nao-bateu' : 'olhando';
    }, { timeout: 40_000, intervals: [250] }).toBe('nao-bateu');
    const { data: joaoDepois } = await s.from('employees').select('face_descriptor, face_registered').eq('id', joao.id).single();
    const novo = (joaoDepois as { face_descriptor: number[] }).face_descriptor;
    expect(novo).toHaveLength(128);
    expect(novo).not.toEqual(joao.face_descriptor); // o rosto foi trocado
    const { data: pontoDoJoao } = await s.from('attendance').select('id').eq('employee_id', joao.id).eq('date', hoje());
    expect(pontoDoJoao ?? []).toHaveLength(0);
    const { data: historico2 } = await s.from('audit_logs').select('description').eq('user_id', SUPERVISOR).eq('entity_id', joao.id);
    expect(((historico2 ?? []) as Array<{ description: string }>).some((l) => l.description.includes(`refeito no tablet ${TABLET_NOME}`))).toBe(true);

    // ── 9. Nenhum toque na tela do tablet do começo ao fim ──
    const toques = await t.evaluate(() => ({
      total: (window as JanelaComToques).__toques,
      porTipo: (window as JanelaComToques).__toquesPorTipo,
    }));
    console.log(`[toques no tablet] ${JSON.stringify(toques)}`);
    expect(toques.total).toBe(0);
  });
});
