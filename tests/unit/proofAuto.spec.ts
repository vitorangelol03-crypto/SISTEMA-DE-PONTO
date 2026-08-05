/**
 * Pedir o print SOZINHO depois da planilha (05/08/2026, pedido do Victor).
 *
 * *"quando subir a planilha da shopee, todo usuário que tiver pacote da shopee e ainda não
 * tiver mandado o print do espelho, o sistema pedir de forma automática, para validar e
 * passar para próxima etapa"* — e, na mesma conversa, *"quem já está validado continua
 * validado, já passou dessa parte"*.
 *
 * Os dois testes que mais importam: quem já está validado NÃO volta a ser cobrado, e
 * subir a planilha da iMile não dispara cobrança de print da Shopee.
 */
import { describe, it, expect } from 'vitest';
import { driversParaPedirPrint, plataformasQuePedemPrint } from '../../src/utils/proofAuto';

const linha = (driverId: string, espelhoConferido = false) => ({ driverId, espelhoConferido });
const nunca = () => false;
const sempre = () => true;

describe('driversParaPedirPrint', () => {
  it('🎯 tem pacote e não mandou print: entra no pedido', () => {
    expect(driversParaPedirPrint([linha('a')], sempre, nunca, nunca)).toEqual(['a']);
  });

  it('🔴 já validado NÃO volta a ser cobrado, mesmo sem print', () => {
    // É a fala dele: "já passou dessa parte". Sem isto, reimportar a planilha voltaria
    // a pedir print de 87 pessoas que a equipe já validou na mão.
    expect(driversParaPedirPrint([linha('a', true)], sempre, nunca, nunca)).toEqual([]);
  });

  it('quem não tem pacote na plataforma fica de fora', () => {
    expect(driversParaPedirPrint([linha('a')], nunca, nunca, nunca)).toEqual([]);
  });

  it('quem já mandou o print não é cobrado de novo', () => {
    expect(driversParaPedirPrint([linha('a')], sempre, nunca, sempre)).toEqual([]);
  });

  it('quem já tem pedido em aberto não ganha um segundo', () => {
    expect(driversParaPedirPrint([linha('a')], sempre, sempre, nunca)).toEqual([]);
  });

  it('separa certo numa lista misturada', () => {
    const rows = [linha('novo'), linha('validado', true), linha('mandou'), linha('sem-pacote')];
    const ids = driversParaPedirPrint(
      rows,
      (r) => r.driverId !== 'sem-pacote',
      nunca,
      (r) => r.driverId === 'mandou',
    );
    expect(ids).toEqual(['novo']);
  });

  it('não repete o mesmo driver (duas linhas do mesmo pagamento)', () => {
    expect(driversParaPedirPrint([linha('a'), linha('a')], sempre, nunca, nunca)).toEqual(['a']);
  });

  it('lista vazia devolve vazio', () => {
    expect(driversParaPedirPrint([], sempre, nunca, nunca)).toEqual([]);
  });
});

describe('plataformasQuePedemPrint', () => {
  it('🎯 só a plataforma que já teve print na empresa', () => {
    expect(plataformasQuePedemPrint(['SHOPEE', 'iMile'], new Set(['SHOPEE']))).toEqual(['SHOPEE']);
  });

  it('🔴 subir a planilha da iMile NÃO dispara pedido da Shopee', () => {
    // Só entra o que veio nesta importação: senão, importar qualquer coisa cobraria
    // print de todo mundo da Shopee.
    expect(plataformasQuePedemPrint(['iMile'], new Set(['SHOPEE', 'iMile']))).toEqual(['iMile']);
    expect(plataformasQuePedemPrint(['iMile'], new Set(['SHOPEE']))).toEqual([]);
  });

  it('plataforma sem história de print nunca dispara nada', () => {
    expect(plataformasQuePedemPrint(['ANJUN', 'LOGGI'], new Set(['SHOPEE']))).toEqual([]);
  });

  it('sem história nenhuma (empresa nova) não pede nada', () => {
    expect(plataformasQuePedemPrint(['SHOPEE'], new Set())).toEqual([]);
  });

  it('mais de uma plataforma com história passa as duas', () => {
    expect(plataformasQuePedemPrint(['SHOPEE', 'iMile'], new Set(['SHOPEE', 'iMile'])))
      .toEqual(['SHOPEE', 'iMile']);
  });
});
