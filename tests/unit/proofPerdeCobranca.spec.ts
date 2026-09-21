// Quem PARA de ser cobrado quando a solicitação de print muda de alcance.
//
// 🔴 CASO REAL (21/09/2026, 07:03): o modal "Solicitar espelho" grava a DIFERENÇA entre o
// que está no banco e o que está marcado na tela. Com o pedido GERAL no ar, o operador
// pediu o print de UMA pessoa — e o salvar apagou o pedido geral junto. A cobrança da
// quinzena inteira caiu calada; 8 entregadores que ainda não tinham mandado o print
// sumiram da fila, e só descobrimos porque um deles (o Adriano da Ilha) foi cobrado na mão.
//
// Esta função é o que a tela usa para avisar ANTES de gravar.
//
// Roda com: npx vitest run proofPerdeCobranca
import { describe, expect, it } from 'vitest';
import {
  quemParaDeSerCobrado,
  type DriverRowData,
  type ProofRequest,
  type ProofState,
} from '../../src/components/driverpay/driverPayShared';

const paraTodos = (...plats: string[]): ProofRequest[] => plats.map((p) => ({ platformName: p, driverId: null }));
const soDe = (driverId: string, ...plats: string[]): ProofRequest[] =>
  plats.map((p) => ({ platformName: p, driverId }));

function row(driverId: string, pacotes: Record<string, number>, groupName?: string): DriverRowData {
  return {
    paymentId: `pay-${driverId}`,
    driverId,
    name: driverId.toUpperCase(),
    route: '',
    groupName: groupName ?? null,
    routes: [{ route: '', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {},
    discounts: [],
    vales: [],
    zapexCount: 0,
    zapexRate: 0,
    totalPackages: 0,
    packagesAmount: 0,
    totalDiscounts: 0,
    totalVales: 0,
    totalZapex: 0,
    totalNet: 0,
    notaFiscal: false,
    espelhoConferido: false,
  } as unknown as DriverRowData;
}

/** Três entregadores em grupo, todos com Shopee — como na quinzena real. */
const TRES = [
  row('adriano', { SHOPEE: 992 }, 'Ilha - ADRIANO'),
  row('jonas', { SHOPEE: 1269 }, 'PIEDADE 02 Jonas'),
  row('carlos', { SHOPEE: 983 }, 'Caratinga'),
];

describe('quemParaDeSerCobrado', () => {
  it('🔴 o caso de 21/09: pedir de UM cancela a cobrança dos outros', () => {
    const perdem = quemParaDeSerCobrado(TRES, paraTodos('SHOPEE'), soDe('carlos', 'SHOPEE'));

    expect(perdem.map((p) => p.driverId).sort()).toEqual(['adriano', 'jonas']);
    expect(perdem.every((p) => p.plataformas.includes('SHOPEE'))).toBe(true);
  });

  it('quem já mandou o print não conta como quem some da fila', () => {
    const estados = new Map<string, ProofState>([
      ['adriano|SHOPEE', 'confirmado'],
      ['jonas|SHOPEE', 'pendente'],
    ]);

    const perdem = quemParaDeSerCobrado(TRES, paraTodos('SHOPEE'), soDe('carlos', 'SHOPEE'), undefined, estados);

    expect(perdem.find((p) => p.driverId === 'adriano')?.aindaSemPrint).toBe(false);
    expect(perdem.find((p) => p.driverId === 'jonas')?.aindaSemPrint).toBe(false);
  });

  it('print RECUSADO ainda está na fila — ele precisa mandar outro', () => {
    const estados = new Map<string, ProofState>([['adriano|SHOPEE', 'recusado']]);

    const perdem = quemParaDeSerCobrado(TRES, paraTodos('SHOPEE'), soDe('carlos', 'SHOPEE'), undefined, estados);

    expect(perdem.find((p) => p.driverId === 'adriano')?.aindaSemPrint).toBe(true);
  });

  it('sem saber o estado dos prints, avisa pelo lado seguro (todos contam)', () => {
    const perdem = quemParaDeSerCobrado(TRES, paraTodos('SHOPEE'), soDe('carlos', 'SHOPEE'));

    expect(perdem.every((p) => p.aindaSemPrint)).toBe(true);
  });

  it('AMPLIAR o alcance não tira cobrança de ninguém', () => {
    const perdem = quemParaDeSerCobrado(TRES, soDe('carlos', 'SHOPEE'), paraTodos('SHOPEE'));

    expect(perdem).toEqual([]);
  });

  it('salvar sem mudar nada não avisa nada', () => {
    const perdem = quemParaDeSerCobrado(TRES, paraTodos('SHOPEE'), paraTodos('SHOPEE'));

    expect(perdem).toEqual([]);
  });

  it('cancelar tudo tira a cobrança de todo mundo que era cobrado', () => {
    const perdem = quemParaDeSerCobrado(TRES, paraTodos('SHOPEE'), []);

    expect(perdem).toHaveLength(3);
  });

  it('quem não tinha pacote na plataforma nunca era cobrado — não entra no aviso', () => {
    const comUmSemShopee = [...TRES, row('mikael', { ANJUN: 98 }, 'Ilha - ADRIANO')];

    const perdem = quemParaDeSerCobrado(comUmSemShopee, paraTodos('SHOPEE'), []);

    expect(perdem.map((p) => p.driverId)).not.toContain('mikael');
  });

  it('só a plataforma retirada entra: tirar LOGGI não mexe na cobrança da SHOPEE', () => {
    const duas = [row('adriano', { SHOPEE: 992, LOGGI: 15 }, 'Ilha - ADRIANO')];

    const perdem = quemParaDeSerCobrado(duas, paraTodos('SHOPEE', 'LOGGI'), paraTodos('SHOPEE'));

    expect(perdem).toHaveLength(1);
    expect(perdem[0].plataformas).toEqual(['LOGGI']);
  });

  it('sem planilha importada, quem está em grupo é cobrado mesmo sem pacote — e perde igual', () => {
    const semPacote = [row('novato', {}, 'Ilha - ADRIANO')];
    const semPlanilha = new Set(['SHOPEE']);

    const perdem = quemParaDeSerCobrado(semPacote, paraTodos('SHOPEE'), [], semPlanilha);

    expect(perdem.map((p) => p.driverId)).toEqual(['novato']);
  });
});
