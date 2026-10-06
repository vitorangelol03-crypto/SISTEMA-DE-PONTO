/**
 * Testes unit das implementações dos espelhos de 2026-07-20:
 *  1. MULTI-ROTA: driver com mais de uma rota com pacotes na MESMA plataforma
 *     gera uma linha POR ROTA no espelho, cada uma com a taxa real da rota —
 *     NUNCA uma linha única com taxa média (caso Fabricio: 2,00 e 1,50 ≠ "1,83").
 *  2. VALOR SEPARADO: plataforma destacada com mirror_separate_value tem o valor
 *     fora do total EXIBIDO (faixa própria); helpers separatedPlatformTotals/
 *     separatedAmount somam certo, inclusive multi-rota e no grupo.
 *
 * Roda com: npx vitest run driverPayMirrorSeparate
 */

import { describe, it, expect } from 'vitest';
import {
  buildDriverMirrorData,
  buildGroupMirrorData,
  type DriverRowData,
  type RouteLine,
} from '../../src/components/driverpay/driverPayShared';
import {
  packagesForPlatform,
  platformLineLabel,
  separatedPlatformTotals,
  mirrorBands,
  groupMirrorBands,
  separatedBandBreakdown,
  resumoComAbateNasFaixas,
} from '../../src/utils/driverMirrorGenerator';
import type { Company } from '../../src/services/database';
import type { DriverPlatform, DriverPaymentPeriod } from '../../src/services/driverPay';

const company = { id: 'c1', cnpj: null, city: 'Caratinga' } as unknown as Company;
const period = {
  id: 'per1', company_id: 'c1', label: 'Quinzena Teste', start_date: null, end_date: null,
  status: 'aberto', concluded_at: null, concluded_by: null, created_by: null, created_at: '',
} as DriverPaymentPeriod;

function platform(name: string, opts: Partial<DriverPlatform> = {}): DriverPlatform {
  return {
    id: `p-${name}`, company_id: 'c1', name, default_rate: 2, sort_order: 0, active: true,
    color: null, highlight_mirror: false, mirror_notice: null, mirror_separate_value: false,
    created_by: null, created_at: '',
    ...opts,
  } as DriverPlatform;
}

function route(name: string, packages: Record<string, number>, rates: Record<string, number> = {}): RouteLine {
  return { route: name, packages, rates, packageIds: {} } as RouteLine;
}

function rowWithRoutes(name: string, routes: RouteLine[]): DriverRowData {
  return {
    paymentId: `pay-${name}`, driverId: `drv-${name}`, name, route: null, groupName: null,
    routes, ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, cpf: null, phone: null,
    active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

describe('espelho multi-rota — uma linha POR ROTA, nunca taxa média (2026-07-20)', () => {
  it('caso Fabricio: SHOPEE 1390×2,00 (Caratinga) + 693×1,50 (COLETA) → 2 linhas, sem "1,83"', () => {
    const plats = [platform('SHOPEE')];
    const data = buildDriverMirrorData(
      rowWithRoutes('FABRICIO', [
        route('Caratinga', { SHOPEE: 1390 }, { SHOPEE: 2.0 }),
        route('COLETA', { SHOPEE: 693 }, { SHOPEE: 1.5 }),
      ]),
      plats, company, period,
    );
    const shopee = data.platforms.filter((p) => p.platform === 'SHOPEE');
    expect(shopee).toHaveLength(2);
    expect(shopee[0]).toMatchObject({ route: 'Caratinga', packages: 1390, unitValue: 2.0, subtotal: 2780 });
    expect(shopee[1]).toMatchObject({ route: 'COLETA', packages: 693, unitValue: 1.5, subtotal: 1039.5 });
    // Nenhuma linha com a média ponderada (1,834…) — é exatamente o que o Victor proibiu.
    expect(shopee.some((p) => p.unitValue !== 2.0 && p.unitValue !== 1.5)).toBe(false);
    expect(platformLineLabel(shopee[0])).toBe('SHOPEE — Caratinga');
    expect(platformLineLabel(shopee[1])).toBe('SHOPEE — COLETA');
  });

  it('mais de uma rota com pacotes separa MESMO com a mesma taxa (regra: multi-rota = separado)', () => {
    const data = buildDriverMirrorData(
      rowWithRoutes('X', [
        route('Caratinga', { ANJUN: 100 }, { ANJUN: 2.0 }),
        route('Vargem Alegre', { ANJUN: 50 }, { ANJUN: 2.0 }),
      ]),
      [platform('ANJUN')], company, period,
    );
    const anjun = data.platforms.filter((p) => p.platform === 'ANJUN');
    expect(anjun).toHaveLength(2);
    expect(anjun.map((p) => p.route)).toEqual(['Caratinga', 'Vargem Alegre']);
  });

  it('rota única continua uma linha agregada, sem campo route', () => {
    const data = buildDriverMirrorData(
      rowWithRoutes('Y', [route('Caratinga', { eMile: 157 }, { eMile: 2.0 })]),
      [platform('eMile')], company, period,
    );
    const emile = data.platforms.filter((p) => p.platform === 'eMile');
    expect(emile).toHaveLength(1);
    expect(emile[0].route ?? null).toBeNull();
    expect(platformLineLabel(emile[0])).toBe('eMile');
  });

  it('rota da plataforma sem pacotes não vira linha (presença por rota)', () => {
    const data = buildDriverMirrorData(
      rowWithRoutes('Z', [
        route('Caratinga', { SHOPEE: 10, eMile: 5 }, { SHOPEE: 2, eMile: 2 }),
        route('COLETA', { SHOPEE: 4 }, { SHOPEE: 1.5 }),
      ]),
      [platform('SHOPEE'), platform('eMile')], company, period,
    );
    // SHOPEE em 2 rotas → 2 linhas; eMile só em 1 → linha única agregada.
    expect(data.platforms.filter((p) => p.platform === 'SHOPEE')).toHaveLength(2);
    expect(data.platforms.filter((p) => p.platform === 'eMile')).toHaveLength(1);
  });

  it('packagesForPlatform SOMA as linhas multi-rota (resumo do grupo não perde a 2ª rota)', () => {
    const data = buildDriverMirrorData(
      rowWithRoutes('W', [
        route('Caratinga', { SHOPEE: 1390 }, { SHOPEE: 2 }),
        route('COLETA', { SHOPEE: 693 }, { SHOPEE: 1.5 }),
      ]),
      [platform('SHOPEE')], company, period,
    );
    expect(packagesForPlatform(data, 'SHOPEE')).toBe(2083);
  });

  it('totais do espelho continuam CHEIOS (a soma das linhas bate com o total de pacotes)', () => {
    const data = buildDriverMirrorData(
      rowWithRoutes('V', [
        route('Caratinga', { SHOPEE: 1390, eMile: 157 }, { SHOPEE: 2, eMile: 2 }),
        route('COLETA', { SHOPEE: 693 }, { SHOPEE: 1.5 }),
      ]),
      [platform('SHOPEE'), platform('eMile')], company, period,
    );
    const somaLinhas = data.platforms.reduce((s, p) => s + p.subtotal, 0);
    expect(somaLinhas).toBeCloseTo(2780 + 1039.5 + 314, 2);
    expect(data.totals.packagesValue).toBeCloseTo(somaLinhas, 2);
  });
});

describe('valor separado do total — mirror_separate_value (2026-07-20)', () => {
  it('plataforma destacada + separada → linhas com separateValue e helpers somando certo', () => {
    const plats = [
      platform('eMile', { highlight_mirror: true, mirror_separate_value: true }),
      platform('SHOPEE'),
    ];
    const data = buildDriverMirrorData(
      rowWithRoutes('A', [route('Caratinga', { eMile: 157, SHOPEE: 100 }, { eMile: 2, SHOPEE: 2 })]),
      plats, company, period,
    );
    expect(data.platforms.find((p) => p.platform === 'eMile')?.separateValue).toBe(true);
    expect(data.platforms.find((p) => p.platform === 'SHOPEE')?.separateValue).toBe(false);
    const sep = separatedPlatformTotals(data.platforms);
    expect(sep).toEqual([{ platform: 'eMile', packages: 157, amount: 314 }]);
    expect(mirrorBands(data).separated.map((b) => b.gross)).toEqual([314]);
    // O total persistido continua CHEIO — a subtração é só na apresentação.
    expect(data.totals.packagesValue).toBe(314 + 200);
  });

  it('separado SEM destaque não separa (acoplamento ao destaque, decisão do Victor)', () => {
    const plats = [platform('eMile', { highlight_mirror: false, mirror_separate_value: true })];
    const data = buildDriverMirrorData(
      rowWithRoutes('B', [route('Caratinga', { eMile: 10 }, { eMile: 2 })]),
      plats, company, period,
    );
    expect(data.platforms[0].separateValue).toBe(false);
    expect(mirrorBands(data).separated).toEqual([]);
  });

  it('plataforma ARQUIVADA não separa valor (mesmo marcada)', () => {
    const plats = [platform('eMile', { active: false, highlight_mirror: true, mirror_separate_value: true })];
    const data = buildDriverMirrorData(
      rowWithRoutes('C', [route('Caratinga', { eMile: 10 }, { eMile: 2 })]),
      plats, company, period,
    );
    expect(data.platforms[0].separateValue).toBe(false);
  });

  it('multi-rota separada: separatedPlatformTotals junta as linhas da MESMA plataforma', () => {
    const plats = [platform('SHOPEE', { highlight_mirror: true, mirror_separate_value: true })];
    const data = buildDriverMirrorData(
      rowWithRoutes('D', [
        route('Caratinga', { SHOPEE: 1390 }, { SHOPEE: 2 }),
        route('COLETA', { SHOPEE: 693 }, { SHOPEE: 1.5 }),
      ]),
      plats, company, period,
    );
    const sep = separatedPlatformTotals(data.platforms);
    expect(sep).toHaveLength(1);
    expect(sep[0].packages).toBe(2083);
    expect(sep[0].amount).toBeCloseTo(3819.5, 2);
  });

  it('grupo: totais persistidos cheios; a soma separada do grupo vem dos drivers', () => {
    const plats = [
      platform('eMile', { highlight_mirror: true, mirror_separate_value: true }),
      platform('SHOPEE'),
    ];
    const rows = [
      rowWithRoutes('D1', [route('Caratinga', { eMile: 100, SHOPEE: 50 }, { eMile: 2, SHOPEE: 2 })]),
      rowWithRoutes('D2', [route('Caratinga', { eMile: 30 }, { eMile: 2 })]),
    ];
    const group = buildGroupMirrorData('GRUPO TESTE', rows, plats, company, period);
    // Persistido: cheio (200 + 100) + (60) = 360.
    expect(group.groupTotals.packagesValue).toBe(360);
    // Separado do grupo (apresentação): 200 + 60 = 260.
    const sepDoGrupo = group.drivers.reduce(
      (s, d) => s + separatedPlatformTotals(d.platforms).reduce((t, x) => t + x.amount, 0),
      0,
    );
    expect(sepDoGrupo).toBe(260);
    expect(groupMirrorBands(group).separated.map((b) => b.gross)).toEqual([260]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 06/10/2026 — ACHADO REAL: o espelho do ANDRE (Ubaporanga, só eMile) saiu com o TOTAL A RECEBER
// −R$ 225,50 e a faixa amarela da eMile CHEIA (R$ 1.244,00): o papel tirava TODO vale/perda da
// faixa verde. Agora as faixas seguem a regra de 10/09 (o vale/perda sai da de MAIOR valor), a
// mesma da conferência da nota e do relatório.
// ════════════════════════════════════════════════════════════════════════════
type Discount = DriverRowData['discounts'][number];
function desconto(amount: number, code: string, status: 'PNR' | 'LOST'): Discount {
  return {
    id: `d-${code}`, company_id: 'c1', payment_id: 'pay', amount, package_code: code, observation: null,
    package_status: status, proof1_path: null, proof2_path: null, proof_video_path: null,
    created_by: '2626', created_at: '',
  };
}
const EMILE = platform('eMile', { highlight_mirror: true, mirror_separate_value: true, mirror_notice: 'A NOTA FISCAL DEVE SER GERADA NO CNPJ 53.824.315/0001-10' });
const SHOPEE = platform('SHOPEE');
const LOGGI = platform('LOGGI');
const comDescontos = (row: DriverRowData, ...ds: Discount[]): DriverRowData => ({ ...row, discounts: ds });

describe('faixas do espelho — o desconto sai da faixa de MAIOR valor (caso ANDRE, 06/10/2026)', () => {
  const andre = comDescontos(
    rowWithRoutes('ANDRE', [route('Ubaporanga', { eMile: 622 }, { eMile: 2 })]),
    desconto(113.9, '3320009829591', 'LOST'),
    desconto(111.6, '3320094790122', 'PNR'),
  );

  it('ANDRE individual: só eMile → espelho NORMAL, TOTAL A RECEBER R$ 1.018,50, nada negativo', () => {
    const data = buildDriverMirrorData(andre, [EMILE], company, period);
    expect(data.totals.toReceive).toBe(1018.5);
    const b = mirrorBands(data);
    expect(b.separated).toEqual([]); // nada pra separar: é tudo eMile
    expect(b.green).toBe(1018.5);
    expect(b.greenGross).toBe(1244);
    expect(b.greenDeducted).toBe(225.5);
    // O desconto continua APARECENDO (pedido do Victor): lista e resumo de sempre.
    expect(data.discounts.map((d) => d.value)).toEqual([113.9, 111.6]);
    expect(resumoComAbateNasFaixas(b, data.totals)).toBeNull();
  });

  it('ANDRE no espelho de GRUPO (1 membro): total do grupo R$ 1.018,50 e a linha dele também', () => {
    const g = buildGroupMirrorData('Andre Luis - UBAPORANGA', [andre], [EMILE], company, period);
    const b = groupMirrorBands(g);
    expect(b.separated).toEqual([]);
    expect(b.green).toBe(1018.5);
    expect(b.memberGreen).toEqual([1018.5]);
  });

  it('ANDRE com os 77 da LOGGI: eMile (maior) absorve o desconto — Loggi R$ 154,00 e eMile R$ 1.018,50', () => {
    const comLoggi = comDescontos(
      rowWithRoutes('ANDRE', [route('Ubaporanga', { eMile: 622, LOGGI: 77 }, { eMile: 2, LOGGI: 2 })]),
      desconto(113.9, '3320009829591', 'LOST'),
      desconto(111.6, '3320094790122', 'PNR'),
    );
    const g = buildGroupMirrorData('Andre Luis - UBAPORANGA', [comLoggi], [EMILE, LOGGI], company, period);
    const b = groupMirrorBands(g);
    // ANTES: verde = 1.172,50 − 1.244,00 = −71,50 (negativo de novo) e amarela 1.244,00.
    expect(b.green).toBe(154);
    expect(b.memberGreen).toEqual([154]);
    expect(b.separated).toEqual([{ platform: 'eMile', packages: 622, gross: 1244, deducted: 225.5, amount: 1018.5 }]);
    expect(separatedBandBreakdown(b.separated[0])).toContain('225,50 de descontos e vales');
    // O resumo individual diz de qual faixa saiu o desconto.
    const linhas = resumoComAbateNasFaixas(mirrorBands(g.drivers[0]), g.drivers[0].totals);
    expect(linhas?.map((l) => [l.rotulo, l.valor, l.tipo])).toEqual([
      ['Total de pacotes (sem EMILE)', 154, 'soma'],
      ['Vales e perdas da quinzena', 225.5, 'info'],
      ['Abatido do total EMILE (faixa amarela abaixo)', 225.5, 'info'],
    ]);
  });

  it('Shopee MAIOR que a eMile (todo mundo hoje): o papel continua EXATAMENTE como antes', () => {
    const rogerio = comDescontos(
      rowWithRoutes('ROGERIO', [route('Vermelho Novo', { eMile: 408, SHOPEE: 3245 }, { eMile: 2.2, SHOPEE: 2.2 })]),
      desconto(205.9, 'X1', 'PNR'),
    );
    const data = buildDriverMirrorData(rogerio, [EMILE, SHOPEE], company, period);
    const b = mirrorBands(data);
    const antigoVerde = data.totals.toReceive - 408 * 2.2; // a conta de antes
    expect(b.green).toBeCloseTo(antigoVerde, 2);
    expect(b.separated[0]).toMatchObject({ gross: 897.6, deducted: 0, amount: 897.6 });
    expect(separatedBandBreakdown(b.separated[0])).toBeNull(); // faixa amarela sem linha nova
    expect(resumoComAbateNasFaixas(b, data.totals)).toBeNull(); // resumo de sempre
  });

  it('desconto maior que o verde (transborda): verde zera e o resto sai da eMile — nada negativo', () => {
    const r = comDescontos(
      rowWithRoutes('X', [route('C', { eMile: 100, SHOPEE: 500 }, { eMile: 2, SHOPEE: 2 })]),
      desconto(1100, 'Y', 'LOST'),
    );
    const b = mirrorBands(buildDriverMirrorData(r, [EMILE, SHOPEE], company, period));
    expect(b.green).toBe(0);
    expect(b.separated[0]).toMatchObject({ gross: 200, deducted: 100, amount: 100 });
  });

  it('pagamento parcial (não abate): faixas no bruto e o desconto fica só listado', () => {
    const data = buildDriverMirrorData(andre, [EMILE, LOGGI], company, period, undefined, false);
    const b = mirrorBands(data);
    expect(b.deductedTotal).toBe(0);
    expect(b.green).toBe(1244);
    expect(data.deductionsApplied).toBe(false);
  });

  it('regra do saldo (abate só um pedaço): a faixa usa o que foi abatido de verdade', () => {
    const data = buildDriverMirrorData(andre, [EMILE], company, period, undefined, true, 100);
    const b = mirrorBands(data);
    expect(b.green).toBe(1144);
    expect(b.deductedTotal).toBe(100);
  });
});

describe('espelho de GRUPO — a coluna "A Receber" fecha com o total, centavo por centavo', () => {
  it('grupo com Shopee maior: cada membro tem o PRÓPRIO desconto abatido (igual a sempre)', () => {
    const a = comDescontos(rowWithRoutes('A', [route('C', { eMile: 300 }, { eMile: 2 })]), desconto(50, 'A1', 'PNR'));
    const b = rowWithRoutes('B', [route('C', { SHOPEE: 3000 }, { SHOPEE: 2 })]);
    const g = buildGroupMirrorData('G', [a, b], [EMILE, SHOPEE], company, period);
    const bands = groupMirrorBands(g);
    // Regra do GRUPO (a da nota do líder): a Shopee do grupo é a maior → o desconto sai do verde.
    expect(bands.green).toBe(5950);
    expect(bands.separated[0]).toMatchObject({ gross: 600, deducted: 0, amount: 600 });
    expect(bands.memberGreen).toEqual([-50, 6000]); // o mesmo que a coluna sempre mostrou
    expect(bands.memberGreen.reduce((s, v) => s + v, 0)).toBe(bands.green);
  });

  it('grupo com eMile maior: o desconto sai da faixa amarela e a coluna não abate ninguém', () => {
    const a = comDescontos(rowWithRoutes('A', [route('C', { eMile: 1000, SHOPEE: 50 }, { eMile: 2, SHOPEE: 2 })]), desconto(80, 'A1', 'PNR'));
    const b = comDescontos(rowWithRoutes('B', [route('C', { eMile: 500, SHOPEE: 100 }, { eMile: 2, SHOPEE: 2 })]), desconto(20, 'B1', 'LOST'));
    const g = buildGroupMirrorData('G', [a, b], [EMILE, SHOPEE], company, period);
    const bands = groupMirrorBands(g);
    expect(bands.green).toBe(300);
    expect(bands.separated[0]).toMatchObject({ gross: 3000, deducted: 100, amount: 2900 });
    expect(bands.memberGreen).toEqual([100, 200]);
  });

  it('transbordo no grupo com centavos quebrados: a coluna soma EXATAMENTE o total verde', () => {
    const a = comDescontos(rowWithRoutes('A', [route('C', { SHOPEE: 10, eMile: 3 }, { SHOPEE: 1.01, eMile: 2 })]), desconto(9.99, 'A1', 'PNR'));
    const b = comDescontos(rowWithRoutes('B', [route('C', { SHOPEE: 7, eMile: 2 }, { SHOPEE: 1.01, eMile: 2 })]), desconto(7.33, 'B1', 'LOST'));
    const c = comDescontos(rowWithRoutes('C', [route('C', { SHOPEE: 1, eMile: 1 }, { SHOPEE: 1.01, eMile: 2 })]), desconto(1.01, 'C1', 'LOST'));
    const g = buildGroupMirrorData('G', [a, b, c], [EMILE, SHOPEE], company, period);
    const bands = groupMirrorBands(g);
    const cents = (v: number) => Math.round(v * 100);
    expect(bands.memberGreen.reduce((s, v) => s + cents(v), 0)).toBe(cents(bands.green));
    const somaFaixas = cents(bands.green) + bands.separated.reduce((s, x) => s + cents(x.amount), 0);
    expect(somaFaixas).toBe(cents(g.groupTotals.toReceive));
  });
});
