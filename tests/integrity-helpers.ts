/**
 * Helpers compartilhados para a suíte de testes de integridade (15-24).
 *
 * Convenções:
 *  - Todos os funcionários criados por testes começam com `PW Test ` (limpo
 *    automaticamente pelo `deleteTestEmployees` global)
 *  - Datas dos testes financeiros usam SAFE_DATE = '2030-06-15' — futura,
 *    sem attendance real, sem colisão com cleanup.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

export const SAFE_DATE = '2030-06-15';
export const SAFE_DATE_2 = '2030-06-16';
export const SAFE_DATE_3 = '2030-06-17';

let _seq = 0;
function uniqueCpf(): string {
  _seq += 1;
  const stamp = Date.now().toString().slice(-7);
  return `9${stamp}${String(_seq).padStart(3, '0')}`;
}

export interface CreateEmployeeOpts {
  name: string;
  withPix?: boolean;
  /** Só os dois que o sistema entende de verdade (ver o default abaixo). */
  employmentType?: 'Diarista' | 'Carteira Assinada';
  pin?: string;
  /**
   * 04/09/2026: `require_facial_clock` (trava dura de rosto+geo em toda
   * marcação) está ligada em produção — sem isto, o funcionário de teste cai
   * na tela de cadastrar rosto (sem câmera real em CI) e nunca chega no
   * dashboard. Passar `true` só em testes que precisam logar até o painel de
   * ponto; os demais ficam como sempre (sem rosto).
   */
  faceRegistered?: boolean;
  /** function_role — a triagem decide quem entra no desconto pela função (15/09/2026). */
  functionRole?: string;
  /** Empresa do funcionário (30/09/2026) — ex.: uma empresa de teste (`criarEmpresaDeTeste`). */
  companyId?: string;
}

/** Descriptor de 128 números — não precisa ser um rosto de verdade, só passar
 *  na checagem de formato (`!emp.face_registered` fica false). */
const DUMMY_FACE_DESCRIPTOR = Array(128).fill(0);

export async function createTestEmployee(opts: CreateEmployeeOpts): Promise<string> {
  const s = getClient();
  const cpf = uniqueCpf();
  const row: Record<string, unknown> = {
    name: opts.name,
    cpf,
    // 11/09/2026: era 'CLT', valor que o CHECK do banco aceita mas o sistema
    // NÃO entende (os filtros e as gavetas só conhecem 'Diarista' e 'Carteira
    // Assinada'). Fixtures assim poluíam a contagem de vínculo em produção.
    employment_type: opts.employmentType ?? 'Diarista',
    created_by: '9999',
  };
  if (opts.withPix !== false) {
    row.pix_key = `${cpf}@pwtest.com`;
    row.pix_type = 'Email';
  }
  if (opts.pin) {
    row.pin = opts.pin;
    row.pin_configured = true;
  }
  if (opts.functionRole) {
    row.function_role = opts.functionRole;
  }
  if (opts.faceRegistered) {
    row.face_registered = true;
    row.face_descriptor = DUMMY_FACE_DESCRIPTOR;
  }
  if (opts.companyId) {
    row.company_id = opts.companyId;
  }
  const { data, error } = await s.from('employees').insert([row]).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function insertPaymentRow(
  employeeId: string,
  date: string,
  fields: {
    daily_rate?: number;
    bonus?: number;
    total?: number;
    bonus_b?: number;
    bonus_c1?: number;
    bonus_c2?: number;
  }
): Promise<void> {
  const s = getClient();
  const dailyRate = fields.daily_rate ?? 0;
  const bonusB = fields.bonus_b ?? 0;
  const bonusC1 = fields.bonus_c1 ?? 0;
  const bonusC2 = fields.bonus_c2 ?? 0;
  const bonus = fields.bonus ?? bonusB + bonusC1 + bonusC2;
  const total = fields.total ?? dailyRate + bonus;

  const { error } = await s.from('payments').insert([{
    employee_id: employeeId,
    date,
    daily_rate: dailyRate,
    bonus,
    total,
    bonus_b: bonusB,
    bonus_c1: bonusC1,
    bonus_c2: bonusC2,
    created_by: '9999',
  }]);
  if (error) throw error;
}

export async function insertErrorValue(employeeId: string, date: string, value: number): Promise<void> {
  const s = getClient();
  const { error } = await s.from('error_records').insert([{
    employee_id: employeeId,
    date,
    error_count: 0,
    error_type: 'value',
    error_value: value,
    observations: 'PW Test integrity',
    created_by: '9999',
  }]);
  if (error) throw error;
}

export async function insertErrorQuantity(
  employeeId: string,
  date: string,
  count: number
): Promise<void> {
  const s = getClient();
  const { error } = await s.from('error_records').insert([{
    employee_id: employeeId,
    date,
    error_count: count,
    error_type: 'quantity',
    error_value: 0,
    observations: 'PW Test integrity',
    created_by: '9999',
  }]);
  if (error) throw error;
}

export async function insertAttendance(
  employeeId: string,
  date: string,
  fields: Partial<{
    status: 'present' | 'absent';
    entry_time: string;
    exit_time_full: string;
    hours_worked: number;
    night_hours: number;
    night_additional: number;
  }> = {}
): Promise<string> {
  const s = getClient();
  const row: Record<string, unknown> = {
    employee_id: employeeId,
    date,
    status: fields.status ?? 'present',
    marked_by: '9999',
  };
  if (fields.entry_time !== undefined) row.entry_time = fields.entry_time;
  if (fields.exit_time_full !== undefined) row.exit_time_full = fields.exit_time_full;
  if (fields.hours_worked !== undefined) row.hours_worked = fields.hours_worked;
  if (fields.night_hours !== undefined) row.night_hours = fields.night_hours;
  if (fields.night_additional !== undefined) row.night_additional = fields.night_additional;

  const { data, error } = await s.from('attendance').insert([row]).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function insertTriageDistribution(opts: {
  employeeId: string;
  startDate: string;
  endDate: string;
  errorsShare?: number;
  valueDeducted: number;
}): Promise<string> {
  const s = getClient();
  const { data: dist, error: distErr } = await s
    .from('triage_error_distributions')
    .insert([{
      period_start: opts.startDate,
      period_end: opts.endDate,
      total_errors: opts.errorsShare ?? 0,
      value_per_error: 0,
      total_employees: 1,
      total_deducted: opts.valueDeducted,
      distributed_by: '9999',
    }])
    .select('id')
    .single();
  if (distErr) throw distErr;
  const { error: rowErr } = await s.from('triage_distribution_employees').insert([{
    distribution_id: (dist as { id: string }).id,
    employee_id: opts.employeeId,
    errors_share: opts.errorsShare ?? 0,
    value_deducted: opts.valueDeducted,
  }]);
  if (rowErr) throw rowErr;
  return (dist as { id: string }).id;
}

export async function upsertTriageError(
  date: string,
  fields: { triage_type: 'quantity' | 'value'; error_count?: number; direct_value?: number }
): Promise<void> {
  const s = getClient();
  await s.from('triage_errors').delete().eq('date', date);
  const { error } = await s.from('triage_errors').insert([{
    date,
    triage_type: fields.triage_type,
    error_count: fields.error_count ?? 0,
    direct_value: fields.direct_value ?? 0,
    observations: 'PW Test triagem',
    created_by: '9999',
  }]);
  if (error) throw error;
}

/**
 * Limpa todos os artefatos de teste por prefixo de nome + dates seguros.
 * Idempotente — chame em beforeEach e afterAll.
 */
export async function cleanupByPrefix(prefix: string, dates: string[] = []): Promise<void> {
  const s: SupabaseClient = getClient();

  const { data: emps } = await s.from('employees').select('id').like('name', `${prefix}%`);
  const empIds = (emps || []).map((e: { id: string }) => e.id);

  // Triage distributions cobrindo dates seguros
  let distIds: string[] = [];
  if (dates.length > 0) {
    const { data } = await s
      .from('triage_error_distributions')
      .select('id')
      .in('period_start', dates);
    distIds = (data || []).map((d: { id: string }) => d.id);
  }

  if (distIds.length > 0) {
    await s.from('triage_distribution_employees').delete().in('distribution_id', distIds);
  }
  if (empIds.length > 0) {
    await s.from('triage_distribution_employees').delete().in('employee_id', empIds);
    await s.from('error_records').delete().in('employee_id', empIds);
    await s.from('attendance').delete().in('employee_id', empIds);
    await s.from('payments').delete().in('employee_id', empIds);
    await s.from('bonus_removals').delete().in('employee_id', empIds);
    await s.from('bonus_blocks').delete().in('employee_id', empIds);
    await s.from('geo_fraud_attempts').delete().in('employee_id', empIds);
  }
  if (distIds.length > 0) {
    await s.from('triage_error_distributions').delete().in('id', distIds);
  }
  if (empIds.length > 0) {
    await s.from('employees').delete().in('id', empIds);
  }
  if (dates.length > 0) {
    await s.from('triage_errors').delete().in('date', dates);
  }
}

/**
 * EMPRESA DE TESTE (30/09/2026, pedido do Victor: "sim pode com cuidado").
 *
 * Por que existe: testes que batem ponto em Caratinga ficaram presos a configurações REAIS dela
 * — a facial obrigatória e a câmera primeiro fazem o servidor recusar gente sem rosto, e o
 * `tests/08` chegava a TROCAR a cerca real de Caratinga durante a rodada. Numa empresa nova, só
 * do teste, cada spec escolhe a configuração que precisa sem encostar em nada real.
 *
 * O nome TEM que começar com `PW Test ` — é a marca que o `apagarEmpresaDeTeste` exige antes de
 * apagar qualquer coisa (uma empresa real nunca é apagada por engano).
 */
export async function criarEmpresaDeTeste(
  nome: string,
  config: {
    lat: number;
    lng: number;
    raio?: number;
    facialObrigatoria?: boolean;
    abreNaCamera?: boolean;
  },
): Promise<string> {
  if (!nome.startsWith(TEST_EMPLOYEE_NAME_PREFIX)) {
    throw new Error(`Empresa de teste precisa começar com "${TEST_EMPLOYEE_NAME_PREFIX}": ${nome}`);
  }
  const s = getClient();
  const { data, error } = await s.from('companies').insert([{
    legal_name: `${nome} LTDA`,
    cnpj: `9${Date.now().toString().slice(-7)}${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`,
    display_name: nome,
    city: 'Teste, MG',
    default_geo_lat: config.lat,
    default_geo_lng: config.lng,
    default_geo_radius: config.raio ?? 150,
    default_marking_count: 2,
    require_facial_clock: config.facialObrigatoria ?? false,
    face_identify_default: config.abreNaCamera ?? false,
  }]).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Apaga a empresa de teste e tudo o que os testes criam nela. Recusa (lança) se a empresa não
 * tiver a marca `PW Test ` no nome. As tabelas ligadas à empresa têm chave estrangeira sem
 * cascata — se sobrar alguma linha que esta lista não conhece, apagar a empresa FALHA e o erro
 * sobe (nada fica órfão em silêncio).
 */
export async function apagarEmpresaDeTeste(companyId: string): Promise<void> {
  const s = getClient();
  const { data: empresa, error: erroEmpresa } = await s.from('companies').select('display_name').eq('id', companyId).maybeSingle();
  if (erroEmpresa) throw erroEmpresa;
  if (!empresa) return; // já apagada
  const nome = (empresa as { display_name: string }).display_name;
  if (!nome.startsWith(TEST_EMPLOYEE_NAME_PREFIX)) {
    throw new Error(`Recusado: "${nome}" não é empresa de teste (nome sem "${TEST_EMPLOYEE_NAME_PREFIX}")`);
  }

  const { data: emps } = await s.from('employees').select('id').eq('company_id', companyId);
  const empIds = (emps || []).map((e: { id: string }) => e.id);
  if (empIds.length > 0) {
    for (const tabela of ['attendance', 'payments', 'bonus_blocks', 'bonus_removals', 'bonuses', 'geo_fraud_attempts', 'face_auth_attempts', 'error_records']) {
      await s.from(tabela).delete().in('employee_id', empIds);
    }
    await s.from('employees').delete().in('id', empIds);
  }
  for (const tabela of [
    'attendance', 'payments', 'bonus_blocks', 'bonus_removals', 'bonuses', 'geo_fraud_attempts',
    'face_auth_attempts', 'error_records', 'error_logs', 'payment_periods', 'payment_period_config',
    'geolocation_config', 'face_recognition_config',
  ]) {
    await s.from(tabela).delete().eq('company_id', companyId);
  }
  const { error } = await s.from('companies').delete().eq('id', companyId);
  if (error) throw new Error(`Não consegui apagar a empresa de teste "${nome}": ${error.message}`);
}

export { TEST_EMPLOYEE_NAME_PREFIX };
