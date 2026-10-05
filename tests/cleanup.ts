/**
 * Cleanup utilities for Playwright E2E tests.
 *
 * These helpers connect directly to Supabase (anon key, no RLS on this DB)
 * to remove any rows that tests might have left behind.
 *
 * Strategy: every cleanup helper is SCOPED BY OWNER — it only removes rows that
 * belong to test entities (05/10/2026: nunca por horário/data — ver limparLinhasDeTeste):
 *   - employees with name starting with `PW Test ` (test marker)
 *   - companies with display_name starting with `PW Test ` (and their employees).
 *
 * The whole suite should ideally run against a separate test DB. Until then,
 * these cleanups keep the production DB free of dirty test data.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Marcadores explícitos usados pelos testes (devem bater com os strings/nomes
// usados nos specs).
export const TEST_BONUS_REMOVAL_OBSERVATION = 'Limpeza automatizada dos testes Playwright';
export const TEST_EMPLOYEE_NAME_PREFIX = 'PW Test ';


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

let _client: SupabaseClient | null = null;
let _usingServiceRole = false;

/**
 * Sub-fase 13.0: preferimos SUPABASE_SERVICE_ROLE_KEY pra bypassar RLS
 * (post-Fase 11 todas as tabelas core têm RLS ativo). Fallback pra
 * VITE_SUPABASE_ANON_KEY mantém compat com setups antigos — mas specs
 * que validam isolamento direto (25-multi-company-isolation,
 * 26-multi-company-ui-isolation teste 6) vão retornar resultados vazios
 * sem service_role, porque anon não passa nas policies.
 */
export function getClient(): SupabaseClient {
  if (_client) return _client;
  const env = { ...readDotEnv(), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  _usingServiceRole = Boolean(serviceKey);

  if (!url || !key) {
    throw new Error(
      'Cleanup: VITE_SUPABASE_URL ausente ou nenhuma key disponível ' +
      '(esperado SUPABASE_SERVICE_ROLE_KEY ou VITE_SUPABASE_ANON_KEY no .env).',
    );
  }
  if (!serviceKey) {
     
    console.warn(
      '[cleanup.ts] SUPABASE_SERVICE_ROLE_KEY ausente — usando ANON_KEY como fallback. ' +
      'Specs que validam isolamento RLS direto (25/26-test6) podem falhar com resultados vazios. ' +
      'Adicione SUPABASE_SERVICE_ROLE_KEY ao .env (Supabase Dashboard → Settings → API).',
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Indica se o cliente atual usa service_role (true) ou anon key (false). */
export function isUsingServiceRole(): boolean {
  return _usingServiceRole;
}

/**
 * Garante um funcionário de TESTE (prefixo PW Test) na empresa cuja cidade/nome
 * contém `companyMatch`. Retorna o id. Idempotente: reusa se já existir pelo CPF.
 * (2026-07-19 — modernização da bateria: specs criam a própria massa.)
 */
export async function ensureTestEmployee(
  name: string,
  cpf: string,
  companyMatch = 'caratinga',
): Promise<string> {
  const supabase = getClient();
  const { data: comps, error: cErr } = await supabase
    .from('companies')
    .select('id, display_name, legal_name, city')
    .limit(100);
  if (cErr) throw cErr;
  const comp = (comps || []).find((c: Record<string, unknown>) =>
    [c.display_name, c.legal_name, c.city]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(companyMatch.toLowerCase())),
  );
  if (!comp) throw new Error(`ensureTestEmployee: empresa "${companyMatch}" não encontrada`);

  const { data: existing, error: eErr } = await supabase
    .from('employees')
    .select('id')
    .eq('cpf', cpf)
    .maybeSingle();
  if (eErr) throw eErr;
  if (existing) return (existing as { id: string }).id;

  const { data, error } = await supabase
    .from('employees')
    .insert([{ name, cpf, company_id: (comp as { id: string }).id }])
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Apaga o ponto (attendance) de um funcionário — todo, ou só de uma data. */
export async function deleteAttendanceForEmployee(employeeId: string, date?: string): Promise<void> {
  const supabase = getClient();
  let q = supabase.from('attendance').delete().eq('employee_id', employeeId);
  if (date) q = q.eq('date', date);
  const { error } = await q;
  if (error) throw error;
}

/**
 * Remove funcionários criados por testes (prefixo `PW Test `).
 * Antes de apagar, também remove qualquer attendance/payment vinculado —
 * se houver FK sem cascade, a deleção do employee falharia.
 */
export async function deleteTestEmployees(): Promise<number> {
  const supabase = getClient();
  const { data: emps, error: selErr } = await supabase
    .from('employees')
    .select('id')
    .like('name', `${TEST_EMPLOYEE_NAME_PREFIX}%`);
  if (selErr) throw selErr;
  const ids = (emps || []).map(e => e.id);
  if (ids.length === 0) return 0;

  await supabase.from('attendance').delete().in('employee_id', ids);
  await supabase.from('payments').delete().in('employee_id', ids);
  await supabase.from('bonus_removals').delete().in('employee_id', ids);
  await supabase.from('geo_fraud_attempts').delete().in('employee_id', ids);
  await supabase.from('bonus_blocks').delete().in('employee_id', ids);

  const { error: delErr } = await supabase.from('employees').delete().in('id', ids);
  if (delErr) throw delErr;
  return ids.length;
}

/**
 * Lê TODOS os ids de uma consulta, em páginas (sem limite silencioso de linhas).
 */
async function lerIds(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(`Limpeza: leitura falhou — ${error.message}`);
    const linhas = (data ?? []) as { id: string }[];
    ids.push(...linhas.map((l) => l.id));
    if (linhas.length < 1000) return ids;
  }
}

/** Fatias de até 100 ids (lista grande num `.in()` estoura o tamanho da URL). */
function emFatias<T>(lista: T[], tamanho = 100): T[][] {
  const fatias: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) fatias.push(lista.slice(i, i + tamanho));
  return fatias;
}

/**
 * LIMPEZA SÓ DO QUE É DE TESTE (05/10/2026).
 *
 * 🔴 Antes (`cleanupTodaySince`) a limpeza apagava POR HORÁRIO: tudo criado/atualizado desde o
 * início da rodada, de TODAS as empresas. Rodando no CI a cada push no main, ela apagava recusas
 * de GPS e bloqueios de bônus de quem batia ponto durante a rodada, ZERAVA o bônus de pagamento
 * real corrigido no intervalo e apagava ponto/erro/bônus de data antiga lançado nele. A varredura
 * dos 118 specs (05/10) mostrou que tudo o que os testes gravam nessas 7 tabelas tem DONO de teste.
 *
 * Agora: só linhas de funcionário de teste (nome 'PW Test …' ou de empresa de teste) ou de empresa
 * de teste (display_name 'PW Test …'). Nunca por data, nunca por horário, nunca UPDATE em
 * pagamento. Pega também a sobra de rodada MORTA (CI cancelado), que a janela nunca pegava.
 * `bonuses` (sem funcionário) só sai de empresa de teste — a linha que um teste cria na
 * Caratinga é igual à real, e quem a desfaz é o próprio spec.
 */
export async function limparLinhasDeTeste(): Promise<Record<string, number>> {
  // getClient() ANTES da conferência: é ele que descobre qual chave está em uso.
  const supabase = getClient();
  if (!isUsingServiceRole()) {
    // Com a chave anon a RLS faz cada DELETE apagar 0 linhas EM SILÊNCIO.
    throw new Error('Limpeza: precisa da SUPABASE_SERVICE_ROLE_KEY no .env — com a chave anon nada seria apagado.');
  }

  const { data: empresas, error: erroEmpresas } = await supabase.from('companies').select('id, display_name')
    .like('display_name', `${TEST_EMPLOYEE_NAME_PREFIX}%`);
  if (erroEmpresas) throw new Error(`Limpeza: leitura das empresas falhou — ${erroEmpresas.message}`);
  // Confere o prefixo de novo no JS (igual ao apagarEmpresaDeTeste): o LIKE trata '_' como curinga.
  const E = (empresas ?? [])
    .filter((c) => String(c.display_name).startsWith(TEST_EMPLOYEE_NAME_PREFIX))
    .map((c) => String(c.id));

  const porNome = await lerIds((de, ate) => supabase.from('employees').select('id')
    .like('name', `${TEST_EMPLOYEE_NAME_PREFIX}%`).range(de, ate));
  const porEmpresa: string[] = [];
  for (const fatia of emFatias(E)) {
    porEmpresa.push(...await lerIds((de, ate) => supabase.from('employees').select('id').in('company_id', fatia).range(de, ate)));
  }
  const F = [...new Set([...porNome, ...porEmpresa])];

  const apagadas: Record<string, number> = {};
  const falhas: string[] = [];
  const apagar = async (tabela: string, coluna: 'employee_id' | 'company_id', ids: string[]) => {
    for (const fatia of emFatias(ids)) {
      const { data, error } = await supabase.from(tabela).delete().in(coluna, fatia).select('id');
      if (error) { falhas.push(`${tabela}.${coluna}: ${error.message}`); continue; }
      apagadas[tabela] = (apagadas[tabela] ?? 0) + (data ?? []).length;
    }
  };
  for (const tabela of ['attendance', 'payments', 'bonus_removals', 'error_records', 'geo_fraud_attempts', 'bonus_blocks']) {
    await apagar(tabela, 'employee_id', F);
    await apagar(tabela, 'company_id', E);
  }
  await apagar('bonuses', 'company_id', E);

  // Alarme (não apaga): texto de teste gravado em gente REAL = algum spec mexeu em dado real.
  const { data: remocoes } = await supabase.from('bonus_removals').select('employee_id')
    .eq('observation', TEST_BONUS_REMOVAL_OBSERVATION);
  const { data: erros } = await supabase.from('error_records').select('employee_id').ilike('observations', 'PW Test%');
  const deTeste = new Set(F);
  const emGenteReal = [...(remocoes ?? []), ...(erros ?? [])].filter((l) => !deTeste.has(String(l.employee_id)));
  if (emGenteReal.length > 0) {
    console.warn(`[cleanup] ⚠️ ${emGenteReal.length} linha(s) com texto de TESTE em funcionário REAL (bonus_removals/error_records) — algum spec mexeu em dado real; nada foi apagado.`);
  }

  if (falhas.length > 0) throw new Error(`Limpeza: ${falhas.length} exclusão(ões) falharam — ${falhas.join(' | ')}`);
  return apagadas;
}

/**
 * Faz limpeza completa: testes removidos + remove dados de hoje criados
 * a partir de `sinceIso`. Use em globalTeardown e em afterAll por spec.
 */
/**
 * Varre artefatos de teste do módulo Pagamentos Driver (prefixo 'PW Test').
 * (2026-07-19 — antes a limpeza global não conhecia as tabelas driverpay_* e
 * plataformas/drivers de teste sobravam como colunas na grade real.)
 * Ordem respeita as FKs: períodos primeiro (cascade limpa payments/packages),
 * depois vínculos, e por fim drivers/plataformas/grupos.
 */
export async function deleteDriverpayTestArtifacts(): Promise<void> {
  const supabase = getClient();
  const like = `${TEST_EMPLOYEE_NAME_PREFIX}%`;

  await supabase.from('driverpay_periods').delete().like('label', like);

  const { data: drivers } = await supabase.from('driverpay_drivers').select('id').like('name', like);
  const { data: plats } = await supabase.from('driverpay_platforms').select('id').like('name', like);
  const driverIds = (drivers || []).map((d: { id: string }) => d.id);
  const platIds = (plats || []).map((p: { id: string }) => p.id);

  if (driverIds.length > 0) {
    await supabase.from('driverpay_platform_rates').delete().in('driver_id', driverIds);
    await supabase.from('driverpay_group_members').delete().in('driver_id', driverIds);
    // Espelho do app (04/08): os prints e os ARQUIVOS que eles deixaram no bucket.
    // Apagar a linha sem apagar o objeto deixaria imagem órfã no storage pra sempre.
    const { data: proofs } = await supabase
      .from('driverpay_delivery_proofs').select('file_path').in('driver_id', driverIds);
    const paths = (proofs || []).map((p: { file_path: string }) => p.file_path).filter(Boolean);
    if (paths.length > 0) await supabase.storage.from('driverpay-delivery-proofs').remove(paths);
    await supabase.from('driverpay_delivery_proofs').delete().in('driver_id', driverIds);
    await supabase.from('driverpay_driver_auth').delete().in('driver_id', driverIds);
    await supabase.from('driverpay_payments').delete().in('driver_id', driverIds);
    await supabase.from('driverpay_drivers').delete().in('id', driverIds);
  }
  if (platIds.length > 0) {
    await supabase.from('driverpay_platform_rates').delete().in('platform_id', platIds);
    await supabase.from('driverpay_platforms').delete().in('id', platIds);
  }
  await supabase.from('driverpay_groups').delete().like('name', like);
}

export async function cleanupAllTestArtifacts(): Promise<Record<string, number>> {
  // Linhas das 7 tabelas ANTES das fichas: com a ficha apagada, a linha dela não seria mais
  // achada como "de teste".
  const apagadas = await limparLinhasDeTeste();
  await deleteTestEmployees();
  await deleteDriverpayTestArtifacts();
  return apagadas;
}
