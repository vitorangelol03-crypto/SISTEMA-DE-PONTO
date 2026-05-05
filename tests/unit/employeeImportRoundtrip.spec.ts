/**
 * Import Roundtrip - Combo I (sub-fase 2.21+2.22).
 *
 * Valida que campos da importação fazem ROUNDTRIP perfeito:
 *   Excel raw → ParsedEmployee → bulkCreate input → INSERT payload (snake_case)
 *
 * Usa mock do supabase pra capturar o payload exato passado pra .insert().
 *
 * Decisão arquitetural validada (passo 4 combo H + correção combo I):
 * campos opcionais ausentes → INSERT OMITE (não força null) — preserva
 * defaults Postgres (ex: schedule_type='Normal', contract_type='CLT').
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted: garante que mockSupabase + insertSpy existam ANTES do vi.mock factory rodar
const { insertSpy, mockSupabase } = vi.hoisted(() => {
  const insertSpy = vi.fn();
  // chainable que captura insert payload e suporta .select().single()
  const mockSupabase: any = {
    from: vi.fn(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({ data: { id: 'mock-id' }, error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        insert: vi.fn((rows: unknown) => {
          insertSpy(rows);
          // .insert(...).select().single() retorna { data: {id:...}, error: null }
          return chain;
        }),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    }),
  };
  return { insertSpy, mockSupabase };
});

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));

// Mock também os módulos de permissões pra não tentar consultar o banco real
vi.mock('../../src/services/permissions', () => ({
  getUserPermissions: vi.fn().mockResolvedValue({ admin: true }),
  hasPermission: vi.fn().mockReturnValue(true),
}));

import { validateImportRow, type ValidationContext } from '../../src/utils/employeeImportValidation';
import { parsedToImportData } from '../../src/utils/employeeImport';
import { bulkCreateEmployees } from '../../src/services/database';

beforeEach(() => {
  vi.clearAllMocks();
  insertSpy.mockClear();
});

function defaultContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    existingCpfsInCompany: new Set(),
    existingCpfsOtherCompanies: new Map(),
    companyDefaults: {
      default_marking_count: 2,
      default_schedule: [0, 480, 480, 480, 480, 480, 240],
    },
    cpfsInThisFile: new Set(),
    ...overrides,
  };
}

// Captura o payload do INSERT (sempre é Array<row> — `.insert([row])`).
function getLastInsertedRow(): Record<string, unknown> {
  expect(insertSpy).toHaveBeenCalled();
  const lastCall = insertSpy.mock.calls[insertSpy.mock.calls.length - 1]!;
  const arr = lastCall[0] as Array<Record<string, unknown>>;
  return arr[0]!;
}

describe('Import Roundtrip - Combo I', () => {
  it('1. function_role: roundtrip "AUXILIAR DE LOGÍSTICA" preserva exato', async () => {
    const raw = { nome: 'João Silva', cpf: '11144477735', funcao: 'AUXILIAR DE LOGÍSTICA' };
    const row = validateImportRow(raw, 1, defaultContext());
    expect(row.errors).toHaveLength(0);

    const importData = parsedToImportData(row.parsed);
    expect(importData.functionRole).toBe('AUXILIAR DE LOGÍSTICA');

    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.function_role).toBe('AUXILIAR DE LOGÍSTICA'); // snake_case no DB
  });

  it('2. badge_number: "001" mantém zeros à esquerda (string, não int)', async () => {
    const raw = { nome: 'Maria', cpf: '11144477735', cracha: '001' };
    const row = validateImportRow(raw, 1, defaultContext());

    const importData = parsedToImportData(row.parsed);
    expect(importData.badgeNumber).toBe('001');

    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.badge_number).toBe('001');
    expect(typeof inserted.badge_number).toBe('string');
  });

  it('3. pis: 11 dígitos sem formatação', async () => {
    // PIS válido com formatação no Excel
    const raw = { nome: 'Pedro', cpf: '11144477735', pis: '120.5678.901-0' };
    const row = validateImportRow(raw, 1, defaultContext());
    expect(row.errors).toHaveLength(0);
    expect(row.parsed.pis).toBe('12056789010'); // sem formatação no parsed

    const importData = parsedToImportData(row.parsed);
    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.pis).toBe('12056789010');
  });

  it('4. expected_schedule: array vai como JSON jsonb', async () => {
    const raw = {
      nome: 'Ana', cpf: '11144477735',
      jornada_dom: 0, jornada_seg: 480, jornada_ter: 480, jornada_qua: 480,
      jornada_qui: 480, jornada_sex: 480, jornada_sab: 240,
    };
    const row = validateImportRow(raw, 1, defaultContext());

    const importData = parsedToImportData(row.parsed);
    expect(importData.expectedSchedule).toEqual([0, 480, 480, 480, 480, 480, 240]);

    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.expected_schedule).toEqual([0, 480, 480, 480, 480, 480, 240]);
  });

  it('5. marking_count: vai como integer 4 (não string)', async () => {
    const raw = { nome: 'Carlos', cpf: '11144477735', marcacoes_por_dia: 4 };
    const row = validateImportRow(raw, 1, defaultContext());

    const importData = parsedToImportData(row.parsed);
    expect(importData.markingCount).toBe(4);
    expect(typeof importData.markingCount).toBe('number');

    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.marking_count).toBe(4);
    expect(typeof inserted.marking_count).toBe('number');
  });

  it('6. hire_date: "15/04/2025" → "2025-04-15" no banco (formato ISO)', async () => {
    const raw = { nome: 'Luiz', cpf: '11144477735', data_admissao: '15/04/2025' };
    const row = validateImportRow(raw, 1, defaultContext());

    const importData = parsedToImportData(row.parsed);
    expect(importData.hireDate).toBe('2025-04-15');

    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.hire_date).toBe('2025-04-15');
  });

  it('7. contract_type: "CLT" mantém case exato', async () => {
    const raw = { nome: 'Sofia', cpf: '11144477735', tipo_contrato: 'CLT' };
    const row = validateImportRow(raw, 1, defaultContext());

    const importData = parsedToImportData(row.parsed);
    expect(importData.contractType).toBe('CLT');

    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.contract_type).toBe('CLT');
  });

  it('8. pin: "1234" + pin_configured derivado automaticamente como true', async () => {
    const raw = { nome: 'Beatriz', cpf: '11144477735', pin: '1234' };
    const row = validateImportRow(raw, 1, defaultContext());

    const importData = parsedToImportData(row.parsed);
    expect(importData.pin).toBe('1234');

    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.pin).toBe('1234');
    expect(inserted.pin_configured).toBe(true); // derivado automaticamente
  });

  it('9. Excel serial date: 45000 (raw Excel) → "2023-03-15" no banco', async () => {
    const raw = { nome: 'Roberto', cpf: '11144477735', data_admissao: 45000 };
    const row = validateImportRow(raw, 1, defaultContext());

    expect(row.errors.filter((e) => e.field === 'data_admissao')).toHaveLength(0);
    expect(row.parsed.hire_date).toBe('2023-03-15'); // serial 45000

    const importData = parsedToImportData(row.parsed);
    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();
    expect(inserted.hire_date).toBe('2023-03-15');
  });

  it('10. Campos vazios: defaults Postgres preservados (INSERT omite, NÃO força null)', async () => {
    // Caller NÃO passa funcao/cracha/pis/etc. INSERT deve OMITIR esses campos
    // pra que o Postgres aplique seus defaults da migration
    // (ex: schedule_type='Normal', contract_type='CLT').
    const raw = { nome: 'Mínimo', cpf: '11144477735' };
    const row = validateImportRow(raw, 1, defaultContext());

    const importData = parsedToImportData(row.parsed);
    await bulkCreateEmployees([importData], '9999', 'company-1');

    const inserted = getLastInsertedRow();

    // Obrigatórios presentes
    expect(inserted.name).toBe('Mínimo');
    expect(inserted.cpf).toBe('11144477735');
    expect(inserted.company_id).toBe('company-1');

    // Etapa 2 — campos novos opcionais OMITIDOS no INSERT (não null)
    // pra preservar defaults Postgres da migration combo G/H.
    expect(inserted).not.toHaveProperty('function_role');
    expect(inserted).not.toHaveProperty('badge_number');
    expect(inserted).not.toHaveProperty('pis');
    expect(inserted).not.toHaveProperty('schedule_type');
    expect(inserted).not.toHaveProperty('expected_schedule');
    expect(inserted).not.toHaveProperty('hire_date');
    expect(inserted).not.toHaveProperty('contract_type');
    expect(inserted).not.toHaveProperty('employment_type');
    expect(inserted).not.toHaveProperty('pin');
    expect(inserted).not.toHaveProperty('pin_configured');

    // EXCEÇÃO documentada: marking_count recebe default da EMPRESA via validator
    // (companyDefaults.default_marking_count=2 no contexto). Não é o default do
    // Postgres, é o default explícito do parser pra evitar NULL em campo CHECK.
    expect(inserted.marking_count).toBe(2);
  });
});
