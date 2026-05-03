/**
 * Calculadora de aplicação de banco de horas no pagamento.
 *
 * Lógica 100% pura — sem chamadas a database, sem React, sem side effects.
 * Recebe inputs explícitos e retorna `BankHoursResult`. Testável isoladamente.
 *
 * REGRAS DE NEGÓCIO:
 * - Arredondamento: 2 casas decimais (centavos), via `Math.round(v * 100) / 100`.
 * - Toggle OFF (`bank_hours_apply_in_payment=false`): retorna `applied=false`,
 *   tudo zero, `reason='toggle_off'`. Caller deve respeitar.
 * - Override individual (caller decide aplicar mesmo com toggle off, ou pular
 *   mesmo com toggle on) NÃO é tratado aqui — quem chama resolve qual valor
 *   passar em `settings.bank_hours_apply_in_payment`.
 *
 * 4 fórmulas de conversão hora → R$:
 *   - `daily_div_8`:           hora = dailyRate / 8 (CLT padrão)
 *   - `daily_div_jornada`:     hora = dailyRate / (jornadaMinutes/60);
 *                              fallback para /8 se jornada inválida (≤0)
 *   - `hour_extra_multiplier`: hora = (dailyRate / 8) × extraMultiplier
 *   - `custom_hour_value`:     hora = customValue (R$/h fixo)
 *
 * Horas noturnas (quando `night_separate=true`):
 * - Caller separa `creditMinutes` em diurno + noturno via `nightCreditMinutes`
 *   (idem para débito). Noturno é SUBSET do total, validado por throw se exceder.
 * - Multiplier noturno (`night_multiplier`) é aplicado APENAS na parcela noturna,
 *   por cima do valor calculado pela fórmula.
 * - Quando `night_separate=false`, parcelas noturnas são ignoradas (tudo conta
 *   como diurno).
 *
 * Ações configuráveis (granular crédito vs débito):
 * - `credit_action`:
 *     - `add_to_net` → soma o valor calculado ao líquido
 *     - `no_apply`   → ignora crédito (`amountCredit=0`)
 * - `debit_action`:
 *     - `subtract_from_net` → subtrai do líquido
 *     - `no_apply`          → ignora débito (`amountDebit=0`)
 *     - `warn_only`         → não desconta, marca `reason='warn_only_no_subtract'`
 *
 * O `breakdown` sempre reflete os valores BRUTOS calculados (pré-ação), pra
 * facilitar debug ("calculou X, mas a config zerou").
 *
 * Validações por throw:
 * - `creditMinutes`/`debitMinutes` < 0 → `Error`
 * - `nightCreditMinutes`/`nightDebitMinutes` < 0 → `Error`
 * - `nightCreditMinutes > creditMinutes` (ou idem débito) → `Error`
 *   (noturno tem que ser subset do total)
 */

import type {
  BankHoursAfterApply,
  BankHoursCreditAction,
  BankHoursDebitAction,
  BankHoursDisplay,
  BankHoursFormula,
  BankHoursPeriod,
} from '../services/database';

// Re-export pros consumidores não precisarem importar de database.ts diretamente.
export type {
  BankHoursAfterApply,
  BankHoursCreditAction,
  BankHoursDebitAction,
  BankHoursDisplay,
  BankHoursFormula,
  BankHoursPeriod,
};

// Settings completo — todos os campos obrigatórios. Caller normaliza a row da
// `companies` (resolvendo nulls/undefineds com defaults) antes de chamar.
export interface BankHoursSettings {
  bank_hours_apply_in_payment: boolean;
  bank_hours_formula: BankHoursFormula;
  bank_hours_extra_multiplier: number;
  bank_hours_custom_value: number;
  bank_hours_credit_action: BankHoursCreditAction;
  bank_hours_debit_action: BankHoursDebitAction;
  bank_hours_period: BankHoursPeriod;
  bank_hours_display: BankHoursDisplay;
  bank_hours_after_apply: BankHoursAfterApply;
  bank_hours_night_separate: boolean;
  bank_hours_night_multiplier: number;
}

export interface BankHoursInput {
  /** R$ por dia trabalhado. */
  dailyRate: number;
  /** Minutos da jornada esperada do funcionário (usado pela fórmula daily_div_jornada). */
  jornadaMinutes: number;
  /** Saldo positivo do banco em minutos (≥ 0). */
  creditMinutes: number;
  /** Saldo negativo do banco em minutos, expresso como positivo (≥ 0). */
  debitMinutes: number;
  /** Parcela noturna do crédito; obrigatório se `night_separate=true`. Default 0. */
  nightCreditMinutes?: number;
  /** Parcela noturna do débito; obrigatório se `night_separate=true`. Default 0. */
  nightDebitMinutes?: number;
  settings: BankHoursSettings;
}

export interface BankHoursBreakdown {
  creditDay: number;
  creditNight: number;
  debitDay: number;
  debitNight: number;
}

export interface BankHoursResult {
  /** R$ a somar ao líquido (após aplicar `credit_action`). */
  amountCredit: number;
  /** R$ a subtrair do líquido (positivo, após aplicar `debit_action`). */
  amountDebit: number;
  /** `amountCredit - amountDebit` (pode ser negativo). */
  amountNet: number;
  /** `false` quando toggle OFF; `true` quando o cálculo rodou (mesmo que zerado por config). */
  applied: boolean;
  /** Motivo de não-aplicação ou aplicação parcial. Ex: 'toggle_off', 'warn_only_no_subtract'. */
  reason?: string;
  /** R$/hora efetivamente usado (pós-fórmula, arredondado). */
  hourValueUsed: number;
  formulaUsed: BankHoursFormula;
  /** Componentes brutos pré-ação — útil pra debug e auditoria. */
  breakdown: BankHoursBreakdown;
}

// ─── Helpers internos ──────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be >= 0 (got ${value})`);
  }
}

// ─── API pública ───────────────────────────────────────────────────────────

export function calculateHourValue(input: {
  dailyRate: number;
  jornadaMinutes: number;
  formula: BankHoursFormula;
  customValue: number;
  extraMultiplier: number;
}): number {
  switch (input.formula) {
    case 'daily_div_8':
      return input.dailyRate / 8;
    case 'daily_div_jornada':
      // Fallback para /8 quando jornada inválida — evita divisão por zero
      // e mantém comportamento previsível pra funcionários sem jornada definida.
      if (!input.jornadaMinutes || input.jornadaMinutes <= 0) {
        return input.dailyRate / 8;
      }
      return input.dailyRate / (input.jornadaMinutes / 60);
    case 'hour_extra_multiplier':
      return (input.dailyRate / 8) * input.extraMultiplier;
    case 'custom_hour_value':
      return input.customValue;
  }
}

export function applyBankHours(input: BankHoursInput): BankHoursResult {
  const { settings } = input;

  // Validações de input — créditos/débitos não podem ser negativos.
  assertNonNegative('creditMinutes', input.creditMinutes);
  assertNonNegative('debitMinutes', input.debitMinutes);
  if (input.nightCreditMinutes !== undefined) {
    assertNonNegative('nightCreditMinutes', input.nightCreditMinutes);
  }
  if (input.nightDebitMinutes !== undefined) {
    assertNonNegative('nightDebitMinutes', input.nightDebitMinutes);
  }

  // Caso 1: toggle desligado — não aplica nada.
  if (!settings.bank_hours_apply_in_payment) {
    return {
      amountCredit: 0,
      amountDebit: 0,
      amountNet: 0,
      applied: false,
      reason: 'toggle_off',
      hourValueUsed: 0,
      formulaUsed: settings.bank_hours_formula,
      breakdown: { creditDay: 0, creditNight: 0, debitDay: 0, debitNight: 0 },
    };
  }

  const hourValue = calculateHourValue({
    dailyRate: input.dailyRate,
    jornadaMinutes: input.jornadaMinutes,
    formula: settings.bank_hours_formula,
    customValue: settings.bank_hours_custom_value,
    extraMultiplier: settings.bank_hours_extra_multiplier,
  });

  // Separação dia/noite. Quando night_separate=false, parcelas noturnas
  // viram zero e tudo conta como diurno (sem multiplier extra).
  const useNightSeparate = settings.bank_hours_night_separate;
  const nightCreditMin = input.nightCreditMinutes ?? 0;
  const nightDebitMin = input.nightDebitMinutes ?? 0;

  if (useNightSeparate) {
    if (nightCreditMin > input.creditMinutes) {
      throw new Error(
        `nightCreditMinutes (${nightCreditMin}) cannot exceed creditMinutes (${input.creditMinutes})`,
      );
    }
    if (nightDebitMin > input.debitMinutes) {
      throw new Error(
        `nightDebitMinutes (${nightDebitMin}) cannot exceed debitMinutes (${input.debitMinutes})`,
      );
    }
  }

  const creditDayMin = useNightSeparate
    ? input.creditMinutes - nightCreditMin
    : input.creditMinutes;
  const creditNightMin = useNightSeparate ? nightCreditMin : 0;
  const debitDayMin = useNightSeparate
    ? input.debitMinutes - nightDebitMin
    : input.debitMinutes;
  const debitNightMin = useNightSeparate ? nightDebitMin : 0;

  const nightMultiplier = useNightSeparate ? settings.bank_hours_night_multiplier : 1;

  // Componentes brutos (sempre calculados — entram em breakdown mesmo com no_apply).
  const creditDay = (creditDayMin / 60) * hourValue;
  const creditNight = (creditNightMin / 60) * hourValue * nightMultiplier;
  const debitDayRaw = (debitDayMin / 60) * hourValue;
  const debitNightRaw = (debitNightMin / 60) * hourValue * nightMultiplier;

  // Crédito: zera quando ação for no_apply.
  const amountCredit = settings.bank_hours_credit_action === 'add_to_net'
    ? creditDay + creditNight
    : 0;

  // Débito: subtract_from_net aplica; warn_only/no_apply zeram.
  let amountDebit = 0;
  let reason: string | undefined;
  if (settings.bank_hours_debit_action === 'subtract_from_net') {
    amountDebit = debitDayRaw + debitNightRaw;
  } else if (settings.bank_hours_debit_action === 'warn_only') {
    reason = 'warn_only_no_subtract';
  }

  const breakdown: BankHoursBreakdown = {
    creditDay: round2(creditDay),
    creditNight: round2(creditNight),
    debitDay: round2(debitDayRaw),
    debitNight: round2(debitNightRaw),
  };

  return {
    amountCredit: round2(amountCredit),
    amountDebit: round2(amountDebit),
    amountNet: round2(amountCredit - amountDebit),
    applied: true,
    reason,
    hourValueUsed: round2(hourValue),
    formulaUsed: settings.bank_hours_formula,
    breakdown,
  };
}
