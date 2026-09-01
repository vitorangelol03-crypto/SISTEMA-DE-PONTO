import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Roadmap item 2 (01/09/2026, achado no meio da investigação, pedido do Victor
 * "vamos consertar, deixar funcionando mas não habilitar"): a 4ª marcação (saída
 * final) calculava `hours_worked` como "última saída menos primeira entrada" —
 * SEM descontar o intervalo do almoço (exit_1 → entry_2). Achado com dado real:
 * 3 funcionários piloto em Caratinga já usam 4 marcações hoje (cliques em
 * sequência, sem almoço de verdade ainda — por sorte não pagou hora a mais até
 * agora, mas o bug estava lá).
 *
 * Fix (`calcHoursFourMarkings` em clock-in-validated/index.ts): quando exit_1 E
 * entry_2 existem, soma os dois turnos separados (manhã + tarde), igual
 * getWorkSegments/computeWorkedMinutes em src/utils/attendanceCalc.ts (usado no
 * recálculo administrativo). Sem os dois marcos, cai no cálculo direto de sempre.
 *
 * PRÉ-REQUISITO: edge fn `clock-in-validated` com o fix deployada. Enquanto isso
 * não acontecer, este teste PASSA no cálculo errado (não falha por falta de coluna
 * como o teste de facial/geo — aqui não há schema novo) e por isso a asserção do
 * valor exato é o que prova a diferença: 8h esperado, ~9h se o bug ainda estiver
 * lá (mensagem de erro explica os dois casos).
 *
 * Estratégia (mesmo padrão de tests/unit/edgeFnClockFacialGeoEstrito.spec.ts):
 * empresa fixture própria (não mexe em Caratinga/Ponte Nova reais), sem
 * require_facial_clock (isola o teste só no cálculo). Marcação 1 é uma chamada
 * real; exit_1/entry_2 são gravados direto no banco com horários retroativos
 * (simula um dia de trabalho real sem esperar 9h de verdade); marcação 4 é uma
 * chamada real, cujo `hours_worked` prova o fix.
 *
 * Roda com: npx vitest run edgeFnClockFourMarkingsLunch
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

const COMPANY_LAT = -19.5;
const COMPANY_LNG = -42.6;

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
  if (!res.ok) throw new Error(`supaInsert(${table}) ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as Record<string, unknown>[];
  return data[0];
}

async function supaUpdate(table: string, query: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`supaUpdate(${table}?${query}) ${res.status}: ${await res.text()}`);
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
  'edge fn clock-in-validated — 4 marcações descontam o almoço no cálculo (roadmap item 2, achado 01/09)',
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

      const company = await supaInsert('companies', {
        legal_name: `PW Test AlmocoCalc ${Date.now()} LTDA`,
        cnpj: generateRandomCpf() + '0001',
        display_name: `PW Test AlmocoCalc ${Date.now()}`,
        city: 'Caratinga',
        default_geo_lat: COMPANY_LAT,
        default_geo_lng: COMPANY_LNG,
        default_geo_radius: 150,
      });
      companyId = String(company.id);

      cpf = generateRandomCpf();
      const employee = await supaInsert('employees', {
        name: `PW Test AlmocoCalc ${Date.now()}`,
        cpf,
        company_id: companyId,
        pin_configured: false,
        face_registered: false,
      });
      employeeId = String(employee.id);
    }, 30_000);

    afterAll(async () => {
      if (employeeId) {
        await supaDelete('attendance', `employee_id=eq.${employeeId}`).catch(() => {});
        await supaDelete('employees', `id=eq.${employeeId}`).catch(() => {});
      }
      if (companyId) {
        await supaDelete('companies', `id=eq.${companyId}`).catch(() => {});
      }
    });

    it('9h de ponta a ponta com 1h de almoço no meio → hours_worked = 8h, não 9h', async () => {
      // ── posição 1 (entrada): chamada real, cria o attendance do dia ──
      const pos1 = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'entry',
        marking_position: 1,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
      });
      expect(pos1.status).toBe(200);
      expect(pos1.body.success).toBe(true);

      // Simula um dia real sem esperar 9h de verdade: entrada 9h atrás, saída
      // pro almoço 4h atrás (5h de manhã), volta do almoço 3h atrás (1h de
      // almoço exato). A saída final (posição 4, abaixo) é AGORA de verdade.
      const now = Date.now();
      const entry1 = new Date(now - 9 * 3_600_000).toISOString();
      const exit1 = new Date(now - 4 * 3_600_000).toISOString();
      const entry2 = new Date(now - 3 * 3_600_000).toISOString();
      await supaUpdate('attendance', `employee_id=eq.${employeeId}&date=eq.${today}`, {
        entry_1_time: entry1,
        exit_1_time: exit1,
        entry_2_time: entry2,
      });

      // ── posição 4 (saída final): chamada real → calcula sobre os horários acima ──
      const pos4 = await callClock({
        employee_id: employeeId,
        cpf,
        company_id: companyId,
        clock_type: 'exit',
        marking_position: 4,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LNG,
      });
      expect(pos4.status).toBe(200);
      expect(pos4.body.success).toBe(true);

      const [att] = await supaSelect<{ hours_worked: number }>(
        'attendance',
        `select=hours_worked&employee_id=eq.${employeeId}&date=eq.${today}`,
      );
      // 5h (manhã) + ~3h (tarde, entry_2 até agora) = ~8h. Fix deployado (v13,
      // 01/09) e provado ao vivo: sem ele viria ~9h (entry_1 direto até agora,
      // almoço incluso — era o valor real medido antes do deploy).
      expect(att.hours_worked).toBeGreaterThan(7.9);
      expect(att.hours_worked).toBeLessThan(8.1);
    });
  },
);
