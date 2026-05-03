/**
 * Testes unit para src/utils/bankHoursCalculator.ts
 *
 * Framework: vitest. Roda com: npx vitest run bankHoursCalculator
 *
 * Cobertura: 26 casos cobrindo as 4 fórmulas, 3 ações de débito, 2 ações de
 * crédito, separação noturna, edge cases (jornada=0, dailyRate=0, valores
 * negativos, noturno > total) e arredondamento a centavos.
 */

import { describe, it, expect } from 'vitest';
import {
  applyBankHours,
  calculateHourValue,
  type BankHoursSettings,
} from '../../src/utils/bankHoursCalculator';

// Helper: settings padrão pra reduzir boilerplate. Todos os testes começam
// daqui e sobrescrevem só os campos relevantes ao caso.
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

describe('calculateHourValue', () => {
  it('1. daily_div_8: dailyRate=100 → hora = 12.50', () => {
    expect(
      calculateHourValue({
        dailyRate: 100,
        jornadaMinutes: 480,
        formula: 'daily_div_8',
        customValue: 0,
        extraMultiplier: 1.5,
      }),
    ).toBe(12.5);
  });

  it('2. daily_div_jornada com jornada 440min (7h20): hora ≈ 10.91', () => {
    const v = calculateHourValue({
      dailyRate: 80,
      jornadaMinutes: 440,
      formula: 'daily_div_jornada',
      customValue: 0,
      extraMultiplier: 1.5,
    });
    expect(v).toBeCloseTo(80 / (440 / 60), 2);
  });

  it('3. daily_div_jornada com jornada 0 → fallback /8', () => {
    expect(
      calculateHourValue({
        dailyRate: 100,
        jornadaMinutes: 0,
        formula: 'daily_div_jornada',
        customValue: 0,
        extraMultiplier: 1.5,
      }),
    ).toBe(12.5);
  });

  it('4. hour_extra_multiplier 1.5x: hora = 18.75', () => {
    expect(
      calculateHourValue({
        dailyRate: 100,
        jornadaMinutes: 480,
        formula: 'hour_extra_multiplier',
        customValue: 0,
        extraMultiplier: 1.5,
      }),
    ).toBe(18.75);
  });

  it('5. hour_extra_multiplier 2.0x (domingo CLT): hora = 25.00', () => {
    expect(
      calculateHourValue({
        dailyRate: 100,
        jornadaMinutes: 480,
        formula: 'hour_extra_multiplier',
        customValue: 0,
        extraMultiplier: 2.0,
      }),
    ).toBe(25);
  });

  it('6. custom_hour_value: usa valor exato passado', () => {
    expect(
      calculateHourValue({
        dailyRate: 100,
        jornadaMinutes: 480,
        formula: 'custom_hour_value',
        customValue: 30,
        extraMultiplier: 1.5,
      }),
    ).toBe(30);
  });
});

describe('applyBankHours - toggle off', () => {
  it('7. Toggle OFF → applied=false, todos zeros, reason=toggle_off', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 120,
      debitMinutes: 0,
      settings: defaultSettings({ bank_hours_apply_in_payment: false }),
    });
    expect(result.applied).toBe(false);
    expect(result.amountCredit).toBe(0);
    expect(result.amountDebit).toBe(0);
    expect(result.amountNet).toBe(0);
    expect(result.reason).toBe('toggle_off');
  });
});

describe('applyBankHours - fórmulas básicas', () => {
  it('8. daily_div_8 com 2h crédito → amountCredit = 25.00', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 120,
      debitMinutes: 0,
      settings: defaultSettings(),
    });
    expect(result.amountCredit).toBe(25);
    expect(result.amountDebit).toBe(0);
    expect(result.amountNet).toBe(25);
    expect(result.applied).toBe(true);
    expect(result.hourValueUsed).toBe(12.5);
  });

  it('9. daily_div_jornada (jornada 7h20) com 2h crédito → amountCredit ≈ 21.82', () => {
    const result = applyBankHours({
      dailyRate: 80,
      jornadaMinutes: 440,
      creditMinutes: 120,
      debitMinutes: 0,
      settings: defaultSettings({ bank_hours_formula: 'daily_div_jornada' }),
    });
    expect(result.amountCredit).toBeCloseTo(21.82, 2);
  });

  it('10. hour_extra_multiplier 1.5x com 2h crédito → amountCredit = 37.50', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 120,
      debitMinutes: 0,
      settings: defaultSettings({
        bank_hours_formula: 'hour_extra_multiplier',
        bank_hours_extra_multiplier: 1.5,
      }),
    });
    expect(result.amountCredit).toBe(37.5);
  });

  it('11. custom_hour_value 25.00/h com 2h crédito → amountCredit = 50.00', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 120,
      debitMinutes: 0,
      settings: defaultSettings({
        bank_hours_formula: 'custom_hour_value',
        bank_hours_custom_value: 25,
      }),
    });
    expect(result.amountCredit).toBe(50);
  });
});

describe('applyBankHours - ações de crédito/débito', () => {
  it('12. credit_action=no_apply: amountCredit=0 mas breakdown mantém valor (auditoria)', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 120,
      debitMinutes: 0,
      settings: defaultSettings({ bank_hours_credit_action: 'no_apply' }),
    });
    expect(result.amountCredit).toBe(0);
    expect(result.amountNet).toBe(0);
    // Breakdown mantém o valor calculado (pra debug/auditoria)
    expect(result.breakdown.creditDay).toBeGreaterThan(0);
  });

  it('13. debit_action=no_apply: amountDebit=0', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 0,
      debitMinutes: 120,
      settings: defaultSettings({ bank_hours_debit_action: 'no_apply' }),
    });
    expect(result.amountDebit).toBe(0);
    expect(result.amountNet).toBe(0);
  });

  it('14. debit_action=warn_only: amountDebit=0, reason=warn_only_no_subtract', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 0,
      debitMinutes: 120,
      settings: defaultSettings({ bank_hours_debit_action: 'warn_only' }),
    });
    expect(result.amountDebit).toBe(0);
    expect(result.applied).toBe(true);
    expect(result.reason).toBe('warn_only_no_subtract');
  });
});

describe('applyBankHours - horas noturnas', () => {
  it('15. night_separate=true: 30min diurno + 30min noturno → diurno + noturno×1.20', () => {
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
    expect(result.amountCredit).toBe(13.75);
    expect(result.breakdown.creditDay).toBe(6.25);
    expect(result.breakdown.creditNight).toBe(7.5);
  });

  it('16. night_separate=false ignora nightCreditMinutes (vai tudo como diurno)', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 60,
      nightCreditMinutes: 30, // ignorado pq night_separate=false
      debitMinutes: 0,
      settings: defaultSettings({ bank_hours_night_separate: false }),
    });
    expect(result.amountCredit).toBe(12.5);
    expect(result.breakdown.creditNight).toBe(0);
  });

  it('17. night_separate=true sem nightCreditMinutes → tudo diurno (default 0)', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 60,
      debitMinutes: 0,
      settings: defaultSettings({ bank_hours_night_separate: true }),
    });
    expect(result.amountCredit).toBe(12.5);
    expect(result.breakdown.creditNight).toBe(0);
  });

  it('18. extra_multiplier 1.5 + night_multiplier 1.20: noturno = 1.5 × 1.20 sobre hora normal', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 60,
      nightCreditMinutes: 60, // tudo noturno
      debitMinutes: 0,
      settings: defaultSettings({
        bank_hours_formula: 'hour_extra_multiplier',
        bank_hours_extra_multiplier: 1.5,
        bank_hours_night_separate: true,
        bank_hours_night_multiplier: 1.2,
      }),
    });
    // hora extra = 12.50 × 1.5 = 18.75
    // noturno = 18.75 × 1.20 = 22.50; total = (60/60) × 22.50 = 22.50
    expect(result.amountCredit).toBe(22.5);
  });
});

describe('applyBankHours - casos compostos', () => {
  it('19. Saldo zero (crédito=0, débito=0) → tudo zero, applied=true', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 0,
      debitMinutes: 0,
      settings: defaultSettings(),
    });
    expect(result.applied).toBe(true);
    expect(result.amountCredit).toBe(0);
    expect(result.amountDebit).toBe(0);
    expect(result.amountNet).toBe(0);
  });

  it('20. Crédito 3h e débito 1h → net positivo de 2h (R$ 25)', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 180,
      debitMinutes: 60,
      settings: defaultSettings(),
    });
    expect(result.amountCredit).toBe(37.5);
    expect(result.amountDebit).toBe(12.5);
    expect(result.amountNet).toBe(25);
  });

  it('21. Débito 3h e crédito 1h → net negativo de 2h (-R$ 25)', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 480,
      creditMinutes: 60,
      debitMinutes: 180,
      settings: defaultSettings(),
    });
    expect(result.amountCredit).toBe(12.5);
    expect(result.amountDebit).toBe(37.5);
    expect(result.amountNet).toBe(-25);
  });

  it('22. dailyRate=0 → todos amounts são 0, applied=true, hourValueUsed=0', () => {
    const result = applyBankHours({
      dailyRate: 0,
      jornadaMinutes: 480,
      creditMinutes: 120,
      debitMinutes: 60,
      settings: defaultSettings(),
    });
    expect(result.amountCredit).toBe(0);
    expect(result.amountDebit).toBe(0);
    expect(result.amountNet).toBe(0);
    expect(result.applied).toBe(true);
    expect(result.hourValueUsed).toBe(0);
  });
});

describe('applyBankHours - validações de erro', () => {
  it('23. creditMinutes negativo → throw Error', () => {
    expect(() =>
      applyBankHours({
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: -10,
        debitMinutes: 0,
        settings: defaultSettings(),
      }),
    ).toThrow();
  });

  it('24. debitMinutes negativo → throw Error', () => {
    expect(() =>
      applyBankHours({
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: 0,
        debitMinutes: -10,
        settings: defaultSettings(),
      }),
    ).toThrow();
  });

  it('25. nightCreditMinutes > creditMinutes (com night_separate=true) → throw', () => {
    expect(() =>
      applyBankHours({
        dailyRate: 100,
        jornadaMinutes: 480,
        creditMinutes: 30,
        nightCreditMinutes: 60, // > total!
        debitMinutes: 0,
        settings: defaultSettings({ bank_hours_night_separate: true }),
      }),
    ).toThrow();
  });
});

describe('applyBankHours - arredondamento (centavos)', () => {
  it('26. Valores fracionados arredondam para 2 casas decimais', () => {
    const result = applyBankHours({
      dailyRate: 100,
      jornadaMinutes: 440, // 7h20 → 100/(440/60) = 13.6363...
      creditMinutes: 27,   // 0.45h
      debitMinutes: 0,
      settings: defaultSettings({ bank_hours_formula: 'daily_div_jornada' }),
    });
    // 13.6363... × 0.45 = 6.13636... → 6.14
    expect(result.amountCredit).toBe(6.14);
    // hourValueUsed também 2 casas: 13.6363... → 13.64
    expect(result.hourValueUsed).toBe(13.64);
  });
});
