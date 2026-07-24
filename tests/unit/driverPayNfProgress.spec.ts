/**
 * NF do painel: progresso "validadas/esperadas" ciente de GRUPO.
 * Regras (Victor): esperadas = nº de CNPJs distintos com pacote (iMile é um CNPJ,
 * Shopee/Anjun/Loggi outro → 1 ou 2). Num grupo só o líder anexa: as notas do grupo
 * validam o grupo TODO (ex.: grupo de 6 com 2 CNPJs → 2 validadas = todos verdes).
 *
 * Roda com: npx vitest run driverPayNfProgress
 */
import { describe, it, expect } from 'vitest';
import {
  expectedEmitterIds,
  computeNfProgressByPayment,
  type DriverRowData,
  type EmitterPlatform,
} from '../../src/components/driverpay/driverPayShared';

const A = 'cnpj-imile'; // iMile / eMile
const B = 'cnpj-slo'; // Shopee / Anjun / Loggi
const PLATFORMS: EmitterPlatform[] = [
  { name: 'eMile', nota_emitter_id: A },
  { name: 'SHOPEE', nota_emitter_id: B },
  { name: 'ANJUN', nota_emitter_id: B },
  { name: 'LOGGI', nota_emitter_id: B },
];

function row(
  paymentId: string,
  driverId: string,
  groupName: string | null,
  packages: Record<string, number>,
  notaFiscal = false,
): DriverRowData {
  return {
    paymentId, driverId, name: driverId, route: null, groupName,
    routes: [{ route: null, packages, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, cpf: null, phone: null,
    active: true, notaFiscal, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}
const emptyNotes = new Map<string, { validated: Set<string>; received: Set<string> }>();

describe('expectedEmitterIds — quantas notas o driver/grupo precisa', () => {
  it('só Shopee = 1 CNPJ', () => {
    expect(expectedEmitterIds(row('p', 'd', null, { SHOPEE: 100 }), PLATFORMS)).toEqual([B]);
  });
  it('Shopee + Anjun + Loggi ainda = 1 CNPJ (mesmo emitente)', () => {
    const ids = expectedEmitterIds(row('p', 'd', null, { SHOPEE: 100, ANJUN: 10, LOGGI: 5 }), PLATFORMS);
    expect(ids).toEqual([B]);
  });
  it('eMile + Shopee = 2 CNPJs', () => {
    const ids = expectedEmitterIds(row('p', 'd', null, { eMile: 30, SHOPEE: 100 }), PLATFORMS).sort();
    expect(ids).toEqual([A, B].sort());
  });
  it('plataforma com 0 pacote não conta', () => {
    expect(expectedEmitterIds(row('p', 'd', null, { eMile: 0, SHOPEE: 100 }), PLATFORMS)).toEqual([B]);
  });
});

describe('computeNfProgressByPayment — avulso', () => {
  it('sem nota: expected 1, validated 0, incompleto', () => {
    const m = computeNfProgressByPayment([row('p1', 'd1', null, { SHOPEE: 100 })], PLATFORMS, emptyNotes);
    expect(m.get('p1')).toMatchObject({ expected: 1, validated: 0, complete: false });
  });
  it('nota validada no CNPJ esperado: completo', () => {
    const notes = new Map([['d1', { validated: new Set([B]), received: new Set([B]) }]]);
    const m = computeNfProgressByPayment([row('p1', 'd1', null, { SHOPEE: 100 })], PLATFORMS, notes);
    expect(m.get('p1')).toMatchObject({ expected: 1, validated: 1, complete: true });
  });
  it('nota recebida mas NÃO validada: pendente, não completo', () => {
    const notes = new Map([['d1', { validated: new Set<string>(), received: new Set([B]) }]]);
    const m = computeNfProgressByPayment([row('p1', 'd1', null, { SHOPEE: 100 })], PLATFORMS, notes);
    expect(m.get('p1')).toMatchObject({ expected: 1, validated: 0, pending: 1, complete: false });
  });
  it('marcado na mão (notaFiscal) sem nota: completo', () => {
    const m = computeNfProgressByPayment([row('p1', 'd1', null, { SHOPEE: 100 }, true)], PLATFORMS, emptyNotes);
    expect(m.get('p1')).toMatchObject({ complete: true, manual: true });
  });
});

describe('computeNfProgressByPayment — GRUPO (só o líder anexa; valida o grupo todo)', () => {
  // Grupo "G" de 6: líder d1 (eMile+Shopee), demais só Shopee. Esperadas do grupo = {A,B} = 2.
  const groupRows = [
    row('p1', 'd1', 'G', { eMile: 30, SHOPEE: 100 }), // líder
    row('p2', 'd2', 'G', { SHOPEE: 200 }),
    row('p3', 'd3', 'G', { SHOPEE: 150 }),
    row('p4', 'd4', 'G', { SHOPEE: 80 }),
    row('p5', 'd5', 'G', { SHOPEE: 90 }),
    row('p6', 'd6', 'G', { SHOPEE: 70 }),
  ];

  it('2 notas do líder validadas => TODOS os 6 completos (2/2)', () => {
    const notes = new Map([['d1', { validated: new Set([A, B]), received: new Set([A, B]) }]]);
    const m = computeNfProgressByPayment(groupRows, PLATFORMS, notes);
    for (const p of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      expect(m.get(p)).toMatchObject({ expected: 2, validated: 2, complete: true });
    }
  });

  it('só 1 das 2 validadas => grupo incompleto (1/2) pra todos', () => {
    const notes = new Map([['d1', { validated: new Set([B]), received: new Set([A, B]) }]]);
    const m = computeNfProgressByPayment(groupRows, PLATFORMS, notes);
    for (const p of ['p1', 'p6']) {
      expect(m.get(p)).toMatchObject({ expected: 2, validated: 1, complete: false });
    }
  });

  it('avulso e grupo convivem no mesmo período', () => {
    const rows = [...groupRows, row('pX', 'dX', null, { SHOPEE: 10 })];
    const notes = new Map([
      ['d1', { validated: new Set([A, B]), received: new Set([A, B]) }],
      ['dX', { validated: new Set<string>(), received: new Set([B]) }],
    ]);
    const m = computeNfProgressByPayment(rows, PLATFORMS, notes);
    expect(m.get('p1')).toMatchObject({ complete: true });
    expect(m.get('pX')).toMatchObject({ expected: 1, validated: 0, complete: false });
  });
});
