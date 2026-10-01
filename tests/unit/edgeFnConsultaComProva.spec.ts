import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ERROS, PONTO DO DIA E HISTÓRICO SÓ COM A PROVA DA PRÓPRIA PESSOA — contra a edge function
 * PUBLICADA (30/09/2026, roadmap item 5).
 *
 * Antes, `today-attendance`, `attendance-history`, `employee-error-periods` e
 * `employee-errors-by-period` respondiam só com o id — e `lookup-employee` entrega o id de
 * qualquer um a partir do CPF. Com o CPF de alguém dava pra ver os erros e o ponto (com
 * localização) dele. Agora a prova é o PIN dela ou o COMPROVANTE que `identify-face` devolve
 * quando reconhece o rosto (o caminho do tablet, onde ninguém digita PIN).
 *
 * O que precisa ser verdade:
 *   - PIN certo → abre as 4; PIN errado → 401 nas 4;
 *   - rosto reconhecido → `identify-face` devolve um comprovante que abre o ponto DELA;
 *   - o comprovante da Maria NÃO abre o ponto do João; adulterado → 401;
 *   - SEM prova nenhuma: no PASSO 1 da troca ainda passa (telas antigas abertas — ver
 *     EXIGIR_PROVA_DO_FUNCIONARIO na edge fn); no PASSO 2 vira 401. Este teste acompanha o passo.
 *
 * Empresa fixture própria (sem trava de tablet), limpa no fim. Nada de Caratinga/Ponte Nova.
 * Roda com: npx vitest run edgeFnConsultaComProva
 */

/** Passo da troca em produção. Mudar junto com EXIGIR_PROVA_DO_FUNCIONARIO na edge fn. */
const EXIGINDO_PROVA = false;

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
const PUBLIC_URL = ENV.EMPLOYEE_PUBLIC_FN_URL || `${SUPABASE_URL}/functions/v1/employee-public-api`;
const HAS_SERVICE_ROLE = Boolean(SERVICE_KEY && SUPABASE_URL && ANON_KEY);

// Descriptors determinísticos (a edge fn só faz a conta de distância).
const ROSTO_MARIA = Array.from({ length: 128 }, (_, i) => i / 128);
const ROSTO_JOAO = ROSTO_MARIA.map((x) => x + 1);
const MARIA_AGORA = ROSTO_MARIA.map((x) => x + 0.001);

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

async function del(table: string, query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { ...headersService, Prefer: 'return=minimal' },
  });
  if (!res.ok && res.status !== 404) throw new Error(`delete(${table}?${query}) ${res.status}: ${await res.text()}`);
}

async function post(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(PUBLIC_URL, {
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

describe.skipIf(!HAS_SERVICE_ROLE)('consulta do funcionário com prova — edge function publicada', { timeout: 90_000 }, () => {
  const stamp = Date.now();
  const PIN_MARIA = '4321';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  let empresa = '';
  let maria = '';
  let joao = '';
  let periodo = '';

  beforeAll(async () => {
    const c = await insert('companies', {
      legal_name: `PW Test Consulta ${stamp} LTDA`,
      cnpj: randomDigits(12),
      display_name: `PW Test Consulta ${stamp}`,
      city: 'Caratinga',
      default_geo_lat: -19.5,
      default_geo_lng: -42.6,
      default_geo_radius: 150,
    });
    empresa = String(c.id);
    maria = String((await insert('employees', {
      name: `PW Test Consulta Maria ${stamp}`, cpf: randomDigits(11), company_id: empresa,
      pin: PIN_MARIA, pin_configured: true, face_registered: true, face_descriptor: ROSTO_MARIA,
    })).id);
    joao = String((await insert('employees', {
      name: `PW Test Consulta Joao ${stamp}`, cpf: randomDigits(11), company_id: empresa,
      pin: '1111', pin_configured: true, face_registered: true, face_descriptor: ROSTO_JOAO,
    })).id);
    await insert('attendance', {
      employee_id: maria, company_id: empresa, date: today, status: 'present',
      entry_time: new Date().toISOString(),
    });
    periodo = String((await insert('payment_periods', {
      start_date: today, end_date: today, payment_date: today, label: 'PW Test', status: 'open',
      created_by: '9999', company_id: empresa,
    })).id);
  }, 60_000);

  afterAll(async () => {
    for (const id of [maria, joao].filter(Boolean)) await del('attendance', `employee_id=eq.${id}`).catch(() => {});
    if (empresa) {
      await del('face_auth_attempts', `company_id=eq.${empresa}`).catch(() => {});
      await del('payment_periods', `company_id=eq.${empresa}`).catch(() => {});
      await del('employees', `company_id=eq.${empresa}`).catch(() => {});
      await del('companies', `id=eq.${empresa}`).catch(() => {});
    }
  });

  /** As 4 ações protegidas, pra um funcionário, com a prova dada. */
  const asQuatro = (employeeId: string, prova: Record<string, unknown>) => Promise.all([
    post({ action: 'today-attendance', employeeId, companyId: empresa, ...prova }),
    post({ action: 'attendance-history', employeeId, companyId: empresa, days: 30, ...prova }),
    post({ action: 'employee-error-periods', employeeId, companyId: empresa, ...prova }),
    post({ action: 'employee-errors-by-period', employeeId, periodId: periodo, companyId: empresa, ...prova }),
  ]);

  it('PIN certo abre as 4 (e o ponto de hoje vem) · PIN errado: 401 nas 4', async () => {
    const certo = await asQuatro(maria, { pin: PIN_MARIA });
    expect(certo.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect((certo[0].body.attendance as { employee_id: string }).employee_id).toBe(maria);
    expect((certo[1].body.history as unknown[]).length).toBe(1);

    const errado = await asQuatro(maria, { pin: '0000' });
    expect(errado.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(errado[0].body.attendance).toBeUndefined();
  });

  it('rosto reconhecido devolve um comprovante que abre o ponto DELA — e não o do João', async () => {
    const r = await post({ action: 'identify-face', companyId: empresa, descriptorNow: MARIA_AGORA });
    expect(r.status).toBe(200);
    expect(r.body.matched).toBe(true);
    expect(r.body.employeeId).toBe(maria);
    const comprovanteFacial = String(r.body.comprovanteFacial ?? '');
    expect(comprovanteFacial).toMatch(/^v1\./);

    const dela = await asQuatro(maria, { comprovanteFacial });
    expect(dela.map((x) => x.status)).toEqual([200, 200, 200, 200]);

    const doJoao = await asQuatro(joao, { comprovanteFacial });
    expect(doJoao.map((x) => x.status)).toEqual([401, 401, 401, 401]);

    // Trocar o id dentro do papel quebra a assinatura.
    const partes = comprovanteFacial.split('.');
    partes[1] = joao;
    const adulterado = await asQuatro(joao, { comprovanteFacial: partes.join('.') });
    expect(adulterado.map((x) => x.status)).toEqual([401, 401, 401, 401]);
  });

  it(`sem prova nenhuma: ${EXIGINDO_PROVA ? '401 (passo 2)' : 'ainda passa (passo 1 — telas antigas abertas)'}`, async () => {
    const semProva = await asQuatro(maria, {});
    const esperado = EXIGINDO_PROVA ? 401 : 200;
    expect(semProva.map((r) => r.status)).toEqual([esperado, esperado, esperado, esperado]);
  });
});
