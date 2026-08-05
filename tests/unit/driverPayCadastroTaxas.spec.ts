/**
 * Cadastro de entregador — a peneira das plataformas fantasma (05/08/2026).
 *
 * O QUE ACONTECEU: o painel do Victor estava aberto desde antes de uma plataforma ser
 * apagada do banco. Ao cadastrar o "Othon Saraiva Freitas", o sistema tentou gravar o valor
 * por pacote dessa plataforma que já não existia → o banco recusou pela chave estrangeira, e
 * a mensagem crua apareceu na tela:
 *   insert or update on table "driverpay_platform_rates" violates foreign key constraint
 *
 * E o pior: o entregador era gravado ANTES desse erro. Ele clicou de novo, e de novo —
 * **três cadastros do Othon**, todos zerados. Tive que apagar dois na mão.
 *
 * ⚠️ Aqui se decide o que vai pro banco num cadastro. Deixar passar um id que não existe
 * volta o bug inteiro.
 *
 * Roda com: npx vitest run driverPayCadastroTaxas
 */
import { describe, it, expect } from 'vitest';
import { taxasDePlataformasQueExistem } from '../../src/components/driverpay/driverPayShared';

const PLATAFORMAS = [{ id: 'shopee' }, { id: 'loggi' }, { id: 'emile' }];

describe('taxasDePlataformasQueExistem', () => {
  it('🎯 CASO OTHON: a plataforma fantasma da tela não vai pro banco', () => {
    const r = taxasDePlataformasQueExistem(
      [{ platformId: 'shopee', rate: 2 }, { platformId: 'PW-Test-apagada', rate: 2 }],
      PLATAFORMAS,
    );
    expect(r.validas).toEqual([{ platformId: 'shopee', rate: 2 }]);
    expect(r.fantasmas).toEqual(['PW-Test-apagada']);
  });

  it('tudo existindo, tudo passa', () => {
    const r = taxasDePlataformasQueExistem(
      [{ platformId: 'shopee', rate: 2 }, { platformId: 'loggi', rate: 3 }],
      PLATAFORMAS,
    );
    expect(r.validas).toHaveLength(2);
    expect(r.fantasmas).toEqual([]);
  });

  it('taxa ZERADA não é gravada nem contada como fantasma (usa o padrão da plataforma)', () => {
    const r = taxasDePlataformasQueExistem(
      [{ platformId: 'shopee', rate: 0 }, { platformId: 'sumiu', rate: 0 }],
      PLATAFORMAS,
    );
    expect(r.validas).toEqual([]);
    expect(r.fantasmas).toEqual([]);
  });

  it('taxa negativa também não passa', () => {
    const r = taxasDePlataformasQueExistem([{ platformId: 'shopee', rate: -1 }], PLATAFORMAS);
    expect(r.validas).toEqual([]);
  });

  it('⚠️ nenhuma plataforma no banco: nada é gravado, e todas viram fantasma', () => {
    const r = taxasDePlataformasQueExistem([{ platformId: 'shopee', rate: 2 }], []);
    expect(r.validas).toEqual([]);
    expect(r.fantasmas).toEqual(['shopee']);
  });

  it('lista vazia não inventa nada', () => {
    expect(taxasDePlataformasQueExistem([], PLATAFORMAS)).toEqual({ validas: [], fantasmas: [] });
  });

  it('mantém a ordem e não altera a lista recebida', () => {
    const entrada = [{ platformId: 'loggi', rate: 3 }, { platformId: 'shopee', rate: 2 }];
    const r = taxasDePlataformasQueExistem(entrada, PLATAFORMAS);
    expect(r.validas.map((t) => t.platformId)).toEqual(['loggi', 'shopee']);
    expect(entrada).toHaveLength(2);
  });
});
