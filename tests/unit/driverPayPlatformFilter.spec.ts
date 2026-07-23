/**
 * D3 — espelho filtrado por plataforma: as LINHAS e o TOTAL escopam juntos pras
 * plataformas escolhidas (`allowedPlatformNames`). Sem o parametro, comportamento
 * IDENTICO ao de hoje (soma tudo). Zapex conta como "plataforma" pro filtro.
 * Descontos/vales sao do driver e seguem abatidos (decisao de UI fica na Fase 1).
 *
 * Roda com: npx vitest run driverPayPlatformFilter
 */
import { describe, it, expect } from 'vitest';
import {
  computeRowTotals,
  buildDriverMirrorData,
  buildGroupMirrorData,
  type DriverRowData,
} from '../../src/components/driverpay/driverPayShared';
import type { Company } from '../../src/services/database';
import type { DriverPlatform, DriverPaymentPeriod } from '../../src/services/driverPay';

const company = { id: 'c1', cnpj: null, city: 'Caratinga' } as unknown as Company;
const period = {
  id: 'per1', company_id: 'c1', label: 'Quinzena Teste',
  start_date: null, end_date: null, status: 'aberto',
  concluded_at: null, concluded_by: null, created_by: null, created_at: '',
} as unknown as DriverPaymentPeriod;

function plat(name: string, defaultRate = 2): DriverPlatform {
  return {
    id: `p-${name}`, company_id: 'c1', name, default_rate: defaultRate, sort_order: 0,
    active: true, color: null, highlight_mirror: false, mirror_notice: null,
    mirror_separate_value: false, created_by: null, created_at: '',
  } as unknown as DriverPlatform;
}
const PLATFORMS = [plat('Shopee'), plat('eMile')];

/**
 * Fixture: 2 rotas.
 *  Caratinga: Shopee 100@2,00 (=200) + eMile 50@2,50 (=125)
 *  Mutum:     Shopee 10@3,00  (=30)      <- taxa POR ROTA diferente
 *  Zapex: 5 itens @1,00 (=5). Desconto 20. Vale 10.
 */
function makeRow(): DriverRowData {
  return {
    paymentId: 'pay1', driverId: 'd1', name: 'Fulano de Tal', route: 'Caratinga', groupName: 'Grupo A',
    routes: [
      { route: 'Caratinga', packages: { Shopee: 100, eMile: 50 }, packageIds: {}, rates: { Shopee: 2, eMile: 2.5 } },
      { route: 'Mutum', packages: { Shopee: 10 }, packageIds: {}, rates: { Shopee: 3 } },
    ],
    ratesByPlatform: { Shopee: 2, eMile: 2.5 },
    discounts: [{ amount: 20 }],
    vales: [{ amount: 10 }],
    pixKey: null, cpf: null, phone: null, active: true, notaFiscal: false, espelhoConferido: false,
    zapex: [{}, {}, {}, {}, {}], zapexRate: 1,
  } as unknown as DriverRowData;
}

describe('computeRowTotals — filtro por plataforma (D3)', () => {
  it('SEM filtro soma tudo (comportamento atual intacto)', () => {
    const t = computeRowTotals(makeRow());
    // Shopee 200+30 + eMile 125 = 355; zapex 5; net 355+5-20-10 = 330
    expect(t.packagesAmount).toBe(355);
    expect(t.zapex).toBe(5);
    expect(t.discounts).toBe(20);
    expect(t.vales).toBe(10);
    expect(t.net).toBe(330);
    expect(t.totalPackages).toBe(160);
  });

  it('filtro {Shopee} conta SO Shopee (as duas rotas, taxa real de cada) e exclui Zapex', () => {
    const t = computeRowTotals(makeRow(), new Set(['Shopee']));
    expect(t.packagesAmount).toBe(230); // 100*2 + 10*3, nunca media
    expect(t.zapex).toBe(0);
    expect(t.totalPackages).toBe(110);
    // desconto/vale seguem abatidos: 230 - 20 - 10
    expect(t.net).toBe(200);
  });

  it('filtro {eMile} conta so eMile', () => {
    const t = computeRowTotals(makeRow(), new Set(['eMile']));
    expect(t.packagesAmount).toBe(125);
    expect(t.zapex).toBe(0);
    expect(t.net).toBe(95); // 125 - 20 - 10
  });

  it('filtro {Shopee, Zapex} inclui o Zapex', () => {
    const t = computeRowTotals(makeRow(), new Set(['Shopee', 'Zapex']));
    expect(t.packagesAmount).toBe(230);
    expect(t.zapex).toBe(5);
    expect(t.net).toBe(205); // 230 + 5 - 20 - 10
  });
});

describe('buildDriverMirrorData — filtro por plataforma (D3)', () => {
  it('SEM filtro: todas as linhas + Zapex; total casa com as linhas', () => {
    const m = buildDriverMirrorData(makeRow(), PLATFORMS, company, period);
    const names = m.platforms.map((p) => p.platform);
    expect(names).toContain('Shopee');
    expect(names).toContain('eMile');
    expect(names).toContain('Zapex');
    expect(m.totals.packagesValue).toBe(360); // 355 + 5 (zapex)
    expect(m.totals.toReceive).toBe(330);
  });

  it('filtro {Shopee}: so linhas Shopee (2 rotas), sem eMile/Zapex; total = so Shopee', () => {
    const m = buildDriverMirrorData(makeRow(), PLATFORMS, company, period, new Set(['Shopee']));
    expect(m.platforms.every((p) => p.platform === 'Shopee')).toBe(true);
    expect(m.platforms).toHaveLength(2); // uma linha por rota (Caratinga, Mutum)
    expect(m.platforms.some((p) => p.platform === 'Zapex')).toBe(false);
    expect(m.totals.packagesValue).toBe(230);
    expect(m.totals.toReceive).toBe(200);
    // contagem de pacotes por cidade tambem escopa (Caratinga = so 100 Shopee, nao 150)
    const caratinga = m.driver.routes.find((r) => r.city === 'Caratinga');
    expect(caratinga?.totalPackages).toBe(100);
  });
});

describe('buildGroupMirrorData — filtro propaga pros membros', () => {
  it('filtro {Shopee} escopa o total do grupo', () => {
    const rows = [makeRow(), { ...makeRow(), paymentId: 'pay2', name: 'Beltrano' }] as DriverRowData[];
    const g = buildGroupMirrorData('Grupo A', rows, PLATFORMS, company, period, new Set(['Shopee']));
    // cada driver toReceive = 200 -> grupo 400
    expect(g.groupTotals.toReceive).toBe(400);
    expect(g.drivers.every((d) => d.platforms.every((p) => p.platform === 'Shopee'))).toBe(true);
  });
});
