/**
 * Testes unit para src/utils/mirrorGenerator.ts
 *
 * Framework: vitest. Roda com: npx vitest run mirrorGenerator
 *
 * Cobertura: 60+ casos cobrindo as 11 funções públicas + buildMirrorData
 * integração. Espelho de ponto é entregável CLT — bug aqui pode invalidar
 * perícia trabalhista.
 *
 * Estratégia: funções puras (sem efeitos, sem DOM, sem jspdf), testes
 * isolados sem mock. Fixtures via helpers `makeEmployee`, `makeCompany`,
 * `makeAttendance` com defaults sensatos.
 */

import { describe, it, expect } from 'vitest';
import {
  minutesToHHMM,
  minutesToHHMMAlways,
  formatCpf,
  formatCnpj,
  formatDateBR,
  formatDateBRShort,
  weekdayPt3,
  formatTimeBRT,
  listDatesInRange,
  buildScheduleSummary,
  buildMirrorData,
} from '../../src/utils/mirrorGenerator';
import type { Attendance, Employee, Company } from '../../src/services/database';

// ─── Helpers de fixture ────────────────────────────────────────────────────

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    name: 'Funcionário Teste',
    cpf: '12345678901',
    pis: '12345678910',
    badge_number: '0001',
    function_role: 'Operador',
    schedule_type: 'Normal',
    company_id: 'company-1',
    expected_schedule: [0, 480, 480, 480, 480, 480, 240],
    ...overrides,
  } as Employee;
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company-1',
    legal_name: 'EMPRESA TESTE LTDA',
    display_name: 'Empresa Teste',
    cnpj: '12345678000195',
    logo_url: null,
    default_schedule: [0, 480, 480, 480, 480, 480, 240],
    default_function_role: 'Operador',
    ...overrides,
  } as Company;
}

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'att-1',
    employee_id: 'emp-1',
    date: '2026-05-11',
    status: 'present',
    entry_time: null,
    exit_time: null,
    exit_time_full: null,
    hours_worked: null,
    night_hours: null,
    night_additional: null,
    approval_status: 'approved',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    clock_source: null,
    marked_by: 'admin',
    created_at: '2026-05-11T00:00:00Z',
    ...overrides,
  } as Attendance;
}

// ─── minutesToHHMM ─────────────────────────────────────────────────────────

describe('minutesToHHMM', () => {
  it('1. zero → string vazia (não 00:00)', () => {
    expect(minutesToHHMM(0)).toBe('');
  });

  it('2. 480min (8h) → "08:00"', () => {
    expect(minutesToHHMM(480)).toBe('08:00');
  });

  it('3. 30min → "00:30"', () => {
    expect(minutesToHHMM(30)).toBe('00:30');
  });

  it('4. negativo -120 → "-02:00"', () => {
    expect(minutesToHHMM(-120)).toBe('-02:00');
  });

  it('5. Infinity → vazio', () => {
    expect(minutesToHHMM(Infinity)).toBe('');
  });

  it('6. NaN → vazio', () => {
    expect(minutesToHHMM(NaN)).toBe('');
  });

  it('7. decimal arredonda (27.4 → 00:27)', () => {
    expect(minutesToHHMM(27.4)).toBe('00:27');
  });
});

// ─── minutesToHHMMAlways ───────────────────────────────────────────────────

describe('minutesToHHMMAlways', () => {
  it('8. zero → "00:00" (sempre mostra, diferente de minutesToHHMM)', () => {
    expect(minutesToHHMMAlways(0)).toBe('00:00');
  });

  it('9. NaN/Infinity → "00:00" fallback', () => {
    expect(minutesToHHMMAlways(NaN)).toBe('00:00');
    expect(minutesToHHMMAlways(Infinity)).toBe('00:00');
  });

  it('10. negativo -60 → "-01:00"', () => {
    expect(minutesToHHMMAlways(-60)).toBe('-01:00');
  });
});

// ─── formatCpf ─────────────────────────────────────────────────────────────

describe('formatCpf', () => {
  it('11. 11 dígitos puros → XXX.XXX.XXX-XX', () => {
    expect(formatCpf('12345678901')).toBe('123.456.789-01');
  });

  it('12. já formatado com pontos/hífen → normaliza e re-formata', () => {
    expect(formatCpf('123.456.789-01')).toBe('123.456.789-01');
  });

  it('13. null/undefined/vazio → vazio', () => {
    expect(formatCpf(null)).toBe('');
    expect(formatCpf(undefined)).toBe('');
    expect(formatCpf('')).toBe('');
  });

  it('14. menos de 11 dígitos → retorna original (sem formatar)', () => {
    expect(formatCpf('1234567')).toBe('1234567');
  });
});

// ─── formatCnpj ────────────────────────────────────────────────────────────

describe('formatCnpj', () => {
  it('15. 14 dígitos → XX.XXX.XXX/XXXX-XX', () => {
    expect(formatCnpj('12345678000195')).toBe('12.345.678/0001-95');
  });

  it('16. null/vazio → vazio', () => {
    expect(formatCnpj(null)).toBe('');
    expect(formatCnpj('')).toBe('');
  });

  it('17. menos de 14 dígitos → retorna original', () => {
    expect(formatCnpj('12345678')).toBe('12345678');
  });
});

// ─── formatDateBR / formatDateBRShort ──────────────────────────────────────

describe('formatDateBR', () => {
  it('18. YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(formatDateBR('2026-05-11')).toBe('11/05/2026');
  });

  it('19. formato incompleto → retorna original', () => {
    expect(formatDateBR('2026-05')).toBe('2026-05');
  });
});

describe('formatDateBRShort', () => {
  it('20. YYYY-MM-DD → DD/MM', () => {
    expect(formatDateBRShort('2026-05-11')).toBe('11/05');
  });

  it('21. formato incompleto → retorna original', () => {
    expect(formatDateBRShort('2026')).toBe('2026');
  });
});

// ─── weekdayPt3 ────────────────────────────────────────────────────────────

describe('weekdayPt3', () => {
  // 2026-05-11 é segunda-feira (confirmado)
  it('22. segunda 2026-05-11 → "seg"', () => {
    expect(weekdayPt3('2026-05-11')).toBe('seg');
  });

  it('23. domingo 2026-05-10 → "dom"', () => {
    expect(weekdayPt3('2026-05-10')).toBe('dom');
  });

  it('24. sábado 2026-05-09 → "sáb"', () => {
    expect(weekdayPt3('2026-05-09')).toBe('sáb');
  });

  it('25. formato inválido → "dom" (fallback dow=0)', () => {
    expect(weekdayPt3('invalido')).toBe('dom');
  });
});

// ─── formatTimeBRT ─────────────────────────────────────────────────────────

describe('formatTimeBRT', () => {
  it('26. ISO UTC 15:30:00 → 12:30 BRT', () => {
    expect(formatTimeBRT('2026-05-11T15:30:00Z')).toBe('12:30');
  });

  it('27. ISO UTC 02:00 → 23:00 BRT (dia anterior, mas só HH:MM importa)', () => {
    expect(formatTimeBRT('2026-05-11T02:00:00Z')).toBe('23:00');
  });

  it('28. null/undefined/vazio → vazio', () => {
    expect(formatTimeBRT(null)).toBe('');
    expect(formatTimeBRT(undefined)).toBe('');
    expect(formatTimeBRT('')).toBe('');
  });

  it('29. ISO inválido (NaN time) → vazio', () => {
    expect(formatTimeBRT('not-a-date')).toBe('');
  });

  it('30. preserva minutos exatos', () => {
    expect(formatTimeBRT('2026-05-11T15:45:00Z')).toBe('12:45');
  });
});

// ─── listDatesInRange ──────────────────────────────────────────────────────

describe('listDatesInRange', () => {
  it('31. single day (start = end)', () => {
    expect(listDatesInRange('2026-05-11', '2026-05-11')).toEqual(['2026-05-11']);
  });

  it('32. range de 3 dias', () => {
    expect(listDatesInRange('2026-05-10', '2026-05-12')).toEqual([
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
    ]);
  });

  it('33. atravessa virada de mês', () => {
    expect(listDatesInRange('2026-04-30', '2026-05-02')).toEqual([
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
  });

  it('34. ano bissexto: 2024-02-28 a 2024-03-01 → 3 dias (29/02 incluso)', () => {
    expect(listDatesInRange('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });

  it('35. end < start → array vazio', () => {
    expect(listDatesInRange('2026-05-15', '2026-05-10')).toEqual([]);
  });

  it('36. formato inválido → array vazio', () => {
    expect(listDatesInRange('invalido', '2026-05-12')).toEqual([]);
  });
});

// ─── buildScheduleSummary ──────────────────────────────────────────────────

describe('buildScheduleSummary', () => {
  it('37. schedule padrão CLT [0,480x5,240] → "Seg-Sex: 8h / Sáb: 4h / Dom: folga"', () => {
    expect(buildScheduleSummary([0, 480, 480, 480, 480, 480, 240])).toBe(
      'Seg-Sex: 8h / Sáb: 4h / Dom: folga',
    );
  });

  it('38. todos zero → "Seg-Dom: folga" (agrupa sáb→dom)', () => {
    expect(buildScheduleSummary([0, 0, 0, 0, 0, 0, 0])).toBe('Seg-Dom: folga');
  });

  it('39. minutos não-redondos: 300min → "5h" (sem minutos quando m=0)', () => {
    expect(buildScheduleSummary([0, 300, 300, 300, 300, 300, 0])).toBe(
      'Seg-Sex: 5h / Sáb-Dom: folga',
    );
  });

  it('40. minutos com fração: 450 → "7h30"', () => {
    expect(buildScheduleSummary([0, 450, 450, 450, 450, 450, 0])).toBe(
      'Seg-Sex: 7h30 / Sáb-Dom: folga',
    );
  });

  it('41. null/undefined → vazio', () => {
    expect(buildScheduleSummary(null)).toBe('');
    expect(buildScheduleSummary(undefined)).toBe('');
  });

  it('42. array com 6 elementos (inválido) → vazio', () => {
    expect(buildScheduleSummary([0, 480, 480, 480, 480, 480] as unknown as readonly [number, number, number, number, number, number, number])).toBe('');
  });

  it('43. grupos isolados: dia único na semana', () => {
    expect(buildScheduleSummary([0, 480, 300, 480, 300, 480, 0])).toContain('Seg:');
  });
});

// ─── buildMirrorData (integração) ──────────────────────────────────────────

describe('buildMirrorData', () => {
  const baseInput = {
    company: makeCompany(),
    employee: makeEmployee(),
    period: { start: '2026-05-11', end: '2026-05-11' }, // 1 dia (segunda)
    attendances: [],
    emissionDate: '2026-05-11',
  };

  it('44. integra company + employee + period + attendances; rows.length = dias do range', () => {
    const result = buildMirrorData({
      ...baseInput,
      period: { start: '2026-05-10', end: '2026-05-15' }, // 6 dias
    });
    expect(result.rows).toHaveLength(6);
  });

  it('45. company info propagada (legal_name, cnpj, display_name)', () => {
    const result = buildMirrorData(baseInput);
    expect(result.company.legal_name).toBe('EMPRESA TESTE LTDA');
    expect(result.company.cnpj).toBe('12345678000195');
    expect(result.company.display_name).toBe('Empresa Teste');
  });

  it('46. logo_url null preservado quando company sem logo', () => {
    const result = buildMirrorData(baseInput);
    expect(result.company.logo_url).toBeNull();
  });

  it('47. employee info propagada (cpf, pis, badge, function_role)', () => {
    const result = buildMirrorData(baseInput);
    expect(result.employee.name).toBe('Funcionário Teste');
    expect(result.employee.cpf).toBe('12345678901');
    expect(result.employee.pis).toBe('12345678910');
    expect(result.employee.badge_number).toBe('0001');
  });

  it('48. employee sem expected_schedule → cai no company.default_schedule', () => {
    const result = buildMirrorData({
      ...baseInput,
      employee: makeEmployee({ expected_schedule: null }),
      company: makeCompany({ default_schedule: [0, 600, 600, 600, 600, 600, 0] }),
    });
    // Segunda → 600min do default da empresa
    expect(result.rows[0].expected).toBe(600);
  });

  it('49. dia SEM attendance: expected do schedule, demais zerados, cells vazias', () => {
    const result = buildMirrorData(baseInput);
    const row = result.rows[0];
    expect(row.expected).toBe(480); // segunda → 480min do schedule
    expect(row.daytime).toBe(0);
    expect(row.nighttime).toBe(0);
    expect(row.bankCredit).toBe(0);
    expect(row.bankDebit).toBe(0);
    expect(row.ent1.display).toBe('');
    expect(row.sai2.display).toBe('');
  });

  it('50. domingo: isSunday=true, label inclui "dom"', () => {
    const result = buildMirrorData({
      ...baseInput,
      period: { start: '2026-05-10', end: '2026-05-10' }, // domingo
    });
    expect(result.rows[0].isSunday).toBe(true);
    expect(result.rows[0].label).toContain('dom');
  });

  it('51. dia COM attendance (4 marcações): ent1/sai1/ent2/sai2 BRT formatados', () => {
    const att = makeAttendance({
      date: '2026-05-11',
      entry_1_time: '2026-05-11T11:00:00Z', // 08:00 BRT
      exit_1_time: '2026-05-11T15:00:00Z', // 12:00 BRT
      entry_2_time: '2026-05-11T16:00:00Z', // 13:00 BRT
      exit_2_time: '2026-05-11T20:00:00Z', // 17:00 BRT
      daytime_minutes: 480,
      nighttime_minutes: 0,
      bank_credit_minutes: 0,
      bank_debit_minutes: 0,
    });
    const result = buildMirrorData({
      ...baseInput,
      attendances: [att],
    });
    const row = result.rows[0];
    expect(row.ent1.display).toBe('08:00');
    expect(row.sai1.display).toBe('12:00');
    expect(row.ent2.display).toBe('13:00');
    expect(row.sai2.display).toBe('17:00');
  });

  it('52. marking_flag "included" propaga pra TODAS as 4 células de tempo', () => {
    const att = makeAttendance({
      date: '2026-05-11',
      entry_1_time: '2026-05-11T11:00:00Z',
      exit_1_time: '2026-05-11T15:00:00Z',
      entry_2_time: '2026-05-11T16:00:00Z',
      exit_2_time: '2026-05-11T20:00:00Z',
      marking_flag: 'included',
    });
    const result = buildMirrorData({
      ...baseInput,
      attendances: [att],
    });
    const row = result.rows[0];
    expect(row.ent1.flag).toBe('included');
    expect(row.sai1.flag).toBe('included');
    expect(row.ent2.flag).toBe('included');
    expect(row.sai2.flag).toBe('included');
  });

  it('53. marking_flag "normal" → flag normalizado pra null nas células', () => {
    const att = makeAttendance({
      date: '2026-05-11',
      entry_1_time: '2026-05-11T11:00:00Z',
      marking_flag: 'normal',
    });
    const result = buildMirrorData({
      ...baseInput,
      attendances: [att],
    });
    expect(result.rows[0].ent1.flag).toBeNull();
  });

  it('54. is_absent_compensated=true → todas 4 células mostram "Aus. Comp."', () => {
    const att = makeAttendance({
      date: '2026-05-11',
      is_absent_compensated: true,
      entry_1_time: '2026-05-11T11:00:00Z', // ignored pq absent_compensated
    });
    const result = buildMirrorData({
      ...baseInput,
      attendances: [att],
    });
    const row = result.rows[0];
    expect(row.ent1.display).toBe('Aus. Comp.');
    expect(row.sai1.display).toBe('Aus. Comp.');
    expect(row.ent2.display).toBe('Aus. Comp.');
    expect(row.sai2.display).toBe('Aus. Comp.');
    expect(row.isAbsentCompensated).toBe(true);
  });

  it('55. attendance com expected_minutes setado → usa esse valor (override do schedule)', () => {
    const att = makeAttendance({
      date: '2026-05-11',
      expected_minutes: 600, // override
    });
    const result = buildMirrorData({
      ...baseInput,
      attendances: [att],
    });
    expect(result.rows[0].expected).toBe(600);
  });

  it('56. totals: sum dos rows (expected, daytime, nighttime, interval, bankCredit, bankDebit)', () => {
    const atts = [
      makeAttendance({
        date: '2026-05-11',
        daytime_minutes: 480,
        nighttime_minutes: 0,
        interval_minutes: 60,
        bank_credit_minutes: 30,
        bank_debit_minutes: 0,
        expected_minutes: 480,
      }),
      makeAttendance({
        date: '2026-05-12',
        daytime_minutes: 240,
        nighttime_minutes: 120,
        interval_minutes: 30,
        bank_credit_minutes: 0,
        bank_debit_minutes: 60,
        expected_minutes: 480,
      }),
    ];
    const result = buildMirrorData({
      ...baseInput,
      period: { start: '2026-05-11', end: '2026-05-12' },
      attendances: atts,
    });
    expect(result.totals.expected).toBe(960);
    expect(result.totals.daytime).toBe(720);
    expect(result.totals.nighttime).toBe(120);
    expect(result.totals.interval).toBe(90);
    expect(result.totals.bankCredit).toBe(30);
    expect(result.totals.bankDebit).toBe(60);
  });

  it('57. totals.bankNet = bankCredit - bankDebit', () => {
    const atts = [
      makeAttendance({ date: '2026-05-11', bank_credit_minutes: 100, bank_debit_minutes: 30 }),
    ];
    const result = buildMirrorData({
      ...baseInput,
      attendances: atts,
    });
    expect(result.totals.bankNet).toBe(70);
  });

  it('58. totals.bankNet pode ser negativo (mais débito que crédito)', () => {
    const atts = [
      makeAttendance({ date: '2026-05-11', bank_credit_minutes: 30, bank_debit_minutes: 100 }),
    ];
    const result = buildMirrorData({
      ...baseInput,
      attendances: atts,
    });
    expect(result.totals.bankNet).toBe(-70);
  });

  it('59. range vazio (start > end) → rows.length = 0, totals zerados', () => {
    const result = buildMirrorData({
      ...baseInput,
      period: { start: '2026-05-15', end: '2026-05-10' },
    });
    expect(result.rows).toHaveLength(0);
    expect(result.totals.expected).toBe(0);
    expect(result.totals.bankNet).toBe(0);
  });

  it('60. emissionDate fornecido é persistido em period.emissionDate', () => {
    const result = buildMirrorData({
      ...baseInput,
      emissionDate: '2026-05-20',
    });
    expect(result.period.emissionDate).toBe('2026-05-20');
  });

  it('61. emissionDate ausente → usa data atual (todayBR)', () => {
    const result = buildMirrorData({
      ...baseInput,
      emissionDate: undefined,
    });
    expect(result.period.emissionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('62. scheduleSummary é texto não-vazio quando schedule válido', () => {
    const result = buildMirrorData(baseInput);
    expect(result.scheduleSummary.length).toBeGreaterThan(0);
    expect(result.scheduleSummary).toMatch(/Seg/);
  });

  it('63. ordenação cronológica garantida (rows seguem dates do range)', () => {
    const result = buildMirrorData({
      ...baseInput,
      period: { start: '2026-05-10', end: '2026-05-13' },
    });
    expect(result.rows.map((r) => r.date)).toEqual([
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
    ]);
  });

  it('64. attendance fora do range é ignorado', () => {
    const att = makeAttendance({
      date: '2026-05-20', // fora do range
      daytime_minutes: 480,
    });
    const result = buildMirrorData({
      ...baseInput,
      period: { start: '2026-05-11', end: '2026-05-11' },
      attendances: [att],
    });
    expect(result.rows[0].daytime).toBe(0);
  });

  it('65. employee.function_role fallback pra company.default_function_role', () => {
    const result = buildMirrorData({
      ...baseInput,
      employee: makeEmployee({ function_role: undefined }),
      company: makeCompany({ default_function_role: 'Auxiliar' }),
    });
    expect(result.employee.function_role).toBe('Auxiliar');
  });
});
