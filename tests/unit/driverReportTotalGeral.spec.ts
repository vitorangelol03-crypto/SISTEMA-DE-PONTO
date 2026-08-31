/**
 * TOTAL GERAL do relatório Excel — valor CACHEADO junto com a fórmula (31/08/2026).
 *
 * Relato do Victor (20/08/2026, print da planilha): "a coluna do valor da linha TOTAL GERAL
 * às vezes sai em branco" no arquivo exportado da aba Pagamentos Driver.
 *
 * Causa raiz: a célula de total era gravada só como `{ f: 'SUM(...)' }`. O SheetJS grava
 * `<f>` SEM `<v>` (valor calculado), e quem NÃO recalcula fórmula ao abrir — prévia do
 * WhatsApp/Gmail/Drive, QuickLook do iPhone, vários apps de planilha do Android — mostra a
 * célula VAZIA. Excel de PC e Google Sheets recalculam ao abrir, por isso "às vezes".
 * Prova empírica (31/08, node + xlsx-js-style): `{ f }` → `<c r="A3"><f>SUM(A1:A2)</f></c>`
 * (sem <v>, e o próprio XLSX.read nem devolve a célula); `{ t:'n', f, v:3 }` →
 * `<f>SUM(A1:A2)</f><v>3</v>` e lê de volta v=3.
 *
 * O que estes testes trancam: TODA célula de total tem `v` numérico igual à soma real das
 * linhas E mantém a fórmula `f` (a planilha continua viva se alguém editar um valor no
 * Excel). O roundtrip escrever→ler prova que o valor sobrevive no ARQUIVO, não só no objeto.
 *
 * Roda com: npx vitest run driverReportTotalGeral
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import {
  buildGeneralSheet,
  buildGroupSheet,
  buildSimpleSheet,
  type DriverReportMeta,
  type DriverReportRow,
} from '../../src/utils/driverReport';

const META: DriverReportMeta = {
  companyName: 'CD Logistica — Caratinga',
  periodLabel: '2a Quinzena de Agosto / 2026',
  platforms: ['SHOPEE', 'eMile'],
  generatedAt: '31/08/2026 09:00',
  dataPagamento: '31/08/2026',
};

// Valores com centavos de propósito (soma em ponto flutuante) e um total negativo.
const ROWS: DriverReportRow[] = [
  {
    name: 'Adao Jose', route: 'Caratinga', group: 'Grupo A',
    platforms: { SHOPEE: { packages: 100, value: 210.1 }, eMile: { packages: 10, value: 33.3 } },
    totalPackages: 243.4, discount: 10.55, vale: 0, totalToReceive: 232.85, pixKey: '123.456.789-09',
  },
  {
    name: 'Bia Souza', route: 'Entre Folhas', group: 'Grupo A',
    platforms: { SHOPEE: { packages: 50, value: 105.05 } },
    totalPackages: 105.05, discount: 0, vale: 120, totalToReceive: -14.95, pixKey: 'bia@email.com',
  },
  {
    name: 'Caio Lima', route: 'Mutum', group: '',
    platforms: { eMile: { packages: 7, value: 23.31 } },
    totalPackages: 23.31, discount: 1.2, vale: 0, totalToReceive: 22.11, pixKey: null,
  },
];

const soma = (pick: (r: DriverReportRow) => number) => ROWS.reduce((acc, r) => acc + pick(r), 0);
const plat = (r: DriverReportRow, p: string) => r.platforms[p] ?? { packages: 0, value: 0 };

type Cel = { t?: string; v?: unknown; f?: string } | undefined;
const cel = (ws: XLSX.WorkSheet, r: number, c: number): Cel =>
  ws[XLSX.utils.encode_cell({ r, c })] as Cel;

/** Escreve o workbook em memória e lê de volta — o que o visualizador do celular enxerga. */
function roundtrip(ws: XLSX.WorkSheet, nome: string): XLSX.WorkSheet {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nome);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
  return XLSX.read(buf, { type: 'buffer' }).Sheets[nome];
}

/** A célula de total precisa ter fórmula viva + valor numérico cacheado igual à soma. */
function esperaTotal(c: Cel, esperado: number, rotulo: string) {
  expect(c, `${rotulo}: célula existe`).toBeDefined();
  expect(c?.f, `${rotulo}: mantém a fórmula`).toMatch(/^SUM\(/);
  expect(c?.t, `${rotulo}: tipo numérico`).toBe('n');
  expect(typeof c?.v, `${rotulo}: valor cacheado é número`).toBe('number');
  expect(c?.v as number, `${rotulo}: valor = soma das linhas`).toBeCloseTo(esperado, 6);
}

describe('Relatório Geral — linha TOTAL GERAL', () => {
  // Layout de buildGeneralSheet: R_DATA = 5; colunas 3+2i (pacotes) e 4+2i (valor) por
  // plataforma; depois TOTAL PACOTES, DESCONTO, VALE, TOTAL A RECEBER, PIX.
  const ws = buildGeneralSheet(ROWS, META);
  const R_TOTAL = 5 + ROWS.length;
  const tail = 3 + META.platforms.length * 2;

  it('🎯 rótulo da linha é TOTAL GERAL', () => {
    expect(String(cel(ws, R_TOTAL, 0)?.v)).toMatch(/^TOTAL GERAL/);
  });

  it('🔴 toda coluna de total tem fórmula E valor cacheado (a causa do "em branco")', () => {
    esperaTotal(cel(ws, R_TOTAL, 3), soma((r) => plat(r, 'SHOPEE').packages), 'SHOPEE pacotes');
    esperaTotal(cel(ws, R_TOTAL, 4), soma((r) => plat(r, 'SHOPEE').value), 'SHOPEE valor');
    esperaTotal(cel(ws, R_TOTAL, 5), soma((r) => plat(r, 'eMile').packages), 'eMile pacotes');
    esperaTotal(cel(ws, R_TOTAL, 6), soma((r) => plat(r, 'eMile').value), 'eMile valor');
    esperaTotal(cel(ws, R_TOTAL, tail), soma((r) => r.totalPackages), 'TOTAL PACOTES');
    esperaTotal(cel(ws, R_TOTAL, tail + 1), soma((r) => r.discount), 'DESCONTO');
    esperaTotal(cel(ws, R_TOTAL, tail + 2), soma((r) => r.vale), 'VALE');
    esperaTotal(cel(ws, R_TOTAL, tail + 3), soma((r) => r.totalToReceive), 'TOTAL A RECEBER');
  });

  it('🔴 o valor sobrevive no ARQUIVO (escreve e lê de volta, como o celular faz)', () => {
    const lido = roundtrip(ws, 'Relatorio Geral');
    const total = cel(lido, R_TOTAL, tail + 3);
    expect(total?.f).toMatch(/^SUM\(/);
    expect(total?.v as number).toBeCloseTo(soma((r) => r.totalToReceive), 6);
  });

  it('sem linhas, o total é 0 numérico (não fórmula vazia)', () => {
    const vazio = buildGeneralSheet([], META);
    const c = cel(vazio, 5, tail + 3);
    expect(c?.v).toBe(0);
    expect(c?.f).toBeUndefined();
  });
});

describe('Aba "Por Grupo" — linha TOTAL GERAL', () => {
  // Layout de buildGroupSheet: R_DATA = 3; colunas 1 Nº DRIVERS, 2 TOTAL PACOTES,
  // 3 DESCONTO, 4 VALE, 5 TOTAL A RECEBER. Grupos: "Grupo A" e "Sem grupo".
  const ws = buildGroupSheet(ROWS, META);
  const R_TOTAL = 3 + 2;

  it('🔴 toda coluna de total tem fórmula E valor cacheado', () => {
    esperaTotal(cel(ws, R_TOTAL, 1), ROWS.length, 'Nº DRIVERS');
    esperaTotal(cel(ws, R_TOTAL, 2), soma((r) => r.totalPackages), 'TOTAL PACOTES');
    esperaTotal(cel(ws, R_TOTAL, 3), soma((r) => r.discount), 'DESCONTO');
    esperaTotal(cel(ws, R_TOTAL, 4), soma((r) => r.vale), 'VALE');
    esperaTotal(cel(ws, R_TOTAL, 5), soma((r) => r.totalToReceive), 'TOTAL A RECEBER');
  });

  it('🔴 o valor sobrevive no ARQUIVO', () => {
    const lido = roundtrip(ws, 'Por Grupo');
    expect(cel(lido, R_TOTAL, 5)?.v as number).toBeCloseTo(soma((r) => r.totalToReceive), 6);
  });
});

describe('Relatório Simples (formato do banco) — linha TOTAL GERAL', () => {
  // Layout de buildSimpleSheet: R_DATA = 4; C = VALOR. Com 2 linhas o total fica em C7.
  const LINHAS = [
    { name: 'ADAO JOSE', total: 1234.5, pix: '123.456.789-09' },
    { name: 'BIA SOUZA', total: 987.65, pix: 'bia@email.com' },
  ];
  const ws = buildSimpleSheet(LINHAS, META);

  it('🔴 C7 tem fórmula E valor cacheado = soma', () => {
    esperaTotal(ws['C7'] as Cel, 1234.5 + 987.65, 'TOTAL GERAL simples');
    expect(ws['A7']?.v).toBe('TOTAL GERAL');
  });

  it('🔴 o valor sobrevive no ARQUIVO', () => {
    const lido = roundtrip(ws, 'Relatorio Simples');
    expect((lido['C7'] as Cel)?.v as number).toBeCloseTo(2222.15, 6);
  });

  it('sem linhas, o total é 0 numérico', () => {
    const vazio = buildSimpleSheet([], META);
    expect(vazio['C5']?.v).toBe(0);
    expect((vazio['C5'] as Cel)?.f).toBeUndefined();
  });
});
