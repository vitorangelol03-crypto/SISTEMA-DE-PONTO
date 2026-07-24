/**
 * Relatório com o LÍDER como recebedor (regra da NF) + relatório simples.
 * Regras (Victor): grupo vira o líder recebendo o total do grupo, dividido POR ROTA e
 * plataforma; membros não viram linha; avulso = ele mesmo. Valor = TOTAL A RECEBER (net,
 * já com desconto/vale abatidos). Nome do líder SEM acento no simples.
 *
 * Roda com: npx vitest run driverReportLeader
 */
import { describe, it, expect } from 'vitest';
import {
  buildLeaderReportRows,
  buildSimpleReportRows,
  stripAccents,
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
  routes: ReturnType<typeof rl>[], discounts: { amount: number }[] = [], vales: { amount: number }[] = [],
  extra: Partial<Pick<DriverRowData, 'pixKey' | 'recebedorNome' | 'recebedorPix'>> = {},
): DriverRowData {
  return {
    paymentId, driverId, name, route: null, groupName, routes,
    ratesByPlatform: {}, discounts, vales, pixKey: null, recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null,
    active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
    ...extra,
  } as unknown as DriverRowData;
}

describe('stripAccents', () => {
  it('remove acentos mantendo o resto', () => {
    expect(stripAccents('Adão José Gonçalves')).toBe('Adao Jose Goncalves');
    expect(stripAccents('MÁRCIO DA SILVA')).toBe('MARCIO DA SILVA');
  });
});

describe('buildLeaderReportRows — líder recebe pelo grupo, dividido por rota', () => {
  const leaderMap = new Map([['G', 'Lider Um']]);
  // Grupo G: líder d1 (Caratinga SHOPEE 100@2) + membro d2 (Caratinga SHOPEE 50@2 + Mutum eMile 10@2).
  const groupRows = [
    row('p1', 'd1', 'Lider Um', 'G', [rl('Caratinga', { SHOPEE: 100 }, { SHOPEE: 2 })]),
    row('p2', 'd2', 'Membro Dois', 'G', [
      rl('Caratinga', { SHOPEE: 50 }, { SHOPEE: 2 }),
      rl('Mutum', { eMile: 10 }, { eMile: 2 }),
    ]),
  ];

  it('só o líder aparece como recebedor (membros não viram linha com nome)', () => {
    const out = buildLeaderReportRows(groupRows, PLAT, leaderMap);
    const named = out.filter((r) => r.name.trim() !== '');
    expect(named.length).toBe(1);
    expect(named[0].name).toBe('Lider Um');
    expect(out.some((r) => r.name === 'Membro Dois')).toBe(false);
  });

  it('divide por rota, agregando os membros (Caratinga SHOPEE 150; Mutum eMile 10)', () => {
    const out = buildLeaderReportRows(groupRows, PLAT, leaderMap);
    const carat = out.find((r) => r.route === 'Caratinga')!;
    const mutum = out.find((r) => r.route === 'Mutum')!;
    expect(carat.platforms.SHOPEE.packages).toBe(150);
    expect(carat.platforms.SHOPEE.value).toBe(300);
    expect(mutum.platforms.eMile.packages).toBe(10);
  });

  it('TOTAL A RECEBER (net) do grupo sai na 1ª linha e soma os membros', () => {
    const out = buildLeaderReportRows(groupRows, PLAT, leaderMap);
    // net = 100*2 + (50*2 + 10*2) = 200 + 120 = 320
    expect(out[0].totalToReceive).toBe(320);
    expect(out[1].totalToReceive).toBe(0); // demais linhas do grupo não repetem o net
  });

  it('desconto/vale são ABATIDOS antes do total (não dá prejuízo)', () => {
    const withDisc = [
      groupRows[0],
      row('p2', 'd2', 'Membro Dois', 'G', [rl('Caratinga', { SHOPEE: 50 }, { SHOPEE: 2 })], [{ amount: 20 }], [{ amount: 10 }]),
    ];
    const out = buildLeaderReportRows(withDisc, PLAT, leaderMap);
    // net = 200 + (100 - 20 - 10) = 200 + 70 = 270
    expect(out[0].totalToReceive).toBe(270);
    expect(out[0].discount).toBe(20);
    expect(out[0].vale).toBe(10);
  });

  it('sem líder definido, cai no 1º membro; avulso = ele mesmo', () => {
    const rows = [
      row('p1', 'd1', 'Primeiro', 'SemLider', [rl('X', { SHOPEE: 10 }, { SHOPEE: 2 })]),
      row('p9', 'd9', 'Avulso Nove', null, [rl('Y', { SHOPEE: 5 }, { SHOPEE: 2 })]),
    ];
    const out = buildLeaderReportRows(rows, PLAT, new Map());
    const named = out.filter((r) => r.name.trim() !== '').map((r) => r.name);
    expect(named).toContain('Primeiro'); // fallback: 1º membro
    expect(named).toContain('Avulso Nove');
  });
});

describe('buildSimpleReportRows — A nome (sem acento) · B total (net) · C chave PIX', () => {
  it('1 linha por unidade, nome sem acento, total = net do grupo', () => {
    const rows = [
      row('p1', 'd1', 'Adão Líder', 'G', [rl('C', { SHOPEE: 100 }, { SHOPEE: 2 })]),
      row('p2', 'd2', 'Membro', 'G', [rl('C', { SHOPEE: 50 }, { SHOPEE: 2 })], [{ amount: 20 }]),
    ];
    const out = buildSimpleReportRows(rows, new Map([['G', 'Adão Líder']]));
    expect(out.length).toBe(1);
    expect(out[0].name).toBe('Adao Lider'); // sem acento
    expect(out[0].total).toBe(280); // 200 + (100-20)
  });

  it('sem recebedor: PIX = pix_key do próprio líder', () => {
    const rows = [
      row('p1', 'd1', 'Lider Um', 'G', [rl('C', { SHOPEE: 10 }, { SHOPEE: 2 })], [], [], { pixKey: '111.111' }),
      row('p2', 'd2', 'Membro', 'G', [rl('C', { SHOPEE: 5 }, { SHOPEE: 2 })], [], [], { pixKey: '999.999' }),
    ];
    const out = buildSimpleReportRows(rows, new Map([['G', 'Lider Um']]));
    expect(out[0].pix).toBe('111.111'); // do líder, NUNCA do membro
  });

  it('com recebedor no líder: nome e PIX saem do RECEBEDOR (só o nome dele)', () => {
    const rows = [
      row('p1', 'd1', 'Lider Um', 'G', [rl('C', { SHOPEE: 10 }, { SHOPEE: 2 })], [], [],
        { pixKey: '111.111', recebedorNome: 'Esposa do Líder', recebedorPix: '39481738000153' }),
      row('p2', 'd2', 'Membro', 'G', [rl('C', { SHOPEE: 5 }, { SHOPEE: 2 })]),
    ];
    const out = buildSimpleReportRows(rows, new Map([['G', 'Lider Um']]));
    expect(out[0].name).toBe('Esposa do Lider'); // recebedor, sem acento, sem o nome do líder junto
    expect(out[0].pix).toBe('39481738000153'); // PIX do recebedor, não a pix_key do líder
    expect(out[0].total).toBe(30); // valor não muda
  });

  it('recebedor configurado num MEMBRO não muda nada (só o do líder vale)', () => {
    const rows = [
      row('p1', 'd1', 'Lider Um', 'G', [rl('C', { SHOPEE: 10 }, { SHOPEE: 2 })], [], [], { pixKey: '111.111' }),
      row('p2', 'd2', 'Membro', 'G', [rl('C', { SHOPEE: 5 }, { SHOPEE: 2 })], [], [],
        { recebedorNome: 'Outro Alguém', recebedorPix: '222.222' }),
    ];
    const out = buildSimpleReportRows(rows, new Map([['G', 'Lider Um']]));
    expect(out[0].name).toBe('Lider Um');
    expect(out[0].pix).toBe('111.111');
  });

  it('avulso com recebedor: sai o recebedor', () => {
    const rows = [
      row('p9', 'd9', 'Avulso Nove', null, [rl('Y', { SHOPEE: 5 }, { SHOPEE: 2 })], [], [],
        { recebedorNome: 'Recebedora Dele', recebedorPix: 'pix@dela.com' }),
    ];
    const out = buildSimpleReportRows(rows, new Map());
    expect(out[0].name).toBe('Recebedora Dele');
    expect(out[0].pix).toBe('pix@dela.com');
  });
});

describe('buildLeaderReportRows — nome/PIX do recebedor na 1ª linha da unidade', () => {
  it('com recebedor: 1ª linha sai o nome do recebedor + PIX dele; demais linhas vazias', () => {
    const rows = [
      row('p1', 'd1', 'Lider Um', 'G', [rl('Caratinga', { SHOPEE: 10 }, { SHOPEE: 2 })], [], [],
        { pixKey: '111.111', recebedorNome: 'Esposa', recebedorPix: 'cnpj-esposa' }),
      row('p2', 'd2', 'Membro', 'G', [rl('Mutum', { eMile: 5 }, { eMile: 2 })]),
    ];
    const out = buildLeaderReportRows(rows, PLAT, new Map([['G', 'Lider Um']]));
    expect(out[0].name).toBe('Esposa');
    expect(out[0].pixKey).toBe('cnpj-esposa');
    expect(out[1].name).toBe('');
    expect(out[1].pixKey).toBeNull();
  });

  it('sem recebedor: 1ª linha sai o líder + pix_key dele', () => {
    const rows = [
      row('p1', 'd1', 'Lider Um', 'G', [rl('Caratinga', { SHOPEE: 10 }, { SHOPEE: 2 })], [], [], { pixKey: '111.111' }),
    ];
    const out = buildLeaderReportRows(rows, PLAT, new Map([['G', 'Lider Um']]));
    expect(out[0].name).toBe('Lider Um');
    expect(out[0].pixKey).toBe('111.111');
  });
});
