/**
 * Nota dividida em 2 nomes (19/08/2026): a conta das fatias existe em DOIS lados —
 * o app (mostra o valor exato de cada nota na escolha da forma) e o robô (cobra
 * exatamente esses valores). Este teste roda os dois LADO A LADO: se divergirem,
 * o app mostraria um número e o robô recusaria a nota certa.
 */
import { describe, it, expect } from 'vitest';
import { nfSplitSlices as appSlices, nfSplitStillOpen, NF_SPLIT_WINDOW_MIN } from '../../src/utils/nfSplit';
import { nfSplitSlices as fnSlices } from '../../supabase/functions/driver-public-api/nfCheck';

describe('nfSplitSlices — app e robô lado a lado', () => {
  const casos: Array<[number, '50' | '70-30', number, number]> = [
    // 🎯 valores REAIS de hoje:
    [10356.81, '50', 5178.41, 5178.4],       // Andrea (sem LOGGI)
    [10356.81, '70-30', 7249.77, 3107.04],
    [8544.0, '50', 4272.0, 4272.0],          // grupo do João Pedro
    [8544.0, '70-30', 5980.8, 2563.2],
    [316.8, '50', 158.4, 158.4],             // LOGGI da Andrea
    [316.8, '70-30', 221.76, 95.04],
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

  it('varredura: soma fecha pra qualquer total, nas duas formas, nos dois lados', () => {
    for (let cents = 1; cents <= 5000; cents += 7) {
      const total = cents / 100;
      for (const form of ['50', '70-30'] as const) {
        const [a1, a2] = appSlices(total, form);
        const [f1, f2] = fnSlices(total, form);
        expect([a1, a2]).toEqual([f1, f2]);
        expect(Math.round((a1 + a2) * 100)).toBe(cents);
        expect(a1).toBeGreaterThan(0);
        expect(a2).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('nfSplitStillOpen — janela de 10 minutos da segunda nota', () => {
  const t0 = new Date('2026-08-19T15:00:00Z');
  it('dentro dos 10 minutos: aberta', () => {
    expect(nfSplitStillOpen(t0, new Date('2026-08-19T15:09:59Z'))).toBe(true);
    expect(nfSplitStillOpen(t0, new Date('2026-08-19T15:10:00Z'))).toBe(true); // exato ainda vale
  });
  it('passou dos 10 minutos: fechada', () => {
    expect(nfSplitStillOpen(t0, new Date('2026-08-19T15:10:01Z'))).toBe(false);
  });
  it('a constante é a decisão do Victor (10)', () => {
    expect(NF_SPLIT_WINDOW_MIN).toBe(10);
  });
});
