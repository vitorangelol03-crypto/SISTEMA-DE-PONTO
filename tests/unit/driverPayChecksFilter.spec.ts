/**
 * Filtro "pagar só quem já está conferido" nos relatórios (04/08/2026, decisões do Victor):
 *   1) desmarcado = NADA muda (o arquivo sai idêntico ao de sempre) — é a regressão que importa;
 *   2) "espelho conferido" e "nota validada" são independentes e podem somar;
 *   3) 🎯 REGRA "PAGA O RESTO": num grupo de 10 com 1 pendente, o líder CONTINUA recebendo
 *      pelos 9 — o grupo só some do relatório quando ninguém dele passa. Segurar 9 pessoas
 *      por causa de 1 foi explicitamente recusado pelo Victor.
 *
 * Roda com: npx vitest run driverPayChecksFilter
 */
import { describe, it, expect } from 'vitest';
import {
  applyChecksFilter,
  buildSimpleReportRows,
  buildLeaderReportRows,
  type DriverRowData,
} from '../../src/components/driverpay/driverPayShared';
import type { DriverPlatform } from '../../src/services/driverPay';

function plat(name: string, rate = 2): DriverPlatform {
  return {
    id: `p-${name}`, company_id: 'c', name, default_rate: rate, sort_order: 0, active: true,
    color: null, highlight_mirror: false, mirror_notice: null, mirror_separate_value: false, nota_emitter_id: null,
  } as unknown as DriverPlatform;
}
const PLAT = [plat('SHOPEE')];

/** Uma linha simples: 100 pacotes SHOPEE a R$ 2 = R$ 200 por driver. */
function row(
  paymentId: string, name: string, groupName: string | null,
  flags: { espelho?: boolean } = {},
): DriverRowData {
  return {
    paymentId, driverId: `d-${paymentId}`, name, route: null, groupName,
    routes: [{ route: 'R1', packages: { SHOPEE: 100 }, packageIds: {}, rates: {} }],
    // A taxa tem que vir do row: computeRowTotals não conhece as plataformas (cai em 0 sem isto).
    ratesByPlatform: { SHOPEE: 2 }, discounts: [], vales: [], pixKey: 'pix', recebedorNome: null, recebedorPix: null,
    cpf: null, phone: null, active: true, notaFiscal: false,
    espelhoConferido: flags.espelho === true, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

/** Líder + 9 membros; por padrão só o líder está conferido. */
function grupoDe10(conferidos: string[]): DriverRowData[] {
  const nomes = ['Anderson', 'Bruna', 'Carlos', 'Douglas', 'Elaine', 'Fabio', 'Gabriel', 'Helena', 'Igor', 'Juliana'];
  return nomes.map((n) => row(`p-${n}`, n, 'Grupo Anderson', { espelho: conferidos.includes(n) }));
}
const LIDERES = new Map([['Grupo Anderson', 'Anderson']]);
const NF_NENHUMA = new Map<string, boolean>();

describe('applyChecksFilter — pagar só quem já está conferido', () => {
  it('sem filtro nenhum, devolve TUDO e não inventa exclusão (regressão)', () => {
    const rows = grupoDe10([]);
    const r = applyChecksFilter(rows, NF_NENHUMA, LIDERES, {});
    expect(r.kept).toBe(rows); // mesma referência: nem copiou
    expect(r.removed).toHaveLength(0);
    expect(r.recipientsAfter).toBe(r.recipientsBefore);
  });

  it('espelho: mantém quem está conferido e lista quem saiu, com o motivo', () => {
    const rows = [row('p1', 'Ana', null, { espelho: true }), row('p2', 'Bia', null)];
    const r = applyChecksFilter(rows, NF_NENHUMA, LIDERES, { onlyEspelhoConferido: true });
    expect(r.kept.map((x) => x.name)).toEqual(['Ana']);
    expect(r.removed).toEqual([
      { paymentId: 'p2', name: 'Bia', group: null, reason: 'espelho' },
    ]);
  });

  it('nota: usa o mapa de fora, sem adivinhar nada do row', () => {
    const rows = [row('p1', 'Ana', null), row('p2', 'Bia', null)];
    const nf = new Map([['p1', true], ['p2', false]]);
    const r = applyChecksFilter(rows, nf, LIDERES, { onlyNfValidada: true });
    expect(r.kept.map((x) => x.name)).toEqual(['Ana']);
    expect(r.removed[0].reason).toBe('nota');
  });

  it('os dois juntos: quem falta os dois sai marcado como "ambos"', () => {
    const rows = [
      row('p1', 'Ana', null, { espelho: true }),   // nota ok  -> fica
      row('p2', 'Bia', null, { espelho: true }),   // sem nota -> sai por nota
      row('p3', 'Cida', null),                     // sem nada -> sai por ambos
    ];
    const nf = new Map([['p1', true], ['p2', false], ['p3', false]]);
    const r = applyChecksFilter(rows, nf, LIDERES, { onlyEspelhoConferido: true, onlyNfValidada: true });
    expect(r.kept.map((x) => x.name)).toEqual(['Ana']);
    expect(r.removed.map((x) => `${x.name}:${x.reason}`)).toEqual(['Bia:nota', 'Cida:ambos']);
  });

  it('🎯 grupo de 10 com 1 pendente: o líder CONTINUA recebendo pelos 9', () => {
    const rows = grupoDe10(['Anderson', 'Bruna', 'Carlos', 'Douglas', 'Elaine', 'Fabio', 'Helena', 'Igor', 'Juliana']);
    const r = applyChecksFilter(rows, NF_NENHUMA, LIDERES, { onlyEspelhoConferido: true });

    expect(r.kept).toHaveLength(9);
    expect(r.removed.map((x) => x.name)).toEqual(['Gabriel']);
    expect(r.removed[0].group).toBe('Grupo Anderson');
    // A linha do recebedor NÃO some — é o ponto da decisão.
    expect(r.recipientsBefore).toBe(1);
    expect(r.recipientsAfter).toBe(1);

    // E o dinheiro acompanha: 9 × 100 pacotes × R$ 2 = R$ 1.800 (em vez dos R$ 2.000).
    const [linha] = buildSimpleReportRows(r.kept, LIDERES);
    expect(linha.name).toBe('Anderson');
    expect(linha.total).toBe(1800);
  });

  it('grupo em que NINGUÉM passa: aí sim a linha do recebedor some', () => {
    const rows = grupoDe10([]);
    const r = applyChecksFilter(rows, NF_NENHUMA, LIDERES, { onlyEspelhoConferido: true });
    expect(r.kept).toHaveLength(0);
    expect(r.recipientsBefore).toBe(1);
    expect(r.recipientsAfter).toBe(0);
    expect(buildSimpleReportRows(r.kept, LIDERES)).toHaveLength(0);
  });

  it('conta os recebedores certo quando um grupo some e um avulso fica', () => {
    const rows = [...grupoDe10([]), row('p-solo', 'Solo', null, { espelho: true })];
    const r = applyChecksFilter(rows, NF_NENHUMA, LIDERES, { onlyEspelhoConferido: true });
    expect(r.recipientsBefore).toBe(2); // grupo + avulso
    expect(r.recipientsAfter).toBe(1);  // só o avulso
    expect(r.removed).toHaveLength(10);
  });

  it('o relatório GERAL enxerga o mesmo corte que o simples', () => {
    const rows = grupoDe10(['Anderson', 'Bruna']);
    const r = applyChecksFilter(rows, NF_NENHUMA, LIDERES, { onlyEspelhoConferido: true });
    const geral = buildLeaderReportRows(r.kept, PLAT, LIDERES);
    // 1 unidade (o líder), 1 rota -> 1 linha, com os pacotes dos 2 que passaram.
    expect(geral).toHaveLength(1);
    expect(geral[0].name).toBe('Anderson');
    expect(geral[0].platforms.SHOPEE.packages).toBe(200);
  });
});
