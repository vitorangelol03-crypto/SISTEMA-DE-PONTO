/**
 * Correção de contagem: MOSTRAR TODAS AS ROTAS, não só a que mudou (04/08/2026).
 *
 * Pedido do Victor olhando o card do Fabricio: *"vamos mudar o jeito que aparece
 * para quem tem duas rotas, aparece em qual rota que vai ser adicionado pois tem
 * rotas que são valores diferentes"*.
 *
 * Antes o plano só devolvia `ajustes` (as rotas que mudam). Com duas rotas, a tela
 * dizia "Caratinga: 2009 → 2124" e a outra rota simplesmente não existia na tela —
 * ficava sem resposta a pergunta que decide o valor: **em qual rota entrou, e a
 * outra ficou como?** Com preço diferente por rota, é ONDE a diferença cai que
 * define quanto o entregador recebe.
 *
 * `linhas` passa a trazer TODAS as rotas, com `mudou` marcando a que recebeu a
 * diferença. `ajustes` continua igual — é o que grava no banco.
 */
import { describe, it, expect } from 'vitest';
import { planejarCorrecaoDePacotes, type DriverRowData } from '../../src/components/driverpay/driverPayShared';

/** Driver com N rotas na SHOPEE: [pacotes, preço por pacote]. */
function row(rotas: Array<[number, number]>): DriverRowData {
  return {
    paymentId: 'pay1', driverId: 'd1', name: 'FABRICIO', route: null, groupName: 'G1',
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

describe('plano.linhas — todas as rotas, com a que recebeu a diferença marcada', () => {
  it('duas rotas: a que NÃO muda aparece igual, e só a maior fica marcada', () => {
    // 2000 + 9 = 2009, quer 2124 -> +115 na maior (R1).
    const p = planejarCorrecaoDePacotes(row([[2000, 2.2], [9, 2]]), 'SHOPEE', 2124);
    expect(p.erro).toBeNull();
    expect(p.linhas).toHaveLength(2);
    expect(p.linhas[0]).toMatchObject({ route: 'R1', de: 2000, para: 2115, rate: 2.2, mudou: true });
    expect(p.linhas[1]).toMatchObject({ route: 'R2', de: 9, para: 9, rate: 2, mudou: false });
    // `ajustes` (o que grava) segue só com a rota que muda.
    expect(p.ajustes).toHaveLength(1);
  });

  it('a rota marcada é a que explica o valor quando os preços diferem', () => {
    // Mesma diferença (+100), preços diferentes: cai na MAIOR (rate 3) -> R$ 300.
    const p = planejarCorrecaoDePacotes(row([[500, 3], [100, 1]]), 'SHOPEE', 700);
    expect(p.precosDiferentes).toBe(true);
    const marcada = p.linhas.filter((l) => l.mudou);
    expect(marcada).toHaveLength(1);
    expect(marcada[0]).toMatchObject({ route: 'R1', rate: 3 });
    expect(p.deltaReais).toBe(300); // 100 × R$ 3 (e não 100 × R$ 1)
  });

  it('quando a diferença escorre para mais de uma rota, TODAS as tocadas ficam marcadas', () => {
    // 100 + 50 = 150, quer 20 -> tira 100 da maior (zera) e 30 da segunda.
    const p = planejarCorrecaoDePacotes(row([[100, 2], [50, 2]]), 'SHOPEE', 20);
    expect(p.erro).toBeNull();
    expect(p.linhas.filter((l) => l.mudou).map((l) => l.route)).toEqual(['R1', 'R2']);
    expect(p.linhas[0]).toMatchObject({ de: 100, para: 0, mudou: true });
    expect(p.linhas[1]).toMatchObject({ de: 50, para: 20, mudou: true });
  });

  it('rota única: linhas tem 1 item (a tela segue com a frase curta)', () => {
    const p = planejarCorrecaoDePacotes(row([[1811, 2]]), 'SHOPEE', 1808);
    expect(p.linhas).toHaveLength(1);
    expect(p.linhas[0]).toMatchObject({ de: 1811, para: 1808, mudou: true });
  });

  it('pedir o número que já está: nenhuma rota marcada, mas todas listadas', () => {
    const p = planejarCorrecaoDePacotes(row([[700, 2], [300, 3]]), 'SHOPEE', 1000);
    expect(p.erro).toBeNull();
    expect(p.ajustes).toHaveLength(0);
    expect(p.linhas).toHaveLength(2);
    expect(p.linhas.every((l) => !l.mudou)).toBe(true);
    expect(p.linhas.map((l) => l.de)).toEqual([700, 300]);
  });

  it('zerar o entregador: TODAS as rotas vão a zero e ficam marcadas', () => {
    // ⚠️ Número negativo é tratado como 0 (`Math.max(0, ...)`), e zerar é possível —
    // dá pra tirar tudo. Então aqui não há erro: há duas rotas indo a zero.
    const p = planejarCorrecaoDePacotes(row([[100, 2], [50, 2]]), 'SHOPEE', -1);
    expect(p.erro).toBeNull();
    expect(p.totalDepois).toBe(0);
    expect(p.linhas).toHaveLength(2);
    expect(p.linhas.every((l) => l.para === 0 && l.mudou)).toBe(true);
    expect(p.deltaReais).toBe(-300); // 150 pacotes × R$ 2
  });

  it('driver sem pacote na plataforma: linhas vazio e erro explicando', () => {
    const p = planejarCorrecaoDePacotes(row([]), 'SHOPEE', 100);
    expect(p.linhas).toEqual([]);
    expect(p.erro).toMatch(/não tem pacote lançado/i);
  });

  it('a soma das linhas depois bate com o total gravado — a conta não pode vazar', () => {
    const p = planejarCorrecaoDePacotes(row([[300, 2], [200, 2.5], [100, 1]]), 'SHOPEE', 545);
    expect(p.erro).toBeNull();
    expect(p.linhas.reduce((s, l) => s + l.para, 0)).toBe(p.totalDepois);
    expect(p.linhas.reduce((s, l) => s + l.de, 0)).toBe(p.totalAntes);
  });
});
