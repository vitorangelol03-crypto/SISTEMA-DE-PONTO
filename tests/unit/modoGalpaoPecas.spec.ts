/**
 * MODO GALPÃO — as peças pequenas (06/10/2026, plano do tablet sem toque, entrega A):
 *  - o MOTIVO real da recusa do servidor chega na tela (antes: "Erro ao registrar ponto");
 *  - o tablet lembra o último modo galpão que o servidor disse (soluço de rede ao abrir não pode
 *    fazer o tablet onde ninguém toca voltar pro descanso que pede toque);
 *  - o bipe quando o ponto entra (decisão 14) nunca derruba a batida.
 *
 * Roda com: npx vitest run modoGalpaoPecas
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  RecusaDoServidor, clockErrorMessage,
} from '../../src/components/employee-clock/clockMessages';
import {
  esquecerSegredoDoTablet, lembrarModoGalpao, lerModoGalpaoLembrado,
} from '../../src/components/employee-clock/clockDeviceStorage';
import { tocarBipe } from '../../src/components/employee-clock/bipe';

describe('clockErrorMessage — o motivo real da recusa', () => {
  it('recusa do servidor (4xx) mostra o motivo dele', () => {
    expect(clockErrorMessage(new RecusaDoServidor('Seu cadastro foi encerrado em 15/09/2026. Se isso não está certo, procure o responsável.', 403)))
      .toBe('❌ Seu cadastro foi encerrado em 15/09/2026. Se isso não está certo, procure o responsável.');
    expect(clockErrorMessage(new RecusaDoServidor('CPF não confere', 403))).toBe('❌ CPF não confere');
  });
  it('falha do servidor (5xx) continua com a mensagem genérica (o texto dele não ajuda quem bate o ponto)', () => {
    expect(clockErrorMessage(new RecusaDoServidor('Database error', 500))).toBe('❌ Erro ao registrar ponto. Tente novamente.');
  });
  it('prazo estourado e erro de rede: as mensagens de sempre', () => {
    expect(clockErrorMessage(new DOMException('aborted', 'AbortError')))
      .toBe('❌ Tempo esgotado. Verifique sua conexão e tente novamente.');
    expect(clockErrorMessage(new TypeError('Failed to fetch'))).toBe('❌ Erro ao registrar ponto. Tente novamente.');
  });
});

describe('modo galpão lembrado no tablet', () => {
  afterEach(() => localStorage.clear());

  it('nasce desligado; guarda o último que o servidor disse', () => {
    expect(lerModoGalpaoLembrado()).toBe(false);
    lembrarModoGalpao(true);
    expect(lerModoGalpaoLembrado()).toBe(true);
    lembrarModoGalpao(false);
    expect(lerModoGalpaoLembrado()).toBe(false);
  });

  it('fica lembrado mesmo quando o segredo do tablet é apagado (tablet removido → "Tablet desconectado")', () => {
    localStorage.setItem('clock_device_token_v1', 'segredo');
    lembrarModoGalpao(true);
    esquecerSegredoDoTablet();
    expect(localStorage.getItem('clock_device_token_v1')).toBeNull();
    expect(lerModoGalpaoLembrado()).toBe(true);
  });

  it('armazenamento bloqueado: lê desligado e não derruba a tela', () => {
    const ler = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(lerModoGalpaoLembrado()).toBe(false);
      expect(() => lembrarModoGalpao(true)).not.toThrow();
    } finally {
      ler.mockRestore();
      gravar.mockRestore();
      aviso.mockRestore();
    }
  });
});

describe('tocarBipe (decisão 14)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('navegador sem som (sem AudioContext): não faz nada e não quebra', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => tocarBipe()).not.toThrow();
  });

  it('toca um bipe curto: liga o oscilador e desliga em 0,2 s', () => {
    const oscilador = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const volume = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    class AudioContextFalso {
      state = 'running';
      currentTime = 10;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createOscillator() { return oscilador; }
      createGain() { return volume; }
    }
    vi.stubGlobal('AudioContext', AudioContextFalso);
    tocarBipe();
    expect(oscilador.start).toHaveBeenCalledWith(10);
    expect(oscilador.stop).toHaveBeenCalledWith(10.2);
    expect(oscilador.frequency.value).toBe(880);
  });

  it('o navegador recusa o som: só um aviso no console — o ponto não depende do bipe', () => {
    class AudioContextQueQuebra {
      constructor() { throw new Error('NotAllowedError'); }
    }
    vi.stubGlobal('AudioContext', AudioContextQueQuebra);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => tocarBipe()).not.toThrow();
    } finally {
      aviso.mockRestore();
    }
  });
});
