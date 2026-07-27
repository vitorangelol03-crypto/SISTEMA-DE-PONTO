/**
 * Relatórios + espelho com as opções de 2026-07-27 (decisões do Victor):
 *   1) FILTRO POR PLATAFORMA nos dois relatórios (geral e simples): colunas, TOTAL PACOTES
 *      e TOTAL A RECEBER contam só as escolhidas; quem não tem pacote nelas SOME.
 *   2) "Descontar vales e perdas" (pagamento PARCIAL por plataforma): desmarcado, os
 *      valores continuam listados mas NÃO são abatidos do total — pra não descontar duas
 *      vezes quando o restante das plataformas for pago depois.
 *   3) Aviso anti-desconto-duplo (quem já teve o abate numa publicação do período).
 *
 * Regressão importante: SEM opções, tudo tem que sair exatamente como antes.
 *
 * Roda com: npx vitest run driverPayReportOptions
 */
import { describe, it, expect } from 'vitest';
import {
  buildLeaderReportRows,
  buildSimpleReportRows,
  buildDriverMirrorData,
  buildGroupMirrorData,
  computeRowTotals,
  deductionsOf,
  alreadyDeductedDrivers,
  type DriverRowData,
  type MirrorPublicationInfo,
} from '../../src/components/driverpay/driverPayShared';
import { areDeductionsApplied } from '../../src/utils/driverMirrorGenerator';
import type { DriverPlatform, DriverPaymentPeriod } from '../../src/services/driverPay';
import type { Company } from '../../src/services/database';

function plat(name: string, rate = 2): DriverPlatform {
  return {
    id: `p-${name}`, company_id: 'c', name, default_rate: rate, sort_order: 0, active: true,
    color: null, highlight_mirror: false, mirror_notice: null, mirror_separate_value: false, nota_emitter_id: null,
  } as unknown as DriverPlatform;
}
const PLAT = [plat('ANJUN'), plat('LOGGI')];
const COMPANY = { id: 'c', name: 'CD', cnpj: null, city: 'Caratinga' } as unknown as Company;
const PERIOD = {
  id: 'per1', label: '2 Quinzena Junho', start_date: '2026-06-16', end_date: '2026-07-30', status: 'aberto',
} as unknown as DriverPaymentPeriod;

const rl = (route: string, packages: Record<string, number>, rates: Record<string, number> = {}) =>
  ({ route, packages, packageIds: {}, rates });

function row(
  paymentId: string, driverId: string, name: string, groupName: string | null,
  routes: ReturnType<typeof rl>[], discounts: { amount: number }[] = [], vales: { amount: number }[] = [],
): DriverRowData {
  return {
    paymentId, driverId, name, route: null, groupName, routes,
    ratesByPlatform: {}, discounts, vales, pixKey: 'pix-do-lider', recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null, active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

// Driver com as duas plataformas + R$ 50 de desconto e R$ 30 de vale:
// ANJUN 100×2 = 200 · LOGGI 50×2 = 100 · bruto 300 · líquido 220.
const MISTO = row('p1', 'd1', 'Fulano de Tal', null, [
  rl('Caratinga', { ANJUN: 100, LOGGI: 50 }, { ANJUN: 2, LOGGI: 2 }),
], [{ amount: 50 }], [{ amount: 30 }]);

// Driver só de LOGGI, sem desconto (some quando o relatório for só da ANJUN).
const SO_LOGGI = row('p2', 'd2', 'Beltrano', null, [rl('Mutum', { LOGGI: 10 }, { LOGGI: 2 })]);

describe('computeRowTotals — abate opcional dos vales/perdas', () => {
  it('sem opção: abate como sempre (300 − 80 = 220)', () => {
    const t = computeRowTotals(MISTO);
    expect(t.packagesAmount).toBe(300);
    expect(t.net).toBe(220);
  });

  it('includeDeductions=false: net fica no bruto, mas discounts/vales seguem preenchidos', () => {
    const t = computeRowTotals(MISTO, undefined, false);
    expect(t.net).toBe(300);
    expect(t.discounts).toBe(50);
    expect(t.vales).toBe(30);
  });

  it('filtro + abate: só ANJUN (200) menos os 80 do driver = 120', () => {
    expect(computeRowTotals(MISTO, new Set(['ANJUN'])).net).toBe(120);
  });

  it('filtro sem abate: só ANJUN = 200 cheio (o desconto sai no pagamento das demais)', () => {
    expect(computeRowTotals(MISTO, new Set(['ANJUN']), false).net).toBe(200);
  });

  it('pagar ANJUN sem abate + LOGGI com abate desconta os R$ 80 UMA vez só', () => {
    const anjun = computeRowTotals(MISTO, new Set(['ANJUN']), false).net; // 200
    const loggi = computeRowTotals(MISTO, new Set(['LOGGI']), true).net; // 100 − 80 = 20
    expect(anjun + loggi).toBe(220); // == líquido total do driver
  });
});

describe('deductionsOf', () => {
  it('soma vales + perdas', () => {
    expect(deductionsOf(MISTO)).toBe(80);
    expect(deductionsOf(SO_LOGGI)).toBe(0);
  });
});

describe('buildLeaderReportRows — filtro de plataforma', () => {
  const leaderMap = new Map<string, string>();

  it('sem opções: sai igual a antes (as duas plataformas, líquido abatido)', () => {
    const out = buildLeaderReportRows([MISTO, SO_LOGGI], PLAT, leaderMap);
    expect(out).toHaveLength(2);
    const fulano = out.find((r) => r.name === 'Fulano de Tal')!;
    expect(fulano.platforms.ANJUN).toEqual({ packages: 100, value: 200 });
    expect(fulano.platforms.LOGGI).toEqual({ packages: 50, value: 100 });
    expect(fulano.totalPackages).toBe(300);
    expect(fulano.totalToReceive).toBe(220);
  });

  it('só ANJUN: coluna LOGGI some, totais contam só ANJUN e quem não tem ANJUN sai fora', () => {
    const out = buildLeaderReportRows([MISTO, SO_LOGGI], PLAT, leaderMap, {
      allowedPlatformNames: new Set(['ANJUN']),
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Fulano de Tal');
    expect(out[0].platforms.LOGGI).toBeUndefined();
    expect(out[0].platforms.ANJUN).toEqual({ packages: 100, value: 200 });
    expect(out[0].totalPackages).toBe(200);
    expect(out[0].totalToReceive).toBe(120); // 200 − 80
  });

  it('só ANJUN sem abate: total cheio de 200 e desconto/vale ainda visíveis nas colunas', () => {
    const out = buildLeaderReportRows([MISTO], PLAT, leaderMap, {
      allowedPlatformNames: new Set(['ANJUN']),
      includeDeductions: false,
    });
    expect(out[0].totalToReceive).toBe(200);
    expect(out[0].discount).toBe(50);
    expect(out[0].vale).toBe(30);
  });

  it('rota sem pacote na plataforma escolhida não vira linha', () => {
    // Mesmo driver com 2 rotas: Caratinga só ANJUN, Mutum só LOGGI.
    const duasRotas = row('p3', 'd3', 'Ciclano', null, [
      rl('Caratinga', { ANJUN: 10 }, { ANJUN: 2 }),
      rl('Mutum', { LOGGI: 10 }, { LOGGI: 2 }),
    ]);
    const todas = buildLeaderReportRows([duasRotas], PLAT, leaderMap);
    expect(todas.map((r) => r.route)).toEqual(['Caratinga', 'Mutum']);

    const soAnjun = buildLeaderReportRows([duasRotas], PLAT, leaderMap, {
      allowedPlatformNames: new Set(['ANJUN']),
    });
    expect(soAnjun.map((r) => r.route)).toEqual(['Caratinga']);
    expect(soAnjun[0].totalToReceive).toBe(20);
  });

  it('conjunto vazio de plataformas = sem filtro (não devolve relatório vazio por engano)', () => {
    const out = buildLeaderReportRows([MISTO, SO_LOGGI], PLAT, leaderMap, {
      allowedPlatformNames: new Set<string>(),
    });
    expect(out).toHaveLength(2);
  });

  it('grupo: filtro e abate valem pra unidade inteira (líder recebe pelo grupo)', () => {
    const lider = row('g1', 'l1', 'Lider Um', 'G', [rl('Caratinga', { ANJUN: 10 }, { ANJUN: 2 })], [{ amount: 5 }]);
    const membro = row('g2', 'm1', 'Membro', 'G', [rl('Caratinga', { ANJUN: 5, LOGGI: 100 }, { ANJUN: 2, LOGGI: 2 })]);
    const map = new Map([['G', 'Lider Um']]);
    const comAbate = buildLeaderReportRows([lider, membro], PLAT, map, {
      allowedPlatformNames: new Set(['ANJUN']),
    });
    expect(comAbate).toHaveLength(1);
    expect(comAbate[0].platforms.ANJUN).toEqual({ packages: 15, value: 30 });
    expect(comAbate[0].totalToReceive).toBe(25); // 30 − 5
    const semAbate = buildLeaderReportRows([lider, membro], PLAT, map, {
      allowedPlatformNames: new Set(['ANJUN']),
      includeDeductions: false,
    });
    expect(semAbate[0].totalToReceive).toBe(30);
  });
});

describe('buildSimpleReportRows — filtro de plataforma e abate', () => {
  const leaderMap = new Map<string, string>();

  it('sem opções: igual a antes', () => {
    const out = buildSimpleReportRows([MISTO, SO_LOGGI], leaderMap);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'Fulano de Tal', total: 220, pix: 'pix-do-lider' });
  });

  it('só ANJUN: quem não tem ANJUN some e o total conta só ela', () => {
    const out = buildSimpleReportRows([MISTO, SO_LOGGI], leaderMap, {
      allowedPlatformNames: new Set(['ANJUN']),
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Fulano de Tal');
    expect(out[0].total).toBe(120);
  });

  it('só ANJUN sem abate: 200 cheio', () => {
    const out = buildSimpleReportRows([MISTO], leaderMap, {
      allowedPlatformNames: new Set(['ANJUN']),
      includeDeductions: false,
    });
    expect(out[0].total).toBe(200);
  });
});

describe('espelho — vales/perdas listados mas não abatidos', () => {
  it('individual sem abate: total no bruto, valores preservados e marca deductionsApplied=false', () => {
    const semAbate = buildDriverMirrorData(MISTO, PLAT, COMPANY, PERIOD, new Set(['ANJUN']), false);
    expect(semAbate.totals.packagesValue).toBe(200);
    expect(semAbate.totals.discountsValue).toBe(50);
    expect(semAbate.totals.valesValue).toBe(30);
    expect(semAbate.totals.toReceive).toBe(200);
    expect(areDeductionsApplied(semAbate)).toBe(false);
    // As linhas continuam no PDF pro driver ver o que vem por aí.
    expect(semAbate.discounts).toHaveLength(1);
    expect(semAbate.vales).toHaveLength(1);
  });

  it('individual com abate (padrão): comportamento de sempre', () => {
    const comAbate = buildDriverMirrorData(MISTO, PLAT, COMPANY, PERIOD, new Set(['ANJUN']));
    expect(comAbate.totals.toReceive).toBe(120);
    expect(areDeductionsApplied(comAbate)).toBe(true);
  });

  it('grupo propaga a escolha pros membros e pro total do grupo', () => {
    const g = buildGroupMirrorData('G', [MISTO, SO_LOGGI], PLAT, COMPANY, PERIOD, undefined, false);
    expect(areDeductionsApplied(g)).toBe(false);
    expect(g.drivers.every((d) => areDeductionsApplied(d) === false)).toBe(true);
    expect(g.groupTotals.toReceive).toBe(320); // 300 + 20, sem abater os 80
    expect(g.groupTotals.discountsValue).toBe(50);
  });
});

describe('alreadyDeductedDrivers — aviso anti-desconto-duplo', () => {
  const pub = (driverId: string, scope: MirrorPublicationInfo['scope'], includeDeductions = true) =>
    ({ driverId, scope, includeDeductions });

  it('avisa quem já teve o abate numa publicação individual', () => {
    const out = alreadyDeductedDrivers([MISTO, SO_LOGGI], [pub('d1', 'individual')]);
    expect(out).toEqual([{ driverId: 'd1', name: 'Fulano de Tal', amount: 80 }]);
  });

  it('publicação SEM abate não conta (o desconto ainda não saiu)', () => {
    expect(alreadyDeductedDrivers([MISTO], [pub('d1', 'individual', false)])).toEqual([]);
  });

  it('driver sem vale/perda nunca entra no aviso', () => {
    expect(alreadyDeductedDrivers([SO_LOGGI], [pub('d2', 'individual')])).toEqual([]);
  });

  it('espelho de GRUPO cobre os membros (publicado no líder)', () => {
    const lider = row('g1', 'l1', 'Lider Um', 'G', [rl('Caratinga', { ANJUN: 10 })], [{ amount: 7 }]);
    const membro = row('g2', 'm1', 'Membro', 'G', [rl('Caratinga', { ANJUN: 5 })], [], [{ amount: 3 }]);
    const out = alreadyDeductedDrivers([lider, membro], [pub('l1', 'group')]);
    expect(out.map((d) => d.name).sort()).toEqual(['Lider Um', 'Membro']);
  });

  it('sem publicação nenhuma, ninguém é avisado', () => {
    expect(alreadyDeductedDrivers([MISTO, SO_LOGGI], [])).toEqual([]);
  });
});
