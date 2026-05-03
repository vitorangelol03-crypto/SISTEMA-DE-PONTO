/**
 * Testes unit para src/utils/attendanceCalc.ts
 *
 * Framework: vitest. Roda com: npx vitest run attendanceCalc
 * Convenções:
 *   - 08:00 BRT em 2026-04-15 = 11:00 UTC (UTC-3)
 *   - Datas escolhidas: 2026-04-15 (quarta), 2026-04-12 (domingo)
 */
import { describe, it, expect } from 'vitest';
import {
  computeWorkedMinutes,
  computeIntervalMinutes,
  computeDaytimeMinutes,
  computeNighttimeMinutes,
  getExpectedMinutesForDate,
  computeBankHours,
  AttendanceMarkings,
  ExpectedSchedule,
} from '../../src/utils/attendanceCalc';

const SCHEDULE: ExpectedSchedule = [0, 480, 480, 480, 480, 480, 240];

describe('attendanceCalc', () => {
  it('1. 2 marcações 08:00–17:00 = 540 worked, 0 interval, todo diurno', () => {
    const m: AttendanceMarkings = {
      entry_1: '2026-04-15T11:00:00Z', // 08:00 BRT
      exit_1: null,
      entry_2: null,
      exit_2: '2026-04-15T20:00:00Z', // 17:00 BRT
      marking_count: 2,
    };
    expect(computeWorkedMinutes(m)).toBe(540);
    expect(computeIntervalMinutes(m)).toBe(0);
    expect(computeDaytimeMinutes(m)).toBe(540);
    expect(computeNighttimeMinutes(m)).toBe(0);
  });

  it('2. 4 marcações 08–12, 13–17 = 480 worked, 60 interval, todo diurno', () => {
    const m: AttendanceMarkings = {
      entry_1: '2026-04-15T11:00:00Z', // 08:00
      exit_1: '2026-04-15T15:00:00Z',  // 12:00
      entry_2: '2026-04-15T16:00:00Z', // 13:00
      exit_2: '2026-04-15T20:00:00Z',  // 17:00
      marking_count: 4,
    };
    expect(computeWorkedMinutes(m)).toBe(480);
    expect(computeIntervalMinutes(m)).toBe(60);
    expect(computeDaytimeMinutes(m)).toBe(480);
    expect(computeNighttimeMinutes(m)).toBe(0);
  });

  it('3. Turno noturno 22:00–06:00 = 480 worked, 420 noturno + 60 diurno', () => {
    const m: AttendanceMarkings = {
      entry_1: '2026-04-16T01:00:00Z', // 22:00 BRT 15/04
      exit_1: null,
      entry_2: null,
      exit_2: '2026-04-16T09:00:00Z', // 06:00 BRT 16/04
      marking_count: 2,
    };
    expect(computeWorkedMinutes(m)).toBe(480);
    // 22→00 (2h) + 00→05 (5h) = 7h noturno = 420; 05→06 (1h) = 60 diurno
    expect(computeNighttimeMinutes(m)).toBe(420);
    expect(computeDaytimeMinutes(m)).toBe(60);
  });

  it('4. Cruzando meia-noite 23:00–07:00 = 480 worked, 360 noturno + 120 diurno', () => {
    const m: AttendanceMarkings = {
      entry_1: '2026-04-16T02:00:00Z', // 23:00 BRT 15/04
      exit_1: null,
      entry_2: null,
      exit_2: '2026-04-16T10:00:00Z', // 07:00 BRT 16/04
      marking_count: 2,
    };
    expect(computeWorkedMinutes(m)).toBe(480);
    // 23→00 (1h) + 00→05 (5h) = 6h noturno = 360; 05→07 (2h) = 120 diurno
    expect(computeNighttimeMinutes(m)).toBe(360);
    expect(computeDaytimeMinutes(m)).toBe(120);
  });

  it('5. Crédito: worked=540, expected=480 → credit=60', () => {
    expect(computeBankHours(540, 480, false)).toEqual({ credit: 60, debit: 0 });
  });

  it('6. Débito: worked=420, expected=480 → debit=60', () => {
    expect(computeBankHours(420, 480, false)).toEqual({ credit: 0, debit: 60 });
  });

  it('7. Ausência compensada: isAbsent=true → ambos 0', () => {
    expect(computeBankHours(0, 480, true)).toEqual({ credit: 0, debit: 0 });
    expect(computeBankHours(120, 480, true)).toEqual({ credit: 0, debit: 0 });
  });

  it('8. Domingo (expected=0): worked=300 → credit=300', () => {
    // 2026-04-12 é domingo
    expect(getExpectedMinutesForDate(SCHEDULE, '2026-04-12')).toBe(0);
    // Quarta 2026-04-15 = 480
    expect(getExpectedMinutesForDate(SCHEDULE, '2026-04-15')).toBe(480);
    // Sábado 2026-04-11 = 240
    expect(getExpectedMinutesForDate(SCHEDULE, '2026-04-11')).toBe(240);
    // Combinado com banco
    expect(computeBankHours(300, 0, false)).toEqual({ credit: 300, debit: 0 });
  });

  it('9. 2 marcações com exit_2 null → worked=0', () => {
    const m: AttendanceMarkings = {
      entry_1: '2026-04-15T11:00:00Z',
      exit_1: null,
      entry_2: null,
      exit_2: null,
      marking_count: 2,
    };
    expect(computeWorkedMinutes(m)).toBe(0);
    expect(computeIntervalMinutes(m)).toBe(0);
    expect(computeDaytimeMinutes(m)).toBe(0);
    expect(computeNighttimeMinutes(m)).toBe(0);
  });

  it('10. 4 marcações com entry_2 null → só primeiro turno conta', () => {
    const m: AttendanceMarkings = {
      entry_1: '2026-04-15T11:00:00Z', // 08:00
      exit_1: '2026-04-15T15:00:00Z',  // 12:00
      entry_2: null,
      exit_2: '2026-04-15T20:00:00Z',  // 17:00 (irrelevante sem entry_2)
      marking_count: 4,
    };
    expect(computeWorkedMinutes(m)).toBe(240); // só primeiro turno
    expect(computeIntervalMinutes(m)).toBe(0); // sem entry_2, sem interval
    expect(computeDaytimeMinutes(m)).toBe(240);
    expect(computeNighttimeMinutes(m)).toBe(0);
  });
});
