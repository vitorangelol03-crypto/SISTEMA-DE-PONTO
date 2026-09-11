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
    expect(m.get('d1')?.get('')).toEqual([
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

  // ── Casamento pelo CNPJ (07/09/2026) ──
  // O nome sozinho não identifica a linha do cadastro: a mesma pessoa pode ter mais
  // de um CNPJ. Quando a nota traz o CNPJ que casou, é ele que manda.
  it('🎯 mesma pessoa com 2 CNPJs: a chave PIX vem do CNPJ da NOTA, não do nome', () => {
    const doisCnpjsMesmoNome = [
      { driver_id: 'd1', name: 'Joaerson Antônio de Freitas', cnpj: '55857717000146', pix: 'pix-do-primeiro' },
      { driver_id: 'd1', name: 'Joaerson Antônio de Freitas', cnpj: '51046418000170', pix: 'pix-do-segundo' },
    ];
    const m = splitRecipientsFromNotes([
      { ...nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'), matchedCnpj: '55857717000146' },
      { ...nota('d1', 'g1', 2, 'Joaerson Antônio de Freitas'), matchedCnpj: '51046418000170' },
    ], doisCnpjsMesmoNome);
    expect(m.get('d1')?.get('')).toEqual([
      { name: 'Joaerson Antônio de Freitas', pix: 'pix-do-primeiro' },
      { name: 'Joaerson Antônio de Freitas', pix: 'pix-do-segundo' },
    ]);
  });

  it('🎯 nota antiga (sem CNPJ gravado) continua achando o PIX pelo nome', () => {
    const m = splitRecipientsFromNotes([
      { ...nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'), matchedCnpj: null },
      { ...nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'), matchedCnpj: null },
    ], CADASTRO);
    expect(m.get('d1')?.get('')?.[0].pix).toBe('pix-joaerson');
    expect(m.get('d1')?.get('')?.[1].pix).toBe('51.046.418/0001-70');
  });

  it('CNPJ da nota fora do cadastro: cai no nome (não fica sem chave)', () => {
    const m = splitRecipientsFromNotes([
      { ...nota('d1', 'g1', 1, 'Joaerson Antônio de Freitas'), matchedCnpj: '99999999000199' },
      { ...nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'), matchedCnpj: null },
    ], CADASTRO);
    expect(m.get('d1')?.get('')?.[0].pix).toBe('pix-joaerson');
  });

  it('nome com acento/caixa diferente ainda acha o PIX no cadastro', () => {
    const m = splitRecipientsFromNotes([
      nota('d1', 'g1', 1, 'JOAERSON ANTONIO DE FREITAS'),
      nota('d1', 'g1', 2, 'GESSILEY RODRIGUES DE FREITAS'),
    ], CADASTRO);
    expect(m.get('d1')?.get('')?.[0].pix).toBe('pix-joaerson');
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DIVISÃO É POR CNPJ — E SAEM 4 PAGAMENTOS  (10/09/2026, decisão do Victor)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Se dividir os dois CNPJ vai sair quatro pagamentos no relatório simples."
 * Números REAIS do GESSILEY: Shopee/Anjun/Loggi R$ 14.476,00 + iMile R$ 1.504,60.
 */
describe('pagamento dividido POR CNPJ tomador', () => {
  const EM_SHOPEE = 'em-shopee';
  const EM_IMILE = 'em-imile';
  const EMITTER_OF = new Map([['SHOPEE', EM_SHOPEE], ['eMile', EM_IMILE]]);
  /** Uma unidade com os dois CNPJs, nos valores reais do caso. */
  const DOIS_CNPJS = [
    row('p1', 'd1', 'Lider Um', 'G', [
      rl('Caratinga', { SHOPEE: 1, eMile: 1 }, { SHOPEE: 14476, eMile: 1504.6 }),
    ]),
  ];
  const notaEm = (
    emitterId: string, splitGroup: string, splitPart: number, matchedName: string,
  ) => ({ driverId: 'd1', splitGroup, splitPart, matchedName, status: 'validada', emitterId });

  const duplaShopee = [
    notaEm(EM_SHOPEE, 'gs', 1, 'Joaerson Antônio de Freitas'),
    notaEm(EM_SHOPEE, 'gs', 2, 'GESSILEY RODRIGUES DE FREITAS'),
  ];
  const duplaImile = [
    notaEm(EM_IMILE, 'gi', 1, 'Joaerson Antônio de Freitas'),
    notaEm(EM_IMILE, 'gi', 2, 'GESSILEY RODRIGUES DE FREITAS'),
  ];

  it('as duplas ficam separadas por CNPJ (uma da Shopee, outra da iMile)', () => {
    const m = splitRecipientsFromNotes([...duplaShopee, ...duplaImile], CADASTRO);
    expect(m.get('d1')?.size).toBe(2);
    expect(m.get('d1')?.get(EM_SHOPEE)?.[0].name).toBe('Joaerson Antônio de Freitas');
    expect(m.get('d1')?.get(EM_IMILE)?.[1].name).toBe('GESSILEY RODRIGUES DE FREITAS');
  });

  it('🎯 dividiu os DOIS CNPJs: 4 pagamentos, e a soma continua fechando', () => {
    const split = splitRecipientsFromNotes([...duplaShopee, ...duplaImile], CADASTRO);
    const out = buildSimpleReportRows(DOIS_CNPJS, LEADER_MAP, {
      splitRecipientsByLeader: split, platformEmitterOf: EMITTER_OF,
    });
    expect(out).toHaveLength(4);
    expect(out.map((r) => r.total).sort((a, b) => b - a)).toEqual([7238, 7238, 752.3, 752.3]);
    expect(Math.round(out.reduce((s, r) => s + r.total, 0) * 100) / 100).toBe(15980.6);
    // 🔴 o valor da mistura de 06/09 não pode aparecer em pagamento nenhum
    expect(out.map((r) => r.total)).not.toContain(7990.3);
  });

  it('dividiu SÓ a Shopee: 3 linhas — a iMile inteira continua com o líder', () => {
    const split = splitRecipientsFromNotes(duplaShopee, CADASTRO);
    const out = buildSimpleReportRows(DOIS_CNPJS, LEADER_MAP, {
      splitRecipientsByLeader: split, platformEmitterOf: EMITTER_OF,
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ name: 'Lider Um', total: 1504.6, pix: 'pix-do-lider' });
    expect(out[1].total).toBe(7238);
    expect(out[2].total).toBe(7238);
  });

  it('vale/perda sai do CNPJ de MAIOR valor (decisão do Victor)', () => {
    const comVale = [
      {
        ...DOIS_CNPJS[0],
        vales: [{ id: 'v1', amount: 100, description: null }],
      } as unknown as DriverRowData,
    ];
    const split = splitRecipientsFromNotes([...duplaShopee, ...duplaImile], CADASTRO);
    const out = buildSimpleReportRows(comVale, LEADER_MAP, {
      splitRecipientsByLeader: split, platformEmitterOf: EMITTER_OF,
    });
    // Shopee 14.476 − 100 = 14.376 → 7.188 + 7.188; iMile intacta → 752,30 + 752,30
    expect(out.map((r) => r.total).sort((a, b) => b - a)).toEqual([7188, 7188, 752.3, 752.3]);
    expect(Math.round(out.reduce((s, r) => s + r.total, 0) * 100) / 100).toBe(15880.6);
  });

  it('sem o mapa de plataformas, nada quebra: cai numa linha só', () => {
    const split = splitRecipientsFromNotes([...duplaShopee, ...duplaImile], CADASTRO);
    const out = buildSimpleReportRows(DOIS_CNPJS, LEADER_MAP, { splitRecipientsByLeader: split });
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(15980.6);
  });

  it('relatório GERAL: as 3 notas extras viram linhas próprias numeradas', () => {
    const split = splitRecipientsFromNotes([...duplaShopee, ...duplaImile], CADASTRO);
    const out = buildLeaderReportRows(DOIS_CNPJS, [plat('SHOPEE'), plat('eMile')], LEADER_MAP, {
      splitRecipientsByLeader: split, platformEmitterOf: EMITTER_OF,
    });
    const comValor = out.filter((r) => r.totalToReceive > 0);
    expect(comValor).toHaveLength(4);
    expect(comValor.slice(1).map((r) => r.route)).toEqual(['(2ª nota)', '(3ª nota)', '(4ª nota)']);
    expect(Math.round(comValor.reduce((s, r) => s + r.totalToReceive, 0) * 100) / 100).toBe(15980.6);
    // as linhas extras não inventam pacote
    for (const r of comValor.slice(1)) expect(r.totalPackages).toBe(0);
  });
});

/**
 * Achados da revisão adversarial de 10/09/2026 — os casos que quase foram pro ar.
 */
describe('bordas achadas na revisão de 10/09', () => {
  const EM_SHOPEE = 'em-shopee';
  const EM_IMILE = 'em-imile';
  const EMITTER_OF = new Map([['SHOPEE', EM_SHOPEE], ['eMile', EM_IMILE]]);
  const notaEm = (emitterId: string, g: string, part: number, nome: string) =>
    ({ driverId: 'd1', splitGroup: g, splitPart: part, matchedName: nome, status: 'validada', emitterId });

  it('🔴 bloco zerado pelo vale NÃO vira duas linhas de R$ 0,00 no arquivo do banco', () => {
    // Shopee 1.000 (dividida) + iMile 200 (inteira), vale de 1.000 → a Shopee zera.
    const linha = {
      ...row('p1', 'd1', 'Lider Um', 'G', [
        rl('Caratinga', { SHOPEE: 1, eMile: 1 }, { SHOPEE: 1000, eMile: 200 }),
      ]),
      vales: [{ id: 'v1', amount: 1000, description: null }],
    } as unknown as DriverRowData;
    const split = splitRecipientsFromNotes([
      notaEm(EM_SHOPEE, 'gs', 1, 'Joaerson Antônio de Freitas'),
      notaEm(EM_SHOPEE, 'gs', 2, 'GESSILEY RODRIGUES DE FREITAS'),
    ], CADASTRO);
    const out = buildSimpleReportRows([linha], LEADER_MAP, {
      splitRecipientsByLeader: split, platformEmitterOf: EMITTER_OF,
    });
    // banco recusa linha zerada: sobra só o que tem valor de verdade
    expect(out.every((r) => r.total > 0), 'nenhuma linha de R$ 0,00').toBe(true);
    expect(Math.round(out.reduce((s, r) => s + r.total, 0) * 100) / 100).toBe(200);
  });

  it('dupla do desenho ANTIGO (uma parte em cada CNPJ) não divide pagamento', () => {
    // Era o desenho de 04–09/09. As partes caem em tomadores diferentes, então nenhum
    // par fecha — e o pagamento sai numa linha só, no PIX do líder, sem inventar metade.
    const split = splitRecipientsFromNotes([
      notaEm(EM_SHOPEE, 'gx', 1, 'Joaerson Antônio de Freitas'),
      notaEm(EM_IMILE, 'gx', 2, 'GESSILEY RODRIGUES DE FREITAS'),
    ], CADASTRO);
    expect(split.get('d1')?.get(EM_SHOPEE)).toBeUndefined();
    const out = buildSimpleReportRows(GRUPO, LEADER_MAP, {
      splitRecipientsByLeader: split, platformEmitterOf: EMITTER_OF,
    });
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(960);
  });
});
