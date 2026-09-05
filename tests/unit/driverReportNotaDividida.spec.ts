/**
 * PAGAMENTO DIVIDIDO — os relatórios seguem as notas (05/09/2026, pedido do Victor:
 * "os relatórios geral e simples devem saber a metade para um CNPJ e outro para outro,
 * de acordo com como foi feito as notas").
 *
 * Regras provadas aqui:
 *  - dupla COMPLETA (as 2 notas, nenhuma recusada) → 2 linhas de pagamento, metade
 *    pra cada recebedor, cada uma na chave PIX dele;
 *  - dupla pela METADE / nota recusada / nenhuma nota → 1 linha só, como sempre foi;
 *  - PIX vazio no cadastro cai no CNPJ do recebedor;
 *  - a soma das duas metades fecha EXATAMENTE o total da unidade (centavo ímpar na 1ª).
 *
 * Roda com: npx vitest run driverReportNotaDividida
 */
import { describe, it, expect } from 'vitest';
import {
  buildLeaderReportRows,
  buildSimpleReportRows,
  splitRecipientsFromNotes,
  type DriverRowData,
} from '../../src/components/driverpay/driverPayShared';
import type { DriverPlatform } from '../../src/services/driverPay';

function plat(name: string, rate = 2): DriverPlatform {
  return {
    id: `p-${name}`, company_id: 'c', name, default_rate: rate, sort_order: 0, active: true,
    color: null, highlight_mirror: false, mirror_notice: null, mirror_separate_value: false, nota_emitter_id: null,
  } as unknown as DriverPlatform;
}
const PLAT = [plat('SHOPEE'), plat('eMile')];
const rl = (route: string, packages: Record<string, number>, rates: Record<string, number> = {}) =>
  ({ route, packages, packageIds: {}, rates });
function row(
  paymentId: string, driverId: string, name: string, groupName: string | null,
  routes: ReturnType<typeof rl>[],
): DriverRowData {
  return {
    paymentId, driverId, name, route: null, groupName, routes,
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: 'pix-do-lider', recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null,
    active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

const nota = (
  driverId: string, splitGroup: string | null, splitPart: number | null,
  matchedName: string | null, status = 'validada',
) => ({ driverId, splitGroup, splitPart, matchedName, status });

const CADASTRO = [
  { driver_id: 'd1', name: 'Joaerson Antônio de Freitas', cnpj: '55.857.717/0001-46', pix: 'pix-joaerson' },
  { driver_id: 'd1', name: 'GESSILEY RODRIGUES DE FREITAS', cnpj: '51.046.418/0001-70', pix: null },
];

// Grupo G: líder d1 (SHOPEE 300@2 = 600) + membro d2 (SHOPEE 180@2 = 360) → total 960,00
const GRUPO = [
  row('p1', 'd1', 'Lider Um', 'G', [rl('Caratinga', { SHOPEE: 300 }, { SHOPEE: 2 })]),
  row('p2', 'd2', 'Membro Dois', 'G', [rl('Caratinga', { SHOPEE: 180 }, { SHOPEE: 2 })]),
];
const LEADER_MAP = new Map([['G', 'Lider Um']]);

describe('splitRecipientsFromNotes — quem recebe cada metade sai das notas', () => {
  it('dupla completa: os 2 recebedores, com a chave PIX de cada um', () => {
    const m = splitRecipientsFromNotes([
      nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'),
      nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'),
    ], CADASTRO);
    expect(m.get('d1')).toEqual([
      { name: 'Joaerson Antônio de Freitas', pix: 'pix-joaerson' },
      // sem PIX cadastrado → cai no CNPJ dele
      { name: 'GESSILEY RODRIGUES DE FREITAS', pix: '51.046.418/0001-70' },
    ]);
  });

  it('só a 1ª nota chegou: NÃO divide (ninguém recebe metade à toa)', () => {
    const m = splitRecipientsFromNotes([nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas')], CADASTRO);
    expect(m.size).toBe(0);
  });

  it('uma das duas foi RECUSADA: não divide', () => {
    const m = splitRecipientsFromNotes([
      nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'),
      nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS', 'rejeitada'),
    ], CADASTRO);
    expect(m.size).toBe(0);
  });

  it('nota única (sem divisão) não entra', () => {
    const m = splitRecipientsFromNotes([nota('d1', null, null, 'Joaerson Antônio de Freitas')], CADASTRO);
    expect(m.size).toBe(0);
  });

  it('nome com acento/caixa diferente ainda acha o PIX no cadastro', () => {
    const m = splitRecipientsFromNotes([
      nota('d1', 'g1', 1, 'JOAERSON ANTONIO DE FREITAS'),
      nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'),
    ], CADASTRO);
    expect(m.get('d1')?.[0].pix).toBe('pix-joaerson');
  });
});

describe('relatório SIMPLES com nota dividida', () => {
  it('vira 2 linhas de R$ 480,00, uma por recebedor, com o PIX de cada um', () => {
    const split = splitRecipientsFromNotes([
      nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'),
      nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'),
    ], CADASTRO);
    const out = buildSimpleReportRows(GRUPO, LEADER_MAP, { splitRecipientsByLeader: split });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'Joaerson Antonio de Freitas', total: 480, pix: 'pix-joaerson' });
    expect(out[1]).toEqual({ name: 'GESSILEY RODRIGUES DE FREITAS', total: 480, pix: '51.046.418/0001-70' });
    expect(out[0].total + out[1].total).toBe(960);
  });

  it('sem dupla completa, continua 1 linha só (nada muda pra quem não divide)', () => {
    const out = buildSimpleReportRows(GRUPO, LEADER_MAP, {});
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(960);
  });

  it('centavo ímpar: a 1ª leva o centavo e a soma fecha', () => {
    const grupoImpar = [row('p1', 'd1', 'Lider Um', 'G', [rl('Caratinga', { SHOPEE: 3 }, { SHOPEE: 3.33 })])];
    const split = splitRecipientsFromNotes([
      nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'),
      nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'),
    ], CADASTRO);
    const out = buildSimpleReportRows(grupoImpar, LEADER_MAP, { splitRecipientsByLeader: split });
    expect(out[0].total).toBe(5.0);   // 9,99 / 2 = 5,00 + 4,99
    expect(out[1].total).toBe(4.99);
    expect(Math.round((out[0].total + out[1].total) * 100) / 100).toBe(9.99);
  });
});

describe('relatório GERAL com nota dividida', () => {
  const split = splitRecipientsFromNotes([
    nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'),
    nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'),
  ], CADASTRO);

  it('a 1ª metade vai na linha do bloco e a 2ª numa linha própria — a soma fecha', () => {
    const out = buildLeaderReportRows(GRUPO, PLAT, LEADER_MAP, { splitRecipientsByLeader: split });
    const comValor = out.filter((r) => r.totalToReceive > 0);
    expect(comValor).toHaveLength(2);
    expect(comValor[0].name).toBe('Joaerson Antônio de Freitas');
    expect(comValor[0].totalToReceive).toBe(480);
    expect(comValor[0].pixKey).toBe('pix-joaerson');
    expect(comValor[1].name).toBe('GESSILEY RODRIGUES DE FREITAS');
    expect(comValor[1].totalToReceive).toBe(480);
    expect(comValor[1].pixKey).toBe('51.046.418/0001-70');
    expect(comValor[0].totalToReceive + comValor[1].totalToReceive).toBe(960);
    // a linha extra não inventa pacote nenhum
    expect(comValor[1].totalPackages).toBe(0);
  });

  it('sem dupla, o bloco continua com uma linha de pagamento só', () => {
    const out = buildLeaderReportRows(GRUPO, PLAT, LEADER_MAP, {});
    const comValor = out.filter((r) => r.totalToReceive > 0);
    expect(comValor).toHaveLength(1);
    expect(comValor[0].totalToReceive).toBe(960);
  });
});
