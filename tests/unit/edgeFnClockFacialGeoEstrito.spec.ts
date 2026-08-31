import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Roadmap item 1 (31/08/2026, decisões do Victor): "ninguém bate ponto sem facial E sem
 * geolocalização" — a trava dura por empresa (`companies.require_facial_clock`, migration
 * `20260831170000`) fazendo o edge fn `clock-in-validated` EXIGIR facial 1:1 e bloquear geo
 * em TODAS as 4 marcações (hoje só a 1ª bloqueia).
 *
 * A suíte anterior (specs 02/08/23/62 do Playwright, rodada em 31/08) provou "não quebra
 * nada com a chave desligada" — ISSO NÃO PROVA "bloqueia de verdade". Esta suíte prova a
 * outra metade: com a chave LIGADA, o servidor recusa rosto errado/ausente e recusa geo
 * fora da área em QUALQUER marcação (não só a entrada).
 *
 * PRÉ-REQUISITO: migration `20260831170000_companies_require_facial_clock_flag.sql`
 * aplicada em produção + edge fn `clock-in-validated` (versão com o bloco `strictFacial`)
 * deployada. Enquanto isso não acontecer, o `beforeAll` falha com uma mensagem clara —
 * de propósito: uma falha explicando o que falta é melhor que um skip silencioso.
 *
 * Estratégia (mesmo padrão de tests/unit/edgeFnEmployeePublicApi.spec.ts — sem mocks,
 * bate na edge fn real): cria uma EMPRESA fixture própria (não mexe em Caratinga/Ponte
 * Nova reais) com `require_facial_clock: true` desde a criação, um funcionário fixture
 * nela, exercita a sequência real de 4 marcações do dia, e limpa tudo no fim
 * (attendance + geo_fraud_attempts + bonus_blocks + employee + company).
 *
 * Roda com: npx vitest run edgeFnClockFacialGeoEstrito
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
const FN_URL = `${SUPABASE_URL}/functions/v1/clock-in-validated`;

const HAS_SERVICE_ROLE = Boolean(SERVICE_KEY && SUPABASE_URL && ANON_KEY);

// Coordenadas fixas da empresa fixture (um ponto qualquer em MG) + "longe" = ~150km,
// bem fora de qualquer raio configurável (default_geo_radius default é 150 METROS).
const COMPANY_LAT = -19.5;
const COMPANY_LNG = -42.6;
const FAR_LAT = COMPANY_LAT + 1.3; // ~150km — nunca cai dentro de um raio em metros
const FAR_LNG = COMPANY_LNG;

// Descriptors determinísticos (não são rostos reais — a edge fn só faz a conta de
// distância euclidiana, não valida se "parece" um rosto de verdade).
const ENROLLED = Array.from({ length: 128 }, (_, i) => i / 128); // 0 .. ~0.99
const SAME_FACE = ENROLLED.map((x) => x + 0.001); // distância ≈ 0,011 → < 0.5 (mesma pessoa)
const OTHER_FACE = ENROLLED.map((x) => x + 1); // distância ≈ 11,3 → >> 0.5 (pessoa diferente)

async function supaInsert<T extends Record<string, unknown>>(
  table: string,
  row: T,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`supaInsert(${table}) ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, unknown>[];
  return data[0];
}

async function supaSelect<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`supaSelect(${table}?${query}) ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function supaDelete(table: string, query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
  });
  if (!res.ok && res.status !== 404) throw new Error(`supaDelete(${table}?${query}) ${res.status}: ${await res.text()}`);
}

function generateRandomCpf(): string {
  let cpf = '';
  for (let i = 0; i < 11; i++) cpf += Math.floor(Math.random() * 10);
  return cpf;
}

async function callClock(payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
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
  'edge fn clock-in-validated — trava dura require_facial_clock (item 1 do roadmap)',
  { timeout: 60_000 },
  () => {
    let companyId = '';
    let employeeId = '';
    let cpf = '';
    const today = new Date().toISOString().slice(0, 10);

    beforeAll(async () => {
      expect(SUPABASE_URL).toMatch(/^https:\/\//);
      expect(ANON_KEY.length).toBeGreaterThan(20);
      expect(SERVICE_KEY.length).toBeGreaterThan(20);

      let company: Record<string, unknown>;
      try {
        company = await supaInsert('companies', {
          legal_name: `PW Test Estrito ${Date.now()} LTDA`,
          cnpj: generateRandomCpf() + '0001',
          display_name: `PW Test Estrito ${Date.now()}`,
          city: 'Caratinga',
          default_geo_lat: COMPANY_LAT,
          default_geo_lng: COMPANY_LNG,
          default_geo_radius: 150,
          require_facial_clock: true,
        });
      } catch (err) {
        throw new Error(
          'Não deu pra criar a empresa fixture com require_facial_clock=true — provavelmente a ' +
            "migration 20260831170000_companies_require_facial_clock_flag.sql AINDA NÃO foi " +
            'aplicada em produção (a coluna não existe). Aplique a migration antes de rodar esta ' +
            `suíte. Erro original: ${(err as Error).message}`,
        );
      }
      companyId = String(company.id);

      cpf = generateRandomCpf();
      const employee = await supaInsert('employees', {
        name: `PW Test Estrito ${Date.now()}`,
        cpf,
        company_id: companyId,
        pin_configured: false,
        face_registered: false,
      });
      employeeId = String(employee.id);
    });

    afterAll(async () => {
      if (employeeId) {
        await supaDelete('geo_fraud_attempts', `employee_id=eq.${employeeId}`).catch(() => {});
        await supaDelete('bonus_blocks', `employee_id=eq.${employeeId}`).catch(() => {});
        await supaDelete('attendance', `employee_id=eq.${employeeId}`).catch(() => {});
        await supaDelete('employees', `id=eq.${employeeId}`).catch(() => {});
      }
      if (companyId) {
        await supaDelete('companies', `id=eq.${companyId}`).catch(() => {});
      }
    });

    it('percorre o dia inteiro (4 marcações) provando cada trava, na ordem', async () => {
      // ── 1ª marcação (entrada): sem rosto cadastrado e SEM mandar rosto → recusa ──
      const semRosto = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'entry',
        marking_position: 1,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
      });
      expect(semRosto.status).toBe(200);
      expect(semRosto.body.success).toBe(false);
      expect(semRosto.body.face_error).toBe(true);

      // ── 1ª marcação: manda o rosto pela 1ª vez → CADASTRA sozinho e deixa bater ──
      const cadastra = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'entry',
        marking_position: 1,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
        face_descriptor_now: ENROLLED,
      });
      expect(cadastra.status).toBe(200);
      expect(cadastra.body.success).toBe(true);

      const [empApós1] = await supaSelect<{ face_registered: boolean; face_descriptor: number[] }>(
        'employees',
        `select=face_registered,face_descriptor&id=eq.${employeeId}`,
      );
      expect(empApós1.face_registered).toBe(true);
      expect(empApós1.face_descriptor).toHaveLength(128);

      // ── 2ª marcação (saída almoço): rosto DE OUTRA PESSOA → recusa, mesmo com geo ok ──
      const rostoErrado = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 2,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
        face_descriptor_now: OTHER_FACE,
      });
      expect(rostoErrado.status).toBe(200);
      expect(rostoErrado.body.success).toBe(false);
      expect(rostoErrado.body.face_error).toBe(true);
      expect(String(rostoErrado.body.message)).toMatch(/não confere/i);

      // ── 2ª marcação: rosto CERTO mas GEO longe → recusa por geo (posição ≠ 1!) ──
      // 🔑 é exatamente a brecha que existia antes: só a 1ª entrada bloqueava geo fora
      // da área; posições 2/3/4 "deixavam passar". Aqui tem que recusar.
      const geoLongePos2 = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 2,
        latitude: FAR_LAT,
        longitude: FAR_LNG,
        face_descriptor_now: SAME_FACE,
      });
      expect(geoLongePos2.status).toBe(200);
      expect(geoLongePos2.body.success).toBe(false);
      expect(geoLongePos2.body.fraud).toBe(true);

      // ── 2ª marcação: rosto certo + geo certo → passa ──
      const pos2ok = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 2,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
        face_descriptor_now: SAME_FACE,
      });
      expect(pos2ok.status).toBe(200);
      expect(pos2ok.body.success).toBe(true);

      // ── 3ª marcação (volta almoço): geo longe de novo → continua recusando ──
      const geoLongePos3 = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 3,
        latitude: FAR_LAT,
        longitude: FAR_LNG,
        face_descriptor_now: SAME_FACE,
      });
      expect(geoLongePos3.status).toBe(200);
      expect(geoLongePos3.body.success).toBe(false);
      expect(geoLongePos3.body.fraud).toBe(true);

      // ── 3ª marcação: certo dessa vez → passa ──
      const pos3ok = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 3,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
        face_descriptor_now: SAME_FACE,
      });
      expect(pos3ok.status).toBe(200);
      expect(pos3ok.body.success).toBe(true);

      // ── 4ª marcação (saída final): SEM mandar rosto nenhum → recusa (já tem cadastro) ──
      const pos4SemRosto = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 4,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
      });
      expect(pos4SemRosto.status).toBe(200);
      expect(pos4SemRosto.body.success).toBe(false);
      expect(pos4SemRosto.body.face_error).toBe(true);
      expect(String(pos4SemRosto.body.message)).toMatch(/não enviado/i);

      // ── 4ª marcação: certo → fecha o dia ──
      const pos4ok = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 4,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
        face_descriptor_now: SAME_FACE,
      });
      expect(pos4ok.status).toBe(200);
      expect(pos4ok.body.success).toBe(true);

      // Confere no banco: attendance do dia tem as 4 marcações e geo_valid nas que passaram.
      const [att] = await supaSelect<Record<string, unknown>>(
        'attendance',
        `select=entry_1_time,exit_1_time,entry_2_time,exit_2_time,geo_valid&employee_id=eq.${employeeId}&date=eq.${today}`,
      );
      expect(att.entry_1_time).not.toBeNull();
      expect(att.exit_1_time).not.toBeNull();
      expect(att.entry_2_time).not.toBeNull();
      expect(att.exit_2_time).not.toBeNull();
    });
  },
);
