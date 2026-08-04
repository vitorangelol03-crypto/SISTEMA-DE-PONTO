/**
 * Somas da "Composição do Pagamento" do HOLERITE (achado e corrigido em 04/08/2026).
 *
 * O bug: o `FinancialTab` montava os dados do funcionário SEM estes quatro totais, mas o
 * gerador do PDF os lia (`data.totalDailyRate || 0`). No papel que vai pro funcionário
 * saía "Diárias (N dias) → R$ 0,00" e as linhas de Bonificação B/C1/C2 NEM APARECIAM (o
 * gerador só imprime quando o valor > 0) — enquanto o total bruto e o líquido, que vêm de
 * campos reais, saíam certos. O holerite se contradizia.
 *
 * Roda com: npx vitest run holeriteTotais
 */
import { describe, it, expect } from 'vitest';
import { somarTotaisDoHolerite } from '../../src/utils/holeriteTotals';

describe('somarTotaisDoHolerite', () => {
  it('🎯 soma diárias e bonificações de vários pagamentos', () => {
    const pagamentos = [
      { daily_rate: 120, bonus_b: 10, bonus_c1: 5, bonus_c2: 0 },
      { daily_rate: 120, bonus_b: 10, bonus_c1: 0, bonus_c2: 7.5 },
      { daily_rate: 150, bonus_b: 0, bonus_c1: 5, bonus_c2: 0 },
    ];
    expect(somarTotaisDoHolerite(pagamentos)).toEqual({
      totalDailyRate: 390,
      totalBonusB: 20,
      totalBonusC1: 10,
      totalBonusC2: 7.5,
    });
  });

  it('🎯 o bug: sem pagamento nenhum tudo é zero — e ANTES era esse o valor SEMPRE', () => {
    expect(somarTotaisDoHolerite([])).toEqual({
      totalDailyRate: 0, totalBonusB: 0, totalBonusC1: 0, totalBonusC2: 0,
    });
  });

  it('null e undefined do banco não viram NaN (que imprimiria "R$ NaN" no PDF)', () => {
    const pagamentos = [
      { daily_rate: 100, bonus_b: null, bonus_c1: undefined, bonus_c2: 3 },
      { daily_rate: null, bonus_b: 5 },
    ];
    const t = somarTotaisDoHolerite(pagamentos);
    expect(Object.values(t).every((v) => Number.isFinite(v)), 'nenhum NaN').toBe(true);
    expect(t).toEqual({ totalDailyRate: 100, totalBonusB: 5, totalBonusC1: 0, totalBonusC2: 3 });
  });

  it('valor vindo como texto do banco também soma', () => {
    const pagamentos = [{ daily_rate: '120.50' as unknown as number, bonus_b: '10' as unknown as number }];
    expect(somarTotaisDoHolerite(pagamentos).totalDailyRate).toBe(120.5);
    expect(somarTotaisDoHolerite(pagamentos).totalBonusB).toBe(10);
  });

  it('centavos não se perdem em 30 diárias', () => {
    const pagamentos = Array.from({ length: 30 }, () => ({ daily_rate: 133.33 }));
    expect(somarTotaisDoHolerite(pagamentos).totalDailyRate).toBeCloseTo(3999.9, 2);
  });

  it('a soma das bonificações bate com o que o PDF vai listar linha a linha', () => {
    // O gerador conta as OCORRENCIAS (bonusCounts) da mesma lista e imprime o VALOR daqui.
    // Se as duas coisas viessem de listas diferentes, o papel mostraria "Bonificação B (2×)"
    // com um valor que não corresponde às 2 ocorrências.
    const pagamentos = [
      { bonus_b: 10 }, { bonus_b: 10 }, { bonus_b: 0 },
    ];
    const ocorrencias = pagamentos.filter((p) => (p.bonus_b ?? 0) > 0).length;
    expect(ocorrencias).toBe(2);
    expect(somarTotaisDoHolerite(pagamentos).totalBonusB).toBe(20);
  });
});
