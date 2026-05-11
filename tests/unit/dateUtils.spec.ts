/**
 * Testes unit para src/utils/dateUtils.ts
 *
 * Framework: vitest. Roda com: npx vitest run dateUtils
 *
 * Cobertura: 15 casos cobrindo as 6 funções públicas. Timezone Brasil
 * (UTC-3) hardcoded em duas estratégias: offset manual (-3h em milissegundos)
 * e `toLocaleString` com `timeZone: 'America/Sao_Paulo'`. Testes validam
 * ambas via fake timers (vi.setSystemTime) e ISO strings determinísticos.
 */

import { vi, describe, it, expect, afterEach } from 'vitest';
import {
  getBrazilDate,
  getBrazilDateTime,
  formatDateBR,
  formatDateTimeBR,
  getCurrentBrazilTime,
  formatTimestampForExcel,
} from '../../src/utils/dateUtils';

afterEach(() => {
  // Garante que qualquer fake timer seja revertido entre testes.
  vi.useRealTimers();
});

describe('getBrazilDate', () => {
  it('1. retorna string formato YYYY-MM-DD (10 caracteres, regex match)', () => {
    const result = getBrazilDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.length).toBe(10);
  });

  it('2. 02:00 UTC → 23h BRT do dia anterior → retorna dia anterior', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T02:00:00Z'));
    expect(getBrazilDate()).toBe('2026-05-10');
  });

  it('3. 12:00 UTC → 09h BRT → retorna mesmo dia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T12:00:00Z'));
    expect(getBrazilDate()).toBe('2026-05-11');
  });

  it('4. virada de ano: 31/12 03:00 UTC → 31/12 00:00 BRT', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T03:00:00Z'));
    expect(getBrazilDate()).toBe('2026-12-31');
  });
});

describe('getBrazilDateTime', () => {
  it('5. retorna Date object com getTime válido', () => {
    const result = getBrazilDateTime();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(0);
  });

  it('6. delta entre getBrazilDateTime e Date.now é exatamente -3h', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T15:00:00Z'));
    const brazil = getBrazilDateTime();
    const utc = new Date();
    const diffMs = brazil.getTime() - utc.getTime();
    expect(diffMs).toBe(-3 * 60 * 60 * 1000);
  });
});

describe('formatDateBR', () => {
  it('7. data normal YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(formatDateBR('2026-05-11')).toBe('11/05/2026');
  });

  it('8. primeiro dia do ano', () => {
    expect(formatDateBR('2026-01-01')).toBe('01/01/2026');
  });

  it('9. último dia do ano', () => {
    expect(formatDateBR('2026-12-31')).toBe('31/12/2026');
  });
});

describe('formatDateTimeBR', () => {
  it('10. ISO UTC 15:30 → 12:30 BRT mesmo dia (formato com vírgula)', () => {
    expect(formatDateTimeBR('2026-05-11T15:30:00Z')).toBe('11/05/2026, 12:30');
  });

  it('11. ISO UTC 02:00 → 23:00 BRT dia anterior', () => {
    expect(formatDateTimeBR('2026-05-11T02:00:00Z')).toBe('10/05/2026, 23:00');
  });

  it('12. ISO UTC com segundos: HH:MM trunca segundos no output', () => {
    expect(formatDateTimeBR('2026-05-11T15:30:45Z')).toBe('11/05/2026, 12:30');
  });
});

describe('getCurrentBrazilTime', () => {
  it('13. formato HH:MM 24h (5 caracteres)', () => {
    const result = getCurrentBrazilTime();
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result.length).toBe(5);
  });

  it('14. mock 2026-05-11T15:30:00Z → 12:30 BRT', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T15:30:00Z'));
    expect(getCurrentBrazilTime()).toBe('12:30');
  });
});

describe('formatTimestampForExcel', () => {
  it('15. ISO UTC 15:30:45 → 12:30:45 BRT (com segundos)', () => {
    expect(formatTimestampForExcel('2026-05-11T15:30:45Z')).toBe('11/05/2026, 12:30:45');
  });
});
