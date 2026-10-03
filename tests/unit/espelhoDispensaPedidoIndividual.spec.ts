/**
 * 🔴 BUG REAL (03/10/2026): na 1ª quinzena de setembro, 40 entregadores EM GRUPO e sem
 * pacote de Shopee ficaram com o "Espelho conferido" em branco depois da planilha da Shopee
 * — o caso que o Victor mandou foi a Celita, no grupo do João Gabriel (João 1.185 e Julio
 * 1.184 de Shopee marcados, ela com 0 e o grupo travado em "Espelho 2/3").
 *
 * A regra da dispensa (05/08/2026) foi escrita quando o pedido de print era o "pra todos"
 * (`driver_id` nulo), que alcança todo mundo em grupo. Três horas depois, no mesmo dia, o
 * pedido AUTOMÁTICO de depois da planilha passou a gravar pedido INDIVIDUAL — só de quem tem
 * pacote, de propósito (o "pra todos" voltaria a cobrar quem a equipe validou na mão). Com
 * isso, numa quinzena sem o clique manual em "pra todos", quem tem 0 nunca era alcançado por
 * pedido nenhum e a dispensa nunca valia. Agosto funcionou porque teve o clique manual; a 1ª
 * de setembro foi a primeira só com o automático (97 pedidos individuais em 28/09 13:03).
 *
 * Roda com: npx vitest run espelhoDispensaPedidoIndividual
 */
import { describe, it, expect } from 'vitest';
import {
  expectedProofPlatforms,
  plataformasDevidasNaVarredura,
  proofDispensadoSemPacote,
  type DriverRowData,
  type ProofRequest,
} from '../../src/components/driverpay/driverPayShared';
import {
  pagamentosParaDesmarcarPorDispensa,
  pagamentosParaMarcarPorDispensa,
  pedidosQueFaltamAoDesmarcar,
} from '../../src/utils/espelhoDispensa';

function row(driverId: string, pacotes: Record<string, number>, groupName: string | null): DriverRowData {
  return {
    paymentId: `pay-${driverId}`, driverId, name: driverId.toUpperCase(), route: null, groupName,
    routes: [{ route: '', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null, active: true, notaFiscal: false, espelhoConferido: false,
    espelhoConferidoBy: null, zapex: [], zapexRate: 0, carryover: 0,
  };
}

/** O que o pedido automático grava: uma linha por entregador COM pacote. */
const individual = (plataforma: string, ...driverIds: string[]): ProofRequest[] =>
  driverIds.map((driverId) => ({ platformName: plataforma, driverId }));

const COM_PLANILHA = new Set<string>();

// O grupo do print do Victor.
const joao = row('joao', { SHOPEE: 1185 }, 'CARATINGA - JOÃO GABRIEL FERREIRA');
const julio = row('julio', { SHOPEE: 1184 }, 'CARATINGA - JOÃO GABRIEL FERREIRA');
const celita = row('celita', {}, 'CARATINGA - JOÃO GABRIEL FERREIRA');
const pedidosDoAutomatico = individual('SHOPEE', 'joao', 'julio');

describe('dispensa quando a quinzena só tem pedido INDIVIDUAL (o do automático)', () => {
  it('🎯 caso da Celita: em grupo, 0 pacote, sem pedido próprio — está dispensada', () => {
    expect(proofDispensadoSemPacote(celita, pedidosDoAutomatico, COM_PLANILHA)).toEqual(['SHOPEE']);
  });

  it('🎯 a conta da varredura marca a Celita, e só ela', () => {
    const ids = pagamentosParaMarcarPorDispensa(
      [joao, julio, celita],
      (r) => expectedProofPlatforms(r, pedidosDoAutomatico, COM_PLANILHA),
      (r) => proofDispensadoSemPacote(r, pedidosDoAutomatico, COM_PLANILHA),
    );
    expect(ids).toEqual(['pay-celita']);
  });

  it('quem só roda eMile/Loggi também é dispensado da Shopee (como era em agosto)', () => {
    const romario = row('romario', { eMile: 1406, LOGGI: 189 }, 'CARATINGA - Romario');
    expect(proofDispensadoSemPacote(romario, pedidosDoAutomatico, COM_PLANILHA)).toEqual(['SHOPEE']);
  });

  it('quem tem pacote não é dispensado (deve o print)', () => {
    expect(proofDispensadoSemPacote(joao, pedidosDoAutomatico, COM_PLANILHA)).toEqual([]);
  });

  it('🔴 sem grupo continua de fora — o pedido de quinzena só alcança quem está em grupo', () => {
    const solto = row('solto', {}, null);
    expect(proofDispensadoSemPacote(solto, pedidosDoAutomatico, COM_PLANILHA)).toEqual([]);
  });

  it('🔴 sem pedido nenhum na quinzena: ninguém é dispensado (não inventa conferência)', () => {
    expect(proofDispensadoSemPacote(celita, [], COM_PLANILHA)).toEqual([]);
  });

  it('a dispensa é por plataforma: só vale na plataforma que foi pedida', () => {
    expect(proofDispensadoSemPacote(celita, individual('LOGGI', 'joao'), COM_PLANILHA)).toEqual(['LOGGI']);
  });

  it('🔴 planilha da plataforma ainda não chegou: não dispensa', () => {
    expect(proofDispensadoSemPacote(celita, pedidosDoAutomatico, new Set(['SHOPEE']))).toEqual([]);
  });

  it('pedido próprio continua valendo como antes (mesmo sem grupo)', () => {
    const solto = row('solto', {}, null);
    expect(proofDispensadoSemPacote(solto, individual('SHOPEE', 'solto'), COM_PLANILHA)).toEqual(['SHOPEE']);
  });
});

// ── A varredura inteira, nos dois sentidos, com só pedido individual ───────────
// Marcar quem tem 0 cria o caso inverso: se ele GANHA pacote depois (reimportação, célula
// editada), a marca 'auto' tem que cair e o app tem que voltar a pedir o print — e com só
// os pedidos do automático ele não tem pedido nenhum. Sem os dois pedaços abaixo, o
// conserto da marcação deixaria gente "conferida" sem conferência.
describe('varredura com só pedido individual — os dois sentidos', () => {
  const devidasDe = (pedidos: ProofRequest[]) => (r: DriverRowData) =>
    plataformasDevidasNaVarredura(r, pedidos, COM_PLANILHA);
  const alcancadasDe = (pedidos: ProofRequest[]) => (r: DriverRowData) =>
    expectedProofPlatforms(r, pedidos, COM_PLANILHA);
  const marcadoAuto = (r: DriverRowData): DriverRowData =>
    ({ ...r, espelhoConferido: true, espelhoConferidoBy: 'auto' });

  it('🎯 marca quem tem 0 e quem só roda eMile/Loggi; não marca quem deve print nem quem está sem grupo', () => {
    const romario = row('romario', { eMile: 1406, LOGGI: 189 }, 'CARATINGA - Romario');
    const solto = row('solto', {}, null);
    const ids = pagamentosParaMarcarPorDispensa(
      [joao, julio, celita, romario, solto],
      devidasDe(pedidosDoAutomatico),
      (r) => proofDispensadoSemPacote(r, pedidosDoAutomatico, COM_PLANILHA),
    );
    expect(ids).toEqual(['pay-celita', 'pay-romario']);
  });

  it('🔴 quem entrou no grupo depois da importação (tem pacote, sem pedido) DEVE print — nunca é marcado', () => {
    const novata = row('novata', { SHOPEE: 844 }, 'CARATINGA - JOÃO GABRIEL FERREIRA');
    expect(plataformasDevidasNaVarredura(novata, pedidosDoAutomatico, COM_PLANILHA)).toEqual(['SHOPEE']);
    expect(pagamentosParaMarcarPorDispensa(
      [novata],
      devidasDe(pedidosDoAutomatico),
      (r) => proofDispensadoSemPacote(r, pedidosDoAutomatico, COM_PLANILHA),
    )).toEqual([]);
  });

  it('sem grupo e sem pedido próprio: não deve (o pedido da quinzena não o alcança)', () => {
    const solto = row('solto', { SHOPEE: 10 }, null);
    expect(plataformasDevidasNaVarredura(solto, pedidosDoAutomatico, COM_PLANILHA)).toEqual([]);
  });

  it('🎯 marcada por estar com 0 e depois ganhou pacote: a marca auto cai', () => {
    const celitaComPacote = marcadoAuto(row('celita', { SHOPEE: 50 }, 'CARATINGA - JOÃO GABRIEL FERREIRA'));
    expect(pagamentosParaDesmarcarPorDispensa(
      [celitaComPacote], devidasDe(pedidosDoAutomatico), () => false,
    )).toEqual(['pay-celita']);
    // Prova de que o pedaço é necessário: com a conta antiga (só o pedido dela), ela
    // ficaria marcada sem print nenhum.
    expect(pagamentosParaDesmarcarPorDispensa(
      [celitaComPacote], alcancadasDe(pedidosDoAutomatico), () => false,
    )).toEqual([]);
  });

  it('🎯 desmarcada sem pedido que a alcance: o pedido de print dela é criado', () => {
    const celitaComPacote = row('celita', { SHOPEE: 50 }, 'CARATINGA - JOÃO GABRIEL FERREIRA');
    const faltam = pedidosQueFaltamAoDesmarcar(
      [joao, celitaComPacote], ['pay-celita'],
      devidasDe(pedidosDoAutomatico), alcancadasDe(pedidosDoAutomatico),
    );
    expect([...faltam.entries()]).toEqual([['SHOPEE', ['celita']]]);
  });

  it('quem já tem pedido próprio não ganha pedido repetido', () => {
    const comPedido = row('fabricio', { SHOPEE: 30 }, 'Santa Barbara -Fabricio');
    const pedidos = [...pedidosDoAutomatico, ...individual('SHOPEE', 'fabricio')];
    const faltam = pedidosQueFaltamAoDesmarcar(
      [comPedido], ['pay-fabricio'], devidasDe(pedidos), alcancadasDe(pedidos),
    );
    expect(faltam.size).toBe(0);
  });

  it('só quem foi desmarcado de verdade entra (a reconferência do banco pode ter segurado alguém)', () => {
    const celitaComPacote = row('celita', { SHOPEE: 50 }, 'CARATINGA - JOÃO GABRIEL FERREIRA');
    const faltam = pedidosQueFaltamAoDesmarcar(
      [celitaComPacote], [], devidasDe(pedidosDoAutomatico), alcancadasDe(pedidosDoAutomatico),
    );
    expect(faltam.size).toBe(0);
  });

  it('🔴 marcação de gente nunca é desfeita', () => {
    const humano = { ...row('celita', { SHOPEE: 50 }, 'CARATINGA - JOÃO GABRIEL FERREIRA'),
      espelhoConferido: true, espelhoConferidoBy: '2626' };
    expect(pagamentosParaDesmarcarPorDispensa(
      [humano], devidasDe(pedidosDoAutomatico), () => false,
    )).toEqual([]);
  });

  it('sem ping-pong: com 0 só marca, com pacote só desmarca', () => {
    const marcar = (r: DriverRowData) => pagamentosParaMarcarPorDispensa(
      [r], devidasDe(pedidosDoAutomatico), (x) => proofDispensadoSemPacote(x, pedidosDoAutomatico, COM_PLANILHA));
    const desmarcar = (r: DriverRowData) => pagamentosParaDesmarcarPorDispensa(
      [r], devidasDe(pedidosDoAutomatico), () => false);
    const zerada = marcadoAuto(row('celita', {}, 'G'));
    expect(desmarcar(zerada)).toEqual([]);                 // marcada e com 0: fica
    const comPacote = row('celita', { SHOPEE: 5 }, 'G');
    expect(marcar(comPacote)).toEqual([]);                 // desmarcada e com pacote: fica
  });
});
