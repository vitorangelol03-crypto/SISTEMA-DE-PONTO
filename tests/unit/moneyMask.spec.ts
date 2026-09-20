import { describe, it, expect } from 'vitest';
import { HIDDEN_VALUE, moneyBRL } from '../../src/utils/moneyMask';

/**
 * O formatador de dinheiro das telas de Financeiro, Pagamento C6 e Erros.
 *
 * Ganhou o ponto do milhar em 19/09/2026 (a tela escrevia "R$ 1700,00" enquanto os PDFs
 * escreviam "R$ 1.700,00") e, com isso, ganhou lógica — e teste, que não tinha nenhum.
 */

describe('moneyBRL', () => {
  it('🎯 separa o milhar, como os PDFs sempre fizeram', () => {
    expect(moneyBRL(1000, true)).toBe('R$ 1.000,00');
    expect(moneyBRL(1700, true)).toBe('R$ 1.700,00');
    expect(moneyBRL(12345.6, true)).toBe('R$ 12.345,60');
    expect(moneyBRL(158000, true)).toBe('R$ 158.000,00');
    expect(moneyBRL(1234567.89, true)).toBe('R$ 1.234.567,89');
  });

  it('abaixo de mil continua exatamente como era', () => {
    expect(moneyBRL(0, true)).toBe('R$ 0,00');
    expect(moneyBRL(0.5, true)).toBe('R$ 0,50');
    expect(moneyBRL(99.9, true)).toBe('R$ 99,90');
    expect(moneyBRL(999.99, true)).toBe('R$ 999,99');
  });

  it('o ponto entra exatamente a partir do quarto dígito', () => {
    expect(moneyBRL(999, true)).toBe('R$ 999,00');
    expect(moneyBRL(1000, true)).toBe('R$ 1.000,00');
  });

  it('negativo leva o sinal na frente do R$', () => {
    expect(moneyBRL(-1700, true)).toBe('-R$ 1.700,00');
    expect(moneyBRL(-0.01, true)).toBe('-R$ 0,01');
  });

  it('🎯 o espaço é o COMUM, não o não-quebrável do Intl', () => {
    // O `Intl.NumberFormat` usaria U+00A0 aqui, e toda comparação de texto (E2E, busca
    // do navegador, `includes`) deixaria de casar por um caractere que ninguém vê.
    expect(moneyBRL(1700, true).charCodeAt(2)).toBe(32);
    expect(moneyBRL(1700, true)).not.toContain(' ');
  });

  it('sem permissão, nenhum valor vaza', () => {
    expect(moneyBRL(1700, false)).toBe(HIDDEN_VALUE);
    expect(moneyBRL(-999999, false)).toBe(HIDDEN_VALUE);
  });

  it('número quebrado não espalha "NaN" pela tela', () => {
    expect(moneyBRL(NaN, true)).toBe('R$ 0,00');
    expect(moneyBRL(Infinity, true)).toBe('R$ 0,00');
    expect(moneyBRL(-Infinity, true)).toBe('-R$ 0,00');
  });

  it('arredonda para dois decimais, como sempre fez', () => {
    expect(moneyBRL(1700.005, true)).toBe('R$ 1.700,01');
    expect(moneyBRL(1700.004, true)).toBe('R$ 1.700,00');
  });
});
