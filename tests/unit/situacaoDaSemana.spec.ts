import { describe, it, expect } from 'vitest';
import { situacaoDaSemana, detalheDoPagamento } from '../../src/utils/situacaoDaSemana';

/**
 * 🔴 "PAGO" PASSOU A SIGNIFICAR QUE ALGUÉM CONFIRMOU (11/09/2026).
 *
 * Até hoje o sistema marcava `paid` SOZINHO em toda semana cujo `end_date` já
 * tinha passado — toda vez que alguém abria o sistema. Ninguém confirmava nada,
 * e por isso as 45 semanas de Caratinga apareciam todas como pagas.
 *
 * Pedido do Victor: *"como é que vai ser feito agora pra confirmação que está
 * pago ou não… na aba de gerar arquivo de pagamento vai ter um botãozinho, e vai
 * marcar como pago"*.
 *
 * Estes testes travam as três regras que essa mudança criou.
 */

describe('as três situações da semana', () => {
  it('🎯 ABERTA: a semana está correndo, aceita lançamento', () => {
    const s = situacaoDaSemana('open');
    expect(s.texto).toBe('ABERTA');
    expect(s.aceitaLancamento).toBe(true);
    expect(s.podeConfirmar, 'dá pra pagar adiantado').toBe(true);
  });

  it('🎯 A CONFIRMAR: acabou mas ninguém confirmou — AINDA aceita lançamento', () => {
    const s = situacaoDaSemana('closed');
    expect(s.texto).toBe('A CONFIRMAR');
    // É justamente esta a janela pra lançar o erro que faltou, antes de pagar.
    expect(s.aceitaLancamento, 'a janela pra lançar o que faltou').toBe(true);
    expect(s.podeConfirmar).toBe(true);
  });

  it('🎯 paga: NÃO aceita mais lançamento (decisão do Victor)', () => {
    const s = situacaoDaSemana('paid', '9999');
    expect(s.texto).toBe('paga');
    expect(s.aceitaLancamento, 'o pagamento já saiu').toBe(false);
    expect(s.podeConfirmar, 'não dá pra confirmar duas vezes').toBe(false);
  });

  it('status estranho cai no mais RESTRITO, não no mais solto', () => {
    // Se um dia aparecer um status novo, o seguro é não deixar mexer em
    // dinheiro — o contrário abriria a semana errada pra lançamento.
    for (const esquisito of ['', null, undefined, 'sei-la', 'PAID']) {
      const s = situacaoDaSemana(esquisito as string);
      expect(s.aceitaLancamento, `"${esquisito}" não pode liberar lançamento`).toBe(false);
      expect(s.podeConfirmar).toBe(false);
    }
  });
});

describe('o detalhe que explica a situação', () => {
  it('🎯 paga SEM quem confirmou: diz que foi o sistema antigo', () => {
    // São as 45 de Caratinga. O texto precisa deixar claro que ninguém conferiu.
    const t = detalheDoPagamento('paid', null, null);
    expect(t).toMatch(/sistema antigo/i);
    expect(t).toMatch(/n[ãa]o h[áa] registro de quem confirmou/i);
  });

  it('paga COM quem confirmou: diz o nome e a data', () => {
    const t = detalheDoPagamento('paid', '9999', '2026-09-11T15:00:00Z');
    expect(t).toContain('9999');
    expect(t).toMatch(/11\/09\/2026/);
  });

  it('a confirmar: diz onde confirmar', () => {
    expect(detalheDoPagamento('closed')).toMatch(/arquivo de pagamento/i);
  });

  it('aberta: diz que está correndo', () => {
    expect(detalheDoPagamento('open')).toMatch(/correndo/i);
  });
});
