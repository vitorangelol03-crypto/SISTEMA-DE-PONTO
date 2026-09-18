import { describe, it, expect } from 'vitest';
import {
  TABELA_INSS_2026,
  TABELA_IRRF_2026,
  calcularInss,
  calcularIrrf,
  faixaAplicada,
  type TabelaDoInss,
} from '../../src/utils/folha/impostos';

/**
 * INSS — GABARITO REAL: 11 dos 12 recibos de Julho/2026 da contabilidade Arruda.
 *
 * A Silvia fica de fora de propósito: o INSS dela incidiu sobre férias pagas num recibo
 * à parte, então a base do papel não corresponde ao mês. Os números abaixo foram
 * EXTRAÍDOS do PDF, não digitados.
 */
const RECIBOS = [
  { nome: 'CAMILA VITORIA MARTINS', base: 1772.87, inss: 135.23, faixaNoPapel: '9,00%' },
  { nome: 'EDILAINE DOS SANTOS FERREIRA GOMES', base: 1777.89, inss: 135.69, faixaNoPapel: '9,00%' },
  { nome: 'FABIO DE PAULA LUCIO', base: 1392.56, inss: 104.44, faixaNoPapel: '7,50%' },
  { nome: 'GEANDRA MARIA DE OLIVEIRA LIMA', base: 1773.29, inss: 135.27, faixaNoPapel: '9,00%' },
  { nome: 'ICARO DA COSTA BITENCOURT', base: 1773.42, inss: 135.28, faixaNoPapel: '9,00%' },
  { nome: 'KAMILA CRISTINA FERNANDES ALVES', base: 2008.05, inss: 156.40, faixaNoPapel: '9,00%' },
  { nome: 'KEILAMARA SOUZA LANNA', base: 2298.60, inss: 182.55, faixaNoPapel: '9,00%' },
  { nome: 'MAYCON JUNIOR PEREIRA DOS SANTOS', base: 2315.78, inss: 184.10, faixaNoPapel: '9,00%' },
  { nome: 'MIRIANE MESSIAS HONORATO', base: 1777.73, inss: 135.67, faixaNoPapel: '9,00%' },
  { nome: 'TUANY KELY CARVALHO LIMA DA SILVA', base: 2122.81, inss: 166.73, faixaNoPapel: '9,00%' },
  { nome: 'VITORIA APARECIDA DE CASTRO', base: 1241.09, inss: 93.08, faixaNoPapel: '7,50%' },
];

describe('INSS — contra os 11 recibos reais', () => {
  for (const r of RECIBOS) {
    it(`${r.nome}: base ${r.base} → R$ ${r.inss}`, () => {
      expect(calcularInss(r.base, TABELA_INSS_2026)).toBe(r.inss);
    });
  }

  it('a faixa impressa no papel é a que a pessoa alcançou, não a que ela paga no total', () => {
    for (const r of RECIBOS) {
      const faixa = faixaAplicada(r.base, TABELA_INSS_2026.faixas);
      expect(`${faixa.toFixed(2).replace('.', ',')}%`).toBe(r.faixaNoPapel);
    }
  });

  it('é progressivo: a Camila aparece com 9% e paga 7,6% efetivos', () => {
    const efetivo = (135.23 / 1772.87) * 100;
    expect(efetivo).toBeGreaterThan(7.5);
    expect(efetivo).toBeLessThan(9);
    expect(calcularInss(1772.87, TABELA_INSS_2026)).toBe(135.23);
  });
});

describe('INSS — regras que o recibo não mostra', () => {
  it('base zerada não gera contribuição', () => {
    expect(calcularInss(0, TABELA_INSS_2026)).toBe(0);
    expect(calcularInss(-100, TABELA_INSS_2026)).toBe(0);
  });

  it('quem ganha acima do teto contribui como se ganhasse o teto', () => {
    const noTeto = calcularInss(TABELA_INSS_2026.teto, TABELA_INSS_2026);
    expect(calcularInss(50000, TABELA_INSS_2026)).toBe(noTeto);
  });

  it('é truncado, nunca arredondado para cima', () => {
    // 1.392,56 × 7,5% = 104,442 → 104,44 (o papel do Fábio)
    expect(calcularInss(1392.56, TABELA_INSS_2026)).toBe(104.44);
  });

  it('a tabela é dado, não código: mudar as faixas muda a conta', () => {
    const outra: TabelaDoInss = { faixas: [{ ate: null, aliquota: 10 }], teto: 0 };
    expect(calcularInss(1000, outra)).toBe(100);
  });
});

/**
 * IRRF — ⚠️ SEM GABARITO. Nenhum dos 12 recibos pagou imposto de renda (todos abaixo da
 * isenção), então estes testes provam a REGRA que a Receita manda aplicar, não que o
 * número bate com a contabilidade. Os valores da tabela ficam na tela de Configurações,
 * marcados como não confirmados até o contador do Victor conferir.
 */
describe('IRRF — a regra, não o gabarito', () => {
  it('quem está na faixa de isenção não paga nada', () => {
    const r = calcularIrrf(2000, 150, 0, TABELA_IRRF_2026);
    expect(r.valor).toBe(0);
  });

  it('escolhe o caminho que dá MENOS imposto (decisão do Victor)', () => {
    // Salário alto e sem dependentes: o desconto simplificado costuma ganhar.
    const r = calcularIrrf(5000, 500, 0, TABELA_IRRF_2026);
    expect(r.caminho).toBe('simplificado');
    expect(r.valor).toBeLessThanOrEqual(
      calcularIrrf(5000, 500, 0, { ...TABELA_IRRF_2026, descontoSimplificado: 0 }).valor,
    );
  });

  it('com muitos dependentes, o caminho das deduções pode ganhar', () => {
    const r = calcularIrrf(5000, 500, 5, TABELA_IRRF_2026);
    expect(r.caminho).toBe('deducoes');
  });

  it('é progressivo: cada faixa só sobre a parte dela', () => {
    // Base de 3.000 pelo simplificado: 3.000 − 607,20 = 2.392,80, ainda isento.
    expect(calcularIrrf(3000, 0, 0, TABELA_IRRF_2026).valor).toBe(0);
    // Base de 3.500: 3.500 − 607,20 = 2.892,80 → parte na faixa de 7,5% e parte na de 15%.
    const r = calcularIrrf(3500, 0, 0, TABELA_IRRF_2026);
    expect(r.valor).toBeGreaterThan(0);
    expect(r.valor).toBeLessThan(2892.8 * 0.15);
  });

  it('o INSS abate a base no caminho das deduções', () => {
    const semInss = calcularIrrf(6000, 0, 0, { ...TABELA_IRRF_2026, descontoSimplificado: 0 });
    const comInss = calcularIrrf(6000, 600, 0, { ...TABELA_IRRF_2026, descontoSimplificado: 0 });
    expect(comInss.valor).toBeLessThan(semInss.valor);
  });

  it('base negativa não vira imposto', () => {
    expect(calcularIrrf(0, 0, 0, TABELA_IRRF_2026).valor).toBe(0);
    expect(calcularIrrf(100, 500, 0, TABELA_IRRF_2026).valor).toBe(0);
  });
});
