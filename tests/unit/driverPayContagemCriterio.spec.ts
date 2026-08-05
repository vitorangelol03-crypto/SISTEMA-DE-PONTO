/**
 * "Quantos já e quantos faltam" nos botões de ordenar grupos (05/08/2026).
 *
 * Pedido do Victor: "coloca os numerozinhos aqui também: quantos já validou e quantos ainda
 * falta".
 *
 * ⚠️ O número do botão PRECISA usar a mesma régua dos selos que já aparecem no cabeçalho de
 * cada grupo — senão o botão diz um número e a lista mostra outro, e ele perde a confiança
 * na tela. As três réguas são DIFERENTES entre si, e cada diferença tem motivo:
 *   · NF ............. só conta grupo que ESPERA nota;
 *   · espelho no app . basta UM membro (no grupo o espelho vai só pro líder);
 *   · print conferido  precisa de TODOS (o print é por driver).
 *
 * Roda com: npx vitest run driverPayContagemCriterio
 */
import { describe, it, expect } from 'vitest';
import { contagemDoCriterio, type DriverRowData } from '../../src/components/driverpay/driverPayShared';

function row(driverId: string, conferido = false): DriverRowData {
  return {
    paymentId: `pay-${driverId}`, driverId, name: driverId, route: null, groupName: 'G',
    routes: [], ratesByPlatform: {}, discounts: [], vales: [], pixKey: null,
    recebedorNome: null, recebedorPix: null, cpf: null, phone: null, active: true,
    notaFiscal: false, espelhoConferido: conferido, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}
const grupo = (...rows: DriverRowData[]) => ({ rows });

describe('contagemDoCriterio — NF', () => {
  it('🎯 conta grupos completos × faltando', () => {
    const g1 = grupo(row('a')), g2 = grupo(row('b')), g3 = grupo(row('c'));
    const nf = new Map([
      ['pay-a', { expected: 2, complete: true }],
      ['pay-b', { expected: 3, complete: false }],
      ['pay-c', { expected: 1, complete: false }],
    ]);
    expect(contagemDoCriterio([g1, g2, g3], 'nf', nf)).toEqual({ feitos: 1, faltam: 2 });
  });

  it('⚠️ grupo que NÃO espera nota fica de fora da conta (não inflaria o "já")', () => {
    const g1 = grupo(row('a')), g2 = grupo(row('b'));
    const nf = new Map([
      ['pay-a', { expected: 0, complete: true }],
      ['pay-b', { expected: 1, complete: true }],
    ]);
    expect(contagemDoCriterio([g1, g2], 'nf', nf)).toEqual({ feitos: 1, faltam: 0 });
  });

  it('sem dado de NF nenhum: conta zerada, não "tudo faltando"', () => {
    expect(contagemDoCriterio([grupo(row('a'))], 'nf', new Map())).toEqual({ feitos: 0, faltam: 0 });
  });
});

describe('contagemDoCriterio — espelho no app', () => {
  it('🎯 basta UM membro ter recebido (no grupo só o líder recebe)', () => {
    const g = grupo(row('lider'), row('ana'), row('bia'));
    expect(contagemDoCriterio([g], 'espelhoApp', undefined, new Set(['lider'])))
      .toEqual({ feitos: 1, faltam: 0 });
  });

  it('ninguém recebeu: falta', () => {
    const g = grupo(row('lider'), row('ana'));
    expect(contagemDoCriterio([g], 'espelhoApp', undefined, new Set())).toEqual({ feitos: 0, faltam: 1 });
  });

  it('mistura de grupos', () => {
    const g1 = grupo(row('l1')), g2 = grupo(row('l2')), g3 = grupo(row('l3'));
    expect(contagemDoCriterio([g1, g2, g3], 'espelhoApp', undefined, new Set(['l1', 'l3'])))
      .toEqual({ feitos: 2, faltam: 1 });
  });
});

describe('contagemDoCriterio — print conferido', () => {
  it('🎯 precisa de TODOS os membros (o print é por driver)', () => {
    const completo = grupo(row('a', true), row('b', true));
    const parcial = grupo(row('c', true), row('d', false));
    expect(contagemDoCriterio([completo, parcial], 'espelho')).toEqual({ feitos: 1, faltam: 1 });
  });

  it('⚠️ parcial conta como FALTA, não como feito', () => {
    const parcial = grupo(row('a', true), row('b', false), row('c', false));
    expect(contagemDoCriterio([parcial], 'espelho')).toEqual({ feitos: 0, faltam: 1 });
  });
});

describe('bordas', () => {
  it('lista vazia', () => {
    expect(contagemDoCriterio([], 'nf', new Map())).toEqual({ feitos: 0, faltam: 0 });
  });

  it('grupo sem ninguém dentro é ignorado', () => {
    expect(contagemDoCriterio([{ rows: [] }], 'espelho')).toEqual({ feitos: 0, faltam: 0 });
  });

  it('a soma sempre fecha com o total de grupos que se aplicam', () => {
    const gs = [grupo(row('a', true)), grupo(row('b', false)), grupo(row('c', true))];
    const c = contagemDoCriterio(gs, 'espelho');
    expect(c.feitos + c.faltam).toBe(3);
  });
});
