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
  separatedAmount,
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
    expect(separatedAmount(data.platforms)).toBe(314);
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
    expect(separatedAmount(data.platforms)).toBe(0);
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
    const sepDoGrupo = group.drivers.reduce((s, d) => s + separatedAmount(d.platforms), 0);
    expect(sepDoGrupo).toBe(260);
  });
});
