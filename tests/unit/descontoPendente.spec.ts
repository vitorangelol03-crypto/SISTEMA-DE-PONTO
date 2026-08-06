/**
 * 🔴 O aviso de "desconto pendente" que assustava à toa (05/08/2026).
 *
 * O Victor perguntou, olhando a janela do relatório: *"se eu aplicar os descontos agora, vão
 * ser aplicados somente os descontos faltantes?"*. A resposta era **não** — a caixa é
 * tudo-ou-nada — e o aviso vermelho estava empurrando ele pra marcar.
 *
 * Medido no banco naquele momento:
 *  - o aviso listava **55** entregadores;
 *  - **38 deles não tinham vale nem perda nenhum** (nada a descontar);
 *  - os **17** restantes já tinham abatido **na outra plataforma** (sem abate na eMile, com
 *    abate na Shopee/LOGGI);
 *  - pendente de verdade: **ZERO**. E marcar a caixa cobraria de novo de 25 pessoas —
 *    R$ 1.885,14 em dobro.
 */
import { describe, it, expect } from 'vitest';
import { descontosPendentes, totalPendente, type PessoaPaga } from '../../src/utils/descontoPendente';

const pessoa = (over: Partial<PessoaPaga> & { driverId: string }): PessoaPaga => ({
  name: over.driverId,
  pagoSemDesconto: false,
  pagoComDesconto: false,
  valeOuPerda: 0,
  abatidoEmEspelho: false,
  ...over,
});

describe('descontosPendentes', () => {
  it('🎯 pendente de verdade: tem valor, foi pago sem abater, e ninguém abateu', () => {
    const r = descontosPendentes([
      pessoa({ driverId: 'joao', name: 'Joao', pagoSemDesconto: true, valeOuPerda: 50 }),
    ]);
    expect(r).toEqual([{ driverId: 'joao', name: 'Joao', valor: 50 }]);
  });

  it('🔴 quem NÃO tem vale nem perda sai da lista (eram 38 dos 55)', () => {
    const r = descontosPendentes([
      pessoa({ driverId: 'sem-nada', pagoSemDesconto: true, valeOuPerda: 0 }),
    ]);
    expect(r).toEqual([]);
  });

  it('🔴 pago SEM abater numa plataforma mas COM abate noutra não é pendente', () => {
    // Caso real do WINGLISON: eMile sem desconto, LOGGI e SHOPEE com desconto. Cobrar de
    // novo seria o desconto duplo que o Victor queria evitar.
    const r = descontosPendentes([
      pessoa({ driverId: 'winglison', pagoSemDesconto: true, pagoComDesconto: true, valeOuPerda: 211.06 }),
    ]);
    expect(r).toEqual([]);
  });

  it('🔴 já abatido no espelho publicado também não é pendente', () => {
    const r = descontosPendentes([
      pessoa({ driverId: 'x', pagoSemDesconto: true, valeOuPerda: 90, abatidoEmEspelho: true }),
    ]);
    expect(r).toEqual([]);
  });

  it('quem ainda não foi pago em lugar nenhum não entra (não há pendência de pagamento)', () => {
    const r = descontosPendentes([pessoa({ driverId: 'novo', valeOuPerda: 120 })]);
    expect(r).toEqual([]);
  });

  it('ordena do maior valor pro menor — o que dói mais aparece primeiro', () => {
    const r = descontosPendentes([
      pessoa({ driverId: 'a', pagoSemDesconto: true, valeOuPerda: 10 }),
      pessoa({ driverId: 'b', pagoSemDesconto: true, valeOuPerda: 200 }),
      pessoa({ driverId: 'c', pagoSemDesconto: true, valeOuPerda: 75 }),
    ]);
    expect(r.map((p) => p.driverId)).toEqual(['b', 'c', 'a']);
  });

  it('🎯 o retrato de produção: 55 listados, pendente de verdade = zero', () => {
    const producao: PessoaPaga[] = [
      ...Array.from({ length: 38 }, (_, i) =>
        pessoa({ driverId: `sem-vale-${i}`, pagoSemDesconto: true, valeOuPerda: 0 })),
      ...Array.from({ length: 17 }, (_, i) =>
        pessoa({ driverId: `ja-abatido-${i}`, pagoSemDesconto: true, pagoComDesconto: true, valeOuPerda: 100 })),
    ];
    expect(producao).toHaveLength(55);
    expect(descontosPendentes(producao)).toEqual([]);
  });

  it('lista vazia devolve vazio', () => {
    expect(descontosPendentes([])).toEqual([]);
  });
});

describe('totalPendente', () => {
  it('soma o que está pendente, em centavos exatos', () => {
    expect(totalPendente([
      { driverId: 'a', name: 'A', valor: 10.1 },
      { driverId: 'b', name: 'B', valor: 20.2 },
    ])).toBe(30.3);
  });

  it('vazio = zero', () => {
    expect(totalPendente([])).toBe(0);
  });
});
