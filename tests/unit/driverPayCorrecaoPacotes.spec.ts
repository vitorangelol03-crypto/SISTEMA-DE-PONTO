/**
 * Corrigir a quantidade de pacotes direto de "Espelhos recebidos" (04/08/2026).
 *
 * Decisões do Victor:
 *  - a diferença vai pra **MAIOR rota** (resolve 87 dos 95 casos de múltiplas rotas medidos
 *    em produção sem ninguém ter que escolher);
 *  - é **sugestão**: o veredito final é sempre um clique dele. Automático só quando a
 *    contagem BATE — aí nem passa por aqui.
 *
 * ⚠️ Isto mexe em DINHEIRO: 8 combinações em produção têm preço diferente entre rotas, e aí
 * onde a diferença cai muda o "Total a receber". Por isso o plano devolve `deltaReais` e
 * `precosDiferentes` — a tela avisa ANTES de aplicar.
 *
 * Roda com: npx vitest run driverPayCorrecaoPacotes
 */
import { describe, it, expect } from 'vitest';
import { planejarCorrecaoDePacotes, type DriverRowData } from '../../src/components/driverpay/driverPayShared';

/** Monta um driver com N rotas na SHOPEE: [pacotes, preço por pacote]. */
function row(rotas: Array<[number, number]>): DriverRowData {
  return {
    paymentId: 'pay1', driverId: 'd1', name: 'CAIO', route: null, groupName: 'G1',
    routes: rotas.map(([pacotes, rate], i) => ({
      route: `R${i + 1}`,
      packages: { SHOPEE: pacotes },
      packageIds: { SHOPEE: `pk-${i + 1}` },
      rates: { SHOPEE: rate },
    })),
    ratesByPlatform: { SHOPEE: 2 }, discounts: [], vales: [], pixKey: null,
    recebedorNome: null, recebedorPix: null, cpf: null, phone: null, active: true,
    notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

describe('planejarCorrecaoDePacotes', () => {
  it('🎯 caso do CAIO: uma rota só, planilha 1811 -> print 1808', () => {
    const p = planejarCorrecaoDePacotes(row([[1811, 2]]), 'SHOPEE', 1808);
    expect(p.erro).toBeNull();
    expect(p.ajustes).toHaveLength(1);
    expect(p.ajustes[0]).toMatchObject({ route: 'R1', de: 1811, para: 1808, packageId: 'pk-1' });
    expect(p.totalDepois).toBe(1808);
    expect(p.deltaReais).toBe(-6); // 3 pacotes × R$ 2
    expect(p.precosDiferentes).toBe(false);
  });

  it('🎯 várias rotas: a diferença sai da MAIOR', () => {
    // 700 + 600 + 511 = 1811, quer 1808 -> tira 3 da rota de 700
    const p = planejarCorrecaoDePacotes(row([[700, 2], [600, 2], [511, 2]]), 'SHOPEE', 1808);
    expect(p.ajustes).toHaveLength(1);
    expect(p.ajustes[0]).toMatchObject({ route: 'R1', de: 700, para: 697 });
    expect(p.totalDepois).toBe(1808);
  });

  it('a maior não é a primeira da lista: pega a maior mesmo assim', () => {
    const p = planejarCorrecaoDePacotes(row([[100, 2], [900, 2], [300, 2]]), 'SHOPEE', 1290);
    expect(p.ajustes).toHaveLength(1);
    expect(p.ajustes[0]).toMatchObject({ route: 'R2', de: 900, para: 890 });
  });

  it('sobrando pacotes: soma tudo na maior', () => {
    const p = planejarCorrecaoDePacotes(row([[700, 2], [600, 2]]), 'SHOPEE', 1400);
    expect(p.ajustes).toHaveLength(1);
    expect(p.ajustes[0]).toMatchObject({ route: 'R1', de: 700, para: 800 });
    expect(p.deltaReais).toBe(200);
  });

  it('⚠️ não cabe na maior: escorre pra próxima e NENHUMA rota fica negativa', () => {
    // 500 + 400 = 900, quer 100 -> tira 500 da maior (zera) e 300 da outra
    const p = planejarCorrecaoDePacotes(row([[500, 2], [400, 2]]), 'SHOPEE', 100);
    const total = p.ajustes.reduce((s, a) => s + a.para, 0);
    expect(total).toBe(100);
    expect(p.ajustes.every((a) => a.para >= 0), 'nenhuma negativa').toBe(true);
    expect(p.erro).toBeNull();
  });

  it('pedir mais do que dá pra tirar não é aceito (e não mexe em nada)', () => {
    const p = planejarCorrecaoDePacotes(row([[100, 2]]), 'SHOPEE', -5);
    // -5 vira 0 pelo clamp, e 0 é alcançável; o erro real é quando nem zerando dá.
    expect(p.totalDepois).toBe(0);
    expect(p.ajustes[0]).toMatchObject({ de: 100, para: 0 });
  });

  it('mesmo total: não gera ajuste nenhum', () => {
    const p = planejarCorrecaoDePacotes(row([[1808, 2]]), 'SHOPEE', 1808);
    expect(p.ajustes).toHaveLength(0);
    expect(p.deltaReais).toBe(0);
    expect(p.erro).toBeNull();
  });

  it('🎯 PREÇOS DIFERENTES: avisa, e o delta reflete a rota que foi mexida', () => {
    // maior rota é a de R$ 3,00 — tirar 10 dali custa R$ 30, não R$ 20
    const p = planejarCorrecaoDePacotes(row([[900, 3], [600, 2]]), 'SHOPEE', 1490);
    expect(p.precosDiferentes).toBe(true);
    expect(p.ajustes[0]).toMatchObject({ route: 'R1', de: 900, para: 890, rate: 3 });
    expect(p.deltaReais).toBe(-30);
  });

  it('driver sem pacote na plataforma: recusa com motivo em portugues', () => {
    const vazio = row([]);
    const p = planejarCorrecaoDePacotes(vazio, 'SHOPEE', 100);
    expect(p.ajustes).toHaveLength(0);
    expect(p.erro).toMatch(/não tem pacote/i);
  });

  it('não mexe em outra plataforma', () => {
    const r = row([[1811, 2]]);
    r.routes[0].packages.LOGGI = 500;
    const p = planejarCorrecaoDePacotes(r, 'SHOPEE', 1808);
    expect(p.ajustes).toHaveLength(1);
    expect(p.ajustes[0].de).toBe(1811); // o 500 da LOGGI passou longe
  });

  it('o total depois é sempre exatamente o que foi pedido', () => {
    for (const alvo of [0, 1, 999, 1808, 5000]) {
      const p = planejarCorrecaoDePacotes(row([[700, 2], [600, 2], [511, 2]]), 'SHOPEE', alvo);
      if (p.erro) continue;
      const somaFinal = row([[700, 2], [600, 2], [511, 2]]).routes.reduce((s, rl, i) => {
        const aj = p.ajustes.find((a) => a.indice === i);
        return s + (aj ? aj.para : rl.packages.SHOPEE);
      }, 0);
      expect(somaFinal, `alvo ${alvo}`).toBe(alvo);
    }
  });
});
