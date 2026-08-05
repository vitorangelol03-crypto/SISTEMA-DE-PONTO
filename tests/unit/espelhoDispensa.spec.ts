/**
 * "Espelho conferido" de quem NÃO ENTREGA na plataforma (05/08/2026, decisão do Victor).
 *
 * Depois que a planilha entra, quem ficou com ZERO pacote na plataforma cobrada não manda
 * print (a coluna Print mostra "não entrega"). O espelho dele continuava em branco e alguém
 * marcava na mão, um por um. Decisão dele: **"isso deve ficar como validado, senão temos
 * depois que ficar clicando pra validar manualmente"**.
 *
 * O risco aqui é marcar espelho de quem NÃO deveria — por isso a regra é pura e testada.
 */
import { describe, it, expect } from 'vitest';
import { espelhoDispensado, pagamentosParaMarcarPorDispensa } from '../../src/utils/espelhoDispensa';

describe('espelhoDispensado', () => {
  it('🎯 cobrado e sem pacote na plataforma: dispensado, conta como validado', () => {
    expect(espelhoDispensado([], ['SHOPEE'])).toBe(true);
  });

  it('🔴 ainda tem plataforma cobrando print: NÃO dispensa', () => {
    // Entrega na eMile e não na Shopee: ainda deve o print da eMile.
    expect(espelhoDispensado(['eMile'], ['SHOPEE'])).toBe(false);
  });

  it('🔴 quem NUNCA foi cobrado não entra — não há o que dispensar', () => {
    // Sem pedido nenhum, marcar espelho seria inventar conferência.
    expect(espelhoDispensado([], [])).toBe(false);
  });

  it('dispensado em várias plataformas de uma vez também vale', () => {
    expect(espelhoDispensado([], ['SHOPEE', 'ANJUN'])).toBe(true);
  });

  it('planilha ainda não chegou (segue esperando) não dispensa', () => {
    // `expectedProofPlatforms` mantém a plataforma como esperada enquanto não há planilha.
    expect(espelhoDispensado(['SHOPEE'], [])).toBe(false);
  });
});

describe('pagamentosParaMarcarPorDispensa', () => {
  const linhas = [
    { paymentId: 'p1', espelhoConferido: false }, // dispensado -> marca
    { paymentId: 'p2', espelhoConferido: false }, // ainda deve print -> não
    { paymentId: 'p3', espelhoConferido: true },  // dispensado, mas JÁ marcado -> não repete
    { paymentId: 'p4', espelhoConferido: false }, // nunca cobrado -> não
  ];
  const esperadas = (r: { paymentId: string }) => (r.paymentId === 'p2' ? ['SHOPEE'] : []);
  const dispensadas = (r: { paymentId: string }) =>
    r.paymentId === 'p4' ? [] : ['SHOPEE'];

  it('devolve só quem realmente deve ser marcado', () => {
    expect(pagamentosParaMarcarPorDispensa(linhas, esperadas, dispensadas)).toEqual(['p1']);
  });

  it('é idempotente: quem já está marcado não volta na lista', () => {
    const todosMarcados = linhas.map((l) => ({ ...l, espelhoConferido: true }));
    expect(pagamentosParaMarcarPorDispensa(todosMarcados, esperadas, dispensadas)).toEqual([]);
  });

  it('lista vazia não quebra', () => {
    expect(pagamentosParaMarcarPorDispensa([], esperadas, dispensadas)).toEqual([]);
  });

  it('🎯 caso real: 8 sem Shopee entram, quem entrega fica de fora', () => {
    const oito = Array.from({ length: 8 }, (_, i) => ({ paymentId: `sem${i}`, espelhoConferido: false }));
    const comShopee = [{ paymentId: 'com1', espelhoConferido: false }];
    const ids = pagamentosParaMarcarPorDispensa(
      [...oito, ...comShopee],
      (r) => (r.paymentId.startsWith('com') ? ['SHOPEE'] : []),
      (r) => (r.paymentId.startsWith('com') ? [] : ['SHOPEE']),
    );
    expect(ids).toHaveLength(8);
    expect(ids).not.toContain('com1');
  });
});
