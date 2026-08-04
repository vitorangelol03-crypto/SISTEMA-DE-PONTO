/**
 * Import de planilha: plataforma nao cadastrada TRAVA, e so ENTREGA/COLETA sao pagas.
 *
 * Caso real que originou os dois (04/08/2026): a planilha da Shopee trouxe 1.600
 * COLETAS. O leitor classificou certo como "Coleta Shopee", mas essa plataforma nao
 * existia na empresa — o import gravou com **taxa 0,00** e a grade, que so desenha
 * coluna de plataforma cadastrada, **escondeu os pacotes**. Ninguem viu; so apareceu
 * conferindo o banco. A mesma planilha trazia 1 linha "DEVOLUCAO" que caia no `else`
 * e era **paga como entrega**.
 */
import { describe, it, expect } from 'vitest';
import { missingImportPlatforms, type ImportResolvedItem } from '../../src/utils/driverImportApply';
import { parseDriverSheetData } from '../../src/utils/driverSheetImport';

const item = (platform: string, packages: number, ignore = false): ImportResolvedItem => ({
  driverRaw: `raw-${platform}-${packages}`,
  aliasNorm: 'x',
  city: 'Caratinga',
  platform,
  packages,
  resolution: ignore ? { kind: 'ignore' } : { kind: 'existing', driverId: 'd1', driverName: 'D', learnAlias: false },
});

describe('missingImportPlatforms — a trava do import', () => {
  it('nao acusa nada quando todas as plataformas existem', () => {
    const itens = [item('SHOPEE', 100), item('Coleta Shopee', 50)];
    expect(missingImportPlatforms(itens, ['SHOPEE', 'Coleta Shopee', 'eMile'])).toEqual([]);
  });

  it('acusa a plataforma que falta, somando os pacotes dela', () => {
    const itens = [item('SHOPEE', 1000), item('Coleta Shopee', 634), item('Coleta Shopee', 509)];
    expect(missingImportPlatforms(itens, ['SHOPEE'])).toEqual([{ name: 'Coleta Shopee', packages: 1143 }]);
  });

  it('linha marcada como IGNORAR nao trava o import (ela nao vai ser gravada)', () => {
    const itens = [item('SHOPEE', 1000), item('Coleta Shopee', 634, true)];
    expect(missingImportPlatforms(itens, ['SHOPEE'])).toEqual([]);
  });

  it('ordena da que tem mais pacotes para a que tem menos', () => {
    const itens = [item('Nova A', 10), item('Nova B', 900)];
    const r = missingImportPlatforms(itens, []);
    expect(r.map((x) => x.name)).toEqual(['Nova B', 'Nova A']);
  });

  it('compara por nome EXATO — e assim que a taxa e resolvida no apply', () => {
    // "coleta shopee" (minusculo) nao e a mesma linha de cadastro que "Coleta Shopee":
    // deixar passar por semelhanca traria de volta o bug da taxa zero.
    expect(missingImportPlatforms([item('Coleta Shopee', 5)], ['coleta shopee'])).toEqual([
      { name: 'Coleta Shopee', packages: 5 },
    ]);
  });

  it('empresa sem nenhuma plataforma cadastrada acusa tudo', () => {
    const itens = [item('SHOPEE', 3), item('Coleta Shopee', 2)];
    expect(missingImportPlatforms(itens, []).map((x) => x.name).sort()).toEqual(['Coleta Shopee', 'SHOPEE']);
  });
});

/** Cabecalho minimo da planilha da Shopee (o detector exige estas 3 colunas). */
const HEAD = ['Tipo do Serviço', 'Driver Name', 'Cidade Entrega', '3PL Tracking Number'];

describe('Shopee: so ENTREGA e COLETA sao pagas (regra do Victor, 04/08/2026)', () => {
  it('DEVOLUCAO fica de fora e aparece contada — antes era paga como entrega', () => {
    const r = parseDriverSheetData([
      HEAD,
      ['ENTREGA', '111-Fulano', 'Caratinga', 'T1'],
      ['ENTREGA', '111-Fulano', 'Caratinga', 'T2'],
      ['COLETA', '111-Fulano', 'Caratinga', 'T3'],
      ['DEVOLUÇÃO', '111-Fulano', 'Caratinga', 'T4'],
    ]);
    expect(r.totalPackages).toBe(3); // 2 entregas + 1 coleta — a devolucao NAO entra
    expect(r.ignored).toEqual([{ type: 'DEVOLUÇÃO', rows: 1 }]);
    expect(r.warnings.some((w) => /DEVOLUÇÃO/.test(w))).toBe(true);
    const plataformas = r.rows.map((x) => x.platform).sort();
    expect(plataformas).toEqual(['Coleta Shopee', 'SHOPEE']);
  });

  it('conta cada tipo descartado separadamente, do maior para o menor', () => {
    const r = parseDriverSheetData([
      HEAD,
      ['ENTREGA', '111-Fulano', 'Caratinga', 'T1'],
      ['DEVOLUÇÃO', '111-Fulano', 'Caratinga', 'T2'],
      ['REVERSA', '111-Fulano', 'Caratinga', 'T3'],
      ['REVERSA', '111-Fulano', 'Caratinga', 'T4'],
    ]);
    expect(r.totalPackages).toBe(1);
    expect(r.ignored).toEqual([
      { type: 'REVERSA', rows: 2 },
      { type: 'DEVOLUÇÃO', rows: 1 },
    ]);
  });

  it('planilha so com ENTREGA e COLETA nao gera aviso de descarte', () => {
    const r = parseDriverSheetData([
      HEAD,
      ['ENTREGA', '111-Fulano', 'Caratinga', 'T1'],
      ['COLETA', '111-Fulano', 'Caratinga', 'T2'],
    ]);
    expect(r.ignored).toEqual([]);
    expect(r.totalPackages).toBe(2);
  });

  it('acento e caixa nao mudam nada: "Entrega"/"coleta" contam igual', () => {
    const r = parseDriverSheetData([
      HEAD,
      ['Entrega', '111-Fulano', 'Caratinga', 'T1'],
      ['coleta', '111-Fulano', 'Caratinga', 'T2'],
    ]);
    expect(r.ignored).toEqual([]);
    expect(r.totalPackages).toBe(2);
  });

  it('linha com tipo em branco fica de fora e e rotulada', () => {
    const r = parseDriverSheetData([
      HEAD,
      ['ENTREGA', '111-Fulano', 'Caratinga', 'T1'],
      ['', '111-Fulano', 'Caratinga', 'T2'],
    ]);
    expect(r.totalPackages).toBe(1);
    expect(r.ignored).toEqual([{ type: '(sem tipo)', rows: 1 }]);
  });
});
