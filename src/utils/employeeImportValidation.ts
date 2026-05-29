/**
 * Validação de import de funcionários (combo H — sub-fase 2.20).
 *
 * Lógica 100% pura — sem React, sem supabase, sem side effects. Recebe row
 * bruta do Excel e contexto (CPFs existentes, defaults da empresa) e retorna
 * `ImportRow` com `parsed`, `errors` e `warnings`.
 *
 * Convenções:
 * - ERROR  bloqueia importação (linha não pode entrar no banco)
 * - WARNING não bloqueia (linha entra, mas com aviso pra revisão humana)
 *
 * Enums espelham os CHECK constraints REAIS do Postgres:
 * - employment_type: 'CLT' | 'PJ' | 'Diarista' | 'Carteira Assinada' (case-sensitive)
 * - pix_type:        'CPF' | 'Email' | 'Telefone' | 'Aleatória'      (case-sensitive, COM acento)
 * - marking_count:   2 | 4
 *
 * Algoritmos:
 * - CPF: reusa `validateCPF` de ./validation (Mod 11 padrão Receita)
 * - PIS: Mod 11 com pesos [3,2,9,8,7,6,5,4,3,2]; resto<2 → DV=0; senão DV=11-resto
 */

import { validateCPF } from './validation';

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface ImportFieldError {
  field: string;
  code: string;
  message: string;
}

export interface ImportFieldWarning {
  field: string;
  code: string;
  message: string;
}

export interface ParsedEmployee {
  name: string;
  cpf: string;
  pix_key?: string;
  pix_type?: 'CPF' | 'Email' | 'Telefone' | 'Aleatória';
  employment_type?: 'CLT' | 'PJ' | 'Diarista' | 'Carteira Assinada';
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  pin?: string;
  // Etapa 2 — campos novos
  function_role?: string;
  badge_number?: string;
  pis?: string;
  schedule_type?: string;
  expected_schedule?: number[];
  marking_count?: 2 | 4;
  hire_date?: string;
  contract_type?: string;
}

export interface ImportRow {
  rowNumber: number;
  rawData: Record<string, unknown>;
  parsed: ParsedEmployee;
  errors: ImportFieldError[];
  warnings: ImportFieldWarning[];
}

export interface ValidationContext {
  existingCpfsInCompany: Set<string>;
  existingCpfsOtherCompanies: Map<string, string>;
  companyDefaults: {
    default_marking_count: number;
    default_schedule: number[] | null;
  };
  cpfsInThisFile: Set<string>;
}

// ─── Constantes ────────────────────────────────────────────────────────────

const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const COMMON_SCHEDULE_TYPES = new Set([
  'Normal', '12x36', 'Plantão', 'Outros',
]);

const COMMON_CONTRACT_TYPES = new Set([
  'CLT', 'PJ', 'Estagiário', 'Temporário',
]);

const JORNADA_DAY_FIELDS = [
  'jornada_dom', 'jornada_seg', 'jornada_ter', 'jornada_qua',
  'jornada_qui', 'jornada_sex', 'jornada_sab',
] as const;

// ─── Helpers públicos (puros, testáveis) ───────────────────────────────────

export function normalizeCPF(input: string): string {
  return (input || '').replace(/\D/g, '');
}

/**
 * Valida PIS/PASEP via Mod 11 com pesos oficiais [3,2,9,8,7,6,5,4,3,2].
 * Rejeita 11 dígitos repetidos (ex: "00000000000") como inválido.
 */
export function validatePIS(pis: string): boolean {
  const digits = (pis || '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]!, 10) * weights[i]!;
  }
  const remainder = sum % 11;
  const expectedDV = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(digits[10]!, 10) === expectedDV;
}

/**
 * Aceita: Date, número (Excel serial), 'YYYY-MM-DD' ou 'DD/MM/YYYY'.
 * Retorna 'YYYY-MM-DD' ou null se inválido.
 */
export function parseDate(input: string | Date | number | null | undefined): string | null {
  if (input == null || input === '') return null;

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return input.toISOString().slice(0, 10);
  }

  if (typeof input === 'number') {
    // Excel armazena datas como serial number (dias desde 1899-12-30).
    // Aceita o bug do leap year de 1900 da convenção Excel (suficiente pra datas modernas).
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + input * 86_400_000;
    const date = new Date(ms);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  const s = String(input).trim();
  if (!s) return null;

  // YYYY-MM-DD (com validação real de calendário)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const yi = +y!, mi = +m!, di = +d!;
    const date = new Date(Date.UTC(yi, mi - 1, di));
    if (date.getUTCFullYear() === yi && date.getUTCMonth() === mi - 1 && date.getUTCDate() === di) {
      return s;
    }
    return null;
  }

  // DD/MM/YYYY (com validação real)
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const yi = +y!, mi = +m!, di = +d!;
    const date = new Date(Date.UTC(yi, mi - 1, di));
    if (date.getUTCFullYear() === yi && date.getUTCMonth() === mi - 1 && date.getUTCDate() === di) {
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  return null;
}

/**
 * Match estrito com os 4 valores do CHECK constraint do Postgres.
 * Aceita case insensitive na entrada e capitaliza pra forma canônica.
 */
export function normalizeEmploymentType(
  input: string,
): 'CLT' | 'PJ' | 'Diarista' | 'Carteira Assinada' | null {
  if (!input) return null;
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'CLT') return 'CLT';
  if (upper === 'PJ') return 'PJ';
  const lower = trimmed.toLowerCase();
  if (lower === 'diarista') return 'Diarista';
  if (lower === 'carteira assinada') return 'Carteira Assinada';
  return null;
}

/**
 * Match com auto-correção pra 'aleatoria' sem acento → 'Aleatória'.
 * Outras formas case insensitive viram a forma canônica.
 */
export function normalizePixType(
  input: string,
): 'CPF' | 'Email' | 'Telefone' | 'Aleatória' | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.toUpperCase() === 'CPF') return 'CPF';
  const lower = trimmed.toLowerCase();
  if (lower === 'email') return 'Email';
  if (lower === 'telefone') return 'Telefone';
  if (lower === 'aleatoria' || lower === 'aleatória') return 'Aleatória';
  return null;
}

export function normalizeUF(input: string): string | null {
  if (!input) return null;
  const upper = input.trim().toUpperCase();
  return VALID_UFS.has(upper) ? upper : null;
}

// ─── Helpers internos ──────────────────────────────────────────────────────

/**
 * Lê um campo do raw aceitando múltiplas variações de nome de coluna.
 * Caso comum: usuário digitou cabeçalho diferente do template.
 * Retorna string trim ou '' se inexistente/null/undefined.
 */
function getField(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = raw[key];
    if (v != null && v !== '') return String(v).trim();
    // Tenta variação case-insensitive contra todas as chaves do raw
    const found = Object.keys(raw).find(
      (k) => k.toLowerCase().trim() === key.toLowerCase(),
    );
    if (found) {
      const fv = raw[found];
      if (fv != null && fv !== '') return String(fv).trim();
    }
  }
  return '';
}

/**
 * Lê um campo numérico do raw e retorna number ou undefined.
 * Aceita strings ('480') e números (480).
 */
function getNumberField(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  const s = getField(raw, ...keys);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// ─── Função principal ──────────────────────────────────────────────────────

export function validateImportRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  context: ValidationContext,
): ImportRow {
  const errors: ImportFieldError[] = [];
  const warnings: ImportFieldWarning[] = [];
  const parsed: ParsedEmployee = { name: '', cpf: '' };

  // ─── Nome (obrigatório) ─────────────────────────────────────────────────
  const name = getField(raw, 'nome', 'Nome Completo', 'Nome');
  if (!name) {
    errors.push({ field: 'nome', code: 'name_empty', message: 'Nome é obrigatório' });
  } else if (name.length < 3) {
    errors.push({ field: 'nome', code: 'name_too_short', message: 'Nome deve ter pelo menos 3 caracteres' });
  } else {
    parsed.name = name;
  }

  // ─── CPF (obrigatório + algoritmo + duplicação) ─────────────────────────
  const cpfRaw = getField(raw, 'cpf', 'CPF');
  const cpf = normalizeCPF(cpfRaw);
  if (!cpfRaw) {
    // CPF é opcional: sem CPF, segue sem erro (parsed.cpf fica vazio → null no insert).
  } else if (cpf.length !== 11 || !validateCPF(cpf)) {
    errors.push({ field: 'cpf', code: 'cpf_invalid', message: `CPF inválido: ${cpfRaw}` });
  } else {
    parsed.cpf = cpf;
    if (context.cpfsInThisFile.has(cpf)) {
      errors.push({ field: 'cpf', code: 'cpf_duplicate_in_file', message: 'CPF duplicado dentro do arquivo' });
    } else if (context.existingCpfsInCompany.has(cpf)) {
      errors.push({ field: 'cpf', code: 'cpf_exists_in_company', message: 'CPF já cadastrado nesta empresa' });
    } else if (context.existingCpfsOtherCompanies.has(cpf)) {
      const other = context.existingCpfsOtherCompanies.get(cpf);
      warnings.push({
        field: 'cpf',
        code: 'cpf_exists_other_company',
        message: `CPF também cadastrado em "${other ?? 'outra empresa'}"`,
      });
    }
  }

  // ─── PIX ────────────────────────────────────────────────────────────────
  const pixKey = getField(raw, 'pix_chave', 'Chave PIX', 'Chave PIX (Opcional)');
  if (pixKey) parsed.pix_key = pixKey;

  const pixTypeRaw = getField(raw, 'pix_tipo', 'Tipo PIX', 'Tipo PIX (Opcional)');
  if (pixTypeRaw) {
    const norm = normalizePixType(pixTypeRaw);
    if (norm) {
      parsed.pix_type = norm;
    } else {
      warnings.push({
        field: 'pix_tipo',
        code: 'pix_type_invalid',
        message: `Tipo PIX desconhecido: "${pixTypeRaw}". Aceitos: CPF, Email, Telefone, Aleatória`,
      });
    }
  }

  // ─── Endereço ───────────────────────────────────────────────────────────
  const address = getField(raw, 'endereco', 'Endereço', 'Endereço (Opcional)');
  if (address) parsed.address = address;
  const neighborhood = getField(raw, 'bairro', 'Bairro', 'Bairro (Opcional)');
  if (neighborhood) parsed.neighborhood = neighborhood;
  const city = getField(raw, 'cidade', 'Cidade', 'Cidade (Opcional)');
  if (city) parsed.city = city;

  const stateRaw = getField(raw, 'estado', 'Estado', 'Estado (Opcional)', 'UF');
  if (stateRaw) {
    const uf = normalizeUF(stateRaw);
    if (uf) {
      parsed.state = uf;
    } else {
      errors.push({
        field: 'estado',
        code: 'state_invalid',
        message: `UF inválida: "${stateRaw}". Use sigla de 2 letras (MG, SP, RJ, etc.)`,
      });
    }
  }

  const cepRaw = getField(raw, 'cep', 'CEP', 'CEP (Opcional)');
  if (cepRaw) {
    const cepDigits = cepRaw.replace(/\D/g, '');
    if (cepDigits.length !== 8) {
      errors.push({ field: 'cep', code: 'cep_invalid', message: `CEP deve ter 8 dígitos (recebido: "${cepRaw}")` });
    } else {
      parsed.zip_code = cepDigits;
    }
  }

  // ─── PIN ────────────────────────────────────────────────────────────────
  const pinRaw = getField(raw, 'pin', 'PIN');
  if (pinRaw) {
    if (!/^\d{4}$/.test(pinRaw)) {
      errors.push({ field: 'pin', code: 'pin_invalid', message: 'PIN deve ter exatamente 4 dígitos' });
    } else {
      parsed.pin = pinRaw;
    }
  }

  // ─── Employment type ────────────────────────────────────────────────────
  const empTypeRaw = getField(raw, 'employment_type', 'tipo_funcionario', 'Tipo de Contrato (legacy)');
  if (empTypeRaw) {
    const norm = normalizeEmploymentType(empTypeRaw);
    if (norm) {
      parsed.employment_type = norm;
    } else {
      warnings.push({
        field: 'employment_type',
        code: 'employment_type_invalid',
        message: `Tipo desconhecido: "${empTypeRaw}". Default 'CLT' aplicado. Aceitos: CLT, PJ, Diarista, Carteira Assinada`,
      });
      parsed.employment_type = 'CLT';
    }
  }

  // ─── Campos novos da Etapa 2 ────────────────────────────────────────────

  // function_role
  const functionRole = getField(raw, 'funcao', 'função', 'function_role', 'Função');
  if (functionRole) {
    parsed.function_role = functionRole;
  } else {
    warnings.push({ field: 'funcao', code: 'function_empty', message: 'Função/cargo não preenchido' });
  }

  // badge_number
  const badge = getField(raw, 'cracha', 'crachá', 'badge_number', 'Crachá');
  if (badge) {
    parsed.badge_number = badge;
  } else {
    warnings.push({ field: 'cracha', code: 'badge_empty', message: 'Crachá não preenchido' });
  }

  // PIS
  const pisRaw = getField(raw, 'pis', 'PIS', 'PASEP', 'PIS/PASEP');
  if (pisRaw) {
    const pisDigits = pisRaw.replace(/\D/g, '');
    if (!validatePIS(pisDigits)) {
      errors.push({ field: 'pis', code: 'pis_invalid', message: `PIS inválido: ${pisRaw}` });
    } else {
      parsed.pis = pisDigits;
    }
  } else {
    warnings.push({
      field: 'pis',
      code: 'pis_empty',
      message: 'PIS não preenchido (necessário pra espelho de ponto)',
    });
  }

  // schedule_type
  const scheduleType = getField(raw, 'tipo_escala', 'schedule_type', 'Tipo de Escala', 'Escala');
  if (scheduleType) {
    parsed.schedule_type = scheduleType;
    if (!COMMON_SCHEDULE_TYPES.has(scheduleType)) {
      warnings.push({
        field: 'tipo_escala',
        code: 'schedule_type_unusual',
        message: `Tipo de escala não-padrão: "${scheduleType}". Comuns: Normal, 12x36, Plantão, Outros`,
      });
    }
  }

  // expected_schedule (7 colunas — uma por dia)
  const schedule: number[] = [0, 0, 0, 0, 0, 0, 0];
  let scheduleHasError = false;
  let scheduleHasAnyValue = false;
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const fieldName = JORNADA_DAY_FIELDS[dayIdx]!;
    const value = getNumberField(raw, fieldName);
    if (value === undefined) continue;
    scheduleHasAnyValue = true;
    if (!Number.isFinite(value) || value < 0 || value > 1440) {
      errors.push({
        field: fieldName,
        code: 'jornada_invalid',
        message: `${fieldName} deve estar entre 0 e 1440 minutos (recebido: ${value})`,
      });
      scheduleHasError = true;
    } else {
      schedule[dayIdx] = Math.floor(value);
    }
  }
  if (scheduleHasAnyValue && !scheduleHasError) {
    parsed.expected_schedule = schedule;
    // Aviso de qualidade: média de horas/dia muito longe de 8h CLT
    const avg = schedule.reduce((a, b) => a + b, 0) / 7;
    if (avg < 240 || avg > 600) {
      warnings.push({
        field: 'jornada',
        code: 'jornada_unusual',
        message: `Média da jornada (${avg.toFixed(0)}min/dia) está distante de 8h CLT (480min)`,
      });
    }
  }

  // marking_count
  const markingRaw = getNumberField(raw, 'marcacoes_por_dia', 'marking_count', 'Marcações por Dia');
  if (markingRaw === undefined) {
    // Aplica default da empresa se não veio
    const def = context.companyDefaults.default_marking_count;
    if (def === 2 || def === 4) parsed.marking_count = def;
  } else if (markingRaw !== 2 && markingRaw !== 4) {
    errors.push({
      field: 'marcacoes_por_dia',
      code: 'marking_count_invalid',
      message: `Marcações por dia deve ser 2 ou 4 (recebido: ${markingRaw})`,
    });
  } else {
    parsed.marking_count = markingRaw as 2 | 4;
  }

  // hire_date
  const hireDateRaw = raw['data_admissao'] ?? raw['hire_date'] ?? raw['Data de Admissão'] ?? '';
  if (hireDateRaw) {
    const parsedDate = parseDate(hireDateRaw as string | Date | number);
    if (!parsedDate) {
      errors.push({
        field: 'data_admissao',
        code: 'date_invalid',
        message: `Data de admissão inválida: "${String(hireDateRaw)}". Use DD/MM/AAAA ou AAAA-MM-DD.`,
      });
    } else {
      parsed.hire_date = parsedDate;
      const today = new Date().toISOString().slice(0, 10);
      if (parsedDate > today) {
        warnings.push({ field: 'data_admissao', code: 'date_future', message: 'Data de admissão é futura' });
      }
    }
  } else {
    warnings.push({ field: 'data_admissao', code: 'date_empty', message: 'Data de admissão não preenchida' });
  }

  // contract_type (sem CHECK no DB — aceita livre, mas avisa se desconhecido)
  const contractType = getField(raw, 'tipo_contrato', 'contract_type', 'Tipo de Contrato');
  if (contractType) {
    parsed.contract_type = contractType;
    if (!COMMON_CONTRACT_TYPES.has(contractType)) {
      warnings.push({
        field: 'tipo_contrato',
        code: 'contract_type_unusual',
        message: `Tipo de contrato não-padrão: "${contractType}". Comuns: CLT, PJ, Estagiário, Temporário`,
      });
    }
  }

  return {
    rowNumber,
    rawData: raw,
    parsed,
    errors,
    warnings,
  };
}
