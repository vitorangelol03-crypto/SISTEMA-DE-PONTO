import { describe, it, expect } from 'vitest';
import { mergeDriverRatePriority } from '../../src/services/driverPay';

/**
 * Regressão do bug das taxas do import (2026-07-18): driver com pacotes lançados
 * em SÓ UMA plataforma (ex.: SHOPEE 2,15) importava as OUTRAS plataformas pelo
 * default (2,00), ignorando a taxa individual configurada no cadastro (2,15).
 * Efeito real: 33 lançamentos de ~19 drivers, R$ 1.186,70 a menos na quinzena.
 *
 * Regra fixada: config individual explícita > última taxa usada > default (no chamador).
 */
describe('mergeDriverRatePriority — config individual ganha da última taxa usada', () => {
  it('caso do bug (João): só SHOPEE lançada; config manda no eMile', () => {
    const config = { eMile: 2.15, SHOPEE: 2.15, ANJUN: 2.15 };
    const lastUsed = { SHOPEE: 2.15 }; // último pagamento só tinha SHOPEE
    expect(mergeDriverRatePriority(config, lastUsed)).toEqual({ eMile: 2.15, SHOPEE: 2.15, ANJUN: 2.15 });
  });

  it('config diverge do snapshot antigo → config ganha', () => {
    expect(mergeDriverRatePriority({ eMile: 2.5 }, { eMile: 2.0 })).toEqual({ eMile: 2.5 });
  });

  it('driver sem config → usa a última taxa usada', () => {
    expect(mergeDriverRatePriority({}, { eMile: 2.3, ANJUN: 2.2 })).toEqual({ eMile: 2.3, ANJUN: 2.2 });
  });

  it('plataforma sem config nem histórico → ausente (chamador cai no default)', () => {
    expect(mergeDriverRatePriority({ SHOPEE: 2.15 }, {})).toEqual({ SHOPEE: 2.15 });
  });

  it('tudo vazio → vazio (chamador usa só defaults das plataformas)', () => {
    expect(mergeDriverRatePriority({}, {})).toEqual({});
  });
});
