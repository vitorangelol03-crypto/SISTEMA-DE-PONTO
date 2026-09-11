/**
 * Nota dividida em 2 nomes (19/08/2026): a conta das fatias existe em DOIS lados —
 * o app (mostra o valor exato de cada nota na escolha da forma) e o robô (cobra
 * exatamente esses valores). Este teste roda os dois LADO A LADO: se divergirem,
 * o app mostraria um número e o robô recusaria a nota certa.
 */
import { describe, it, expect } from 'vitest';
import {
  nfSplitSlices as appSlices,
  nfSplitSlices,
  nfSplitStillOpen,
  NF_SPLIT_WINDOW_MIN,
  repartirLiquidoPorTomador,
} from '../../src/utils/nfSplit';
import {
  nfSplitSlices as fnSlices,
  repartirLiquidoPorTomador as fnReparte,
} from '../../supabase/functions/driver-public-api/nfCheck';

describe('nfSplitSlices — app e robô lado a lado', () => {
  const casos: Array<[number, '50', number, number]> = [
    // 🎯 valores REAIS de hoje:
    [10356.81, '50', 5178.41, 5178.4],       // Andrea (sem LOGGI)
    [8544.0, '50', 4272.0, 4272.0],          // grupo do João Pedro
    [316.8, '50', 158.4, 158.4],             // LOGGI da Andrea
    // centavo ímpar: a 1ª leva o centavo, a soma fecha:
    [0.03, '50', 0.02, 0.01],
    [100.01, '50', 50.01, 50.0],
  ];

  it.each(casos)('%s em %s → %s + %s (e a soma fecha)', (total, form, p1, p2) => {
    const app = appSlices(total, form);
    const fn = fnSlices(total, form);
    expect(app).toEqual([p1, p2]);
    expect(fn).toEqual(app); // 🎯 as duas contas NUNCA podem divergir
    expect(Math.round((app[0] + app[1]) * 100) / 100).toBe(total);
  });

  it('varredura: soma fecha pra qualquer total, nos dois lados', () => {
    for (let cents = 1; cents <= 5000; cents += 7) {
      const total = cents / 100;
      const [a1, a2] = appSlices(total, '50');
      const [f1, f2] = fnSlices(total, '50');
      expect([a1, a2]).toEqual([f1, f2]);
      expect(Math.round((a1 + a2) * 100)).toBe(cents);
      expect(a1).toBeGreaterThan(0);
      expect(a2).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('nfSplitStillOpen — janela de 30 minutos da segunda nota', () => {
  const t0 = new Date('2026-08-19T15:00:00Z');
  it('dentro dos 30 minutos: aberta', () => {
    expect(nfSplitStillOpen(t0, new Date('2026-08-19T15:29:59Z'))).toBe(true);
    expect(nfSplitStillOpen(t0, new Date('2026-08-19T15:30:00Z'))).toBe(true); // exato ainda vale
  });
  it('passou dos 30 minutos: fechada', () => {
    expect(nfSplitStillOpen(t0, new Date('2026-08-19T15:30:01Z'))).toBe(false);
  });
  it('a constante é a decisão do Victor (30, desde 05/09/2026)', () => {
    expect(NF_SPLIT_WINDOW_MIN).toBe(30);
  });
});

/**
 * A DIVISÃO É DENTRO DE UM CNPJ (10/09/2026) — a repartição do líquido entre os
 * tomadores, com a decisão do Victor: "descontar no que tem o maior valor".
 *
 * O caso de referência é o do GESSILEY, com os números REAIS do banco: Shopee/Anjun/
 * Loggi R$ 14.476,00 e iMile R$ 1.504,60. Foi ele que expôs a mistura de 06/09.
 */
describe('repartirLiquidoPorTomador — cada CNPJ é um bloco fechado', () => {
  const SHOPEE = '8262c79a-df84-417f-a59e-0eb4a57228b9';
  const IMILE = 'ae27bb81-e9ff-411a-a19b-87692dabbea1';
  const reais = [
    { emitterId: IMILE, bruto: 1504.6 },
    { emitterId: SHOPEE, bruto: 14476.0 },
  ];
  /** Atalho: total do tomador no resultado. */
  const doTomador = (r: Array<{ emitterId: string; total: number }>, id: string) =>
    r.find((x) => x.emitterId === id)!.total;

  it('sem vale/perda: cada CNPJ leva exatamente o bruto dele', () => {
    const r = repartirLiquidoPorTomador(reais, 15980.6);
    expect(doTomador(r, SHOPEE)).toBe(14476.0);
    expect(doTomador(r, IMILE)).toBe(1504.6);
  });

  it('🎯 o caso real: dividindo os DOIS, saem 4 pagamentos que somam o líquido', () => {
    const r = repartirLiquidoPorTomador(reais, 15980.6);
    const [s1, s2] = nfSplitSlices(doTomador(r, SHOPEE), '50');
    const [i1, i2] = nfSplitSlices(doTomador(r, IMILE), '50');
    expect([s1, s2]).toEqual([7238.0, 7238.0]);
    expect([i1, i2]).toEqual([752.3, 752.3]);
    expect(Math.round((s1 + s2 + i1 + i2) * 100) / 100).toBe(15980.6);
    // 🔴 O QUE NÃO PODE VOLTAR A ACONTECER: a metade do total COMBINADO (o que o
    // sistema mandava emitir em 06/09) não é fatia legítima de CNPJ nenhum.
    expect([s1, s2, i1, i2]).not.toContain(7990.3);
  });

  it('vale/perda sai do CNPJ de MAIOR valor, e o menor fica intacto', () => {
    const r = repartirLiquidoPorTomador(reais, 15880.6); // R$ 100 de vale
    expect(doTomador(r, SHOPEE)).toBe(14376.0);
    expect(doTomador(r, IMILE)).toBe(1504.6);
  });

  it('desconto maior que o bloco do maior: transborda em vez de ficar negativo', () => {
    const r = repartirLiquidoPorTomador(
      [{ emitterId: SHOPEE, bruto: 300 }, { emitterId: IMILE, bruto: 100 }],
      50, // deve 350
    );
    expect(doTomador(r, SHOPEE)).toBe(0);
    expect(doTomador(r, IMILE)).toBe(50);
    expect(r.reduce((s, x) => s + x.total, 0)).toBe(50);
  });

  it('ganho sem CNPJ vinculado (Zapex) também vai no maior', () => {
    const r = repartirLiquidoPorTomador(reais, 16030.6); // + R$ 50 de Zapex
    expect(doTomador(r, SHOPEE)).toBe(14526.0);
    expect(doTomador(r, IMILE)).toBe(1504.6);
  });

  it('um tomador só: leva o líquido inteiro', () => {
    expect(repartirLiquidoPorTomador([{ emitterId: SHOPEE, bruto: 900 }], 850))
      .toEqual([{ emitterId: SHOPEE, total: 850 }]);
  });

  it('varredura: a soma das partes SEMPRE bate com o líquido (centavo nenhum some)', () => {
    for (let a = 1; a <= 900; a += 13) {
      for (let ded = 0; ded <= 400; ded += 37) {
        const brutos = [
          { emitterId: SHOPEE, bruto: a + 0.07 },
          { emitterId: IMILE, bruto: a / 3 + 0.11 },
        ];
        const somaBrutos = Math.round((brutos[0].bruto + brutos[1].bruto) * 100);
        const liquido = (somaBrutos - Math.round(ded * 100)) / 100;
        const r = repartirLiquidoPorTomador(brutos, liquido);
        expect(r.reduce((s, x) => s + Math.round(x.total * 100), 0)).toBe(Math.round(liquido * 100));
        // Bloco negativo só pode existir quando a unidade INTEIRA está no vermelho
        // (deve mais do que ganhou) — aí a soma tem que fechar negativa mesmo.
        if (liquido >= 0) for (const x of r) expect(x.total).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('unidade no vermelho: o negativo fica no maior e a soma continua fechando', () => {
    const r = repartirLiquidoPorTomador(
      [{ emitterId: SHOPEE, bruto: 300 }, { emitterId: IMILE, bruto: 100 }],
      -50, // deve 450, ganhou 400
    );
    expect(doTomador(r, SHOPEE)).toBe(-50);
    expect(doTomador(r, IMILE)).toBe(0);
    expect(r.reduce((s, x) => s + x.total, 0)).toBe(-50);
  });

  it('ordem estável: empate de bruto desempata pelo id, sem depender da entrada', () => {
    const a = repartirLiquidoPorTomador(
      [{ emitterId: 'bbb', bruto: 100 }, { emitterId: 'aaa', bruto: 100 }], 150);
    const b = repartirLiquidoPorTomador(
      [{ emitterId: 'aaa', bruto: 100 }, { emitterId: 'bbb', bruto: 100 }], 150);
    expect(a).toEqual(b);
  });
});

/**
 * 🔴 A CONTA DO DESCONTO TEM QUE SER A MESMA NOS DOIS LADOS (10/09/2026).
 *
 * Achado por revisão adversarial no mesmo dia: o app tirava o vale de CADA CNPJ
 * (`somaCnpj_*_abatido` = bruto daquele CNPJ − TODOS os descontos) enquanto o
 * relatório tirava só do maior. Medido no LEANDRO: Shopee 18.620,03 + iMile
 * 1.672,03 = 20.292,06 contra os 20.454,03 do espelho — R$ 161,97 sem nota nenhuma.
 * Hoje é uma função só, importada dos dois lados; este teste tranca isso.
 */
describe('a repartição é UMA só — app e robô não podem divergir', () => {
  it('a função do painel É a da edge fn (mesma referência, não duas cópias)', () => {
    expect(repartirLiquidoPorTomador).toBe(fnReparte);
  });

  it('🎯 o caso do LEANDRO: os dois CNPJs somam o total do espelho, sem sumir centavo', () => {
    const brutos = [
      { emitterId: 'shopee', bruto: 18620.03 },
      { emitterId: 'imile', bruto: 1834.0 },
    ];
    const espelho = 20454.03; // printed_total real do banco
    const desconto = 161.97;
    const liquido = Math.round((espelho - desconto) * 100) / 100; // 20.292,06 (float cru dá ...9998)
    const r = repartirLiquidoPorTomador(brutos, liquido);
    expect(Math.round(r.reduce((s, x) => s + x.total, 0) * 100) / 100).toBe(liquido);
    // o desconto sai SÓ do maior; o menor fica intacto
    expect(r.find((x) => x.emitterId === 'imile')!.total).toBe(1834.0);
    expect(r.find((x) => x.emitterId === 'shopee')!.total).toBe(18458.06);
    // 🔴 o jeito ERRADO (descontar dos dois) deixaria R$ 161,97 sem nota
    const errado = (18620.03 - desconto) + (1834.0 - desconto);
    expect(Math.round((espelho - desconto - errado) * 100) / 100).toBe(desconto);
  });
});
