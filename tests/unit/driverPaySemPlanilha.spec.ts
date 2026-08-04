/**
 * Pedir o print ANTES de a planilha chegar (04/08/2026, decisões do Victor):
 *   1) sem planilha, cobra todo mundo que está EM GRUPO — o sistema não tem como saber
 *      quem entregou o quê ainda ("somente entregadores que estiverem em grupos");
 *   2) a planilha de UMA plataforma não pode fazer o sistema achar que a da outra chegou;
 *   3) depois que a planilha chega, vale a regra normal (só quem tem pacote) — senão
 *      voltaríamos a cobrar print de quem não entregou naquela plataforma;
 *   4) 🎯 quando a planilha chega, a conferência da quantidade usa o número que a IA JÁ
 *      LEU: nenhuma foto baixada, nenhuma chamada de IA ("não trave a fila, não trave a API").
 *
 * O último `describe` roda a conta do painel LADO A LADO com o `runProofCheck` da edge
 * function, pra as duas nunca divergirem em silêncio.
 *
 * Roda com: npx vitest run driverPaySemPlanilha
 */
import { describe, it, expect } from 'vitest';
import {
  plataformasSemPlanilha,
  expectedProofPlatforms,
  statusPorQuantidade,
  proofDispensadoSemPacote,
  type DriverRowData,
  type ProofRequest,
} from '../../src/components/driverpay/driverPayShared';
import { runProofCheck } from '../../supabase/functions/_shared/proofCheck';

function row(driverId: string, pacotes: Record<string, number>, groupName: string | null): DriverRowData {
  return {
    paymentId: `pay-${driverId}`, driverId, name: driverId.toUpperCase(), route: '', groupName,
    routes: [{ route: '', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null, active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}
const geral = (...plats: string[]): ProofRequest[] => plats.map((p) => ({ platformName: p, driverId: null }));
const PLATS = ['SHOPEE', 'LOGGI'];

describe('plataformasSemPlanilha', () => {
  it('quinzena zerada: as duas plataformas estao sem planilha', () => {
    const rows = [row('ana', {}, 'G1'), row('bia', {}, 'G1')];
    expect([...plataformasSemPlanilha(rows, PLATS)].sort()).toEqual(['LOGGI', 'SHOPEE']);
  });

  it('🎯 importar a LOGGI nao faz o sistema achar que a da SHOPEE chegou', () => {
    const rows = [row('ana', { LOGGI: 300 }, 'G1'), row('bia', {}, 'G1')];
    expect([...plataformasSemPlanilha(rows, PLATS)]).toEqual(['SHOPEE']);
  });

  it('um unico driver com pacote ja marca a planilha como chegada', () => {
    const rows = [row('ana', { SHOPEE: 1 }, 'G1'), row('bia', {}, 'G1')];
    expect([...plataformasSemPlanilha(rows, PLATS)]).toEqual(['LOGGI']);
  });

  it('pacote ZERO nao conta como planilha chegada', () => {
    expect([...plataformasSemPlanilha([row('ana', { SHOPEE: 0 }, 'G1')], PLATS)].sort())
      .toEqual(['LOGGI', 'SHOPEE']);
  });
});

describe('expectedProofPlatforms sem planilha', () => {
  const sem = new Set(['SHOPEE']);

  it('🎯 cobra quem esta em grupo mesmo sem pacote nenhum', () => {
    expect(expectedProofPlatforms(row('ana', {}, 'G1'), geral('SHOPEE'), sem)).toEqual(['SHOPEE']);
  });

  it('🎯 NAO cobra quem esta sem grupo (a regra de logistica continua valendo)', () => {
    expect(expectedProofPlatforms(row('marcos', {}, null), geral('SHOPEE'), sem)).toEqual([]);
  });

  it('nao cobra plataforma cuja planilha JA chegou se ele nao tem pacote nela', () => {
    // LOGGI ja tem planilha (nao esta no set) e ele nao entregou LOGGI -> nao cobra.
    expect(expectedProofPlatforms(row('ana', { SHOPEE: 10 }, 'G1'), geral('LOGGI'), sem)).toEqual([]);
  });

  it('sem o set (planilha toda importada) volta a regra de sempre', () => {
    expect(expectedProofPlatforms(row('ana', {}, 'G1'), geral('SHOPEE'))).toEqual([]);
    expect(expectedProofPlatforms(row('ana', { SHOPEE: 10 }, 'G1'), geral('SHOPEE'))).toEqual(['SHOPEE']);
  });

  it('pedido individual tambem funciona sem planilha', () => {
    const r = row('marcos', {}, null);
    expect(expectedProofPlatforms(r, [{ platformName: 'SHOPEE', driverId: 'marcos' }], sem)).toEqual(['SHOPEE']);
  });
});

describe('statusPorQuantidade — reconferencia sem IA', () => {
  it('bate exatamente: confirmado', () => {
    expect(statusPorQuantidade(1808, 1808)).toBe('confirmado');
  });

  it('nao bate: divergente', () => {
    expect(statusPorQuantidade(1808, 1750)).toBe('divergente');
  });

  it('dentro da tolerancia: confirmado', () => {
    expect(statusPorQuantidade(1808, 1806, 2)).toBe('confirmado');
    expect(statusPorQuantidade(1808, 1805, 2)).toBe('divergente');
  });

  it('planilha ainda sem numero pra ele: continua pendente, nao vira divergente', () => {
    expect(statusPorQuantidade(1808, 0)).toBe('pendente');
  });

  it('print que nunca foi lido: pendente (nao da pra comparar nada)', () => {
    expect(statusPorQuantidade(null, 1750)).toBe('pendente');
  });
});

// ── A trava contra as duas contas divergirem ────────────────────────────────
describe('painel e edge function dao o MESMO veredito', () => {
  const casos = [
    { read: 1808, esperado: 1808, tol: 0 },
    { read: 1808, esperado: 1750, tol: 0 },
    { read: 1808, esperado: 1806, tol: 2 },
    { read: 1808, esperado: 1805, tol: 2 },
    { read: 1750, esperado: 1808, tol: 0 },
  ];

  for (const c of casos) {
    it(`print ${c.read} x planilha ${c.esperado} (tolerancia ${c.tol})`, () => {
      const doPainel = statusPorQuantidade(c.read, c.esperado, c.tol);
      const daEdgeFn = runProofCheck({
        reading: {
          legivel: true, entregues: String(c.read),
          periodoInicio: '2026-07-01', periodoFim: '2026-07-15',
        },
        periodStart: '2026-07-01', periodEnd: '2026-07-15',
        expectedPackages: c.esperado, tolerancePackages: c.tol, platformLabel: 'SHOPEE',
      });
      const esperadoDaEdge = daEdgeFn.qtdOk === true ? 'confirmado' : 'divergente';
      expect(doPainel, 'painel x edge function').toBe(esperadoDaEdge);
    });
  }
});

// ── Quem NÃO entrega naquela plataforma some da cobrança (04/08/2026) ───────
// Pedido do Victor: quando a planilha entra, o líder para de caçar print de quem não roda
// Shopee — mas o painel mostra uma marca própria, pra distinguir "não precisava" de "não
// foi pedido". ⚠️ Resolve só o PRINT; o "Espelho conferido" do pagamento não é tocado.
describe('proofDispensadoSemPacote', () => {
  const semShopee = new Set(['SHOPEE']);

  it('🎯 planilha JÁ importada e ele sem pacote: dispensado', () => {
    const r = row('ana', { LOGGI: 300 }, 'G1');
    expect(proofDispensadoSemPacote(r, geral('SHOPEE'), new Set())).toEqual(['SHOPEE']);
    // e some da cobrança
    expect(expectedProofPlatforms(r, geral('SHOPEE'), new Set())).toEqual([]);
  });

  it('planilha AINDA NÃO importada: continua pendente, não dispensado', () => {
    const r = row('ana', {}, 'G1');
    expect(proofDispensadoSemPacote(r, geral('SHOPEE'), semShopee)).toEqual([]);
    expect(expectedProofPlatforms(r, geral('SHOPEE'), semShopee)).toEqual(['SHOPEE']);
  });

  it('tem pacote: continua sendo cobrado, não dispensado', () => {
    const r = row('ana', { SHOPEE: 500 }, 'G1');
    expect(proofDispensadoSemPacote(r, geral('SHOPEE'), new Set())).toEqual([]);
    expect(expectedProofPlatforms(r, geral('SHOPEE'), new Set())).toEqual(['SHOPEE']);
  });

  it('sem grupo não é dispensado (nem foi cobrado — é outro caso, outra marca)', () => {
    const r = row('marcos', { LOGGI: 10 }, null);
    expect(proofDispensadoSemPacote(r, geral('SHOPEE'), new Set())).toEqual([]);
  });

  it('duas plataformas: dispensado só na que ele não roda', () => {
    const r = row('ana', { LOGGI: 300 }, 'G1');
    expect(proofDispensadoSemPacote(r, geral('SHOPEE', 'LOGGI'), new Set())).toEqual(['SHOPEE']);
    expect(expectedProofPlatforms(r, geral('SHOPEE', 'LOGGI'), new Set())).toEqual(['LOGGI']);
  });
});
