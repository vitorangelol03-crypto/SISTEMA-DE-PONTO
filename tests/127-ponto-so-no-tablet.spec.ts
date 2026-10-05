import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { loginAs, goToTab, MASTER_2626, irAoCampoDeCpfDoPonto } from './helpers';
import { getClient } from './cleanup';

/**
 * PONTO SÓ NO TABLET DA EMPRESA + FACIAL SEM CPF — com cliques de verdade (30/09/2026).
 *
 * O que o Victor pediu: "quero tudo validado com cliques reais". Aqui a facial RODA de
 * verdade: a câmera falsa do Chromium transmite um rosto (tests/fixtures/facial), o face-api
 * detecta e calcula o descriptor no navegador, e o servidor compara. Nada de mock na tela.
 *
 * O caminho de quem usa, na ordem:
 *   1. o 2626, em Configurações → Tablets de ponto, gera o código de ativação;
 *   2. no tablet, a tela de ponto troca o código pelo segredo ("Ativar este aparelho");
 *   3. o 2626 liga a trava da empresa (antes de ter tablet ativo o botão nem deixa);
 *   4. no tablet: CPF + senha + cadastro do rosto + ENTRADA com verificação facial;
 *   5. num celular pessoal (sem segredo): "Ponto só no tablet da empresa" — nem pelo CPF passa;
 *   6. no tablet: SAÍDA só pelo rosto, sem CPF (reconhecimento 1:N);
 *   7. no tablet, OUTRA pessoa (rosto não cadastrado): "Não reconheci";
 *   8. o 2626 tenta remover o último tablet com a trava ligada: o sistema recusa; desliga a
 *      trava e remove; o tablet removido volta a ser um aparelho comum;
 *   9. câmera com o pedido de permissão FECHADO: "Falta liberar a câmera" (não "bloqueada"),
 *      e o toque em "Ativar câmera" resolve.
 *
 * 🔑 Tudo numa EMPRESA FIXTURE criada aqui e apagada no fim — nunca liga a trava de
 * Caratinga/Ponte Nova (a suíte já deixou trava de produção desligada por minutos, 2x).
 */

const LAT = -19.5;
const LNG = -42.6;
const STAMP = Date.now();
const EMPRESA_NOME = `PW Test Tablet E2E ${STAMP}`;
const PESSOA_NOME = `PW Test Tablet Pessoa ${STAMP}`;
const TABLET_NOME = 'PW Tablet E2E';
const PIN = ['4', '3', '2', '1'];
const ROSTO_A = path.resolve('tests/fixtures/facial/rosto-a.y4m');
const ROSTO_B = path.resolve('tests/fixtures/facial/rosto-b.y4m');
const CHAVE_EMPRESA = 'sistema_ponto_company_id';
const CHAVE_SEGREDO = 'clock_device_token_v1';
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

test.describe.serial('ponto só no tablet — cliques reais', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'câmera falsa com arquivo só existe no Chromium');
  test.setTimeout(240_000);

  let empresaId = '';
  let pessoaId = '';
  let cpf = '';
  let codigo = '';
  let segredoDoTablet = '';
  const navegadores: Browser[] = [];

  /** Um "aparelho": navegador com a câmera mostrando um rosto, GPS no galpão e a empresa escolhida. */
  async function aparelho(rosto: string | null, opts: { segredo?: string; initScript?: () => void } = {}): Promise<{ context: BrowserContext; page: Page }> {
    const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
    if (rosto) args.push(`--use-file-for-fake-video-capture=${rosto}`);
    const browser = await chromium.launch({ args });
    navegadores.push(browser);
    const context = await browser.newContext({
      baseURL: 'http://localhost:5173',
      geolocation: { latitude: LAT, longitude: LNG },
      permissions: ['geolocation', 'camera'],
      viewport: { width: 800, height: 1100 },
    });
    await context.addInitScript(
      ({ chaveEmpresa, empresa, chaveSegredo, segredo }) => {
        localStorage.setItem(chaveEmpresa, empresa);
        if (segredo && !localStorage.getItem(chaveSegredo)) localStorage.setItem(chaveSegredo, segredo);
      },
      { chaveEmpresa: CHAVE_EMPRESA, empresa: empresaId, chaveSegredo: CHAVE_SEGREDO, segredo: opts.segredo ?? '' },
    );
    if (opts.initScript) await context.addInitScript(opts.initScript);
    const page = await context.newPage();
    // O rastro do Playwright só grava o navegador do painel — o console dos "aparelhos" é
    // guardado aqui e impresso se o teste falhar (sem isto, uma falha no tablet não diz nada).
    const nome = `aparelho${navegadores.length}`;
    page.on('console', (m) => consoleDosAparelhos.push(`[${nome}] ${m.type()}: ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => consoleDosAparelhos.push(`[${nome}] pageerror: ${String(e).slice(0, 300)}`));
    return { context, page };
  }

  const consoleDosAparelhos: string[] = [];
  test.afterEach(async ({ browserName }) => {
    const testInfo = test.info();
    if (browserName === 'chromium' && testInfo.status !== testInfo.expectedStatus) {
      console.log(`── console dos aparelhos (últimas 60 linhas) ──\n${consoleDosAparelhos.slice(-60).join('\n')}`);
      if (empresaId) {
        const s = getClient();
        const { data: tentativas } = await s.from('face_auth_attempts')
          .select('attempted_at, clock_type, success, outcome, confidence').eq('company_id', empresaId).order('attempted_at');
        const { data: erros } = await s.from('error_logs').select('error_type, message, error_context').eq('company_id', empresaId);
        const { data: ponto } = await s.from('attendance').select('date, entry_time, exit_time_full').eq('employee_id', pessoaId);
        console.log('── tentativas de rosto ──', JSON.stringify(tentativas));
        console.log('── error_logs ──', JSON.stringify(erros));
        console.log('── attendance ──', JSON.stringify(ponto));
      }
    }
  });

  let tablet: { context: BrowserContext; page: Page };

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
      require_facial_clock: true,
      face_identify_default: true,
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
  });

  test.afterAll(async () => {
    for (const b of navegadores) await b.close().catch(() => undefined);
    const s = getClient();
    if (!empresaId) return;
    const { data: vinculos } = await s.from('clock_device_companies').select('device_id').eq('company_id', empresaId);
    const tablets = (vinculos ?? []).map((v: { device_id: string }) => v.device_id);
    if (pessoaId) {
      await s.from('attendance').delete().eq('employee_id', pessoaId);
      await s.from('geo_fraud_attempts').delete().eq('employee_id', pessoaId);
      await s.from('bonus_blocks').delete().eq('employee_id', pessoaId);
      await s.storage.from('employee-photos').remove([`${pessoaId}/face.jpg`]);
    }
    await s.from('face_auth_attempts').delete().eq('company_id', empresaId);
    await s.from('error_logs').delete().eq('company_id', empresaId);
    if (pessoaId) await s.from('employees').delete().eq('id', pessoaId);
    if (tablets.length) await s.from('clock_devices').delete().in('id', tablets);
    await s.from('companies').delete().eq('id', empresaId);
  });

  test('1–3. o 2626 gera o código, o tablet ativa, e só então a trava pode ser ligada', async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Configurações');
    const cartao = page.getByTestId('clock-devices-card');
    await expect(cartao).toBeVisible({ timeout: 20_000 });

    const trava = cartao.getByTestId(`trava-${EMPRESA_NOME}`);
    await expect(trava.getByRole('button', { name: 'Ligar trava' })).toBeDisabled();
    await expect(trava.getByText('Nenhum tablet ativo')).toBeVisible();

    await cartao.getByLabel('Nome do tablet').fill(TABLET_NOME);
    await cartao.getByLabel('Caratinga', { exact: true }).uncheck();
    await cartao.getByLabel('Ponte Nova', { exact: true }).uncheck();
    await expect(cartao.getByLabel(EMPRESA_NOME, { exact: true })).toBeChecked();
    await cartao.getByRole('button', { name: 'Gerar código de ativação' }).click();
    const valor = cartao.getByTestId('codigo-de-ativacao-valor');
    await expect(valor).toHaveText(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, { timeout: 15_000 });
    codigo = (await valor.textContent()) ?? '';
    await expect(cartao.getByTestId(`tablet-${TABLET_NOME}`).getByText('Aguardando ativação', { exact: true })).toBeVisible();

    // ── No tablet: ativa com o código ──
    tablet = await aparelho(ROSTO_A);
    const t = tablet.page;
    await t.goto('/clock');
    await irAoCampoDeCpfDoPonto(t);
    await t.getByRole('button', { name: 'Ativar este aparelho como tablet de ponto' }).click();
    await t.getByLabel('Código de ativação').fill(codigo.toLowerCase());
    await t.getByRole('button', { name: 'Ativar tablet' }).click();
    await expect(t.getByText(`Tablet ativado: ${TABLET_NOME}`)).toBeVisible({ timeout: 20_000 });
    await expect(t.getByText(EMPRESA_NOME)).toBeVisible();
    segredoDoTablet = (await t.evaluate((k) => localStorage.getItem(k), CHAVE_SEGREDO)) ?? '';
    expect(segredoDoTablet).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // O banco guardou só o hash (o segredo não está em lugar nenhum lá).
    const s = getClient();
    const { data: vinculo } = await s.from('clock_device_companies').select('device_id').eq('company_id', empresaId).single();
    const { data: linha } = await s.from('clock_devices').select('status, token_hash').eq('id', (vinculo as { device_id: string }).device_id).single();
    expect((linha as { status: string }).status).toBe('active');
    expect((linha as { token_hash: string }).token_hash).not.toContain(segredoDoTablet);

    // ── De volta ao painel: o tablet aparece ativo e a trava pode ser ligada ──
    await cartao.getByRole('button', { name: 'Atualizar lista' }).click();
    await expect(cartao.getByTestId(`tablet-${TABLET_NOME}`).getByText('Ativo', { exact: true })).toBeVisible({ timeout: 15_000 });
    await trava.getByRole('button', { name: 'Ligar trava' }).click();
    await cartao.getByRole('button', { name: 'Confirmar: ligar trava' }).click();
    // exact: sem ele, "LIGADA" casa com "Des-ligada" (a busca ignora maiúscula e aceita pedaço) e
    // a conferência passava ANTES de a trava ligar — pegou uma rodada.
    await expect(trava.getByText('LIGADA', { exact: true })).toBeVisible({ timeout: 15_000 });

    // O estado que vale é o do banco, não o texto da tela.
    await expect.poll(async () => {
      const { data } = await s.from('companies').select('require_clock_device').eq('id', empresaId).single();
      return (data as { require_clock_device: boolean } | null)?.require_clock_device;
    }, { timeout: 15_000 }).toBe(true);
  });

  test('4. no tablet: CPF + senha + cadastro do rosto + ENTRADA com verificação facial', async () => {
    const t = tablet.page;
    await t.goto('/clock');
    const campo = await irAoCampoDeCpfDoPonto(t);
    await expect(t.getByTestId('clock-device-badge')).toContainText(TABLET_NOME);
    // 30/09/2026 (roadmap item 5, decisão do Victor): no tablet NÃO tem o caminho da consulta —
    // quem para pra consultar segura a fila.
    await expect(t.getByTestId('link-da-consulta')).toHaveCount(0);
    await campo.fill(cpf);
    await t.getByRole('button', { name: 'Continuar' }).click();
    for (const d of PIN) await t.getByRole('button', { name: d, exact: true }).click();
    await t.getByRole('button', { name: /Confirmar PIN/i }).click();

    // 1ª vez: cadastro do rosto (a câmera mostra o rosto A).
    await expect(t.getByText('Cadastro Facial')).toBeVisible({ timeout: 30_000 });
    await expect(t.getByRole('button', { name: /REGISTRAR ENTRADA/i })).toBeVisible({ timeout: 90_000 });

    await t.getByRole('button', { name: /REGISTRAR ENTRADA/i }).click();
    await expect(t.getByText(/Entrada registrada/)).toBeVisible({ timeout: 90_000 });

    const s = getClient();
    const { data: att } = await s.from('attendance').select('entry_time').eq('employee_id', pessoaId).eq('date', hoje()).single();
    expect((att as { entry_time: string | null }).entry_time).toBeTruthy();
  });

  test('5. celular pessoal (sem segredo): "Ponto só no tablet da empresa" — nem pelo CPF', async () => {
    const { page: celular } = await aparelho(ROSTO_A);
    await celular.goto('/clock');
    const barrado = celular.getByTestId('device-blocked');
    await expect(barrado).toBeVisible({ timeout: 30_000 });
    await expect(barrado).toContainText(EMPRESA_NOME);

    await celular.getByRole('button', { name: 'Sou de outra empresa — digitar CPF' }).click();
    await celular.locator('input[placeholder="000.000.000-00"]').fill(cpf);
    await celular.getByRole('button', { name: 'Continuar' }).click();
    await expect(celular.getByTestId('device-blocked')).toBeVisible({ timeout: 20_000 });
    await expect(celular.getByRole('button', { name: /Confirmar PIN/i })).toHaveCount(0);
  });

  /**
   * 30/09/2026 (roadmap item 5) — decisão do Victor: fora do tablet "pode ver tudo mas não bater o
   * ponto de forma nenhuma". O celular barrado ganha o caminho da consulta (/erros): com CPF e
   * senha, a pessoa vê os pontos dela (a ENTRADA do passo 4 aparece), erros e recibos — e não
   * existe botão de bater ponto lá.
   */
  test('5b. celular barrado: "Ver meus erros, pontos e recibos" — vê a entrada de hoje, sem poder bater', async () => {
    const { page: celular } = await aparelho(ROSTO_A);
    await celular.goto('/clock');
    await expect(celular.getByTestId('device-blocked')).toBeVisible({ timeout: 30_000 });

    await celular.getByTestId('link-da-consulta').click();
    await expect(celular).toHaveURL(/\/erros$/);
    await celular.locator('#cpf').fill(cpf);
    await celular.getByRole('button', { name: /^Continuar$/ }).click();
    await celular.getByPlaceholder('••••').fill(PIN.join(''));
    await celular.getByRole('button', { name: /^Entrar$/ }).click();

    const pontos = celular.getByTestId('meus-pontos');
    await expect(pontos.getByText(/Últimos 30 dias/)).toBeVisible({ timeout: 20_000 });
    const [y, m, d] = hoje().split('-');
    const linhaDeHoje = pontos.locator('tr', { hasText: `${d}/${m}/${y}` });
    await expect(linhaDeHoje).toBeVisible();
    // A ENTRADA do passo 4 está lá (a saída ainda não — ela é batida no passo 6).
    await expect(linhaDeHoje.locator('td').nth(1)).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(celular.getByText('Nenhum erro registrado')).toBeVisible();
    await expect(celular.getByRole('button', { name: /REGISTRAR|Entrada|Saída/i })).toHaveCount(0);
  });

  test('6. no tablet: SAÍDA só pelo rosto, sem digitar CPF', async () => {
    const t = tablet.page;
    await t.goto('/clock');
    await expect(t.getByText('Aproxime o rosto da câmera')).toBeVisible({ timeout: 60_000 });
    const cameraPronta = Date.now();
    await expect(t.getByTestId('clock-device-badge')).toContainText(TABLET_NOME);
    await expect(t.getByText(PESSOA_NOME)).toBeVisible({ timeout: 90_000 });
    // 05/10/2026 (decisão do Victor): saída pelo rosto a menos de 10 min da entrada PERGUNTA antes
    // (quem ficava parado na frente ganhava uma saída falsa). Aqui a saída vem ~1–2 min depois da
    // entrada do passo 4, então a pergunta aparece — e só grava com o "Sim".
    const pergunta = t.getByTestId('confirmar-saida-rapida');
    await expect(pergunta).toBeVisible({ timeout: 30_000 });
    await expect(pergunta).toContainText('Você bateu a entrada há');
    await expect(t.getByText(/Saída registrada/)).toHaveCount(0); // nada gravado sem resposta
    await pergunta.getByRole('button', { name: /Sim, registrar/ }).click();
    const reconheceu = Date.now();
    await expect(t.getByText(/Saída registrada/)).toBeVisible({ timeout: 60_000 });
    // Meta do Victor: 5–7s da pessoa parar na frente até o ponto gravado (NO TABLET). Nesta
    // máquina de teste o navegador roda sem placa de vídeo e dividindo CPU com o robô da
    // Shopee, então o número daqui é pior que o do tablet — fica impresso pra acompanhar.
    console.log(`[tempo] câmera pronta → nome + confirmação: ${((reconheceu - cameraPronta) / 1000).toFixed(1)}s · `
      + `"Sim" → ponto gravado: ${((Date.now() - reconheceu) / 1000).toFixed(1)}s`);

    // Sem CPF não há PIN: o painel carrega o histórico com o COMPROVANTE do rosto (30/09/2026).
    const [y, m, d] = hoje().split('-');
    await expect(t.locator('tr', { hasText: `${d}/${m}/${y}` })).toBeVisible({ timeout: 20_000 });

    const s = getClient();
    const { data: att } = await s.from('attendance').select('exit_time_full').eq('employee_id', pessoaId).eq('date', hoje()).single();
    expect((att as { exit_time_full: string | null }).exit_time_full).toBeTruthy();

    // A tentativa sem CPF gravou o desfecho e a distância (calibração com dado real).
    const { data: tentativas } = await s.from('face_auth_attempts')
      .select('outcome, best_distance').eq('company_id', empresaId).eq('outcome', 'matched');
    expect((tentativas ?? []).length).toBeGreaterThan(0);
    expect(Number((tentativas as Array<{ best_distance: number }>)[0].best_distance)).toBeLessThan(0.5);
  });

  test('7. no tablet, OUTRA pessoa (rosto não cadastrado): "Não reconheci"', async () => {
    const { page: outraPessoa } = await aparelho(ROSTO_B, { segredo: segredoDoTablet });
    await outraPessoa.goto('/clock');
    await expect(outraPessoa.getByTestId('clock-device-badge')).toContainText(TABLET_NOME, { timeout: 30_000 });
    await expect(outraPessoa.getByText(/Não reconheci/)).toBeVisible({ timeout: 90_000 });
    await expect(outraPessoa.getByText(PESSOA_NOME)).toHaveCount(0);
  });

  test('8. o último tablet não sai com a trava ligada; desligada, sai — e o aparelho volta a ser comum', async ({ page }) => {
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Configurações');
    const cartao = page.getByTestId('clock-devices-card');
    const linha = cartao.getByTestId(`tablet-${TABLET_NOME}`);
    await expect(linha).toBeVisible({ timeout: 20_000 });

    await linha.getByRole('button', { name: 'Remover' }).click();
    await cartao.getByRole('button', { name: 'Confirmar: remover tablet' }).click();
    await expect(page.getByText(/último tablet ativo/)).toBeVisible({ timeout: 15_000 });
    await cartao.getByRole('button', { name: 'Cancelar' }).click();

    const trava = cartao.getByTestId(`trava-${EMPRESA_NOME}`);
    await trava.getByRole('button', { name: 'Desligar trava' }).click();
    await cartao.getByRole('button', { name: 'Confirmar: desligar trava' }).click();
    await expect(trava.getByText('Desligada', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => {
      const { data } = await getClient().from('companies').select('require_clock_device').eq('id', empresaId).single();
      return (data as { require_clock_device: boolean } | null)?.require_clock_device;
    }, { timeout: 15_000 }).toBe(false);

    await linha.getByRole('button', { name: 'Remover' }).click();
    await cartao.getByRole('button', { name: 'Confirmar: remover tablet' }).click();
    await expect(linha.getByText('Removido', { exact: true })).toBeVisible({ timeout: 15_000 });

    // O tablet removido: o segredo guardado deixa de valer e é esquecido.
    const t = tablet.page;
    await t.goto('/clock');
    await irAoCampoDeCpfDoPonto(t);
    await expect(t.getByRole('button', { name: 'Ativar este aparelho como tablet de ponto' })).toBeVisible({ timeout: 20_000 });
    await expect(t.getByTestId('clock-device-badge')).toHaveCount(0);
    await expect.poll(() => t.evaluate((k) => localStorage.getItem(k), CHAVE_SEGREDO)).toBeNull();
  });

  test('9. pedido de câmera FECHADO: "Falta liberar a câmera" (não "bloqueada") e o toque resolve', async () => {
    const { page: aparelhoComum } = await aparelho(null, {
      initScript: () => {
        const md = navigator.mediaDevices;
        const original = md.getUserMedia.bind(md);
        let primeira = true;
        md.getUserMedia = (c?: MediaStreamConstraints) => {
          if (primeira) {
            primeira = false;
            return Promise.reject(new DOMException('Permission dismissed', 'NotAllowedError'));
          }
          return original(c);
        };
        const perms = navigator.permissions;
        const query = perms.query.bind(perms);
        perms.query = ((d: PermissionDescriptor) =>
          d?.name === ('camera' as PermissionName)
            ? Promise.resolve({ state: 'prompt', onchange: null } as unknown as PermissionStatus)
            : query(d)) as typeof perms.query;
      },
    });
    await aparelhoComum.goto('/clock');
    await expect(aparelhoComum.getByText('📷 Falta liberar a câmera')).toBeVisible({ timeout: 30_000 });
    await expect(aparelhoComum.getByText(/Câmera bloqueada/)).toHaveCount(0);
    await aparelhoComum.getByRole('button', { name: 'Ativar câmera' }).click();
    await expect(aparelhoComum.getByText(/Aproxime o rosto da câmera/)).toBeVisible({ timeout: 30_000 });

    // E o erro chegou ao servidor com a causa.
    const s = getClient();
    await expect.poll(async () => {
      const { data } = await s.from('error_logs').select('error_context').eq('company_id', empresaId).eq('error_type', 'camera_error');
      return (data ?? []).map((r: { error_context: { problema?: string } }) => r.error_context.problema);
    }, { timeout: 15_000 }).toContain('permissao-pendente');
  });
});
