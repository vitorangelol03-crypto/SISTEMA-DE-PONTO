/**
 * Testes unit para src/utils/employeeImportValidation.ts (combo H — sub-fase 2.20).
 *
 * Framework: vitest. Roda com: npx vitest run employeeImportValidation
 *
 * CPF de teste: 11144477735 (válido pelo algoritmo Receita).
 * PIS de teste: 12056789010 e 12345678900 (calculados manualmente, DV=0 ambos).
 *
 * Cobertura:
 *  - Helpers puros (CPF/PIS/Date/Type/UF normalizers): 24 testes
 *  - validateImportRow obrigatórios: 6 testes
 *  - validateImportRow CPF existente: 3 testes
 *  - validateImportRow Etapa 2: 8 testes
 *  - validateImportRow warnings: 6 testes
 *  - validateImportRow linhas completas: 3 testes
 */

import { describe, it, expect } from 'vitest';
import {
  validateImportRow,
  validatePIS,
  parseDate,
  normalizeCPF,
  normalizeEmploymentType,
  normalizePixType,
  normalizeUF,
  type ValidationContext,
} from '../../src/utils/employeeImportValidation';

// ─── Helpers ──────────────────────────────────────────────────────────────

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

function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nome: 'João Silva',
    cpf: '11144477735',
    ...overrides,
  };
}

// ─── normalizeCPF ─────────────────────────────────────────────────────────

describe('normalizeCPF', () => {
  it('1. remove pontuação: 111.444.777-35 → 11144477735', () => {
    expect(normalizeCPF('111.444.777-35')).toBe('11144477735');
  });

  it('2. retira caracteres não-numéricos: abc.def → ""', () => {
    expect(normalizeCPF('abc.def')).toBe('');
  });

  it('3. lida com null/undefined sem throw', () => {
    expect(normalizeCPF(null as unknown as string)).toBe('');
    expect(normalizeCPF(undefined as unknown as string)).toBe('');
  });
});

// ─── validatePIS ──────────────────────────────────────────────────────────

describe('validatePIS', () => {
  it('4. PIS válido conhecido (12056789010, DV=0) → true', () => {
    expect(validatePIS('12056789010')).toBe(true);
  });

  it('5. PIS com 10 dígitos (faltando 1) → false', () => {
    expect(validatePIS('1205678901')).toBe(false);
  });

  it('6. PIS com dígito verificador errado → false', () => {
    expect(validatePIS('12056789011')).toBe(false);
  });

  it('7. PIS com 11 dígitos repetidos (00000000000) → false', () => {
    expect(validatePIS('00000000000')).toBe(false);
  });

  it('8. PIS com pontuação (120.5678.901-0) → normaliza e valida true', () => {
    expect(validatePIS('120.5678.901-0')).toBe(true);
  });

  it('9. PIS vazio → false', () => {
    expect(validatePIS('')).toBe(false);
  });
});

// ─── parseDate ────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('10. parseDate("15/04/2025") → "2025-04-15"', () => {
    expect(parseDate('15/04/2025')).toBe('2025-04-15');
  });

  it('11. parseDate("2025-04-15") → "2025-04-15"', () => {
    expect(parseDate('2025-04-15')).toBe('2025-04-15');
  });

  it('12. parseDate("32/13/2024") → null (calendário inválido)', () => {
    expect(parseDate('32/13/2024')).toBe(null);
  });

  it('13. parseDate(45000) → "2023-03-15" (Excel serial)', () => {
    expect(parseDate(45000)).toBe('2023-03-15');
  });

  it('14. parseDate(Date UTC) → "2025-04-15"', () => {
    expect(parseDate(new Date(Date.UTC(2025, 3, 15)))).toBe('2025-04-15');
  });
});

// ─── normalizeEmploymentType ──────────────────────────────────────────────

describe('normalizeEmploymentType', () => {
  it('15. "clt" → "CLT" (case-insensitive)', () => {
    expect(normalizeEmploymentType('clt')).toBe('CLT');
  });

  it('16. "CLT" → "CLT"', () => {
    expect(normalizeEmploymentType('CLT')).toBe('CLT');
  });

  it('17. "PJ" → "PJ"', () => {
    expect(normalizeEmploymentType('PJ')).toBe('PJ');
  });

  it('18. "freelancer" → null (não bate enum do banco)', () => {
    expect(normalizeEmploymentType('freelancer')).toBe(null);
  });
});

// ─── normalizePixType ─────────────────────────────────────────────────────

describe('normalizePixType', () => {
  it('19. "aleatoria" sem acento → "Aleatória" (auto-corrige)', () => {
    expect(normalizePixType('aleatoria')).toBe('Aleatória');
  });

  it('20. "CPF" → "CPF"', () => {
    expect(normalizePixType('CPF')).toBe('CPF');
  });

  it('21. "tipo-invalido" → null', () => {
    expect(normalizePixType('tipo-invalido')).toBe(null);
  });
});

// ─── normalizeUF ──────────────────────────────────────────────────────────

describe('normalizeUF', () => {
  it('22. "mg" → "MG" (uppercase)', () => {
    expect(normalizeUF('mg')).toBe('MG');
  });

  it('23. "MG" → "MG"', () => {
    expect(normalizeUF('MG')).toBe('MG');
  });

  it('24. "XX" → null (não é UF brasileira)', () => {
    expect(normalizeUF('XX')).toBe(null);
  });
});

// ─── validateImportRow — obrigatórios ─────────────────────────────────────

describe('validateImportRow - obrigatórios', () => {
  it('25. nome vazio → error name_empty', () => {
    const r = validateImportRow({ nome: '', cpf: '11144477735' }, 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'name_empty')).toBe(true);
    expect(r.parsed.name).toBe('');
  });

  it('26. nome com 2 caracteres → error name_too_short', () => {
    const r = validateImportRow({ nome: 'Jo', cpf: '11144477735' }, 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'name_too_short')).toBe(true);
  });

  it('27. cpf vazio → error cpf_empty', () => {
    const r = validateImportRow({ nome: 'João Silva', cpf: '' }, 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'cpf_empty')).toBe(true);
  });

  it('28. cpf com 10 dígitos → error cpf_invalid', () => {
    const r = validateImportRow({ nome: 'João Silva', cpf: '1114447773' }, 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'cpf_invalid')).toBe(true);
  });

  it('29. cpf "00000000000" → error cpf_invalid (todos zeros)', () => {
    const r = validateImportRow({ nome: 'João Silva', cpf: '00000000000' }, 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'cpf_invalid')).toBe(true);
  });

  it('30. cpf duplicado dentro do arquivo → error cpf_duplicate_in_file', () => {
    const ctx = defaultContext({ cpfsInThisFile: new Set(['11144477735']) });
    const r = validateImportRow(validRow(), 2, ctx);
    expect(r.errors.some((e) => e.code === 'cpf_duplicate_in_file')).toBe(true);
  });
});

// ─── validateImportRow — CPF existente ────────────────────────────────────

describe('validateImportRow - cpf existente', () => {
  it('31. cpf existe na empresa atual → error cpf_exists_in_company', () => {
    const ctx = defaultContext({ existingCpfsInCompany: new Set(['11144477735']) });
    const r = validateImportRow(validRow(), 2, ctx);
    expect(r.errors.some((e) => e.code === 'cpf_exists_in_company')).toBe(true);
  });

  it('32. cpf existe em outra empresa → warning com nome da empresa', () => {
    const ctx = defaultContext({
      existingCpfsOtherCompanies: new Map([['11144477735', 'Ponte Nova']]),
    });
    const r = validateImportRow(validRow(), 2, ctx);
    const warn = r.warnings.find((w) => w.code === 'cpf_exists_other_company');
    expect(warn).toBeDefined();
    expect(warn!.message).toContain('Ponte Nova');
    expect(r.errors.filter((e) => e.field === 'cpf').length).toBe(0);
  });

  it('33. cpf novo → 0 errors / 0 warnings de cpf', () => {
    const r = validateImportRow(validRow(), 2, defaultContext());
    expect(r.errors.filter((e) => e.field === 'cpf').length).toBe(0);
    expect(r.warnings.filter((w) => w.field === 'cpf').length).toBe(0);
  });
});

// ─── validateImportRow — Etapa 2 ──────────────────────────────────────────

describe('validateImportRow - campos novos da Etapa 2', () => {
  it('34. marking_count = 5 → error marking_count_invalid', () => {
    const r = validateImportRow(validRow({ marcacoes_por_dia: 5 }), 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'marking_count_invalid')).toBe(true);
  });

  it('35. marking_count vazio → usa companyDefaults.default_marking_count (2)', () => {
    const r = validateImportRow(validRow(), 2, defaultContext());
    expect(r.parsed.marking_count).toBe(2);
  });

  it('36. marking_count = 4 → parsed.marking_count = 4, sem error', () => {
    const r = validateImportRow(validRow({ marcacoes_por_dia: 4 }), 2, defaultContext());
    expect(r.parsed.marking_count).toBe(4);
    expect(r.errors.filter((e) => e.field === 'marcacoes_por_dia').length).toBe(0);
  });

  it('37. jornada_seg = -10 → error jornada_invalid', () => {
    const r = validateImportRow(validRow({ jornada_seg: -10 }), 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'jornada_invalid')).toBe(true);
  });

  it('38. jornada_seg = 1500 → error jornada_invalid', () => {
    const r = validateImportRow(validRow({ jornada_seg: 1500 }), 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'jornada_invalid')).toBe(true);
  });

  it('39. jornada_seg = 480 → ok, parsed.expected_schedule[1] = 480', () => {
    const r = validateImportRow(validRow({ jornada_seg: 480 }), 2, defaultContext());
    expect(r.errors.filter((e) => e.code === 'jornada_invalid').length).toBe(0);
    expect(r.parsed.expected_schedule?.[1]).toBe(480);
  });

  it('40. data_admissao = "32/13/2024" → error date_invalid', () => {
    const r = validateImportRow(validRow({ data_admissao: '32/13/2024' }), 2, defaultContext());
    expect(r.errors.some((e) => e.code === 'date_invalid')).toBe(true);
  });

  it('41. data_admissao futura ("01/01/2099") → warning date_future', () => {
    const r = validateImportRow(validRow({ data_admissao: '01/01/2099' }), 2, defaultContext());
    expect(r.warnings.some((w) => w.code === 'date_future')).toBe(true);
    expect(r.parsed.hire_date).toBe('2099-01-01');
  });
});

// ─── validateImportRow — warnings ─────────────────────────────────────────

describe('validateImportRow - warnings', () => {
  it('42. pis vazio → warning pis_empty', () => {
    const r = validateImportRow(validRow(), 2, defaultContext());
    expect(r.warnings.some((w) => w.code === 'pis_empty')).toBe(true);
  });

  it('43. badge_number vazio → warning badge_empty', () => {
    const r = validateImportRow(validRow(), 2, defaultContext());
    expect(r.warnings.some((w) => w.code === 'badge_empty')).toBe(true);
  });

  it('44. function_role vazio → warning function_empty', () => {
    const r = validateImportRow(validRow(), 2, defaultContext());
    expect(r.warnings.some((w) => w.code === 'function_empty')).toBe(true);
  });

  it('45. employment_type "freelancer" → warning + parsed.employment_type = CLT (default)', () => {
    const r = validateImportRow(validRow({ employment_type: 'freelancer' }), 2, defaultContext());
    expect(r.warnings.some((w) => w.code === 'employment_type_invalid')).toBe(true);
    expect(r.parsed.employment_type).toBe('CLT');
  });

  it('46. schedule_type "Plantão Especial" → warning, mas mantém valor', () => {
    const r = validateImportRow(validRow({ tipo_escala: 'Plantão Especial' }), 2, defaultContext());
    expect(r.warnings.some((w) => w.code === 'schedule_type_unusual')).toBe(true);
    expect(r.parsed.schedule_type).toBe('Plantão Especial');
  });

  it('47. soma jornada/7 muito baixa → warning jornada_unusual', () => {
    // Só seg=60min → média 60/7 ≈ 8.57min/dia, muito longe de 8h CLT
    const r = validateImportRow(validRow({ jornada_seg: 60 }), 2, defaultContext());
    expect(r.warnings.some((w) => w.code === 'jornada_unusual')).toBe(true);
  });
});

// ─── validateImportRow — linhas completas ─────────────────────────────────

describe('validateImportRow - linhas completas', () => {
  it('48. Todos os campos preenchidos corretamente → 0 errors, 0 warnings', () => {
    const r = validateImportRow(
      {
        nome: 'João da Silva',
        cpf: '11144477735',
        pix_chave: 'joao@email.com',
        pix_tipo: 'Email',
        employment_type: 'CLT',
        endereco: 'Rua A, 100',
        bairro: 'Centro',
        cidade: 'Caratinga',
        estado: 'MG',
        cep: '35300000',
        pin: '1234',
        funcao: 'Auxiliar de Logística',
        cracha: '12345',
        pis: '12056789010',
        tipo_escala: 'Normal',
        jornada_dom: 0,
        jornada_seg: 480,
        jornada_ter: 480,
        jornada_qua: 480,
        jornada_qui: 480,
        jornada_sex: 480,
        jornada_sab: 240,
        marcacoes_por_dia: 4,
        data_admissao: '15/04/2024',
        tipo_contrato: 'CLT',
      },
      2,
      defaultContext(),
    );
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.parsed.name).toBe('João da Silva');
    expect(r.parsed.cpf).toBe('11144477735');
    expect(r.parsed.marking_count).toBe(4);
    expect(r.parsed.hire_date).toBe('2024-04-15');
    expect(r.parsed.expected_schedule).toEqual([0, 480, 480, 480, 480, 480, 240]);
  });

  it('49. Mínimo válido (só nome + cpf) → 0 errors, 4 warnings', () => {
    // Esperados: pis_empty, badge_empty, function_empty, date_empty
    const r = validateImportRow(validRow(), 2, defaultContext());
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThanOrEqual(4);
    expect(r.warnings.some((w) => w.code === 'pis_empty')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'badge_empty')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'function_empty')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'date_empty')).toBe(true);
  });

  it('50. Mínimo válido + marking_count vazio → parsed.marking_count = default da empresa', () => {
    const ctx = defaultContext({
      companyDefaults: { default_marking_count: 4, default_schedule: null },
    });
    const r = validateImportRow(validRow(), 2, ctx);
    expect(r.parsed.marking_count).toBe(4);
  });
});
