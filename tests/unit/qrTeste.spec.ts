/**
 * Partes puras da página de teste do QR no tablet (entrega B, 06/10/2026).
 * Roda com: npx vitest run qrTeste
 */
import { describe, it, expect } from 'vitest';
import {
  MEDICOES_ZERADAS,
  ehCodigoDeTeste,
  gerarCodigoDeTeste,
  mediaMs,
  somarMedicao,
} from '../../src/utils/qrTeste';

describe('gerarCodigoDeTeste — código curto (QR versão 1, poucos quadradinhos)', () => {
  it('formato "PT-" + 6 símbolos, sem I/O/0/1 (os que se confundem)', () => {
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigoDeTeste();
      expect(c).toMatch(/^PT-[A-HJ-NP-Z2-9]{6}$/);
      expect(ehCodigoDeTeste(c)).toBe(true);
    }
  });

  it('usa os bytes recebidos (determinístico com fonte fixa)', () => {
    const zeros = () => new Uint8Array(6);
    expect(gerarCodigoDeTeste(zeros)).toBe('PT-AAAAAA');
    const sobe = () => Uint8Array.from([0, 1, 2, 31, 32, 255]);
    // 255 % 32 = 31 -> '9'; 32 % 32 = 0 -> 'A'
    expect(gerarCodigoDeTeste(sobe)).toBe('PT-ABC9A9');
  });
});

describe('ehCodigoDeTeste — o leitor ignora qualquer outro QR', () => {
  it('recusa texto que não é desta página', () => {
    expect(ehCodigoDeTeste('https://exemplo.com')).toBe(false);
    expect(ehCodigoDeTeste('PT-ABC12')).toBe(false); // curto
    expect(ehCodigoDeTeste('PT-ABCDE1')).toBe(false); // "1" não existe no alfabeto
    expect(ehCodigoDeTeste('pt-abcdef')).toBe(false); // minúsculas
    expect(ehCodigoDeTeste(null)).toBe(false);
    expect(ehCodigoDeTeste(undefined)).toBe(false);
  });
});

describe('somarMedicao / mediaMs', () => {
  it('acumula tentativas, acertos, soma e pior tempo — sem mudar o objeto recebido', () => {
    let m = MEDICOES_ZERADAS;
    m = somarMedicao(m, 10, false);
    m = somarMedicao(m, 30, true);
    m = somarMedicao(m, 20, true);
    expect(m).toEqual({ tentativas: 3, acertos: 2, somaMs: 60, maxMs: 30 });
    expect(mediaMs(m)).toBe(20);
    expect(MEDICOES_ZERADAS).toEqual({ tentativas: 0, acertos: 0, somaMs: 0, maxMs: 0 });
  });

  it('tempo inválido conta a tentativa com 0 ms; média sem tentativas é 0', () => {
    expect(somarMedicao(MEDICOES_ZERADAS, Number.NaN, false)).toEqual({ tentativas: 1, acertos: 0, somaMs: 0, maxMs: 0 });
    expect(mediaMs(MEDICOES_ZERADAS)).toBe(0);
  });
});
