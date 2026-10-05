import { describe, it, expect } from 'vitest';
import {
  QUICK_EXIT_CONFIRM_MINUTES,
  AUTO_LOGOUT_SECONDS,
  TABLET_VOLTA_APOS_SUCESSO_SEGUNDOS,
  TABLET_VOLTA_APOS_FALHA_SEGUNDOS,
  TABLET_TELA_LARGADA_SEGUNDOS,
  CAMERA_DESCANSA_APOS_MS,
  RECEM_BATIDO_MS,
  minutesSince,
  quickExitMinutes,
  marcacaoAnteriorDaSaida,
  marcacaoAnterior,
  nomeDaMarcacaoAnterior,
} from '../../src/components/employee-clock/clockGuards';
import type { Attendance } from '../../src/services/database';

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

// Decisões do Victor (05/10/2026) pro tablet de ponto.
describe('constantes do tablet', () => {
  it('volta ao início: 8s depois de gravar, 15s depois de um erro', () => {
    expect(TABLET_VOLTA_APOS_SUCESSO_SEGUNDOS).toBe(8);
    expect(TABLET_VOLTA_APOS_FALHA_SEGUNDOS).toBe(15);
  });
  it('câmera descansa com 1 minuto sem ninguém; quem acabou de bater é ignorado por 1 minuto', () => {
    expect(CAMERA_DESCANSA_APOS_MS).toBe(60_000);
    expect(RECEM_BATIDO_MS).toBe(60_000);
  });
  it('tela largada no meio volta sozinha com 45s sem toque', () => {
    expect(TABLET_TELA_LARGADA_SEGUNDOS).toBe(45);
  });
});

describe('marcação anterior — botão (celular) x rosto (tablet)', () => {
  const dia: Attendance = {
    entry_time: '2026-10-05T11:00:00.000Z',
    entry_1_time: '2026-10-05T11:00:00.000Z',
    exit_1_time: '2026-10-05T15:00:00.000Z',
    entry_2_time: '2026-10-05T16:00:00.000Z',
  } as Attendance;

  it('botão: igual a antes — saída almoço → entrada, saída final → volta do almoço, saída simples → entrada', () => {
    expect(marcacaoAnteriorDaSaida(dia, 2)).toBe(dia.entry_1_time);
    expect(marcacaoAnteriorDaSaida(dia, 4)).toBe(dia.entry_2_time);
    expect(marcacaoAnteriorDaSaida(dia, undefined)).toBe(dia.entry_time);
  });
  it('botão: a volta do almoço continua SEM pergunta (confere contra a entrada da manhã, como sempre)', () => {
    expect(marcacaoAnteriorDaSaida(dia, 3)).toBe(dia.entry_time);
  });
  it('rosto: cada marcação confere contra a anterior — a volta do almoço (3) contra a saída do almoço (2)', () => {
    expect(marcacaoAnterior(dia, 2)).toBe(dia.entry_1_time);
    expect(marcacaoAnterior(dia, 3)).toBe(dia.exit_1_time);
    expect(marcacaoAnterior(dia, 4)).toBe(dia.entry_2_time);
    expect(marcacaoAnterior(dia, undefined)).toBe(dia.entry_time);
  });
  it('o texto da pergunta diz qual foi a marcação anterior', () => {
    expect(nomeDaMarcacaoAnterior(2)).toBe('a entrada');
    expect(nomeDaMarcacaoAnterior(3)).toBe('a saída do almoço');
    expect(nomeDaMarcacaoAnterior(4)).toBe('a volta do almoço');
    expect(nomeDaMarcacaoAnterior(undefined)).toBe('a entrada');
  });
});
