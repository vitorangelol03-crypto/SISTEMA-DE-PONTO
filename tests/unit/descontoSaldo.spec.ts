/**
 * Desconto por PESSOA, com saldo (07/08/2026).
 *
 * O pedido do Victor, com o print da janela do relatório aberta: *"se eu pagar todos os grupos
 * somente shopee e aplicar os descontos, e depois gerar um pagamento da eMile e selecionar o
 * mesmo grupo, eu poder aplicar os descontos sem que o cara que entrega shopee e eMile tome
 * desconto duas vezes e o cara que entrega eMile tome seu desconto"*.
 *
 * Medido em produção na 1ª quinzena de julho, no dia do pedido:
 *  - **25 pessoas** com vale/perda, somando **R$ 1.885,14** (o número que aparecia no print);
 *  - **as 25 já tinham sido descontadas** (espelho publicado com abate e/ou marca de pagamento
 *    com abate) — ou seja, marcar a caixa cobraria os R$ 1.885,14 **em dobro**;
 *  - **2 casos** em que o desconto é maior que o pagamento de uma plataforma sozinha:
 *    JOÃO PEDRO DA SILVEIRA SILVA (deve R$ 97,89, menor plataforma R$ 28,00) e
 *    Bruno Eduardo Silva (deve R$ 59,99, menor plataforma R$ 34,00).
 */
import { describe, it, expect } from 'vitest';
import {
  saldoDevedor,
  abaterAgora,
  resumoDesconto,
  type PessoaDesconto,
} from '../../src/utils/descontoSaldo';

const pessoa = (over: Partial<PessoaDesconto> & { driverId: string }): PessoaDesconto => ({
  name: over.driverId,
  total: 0,
  jaAbatido: 0,
  brutoNoEscopo: 10_000, // teto alto por padrão: quem quer testar o teto informa
  ...over,
});

describe('saldoDevedor', () => {
  it('deve o valor cheio quando nunca foi abatido', () => {
    expect(saldoDevedor({ total: 116.54, jaAbatido: 0 })).toBe(116.54);
  });

  it('deve a diferença quando já abateu um pedaço', () => {
    expect(saldoDevedor({ total: 97.89, jaAbatido: 28 })).toBe(69.89);
  });

  it('não deve nada quando já foi quitado', () => {
    expect(saldoDevedor({ total: 116.54, jaAbatido: 116.54 })).toBe(0);
  });

  it('abatido a mais NÃO vira crédito a favor dele', () => {
    expect(saldoDevedor({ total: 50, jaAbatido: 80 })).toBe(0);
  });

  it('sem vale nem perda, não há saldo', () => {
    expect(saldoDevedor({ total: 0, jaAbatido: 0 })).toBe(0);
  });

  it('centavos fecham (nada de 69.88999999999999)', () => {
    expect(saldoDevedor({ total: 0.3, jaAbatido: 0.1 })).toBe(0.2);
  });
});

describe('abaterAgora', () => {
  const deve100 = { total: 100, jaAbatido: 0 };

  it('modo "nenhum": não abate nada, nem de quem deve', () => {
    expect(abaterAgora('nenhum', deve100, 500)).toBe(0);
  });

  it('modo "todos": abate o valor cheio, IGNORANDO o que já foi abatido (comportamento antigo)', () => {
    expect(abaterAgora('todos', { total: 100, jaAbatido: 100 }, 500)).toBe(100);
  });

  it('modo "todos": não respeita o teto — a linha pode ficar negativa, como sempre foi', () => {
    expect(abaterAgora('todos', deve100, 28)).toBe(100);
  });

  it('🎯 modo "pendentes": quem já foi descontado não é descontado de novo', () => {
    expect(abaterAgora('pendentes', { total: 116.54, jaAbatido: 116.54 }, 500)).toBe(0);
  });

  it('🎯 modo "pendentes": quem nunca foi descontado toma o desconto dele', () => {
    expect(abaterAgora('pendentes', deve100, 500)).toBe(100);
  });

  it('🔑 modo "pendentes": nunca abate mais do que ele recebe (JOÃO PEDRO: deve 97,89, recebe 28)', () => {
    expect(abaterAgora('pendentes', { total: 97.89, jaAbatido: 0 }, 28)).toBe(28);
  });

  it('🔑 e no pagamento seguinte sai o que sobrou (69,89), se couber', () => {
    expect(abaterAgora('pendentes', { total: 97.89, jaAbatido: 28 }, 400)).toBe(69.89);
  });

  it('quem não recebe nada nesta plataforma não tem de onde abater', () => {
    expect(abaterAgora('pendentes', deve100, 0)).toBe(0);
  });

  it('sem vale nem perda, não abate nada em modo nenhum', () => {
    for (const m of ['pendentes', 'todos', 'nenhum'] as const) {
      expect(abaterAgora(m, { total: 0, jaAbatido: 0 }, 500)).toBe(0);
    }
  });
});

describe('resumoDesconto — a conta que a janela mostra antes de baixar', () => {
  it('🎯 o caso do Victor: paga Shopee, depois paga eMile no mesmo grupo', () => {
    // Primeiro pagamento (Shopee): ninguém foi descontado ainda.
    const soShopee = pessoa({ driverId: 'so-shopee', total: 50, jaAbatido: 0, brutoNoEscopo: 900 });
    const osDois = pessoa({ driverId: 'shopee-e-emile', total: 80, jaAbatido: 0, brutoNoEscopo: 1200 });
    const soEmile = pessoa({ driverId: 'so-emile', total: 60, jaAbatido: 0, brutoNoEscopo: 0 });

    const shopee = resumoDesconto('pendentes', [soShopee, osDois, soEmile]);
    expect(shopee.vaoDescontar.map((l) => l.driverId).sort()).toEqual(['shopee-e-emile', 'so-shopee']);
    expect(shopee.totalDescontar).toBe(130); // 50 + 80
    // Quem só entrega eMile não recebe nada aqui: fica devendo, e a janela avisa.
    expect(shopee.sobrando.map((l) => l.driverId)).toEqual(['so-emile']);
    expect(shopee.totalSobrando).toBe(60);

    // Segundo pagamento (eMile), mesmo grupo — agora com o livro-caixa da rodada anterior.
    const emile = resumoDesconto('pendentes', [
      { ...osDois, jaAbatido: 80, brutoNoEscopo: 700 },
      { ...soEmile, jaAbatido: 0, brutoNoEscopo: 640 },
    ]);
    // 🔑 O que entrega as duas NÃO é descontado de novo...
    expect(emile.jaDescontados.map((l) => l.driverId)).toEqual(['shopee-e-emile']);
    // ...e o que só entrega eMile toma o desconto dele agora.
    expect(emile.vaoDescontar).toEqual([{ driverId: 'so-emile', name: 'so-emile', valor: 60 }]);
    expect(emile.totalDescontar).toBe(60);
    expect(emile.sobrando).toEqual([]);
  });

  it('🔴 modo "todos" no mesmo cenário cobra em dobro — é o bug que motivou a mudança', () => {
    const r = resumoDesconto('todos', [
      pessoa({ driverId: 'ja-pago', total: 116.54, jaAbatido: 116.54, brutoNoEscopo: 800 }),
    ]);
    expect(r.totalDescontar).toBe(116.54); // cobrado DE NOVO
    expect(r.jaDescontados).toEqual([]);   // e o modo nem sabe que já tinha sido
  });

  it('🔑 desconto que não cabe: abate o que dá e mostra a sobra (caso JOÃO PEDRO)', () => {
    const r = resumoDesconto('pendentes', [
      pessoa({ driverId: 'joao-pedro', name: 'JOAO PEDRO', total: 97.89, brutoNoEscopo: 28 }),
      pessoa({ driverId: 'bruno', name: 'Bruno Eduardo', total: 59.99, brutoNoEscopo: 34 }),
    ]);
    expect(r.vaoDescontar).toEqual([
      { driverId: 'bruno', name: 'Bruno Eduardo', valor: 34 },
      { driverId: 'joao-pedro', name: 'JOAO PEDRO', valor: 28 },
    ]);
    expect(r.sobrando).toEqual([
      { driverId: 'joao-pedro', name: 'JOAO PEDRO', valor: 69.89 },
      { driverId: 'bruno', name: 'Bruno Eduardo', valor: 25.99 },
    ]);
    expect(r.totalDescontar).toBe(62);
    expect(r.totalSobrando).toBe(95.88);
  });

  it('quem não tem vale nem perda não aparece em lista nenhuma (o erro do aviso antigo)', () => {
    const r = resumoDesconto('pendentes', [
      pessoa({ driverId: 'sem-nada', total: 0, brutoNoEscopo: 2000 }),
      pessoa({ driverId: 'deve', total: 10, brutoNoEscopo: 2000 }),
    ]);
    expect(r.vaoDescontar).toEqual([{ driverId: 'deve', name: 'deve', valor: 10 }]);
    expect(r.jaDescontados).toEqual([]);
    expect(r.sobrando).toEqual([]);
  });

  it('modo "nenhum": ninguém é descontado, e nada é dado como quitado', () => {
    const r = resumoDesconto('nenhum', [
      pessoa({ driverId: 'a', total: 40, brutoNoEscopo: 500 }),
      pessoa({ driverId: 'b', total: 60, jaAbatido: 60, brutoNoEscopo: 500 }),
    ]);
    expect(r.vaoDescontar).toEqual([]);
    expect(r.jaDescontados).toEqual([]);
    expect(r.totalDescontar).toBe(0);
  });

  it('📸 retrato de produção: 25 pessoas, R$ 1.885,14, TODAS já descontadas', () => {
    // As 25 com o abate já feito: em "pendentes" ninguém é cobrado de novo.
    // 24 × 75,41 + 75,30 = 1.885,14 — cada desconto é dinheiro de uma pessoa, então o
    // arredondamento é POR PESSOA; somar primeiro e arredondar depois daria outro número.
    const vinteECinco = Array.from({ length: 25 }, (_, i) => {
      const valor = i === 24 ? 75.3 : 75.41;
      return pessoa({ driverId: `d${i}`, total: valor, jaAbatido: valor, brutoNoEscopo: 900 });
    });
    const r = resumoDesconto('pendentes', vinteECinco);
    expect(r.vaoDescontar).toEqual([]);
    expect(r.totalDescontar).toBe(0);
    expect(r.jaDescontados).toHaveLength(25);
    // 🔴 No modo antigo ("todos"), esses mesmos R$ 1.885,14 sairiam de novo.
    expect(resumoDesconto('todos', vinteECinco).totalDescontar).toBe(1885.14);
  });
});
