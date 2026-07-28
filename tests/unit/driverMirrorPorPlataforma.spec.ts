import { describe, it, expect } from 'vitest';
import {
  mirrorPlatformKey, mirrorPlatformLabel, sanitizeMirrorKeyForPath,
  nfSlotKey, expectedNfSlotKeys, slotCoberto, computeNfProgressByPayment,
  type DriverRowData, type EmitterPlatform, type MirrorPubForNf,
} from '../../src/components/driverpay/driverPayShared';

/**
 * Decisões do Victor (28/07):
 *  - publicar o espelho da LOGGI e depois o da SHOPEE dá DOIS espelhos (antes o 2º
 *    apagava o 1º); republicar o mesmo conjunto substitui só ele;
 *  - "uma nota por espelho — se tem 2 espelhos, 2 notas", mesmo caindo no mesmo CNPJ
 *    (LOGGI/SHOPEE/ANJUN dividem o 11.802.464/0001-38).
 */

const CNPJ_SAL = 'em-shopee-anjun-loggi';
const CNPJ_IMILE = 'em-imile';
const PLATS: EmitterPlatform[] = [
  { name: 'LOGGI', nota_emitter_id: CNPJ_SAL },
  { name: 'SHOPEE', nota_emitter_id: CNPJ_SAL },
  { name: 'ANJUN', nota_emitter_id: CNPJ_SAL },
  { name: 'eMile', nota_emitter_id: CNPJ_IMILE },
];

function row(pacotes: Record<string, number>, over: Partial<DriverRowData> = {}): DriverRowData {
  return {
    paymentId: 'pay1', driverId: 'drv1', name: 'Fulano', route: 'Caratinga', groupName: null,
    routes: [{ route: 'Caratinga', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null,
    recebedorNome: null, recebedorPix: null, cpf: null, phone: null, active: true,
    notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0, ...over,
  };
}

describe('mirrorPlatformKey — identidade do espelho', () => {
  it('quinzena inteira = chave vazia', () => {
    expect(mirrorPlatformKey(null)).toBe('');
    expect(mirrorPlatformKey([])).toBe('');
  });

  it('ordena, pra clicar os chips em ordem diferente NÃO virar outro espelho', () => {
    expect(mirrorPlatformKey(['LOGGI', 'ANJUN'])).toBe('ANJUN+LOGGI');
    expect(mirrorPlatformKey(['ANJUN', 'LOGGI'])).toBe('ANJUN+LOGGI');
  });

  it('tira repetido e espaço à toa', () => {
    expect(mirrorPlatformKey([' LOGGI ', 'LOGGI', ''])).toBe('LOGGI');
  });

  it('LOGGI e SHOPEE são espelhos DIFERENTES (o caso do Victor)', () => {
    expect(mirrorPlatformKey(['LOGGI'])).not.toBe(mirrorPlatformKey(['SHOPEE']));
  });
});

describe('mirrorPlatformLabel — o que o driver lê no app', () => {
  it('mostra a plataforma em destaque', () => {
    expect(mirrorPlatformLabel(['LOGGI'])).toBe('SOMENTE LOGGI');
    expect(mirrorPlatformLabel(['LOGGI', 'ANJUN'])).toBe('SOMENTE ANJUN + LOGGI');
  });
  it('sem filtro = quinzena completa', () => {
    expect(mirrorPlatformLabel(null)).toBe('Quinzena completa');
  });
});

describe('sanitizeMirrorKeyForPath — a chave vira nome de arquivo', () => {
  it('mantém o + e troca o resto', () => {
    expect(sanitizeMirrorKeyForPath('ANJUN+LOGGI')).toBe('ANJUN+LOGGI');
    expect(sanitizeMirrorKeyForPath('Coleta Shopee')).toBe('Coleta-Shopee');
  });
  it('nunca devolve vazio (quebraria o caminho no bucket)', () => {
    expect(sanitizeMirrorKeyForPath('///')).toBe('filtro');
  });
});

describe('expectedNfSlotKeys — quantas notas o driver deve mandar', () => {
  const r = row({ LOGGI: 100, SHOPEE: 50, eMile: 30 });

  it('SEM espelho publicado: uma por CNPJ (regra de antes, intacta)', () => {
    const slots = expectedNfSlotKeys(r, PLATS, []);
    expect(slots).toHaveLength(2); // Shopee/Anjun/Loggi + iMile
    expect(slots).toContain(nfSlotKey(null, CNPJ_SAL));
    expect(slots).toContain(nfSlotKey(null, CNPJ_IMILE));
  });

  it('DOIS espelhos no MESMO CNPJ (LOGGI e SHOPEE) = DUAS notas', () => {
    const pubs: MirrorPubForNf[] = [
      { platformKey: 'LOGGI', platformFilter: ['LOGGI'] },
      { platformKey: 'SHOPEE', platformFilter: ['SHOPEE'] },
    ];
    const slots = expectedNfSlotKeys(r, PLATS, pubs);
    expect(slots).toHaveLength(2);
    expect(slots).toContain(nfSlotKey('LOGGI', CNPJ_SAL));
    expect(slots).toContain(nfSlotKey('SHOPEE', CNPJ_SAL));
  });

  it('espelho da quinzena inteira com 2 CNPJs = 2 notas (como já era)', () => {
    const slots = expectedNfSlotKeys(r, PLATS, [{ platformKey: '', platformFilter: null }]);
    expect(slots).toHaveLength(2);
  });

  it('espelho de plataforma em que ele NÃO tem pacote não pede nota', () => {
    const soLoggi = row({ LOGGI: 100 });
    const slots = expectedNfSlotKeys(soLoggi, PLATS, [{ platformKey: 'eMile', platformFilter: ['eMile'] }]);
    expect(slots).toHaveLength(0);
  });
});

describe('slotCoberto — nota antiga não pode virar dívida', () => {
  it('nota sem espelho (antes de 28/07) cobre qualquer espelho daquele CNPJ', () => {
    const notas = new Set([nfSlotKey(null, CNPJ_SAL)]);
    expect(slotCoberto(nfSlotKey('LOGGI', CNPJ_SAL), notas)).toBe(true);
  });
  it('nota de um espelho NÃO cobre o slot de outro espelho', () => {
    const notas = new Set([nfSlotKey('LOGGI', CNPJ_SAL)]);
    expect(slotCoberto(nfSlotKey('SHOPEE', CNPJ_SAL), notas)).toBe(false);
  });

  /**
   * Regressão real: na 1ª versão desta mudança o conjunto passou a exigir a chave
   * composta e 5 testes antigos quebraram — em produção isso teria ZERADO a coluna NF
   * de todo mundo que monta o conjunto pelo id do emitente. O formato antigo (CNPJ
   * puro) tem que continuar valendo.
   */
  it('aceita o formato ANTIGO (só o id do CNPJ, sem espelho)', () => {
    const notasFormatoAntigo = new Set([CNPJ_SAL]);
    expect(slotCoberto(nfSlotKey('LOGGI', CNPJ_SAL), notasFormatoAntigo)).toBe(true);
    expect(slotCoberto(nfSlotKey(null, CNPJ_SAL), notasFormatoAntigo)).toBe(true);
    expect(slotCoberto(nfSlotKey('LOGGI', CNPJ_IMILE), notasFormatoAntigo)).toBe(false);
  });
});

describe('computeNfProgressByPayment — a coluna NF do painel', () => {
  const r = row({ LOGGI: 100, SHOPEE: 50 });
  const pubs = new Map<string, MirrorPubForNf[]>([['drv1', [
    { platformKey: 'LOGGI', platformFilter: ['LOGGI'] },
    { platformKey: 'SHOPEE', platformFilter: ['SHOPEE'] },
  ]]]);

  it('2 espelhos e só 1 nota: fica 1/2, NÃO verde', () => {
    const notas = new Map([['drv1', {
      validated: new Set([nfSlotKey('LOGGI', CNPJ_SAL)]), received: new Set([nfSlotKey('LOGGI', CNPJ_SAL)]),
    }]]);
    const p = computeNfProgressByPayment([r], PLATS, notas, pubs).get('pay1')!;
    expect(p.expected).toBe(2);
    expect(p.validated).toBe(1);
    expect(p.complete).toBe(false);
  });

  it('as duas notas chegaram: 2/2 e verde', () => {
    const notas = new Map([['drv1', {
      validated: new Set([nfSlotKey('LOGGI', CNPJ_SAL), nfSlotKey('SHOPEE', CNPJ_SAL)]),
      received: new Set([nfSlotKey('LOGGI', CNPJ_SAL), nfSlotKey('SHOPEE', CNPJ_SAL)]),
    }]]);
    const p = computeNfProgressByPayment([r], PLATS, notas, pubs).get('pay1')!;
    expect(p.expected).toBe(2);
    expect(p.validated).toBe(2);
    expect(p.complete).toBe(true);
  });

  it('sem publicações passadas, se comporta EXATAMENTE como antes (1 por CNPJ)', () => {
    const notas = new Map([['drv1', {
      validated: new Set([nfSlotKey(null, CNPJ_SAL)]), received: new Set([nfSlotKey(null, CNPJ_SAL)]),
    }]]);
    const p = computeNfProgressByPayment([r], PLATS, notas).get('pay1')!;
    expect(p.expected).toBe(1);
    expect(p.complete).toBe(true);
  });

  it('marcar "na mão" continua deixando verde', () => {
    const manual = row({ LOGGI: 100, SHOPEE: 50 }, { notaFiscal: true });
    const p = computeNfProgressByPayment([manual], PLATS, new Map(), pubs).get('pay1')!;
    expect(p.complete).toBe(true);
    expect(p.manual).toBe(true);
  });
});
