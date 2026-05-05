import { describe, it, expect } from 'vitest';
import { parseNumericInput, isInRange } from '../../src/utils/numericInputHelpers';

describe('parseNumericInput - Combo I FIX #5', () => {
  describe('Valores numéricos válidos completos', () => {
    it('1. "1.5" → 1.5', () => expect(parseNumericInput('1.5')).toBe(1.5));
    it('2. "0" → 0', () => expect(parseNumericInput('0')).toBe(0));
    it('3. "-1.5" → -1.5', () => expect(parseNumericInput('-1.5')).toBe(-1.5));
    it('4. "0.21" → 0.21 (boundary)', () => expect(parseNumericInput('0.21')).toBe(0.21));
    it('5. "100" → 100 (inteiro)', () => expect(parseNumericInput('100')).toBe(100));
  });

  describe('Vírgula brasileira (UX pt-BR)', () => {
    it('6. "1,5" → 1.5', () => expect(parseNumericInput('1,5')).toBe(1.5));
    it('7. "0,21" → 0.21', () => expect(parseNumericInput('0,21')).toBe(0.21));
    it('8. "12,5" → 12.5', () => expect(parseNumericInput('12,5')).toBe(12.5));
  });

  describe('Digitação intermediária (CRÍTICO pra UX)', () => {
    it('9. "2." → 2 (após digitar antes do decimal)', () => {
      expect(parseNumericInput('2.')).toBe(2);
    });

    it('10. "2," → 2 (após digitar antes do decimal pt-BR)', () => {
      expect(parseNumericInput('2,')).toBe(2);
    });

    it('11. ".5" → 0.5 (sem zero antes)', () => {
      expect(parseNumericInput('.5')).toBe(0.5);
    });

    it('12. ",5" → 0.5 (sem zero antes pt-BR)', () => {
      expect(parseNumericInput(',5')).toBe(0.5);
    });

    it('13. "1." → 1 (já número válido durante digitação)', () => {
      expect(parseNumericInput('1.')).toBe(1);
    });
  });

  describe('Inputs inválidos retornam null', () => {
    it('14. "abc" → null', () => expect(parseNumericInput('abc')).toBeNull());
    it('15. "" → null (vazio)', () => expect(parseNumericInput('')).toBeNull());
    it('16. "1.5.6" → null (dois pontos)', () => expect(parseNumericInput('1.5.6')).toBeNull());
    it('17. "NaN" → null', () => expect(parseNumericInput('NaN')).toBeNull());
  });

  describe('Edge cases', () => {
    it('18. " 2.5 " (espaços) → 2.5 (trim)', () => {
      expect(parseNumericInput(' 2.5 ')).toBe(2.5);
    });

    it('19. "1.5e10" → 15000000000 (notação científica)', () => {
      expect(parseNumericInput('1.5e10')).toBe(15000000000);
    });

    it('20. ", " → null (só vírgula com espaço)', () => {
      expect(parseNumericInput(', ')).toBeNull();
    });
  });
});

describe('isInRange - Combo I FIX #5', () => {
  it('21. 1.0 a 3.0: 0.99 fora → false', () => expect(isInRange(0.99, 1.0, 3.0)).toBe(false));
  it('22. 1.0 a 3.0: 1.0 boundary inferior → true', () => expect(isInRange(1.0, 1.0, 3.0)).toBe(true));
  it('23. 1.0 a 3.0: 2.0 meio → true', () => expect(isInRange(2.0, 1.0, 3.0)).toBe(true));
  it('24. 1.0 a 3.0: 3.0 boundary superior → true', () => expect(isInRange(3.0, 1.0, 3.0)).toBe(true));
  it('25. 1.0 a 3.0: 3.01 fora → false', () => expect(isInRange(3.01, 1.0, 3.0)).toBe(false));
});
