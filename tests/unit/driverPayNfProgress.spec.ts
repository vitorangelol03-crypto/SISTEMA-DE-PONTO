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

/**
 * 🔴 05/08/2026 — "ele não está detectando notas já validadas, igual a do Othon".
 *
 * Caso REAL (grupo Alvarenga): o líder OTHON tem **0 pacote**, recebeu o espelho do grupo
 * (`platform_key = ''`) e mandou a nota — validada, valor/CNPJ/nome verdes. A grade
 * mostrava **NF 0/1**.
 *
 * A causa: as vagas eram montadas com a publicação DE CADA LINHA. Só o líder tem
 * publicação, então cada MEMBRO caía no ramo "sem espelho" e gerava a vaga CORINGA
 * `*|CNPJ`, enquanto a nota do líder chegava com a chave do espelho dele (`|CNPJ`). Nada
 * cobria a coringa.
 *
 * Nos grupos em que o líder também entrega, o mesmo defeito inflava o número na tela:
 * "NF 1/2 — falta 1", "NF 2/4 — falta 2" — uma vaga do líder + uma coringa por membro,
 * todas para a MESMA nota.
 */
describe('GRUPO com espelho publicado: a publicação do líder vale pra unidade (05/08/2026)', () => {
  const notas = (chave: string) =>
    new Map([['lider', { validated: new Set([chave]), received: new Set([chave]) }]]);

  it('🎯 caso do Othon: líder sem pacote, membros com pacote, nota do líder = 1/1 validada', () => {
    const rows = [
      row('p-lider', 'lider', 'Alvarenga', {}),
      row('p-m1', 'm1', 'Alvarenga', { SHOPEE: 1752 }),
      row('p-m2', 'm2', 'Alvarenga', { SHOPEE: 430 }),
    ];
    const pubs = new Map([['lider', [{ platformKey: '', platformFilter: null }]]]);
    const p = computeNfProgressByPayment(rows, PLATFORMS, notas(`|${B}`), pubs).get('p-lider')!;
    expect(p.expected).toBe(1);
    expect(p.validated).toBe(1);
    expect(p.complete).toBe(true);
  });

  it('🔴 líder QUE TAMBÉM ENTREGA não infla o número (era o "NF 1/2 — falta 1")', () => {
    const rows = [
      row('p-lider', 'lider', 'BomJesus', { SHOPEE: 500 }),
      row('p-m1', 'm1', 'BomJesus', { SHOPEE: 300 }),
    ];
    const pubs = new Map([['lider', [{ platformKey: '', platformFilter: null }]]]);
    const p = computeNfProgressByPayment(rows, PLATFORMS, notas(`|${B}`), pubs).get('p-m1')!;
    expect(p.expected, '1 CNPJ = 1 nota, não uma por membro').toBe(1);
    expect(p.complete).toBe(true);
  });

  it('dois CNPJs continuam pedindo duas notas', () => {
    const rows = [
      row('p-lider', 'lider', 'G', { SHOPEE: 100 }),
      row('p-m1', 'm1', 'G', { eMile: 50 }),
    ];
    const pubs = new Map([['lider', [{ platformKey: '', platformFilter: null }]]]);
    const p = computeNfProgressByPayment(rows, PLATFORMS, notas(`|${B}`), pubs).get('p-lider')!;
    expect(p.expected).toBe(2);
    expect(p.validated).toBe(1);
    expect(p.complete).toBe(false);
  });

  it('espelho POR PLATAFORMA segue pedindo a nota daquele espelho', () => {
    // Pagou só LOGGI: a vaga é do espelho LOGGI, e a nota da quinzena inteira não cobre.
    const rows = [
      row('p-lider', 'lider', 'G', { LOGGI: 20 }),
      row('p-m1', 'm1', 'G', { LOGGI: 80 }),
    ];
    const pubs = new Map([['lider', [{ platformKey: 'LOGGI', platformFilter: ['LOGGI'] }]]]);
    const p = computeNfProgressByPayment(rows, PLATFORMS, notas(`LOGGI|${B}`), pubs).get('p-m1')!;
    expect(p.expected).toBe(1);
    expect(p.complete).toBe(true);
  });

  it('grupo SEM espelho publicado continua como antes (vaga coringa por CNPJ)', () => {
    const rows = [
      row('p-lider', 'lider', 'G', { SHOPEE: 100 }),
      row('p-m1', 'm1', 'G', { SHOPEE: 200 }),
    ];
    const p = computeNfProgressByPayment(rows, PLATFORMS, notas(`*|${B}`), new Map()).get('p-m1')!;
    expect(p.expected).toBe(1);
    expect(p.complete).toBe(true);
  });
});
