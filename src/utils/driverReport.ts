/* eslint-disable @typescript-eslint/no-explicit-any -- xlsx-js-style typings são incompletos pra cell styling/workbook; manter any com escopo limitado a util de export (mesmo precedente aprovado de c6Export.ts:1). */
/**
 * Relatório geral do período — aba "Pagamentos Driver" (iMile CTGA / CD Logística).
 *
 * Duas saídas, ambas puras de apresentação (recebem os dados já calculados pelo
 * serviço `driverPay.ts` — este módulo NÃO recalcula dinheiro nem toca no banco):
 *
 *   1. Excel (primário)  — xlsx-js-style, uma linha por driver, colunas por plataforma
 *      geradas dinamicamente a partir de `meta.platforms`, linha TOTAL GERAL com
 *      fórmulas SUM em célula, aba opcional "Por Grupo". Idioma copiado de
 *      `c6Export.ts` (helpers de estilo, formato de moeda `z`, `!freeze`,
 *      `!autofilter`, `writeFile { cellStyles:true }`).
 *   2. PDF (opção)       — jsPDF landscape + jspdf-autotable, TOTAL GERAL em verde.
 *      Idioma copiado de `holeritePdf.ts` / `mirrorPdf.ts` (cores em array numérico,
 *      `foot` verde, cast tipado pra ler `finalY`, `doc.output('blob')` / `doc.save`).
 *
 * Contrato de dados: `total_packages_amount` (TOTAL PACOTES em R$) e `total_net`
 * (TOTAL A RECEBER, que PODE ser negativo) vêm prontos do serviço — fonte única da
 * fórmula `total_net = Σ(packages*rate) − Σ(descontos) − Σ(vales)`.
 */
import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Célula de uma plataforma na linha do relatório: pacotes (quantidade) + valor (R$). */
export interface DriverReportPlatformCell {
  /** Quantidade de pacotes dessa plataforma (soma das rotas do driver). */
  packages: number;
  /** Subtotal em R$ = pacotes × valor/pacote (já calculado pelo serviço). */
  value: number;
}

/** Uma linha do relatório = um driver no período. */
export interface DriverReportRow {
  name: string;
  /** Cidades unidas: "Caratinga, Entre Folhas, Vargem Alegre". */
  route: string;
  /** Nome do grupo, ou '' quando sem grupo. */
  group: string;
  /**
   * Dados por plataforma, indexados pelo NOME da plataforma. As chaves devem casar
   * com `meta.platforms`; plataformas ausentes aqui saem como 0 pacotes / R$ 0,00.
   */
  platforms: Record<string, DriverReportPlatformCell>;
  /** TOTAL PACOTES em R$ = Σ platforms[].value (== driverpay_payments.total_packages_amount). */
  totalPackages: number;
  /** DESCONTO (Σ) em R$. */
  discount: number;
  /** VALE (Σ) em R$. */
  vale: number;
  /** TOTAL A RECEBER (== total_net). Pode ser negativo. */
  totalToReceive: number;
  /** Chave PIX de quem recebe (só na 1ª linha da unidade no relatório do líder). */
  pixKey?: string | null;
}

export interface DriverReportMeta {
  /** Ex.: "CD Logística — Caratinga". */
  companyName: string;
  /** Rótulo humano do período. Ex.: "1ª Quinzena de Junho / 2026". */
  periodLabel: string;
  /** Nomes das plataformas, na ordem das colunas. Ex.: ['eMile', 'ANJUN']. */
  platforms: string[];
  /** Data/hora de geração (default: agora, fuso America/Sao_Paulo). */
  generatedAt?: string;
  /** Rótulo da entidade no rodapé/meta (default 'driver'; ex.: 'recebedor(es)' no relatório do líder). */
  entityLabel?: string;
}

// ─── Constantes de estilo (Excel) ─────────────────────────────────────────────

/** Formato de moeda BRL idêntico ao de c6Export.ts (col monetária). */
const BRL_FMT = '_-R$ * #,##0.00_-;-R$ * #,##0.00_-;_-R$ * "-"??_-;_-@_-';
const INT_FMT = '#,##0';

// Paleta espelhando o tema claro do sistema (blue-600 / green-600 / red-600 / amber-600).
const XL_TITLE_FILL = '1E40AF'; // blue-800 (faixa do título)
const XL_HEADER_FILL = '2563EB'; // blue-600 (cabeçalho)
const XL_TEXT_LIGHT = 'FFFFFF';
const XL_ZEBRA_A = 'FFFFFF';
const XL_ZEBRA_B = 'F8FAFC';
const XL_TOTAL_FILL = 'FEF3C7'; // amber-100 (linha TOTAL GERAL)
const XL_GREEN = '16A34A'; // green-600 (total a receber)
const XL_RED = 'DC2626'; // red-600 (negativo / desconto)
const XL_AMBER = 'B45309'; // amber-700 (vale)
const XL_INK = '111827';
const XL_INK_MUTED = '6B7280';
const XL_BORDER = 'D1D5DB'; // gray-300

// ─── Constantes de estilo (PDF) ───────────────────────────────────────────────

const PDF_PRIMARY: [number, number, number] = [37, 99, 235]; // blue-600
const PDF_SUCCESS: [number, number, number] = [22, 163, 74]; // green-600
const PDF_DANGER: [number, number, number] = [220, 38, 38]; // red-600
const PDF_AMBER: [number, number, number] = [180, 83, 9]; // amber-700
const PDF_X_LEFT = 32;
const PDF_PAGE_W = 842; // A4 landscape, pt (mesma convenção de dimensão fixa do restante do projeto)

// ─── Helpers compartilhados ───────────────────────────────────────────────────

function nowBR(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n);
}

function sanitizeForFile(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'periodo';
}

const applyBorder = (borderStyle: any = 'thin') => ({
  top: { style: borderStyle, color: { rgb: XL_BORDER } },
  bottom: { style: borderStyle, color: { rgb: XL_BORDER } },
  left: { style: borderStyle, color: { rgb: XL_BORDER } },
  right: { style: borderStyle, color: { rgb: XL_BORDER } },
});

const applyCellStyle = (cell: any, style: any) => {
  if (!cell) return;
  cell.s = { ...cell.s, ...style };
};

/** Célula de plataforma segura (0/0 quando o driver não tem a plataforma). */
function cellFor(row: DriverReportRow, platform: string): DriverReportPlatformCell {
  return row.platforms[platform] ?? { packages: 0, value: 0 };
}

/** Totais agregados (JS-side) usados no meta/rodapé do PDF. */
interface ReportTotals {
  drivers: number;
  perPlatform: Record<string, { packages: number; value: number }>;
  totalPackages: number;
  discount: number;
  vale: number;
  totalToReceive: number;
}

function computeTotals(rows: DriverReportRow[], platforms: string[]): ReportTotals {
  const perPlatform: Record<string, { packages: number; value: number }> = {};
  platforms.forEach((p) => (perPlatform[p] = { packages: 0, value: 0 }));
  const acc: ReportTotals = {
    drivers: rows.length,
    perPlatform,
    totalPackages: 0,
    discount: 0,
    vale: 0,
    totalToReceive: 0,
  };
  for (const row of rows) {
    for (const p of platforms) {
      const c = cellFor(row, p);
      perPlatform[p].packages += c.packages;
      perPlatform[p].value += c.value;
    }
    acc.totalPackages += row.totalPackages;
    acc.discount += row.discount;
    acc.vale += row.vale;
    acc.totalToReceive += row.totalToReceive;
  }
  return acc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXCEL (primário)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Layout de colunas (dinâmico):
 *   0 NOME | 1 ROTA | 2 GRUPO | [por plataforma i: (3+2i) Pacotes, (3+2i+1) Valor]
 *   | TOTAL PACOTES | DESCONTO | VALE | TOTAL A RECEBER | CHAVE PIX
 *
 * Cabeçalho em 2 linhas: linha de grupo (nome da plataforma mesclado sobre suas 2
 * sub-colunas; colunas fixas mescladas verticalmente) + linha de sub-rótulos.
 */
function buildGeneralSheet(rows: DriverReportRow[], meta: DriverReportMeta): XLSX.WorkSheet {
  const platforms = meta.platforms;
  const generatedAt = meta.generatedAt || nowBR();

  const platPkgCol = (i: number) => 3 + i * 2;
  const platValCol = (i: number) => 3 + i * 2 + 1;
  const tailStart = 3 + platforms.length * 2;
  const colTotalPackages = tailStart;
  const colDiscount = tailStart + 1;
  const colVale = tailStart + 2;
  const colToReceive = tailStart + 3;
  // CHAVE PIX por último: não desloca os pares de plataforma nem as colunas de dinheiro.
  const colPix = tailStart + 4;
  const lastCol = colPix;
  const totalCols = lastCol + 1;

  const moneyCols = new Set<number>([colTotalPackages, colDiscount, colVale, colToReceive]);
  const intCols = new Set<number>();
  platforms.forEach((_, i) => {
    moneyCols.add(platValCol(i));
    intCols.add(platPkgCol(i));
  });

  // Índices de linha (0-based).
  const R_TITLE = 0;
  const R_META = 1;
  const R_HGROUP = 3; // linha de cabeçalho: nome da plataforma
  const R_HSUB = 4; // linha de cabeçalho: Pacotes / Valor
  const R_DATA = 5; // primeira linha de dados
  const n = rows.length;
  // Contagem "de recebedores": no relatório do líder só a 1ª linha da unidade tem nome,
  // então contar linhas com nome dá o nº de recebedores; no per-driver, == nº de drivers.
  const entityCount = rows.filter((r) => (r.name || '').trim() !== '').length;
  const entityText = meta.entityLabel
    ? `${entityCount} ${meta.entityLabel}`
    : `${entityCount} driver${entityCount !== 1 ? 's' : ''}`;
  const R_TOTAL = R_DATA + n;

  const blankRow = (): any[] => new Array(totalCols).fill('');
  const data: any[][] = [];

  // Título mesclado.
  const titleRow = blankRow();
  titleRow[0] = `RELATÓRIO GERAL — ${meta.companyName} — ${meta.periodLabel}`;
  data[R_TITLE] = titleRow;

  // Meta.
  const metaRow = blankRow();
  metaRow[0] = `Gerado em ${generatedAt}  ·  ${entityText}  ·  Plataformas: ${
    platforms.join(' / ') || '—'
  }`;
  data[R_META] = metaRow;

  // Linha em branco (respiro).
  data[2] = blankRow();

  // Cabeçalho — linha de grupo.
  const hGroup = blankRow();
  hGroup[0] = 'NOME';
  hGroup[1] = 'ROTA';
  hGroup[2] = 'GRUPO';
  platforms.forEach((p, i) => {
    hGroup[platPkgCol(i)] = p;
  });
  hGroup[colTotalPackages] = 'TOTAL PACOTES';
  hGroup[colDiscount] = 'DESCONTO';
  hGroup[colVale] = 'VALE';
  hGroup[colToReceive] = 'TOTAL A RECEBER';
  hGroup[colPix] = 'CHAVE PIX';
  data[R_HGROUP] = hGroup;

  // Cabeçalho — sub-rótulos das plataformas.
  const hSub = blankRow();
  platforms.forEach((_, i) => {
    hSub[platPkgCol(i)] = 'Pacotes';
    hSub[platValCol(i)] = 'Valor (R$)';
  });
  data[R_HSUB] = hSub;

  // Linhas de dados.
  rows.forEach((row, j) => {
    const line = blankRow();
    line[0] = row.name;
    line[1] = row.route || '—';
    line[2] = row.group || 'Sem grupo';
    platforms.forEach((p, i) => {
      const c = cellFor(row, p);
      line[platPkgCol(i)] = c.packages;
      line[platValCol(i)] = c.value;
    });
    line[colTotalPackages] = row.totalPackages;
    line[colDiscount] = row.discount;
    line[colVale] = row.vale;
    line[colToReceive] = row.totalToReceive;
    line[colPix] = row.pixKey ?? '';
    data[R_DATA + j] = line;
  });

  // Linha TOTAL GERAL (SUM por coluna; se não há dados, cai pra 0).
  const totalRow = blankRow();
  totalRow[0] = `TOTAL GERAL — ${entityText}`;
  const firstDataExcel = R_DATA + 1; // 1-based
  const lastDataExcel = R_DATA + n; // 1-based
  for (let c = 3; c <= lastCol; c++) {
    if (!moneyCols.has(c) && !intCols.has(c)) continue;
    if (n > 0) {
      const colL = XLSX.utils.encode_col(c);
      totalRow[c] = { f: `SUM(${colL}${firstDataExcel}:${colL}${lastDataExcel})` };
    } else {
      totalRow[c] = 0;
    }
  }
  data[R_TOTAL] = totalRow;

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Larguras de coluna.
  const cols: { wch: number }[] = [];
  cols[0] = { wch: 32 };
  cols[1] = { wch: 22 };
  cols[2] = { wch: 18 };
  platforms.forEach((_, i) => {
    cols[platPkgCol(i)] = { wch: 11 };
    cols[platValCol(i)] = { wch: 15 };
  });
  cols[colTotalPackages] = { wch: 16 };
  cols[colDiscount] = { wch: 14 };
  cols[colVale] = { wch: 14 };
  cols[colToReceive] = { wch: 18 };
  cols[colPix] = { wch: 22 };
  ws['!cols'] = cols;

  // Alturas de linha (título/cabeçalho um pouco maiores).
  const rowHeights: any[] = [];
  rowHeights[R_TITLE] = { hpx: 28 };
  rowHeights[R_HGROUP] = { hpx: 20 };
  rowHeights[R_HSUB] = { hpx: 20 };
  ws['!rows'] = rowHeights;

  const lastColL = XLSX.utils.encode_col(lastCol);

  // ── Estilos ──
  // Título.
  applyCellStyle(ws[XLSX.utils.encode_cell({ r: R_TITLE, c: 0 })], {
    font: { bold: true, sz: 15, color: { rgb: XL_TEXT_LIGHT } },
    fill: { fgColor: { rgb: XL_TITLE_FILL } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: applyBorder('medium'),
  });
  // Meta.
  applyCellStyle(ws[XLSX.utils.encode_cell({ r: R_META, c: 0 })], {
    font: { italic: true, sz: 10, color: { rgb: XL_INK_MUTED } },
    alignment: { horizontal: 'left', vertical: 'center' },
  });

  // Cabeçalho (linhas de grupo + sub): pinta todas as células do intervalo.
  for (let r = R_HGROUP; r <= R_HSUB; r++) {
    for (let c = 0; c <= lastCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      applyCellStyle(cell, {
        font: { bold: true, sz: 10.5, color: { rgb: XL_TEXT_LIGHT } },
        fill: { fgColor: { rgb: XL_HEADER_FILL } },
        alignment: { horizontal: c <= 2 ? 'left' : 'center', vertical: 'center', wrapText: true },
        border: applyBorder('medium'),
      });
    }
  }

  // Dados (zebra + moeda + alinhamentos).
  for (let j = 0; j < n; j++) {
    const r = R_DATA + j;
    const bg = j % 2 === 0 ? XL_ZEBRA_A : XL_ZEBRA_B;
    const row = rows[j];
    for (let c = 0; c <= lastCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const style: any = {
        fill: { fgColor: { rgb: bg } },
        border: applyBorder(),
        alignment: { vertical: 'center' },
        font: { sz: 10, color: { rgb: XL_INK } },
      };
      if (moneyCols.has(c)) {
        cell.z = BRL_FMT;
        style.alignment.horizontal = 'right';
        if (c === colToReceive) {
          style.font = { sz: 10, bold: true, color: { rgb: row.totalToReceive < 0 ? XL_RED : XL_INK } };
        } else if (c === colDiscount) {
          style.font = { sz: 10, color: { rgb: row.discount > 0 ? XL_RED : XL_INK_MUTED } };
        } else if (c === colVale) {
          style.font = { sz: 10, color: { rgb: row.vale > 0 ? XL_AMBER : XL_INK_MUTED } };
        }
      } else if (intCols.has(c)) {
        cell.z = INT_FMT;
        style.alignment.horizontal = 'center';
      } else {
        style.alignment.horizontal = 'left';
        if (c === 0) style.font = { sz: 10, bold: true, color: { rgb: XL_INK } };
        if (c === 2) style.font = { sz: 10, color: { rgb: XL_INK_MUTED } };
      }
      applyCellStyle(cell, style);
    }
  }

  // Linha TOTAL GERAL.
  for (let c = 0; c <= lastCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: R_TOTAL, c })];
    if (!cell) continue;
    const style: any = {
      font: { bold: true, sz: 11, color: { rgb: XL_INK } },
      fill: { fgColor: { rgb: XL_TOTAL_FILL } },
      border: applyBorder('medium'),
      alignment: { vertical: 'center' },
    };
    if (moneyCols.has(c)) {
      cell.z = BRL_FMT;
      style.alignment.horizontal = 'right';
      if (c === colToReceive) style.font = { bold: true, sz: 12, color: { rgb: XL_GREEN } };
    } else if (intCols.has(c)) {
      cell.z = INT_FMT;
      style.alignment.horizontal = 'center';
    } else {
      style.alignment.horizontal = 'left';
    }
    applyCellStyle(cell, style);
  }

  // Merges: título, meta, cabeçalho (fixas verticais + plataformas horizontais), rótulo do total.
  const merges: any[] = [];
  merges.push({ s: { r: R_TITLE, c: 0 }, e: { r: R_TITLE, c: lastCol } });
  merges.push({ s: { r: R_META, c: 0 }, e: { r: R_META, c: lastCol } });
  // Colunas fixas do cabeçalho ocupam as 2 linhas (grupo + sub).
  [0, 1, 2, colTotalPackages, colDiscount, colVale, colToReceive, colPix].forEach((c) => {
    merges.push({ s: { r: R_HGROUP, c }, e: { r: R_HSUB, c } });
  });
  // Cada plataforma mesclada sobre suas 2 sub-colunas na linha de grupo.
  platforms.forEach((_, i) => {
    merges.push({ s: { r: R_HGROUP, c: platPkgCol(i) }, e: { r: R_HGROUP, c: platValCol(i) } });
  });
  // Rótulo do TOTAL GERAL ocupa NOME|ROTA|GRUPO.
  merges.push({ s: { r: R_TOTAL, c: 0 }, e: { r: R_TOTAL, c: 2 } });
  ws['!merges'] = merges;

  // Congela cabeçalho; autofilter na linha de sub-rótulos.
  ws['!freeze'] = { xSplit: 0, ySplit: R_DATA };
  if (n > 0) {
    ws['!autofilter'] = { ref: `A${R_HSUB + 1}:${lastColL}${lastDataExcel}` };
  }

  return ws;
}

/** Aba opcional "Por Grupo": agregado por grupo + TOTAL. Gerada só se houver grupo nomeado. */
function buildGroupSheet(rows: DriverReportRow[], meta: DriverReportMeta): XLSX.WorkSheet {
  interface Agg {
    drivers: number;
    totalPackages: number;
    discount: number;
    vale: number;
    totalToReceive: number;
  }
  const order: string[] = [];
  const byGroup = new Map<string, Agg>();
  for (const row of rows) {
    const g = (row.group || '').trim() || 'Sem grupo';
    let agg = byGroup.get(g);
    if (!agg) {
      agg = { drivers: 0, totalPackages: 0, discount: 0, vale: 0, totalToReceive: 0 };
      byGroup.set(g, agg);
      order.push(g);
    }
    agg.drivers += 1;
    agg.totalPackages += row.totalPackages;
    agg.discount += row.discount;
    agg.vale += row.vale;
    agg.totalToReceive += row.totalToReceive;
  }

  const lastCol = 5; // GRUPO | Nº DRIVERS | TOTAL PACOTES | DESCONTO | VALE | TOTAL A RECEBER
  const totalCols = lastCol + 1;
  const moneyCols = new Set<number>([2, 3, 4, 5]);
  const R_TITLE = 0;
  const R_HEAD = 2;
  const R_DATA = 3;
  const g = order.length;
  const R_TOTAL = R_DATA + g;

  const blankRow = (): any[] => new Array(totalCols).fill('');
  const data: any[][] = [];

  const titleRow = blankRow();
  titleRow[0] = `POR GRUPO — ${meta.companyName} — ${meta.periodLabel}`;
  data[R_TITLE] = titleRow;
  data[1] = blankRow();

  const head = blankRow();
  head[0] = 'GRUPO';
  head[1] = 'Nº DRIVERS';
  head[2] = 'TOTAL PACOTES';
  head[3] = 'DESCONTO';
  head[4] = 'VALE';
  head[5] = 'TOTAL A RECEBER';
  data[R_HEAD] = head;

  order.forEach((name, j) => {
    const agg = byGroup.get(name)!;
    const line = blankRow();
    line[0] = name;
    line[1] = agg.drivers;
    line[2] = agg.totalPackages;
    line[3] = agg.discount;
    line[4] = agg.vale;
    line[5] = agg.totalToReceive;
    data[R_DATA + j] = line;
  });

  const totalRow = blankRow();
  totalRow[0] = 'TOTAL GERAL';
  const firstDataExcel = R_DATA + 1;
  const lastDataExcel = R_DATA + g;
  for (let c = 1; c <= lastCol; c++) {
    if (g > 0) {
      const colL = XLSX.utils.encode_col(c);
      totalRow[c] = { f: `SUM(${colL}${firstDataExcel}:${colL}${lastDataExcel})` };
    } else {
      totalRow[c] = 0;
    }
  }
  data[R_TOTAL] = totalRow;

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];

  applyCellStyle(ws[XLSX.utils.encode_cell({ r: R_TITLE, c: 0 })], {
    font: { bold: true, sz: 14, color: { rgb: XL_TEXT_LIGHT } },
    fill: { fgColor: { rgb: XL_TITLE_FILL } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: applyBorder('medium'),
  });

  for (let c = 0; c <= lastCol; c++) {
    applyCellStyle(ws[XLSX.utils.encode_cell({ r: R_HEAD, c })], {
      font: { bold: true, sz: 10.5, color: { rgb: XL_TEXT_LIGHT } },
      fill: { fgColor: { rgb: XL_HEADER_FILL } },
      alignment: { horizontal: c === 0 ? 'left' : 'center', vertical: 'center', wrapText: true },
      border: applyBorder('medium'),
    });
  }

  for (let j = 0; j < g; j++) {
    const r = R_DATA + j;
    const bg = j % 2 === 0 ? XL_ZEBRA_A : XL_ZEBRA_B;
    const agg = byGroup.get(order[j])!;
    for (let c = 0; c <= lastCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const style: any = {
        fill: { fgColor: { rgb: bg } },
        border: applyBorder(),
        alignment: { vertical: 'center' },
        font: { sz: 10, color: { rgb: XL_INK } },
      };
      if (moneyCols.has(c)) {
        cell.z = BRL_FMT;
        style.alignment.horizontal = 'right';
        if (c === 5) style.font = { sz: 10, bold: true, color: { rgb: agg.totalToReceive < 0 ? XL_RED : XL_INK } };
      } else if (c === 1) {
        cell.z = INT_FMT;
        style.alignment.horizontal = 'center';
      } else {
        style.alignment.horizontal = 'left';
        style.font = { sz: 10, bold: true, color: { rgb: XL_INK } };
      }
      applyCellStyle(cell, style);
    }
  }

  for (let c = 0; c <= lastCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: R_TOTAL, c })];
    if (!cell) continue;
    const style: any = {
      font: { bold: true, sz: 11, color: { rgb: XL_INK } },
      fill: { fgColor: { rgb: XL_TOTAL_FILL } },
      border: applyBorder('medium'),
      alignment: { vertical: 'center', horizontal: c === 0 ? 'left' : c === 1 ? 'center' : 'right' },
    };
    if (moneyCols.has(c)) {
      cell.z = BRL_FMT;
      if (c === 5) style.font = { bold: true, sz: 12, color: { rgb: XL_GREEN } };
    } else if (c === 1) {
      cell.z = INT_FMT;
    }
    applyCellStyle(cell, style);
  }

  ws['!merges'] = [{ s: { r: R_TITLE, c: 0 }, e: { r: R_TITLE, c: lastCol } }];
  ws['!freeze'] = { xSplit: 0, ySplit: R_DATA };

  return ws;
}

/**
 * Gera e baixa o relatório geral do período em Excel (.xlsx). Aba "Relatório Geral"
 * + aba "Por Grupo" (quando houver pelo menos um grupo nomeado). Dispara o download
 * via `XLSX.writeFile` (browser), idêntico a `exportC6PaymentSheet`.
 */
export async function exportDriverGeneralReportExcel(
  rows: DriverReportRow[],
  meta: DriverReportMeta,
  opts?: { includeGroupSheet?: boolean },
): Promise<void> {
  const workbook = XLSX.utils.book_new();

  const generalSheet = buildGeneralSheet(rows, meta);
  XLSX.utils.book_append_sheet(workbook, generalSheet, 'Relatório Geral');

  // No relatório do líder-recebedor, o "GRUPO" só aparece na 1ª linha da unidade e a
  // própria planilha já é agrupada por recebedor — a aba "Por Grupo" não faz sentido.
  const hasNamedGroup = rows.some((r) => (r.group || '').trim() !== '');
  if ((opts?.includeGroupSheet ?? true) && hasNamedGroup) {
    const groupSheet = buildGroupSheet(rows, meta);
    XLSX.utils.book_append_sheet(workbook, groupSheet, 'Por Grupo');
  }

  const filename = `Relatorio_Geral_Driver_${sanitizeForFile(meta.periodLabel)}.xlsx`;
  XLSX.writeFile(workbook, filename, { bookType: 'xlsx', type: 'binary', cellStyles: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXCEL — RELATÓRIO SIMPLES (A nome · B valor total · C chave PIX · D obs = quinzena)
// ═══════════════════════════════════════════════════════════════════════════════

/** Uma linha do relatório simples: nome (sem acento) + total a receber + chave PIX do recebedor. */
export interface SimpleExportRow {
  name: string;
  total: number;
  /** Chave PIX de quem recebe (recebedor configurado ou o próprio líder). */
  pix?: string | null;
}

function buildSimpleSheet(rows: SimpleExportRow[], meta: DriverReportMeta): XLSX.WorkSheet {
  const generatedAt = meta.generatedAt || nowBR();
  const R_TITLE = 0;
  const R_META = 1;
  const R_HEAD = 3;
  const R_DATA = 4;
  const n = rows.length;
  const R_TOTAL = R_DATA + n;
  const lastCol = 3; // A NOME | B VALOR TOTAL | C CHAVE PIX | D OBS

  const blank = (): any[] => ['', '', '', ''];
  const data: any[][] = [];

  const title = blank();
  title[0] = `RELATÓRIO SIMPLES — ${meta.companyName} — ${meta.periodLabel}`;
  data[R_TITLE] = title;
  const metaRow = blank();
  metaRow[0] = `Gerado em ${generatedAt}  ·  ${n} recebedor${n !== 1 ? 'es' : ''}`;
  data[R_META] = metaRow;
  data[2] = blank();

  const head = blank();
  head[0] = 'NOME';
  head[1] = 'VALOR TOTAL';
  head[2] = 'CHAVE PIX';
  head[3] = 'OBS';
  data[R_HEAD] = head;

  rows.forEach((r, j) => {
    const line = blank();
    line[0] = r.name;
    line[1] = r.total;
    line[2] = r.pix ?? '';
    line[3] = meta.periodLabel; // OBS = nome da quinzena
    data[R_DATA + j] = line;
  });

  const totalRow = blank();
  totalRow[0] = 'TOTAL GERAL';
  totalRow[1] = n > 0 ? { f: `SUM(B${R_DATA + 1}:B${R_DATA + n})` } : 0;
  data[R_TOTAL] = totalRow;

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 36 }, { wch: 18 }, { wch: 24 }, { wch: 30 }];
  ws['!rows'] = [{ hpx: 26 }];

  applyCellStyle(ws[XLSX.utils.encode_cell({ r: R_TITLE, c: 0 })], {
    font: { bold: true, sz: 14, color: { rgb: XL_TEXT_LIGHT } },
    fill: { fgColor: { rgb: XL_TITLE_FILL } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: applyBorder('medium'),
  });
  applyCellStyle(ws[XLSX.utils.encode_cell({ r: R_META, c: 0 })], {
    font: { italic: true, sz: 10, color: { rgb: XL_INK_MUTED } },
    alignment: { horizontal: 'left', vertical: 'center' },
  });
  for (let c = 0; c <= lastCol; c++) {
    applyCellStyle(ws[XLSX.utils.encode_cell({ r: R_HEAD, c })], {
      font: { bold: true, sz: 11, color: { rgb: XL_TEXT_LIGHT } },
      fill: { fgColor: { rgb: XL_HEADER_FILL } },
      alignment: { horizontal: c === 1 ? 'right' : 'left', vertical: 'center' },
      border: applyBorder('medium'),
    });
  }
  for (let j = 0; j < n; j++) {
    const r = R_DATA + j;
    const bg = j % 2 === 0 ? XL_ZEBRA_A : XL_ZEBRA_B;
    for (let c = 0; c <= lastCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const style: any = {
        fill: { fgColor: { rgb: bg } },
        border: applyBorder(),
        alignment: { vertical: 'center', horizontal: c === 1 ? 'right' : 'left' },
        font: { sz: 10, color: { rgb: XL_INK } },
      };
      if (c === 0) style.font = { sz: 10, bold: true, color: { rgb: XL_INK } };
      if (c === 1) {
        cell.z = BRL_FMT;
        style.font = { sz: 10, bold: true, color: { rgb: rows[j].total < 0 ? XL_RED : XL_INK } };
      }
      if (c === 3) style.font = { sz: 10, color: { rgb: XL_INK_MUTED } };
      applyCellStyle(cell, style);
    }
  }
  for (let c = 0; c <= lastCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: R_TOTAL, c })];
    if (!cell) continue;
    const style: any = {
      font: { bold: true, sz: 11, color: { rgb: XL_INK } },
      fill: { fgColor: { rgb: XL_TOTAL_FILL } },
      border: applyBorder('medium'),
      alignment: { vertical: 'center', horizontal: c === 1 ? 'right' : 'left' },
    };
    if (c === 1) {
      cell.z = BRL_FMT;
      style.font = { bold: true, sz: 12, color: { rgb: XL_GREEN } };
    }
    applyCellStyle(cell, style);
  }

  ws['!merges'] = [
    { s: { r: R_TITLE, c: 0 }, e: { r: R_TITLE, c: lastCol } },
    { s: { r: R_META, c: 0 }, e: { r: R_META, c: lastCol } },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: R_DATA };
  if (n > 0) ws['!autofilter'] = { ref: `A${R_HEAD + 1}:D${R_DATA + n}` };
  return ws;
}

/** Gera e baixa o relatório SIMPLES (.xlsx): A nome (sem acento) · B valor total · C chave PIX · D obs (quinzena). */
export async function exportDriverSimpleReportExcel(
  rows: SimpleExportRow[],
  meta: DriverReportMeta,
): Promise<void> {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSimpleSheet(rows, meta), 'Relatório Simples');
  const filename = `Relatorio_Simples_Driver_${sanitizeForFile(meta.periodLabel)}.xlsx`;
  XLSX.writeFile(workbook, filename, { bookType: 'xlsx', type: 'binary', cellStyles: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF (opção)
// ═══════════════════════════════════════════════════════════════════════════════

/** jspdf-autotable expõe `finalY` via `doc.lastAutoTable` em runtime (não tipado). */
function getFinalY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof last?.finalY === 'number' ? last.finalY : fallback;
}

function buildReportPdf(rows: DriverReportRow[], meta: DriverReportMeta): jsPDF {
  const platforms = meta.platforms;
  const generatedAt = meta.generatedAt || nowBR();
  const totals = computeTotals(rows, platforms);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = PDF_PAGE_W;

  // Cabeçalho.
  doc.setFont('helvetica', 'bold').setFontSize(15);
  doc.setTextColor(PDF_PRIMARY[0], PDF_PRIMARY[1], PDF_PRIMARY[2]);
  doc.text('RELATÓRIO GERAL', pageW / 2, 40, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${meta.companyName} — ${meta.periodLabel}`, pageW / 2, 58, { align: 'center' });
  doc.setTextColor(0);

  // Índices de coluna (mesma ordem do Excel).
  const platPkgCol = (i: number) => 3 + i * 2;
  const platValCol = (i: number) => 3 + i * 2 + 1;
  const tailStart = 3 + platforms.length * 2;
  const colTotalPackages = tailStart;
  const colDiscount = tailStart + 1;
  const colVale = tailStart + 2;
  const colToReceive = tailStart + 3;
  const lastCol = colToReceive;

  const moneyCols = new Set<number>([colTotalPackages, colDiscount, colVale, colToReceive]);
  const intCols = new Set<number>();
  platforms.forEach((_, i) => {
    moneyCols.add(platValCol(i));
    intCols.add(platPkgCol(i));
  });

  // Head (uma linha; nome da plataforma + tipo compacto).
  const head: string[] = ['NOME', 'ROTA', 'GRUPO'];
  platforms.forEach((p) => {
    head.push(`${p}\nPct`, `${p}\nR$`);
  });
  head.push('TOTAL\nPACOTES', 'DESCONTO', 'VALE', 'TOTAL A\nRECEBER');

  // Body.
  const body: string[][] = rows.map((row) => {
    const line: string[] = [row.name, row.route || '—', row.group || 'Sem grupo'];
    platforms.forEach((p) => {
      const c = cellFor(row, p);
      line.push(fmtQty(c.packages), fmtBRL(c.value));
    });
    line.push(fmtBRL(row.totalPackages), fmtBRL(row.discount), fmtBRL(row.vale), fmtBRL(row.totalToReceive));
    return line;
  });

  // Foot (TOTAL GERAL).
  const foot: string[] = ['TOTAL GERAL', '', ''];
  platforms.forEach((p) => {
    foot.push(fmtQty(totals.perPlatform[p].packages), fmtBRL(totals.perPlatform[p].value));
  });
  foot.push(
    fmtBRL(totals.totalPackages),
    fmtBRL(totals.discount),
    fmtBRL(totals.vale),
    fmtBRL(totals.totalToReceive),
  );

  // Alinhamento por coluna.
  const columnStyles: Record<string, any> = {
    0: { halign: 'left', cellWidth: 'auto' },
    1: { halign: 'left' },
    2: { halign: 'left' },
  };
  for (let c = 3; c <= lastCol; c++) {
    columnStyles[c] = { halign: intCols.has(c) ? 'center' : 'right' };
  }

  autoTable(doc, {
    startY: 72,
    head: [head],
    body,
    foot: [foot],
    theme: 'grid',
    headStyles: {
      fillColor: [PDF_PRIMARY[0], PDF_PRIMARY[1], PDF_PRIMARY[2]],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    footStyles: {
      fillColor: [PDF_SUCCESS[0], PDF_SUCCESS[1], PDF_SUCCESS[2]],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'right',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 3, overflow: 'linebreak', lineColor: [209, 213, 219], lineWidth: 0.4 },
    columnStyles,
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (cell) => {
      // Coluna TOTAL A RECEBER: negrito no corpo; vermelho quando negativo.
      if (cell.section === 'body' && cell.column.index === colToReceive) {
        cell.cell.styles.fontStyle = 'bold';
        const row = rows[cell.row.index];
        if (row && row.totalToReceive < 0) {
          cell.cell.styles.textColor = [PDF_DANGER[0], PDF_DANGER[1], PDF_DANGER[2]];
        }
      }
      // Descontos em vermelho, vales em âmbar (só quando > 0).
      if (cell.section === 'body' && cell.column.index === colDiscount) {
        const row = rows[cell.row.index];
        if (row && row.discount > 0) cell.cell.styles.textColor = [PDF_DANGER[0], PDF_DANGER[1], PDF_DANGER[2]];
      }
      if (cell.section === 'body' && cell.column.index === colVale) {
        const row = rows[cell.row.index];
        if (row && row.vale > 0) cell.cell.styles.textColor = [PDF_AMBER[0], PDF_AMBER[1], PDF_AMBER[2]];
      }
      // Rótulo "TOTAL GERAL" alinhado à esquerda no rodapé.
      if (cell.section === 'foot' && cell.column.index === 0) {
        cell.cell.styles.halign = 'left';
      }
    },
    margin: { left: PDF_X_LEFT, right: PDF_X_LEFT },
  });

  // Rodapé: data de geração.
  const finalY = getFinalY(doc, 72);
  doc.setFont('helvetica', 'italic').setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Documento gerado em ${generatedAt}`, PDF_X_LEFT, finalY + 20);
  doc.text('iMile CTGA — Relatório Geral de Pagamentos Driver', pageW - PDF_X_LEFT, finalY + 20, {
    align: 'right',
  });
  doc.setTextColor(0);

  return doc;
}

/** Gera o relatório geral em PDF (landscape) e retorna o Blob (sem baixar). */
export async function generateDriverGeneralReportPdf(
  rows: DriverReportRow[],
  meta: DriverReportMeta,
): Promise<Blob> {
  const doc = buildReportPdf(rows, meta);
  return doc.output('blob');
}

/** Gera e baixa o relatório geral em PDF (landscape). */
export async function downloadDriverGeneralReportPdf(
  rows: DriverReportRow[],
  meta: DriverReportMeta,
  filename?: string,
): Promise<void> {
  const doc = buildReportPdf(rows, meta);
  const fname = filename || `relatorio-geral-driver-${sanitizeForFile(meta.periodLabel)}.pdf`;
  doc.save(fname);
}
