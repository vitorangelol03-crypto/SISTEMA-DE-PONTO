/**
 * Saldo herdado de quinzena fechada (15/08/2026, sub-fase B).
 *
 * Pedido do Victor: "criar a opção de o que não tiver sido descontado nessa quinzena
 * jogar para próxima". O valor migrado (`row.carryover`) tem que contar como dívida de
 * verdade — mesma régua de vale/perda — sem virar uma linha em `discounts`/`vales` (isso
 * quebraria a busca por código de pacote e misturaria "sobra" com desconto real).
 *
 * Roda com: npx vitest run driverPayCarryover
 */
import { describe, it, expect } from 'vitest';
import {
  deductionsOf, computeRowTotals, buildRows,
  type DriverRowData,
} from '../../src/components/driverpay/driverPayShared';
import type { DriverPayment, Driver, DriverPlatform } from '../../src/services/driverPay';

function row(over: Partial<DriverRowData> = {}): DriverRowData {
  return {
    paymentId: 'pay-1', driverId: 'd1', name: 'CAIO', route: null, groupName: null,
    routes: [{ route: 'R1', packages: { SHOPEE: 10 }, packageIds: {}, rates: { SHOPEE: 2 } }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, recebedorNome: null,
    recebedorPix: null, cpf: null, phone: null, active: true, notaFiscal: false,
    espelhoConferido: false, zapex: [], zapexRate: 0, carryover: 0,
    ...over,
  } as DriverRowData;
}

describe('deductionsOf — carryover conta como dívida', () => {
  it('🎯 soma discounts + vales + carryover', () => {
    const r = row({
      discounts: [{ amount: 10 }] as DriverRowData['discounts'],
      vales: [{ amount: 5 }] as DriverRowData['vales'],
      carryover: 30,
    });
    expect(deductionsOf(r)).toBe(45);
  });

  it('sem carryover: comportamento de sempre (0 por padrão)', () => {
    expect(deductionsOf(row())).toBe(0);
  });
});

describe('computeRowTotals — carryover entra no net mas NÃO nas colunas discounts/vales', () => {
  it('🎯 net desconta o carryover', () => {
    // 10 pacotes SHOPEE @ 2.00 = 20; carryover 15 → net = 5
    const t = computeRowTotals(row({ carryover: 15 }));
    expect(t.packagesAmount).toBe(20);
    expect(t.carryover).toBe(15);
    expect(t.discounts).toBe(0); // não vira desconto
    expect(t.vales).toBe(0); // não vira vale
    expect(t.net).toBe(5);
  });

  it('includeDeductions=false: net BRUTO, carryover não abate (pagamento parcial)', () => {
    const t = computeRowTotals(row({ carryover: 15 }), undefined, false);
    expect(t.net).toBe(20);
  });

  it('deductionOverride manda por cima do carryover, igual já fazia com vale/perda', () => {
    const t = computeRowTotals(row({ carryover: 15 }), undefined, true, 3);
    expect(t.deducted).toBe(3);
    expect(t.net).toBe(17);
  });
});

describe('buildRows — carryoverByDriver alimenta row.carryover', () => {
  const driver: Driver = { id: 'd1' } as Driver;
  const platform: DriverPlatform = { id: 'p1', name: 'SHOPEE', default_rate: 2 } as DriverPlatform;
  const payment: DriverPayment = {
    id: 'pay-1', company_id: 'c1', period_id: 'per-1', driver_id: 'd1',
    driver_name_snapshot: 'CAIO', route_snapshot: 'R1',
    total_packages_amount: 0, total_discounts: 0, total_vales: 0, total_net: 0,
    zapex_rate: 0, total_zapex: 0, nota_fiscal_recebida: false, espelho_conferido: false,
    created_at: '', updated_at: '', packages: [], discounts: [], vales: [], zapex: [],
  } as DriverPayment;

  it('🎯 driver com saldo herdado chega com row.carryover preenchido', () => {
    const rows = buildRows([payment], [driver], [platform], {}, {}, false, new Map([['d1', 42.5]]));
    expect(rows[0].carryover).toBe(42.5);
  });

  it('driver sem saldo herdado: carryover 0 (mapa vazio, padrão)', () => {
    const rows = buildRows([payment], [driver], [platform], {}, {});
    expect(rows[0].carryover).toBe(0);
  });
});
