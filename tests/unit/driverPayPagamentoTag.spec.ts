/**
 * Tag "pagamento concluído" (04/08/2026).
 *
 * Decisões do Victor:
 *  · a marca é por (entregador, PLATAFORMA) — pagar só a SHOPEE marca só a SHOPEE, e as
 *    outras plataformas continuam podendo ser pagas depois;
 *  · num GRUPO o dinheiro sai numa linha só do líder mas cobre os N membros, então marcar
 *    o relatório marca os **N membros**, não só o líder.
 *
 * ⚠️ Isto vira o REGISTRO DE QUEM JÁ RECEBEU. Errar aqui = pagar duas vezes ou deixar
 * alguém sem receber. Daí os testes serem chatos com os estados intermediários.
 *
 * Roda com: npx vitest run driverPayPagamentoTag
 */
import { describe, it, expect } from 'vitest';
import {
  indexarMarcas,
  pagamentoDoDriver,
  marcasDoRelatorio,
  jaPagosNoRelatorio,
  type DriverRowData,
  type PaymentMark,
} from '../../src/components/driverpay/driverPayShared';

const PLATS = ['SHOPEE', 'LOGGI', 'ANJUN'];

function row(
  driverId: string,
  pacotes: Record<string, number>,
  groupName: string | null = null,
  /** Vale/perda dele nesta quinzena, em R$ (14/08/2026: o selo só acende com valor real). */
  vale = 0,
): DriverRowData {
  return {
    paymentId: `pay-${driverId}`, driverId, name: driverId.toUpperCase(), route: null, groupName,
    routes: [{ route: 'R1', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: vale > 0 ? [{ amount: vale }] : [],
    pixKey: null, recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null, active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}
const marca = (driverId: string, platformName: string, paidAt: string): PaymentMark =>
  ({ driverId, platformName, paidAt });

describe('pagamentoDoDriver', () => {
  it('ninguém pago ainda: pendente', () => {
    const r = pagamentoDoDriver(row('caio', { SHOPEE: 100, LOGGI: 50 }), PLATS, indexarMarcas([]));
    expect(r.estado).toBe('pendente');
    expect(r.faltando.sort()).toEqual(['LOGGI', 'SHOPEE']);
  });

  it('🎯 pagou SÓ a SHOPEE: fica PARCIAL, e a LOGGI continua a receber', () => {
    const idx = indexarMarcas([marca('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);
    const r = pagamentoDoDriver(row('caio', { SHOPEE: 100, LOGGI: 50 }), PLATS, idx);
    expect(r.estado).toBe('parcial');
    expect(r.pagas).toEqual(['SHOPEE']);
    expect(r.faltando).toEqual(['LOGGI']);
  });

  it('pagou todas as que ele tem: CONCLUIDO', () => {
    const idx = indexarMarcas([
      marca('caio', 'SHOPEE', '2026-08-04T12:00:00Z'),
      marca('caio', 'LOGGI', '2026-08-05T12:00:00Z'),
    ]);
    const r = pagamentoDoDriver(row('caio', { SHOPEE: 100, LOGGI: 50 }), PLATS, idx);
    expect(r.estado).toBe('concluido');
    expect(r.ultimoPagamento).toBe('2026-08-05T12:00:00Z');
  });

  it('⚠️ plataforma que ele NAO roda nao segura o "concluido"', () => {
    // ele só tem SHOPEE; a ANJUN nem entra na conta
    const idx = indexarMarcas([marca('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);
    expect(pagamentoDoDriver(row('caio', { SHOPEE: 100 }), PLATS, idx).estado).toBe('concluido');
  });

  it('sem pacote nenhum: nao ha o que pagar', () => {
    expect(pagamentoDoDriver(row('caio', {}), PLATS, indexarMarcas([])).estado).toBe('sem_pacote');
  });

  it('marca repetida: vale a mais recente', () => {
    const idx = indexarMarcas([
      marca('caio', 'SHOPEE', '2026-08-01T12:00:00Z'),
      marca('caio', 'SHOPEE', '2026-08-09T12:00:00Z'),
    ]);
    expect(pagamentoDoDriver(row('caio', { SHOPEE: 1 }), PLATS, idx).ultimoPagamento)
      .toBe('2026-08-09T12:00:00Z');
  });
});

describe('marcasDoRelatorio', () => {
  it('🎯 GRUPO: marca os N MEMBROS, nao so o lider', () => {
    const grupo = [
      row('anderson', { SHOPEE: 100 }, 'G1'),
      row('bruna', { SHOPEE: 200 }, 'G1'),
      row('caio', { SHOPEE: 300 }, 'G1'),
    ];
    const m = marcasDoRelatorio(grupo, PLATS);
    expect(m).toHaveLength(3);
    expect(m.map((x) => x.driverId).sort()).toEqual(['anderson', 'bruna', 'caio']);
  });

  it('relatorio SO da SHOPEE marca so a SHOPEE', () => {
    const m = marcasDoRelatorio([row('caio', { SHOPEE: 100, LOGGI: 50 })], PLATS, new Set(['SHOPEE']));
    expect(m).toEqual([{ driverId: 'caio', platformName: 'SHOPEE' }]);
  });

  it('relatorio de todas marca todas em que ele tem pacote', () => {
    const m = marcasDoRelatorio([row('caio', { SHOPEE: 100, LOGGI: 50 })], PLATS);
    expect(m.map((x) => x.platformName).sort()).toEqual(['LOGGI', 'SHOPEE']);
  });

  it('nao marca plataforma sem pacote', () => {
    const m = marcasDoRelatorio([row('caio', { SHOPEE: 100, LOGGI: 0 })], PLATS);
    expect(m).toEqual([{ driverId: 'caio', platformName: 'SHOPEE' }]);
  });
});

describe('jaPagosNoRelatorio — o aviso antes de baixar', () => {
  const idx = indexarMarcas([marca('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);

  it('🎯 acusa quem ja foi pago NAQUELA plataforma, com a data', () => {
    const r = jaPagosNoRelatorio([row('caio', { SHOPEE: 100 })], PLATS, idx);
    // 05/08/2026: passou a vir `valeOuPerda` junto — o aviso de desconto pendente precisa
    // saber se existe o que descontar (antes ele listava quem nao devia nada).
    expect(r).toEqual([{
      driverId: 'caio', name: 'CAIO', platformName: 'SHOPEE',
      paidAt: '2026-08-04T12:00:00Z', deductionsApplied: undefined, valeOuPerda: 0,
    }]);
  });

  it('🎯 NAO acusa nas OUTRAS plataformas — elas ainda podem ser pagas', () => {
    const r = jaPagosNoRelatorio([row('caio', { LOGGI: 50 })], PLATS, idx, new Set(['LOGGI']));
    expect(r).toEqual([]);
  });

  it('quem nunca foi pago nao aparece', () => {
    expect(jaPagosNoRelatorio([row('bia', { SHOPEE: 10 })], PLATS, idx)).toEqual([]);
  });

  it('grupo com um membro ja pago: acusa so esse membro', () => {
    const grupo = [row('caio', { SHOPEE: 1 }, 'G1'), row('bia', { SHOPEE: 1 }, 'G1')];
    const r = jaPagosNoRelatorio(grupo, PLATS, idx);
    expect(r.map((x) => x.driverId)).toEqual(['caio']);
  });
});

// ── O desconto saiu ou não? (04/08/2026) ────────────────────────────────────
// Quando o pagamento sai PARCIAL, o vale/perda não é abatido e fica pendente pro pagamento
// das demais plataformas. Sem registrar isso, o desconto some e ninguém percebe.
describe('desconto pendente', () => {
  const comDesconto = (d: string, p: string, at: string): PaymentMark =>
    ({ driverId: d, platformName: p, paidAt: at, deductionsApplied: true });
  const semDesconto = (d: string, p: string, at: string): PaymentMark =>
    ({ driverId: d, platformName: p, paidAt: at, deductionsApplied: false });

  it('pago COM desconto: nada pendente', () => {
    const idx = indexarMarcas([comDesconto('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);
    expect(pagamentoDoDriver(row('caio', { SHOPEE: 1 }, null, 50), PLATS, idx).descontoPendente).toBe(false);
  });

  it('🎯 pago SEM desconto E com vale/perda de verdade: acusa pendente', () => {
    const idx = indexarMarcas([semDesconto('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);
    expect(pagamentoDoDriver(row('caio', { SHOPEE: 1 }, null, 50), PLATS, idx).descontoPendente).toBe(true);
  });

  it('basta UMA plataforma sem desconto pra acusar (tendo vale/perda)', () => {
    const idx = indexarMarcas([
      comDesconto('caio', 'SHOPEE', '2026-08-04T12:00:00Z'),
      semDesconto('caio', 'LOGGI', '2026-08-05T12:00:00Z'),
    ]);
    const r = pagamentoDoDriver(row('caio', { SHOPEE: 1, LOGGI: 1 }, null, 50), PLATS, idx);
    expect(r.estado).toBe('concluido');
    // basta UMA das plataformas ter vindo COM desconto pra não acusar de novo (compensação).
    expect(r.descontoPendente).toBe(false);
  });

  it('⚠️ marca ANTIGA (null) nao acusa — nao da pra afirmar o que aconteceu', () => {
    const antiga: PaymentMark = { driverId: 'caio', platformName: 'SHOPEE', paidAt: '2026-08-04T12:00:00Z' };
    expect(pagamentoDoDriver(row('caio', { SHOPEE: 1 }, null, 50), PLATS, indexarMarcas([antiga])).descontoPendente)
      .toBe(false);
  });

  // ── 14/08/2026: falsos-positivos que confundiam o Victor na grade ──────────
  it('🎯 pago SEM desconto mas SEM vale/perda nenhum: NÃO acusa (não devia nada)', () => {
    const idx = indexarMarcas([semDesconto('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);
    expect(pagamentoDoDriver(row('caio', { SHOPEE: 1 }), PLATS, idx).descontoPendente).toBe(false);
  });

  it('🎯 pago sem desconto numa plataforma, mas COM desconto em outra: NÃO acusa (já compensou)', () => {
    const idx = indexarMarcas([
      semDesconto('caio', 'SHOPEE', '2026-08-04T12:00:00Z'),
      comDesconto('caio', 'LOGGI', '2026-08-05T12:00:00Z'),
    ]);
    const r = pagamentoDoDriver(row('caio', { SHOPEE: 1, LOGGI: 1 }, null, 50), PLATS, idx);
    expect(r.descontoPendente).toBe(false);
  });

  it('🎯 tem vale, pago sem desconto, mas o livro-caixa já abateu (espelho): NÃO acusa', () => {
    const idx = indexarMarcas([semDesconto('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);
    const r = pagamentoDoDriver(row('caio', { SHOPEE: 1 }, null, 50), PLATS, idx, /* jaAbatido */ 50);
    expect(r.descontoPendente).toBe(false);
  });

  it('o aviso do relatorio carrega o "sem desconto" junto', () => {
    const idx = indexarMarcas([semDesconto('caio', 'SHOPEE', '2026-08-04T12:00:00Z')]);
    const r = jaPagosNoRelatorio([row('caio', { SHOPEE: 1 })], PLATS, idx);
    expect(r[0].deductionsApplied).toBe(false);
  });
});
