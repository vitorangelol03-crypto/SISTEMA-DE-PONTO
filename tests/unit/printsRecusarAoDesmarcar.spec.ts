/**
 * Desmarcar o "espelho conferido" volta a cobrar o print (19/08/2026, pedido do
 * Victor: *"se o check for desmarcado e tiver pacotes da shopee o sistema volta a
 * cobrar o print daquele líder"*).
 *
 * O portal só volta a pedir quando não sobra print de pé (`sent === 0 && rejected > 0`
 * no cartão do app) — então desmarcar precisa RECUSAR os prints ainda de pé das
 * plataformas cobradas. Esta regra decide QUAIS prints; o risco é recusar demais
 * (print de outro driver, plataforma não cobrada) — por isso é pura e testada.
 */
import { describe, it, expect } from 'vitest';
import {
  printsParaRecusarAoDesmarcar,
  type DriverRowData,
  type ProofRequest,
} from '../../src/components/driverpay/driverPayShared';

function row(driverId: string, pacotes: Record<string, number>, groupName: string | null): DriverRowData {
  return {
    paymentId: `pay-${driverId}`, driverId, name: driverId.toUpperCase(), route: '', groupName,
    routes: [{ route: '', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null, active: true, notaFiscal: false, espelhoConferido: true, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}
const geral = (...plats: string[]): ProofRequest[] =>
  plats.map((p) => ({ platformName: p, driverId: null } as ProofRequest));
const print = (id: string, driverId: string, platformName: string, status: string) =>
  ({ id, driverId, platformName, status });

describe('printsParaRecusarAoDesmarcar', () => {
  it('🎯 caso do pedido: líder com pacote SHOPEE e print validado — recusa pra cobrar de novo', () => {
    const lider = row('lider', { SHOPEE: 1059 }, 'G1');
    const prints = [print('pr1', 'lider', 'SHOPEE', 'validado')];
    expect(printsParaRecusarAoDesmarcar(lider, geral('SHOPEE'), prints)).toEqual(['pr1']);
  });

  it('print apenas "recebido" (na fila) também cai — não pode sobrar print de pé', () => {
    const lider = row('lider', { SHOPEE: 500 }, 'G1');
    const prints = [print('pr1', 'lider', 'SHOPEE', 'recebido')];
    expect(printsParaRecusarAoDesmarcar(lider, geral('SHOPEE'), prints)).toEqual(['pr1']);
  });

  it('🔴 print de OUTRO driver nunca entra', () => {
    const lider = row('lider', { SHOPEE: 500 }, 'G1');
    const prints = [print('pr-outro', 'colega', 'SHOPEE', 'validado')];
    expect(printsParaRecusarAoDesmarcar(lider, geral('SHOPEE'), prints)).toEqual([]);
  });

  it('🔴 sem pacote na plataforma cobrada (dispensado): nada a cobrar, nada recusado', () => {
    // A condição do Victor é "e tiver pacotes da shopee" — sem pacote, o desmarcar
    // é só o check, como sempre foi.
    const semPacote = row('sem', {}, 'G1');
    const prints = [print('pr1', 'sem', 'SHOPEE', 'validado')];
    expect(printsParaRecusarAoDesmarcar(semPacote, geral('SHOPEE'), prints)).toEqual([]);
  });

  it('plataforma do print NÃO cobrada fica de pé (recusa só o que o pedido cobre)', () => {
    const lider = row('lider', { SHOPEE: 500, LOGGI: 60 }, 'G1');
    const prints = [
      print('pr-shopee', 'lider', 'SHOPEE', 'validado'),
      print('pr-loggi', 'lider', 'LOGGI', 'validado'), // ninguém pediu print da LOGGI
    ];
    expect(printsParaRecusarAoDesmarcar(lider, geral('SHOPEE'), prints)).toEqual(['pr-shopee']);
  });

  it('já rejeitado não é rejeitado de novo (idempotente)', () => {
    const lider = row('lider', { SHOPEE: 500 }, 'G1');
    const prints = [print('pr1', 'lider', 'SHOPEE', 'rejeitado')];
    expect(printsParaRecusarAoDesmarcar(lider, geral('SHOPEE'), prints)).toEqual([]);
  });

  it('sem pedido nenhum na quinzena: nada cobrado, nada recusado', () => {
    const lider = row('lider', { SHOPEE: 500 }, 'G1');
    const prints = [print('pr1', 'lider', 'SHOPEE', 'validado')];
    expect(printsParaRecusarAoDesmarcar(lider, [], prints)).toEqual([]);
  });

  it('sem planilha da plataforma, quem está em grupo segue cobrado — o print cai igual', () => {
    // `semPlanilha` mantém a cobrança de todo mundo em grupo (regra de 04/08).
    const lider = row('lider', {}, 'G1');
    const prints = [print('pr1', 'lider', 'SHOPEE', 'recebido')];
    expect(
      printsParaRecusarAoDesmarcar(lider, geral('SHOPEE'), prints, new Set(['SHOPEE'])),
    ).toEqual(['pr1']);
  });
});
