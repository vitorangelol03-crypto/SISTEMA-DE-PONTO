import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { getClient } from './cleanup';
import { irAoCampoDeCpfDoPonto } from './helpers';

/**
 * MODO SUPERVISOR no CELULAR — `/clock?supervisor=1`, com cliques de verdade e o servidor de verdade
 * (07/10/2026, plano do tablet sem toque, entrega E).
 *
 * O supervisor entra com o código + senha do painel, mostra o QR de conectar, cadastra uma pessoa
 * nova e confirma o rosto dela — tudo pelo celular. O TABLET aqui é simulado chamando a mesma
 * função que a tela do tablet vai chamar (entrega F), com o segredo de um tablet de teste e o texto
 * do QR que aparece no celular (data-qr = o conteúdo da imagem).
 *
 * 🔑 Empresa, tablet, funcionários e supervisor FIXTURE ("PW Test", usuário 97981), apagados no fim.
 */

const STAMP = Date.now();
const EMPRESA = `PW Test Celular Sup ${STAMP}`;
const SUPERVISOR = '97981';
const SENHA = 'teste12345'; // senha do supervisor DE TESTE (criado e apagado aqui)
const TABLET_NOME = 'PW Tablet Celular';
const SEGREDO = randomBytes(32).toString('base64url');
const NOVA = `PW Test Nova Pessoa ${STAMP}`;

function env(): { url: string; anon: string } {
  const out: Record<string, string> = {};
  for (const l of fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { url: out.VITE_SUPABASE_URL, anon: out.VITE_SUPABASE_ANON_KEY };
}

/** O tablet simulado: chama a função do supervisor com o segredo do tablet de teste. */
async function tablet(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const { url, anon } = env();
  const r = await fetch(`${url}/functions/v1/ponto-supervisor-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify({ deviceToken: SEGREDO, ...body }),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
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

const rosto = (semente: number) => Array.from({ length: 128 }, (_, i) => Math.sin(semente * 13 + i) * 0.3);
const perto = (r: number[], d: number) => r.map((x) => x + d / Math.sqrt(128));
// JPEG 1×1 (só pra a tela ter o que mostrar).
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

async function qrNaTela(page: Page): Promise<string> {
  const qr = page.getByTestId('qr-na-tela');
  await expect(qr).toBeVisible({ timeout: 20_000 });
  return (await qr.getAttribute('data-qr')) ?? '';
}

test.describe.serial('modo supervisor no celular — cliques reais e o servidor de verdade', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'roda no Chromium');
  test.setTimeout(180_000);
  test.use({ viewport: { width: 390, height: 844 } });

  let empresaId = '';
  let deviceId = '';
  let funcSupervisor = '';

  test.beforeAll(async () => {
    const s = getClient();
    const { data: c, error: e1 } = await s.from('companies').insert([{
      legal_name: `${EMPRESA} LTDA`, cnpj: randomDigits(12), display_name: EMPRESA, city: 'Teste, MG',
      default_geo_lat: -19.5, default_geo_lng: -42.6, default_geo_radius: 150, default_marking_count: 2,
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
    const funcionario = async (nome: string, extra: Record<string, unknown>) => {
      const { data, error } = await s.from('employees').insert([{
        name: nome, cpf: cpfValido(), company_id: empresaId, employment_type: 'Diarista', created_by: '9999',
        function_role: 'Separador', ...extra,
      }]).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    };
    funcSupervisor = await funcionario(`PW Test Supervisora Ana ${STAMP}`, { face_descriptor: rosto(1), face_registered: true });
    await funcionario(`PW Test Joao ${STAMP}`, { face_descriptor: rosto(7), face_registered: true });
    const { error: e4 } = await s.rpc('_test_create_supervisor_with_perms', {
      sup_id: SUPERVISOR, plain_pass: SENHA, perms_json: { employees: { view: true, tabletCreate: true, tabletFaceReset: true } },
      company_uuid: empresaId, created_by_id: '2626',
    });
    if (e4) throw e4;
    const { error: e5 } = await s.from('users').update({ employee_id: funcSupervisor }).eq('id', SUPERVISOR);
    if (e5) throw e5;
  });

  test.afterAll(async () => {
    const s = getClient();
    // Ordem importa: os funcionários (created_by → supervisor) saem antes do usuário.
    const passos: Array<[string, boolean, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ['audit_logs', true, () => s.from('audit_logs').delete().eq('user_id', SUPERVISOR)],
      ['employees', !!empresaId, () => s.from('employees').delete().eq('company_id', empresaId)],
      ['user_permissions', true, () => s.from('user_permissions').delete().eq('user_id', SUPERVISOR)],
      ['users', true, () => s.from('users').delete().eq('id', SUPERVISOR)],
      ['clock_devices', !!deviceId, () => s.from('clock_devices').delete().eq('id', deviceId)],
      ['payment_periods', !!empresaId, () => s.from('payment_periods').delete().eq('company_id', empresaId)],
      ['companies', !!empresaId, () => s.from('companies').delete().eq('id', empresaId)],
    ];
    for (const [nome, rodar, passo] of passos) {
      if (!rodar) continue;
      const { error } = await passo();
      if (error) throw new Error(`limpar ${nome}: ${error.message}`);
    }
  });

  test('a tela de CPF do celular tem a entrada do modo supervisor', async ({ page }) => {
    await page.goto('/clock');
    await irAoCampoDeCpfDoPonto(page);
    await expect(page.getByTestId('link-do-supervisor')).toHaveAttribute('href', '/clock?supervisor=1');
  });

  test('entra, conecta ao tablet, cadastra uma pessoa nova e confirma o rosto dela', async ({ page }) => {
    const s = getClient();
    await page.goto('/clock?supervisor=1');
    await expect(page.getByTestId('supervisor-login')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Seu código do painel').fill(SUPERVISOR);
    await page.getByLabel('Senha do painel').fill('errada');
    await page.getByRole('button', { name: /Entrar como supervisor/ }).click();
    await expect(page.getByTestId('supervisor-login-erro')).toContainText('Código ou senha inválidos');
    await page.getByLabel('Senha do painel').fill(SENHA);
    await page.getByRole('button', { name: /Entrar como supervisor/ }).click();

    // ── Conectar: o "tablet" lê o QR que está na tela do celular ──
    await expect(page.getByTestId('conectar-ao-tablet')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('sessao-contagem')).toContainText(/Sessão: (19|20):/);
    const qr1 = await qrNaTela(page);
    expect(qr1).toMatch(/^PT1:P:[A-Z2-7]{26}$/);
    const leu = await tablet({ action: 'tablet-read-qr', qrText: qr1 });
    expect(leu.status, JSON.stringify(leu.body)).toBe(200);
    await expect(page.getByTestId('conectado')).toContainText(`Lido pelo tablet ${TABLET_NOME}`, { timeout: 15_000 });

    // ── Lista → cadastrar novo ──
    const lista = page.getByTestId('lista-do-supervisor');
    await expect(lista).toContainText(`PW Test Joao ${STAMP}`, { timeout: 15_000 });
    await page.getByRole('button', { name: /Cadastrar funcionário novo/ }).click();
    await page.getByLabel('Nome completo *').fill(NOVA);
    await page.getByLabel('CPF *').fill(cpfValido());
    await page.getByLabel('Telefone *').fill('33999990000');
    await page.getByLabel('Função *').selectOption('Separador');
    await page.getByRole('button', { name: /Salvar e cadastrar o rosto/ }).click();

    // ── O rosto: o "tablet" lê o QR2 e manda as fotos; o supervisor confirma ──
    await expect(page.getByTestId('rosto-preparar')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Gerar o código do rosto/ }).click();
    const qr2 = await qrNaTela(page);
    expect(qr2).toMatch(/^PT1:R:/);
    const leuRosto = await tablet({ action: 'tablet-read-qr', qrText: qr2 });
    expect(leuRosto.status, JSON.stringify(leuRosto.body)).toBe(200);
    await expect(page.getByTestId('rosto-lendo')).toBeVisible({ timeout: 10_000 });
    const r = rosto(42);
    const enviou = await tablet({ action: 'tablet-submit-face', qrId: leuRosto.body.qrId, amostras: [r, perto(r, 0.05), perto(r, 0.08)], foto: FOTO });
    expect(enviou.status, JSON.stringify(enviou.body)).toBe(200);
    await expect(page.getByTestId('rosto-capturado')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByTestId('rosto-confirmado')).toContainText('cadastrado ✓', { timeout: 10_000 });

    // ── No banco: a ficha nova, como o Victor decidiu (diarista, pendente, sem PIX) e com rosto ──
    const { data: nova } = await s.from('employees')
      .select('employment_type, contract_type, registration_status, created_by, pix_key, face_registered, face_descriptor')
      .eq('company_id', empresaId).eq('name', NOVA).single();
    const f = nova as Record<string, unknown>;
    expect([f.employment_type, f.contract_type, f.registration_status, f.created_by, f.pix_key, f.face_registered])
      .toEqual(['Diarista', 'Diarista', 'pending', SUPERVISOR, null, true]);
    expect(f.face_descriptor as number[]).toHaveLength(128);

    // ── Volta à lista: a pessoa nova está lá, já com rosto; sair encerra ──
    await page.getByRole('button', { name: /Voltar à lista/ }).click();
    const linhaNova = page.getByTestId('lista-do-supervisor').getByRole('listitem').filter({ hasText: NOVA });
    await expect(linhaNova).toBeVisible({ timeout: 15_000 });
    await expect(linhaNova).not.toContainText('sem rosto');
    await expect(linhaNova).toContainText('pendente');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByTestId('supervisor-login')).toBeVisible();
    const { data: sessoes } = await s.from('tablet_supervisor_sessions').select('status').eq('user_id', SUPERVISOR);
    expect((sessoes ?? []).map((x: { status: string }) => x.status)).toEqual(['encerrada']);
  });
});
