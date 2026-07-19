/**
 * Testes unit das 4 implementações dos espelhos (2026-07-19):
 * o builder (driverPayShared.buildDriverMirrorData) propaga destaque/aviso por
 * plataforma respeitando a REGRA DE PRESENÇA do Victor (só onde há pacotes>0),
 * ignora plataforma arquivada, e leva a marca PNR/LOST dos descontos.
 *
 * Roda com: npx vitest run driverPayMirrorFlags
 */

import { describe, it, expect } from 'vitest';
import { buildDriverMirrorData, type DriverRowData } from '../../src/components/driverpay/driverPayShared';
import type { Company } from '../../src/services/database';
import type { DriverPlatform, DriverPaymentPeriod, DriverDiscount } from '../../src/services/driverPay';

const company = { id: 'c1', cnpj: null, city: 'Caratinga' } as unknown as Company;
const period = {
  id: 'per1', company_id: 'c1', label: 'Quinzena Teste', start_date: null, end_date: null,
  status: 'aberto', concluded_at: null, concluded_by: null, created_by: null, created_at: '',
} as DriverPaymentPeriod;

function platform(name: string, opts: Partial<DriverPlatform> = {}): DriverPlatform {
  return {
    id: `p-${name}`, company_id: 'c1', name, default_rate: 2, sort_order: 0, active: true,
    color: null, highlight_mirror: false, mirror_notice: null, created_by: null, created_at: '',
    ...opts,
  } as DriverPlatform;
}

function discount(over: Partial<DriverDiscount>): DriverDiscount {
  return {
    id: 'd1', company_id: 'c1', payment_id: 'pay1', amount: 5, package_code: 'PKG1',
    observation: null, package_status: null, proof1_path: null, proof2_path: null,
    proof_video_path: null, created_by: null, created_at: '',
    ...over,
  } as DriverDiscount;
}

function row(packagesByPlatform: Record<string, number>, discounts: DriverDiscount[] = []): DriverRowData {
  return {
    paymentId: 'pay1', driverId: 'd1', name: 'Fulano', route: 'Caratinga', groupName: null,
    routes: [{ route: 'Caratinga', packages: packagesByPlatform, rates: {}, packageIds: [] }],
    ratesByPlatform: {}, discounts, vales: [], pixKey: null, cpf: null, phone: null,
    active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

describe('buildDriverMirrorData — destaque/aviso/marca (espelhos 2026-07-19)', () => {
  it('plataforma destacada com pacotes → highlight + notice no espelho', () => {
    const plats = [platform('SHOPEE', { highlight_mirror: true, mirror_notice: 'Conferir antes de assinar' })];
    const data = buildDriverMirrorData(row({ SHOPEE: 10 }), plats, company, period);
    const line = data.platforms.find((p) => p.platform === 'SHOPEE');
    expect(line?.highlight).toBe(true);
    expect(line?.notice).toBe('Conferir antes de assinar');
  });

  it('REGRA DE PRESENÇA (caso do Victor): driver só com eMile/ANJUN não vê nada da SHOPEE', () => {
    const plats = [
      platform('SHOPEE', { highlight_mirror: true, mirror_notice: 'Aviso X' }),
      platform('eMile'),
      platform('ANJUN'),
    ];
    const data = buildDriverMirrorData(row({ eMile: 5, ANJUN: 3 }), plats, company, period);
    // SHOPEE nem aparece no espelho (0 pacotes) → sem destaque e sem aviso.
    expect(data.platforms.find((p) => p.platform === 'SHOPEE')).toBeUndefined();
    expect(data.platforms.some((p) => p.highlight)).toBe(false);
    expect(data.platforms.some((p) => p.notice)).toBe(false);
  });

  it('plataforma ARQUIVADA não destaca nem avisa (mesmo com pacotes antigos)', () => {
    const plats = [platform('SHOPEE', { active: false, highlight_mirror: true, mirror_notice: 'X' })];
    const data = buildDriverMirrorData(row({ SHOPEE: 10 }), plats, company, period);
    const line = data.platforms.find((p) => p.platform === 'SHOPEE');
    expect(line?.highlight).toBe(false);
    expect(line?.notice ?? null).toBeNull();
  });

  it('aviso só acompanha plataforma DESTACADA (acoplamento pedido pelo Victor)', () => {
    const plats = [platform('SHOPEE', { highlight_mirror: false, mirror_notice: 'Aviso órfão' })];
    const data = buildDriverMirrorData(row({ SHOPEE: 10 }), plats, company, period);
    const line = data.platforms.find((p) => p.platform === 'SHOPEE');
    expect(line?.highlight).toBe(false);
    expect(line?.notice ?? null).toBeNull();
  });

  it('aviso em branco/espaços não vira faixa', () => {
    const plats = [platform('SHOPEE', { highlight_mirror: true, mirror_notice: '   ' })];
    const data = buildDriverMirrorData(row({ SHOPEE: 10 }), plats, company, period);
    expect(data.platforms[0].highlight).toBe(true);
    expect(data.platforms[0].notice ?? null).toBeNull();
  });

  it('marca PNR/LOST e obs dos descontos chegam ao espelho', () => {
    const ds = [
      discount({ package_code: 'AAA', package_status: 'PNR', observation: 'caixa violada', amount: 6.22 }),
      discount({ id: 'd2', package_code: 'BBB', package_status: 'LOST', amount: 1.57 }),
      discount({ id: 'd3', package_code: 'CCC', package_status: null }),
    ];
    const data = buildDriverMirrorData(row({ SHOPEE: 10 }, ds), [platform('SHOPEE')], company, period);
    expect(data.discounts.map((d) => d.status)).toEqual(['PNR', 'LOST', null]);
    expect(data.discounts[0].description).toBe('caixa violada');
    expect(data.discounts[0].value).toBe(6.22);
  });
});
