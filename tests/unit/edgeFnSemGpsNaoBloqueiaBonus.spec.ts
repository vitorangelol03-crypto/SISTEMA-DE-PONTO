import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SEM GPS NÃO BLOQUEIA MAIS O BÔNUS (05/10/2026, decisão do Victor: "vamos tirar e desabilitar
 * essa função").
 *
 * Antes, a 1ª batida do dia SEM localização (GPS que falhou uma vez) gravava um bloqueio de bônus
 * da SEMANA inteira — mesmo a pessoa batendo de novo 16s depois (14 bloqueios assim entre 31/08 e
 * 04/10). Agora: a batida continua sem valer (o ponto exige localização), a tentativa continua
 * anotada em geo_fraud_attempts, mas o bônus NÃO é bloqueado. O bloqueio por estar FORA da cerca
 * continua igual — o 3º caso prova que ele não foi junto.
 *
 * Bate na edge fn REAL (sem mocks), com empresa e funcionários fixture "PW Test" próprios (não
 * mexe em Caratinga/Ponte Nova) e limpa tudo no fim. Antes de a função nova ser publicada, o 1º
 * caso falha (prova de que o teste pega o comportamento antigo).
 *
 * Roda com: npx vitest run edgeFnSemGpsNaoBloqueiaBonus
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
const FN_URL = ENV.CLOCK_FN_URL || `${SUPABASE_URL}/functions/v1/clock-in-validated`;
const HAS_SERVICE_ROLE = Boolean(SERVICE_KEY && SUPABASE_URL && ANON_KEY);

// Um ponto qualquer em MG; "longe" = ~150 km, fora de qualquer raio em metros.
const COMPANY_LAT = -19.5;
const COMPANY_LNG = -42.6;
const FAR_LAT = COMPANY_LAT + 1.3;

async function supa(method: 'POST' | 'GET' | 'DELETE', pathAndQuery: string, body?: unknown): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathAndQuery} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>[]) : [];
}

function cpfAleatorio(): string {
  let cpf = '';
  for (let i = 0; i < 11; i++) cpf += Math.floor(Math.random() * 10);
  return cpf;
}

async function bater(payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { _raw: text };
  }
  return { status: res.status, body };
}

describe.skipIf(!HAS_SERVICE_ROLE)(
  'edge fn clock-in-validated — sem GPS não bloqueia o bônus (05/10/2026)',
  { timeout: 60_000 },
  () => {
    const carimbo = Date.now();
    let companyId = '';
    const pessoas: Array<{ id: string; cpf: string }> = [];
    // Mesma data que a edge fn grava (Brasil), não a do UTC.
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const criarPessoa = async (rotulo: string) => {
      const cpf = cpfAleatorio();
      const [linha] = await supa('POST', 'employees', {
        name: `PW Test Sem GPS ${rotulo} ${carimbo}`, cpf, company_id: companyId,
        pin_configured: false, face_registered: false,
      });
      const pessoa = { id: String(linha.id), cpf };
      pessoas.push(pessoa);
      return pessoa;
    };

    beforeAll(async () => {
      const [empresa] = await supa('POST', 'companies', {
        legal_name: `PW Test Sem GPS ${carimbo} LTDA`,
        cnpj: cpfAleatorio() + '0001',
        display_name: `PW Test Sem GPS ${carimbo}`,
        city: 'Teste, MG',
        default_geo_lat: COMPANY_LAT,
        default_geo_lng: COMPANY_LNG,
        default_geo_radius: 150,
        require_facial_clock: false,
      });
      companyId = String(empresa.id);
    }, 30_000);

    afterAll(async () => {
      for (const p of pessoas) {
        await supa('DELETE', `geo_fraud_attempts?employee_id=eq.${p.id}`).catch(() => undefined);
        await supa('DELETE', `bonus_blocks?employee_id=eq.${p.id}`).catch(() => undefined);
        await supa('DELETE', `attendance?employee_id=eq.${p.id}`).catch(() => undefined);
        await supa('DELETE', `employees?id=eq.${p.id}`).catch(() => undefined);
      }
      if (companyId) await supa('DELETE', `companies?id=eq.${companyId}`).catch(() => undefined);
    }, 30_000);

    it('1ª batida SEM localização: não vale e fica anotada — mas o bônus NÃO é bloqueado', async () => {
      const p = await criarPessoa('A');
      const r = await bater({ employee_id: p.id, cpf: p.cpf, clock_type: 'entry', marking_position: 1 });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(false);
      expect(r.body.message).toBe('Localização não fornecida');

      const tentativas = await supa('GET', `geo_fraud_attempts?employee_id=eq.${p.id}&select=latitude,distance_meters`);
      expect(tentativas).toHaveLength(1);
      expect(tentativas[0].latitude).toBeNull();
      expect(await supa('GET', `bonus_blocks?employee_id=eq.${p.id}&select=id`)).toHaveLength(0);
      expect(await supa('GET', `attendance?employee_id=eq.${p.id}&date=eq.${hoje}&select=id`)).toHaveLength(0);
    });

    it('a mesma pessoa bate de novo COM localização: o ponto vale e o bônus segue livre', async () => {
      const p = pessoas[0];
      const r = await bater({
        employee_id: p.id, cpf: p.cpf, clock_type: 'entry', marking_position: 1,
        latitude: COMPANY_LAT, longitude: COMPANY_LNG, accuracy: 20,
      });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      const [ponto] = await supa('GET', `attendance?employee_id=eq.${p.id}&date=eq.${hoje}&select=entry_time,geo_valid`);
      expect(ponto.entry_time).toBeTruthy();
      expect(ponto.geo_valid).toBe(true);
      expect(await supa('GET', `bonus_blocks?employee_id=eq.${p.id}&select=id`)).toHaveLength(0);
    });

    it('FORA da cerca continua igual: grava a entrada, anota e BLOQUEIA o bônus da semana', async () => {
      const p = await criarPessoa('B');
      const r = await bater({
        employee_id: p.id, cpf: p.cpf, clock_type: 'entry', marking_position: 1,
        latitude: FAR_LAT, longitude: COMPANY_LNG, accuracy: 20,
      });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(false);
      expect(r.body.fraud).toBe(true);
      expect(Number(r.body.distance_meters)).toBeGreaterThan(100_000);
      const bloqueios = await supa('GET', `bonus_blocks?employee_id=eq.${p.id}&select=reason`);
      expect(bloqueios).toHaveLength(1);
      expect(String(bloqueios[0].reason)).toMatch(/^Fora da área permitida/);
      const [ponto] = await supa('GET', `attendance?employee_id=eq.${p.id}&date=eq.${hoje}&select=entry_time,geo_valid`);
      expect(ponto.entry_time).toBeTruthy();
      expect(ponto.geo_valid).toBe(false);
    });
  },
);
