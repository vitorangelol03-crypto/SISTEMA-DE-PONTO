/**
 * Integrity Checks — Combo I (sub-fase 2.21+2.22).
 *
 * Testes de SANITY que validam invariantes matemáticos do sistema. Cada teste
 * cobre uma propriedade que deve valer pra TODA combinação de inputs (não
 * comportamentos pontuais — esses já estão em bankHoursCalculator.spec.ts).
 *
 * Foco:
 * - Arredondamento consistente (2 casas decimais)
 * - Invariantes de sinais (amountCredit/Debit ≥ 0; amountNet pode ser negativo)
 * - Determinismo (mesma input → mesmo output, sem race ou aleatoriedade)
 * - Consistência de breakdown (soma das partes ≈ total)
 * - Bounds patológicos (dailyRate negativo: calculator é puro, não valida domínio)
 */

import { describe, it, expect } from 'vitest';
import {
  applyBankHours,
  type BankHoursSettings,
} from '../../src/utils/bankHoursCalculator';

function defaultSettings(overrides: Partial<BankHoursSettings> = {}): BankHoursSettings {
  return {
    bank_hours_apply_in_payment: true,
    bank_hours_formula: 'daily_div_8',
    bank_hours_extra_multiplier: 1.5,
    bank_hours_custom_value: 0,
    bank_hours_credit_action: 'add_to_net',
    bank_hours_debit_action: 'subtract_from_net',
    bank_hours_period: 'payment_period',
    bank_hours_display: 'separate_line',
    bank_hours_after_apply: 'zero_balance',
    bank_hours_night_separate: false,
    bank_hours_night_multiplier: 1.2,
    ...overrides,
  };
}

describe('Integrity Checks - Combo I', () => {
  describe('Invariantes matemáticos do calculator', () => {
    it('1. amountNet = amountCredit - amountDebit (sempre, em qualquer combinação)', () => {
      const cases = [
        { creditMinutes: 120, debitMinutes: 60, dailyRate: 100 },
        { creditMinutes: 60, debitMinutes: 180, dailyRate: 80 },
        { creditMinutes: 0, debitMinutes: 0, dailyRate: 100 },
        { creditMinutes: 300, debitMinutes: 0, dailyRate: 50 },
        { creditMinutes: 60, debitMinutes: 60, dailyRate: 100 }, // anula
        { creditMinutes: 1440, debitMinutes: 0, dailyRate: 200 }, // crédito grande
      ];

      for (const c of cases) {
        const result = applyBankHours({
          dailyRate: c.dailyRate,
          jornadaMinutes: 480,
          creditMinutes: c.creditMinutes,
          debitMinutes: c.debitMinutes,
          settings: defaultSettings(),
        });
        // Invariante absoluto: amountNet === round2(amountCredit - amountDebit)
        expect(Math.round((result.amountCredit - result.amountDebit) * 100) / 100)
          .toBe(result.amountNet);
      }
    });

    it('2. hourValueUsed sempre arredondado para no máximo 2 casas decimais', () => {
      const cases = [
        { dailyRate: 80, jornadaMinutes: 440 },  // 80/(440/60) = 10.909...
        { dailyRate: 100, jornadaMinutes: 360 }, // 100/(360/60) = 16.666...
        { dailyRate: 50, jornadaMinutes: 480 },  // 50/8 = 6.25 (2 casas exatas)
        { dailyRate: 87.33, jornadaMinutes: 470 }, // valor caótico
      ];

      for (const c of cases) {
        const result = applyBankHours({
          dailyRate: c.dailyRate,
          jornadaMinutes: c.jornadaMinutes,
          creditMinutes: 60,
          debitMinutes: 0,
          settings: defaultSettings({ bank_hours_formula: 'daily_div_jornada' }),
        });
        const decimalsCount = (result.hourValueUsed.toString().split('.')[1] ?? '').length;
        expect(decimalsCount).toBeLessThanOrEqual(2);
      }
    });

    it('3. amountCredit >= 0 sempre quando dailyRate >= 0 (nunca negativo)', () => {
      // Mesmo com dailyRate=0, credit fica 0
      const r1 = applyBankHours({
        dailyRate: 0,
        jornadaMinutes: 480,
        creditMinutes: 1000,
        debitMinutes: 0,
        settings: defaultSettings(),
      });
      expect(r1.amountCredit).toBeGreaterThanOrEqual(0);

      // Crédito gigante: continua positivo
      const r2 = applyBankHours({
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: 9999,
        debitMinutes: 0,
        settings: defaultSettings(),
      });
      expect(r2.amountCredit).toBeGreaterThanOrEqual(0);
    });

    it('4. amountDebit >= 0 sempre (sem sinal — é valor absoluto)', () => {
      const result = applyBankHours({
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: 0,
        debitMinutes: 600, // 10h
        settings: defaultSettings(),
      });
      expect(result.amountDebit).toBeGreaterThanOrEqual(0);
      // Valor absoluto: débito de 10h × 12.50 = 125 (positivo)
      expect(result.amountDebit).toBe(125);
      // amountNet pode ser negativo (sinal vai pra net, não pra debit)
      expect(result.amountNet).toBeLessThan(0);
      expect(result.amountNet).toBe(-125);
    });
  });

  describe('Consistência de breakdown', () => {
    it('5. breakdown reflete valores brutos mesmo com no_apply (auditoria)', () => {
      const result = applyBankHours({
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: 120,
        debitMinutes: 0,
        settings: defaultSettings({ bank_hours_credit_action: 'no_apply' }),
      });
      // amountCredit zerado pelo action
      expect(result.amountCredit).toBe(0);
      // mas breakdown mostra valor calculado (pra debug/auditoria)
      expect(result.breakdown.creditDay).toBeGreaterThan(0);
      expect(result.breakdown.creditDay).toBe(25); // (120/60) × 12.50
    });

    it('6. breakdown.creditDay + breakdown.creditNight ≈ amountCredit (quando credit ativo + night_separate)', () => {
      const result = applyBankHours({
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: 60,
        nightCreditMinutes: 30,
        debitMinutes: 0,
        settings: defaultSettings({
          bank_hours_night_separate: true,
          bank_hours_night_multiplier: 1.2,
        }),
      });
      // diurno: (30/60) × 12.50 = 6.25
      // noturno: (30/60) × 12.50 × 1.20 = 7.50
      // total: 13.75
      const sum = result.breakdown.creditDay + result.breakdown.creditNight;
      expect(Math.round(sum * 100) / 100).toBe(result.amountCredit);
    });
  });

  describe('Idempotência por configuração', () => {
    it('7. Mesma input + mesma config = mesmo resultado (determinístico, 3 runs)', () => {
      const input = {
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: 120,
        debitMinutes: 30,
        settings: defaultSettings(),
      };

      const result1 = applyBankHours(input);
      const result2 = applyBankHours(input);
      const result3 = applyBankHours(input);

      // Determinístico: 3 runs idênticos
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });

  describe('Bounds de inputs financeiros', () => {
    it('8. dailyRate negativo (caso patológico): tratado consistentemente, invariante mantido', () => {
      // Edge case: dailyRate negativo é INPUT INVÁLIDO de domínio (caller bugado).
      // Calculator é PURO — não valida domínio do caller (validação em outro lugar).
      // Garantia aqui: NÃO joga erro inesperado, e o invariante matemático
      // amountNet = amountCredit - amountDebit continua mantido.
      const result = applyBankHours({
        dailyRate: -100,
        jornadaMinutes: 480,
        creditMinutes: 120,
        debitMinutes: 0,
        settings: defaultSettings(),
      });
      expect(result.applied).toBe(true);
      // hourValueUsed = -100/8 = -12.5 (sinal preservado, sem throw)
      expect(result.hourValueUsed).toBe(-12.5);
      // amountCredit também negativo: (120/60) × -12.5 = -25
      // (não é bug do calculator — é o caller que passou input fora do domínio)
      expect(result.amountCredit).toBe(-25);
      // toBeCloseTo aceita -0 == 0 (Object.is(-0, 0) === false em JS)
      expect(result.amountDebit).toBeCloseTo(0, 5);
      // INVARIANTE matemático mantido mesmo com input patológico
      expect(Math.round((result.amountCredit - result.amountDebit) * 100) / 100)
        .toBe(result.amountNet);
    });
  });
});
