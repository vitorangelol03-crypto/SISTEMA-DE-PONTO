/**
 * A etiqueta "pago" passa a NOMEAR as plataformas (05/08/2026, pedido do Victor:
 * "altera a TAG de pago e especifica quais plataformas foram pagas").
 *
 * Antes, o pagamento COMPLETO mostrava só a data ("✓ pago 05/08/2026") e as plataformas
 * ficavam escondidas na dica — mas a pergunta na hora de pagar é "o que já saiu pra ele?",
 * não "que dia foi".
 *
 * ⚠️ Onde isto pode causar prejuízo:
 *  · num GRUPO, os membros podem ter sido pagos em plataformas DIFERENTES. Nomear uma só
 *    mentiria sobre quem recebeu mais, e nomear a união mentiria sobre quem recebeu menos —
 *    então a etiqueta do grupo só nomeia quando TODOS batem;
 *  · a etiqueta encurta a lista por falta de espaço, mas a dica mostra tudo: encurtar é
 *    problema de layout, esconder seria problema de dinheiro.
 *
 * Roda com: npx vitest run driverPayEtiquetaPago
 */
import { describe, it, expect } from 'vitest';
import {
  resumirPlataformas,
  rotuloDaEtiquetaDePagamento,
  plataformasPagasDoGrupo,
  type PagamentoDoDriver,
} from '../../src/components/driverpay/driverPayShared';

const sit = (p: Partial<PagamentoDoDriver>): PagamentoDoDriver => ({
  estado: 'concluido', pagas: [], faltando: [], ultimoPagamento: null, descontoPendente: false, ...p,
} as PagamentoDoDriver);

describe('resumirPlataformas', () => {
  it('até 3 mostra todas', () => {
    expect(resumirPlataformas(['SHOPEE', 'LOGGI', 'ANJUN'])).toBe('SHOPEE+LOGGI+ANJUN');
  });

  it('🎯 acima de 3 resume o resto (a coluna do nome não estoura)', () => {
    expect(resumirPlataformas(['SHOPEE', 'LOGGI', 'ANJUN', 'eMile', 'Coleta Shopee']))
      .toBe('SHOPEE+LOGGI+ANJUN+2');
  });

  it('lista vazia vira texto vazio', () => {
    expect(resumirPlataformas([])).toBe('');
  });
});

describe('rotuloDaEtiquetaDePagamento', () => {
  it('🎯 pagamento COMPLETO agora nomeia as plataformas, com a data curta', () => {
    const r = rotuloDaEtiquetaDePagamento(
      sit({ estado: 'concluido', pagas: ['SHOPEE', 'LOGGI'], ultimoPagamento: '2026-08-05T12:00:00Z' }),
    );
    expect(r).toContain('SHOPEE+LOGGI');
    expect(r).toMatch(/^✓ pago /);
    expect(r).toMatch(/\d{2}\/\d{2}$/);
  });

  it('sem data gravada, mostra só as plataformas (não deixa "·" solto)', () => {
    const r = rotuloDaEtiquetaDePagamento(sit({ estado: 'concluido', pagas: ['SHOPEE'], ultimoPagamento: null }));
    expect(r).toBe('✓ pago SHOPEE');
  });

  it('PARCIAL continua nomeando o que já saiu', () => {
    expect(rotuloDaEtiquetaDePagamento(sit({ estado: 'parcial', pagas: ['SHOPEE'], faltando: ['LOGGI'] })))
      .toBe('pago SHOPEE');
  });
});

describe('plataformasPagasDoGrupo', () => {
  it('🎯 todos pagos nas MESMAS: pode nomear', () => {
    const r = plataformasPagasDoGrupo([
      sit({ pagas: ['SHOPEE', 'LOGGI'] }),
      sit({ pagas: ['LOGGI', 'SHOPEE'] }), // ordem diferente é a mesma coisa
    ]);
    expect(r.iguais).toBe(true);
    expect([...r.plataformas].sort()).toEqual(['LOGGI', 'SHOPEE']);
  });

  it('🎯 membros pagos em plataformas DIFERENTES: NÃO pode nomear', () => {
    const r = plataformasPagasDoGrupo([sit({ pagas: ['SHOPEE'] }), sit({ pagas: ['SHOPEE', 'LOGGI'] })]);
    expect(r.iguais).toBe(false);
  });

  it('grupo de um membro só nomeia normalmente', () => {
    const r = plataformasPagasDoGrupo([sit({ pagas: ['ANJUN'] })]);
    expect(r).toEqual({ iguais: true, plataformas: ['ANJUN'] });
  });

  it('lista vazia não inventa nada', () => {
    expect(plataformasPagasDoGrupo([])).toEqual({ iguais: false, plataformas: [] });
  });

  it('⚠️ quando varia, devolve a UNIÃO — pra quem quiser mostrar na dica', () => {
    const r = plataformasPagasDoGrupo([sit({ pagas: ['SHOPEE'] }), sit({ pagas: ['LOGGI'] })]);
    expect(r.iguais).toBe(false);
    expect(r.plataformas).toEqual(['LOGGI', 'SHOPEE']);
  });
});
