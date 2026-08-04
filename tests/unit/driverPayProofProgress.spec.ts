// Progresso do ESPELHO DO APP (print da Shopee) na grade do painel.
//
// A diferenca que importa em relacao a NF: a nota fiscal e AGREGADA POR GRUPO (o
// lider manda uma que vale pelos membros), mas o print e UM POR DRIVER — o lider
// envia, porem cada print marca o pagamento DAQUELE membro.
//
// ⚠️ Desde 04/08/2026 o pedido "pra todos" SO alcanca quem esta EM GRUPO (regra de
// logistica do Victor). Por isso os cenarios de "foi pedido" passam um grupo explicito —
// na operacao real os 89 entregadores com Shopee estao todos em grupo.
//
// Roda com: npx vitest run driverPayProofProgress
import { describe, expect, it } from 'vitest';
import {
  computeProofProgressByPayment,
  expectedProofPlatforms,
  proofForaPorSemGrupo,
  melhorEstado,
  proofStateFromRow,
  type DriverRowData,
  type ProofState,
  type ProofRequest,
} from '../../src/components/driverpay/driverPayShared';

/** Pedido "pra todo mundo" — o alcance original, de antes de 04/08. */
const paraTodos = (...plats: string[]): ProofRequest[] => plats.map((p) => ({ platformName: p, driverId: null }));
/** Pedido individual: so este entregador e cobrado. */
const soDe = (driverId: string, ...plats: string[]): ProofRequest[] =>
  plats.map((p) => ({ platformName: p, driverId }));

/** Linha mínima da grade — só o que estas funções olham. */
function row(driverId: string, pacotes: Record<string, number>, groupName?: string): DriverRowData {
  return {
    paymentId: `pay-${driverId}`,
    driverId,
    name: driverId.toUpperCase(),
    route: '',
    groupName: groupName ?? null,
    routes: [{ route: '', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {},
    discounts: [],
    vales: [],
    zapexCount: 0,
    zapexRate: 0,
    totalPackages: 0,
    packagesAmount: 0,
    totalDiscounts: 0,
    totalVales: 0,
    totalZapex: 0,
    totalNet: 0,
    notaFiscal: false,
    espelhoConferido: false,
  } as unknown as DriverRowData;
}

describe('expectedProofPlatforms', () => {
  it('so pede print de plataforma SOLICITADA onde ele tem pacote', () => {
    const r = row('caio', { SHOPEE: 1808, LOGGI: 300 }, 'Grupo Ana');
    expect(expectedProofPlatforms(r, paraTodos('SHOPEE'))).toEqual(['SHOPEE']);
  });

  it('nao pede print de plataforma sem pacote', () => {
    const r = row('caio', { LOGGI: 300 });
    expect(expectedProofPlatforms(r, paraTodos('SHOPEE'))).toEqual([]);
  });

  it('nao pede nada enquanto ninguem apertou "Solicitar espelho"', () => {
    expect(expectedProofPlatforms(row('caio', { SHOPEE: 1808 }), [])).toEqual([]);
  });

  it('"Coleta Shopee" fica de fora (decisao do Victor: so SHOPEE)', () => {
    const r = row('caio', { SHOPEE: 1808, 'Coleta Shopee': 40 }, 'Grupo Ana');
    expect(expectedProofPlatforms(r, paraTodos('SHOPEE'))).toEqual(['SHOPEE']);
  });

  // ── Alcance do pedido (04/08/2026): pedir so de um entregador ou de um grupo ──
  it('pedido individual cobra SO o entregador escolhido', () => {
    const caio = row('caio', { SHOPEE: 1808 });
    const bia = row('bia', { SHOPEE: 900 });
    expect(expectedProofPlatforms(caio, soDe('caio', 'SHOPEE'))).toEqual(['SHOPEE']);
    expect(expectedProofPlatforms(bia, soDe('caio', 'SHOPEE'))).toEqual([]);
  });

  it('pedido de GRUPO e uma linha por membro — quem esta de fora nao e cobrado', () => {
    const membros = ['ana', 'bia', 'caio'];
    const pedidos = membros.flatMap((d) => soDe(d, 'SHOPEE'));
    for (const d of membros) {
      expect(expectedProofPlatforms(row(d, { SHOPEE: 100 }, 'G1'), pedidos)).toEqual(['SHOPEE']);
    }
    expect(expectedProofPlatforms(row('zeca', { SHOPEE: 100 }, 'G2'), pedidos)).toEqual([]);
  });

  it('pedido geral + individual nao duplica a plataforma', () => {
    const caio = row('caio', { SHOPEE: 1808 }, 'Grupo Ana');
    expect(expectedProofPlatforms(caio, [...paraTodos('SHOPEE'), ...soDe('caio', 'SHOPEE')])).toEqual(['SHOPEE']);
  });

  it('pedido individual de OUTRO nao vaza pra quem tem pacote na mesma plataforma', () => {
    const bia = row('bia', { SHOPEE: 900, LOGGI: 10 }, 'Grupo Ana');
    expect(expectedProofPlatforms(bia, [...soDe('caio', 'SHOPEE'), ...paraTodos('LOGGI')])).toEqual(['LOGGI']);
  });
});

// ── Regra de logistica (04/08/2026): "Todos" so cobra quem esta EM GRUPO ──
describe('"Todos" nao cobra quem esta sem grupo', () => {
  it('quem esta em grupo continua sendo cobrado', () => {
    const emGrupo = row('bia', { SHOPEE: 900 }, 'Grupo Ana');
    expect(expectedProofPlatforms(emGrupo, paraTodos('SHOPEE'))).toEqual(['SHOPEE']);
    expect(proofForaPorSemGrupo(emGrupo, paraTodos('SHOPEE'))).toEqual([]);
  });

  it('🎯 avulso NAO e cobrado pelo pedido geral — e aparece como "de fora"', () => {
    const avulso = row('marcos', { SHOPEE: 300 });
    expect(expectedProofPlatforms(avulso, paraTodos('SHOPEE'))).toEqual([]);
    expect(proofForaPorSemGrupo(avulso, paraTodos('SHOPEE'))).toEqual(['SHOPEE']);
  });

  it('avulso SEM pacote na plataforma pedida nao aparece como "de fora"', () => {
    const avulso = row('marcos', { LOGGI: 300 });
    expect(proofForaPorSemGrupo(avulso, paraTodos('SHOPEE'))).toEqual([]);
  });

  it('pedido INDIVIDUAL cobra o avulso mesmo sem grupo (o operador escolheu ele)', () => {
    const avulso = row('marcos', { SHOPEE: 300 });
    expect(expectedProofPlatforms(avulso, soDe('marcos', 'SHOPEE'))).toEqual(['SHOPEE']);
    expect(proofForaPorSemGrupo(avulso, soDe('marcos', 'SHOPEE'))).toEqual([]);
  });

  it('geral + individual do avulso: ele e cobrado e some da lista de "de fora"', () => {
    const avulso = row('marcos', { SHOPEE: 300 });
    const reqs = [...paraTodos('SHOPEE'), ...soDe('marcos', 'SHOPEE')];
    expect(expectedProofPlatforms(avulso, reqs)).toEqual(['SHOPEE']);
    expect(proofForaPorSemGrupo(avulso, reqs)).toEqual([]);
  });

  it('o contador do avulso fica zerado — nao entra na conta de prints', () => {
    const p = computeProofProgressByPayment([row('marcos', { SHOPEE: 300 })], paraTodos('SHOPEE'), new Map())
      .get('pay-marcos')!;
    expect(p.expected).toBe(0);
    expect(p.missing).toBe(0);
    expect(p.complete).toBe(false);
  });
});

describe('proofStateFromRow — traduz o banco pro que a tela mostra', () => {
  it('recusado e validado vem do status', () => {
    expect(proofStateFromRow({ status: 'rejeitado', checkStatus: 'periodo_errado' })).toBe('recusado');
    expect(proofStateFromRow({ status: 'validado', checkStatus: 'ok' })).toBe('confirmado');
  });

  it('DIVERGENTE vem do check, nao do status — o print divergente e ACEITO', () => {
    // status 'recebido' (aceito, driver nao soube de nada) + check 'divergente'.
    expect(proofStateFromRow({ status: 'recebido', checkStatus: 'divergente' })).toBe('divergente');
  });

  it('esperando leitura (fila) ou falha nossa = pendente', () => {
    expect(proofStateFromRow({ status: 'recebido', checkStatus: 'pendente' })).toBe('pendente');
    expect(proofStateFromRow({ status: 'recebido', checkStatus: null })).toBe('pendente');
  });
});

describe('melhorEstado — quando o driver mandou mais de um print', () => {
  it('print confirmado depois de uma recusa apaga a recusa', () => {
    expect(melhorEstado(['recusado', 'confirmado'])).toBe('confirmado');
  });

  it('divergencia NAO some por causa de um envio pendente depois', () => {
    // Senao a linha que o Victor precisa olhar sumiria sozinha da tela.
    expect(melhorEstado(['divergente', 'pendente'])).toBe('divergente');
  });

  it('sem print nenhum, esta faltando', () => {
    expect(melhorEstado([])).toBe('faltando');
  });
});

describe('computeProofProgressByPayment', () => {
  const solicitadas = paraTodos('SHOPEE');

  it('print certo deixa o driver completo', () => {
    const rows = [row('caio', { SHOPEE: 1808 }, 'Grupo Ana')];
    const estados = new Map<string, ProofState>([['caio|SHOPEE', 'confirmado']]);
    const p = computeProofProgressByPayment(rows, solicitadas, estados).get('pay-caio')!;
    expect(p).toMatchObject({ expected: 1, confirmed: 1, complete: true, needsAttention: false });
  });

  it('quantidade divergente pede ATENCAO e nao completa', () => {
    const rows = [row('caio', { SHOPEE: 1808 }, 'Grupo Ana')];
    const estados = new Map<string, ProofState>([['caio|SHOPEE', 'divergente']]);
    const p = computeProofProgressByPayment(rows, solicitadas, estados).get('pay-caio')!;
    expect(p).toMatchObject({ divergent: 1, complete: false, needsAttention: true });
  });

  it('quem nao mandou fica faltando', () => {
    const p = computeProofProgressByPayment([row('caio', { SHOPEE: 1808 }, 'Grupo Ana')], solicitadas, new Map())
      .get('pay-caio')!;
    expect(p).toMatchObject({ expected: 1, missing: 1, complete: false });
  });

  it('sem espelho solicitado, ninguem aparece verde de graca', () => {
    const p = computeProofProgressByPayment([row('caio', { SHOPEE: 1808 })], [], new Map()).get('pay-caio')!;
    expect(p).toMatchObject({ expected: 0, complete: false });
  });

  it('driver sem pacote da Shopee nao deve print nenhum', () => {
    const p = computeProofProgressByPayment([row('ana', { LOGGI: 300 }, 'Grupo Ana')], solicitadas, new Map())
      .get('pay-ana')!;
    expect(p.expected).toBe(0);
  });

  describe('GRUPO — um print POR DRIVER (nao agrega, ao contrario da NF)', () => {
    const grupo = [
      row('lider', { SHOPEE: 500 }, 'Grupo A'),
      row('membro1', { SHOPEE: 800 }, 'Grupo A'),
      row('membro2', { SHOPEE: 508 }, 'Grupo A'),
    ];

    it('o print do lider NAO cobre os membros', () => {
      const estados = new Map<string, ProofState>([['lider|SHOPEE', 'confirmado']]);
      const p = computeProofProgressByPayment(grupo, solicitadas, estados);
      expect(p.get('pay-lider')!.complete).toBe(true);
      expect(p.get('pay-membro1')!.complete).toBe(false);   // ← a diferenca vs NF
      expect(p.get('pay-membro2')!.missing).toBe(1);
    });

    it('cada print marca o pagamento do SEU dono', () => {
      const estados = new Map<string, ProofState>([
        ['lider|SHOPEE', 'confirmado'],
        ['membro1|SHOPEE', 'divergente'],
        ['membro2|SHOPEE', 'confirmado'],
      ]);
      const p = computeProofProgressByPayment(grupo, solicitadas, estados);
      expect(p.get('pay-lider')!.complete).toBe(true);
      expect(p.get('pay-membro1')!.needsAttention).toBe(true);
      expect(p.get('pay-membro2')!.complete).toBe(true);
    });

    it('grupo so fica todo verde quando os 3 mandaram e bateram', () => {
      const todos = new Map<string, ProofState>([
        ['lider|SHOPEE', 'confirmado'],
        ['membro1|SHOPEE', 'confirmado'],
        ['membro2|SHOPEE', 'confirmado'],
      ]);
      const p = computeProofProgressByPayment(grupo, solicitadas, todos);
      expect(grupo.every((r) => p.get(r.paymentId)!.complete)).toBe(true);
    });
  });
});
