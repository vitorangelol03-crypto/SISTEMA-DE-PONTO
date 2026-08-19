/**
 * Testes unit das 4 implementações dos espelhos (2026-07-19):
 * o builder (driverPayShared.buildDriverMirrorData) propaga destaque/aviso por
 * plataforma respeitando a REGRA DE PRESENÇA do Victor (só onde há pacotes>0),
 * ignora plataforma arquivada, e leva a marca PNR/LOST dos descontos.
 *
 * Roda com: npx vitest run driverPayMirrorFlags
 */

import { describe, it, expect } from 'vitest';
import {
  buildDriverMirrorData,
  buildGroupMirrorData,
  type DriverRowData,
} from '../../src/components/driverpay/driverPayShared';
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

/**
 * Abate ZERO decidido pela regra de saldo (19/08/2026, caso real da Andrea): o espelho
 * da LOGGI dela imprimia "Descontos − R$ 154,79" no resumo SEM subtrair do total
 * (316,80 − 154,79 = 316,80 no papel) — parecia desconto em dobro. A flag
 * `deductionsApplied` tem que descer pra `false` nesse caso, acionando a apresentação
 * "não abatidos neste pagamento" que já existe desde 27/07.
 */
describe('deductionsApplied com a regra de saldo (19/08/2026)', () => {
  const dividas = [discount({ amount: 48.99 }), discount({ id: 'd2', amount: 105.8 })];
  // O row() deste arquivo não carrega taxa (o computeRowTotals cai em 0, não no
  // default da plataforma) — os casos de dinheiro precisam da taxa na linha.
  const comTaxa = (r: DriverRowData, rates: Record<string, number>): DriverRowData =>
    ({ ...r, ratesByPlatform: rates } as DriverRowData);

  it('🎯 caso Andrea: dívida listada + abate 0 (já descontada noutro espelho) → NÃO abatido', () => {
    const data = buildDriverMirrorData(
      comTaxa(row({ LOGGI: 144 }, dividas), { LOGGI: 2 }),
      [platform('LOGGI')], company, period, undefined, true, 0,
    );
    expect(data.deductionsApplied).toBe(false);
    // O total segue cheio — nada foi subtraído nesta conta.
    expect(data.totals.toReceive).toBe(288); // 144 × R$2 (taxa default do fixture)
    // As linhas continuam LISTADAS (o driver vê o que existe), só não abatem.
    expect(data.discounts).toHaveLength(2);
  });

  it('abate de verdade (regra mandou descontar) → segue abatido, com o total menor', () => {
    const data = buildDriverMirrorData(
      comTaxa(row({ SHOPEE: 100 }, dividas), { SHOPEE: 2 }),
      [platform('SHOPEE')], company, period, undefined, true, 154.79,
    );
    expect(data.deductionsApplied).toBe(true);
    expect(data.totals.toReceive).toBeCloseTo(200 - 154.79, 2);
  });

  it('sem dívida nenhuma, a flag não desce (nada listado, nada a confundir)', () => {
    const data = buildDriverMirrorData(
      row({ SHOPEE: 10 }), [platform('SHOPEE')], company, period, undefined, true, 0,
    );
    expect(data.deductionsApplied).toBe(true);
  });

  it('modo "não descontar nada" continua como sempre (flag false por escolha)', () => {
    const data = buildDriverMirrorData(
      row({ SHOPEE: 10 }, dividas), [platform('SHOPEE')], company, period, undefined, false,
    );
    expect(data.deductionsApplied).toBe(false);
  });

  it('grupo onde NINGUÉM teve abate real → resumo do grupo também sai como "não abatido"', () => {
    const abates = new Map([['d1', 0]]);
    const g = buildGroupMirrorData(
      'G1', [comTaxa(row({ LOGGI: 144 }, dividas), { LOGGI: 2 })], [platform('LOGGI')],
      company, period, undefined, true, abates,
    );
    expect(g.deductionsApplied).toBe(false);
    expect(g.groupTotals.toReceive).toBe(288);
  });

  it('grupo MISTO (um abatido, outro não): resumo segue abatido; a página de cada um diz a sua verdade', () => {
    const abatido = row({ SHOPEE: 100 }, [discount({ amount: 10 })]);
    const dispensado = { ...row({ SHOPEE: 50 }, [discount({ id: 'd9', amount: 7 })]), paymentId: 'pay2', driverId: 'd2' } as DriverRowData;
    const abates = new Map([['d1', 10], ['d2', 0]]);
    const g = buildGroupMirrorData(
      'G2', [abatido, dispensado], [platform('SHOPEE')], company, period, undefined, true, abates,
    );
    expect(g.deductionsApplied).toBe(true);
    const paginas = g.drivers.map((d) => d.deductionsApplied);
    expect(paginas).toEqual([true, false]);
  });
});
