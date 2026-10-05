import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { loginAs, goToTab, MASTER_2626, irAoCampoDeCpfDoPonto } from './helpers';
import { getClient } from './cleanup';

/**
 * TABLET NO GALPÃO — o pacote de 05/10/2026, com cliques de verdade.
 *
 * Decisões do Victor: (1) a câmera desliga com 1 minuto sem ninguém na frente e o toque religa;
 * (2) tela de descanso com relógio e "Toque para bater o ponto"; (3) no tablet a tela volta em 8s
 * depois de gravar e em 15s depois de um erro (antes: 35s, e depois de erro nunca); (4) Caratinga e
 * Ponte Nova no MESMO tablet — e por isso, quando alguém da outra empresa entra pelo CPF, a tela
 * tem que VOLTAR pra empresa do tablet ao terminar (senão a câmera passa a procurar só a outra
 * empresa). Mais o aviso de entrada gravada FORA da área (antes a tela mostrava ✅).
 *
 * Tudo em 2 EMPRESAS FIXTURE ("PW Test", apagadas no fim): A abre na câmera (como Caratinga), B no
 * CPF (como Ponte Nova). Nenhuma das duas tem facial obrigatória — o assunto aqui é o tablet, não o
 * rosto (o rosto de verdade está no tests/127).
 */

const LAT = -19.5;
const LNG = -42.6;
const STAMP = Date.now();
const EMPRESA_A = `PW Test Galpao A ${STAMP}`;
const EMPRESA_B = `PW Test Galpao B ${STAMP}`;
const TABLET_NOME = 'PW Tablet Galpao';
const PIN = ['4', '3', '2', '1'];
const CHAVE_EMPRESA = 'sistema_ponto_company_id';
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
/**
 * Relógio CONTÍNUO pra medir tempo (05/10/2026). O relógio de parede (`Date.now`) desta máquina (WSL)
 * dá saltos pra trás — medido: −2,2s numa janela de 50s; no teste, a volta de 45s "levou" 40,5s pelo
 * relógio de parede da própria página, com o temporizador esperando os 45s de verdade.
 */
const agora = () => performance.now();

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

test.describe.serial('tablet no galpão: 2 empresas, volta da tela, aviso e câmera que descansa', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'câmera falsa só existe no Chromium');
  test.setTimeout(240_000);

  let empresaA = '';
  let empresaB = '';
  const pessoas: Record<'b1' | 'b2' | 'b3', { id: string; cpf: string }> = {
    b1: { id: '', cpf: '' }, b2: { id: '', cpf: '' }, b3: { id: '', cpf: '' },
  };
  const navegadores: Browser[] = [];
  let tablet: { context: BrowserContext; page: Page };

  test.beforeAll(async () => {
    const s = getClient();
    const criar = async (nome: string, abreNaCamera: boolean) => {
      const { data, error } = await s.from('companies').insert([{
        legal_name: `${nome} LTDA`, cnpj: randomDigits(12), display_name: nome, city: 'Teste, MG',
        default_geo_lat: LAT, default_geo_lng: LNG, default_geo_radius: 150, default_marking_count: 2,
        require_facial_clock: false, face_identify_default: abreNaCamera,
      }]).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    };
    empresaA = await criar(EMPRESA_A, true);
    empresaB = await criar(EMPRESA_B, false);
    for (const chave of ['b1', 'b2', 'b3'] as const) {
      const cpf = randomDigits(11);
      const { data, error } = await s.from('employees').insert([{
        name: `PW Test Galpao Pessoa ${chave} ${STAMP}`, cpf, company_id: empresaB,
        employment_type: 'Diarista', created_by: '9999', pin: PIN.join(''), pin_configured: true,
        face_registered: false, face_recognition_enabled: false,
      }]).select('id').single();
      if (error) throw error;
      pessoas[chave] = { id: (data as { id: string }).id, cpf };
    }
  });

  test.afterAll(async () => {
    for (const b of navegadores) await b.close().catch(() => undefined);
    const s = getClient();
    const ids = Object.values(pessoas).map((p) => p.id).filter(Boolean);
    const empresas = [empresaA, empresaB].filter(Boolean);
    const { data: vinculos } = await s.from('clock_device_companies').select('device_id').in('company_id', empresas);
    const tablets = [...new Set((vinculos ?? []).map((v: { device_id: string }) => v.device_id))];
    if (ids.length) {
      await s.from('attendance').delete().in('employee_id', ids);
      await s.from('geo_fraud_attempts').delete().in('employee_id', ids);
      await s.from('bonus_blocks').delete().in('employee_id', ids);
      await s.from('face_auth_attempts').delete().in('employee_id', ids);
    }
    for (const id of empresas) {
      await s.from('face_auth_attempts').delete().eq('company_id', id);
      await s.from('error_logs').delete().eq('company_id', id);
      await s.from('payment_periods').delete().eq('company_id', id);
    }
    if (ids.length) await s.from('employees').delete().in('id', ids);
    if (tablets.length) await s.from('clock_devices').delete().in('id', tablets);
    for (const id of empresas) await s.from('companies').delete().eq('id', id);
  });

  /** A empresa que a tela está usando agora (no tablet, a da sessão). */
  async function empresaDaTela(): Promise<string | null> {
    return tablet.page.getByTestId('tela-de-ponto').getAttribute('data-empresa');
  }
  /** A empresa GRAVADA no aparelho — a "casa" do tablet; quem entra pelo CPF não muda. */
  async function empresaGravada(): Promise<string | null> {
    return tablet.page.evaluate((k) => localStorage.getItem(k), CHAVE_EMPRESA);
  }

  /** Entra pelo CPF no tablet, digita a senha e para no painel com o botão de entrada. */
  async function entrarPeloCpf(cpf: string) {
    const t = tablet.page;
    await t.goto('/clock');
    const campo = await irAoCampoDeCpfDoPonto(t);
    await campo.fill(cpf);
    await t.getByRole('button', { name: 'Continuar' }).click();
    for (const d of PIN) await t.getByRole('button', { name: d, exact: true }).click();
    await t.getByRole('button', { name: /Confirmar PIN/i }).click();
    await expect(t.getByRole('button', { name: /REGISTRAR ENTRADA/i })).toBeVisible({ timeout: 30_000 });
  }

  /** A tela voltou pro início (a câmera da empresa do tablet) — mede quanto levou. */
  async function esperarVoltarAoInicio(maxMs: number): Promise<number> {
    const t = tablet.page;
    const inicio = agora();
    await expect(t.getByRole('button', { name: /REGISTRAR (ENTRADA|SAÍDA)/i })).toHaveCount(0, { timeout: maxMs });
    await expect(t.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 10_000 });
    return agora() - inicio;
  }

  test('1. o 2626 gera o código pras 2 empresas e o tablet ativa', async ({ page }) => {
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

    const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
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
    tablet = { context, page: await context.newPage() };
    const t = tablet.page;
    await t.goto('/clock');
    await irAoCampoDeCpfDoPonto(t);
    await t.getByRole('button', { name: 'Ativar este aparelho como tablet de ponto' }).click();
    await t.getByLabel('Código de ativação').fill(codigo);
    await t.getByRole('button', { name: 'Ativar tablet' }).click();
    await expect(t.getByText(`Tablet ativado: ${TABLET_NOME}`)).toBeVisible({ timeout: 20_000 });
    await expect(t.getByText(new RegExp(`${EMPRESA_A}.*${EMPRESA_B}|${EMPRESA_B}.*${EMPRESA_A}`))).toBeVisible();

    const s = getClient();
    const { data: vinculos } = await s.from('clock_device_companies').select('company_id, device_id').in('company_id', [empresaA, empresaB]);
    expect((vinculos ?? []).length).toBe(2);
  });

  test('2. alguém da OUTRA empresa entra pelo CPF e bate: a tela volta em 8s — e volta pra empresa do tablet', async () => {
    await entrarPeloCpf(pessoas.b1.cpf);
    expect(await empresaDaTela()).toBe(empresaB); // o CPF trocou a empresa da TELA (como sempre)...
    expect(await empresaGravada()).toBe(empresaA); // ...mas a casa do tablet continua gravada
    await tablet.page.getByRole('button', { name: /REGISTRAR ENTRADA/i }).click();
    await expect(tablet.page.getByText(/Entrada registrada às \d{2}:\d{2} · a tela volta ao início em 8s/)).toBeVisible({ timeout: 30_000 });
    const levou = await esperarVoltarAoInicio(15_000);
    console.log(`[tempo] gravou → tela de volta ao início: ${(levou / 1000).toFixed(1)}s`);
    expect(levou).toBeLessThan(13_000);
    await expect.poll(empresaDaTela, { timeout: 10_000 }).toBe(empresaA);
    expect(await empresaGravada()).toBe(empresaA);

    const s = getClient();
    const { data: att } = await s.from('attendance').select('entry_time, geo_valid').eq('employee_id', pessoas.b1.id).eq('date', hoje()).single();
    expect((att as { entry_time: string | null }).entry_time).toBeTruthy();
    expect((att as { geo_valid: boolean | null }).geo_valid).toBe(true);
  });

  test('3. entrada FORA da área: aviso amarelo (não ✅) pedindo pra avisar o supervisor, e a tela volta em 15s', async () => {
    await tablet.context.setGeolocation({ latitude: LAT + 0.03, longitude: LNG }); // ~3,3 km do galpão
    try {
      await entrarPeloCpf(pessoas.b2.cpf);
      await tablet.page.getByRole('button', { name: /REGISTRAR ENTRADA/i }).click();
      const aviso = tablet.page.getByText(/FORA da área permitida \(\d+ m\) — avise o supervisor · a tela volta ao início em 15s/);
      await expect(aviso).toBeVisible({ timeout: 30_000 });
      await expect(aviso).toContainText('⚠️ Entrada registrada às');
      await expect(tablet.page.getByText(/^✅ Entrada registrada/)).toHaveCount(0);
      const levou = await esperarVoltarAoInicio(22_000);
      expect(levou).toBeGreaterThan(9_000); // 15s, não os 8s do sucesso
      await expect.poll(empresaDaTela, { timeout: 10_000 }).toBe(empresaA);

      const s = getClient();
      const { data: att } = await s.from('attendance').select('entry_time, geo_valid').eq('employee_id', pessoas.b2.id).eq('date', hoje()).single();
      expect((att as { geo_valid: boolean | null }).geo_valid).toBe(false);
      const { count } = await s.from('geo_fraud_attempts').select('id', { count: 'exact', head: true }).eq('employee_id', pessoas.b2.id);
      expect(count).toBeGreaterThan(0);
    } finally {
      await tablet.context.setGeolocation({ latitude: LAT, longitude: LNG });
    }
  });

  test('4. 1 minuto sem ninguém na frente: a câmera DESLIGA e aparece "Toque para bater o ponto"; o toque religa', async () => {
    const t = tablet.page;
    await t.goto('/clock');
    await expect(t.getByText(/Preparando reconhecimento/)).toHaveCount(0, { timeout: 60_000 });
    await expect(t.getByText('Aproxime o rosto da câmera')).toBeVisible({ timeout: 30_000 });
    // A câmera falsa do Chromium não tem rosto: ninguém na frente.
    const descanso = t.getByTestId('camera-descanso');
    await expect(descanso).toBeVisible({ timeout: 80_000 });
    await expect(descanso).toContainText('Toque para bater o ponto');
    const cameraDesligada = await t.evaluate(() => {
      const v = document.querySelector('video');
      const stream = v?.srcObject as MediaStream | null;
      return !stream || stream.getVideoTracks().every((trilha) => trilha.readyState === 'ended');
    });
    expect(cameraDesligada, 'a câmera tem que estar DESLIGADA de verdade').toBe(true);

    const toque = agora();
    await descanso.click();
    await expect(t.getByText('Aproxime o rosto da câmera')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => t.evaluate(() => {
      const stream = document.querySelector('video')?.srcObject as MediaStream | null;
      return !!stream && stream.getVideoTracks().some((trilha) => trilha.readyState === 'live');
    }), { timeout: 10_000 }).toBe(true);
    const levou = agora() - toque;
    console.log(`[tempo] toque → câmera ligada de novo: ${(levou / 1000).toFixed(1)}s`);
    expect(levou).toBeLessThan(6_000);
    await expect(t.getByText(/Preparando reconhecimento/)).toHaveCount(0); // o reconhecimento não recarregou
  });

  test('5. alguém da outra empresa DESISTE na senha e volta pra câmera: a tela volta pra empresa do tablet', async () => {
    const t = tablet.page;
    await t.goto('/clock');
    const campo = await irAoCampoDeCpfDoPonto(t);
    await campo.fill(pessoas.b1.cpf);
    await t.getByRole('button', { name: 'Continuar' }).click();
    await expect(t.getByRole('button', { name: /Confirmar PIN/i })).toBeVisible({ timeout: 20_000 });
    expect(await empresaDaTela()).toBe(empresaB);
    await t.getByRole('button', { name: 'Voltar' }).click(); // desistiu na senha
    await t.getByRole('button', { name: /Voltar pro reconhecimento facial/ }).click();
    await expect(t.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 15_000 });
    await expect.poll(empresaDaTela, { timeout: 10_000 }).toBe(empresaA);
  });

  test('6. a tela RECARREGA no meio da sessão de alguém da outra empresa (versão nova): o tablet abre na empresa dele', async () => {
    // b3: ainda sem ponto hoje (b1 bateu a entrada no passo 2 — o painel dele mostra SAÍDA).
    await entrarPeloCpf(pessoas.b3.cpf);
    expect(await empresaDaTela()).toBe(empresaB);
    await tablet.page.reload();
    await expect(tablet.page.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 60_000 });
    await expect.poll(empresaDaTela, { timeout: 10_000 }).toBe(empresaA);
    expect(await empresaGravada()).toBe(empresaA);
  });

  test('7. alguém começa pelo CPF, para na senha e vai embora: sem nenhum toque, o tablet volta sozinho pra câmera', async () => {
    const t = tablet.page;
    await t.goto('/clock');
    const campo = await irAoCampoDeCpfDoPonto(t);
    await expect(t.getByTestId('link-da-consulta')).toHaveCount(0); // no tablet, sem consulta (decisão de 30/09)
    await campo.fill(pessoas.b2.cpf);
    // Conta do toque em "Continuar": o toque recomeça o prazo, então a volta NUNCA pode vir antes
    // de 45s daqui (contar de quando o teste VÊ a senha atrasa segundos com a máquina carregada).
    const largou = agora();
    await t.getByRole('button', { name: 'Continuar' }).click();
    await expect(t.getByRole('button', { name: /Confirmar PIN/i })).toBeVisible({ timeout: 20_000 });
    await expect(t.getByText('Reconhecimento facial — Registro de Ponto')).toBeVisible({ timeout: 70_000 });
    const levou = agora() - largou;
    console.log(`[tempo] tela largada na senha → volta pra câmera: ${(levou / 1000).toFixed(1)}s (do toque em Continuar)`);
    expect(levou).toBeGreaterThanOrEqual(45_000); // 45s sem toque — nunca antes
    await expect.poll(empresaDaTela, { timeout: 10_000 }).toBe(empresaA);
  });

  test('8. o tablet não deu a localização: erro e a tela volta SOZINHA em 15s (antes ficava parada pra sempre)', async () => {
    // Simula o GPS do tablet que não responde (a permissão está dada; a posição não vem).
    await tablet.context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, erro) => {
        setTimeout(() => erro?.({ code: 2, message: 'sem posição', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError), 50);
      };
    });
    await entrarPeloCpf(pessoas.b3.cpf);
    await tablet.page.getByRole('button', { name: /REGISTRAR ENTRADA/i }).click();
    await expect(tablet.page.getByText(/❌ Localização não fornecida · a tela volta ao início em 15s/)).toBeVisible({ timeout: 30_000 });
    const levou = await esperarVoltarAoInicio(22_000);
    console.log(`[tempo] erro → tela de volta ao início: ${(levou / 1000).toFixed(1)}s`);
    await expect.poll(empresaDaTela, { timeout: 10_000 }).toBe(empresaA);
  });

  test('9. CELULAR (sem tablet): a troca de empresa pelo CPF continua GRAVADA depois do Sair, como sempre', async ({ browser }) => {
    // O celular de cada um não é aparelho compartilhado: escolheu a empresa pelo CPF, ela fica.
    const context = await browser.newContext({ baseURL: 'http://localhost:5173' });
    await context.addInitScript(
      ({ chave, empresa }) => { if (!localStorage.getItem(chave)) localStorage.setItem(chave, empresa); },
      { chave: CHAVE_EMPRESA, empresa: empresaA },
    );
    try {
      const celular = await context.newPage();
      await celular.goto('/clock');
      const campo = await irAoCampoDeCpfDoPonto(celular);
      await campo.fill(pessoas.b3.cpf);
      await celular.getByRole('button', { name: 'Continuar' }).click();
      for (const d of PIN) await celular.getByRole('button', { name: d, exact: true }).click();
      await celular.getByRole('button', { name: /Confirmar PIN/i }).click();
      await expect(celular.getByRole('button', { name: /REGISTRAR ENTRADA/i })).toBeVisible({ timeout: 30_000 });
      await celular.getByRole('button', { name: 'Sair' }).click();
      await expect(celular.getByRole('button', { name: /REGISTRAR (ENTRADA|SAÍDA)/i })).toHaveCount(0, { timeout: 10_000 });
      expect(await celular.evaluate((k) => localStorage.getItem(k), CHAVE_EMPRESA)).toBe(empresaB);
      await expect(celular.getByTestId('tela-de-ponto')).toHaveAttribute('data-empresa', empresaB);
      // Celular: na tela do CPF a consulta e o "Ativar este aparelho" continuam à mão (no tablet, não).
      await irAoCampoDeCpfDoPonto(celular);
      await expect(celular.getByTestId('link-da-consulta')).toBeVisible();
      await expect(celular.getByRole('button', { name: 'Ativar este aparelho como tablet de ponto' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
