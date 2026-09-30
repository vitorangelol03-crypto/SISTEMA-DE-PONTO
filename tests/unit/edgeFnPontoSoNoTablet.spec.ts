import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gerarSegredoDoTablet, sha256Hex } from '../../supabase/functions/_shared/clockDevice';

/**
 * PONTO SÓ NO TABLET DA EMPRESA + facial sem CPF com o limite novo — contra as edge functions
 * PUBLICADAS (30/09/2026, roadmap item 3).
 *
 * Mesmo padrão de edgeFnClockFacialGeoEstrito: nada de mock; cria EMPRESAS fixture próprias
 * (nunca mexe na trava de Caratinga/Ponte Nova reais — a suíte já desligou trava de produção
 * por minutos quando um processo morreu no meio), tablets fixture, um funcionário fixture, e
 * limpa tudo no fim.
 *
 * O que precisa ser verdade com a trava LIGADA:
 *   - sem segredo, segredo errado, tablet REMOVIDO ou tablet de OUTRA empresa → recusa, e nada
 *     é gravado (nem ponto, nem cadastro de rosto);
 *   - o tablet certo bate normalmente (facial + geo continuam valendo);
 *   - a identificação sem CPF também exige o tablet;
 *   - o código de ativação vira segredo UMA vez só.
 * E a facial sem CPF grava o desfecho e as distâncias (calibração com dado real).
 *
 * As URLs podem apontar pra funções de ENSAIO (CLOCK_FN_URL / EMPLOYEE_PUBLIC_FN_URL) — foi
 * assim que o código novo rodou antes de substituir as funções de produção.
 *
 * Roda com: npx vitest run edgeFnPontoSoNoTablet
 */

function readDotEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const ENV = { ...readDotEnv(), ...process.env };
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? '';
const ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CLOCK_URL = ENV.CLOCK_FN_URL || `${SUPABASE_URL}/functions/v1/clock-in-validated`;
const PUBLIC_URL = ENV.EMPLOYEE_PUBLIC_FN_URL || `${SUPABASE_URL}/functions/v1/employee-public-api`;
const HAS_SERVICE_ROLE = Boolean(SERVICE_KEY && SUPABASE_URL && ANON_KEY);

const LAT = -19.5;
const LNG = -42.6;

// Descriptors determinísticos (a edge fn só faz a conta de distância).
const ENROLLED = Array.from({ length: 128 }, (_, i) => i / 128);
const SAME_FACE = ENROLLED.map((x) => x + 0.001); // distância ≈ 0,011
// Distância 0,46: entre o limite ANTIGO do 1:N (0,42) e o novo (0,50) — a pessoa certa que o
// 1:N recusava. 0,46 / √128 ≈ 0,04066 somado em cada um dos 128 números.
const FACE_AT_046 = ENROLLED.map((x) => x + 0.46 / Math.sqrt(128));
const FAR_FACE = ENROLLED.map((x) => x + 1);

const headersService = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function insert<T extends Record<string, unknown>>(table: string, row: T): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headersService, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert(${table}) ${res.status}: ${await res.text()}`);
  return ((await res.json()) as Record<string, unknown>[])[0];
}

async function select<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: headersService });
  if (!res.ok) throw new Error(`select(${table}?${query}) ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function del(table: string, query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { ...headersService, Prefer: 'return=minimal' },
  });
  if (!res.ok && res.status !== 404) throw new Error(`delete(${table}?${query}) ${res.status}: ${await res.text()}`);
}

async function post(url: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { parsed = { _raw: text }; }
  return { status: res.status, body: parsed };
}

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

describe.skipIf(!HAS_SERVICE_ROLE)('ponto só no tablet — edge functions publicadas', { timeout: 90_000 }, () => {
  const stamp = Date.now();
  const companyIds: string[] = [];
  const deviceIds: string[] = [];
  let empresaA = '';
  let empresaB = '';
  let employeeId = '';
  let cpf = '';
  const segredoA = gerarSegredoDoTablet();      // ativo, atende A
  const segredoB = gerarSegredoDoTablet();      // ativo, atende só B
  const segredoRemovido = gerarSegredoDoTablet(); // removido, atendia A
  const codigoPendente = 'K7P2-9XQM';           // pendente, atende A (hash no banco)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  async function criarTablet(nome: string, empresas: string[], campos: Record<string, unknown>): Promise<string> {
    const d = await insert('clock_devices', { name: nome, created_by: 'teste', ...campos });
    const id = String(d.id);
    deviceIds.push(id);
    for (const company_id of empresas) await insert('clock_device_companies', { device_id: id, company_id });
    return id;
  }

  beforeAll(async () => {
    for (const letra of ['A', 'B']) {
      const c = await insert('companies', {
        legal_name: `PW Test Tablet ${letra} ${stamp} LTDA`,
        cnpj: randomDigits(12),
        display_name: `PW Test Tablet ${letra} ${stamp}`,
        city: 'Caratinga',
        default_geo_lat: LAT,
        default_geo_lng: LNG,
        default_geo_radius: 150,
        require_facial_clock: true,
        require_clock_device: true,
      });
      companyIds.push(String(c.id));
    }
    [empresaA, empresaB] = companyIds;

    cpf = randomDigits(11);
    const emp = await insert('employees', {
      name: `PW Test Tablet ${stamp}`,
      cpf,
      company_id: empresaA,
      pin_configured: false,
      face_registered: true,
      face_descriptor: ENROLLED,
    });
    employeeId = String(emp.id);

    const agora = new Date().toISOString();
    await criarTablet('PW Tablet A', [empresaA], { status: 'active', token_hash: await sha256Hex(segredoA), activated_at: agora });
    await criarTablet('PW Tablet B', [empresaB], { status: 'active', token_hash: await sha256Hex(segredoB), activated_at: agora });
    await criarTablet('PW Tablet removido', [empresaA], {
      status: 'revoked', token_hash: await sha256Hex(segredoRemovido), activated_at: agora, revoked_at: agora, revoked_by: 'teste',
    });
    await criarTablet('PW Tablet pendente', [empresaA], {
      status: 'pending',
      pairing_code_hash: await sha256Hex(codigoPendente.replace('-', '')),
      pairing_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  }, 60_000);

  afterAll(async () => {
    if (employeeId) {
      await del('attendance', `employee_id=eq.${employeeId}`).catch(() => {});
      await del('geo_fraud_attempts', `employee_id=eq.${employeeId}`).catch(() => {});
      await del('bonus_blocks', `employee_id=eq.${employeeId}`).catch(() => {});
    }
    for (const id of companyIds) {
      await del('face_auth_attempts', `company_id=eq.${id}`).catch(() => {});
      await del('error_logs', `company_id=eq.${id}`).catch(() => {});
    }
    if (employeeId) await del('employees', `id=eq.${employeeId}`).catch(() => {});
    for (const id of deviceIds) await del('clock_devices', `id=eq.${id}`).catch(() => {});
    for (const id of companyIds) await del('companies', `id=eq.${id}`).catch(() => {});
  });

  const baterEntrada = (extra: Record<string, unknown>) => post(CLOCK_URL, {
    employee_id: employeeId,
    cpf,
    company_id: empresaA,
    clock_type: 'entry',
    marking_position: 1,
    latitude: LAT,
    longitude: LNG,
    face_descriptor_now: SAME_FACE,
    ...extra,
  });

  it('trava ligada: sem segredo, segredo inválido, tablet removido e tablet de OUTRA empresa são recusados — e nada é gravado', async () => {
    const casos: Array<[string, Record<string, unknown>, string]> = [
      ['sem segredo (celular pessoal)', {}, 'sem_tablet'],
      ['segredo inválido', { device_token: gerarSegredoDoTablet() }, 'sem_tablet'],
      ['tablet removido', { device_token: segredoRemovido }, 'sem_tablet'],
      ['tablet de outra empresa', { device_token: segredoB }, 'tablet_de_outra_empresa'],
    ];
    for (const [nome, extra, motivo] of casos) {
      const r = await baterEntrada(extra);
      expect(r.status, nome).toBe(200);
      expect(r.body.success, nome).toBe(false);
      expect(r.body.device_error, nome).toBe(true);
      expect(r.body.device_reason, nome).toBe(motivo);
      expect(String(r.body.message), nome).toMatch(/tablet da empresa/);
    }
    const att = await select('attendance', `select=id&employee_id=eq.${employeeId}&date=eq.${today}`);
    expect(att).toHaveLength(0);
    const fraudes = await select('geo_fraud_attempts', `select=id&employee_id=eq.${employeeId}`);
    expect(fraudes).toHaveLength(0);
  });

  it('o tablet certo bate — e a facial continua valendo nele (rosto de outra pessoa é recusado)', async () => {
    const rostoErrado = await baterEntrada({ device_token: segredoA, face_descriptor_now: FAR_FACE });
    expect(rostoErrado.body.success).toBe(false);
    expect(rostoErrado.body.face_error).toBe(true);

    const certo = await baterEntrada({ device_token: segredoA });
    expect(certo.status).toBe(200);
    expect(certo.body.success).toBe(true);
    const att = await select<{ entry_time: string | null }>('attendance', `select=entry_time&employee_id=eq.${employeeId}&date=eq.${today}`);
    expect(att).toHaveLength(1);
    expect(att[0].entry_time).toBeTruthy();
  });

  it('identificação sem CPF também exige o tablet; no tablet certo, reconhece a 0,46 (o limite antigo recusava)', async () => {
    const semTablet = await post(PUBLIC_URL, { action: 'identify-face', companyId: empresaA, descriptorNow: FACE_AT_046 });
    expect(semTablet.status).toBe(200);
    expect(semTablet.body.matched).toBe(false);
    expect(semTablet.body.deviceBlocked).toBe(true);
    expect(semTablet.body.cpf).toBeUndefined();

    const noTablet = await post(PUBLIC_URL, {
      action: 'identify-face', companyId: empresaA, descriptorNow: FACE_AT_046, deviceToken: segredoA,
    });
    expect(noTablet.status).toBe(200);
    expect(noTablet.body.matched).toBe(true);
    expect(noTablet.body.employeeId).toBe(employeeId);
    expect(Number(noTablet.body.faceDistance)).toBeCloseTo(0.46, 2);

    const longe = await post(PUBLIC_URL, {
      action: 'identify-face', companyId: empresaA, descriptorNow: FAR_FACE, deviceToken: segredoA,
    });
    expect(longe.body.matched).toBe(false);

    // O servidor gravou o desfecho e as distâncias de cada tentativa (calibração com dado real).
    const tentativas = await select<{ outcome: string | null; best_distance: number | null; success: boolean }>(
      'face_auth_attempts',
      `select=outcome,best_distance,success&company_id=eq.${empresaA}&clock_type=is.null&order=attempted_at.asc`,
    );
    expect(tentativas.map((t) => t.outcome)).toEqual(['matched', 'no_match']);
    expect(Number(tentativas[0].best_distance)).toBeCloseTo(0.46, 2);
    expect(tentativas[0].success).toBe(true);
  });

  it('status do aparelho: tablet ativo diz quem é; removido/lixo = não é tablet', async () => {
    const ativo = await post(PUBLIC_URL, { action: 'clock-device-status', deviceToken: segredoA });
    expect(ativo.status).toBe(200);
    const device = ativo.body.device as { name: string; companyIds: string[] };
    expect(device.name).toBe('PW Tablet A');
    expect(device.companyIds).toEqual([empresaA]);

    const removido = await post(PUBLIC_URL, { action: 'clock-device-status', deviceToken: segredoRemovido });
    expect(removido.body.device).toBeNull();
    const lixo = await post(PUBLIC_URL, { action: 'clock-device-status', deviceToken: 'x' });
    expect(lixo.body.device).toBeNull();
  });

  it('código de ativação vira segredo UMA vez só — e o segredo novo passa a bater ponto', async () => {
    const ativa = await post(PUBLIC_URL, { action: 'activate-clock-device', code: codigoPendente.toLowerCase() });
    expect(ativa.status).toBe(200);
    const token = String(ativa.body.token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((ativa.body.device as { name: string }).name).toBe('PW Tablet pendente');

    const deNovo = await post(PUBLIC_URL, { action: 'activate-clock-device', code: codigoPendente });
    expect(deNovo.status).toBe(400);
    expect(String(deNovo.body.error)).toMatch(/inválido, vencido ou já usado/);

    const malDigitado = await post(PUBLIC_URL, { action: 'activate-clock-device', code: 'K7P2-9XQ' });
    expect(malDigitado.status).toBe(400);

    const status = await post(PUBLIC_URL, { action: 'clock-device-status', deviceToken: token });
    expect((status.body.device as { companyIds: string[] }).companyIds).toEqual([empresaA]);

    // O banco guardou só o hash do segredo novo.
    const [linha] = await select<{ token_hash: string; status: string; pairing_code_hash: string | null }>(
      'clock_devices', `select=token_hash,status,pairing_code_hash&name=eq.PW%20Tablet%20pendente&id=in.(${deviceIds.join(',')})`,
    );
    expect(linha.status).toBe('active');
    expect(linha.token_hash).toBe(await sha256Hex(token));
    expect(linha.pairing_code_hash).toBeNull();
  });

  it('erro de câmera vai pro servidor (error_logs), com o texto limitado', async () => {
    const r = await post(PUBLIC_URL, {
      action: 'log-clock-event',
      companyId: empresaB,
      kind: 'camera_error',
      details: { component: 'FaceIdentifyClock', name: 'NotAllowedError', message: 'x'.repeat(1000), problema: 'permissao-pendente' },
      userAgent: 'teste',
    });
    expect(r.status).toBe(200);
    const [log] = await select<{ error_type: string; component: string; error_context: Record<string, string> }>(
      'error_logs', `select=error_type,component,error_context&company_id=eq.${empresaB}`,
    );
    expect(log.error_type).toBe('camera_error');
    expect(log.component).toBe('FaceIdentifyClock');
    expect(log.error_context.message.length).toBe(300);

    const tipoInvalido = await post(PUBLIC_URL, { action: 'log-clock-event', companyId: empresaB, kind: 'qualquer', details: {} });
    expect(tipoInvalido.status).toBe(400);
  });
});
