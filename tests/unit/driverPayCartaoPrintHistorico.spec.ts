/**
 * Cartão de print para quem NÃO entrega a plataforma (22/09/2026, decisões do Victor).
 *
 * 🔴 O caso real que gerou isto: na 2ª quinzena de agosto, com o pedido geral da Shopee no
 * ar e a planilha ainda não importada, **31 pessoas sem um pacote de Shopee** viraram cartão
 * na tela do líder — e o print da **Greice** (1.132 pacotes) foi gravado no **Mikael**, que
 * tem 0 Shopee. O pagamento dele ficou "espelho conferido ✓" e o dela sem.
 *
 * Decisões dele (22/09), todas as três na opção (a):
 *   1) conta como "já entregou" quem entregou naquela plataforma nas **últimas 2 quinzenas**;
 *   2) **entregador novo**, sem histórico em nada, **não é cobrado** (espera a planilha);
 *   3) no painel ele aparece com **selo cinza próprio**, não com traço mudo.
 *
 * O último `describe` roda a conta do PAINEL lado a lado com a da EDGE FUNCTION (a tela do
 * entregador), pra as duas nunca divergirem em silêncio.
 *
 * Roda com: npx vitest run driverPayCartaoPrintHistorico
 */
import { describe, it, expect } from 'vitest';
import {
  expectedProofPlatforms,
  proofForaPorSemHistorico,
  plataformasSemPlanilha,
  type DriverRowData,
  type ProofRequest,
} from '../../src/components/driverpay/driverPayShared';
import { deveCobrarPrint } from '../../supabase/functions/_shared/proofCards';

function row(driverId: string, pacotes: Record<string, number>, groupName: string | null): DriverRowData {
  return {
    paymentId: `pay-${driverId}`, driverId, name: driverId.toUpperCase(), route: '', groupName,
    routes: [{ route: '', packages: pacotes, packageIds: {}, rates: {} }],
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null, active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}
const geral = (...plats: string[]): ProofRequest[] => plats.map((p) => ({ platformName: p, driverId: null }));
const soDe = (driverId: string, plat: string): ProofRequest[] => [{ platformName: plat, driverId }];
/** Histórico: entregador -> plataformas que ele rodou nas últimas 2 quinzenas. */
const hist = (m: Record<string, string[]>): Map<string, Set<string>> =>
  new Map(Object.entries(m).map(([k, v]) => [k, new Set(v)]));

const SEM_SHOPEE = new Set(['SHOPEE']); // planilha da Shopee ainda não chegou

describe('🎯 o caso real: 31 cartões na tela do líder', () => {
  /** Grupo da Greice: só ela roda Shopee; os outros 5 nunca rodaram. */
  const grupo = [
    row('greice', {}, 'Grupo Greice'),
    row('mikael', {}, 'Grupo Greice'),
    row('cloves', {}, 'Grupo Greice'),
    row('camilli', {}, 'Grupo Greice'),
    row('adriano', {}, 'Grupo Greice'),
    row('jonas', {}, 'Grupo Greice'),
  ];
  const historico = hist({
    greice: ['SHOPEE'],
    mikael: ['eMile'], cloves: ['eMile'], camilli: ['ANJUN'],
    adriano: ['LOGGI'], jonas: ['eMile', 'ANJUN'],
  });

  it('sem a planilha, só a Greice recebe cartão de Shopee (era o grupo inteiro)', () => {
    const cobrados = grupo
      .filter((r) => expectedProofPlatforms(r, geral('SHOPEE'), SEM_SHOPEE, historico).length > 0)
      .map((r) => r.driverId);
    expect(cobrados).toEqual(['greice']);
  });

  it('quem ficou de fora tem o selo, não um traço mudo', () => {
    expect(proofForaPorSemHistorico(grupo[1], geral('SHOPEE'), SEM_SHOPEE, historico)).toEqual(['SHOPEE']);
    // Quem é cobrado não tem selo de "fora" nenhum.
    expect(proofForaPorSemHistorico(grupo[0], geral('SHOPEE'), SEM_SHOPEE, historico)).toEqual([]);
  });

  it('o Mikael sem histórico de Shopee não é cobrado, então o print dela não cabe nele', () => {
    expect(expectedProofPlatforms(grupo[1], geral('SHOPEE'), SEM_SHOPEE, historico)).toEqual([]);
  });
});

describe('pedido individual continua valendo sem histórico', () => {
  it('o operador escolheu a pessoa de propósito: cobra mesmo sem histórico', () => {
    const r = row('mikael', {}, 'Grupo Greice');
    const historico = hist({ mikael: ['eMile'] });
    expect(expectedProofPlatforms(r, soDe('mikael', 'SHOPEE'), SEM_SHOPEE, historico)).toEqual(['SHOPEE']);
  });

  it('pedido individual não vira selo de "fora"', () => {
    const r = row('mikael', {}, 'Grupo Greice');
    const historico = hist({ mikael: ['eMile'] });
    const reqs = [...geral('SHOPEE'), ...soDe('mikael', 'SHOPEE')];
    expect(proofForaPorSemHistorico(r, reqs, SEM_SHOPEE, historico)).toEqual([]);
  });

  it('🔴 mas pedido individual NÃO passa a cobrar quem a planilha mostrou sem pacote', () => {
    // Regra de antes, que não pode mudar: planilha na mão + 0 pacote = não cobra.
    const r = row('mikael', { eMile: 40 }, 'Grupo Greice');
    expect(expectedProofPlatforms(r, soDe('mikael', 'SHOPEE'), new Set(), hist({}))).toEqual([]);
  });
});

describe('entregador novo, sem histórico em nada (decisão 2a: não cobra)', () => {
  const novo = row('recem', {}, 'Grupo Greice');

  it('sem planilha, não recebe cartão', () => {
    expect(expectedProofPlatforms(novo, geral('SHOPEE'), SEM_SHOPEE, hist({}))).toEqual([]);
  });

  it('🎯 e NÃO fica esquecido: com a planilha e pacote, volta a ser cobrado', () => {
    const comPacote = row('recem', { SHOPEE: 120 }, 'Grupo Greice');
    const semPlanilha = plataformasSemPlanilha([comPacote], ['SHOPEE']); // vazio: planilha chegou
    expect(expectedProofPlatforms(comPacote, geral('SHOPEE'), semPlanilha, hist({}))).toEqual(['SHOPEE']);
  });
});

describe('o que NÃO pode mudar', () => {
  it('planilha já importada: quem tem pacote é cobrado, histórico ou não', () => {
    const r = row('ana', { SHOPEE: 300 }, 'G1');
    expect(expectedProofPlatforms(r, geral('SHOPEE'), new Set(), hist({}))).toEqual(['SHOPEE']);
  });

  it('planilha já importada: quem não tem pacote não é cobrado, mesmo com histórico', () => {
    const r = row('ana', { eMile: 10 }, 'G1');
    expect(expectedProofPlatforms(r, geral('SHOPEE'), new Set(), hist({ ana: ['SHOPEE'] }))).toEqual([]);
  });

  it('sem grupo continua fora do pedido "pra todos", mesmo com histórico', () => {
    const avulso = row('marcos', {}, null);
    expect(expectedProofPlatforms(avulso, geral('SHOPEE'), SEM_SHOPEE, hist({ marcos: ['SHOPEE'] }))).toEqual([]);
  });

  it('a planilha de uma plataforma não mexe na regra da outra', () => {
    // LOGGI importada (tem pacote), SHOPEE não. Ele tem histórico só de LOGGI.
    const r = row('ana', { LOGGI: 200 }, 'G1');
    const sem = plataformasSemPlanilha([r], ['SHOPEE', 'LOGGI']);
    expect([...sem]).toEqual(['SHOPEE']);
    expect(expectedProofPlatforms(r, geral('SHOPEE', 'LOGGI'), sem, hist({ ana: ['LOGGI'] })))
      .toEqual(['LOGGI']);
  });

  it('lançamento manual sem planilha conta como entrega (cobra mesmo sem histórico)', () => {
    const r = row('angelo', { SHOPEE: 678 }, 'G1');
    // A planilha não chegou pra mais ninguém, mas ele tem pacote digitado na mão.
    expect(expectedProofPlatforms(r, geral('SHOPEE'), SEM_SHOPEE, hist({}))).toEqual(['SHOPEE']);
  });

  it('histórico não carregado (undefined) mantém o comportamento antigo', () => {
    // Se a consulta do histórico falhar, é melhor cobrar demais (como até 21/09) do que
    // deixar de cobrar todo mundo em silêncio.
    const r = row('mikael', {}, 'G1');
    expect(expectedProofPlatforms(r, geral('SHOPEE'), SEM_SHOPEE)).toEqual(['SHOPEE']);
    expect(proofForaPorSemHistorico(r, geral('SHOPEE'), SEM_SHOPEE, undefined)).toEqual([]);
  });
});

describe('🔒 painel × tela do entregador: a mesma conta nos dois lados', () => {
  /** Toda combinação que importa, e o que cada lado responde pra ela. */
  const casos: Array<{
    nome: string; pacotes: Record<string, number>; grupo: string | null;
    reqs: ProofRequest[]; sem: Set<string>; historico: Map<string, Set<string>>;
  }> = [
    { nome: 'sem planilha, com histórico', pacotes: {}, grupo: 'G1', reqs: geral('SHOPEE'), sem: SEM_SHOPEE, historico: hist({ x: ['SHOPEE'] }) },
    { nome: 'sem planilha, sem histórico', pacotes: {}, grupo: 'G1', reqs: geral('SHOPEE'), sem: SEM_SHOPEE, historico: hist({ x: ['eMile'] }) },
    { nome: 'sem planilha, sem histórico, pedido individual', pacotes: {}, grupo: 'G1', reqs: soDe('x', 'SHOPEE'), sem: SEM_SHOPEE, historico: hist({}) },
    { nome: 'sem planilha, sem grupo, com histórico', pacotes: {}, grupo: null, reqs: geral('SHOPEE'), sem: SEM_SHOPEE, historico: hist({ x: ['SHOPEE'] }) },
    { nome: 'planilha chegada, com pacote', pacotes: { SHOPEE: 10 }, grupo: 'G1', reqs: geral('SHOPEE'), sem: new Set(), historico: hist({}) },
    { nome: 'planilha chegada, sem pacote, com histórico', pacotes: { eMile: 10 }, grupo: 'G1', reqs: geral('SHOPEE'), sem: new Set(), historico: hist({ x: ['SHOPEE'] }) },
    { nome: 'planilha chegada, sem pacote, pedido individual', pacotes: { eMile: 10 }, grupo: 'G1', reqs: soDe('x', 'SHOPEE'), sem: new Set(), historico: hist({ x: ['SHOPEE'] }) },
    { nome: 'ninguém pediu nada', pacotes: { SHOPEE: 10 }, grupo: 'G1', reqs: [], sem: new Set(), historico: hist({ x: ['SHOPEE'] }) },
    { nome: 'pacote lançado na mão sem planilha', pacotes: { SHOPEE: 678 }, grupo: 'G1', reqs: geral('SHOPEE'), sem: SEM_SHOPEE, historico: hist({}) },
  ];

  for (const c of casos) {
    it(`${c.nome}: painel e portal concordam`, () => {
      const r = row('x', c.pacotes, c.grupo);
      const painel = expectedProofPlatforms(r, c.reqs, c.sem, c.historico).includes('SHOPEE');
      const portal = deveCobrarPrint({
        praTodos: c.reqs.some((q) => q.platformName === 'SHOPEE' && q.driverId === null) && c.grupo !== null,
        soPraEle: c.reqs.some((q) => q.platformName === 'SHOPEE' && q.driverId === 'x'),
        temPacote: (c.pacotes.SHOPEE ?? 0) > 0,
        semPlanilha: c.sem.has('SHOPEE'),
        entregouAntes: c.historico.get('x')?.has('SHOPEE') === true,
      });
      expect(portal).toBe(painel);
    });
  }
});
