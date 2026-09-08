/**
 * NF do painel: nota validada NÃO pode sumir da conta quando o espelho a que ela estava
 * presa deixa de existir.
 *
 * Caso real que originou (ANDREA, 2ª quinzena de julho): o espelho "de todas as
 * plataformas" foi publicado, ela mandou as notas (que gravam a chave daquele espelho),
 * depois o espelho foi DESPUBLICADO e republicado POR PLATAFORMA. A partir daí os slots
 * esperados passaram a ser `SHOPEE|CNPJ` / `LOGGI|CNPJ`, enquanto as notas continuavam
 * com a chave do espelho antigo (`|CNPJ`) — nada casava e a tela dizia "NF 1/3", com 3
 * notas validadas no banco. O operador contornou marcando na mão.
 *
 * Regra: nota cuja chave de espelho não corresponde a NENHUMA publicação viva volta a
 * valer pelo CNPJ (mesmo tratamento que a nota antiga, sem espelho). Enquanto o espelho
 * dela estiver vivo, nada muda — ela continua valendo só para aquele espelho.
 *
 * Roda com: npx vitest run driverPayNfEspelhoRepublicado
 */
import { describe, it, expect } from 'vitest';
import {
  computeNfProgressByPayment,
  slotCoberto,
  nfSlotKey,
  type DriverRowData,
  type EmitterPlatform,
  type MirrorPubForNf,
} from '../../src/components/driverpay/driverPayShared';

const CNPJ_SLO = 'cnpj-shopee-anjun-loggi';
const CNPJ_IMILE = 'cnpj-imile';

const PLATFORMS: EmitterPlatform[] = [
  { name: 'SHOPEE', nota_emitter_id: CNPJ_SLO },
  { name: 'LOGGI', nota_emitter_id: CNPJ_SLO },
  { name: 'eMile', nota_emitter_id: CNPJ_IMILE },
];

function row(paymentId: string, driverId: string, packages: Record<string, number>): DriverRowData {
  return {
    paymentId, driverId, name: driverId, route: null, groupName: null,
    routes: [{ route: null, packages, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, cpf: null, phone: null,
    active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

/** Espelho "de todas as plataformas" — platformKey vazia, sem filtro. */
const ESPELHO_DE_TODAS: MirrorPubForNf = { platformKey: '', platformFilter: null };
/** Espelhos republicados por plataforma. */
const ESPELHO_SHOPEE: MirrorPubForNf = { platformKey: 'SHOPEE', platformFilter: ['SHOPEE'] };
const ESPELHO_LOGGI: MirrorPubForNf = { platformKey: 'LOGGI', platformFilter: ['LOGGI'] };

describe('slotCoberto — nota presa a espelho que não existe mais', () => {
  it('com o espelho dela VIVO, a nota vale só para aquele espelho (comportamento antigo)', () => {
    const notas = new Set([nfSlotKey('SHOPEE', CNPJ_SLO)]);
    const vivos = new Set(['SHOPEE', 'LOGGI']);
    expect(slotCoberto(nfSlotKey('SHOPEE', CNPJ_SLO), notas, vivos)).toBe(true);
    // não pode cobrir o espelho da LOGGI, que está vivo e pede a nota dele
    expect(slotCoberto(nfSlotKey('LOGGI', CNPJ_SLO), notas, vivos)).toBe(false);
  });

  it('com o espelho dela MORTO, a nota volta a valer pelo CNPJ', () => {
    // nota mandada no espelho "de todas" (chave vazia), que já não existe
    const notas = new Set([nfSlotKey('', CNPJ_SLO)]);
    const vivos = new Set(['SHOPEE', 'LOGGI']);
    expect(slotCoberto(nfSlotKey('SHOPEE', CNPJ_SLO), notas, vivos)).toBe(true);
    expect(slotCoberto(nfSlotKey('LOGGI', CNPJ_SLO), notas, vivos)).toBe(true);
  });

  it('nota órfã de um CNPJ não cobre slot de OUTRO CNPJ', () => {
    const notas = new Set([nfSlotKey('', CNPJ_SLO)]);
    const vivos = new Set(['SHOPEE']);
    expect(slotCoberto(nfSlotKey('SHOPEE', CNPJ_IMILE), notas, vivos)).toBe(false);
  });

  it('sem informar os espelhos vivos, o comportamento é exatamente o de antes', () => {
    const notas = new Set([nfSlotKey('', CNPJ_SLO)]);
    expect(slotCoberto(nfSlotKey('SHOPEE', CNPJ_SLO), notas)).toBe(false);
    expect(slotCoberto(nfSlotKey('', CNPJ_SLO), notas)).toBe(true);
  });

  it('nota antiga (coringa) segue valendo pra qualquer espelho', () => {
    const notas = new Set([nfSlotKey(null, CNPJ_SLO)]);
    const vivos = new Set(['SHOPEE', 'LOGGI']);
    expect(slotCoberto(nfSlotKey('SHOPEE', CNPJ_SLO), notas, vivos)).toBe(true);
  });
});

describe('computeNfProgressByPayment — o caso ANDREA de ponta a ponta', () => {
  const r = row('pag-andrea', 'andrea', { SHOPEE: 500, LOGGI: 120 });

  it('ANTES de republicar: espelho "de todas" vivo, nota daquele espelho → 1/1 (não regride)', () => {
    const notas = new Map([['andrea', {
      validated: new Set([nfSlotKey('', CNPJ_SLO)]),
      received: new Set([nfSlotKey('', CNPJ_SLO)]),
    }]]);
    const pubs = new Map([['andrea', [ESPELHO_DE_TODAS]]]);
    const p = computeNfProgressByPayment([r], PLATFORMS, notas, pubs).get('pag-andrea')!;
    expect(p).toMatchObject({ expected: 1, validated: 1, complete: true });
  });

  it('DEPOIS de republicar por plataforma: a nota validada continua contando', () => {
    // a nota ficou com a chave do espelho "de todas", que foi despublicado
    const notas = new Map([['andrea', {
      validated: new Set([nfSlotKey('', CNPJ_SLO)]),
      received: new Set([nfSlotKey('', CNPJ_SLO)]),
    }]]);
    const pubs = new Map([['andrea', [ESPELHO_SHOPEE, ESPELHO_LOGGI]]]);
    const p = computeNfProgressByPayment([r], PLATFORMS, notas, pubs).get('pag-andrea')!;
    // 2 espelhos vivos, mesmo CNPJ → 2 vagas; a nota órfã cobre o CNPJ inteiro
    expect(p.expected).toBe(2);
    expect(p.validated).toBe(2);
    expect(p.complete).toBe(true);
    expect(p.manual).toBe(false); // sem precisar marcar na mão
  });

  it('quem NÃO mandou nota continua devendo depois de republicar', () => {
    const notas = new Map<string, { validated: Set<string>; received: Set<string> }>();
    const pubs = new Map([['andrea', [ESPELHO_SHOPEE, ESPELHO_LOGGI]]]);
    const p = computeNfProgressByPayment([r], PLATFORMS, notas, pubs).get('pag-andrea')!;
    expect(p).toMatchObject({ expected: 2, validated: 0, complete: false });
  });

  it('nota de um CNPJ não cobre a vaga do outro CNPJ depois de republicar', () => {
    const r2 = row('pag-x', 'x', { SHOPEE: 300, eMile: 40 });
    const notas = new Map([['x', {
      validated: new Set([nfSlotKey('', CNPJ_SLO)]),
      received: new Set([nfSlotKey('', CNPJ_SLO)]),
    }]]);
    const pubs = new Map([['x', [ESPELHO_SHOPEE, { platformKey: 'eMile', platformFilter: ['eMile'] }]]]);
    const p = computeNfProgressByPayment([r2], PLATFORMS, notas, pubs).get('pag-x')!;
    expect(p.expected).toBe(2);
    expect(p.validated).toBe(1); // só a do CNPJ Shopee/Loggi
    expect(p.complete).toBe(false);
  });
});
