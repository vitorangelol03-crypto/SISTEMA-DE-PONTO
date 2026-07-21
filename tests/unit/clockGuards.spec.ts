import { describe, it, expect } from 'vitest';
import {
  QUICK_EXIT_CONFIRM_MINUTES,
  AUTO_LOGOUT_SECONDS,
  minutesSince,
  quickExitMinutes,
} from '../../src/components/employee-clock/clockGuards';

// Decisões do Victor (2026-07-20): confirmação de saída antes de 10 min;
// tela volta ao início 35s após registrar o ponto.
describe('constantes decididas', () => {
  it('confirmação de saída: 10 minutos', () => {
    expect(QUICK_EXIT_CONFIRM_MINUTES).toBe(10);
  });
  it('auto-retorno ao início: 35 segundos', () => {
    expect(AUTO_LOGOUT_SECONDS).toBe(35);
  });
});

describe('minutesSince', () => {
  const now = new Date('2026-07-20T10:45:28.000Z');
  it('12 segundos atrás → 0 minutos (caso Diendrel)', () => {
    expect(minutesSince('2026-07-20T10:45:16.000Z', now)).toBe(0);
  });
  it('9min59s atrás → 9 minutos', () => {
    expect(minutesSince('2026-07-20T10:35:29.000Z', now)).toBe(9);
  });
  it('10min atrás → 10 minutos', () => {
    expect(minutesSince('2026-07-20T10:35:28.000Z', now)).toBe(10);
  });
  it('sem timestamp → null', () => {
    expect(minutesSince(null, now)).toBeNull();
    expect(minutesSince(undefined, now)).toBeNull();
  });
  it('timestamp inválido → null', () => {
    expect(minutesSince('nada-a-ver', now)).toBeNull();
  });
  it('timestamp no futuro (relógio torto) → 0, não negativo', () => {
    expect(minutesSince('2026-07-20T10:50:00.000Z', now)).toBe(0);
  });
});

describe('quickExitMinutes — precisa confirmar?', () => {
  const now = new Date('2026-07-20T10:45:28.000Z');
  it('saída 12s após a entrada → confirma (0 minutos)', () => {
    expect(quickExitMinutes('2026-07-20T10:45:16.000Z', now)).toBe(0);
  });
  it('saída 9 minutos após → confirma (9)', () => {
    expect(quickExitMinutes('2026-07-20T10:36:00.000Z', now)).toBe(9);
  });
  it('saída 10 minutos após → NÃO confirma (null)', () => {
    expect(quickExitMinutes('2026-07-20T10:35:28.000Z', now)).toBeNull();
  });
  it('saída horas depois (dia normal) → NÃO confirma', () => {
    expect(quickExitMinutes('2026-07-20T02:06:52.000Z', now)).toBeNull();
  });
  it('sem entrada registrada → NÃO confirma (servidor rejeita de todo jeito)', () => {
    expect(quickExitMinutes(null, now)).toBeNull();
  });
});
