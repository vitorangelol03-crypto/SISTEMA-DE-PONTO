/**
 * Sub-fase 2.13 v3: gerador de PDF de espelho de ponto via jsPDF + autoTable.
 *
 * Layout milimétrico baseado nas medidas do modelo CLT real
 * (extraídas via pdftotext -bbox-layout).
 *
 * Página: A4 LANDSCAPE (842 x 595 pt).
 *
 * Estrutura Y (em pt, do topo):
 *   y=19→60   header empresa (4 blocos: logo, empregador info, período, jornada)
 *   y=60→90   sub-header  (2 blocos: colaborador, dados pessoais grid 2x2)
 *   y=90→…    tabela de dados (12 colunas)
 *   y=…       totais → legenda → footer (legenda + assinatura)
 *
 * API pública (4 funções) — assinaturas async, callers DEVEM aguardar:
 *   generateMirrorPdf(data)            → Promise<Blob>
 *   downloadMirrorPdf(data, filename)  → Promise<void>
 *   generateMirrorsBatchPdf(dataList)  → Promise<Blob>     (multipage)
 *   downloadMirrorsBatchPdf(dataList, filename) → Promise<void>
 *
 * Helpers internos prefixados com `_` ficam expostos só pra script de teste.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  type MirrorData,
  type MirrorDayRow,
  type MirrorTimeCell,
  formatCnpj,
  formatCpf,
  formatDateBR,
  minutesToHHMM,
  minutesToHHMMAlways,
} from './mirrorGenerator';

// ============================================================================
// Constantes de layout (em pt)
// ============================================================================

const PAGE_W = 842;

const X_LEFT = 19.6;          // margem esquerda — 7mm
const X_RIGHT = 822;          // limite direito — deixa ~20pt (~7mm) de margem
const CONTENT_W = X_RIGHT - X_LEFT; // 802.4

const Y_HEADER_TOP = 19;
const Y_HEADER_BOTTOM = 60;   // header empresa: altura 41pt
const Y_SUBHEADER_TOP = Y_HEADER_BOTTOM;
const Y_SUBHEADER_BOTTOM = 90; // sub-header: altura 30pt
const Y_TABLE_START = Y_SUBHEADER_BOTTOM;

const LINE_W = 0.4;

// Larguras das 12 colunas (pt) — soma = 802.4
const COL_W_DATA = 55.4;
const COL_W_ENT1 = 70;
const COL_W_MARC = 75;        // Saí.1, Ent.2, Saí.2, Previstas
const COL_W_HRS = 65;         // Diurnas, Noturnas, Not.Red., Intervalo, B.Crédito
const COL_W_DEB = 52;

// ============================================================================
// Helpers
// ============================================================================

function getInitials(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

function flagSuffix(flag: MirrorTimeCell['flag']): string {
  if (flag === 'included') return '*';
  if (flag === 'requested') return '~';
  if (flag === 'pre_assigned') return '^';
  return '';
}

function formatCellTime(cell: MirrorTimeCell): string {
  if (!cell.display) return '';
  return cell.display + flagSuffix(cell.flag);
}

function bankNetDisplay(net: number): string {
  if (net === 0) return '00:00';
  if (net > 0) return minutesToHHMMAlways(net);
  return '-' + minutesToHHMMAlways(Math.abs(net));
}

function buildBodyRow(row: MirrorDayRow): string[] {
  if (row.isSunday) {
    return [row.label, '', '', '', '', '00:00', '', '', '', '', '', ''];
  }
  const debit = row.bankDebit > 0 ? '-' + minutesToHHMMAlways(row.bankDebit) : '';
  return [
    row.label,
    formatCellTime(row.ent1),
    formatCellTime(row.sai1),
    formatCellTime(row.ent2),
    formatCellTime(row.sai2),
    minutesToHHMMAlways(row.expected),
    minutesToHHMM(row.daytime),
    minutesToHHMM(row.nighttime),
    '',
    minutesToHHMM(row.interval),
    minutesToHHMM(row.bankCredit),
    debit,
  ];
}

// ============================================================================
// Drawing
// ============================================================================

function drawHeaderEmpresa(doc: jsPDF, data: MirrorData): void {
  // 4 blocos lado-a-lado, frame externo + 3 separadores verticais.
  //   Logo:        x=19.6 → 124   (largura 104.4pt)
  //   Empregador:  x=124  → 480   (3 linhas: Empregador / CNPJ / Função)
  //   Período:     x=480  → 620   (centralizado: label + valor)
  //   Jornada:     x=620  → 822   (centralizado: label + valor até 2 linhas)
  const yTop = Y_HEADER_TOP;
  const yBot = Y_HEADER_BOTTOM;

  doc.setLineWidth(LINE_W);
  doc.setDrawColor(0);
  doc.rect(X_LEFT, yTop, CONTENT_W, yBot - yTop);
  doc.line(124, yTop, 124, yBot);
  doc.line(480, yTop, 480, yBot);
  doc.line(620, yTop, 620, yBot);

  // Logo (iniciais centralizadas)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(getInitials(data.company.display_name), (X_LEFT + 124) / 2, yTop + 25, {
    align: 'center',
  });

  // Empregador: 3 linhas com label bold + valor normal
  doc.setFontSize(8);
  const xLabelEmp = 130;
  const xValueEmp = xLabelEmp + 56; // depois do label mais longo
  const yLines = [yTop + 12, yTop + 23, yTop + 34];

  doc.setFont('helvetica', 'bold');
  doc.text('Empregador:', xLabelEmp, yLines[0]!);
  doc.text('CNPJ / CPF:', xLabelEmp, yLines[1]!);
  doc.text('Função:', xLabelEmp, yLines[2]!);

  doc.setFont('helvetica', 'normal');
  doc.text(data.company.legal_name || '-', xValueEmp, yLines[0]!);
  doc.text(formatCnpj(data.company.cnpj) || '-', xValueEmp, yLines[1]!);
  doc.text(data.employee.function_role || '-', xLabelEmp + 38, yLines[2]!);

  // Período (centralizado em x=480→620)
  const xPerCenter = (480 + 620) / 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Período:', xPerCenter, yTop + 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${formatDateBR(data.period.start)} a ${formatDateBR(data.period.end)}`,
    xPerCenter,
    yTop + 26,
    { align: 'center' },
  );

  // Jornada (centralizado em x=620→822, até 2 linhas)
  const xJorCenter = (620 + X_RIGHT) / 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Jornada de trabalho:', xJorCenter, yTop + 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  const jorLines = doc.splitTextToSize(data.scheduleSummary || '-', 195) as string[];
  jorLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, xJorCenter, yTop + 26 + i * 9, { align: 'center' });
  });
}

function drawSubHeader(doc: jsPDF, data: MirrorData): void {
  // 2 blocos:
  //   Colaborador (x=19.6 → 360)   — Linha 1: Colaborador / Linha 2: CPF
  //   Dados grid 2×2 (x=360 → 822) — Crachá, Escala / PIS, Data de emissão
  const yTop = Y_SUBHEADER_TOP;
  const yBot = Y_SUBHEADER_BOTTOM;

  doc.setLineWidth(LINE_W);
  doc.rect(X_LEFT, yTop, CONTENT_W, yBot - yTop);
  doc.line(360, yTop, 360, yBot);

  doc.setFontSize(8);

  // Bloco 1: Colaborador
  doc.setFont('helvetica', 'bold');
  doc.text('Colaborador:', X_LEFT + 5, yTop + 12);
  doc.text('CPF:', X_LEFT + 5, yTop + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(data.employee.name || '-', X_LEFT + 53, yTop + 12);
  doc.text(formatCpf(data.employee.cpf) || '-', X_LEFT + 25, yTop + 24);

  // Bloco 2: grid 2×2
  // Sub-coluna esquerda (x=370): Crachá / PIS
  // Sub-coluna direita (x=600): Escala / Data de emissão
  doc.setFont('helvetica', 'bold');
  doc.text('Crachá:', 370, yTop + 12);
  doc.text('PIS:', 370, yTop + 24);
  doc.text('Escala:', 600, yTop + 12);
  doc.text('Data de emissão:', 600, yTop + 24);

  doc.setFont('helvetica', 'normal');
  doc.text(data.employee.badge_number || '-', 405, yTop + 12);
  doc.text(data.employee.pis || '-', 388, yTop + 24);
  doc.text(data.employee.schedule_type || 'Normal', 633, yTop + 12);
  doc.text(formatDateBR(data.period.emissionDate) || '-', 668, yTop + 24);
}

function drawDataTable(doc: jsPDF, data: MirrorData): number {
  const head = [
    [
      'Data',
      'Ent.1', 'Saí.1', 'Ent.2', 'Saí.2',
      'Previstas',
      'Diurnas', 'Noturnas', 'Not.Red.',
      'Intervalo',
      'B.Crédito', 'B.Débito',
    ],
  ];
  const body = data.rows.map(buildBodyRow);

  autoTable(doc, {
    head,
    body,
    startY: Y_TABLE_START,
    margin: { left: X_LEFT, right: PAGE_W - X_RIGHT },
    tableWidth: CONTENT_W,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: LINE_W,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      valign: 'middle',
    },
    headStyles: {
      fontSize: 7.5,
      fontStyle: 'bold',
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: LINE_W,
      halign: 'center',
    },
    columnStyles: {
      0:  { cellWidth: COL_W_DATA, halign: 'left' },
      1:  { cellWidth: COL_W_ENT1, halign: 'center' },
      2:  { cellWidth: COL_W_MARC, halign: 'center' },
      3:  { cellWidth: COL_W_MARC, halign: 'center' },
      4:  { cellWidth: COL_W_MARC, halign: 'center' },
      5:  { cellWidth: COL_W_MARC, halign: 'center' },
      6:  { cellWidth: COL_W_HRS,  halign: 'center' },
      7:  { cellWidth: COL_W_HRS,  halign: 'center' },
      8:  { cellWidth: COL_W_HRS,  halign: 'center' },
      9:  { cellWidth: COL_W_HRS,  halign: 'center' },
      10: { cellWidth: COL_W_HRS,  halign: 'center' },
      11: { cellWidth: COL_W_DEB,  halign: 'center' },
    },
  });

  // jspdf-autotable expõe finalY via doc.lastAutoTable em runtime (não tipado).
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof last?.finalY === 'number' ? last.finalY : Y_TABLE_START + 360;
}

function drawTotals(doc: jsPDF, data: MirrorData, y: number): void {
  const t = data.totals;
  doc.setFontSize(7.5);

  const items: Array<[string, string]> = [
    ['Previstas:', minutesToHHMMAlways(t.expected)],
    ['Diurnas:',   minutesToHHMMAlways(t.daytime)],
    ['Noturnas:',  minutesToHHMMAlways(t.nighttime)],
    ['Not. Red:',  '00:00'],
    ['Intervalo:', minutesToHHMMAlways(t.interval)],
    ['B.Crédito:', minutesToHHMMAlways(t.bankCredit)],
    ['B.Débito:',  '-' + minutesToHHMMAlways(t.bankDebit)],
    ['B.Total:',   bankNetDisplay(t.bankNet)],
  ];

  let x = X_LEFT;
  for (const [label, value] of items) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);
    const labelW = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    doc.text(value, x + labelW + 2, y);
    const valueW = doc.getTextWidth(value);
    x += labelW + valueW + 14;
  }
}

function drawLegend(doc: jsPDF, y: number): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    'Legenda: Marcação incluída*; Marcação por solicitação~; Marcação pré-assinalada^.',
    X_LEFT,
    y,
  );
}

function drawFooter(doc: jsPDF, data: MirrorData, y: number): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  // Coluna esquerda: nota
  doc.text(
    '* Versão de visualização de espelho ponto. Para assiná-la, realize o fechamento',
    X_LEFT,
    y,
  );

  // Coluna direita: linha de assinatura + texto consensual
  const xRight = 600;
  doc.text('_______________________________', xRight, y);
  const signTextLines = doc.splitTextToSize(
    `Eu, ${data.employee.name}, concordo com as marcações e cálculos no modelo compensatório.`,
    220,
  ) as string[];
  signTextLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, xRight, y + 12 + i * 9);
  });
}

// ============================================================================
// Document assembly
// ============================================================================

function drawSinglePage(doc: jsPDF, data: MirrorData): void {
  drawHeaderEmpresa(doc, data);
  drawSubHeader(doc, data);
  const finalY = drawDataTable(doc, data);
  drawTotals(doc, data, finalY + 10);
  drawLegend(doc, finalY + 22);
  drawFooter(doc, data, finalY + 38);
}

function generatePdfDoc(data: MirrorData): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  drawSinglePage(doc, data);
  return doc;
}

function generatePdfDocBatch(dataList: MirrorData[]): jsPDF {
  if (dataList.length === 0) throw new Error('Lista de espelhos vazia');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  dataList.forEach((data, idx) => {
    if (idx > 0) doc.addPage('a4', 'landscape');
    drawSinglePage(doc, data);
  });
  return doc;
}

// ============================================================================
// Public API
// ============================================================================

export async function generateMirrorPdf(data: MirrorData): Promise<Blob> {
  const doc = generatePdfDoc(data);
  return doc.output('blob');
}

export async function downloadMirrorPdf(data: MirrorData, filename: string): Promise<void> {
  const doc = generatePdfDoc(data);
  doc.save(filename);
}

export async function generateMirrorsBatchPdf(dataList: MirrorData[]): Promise<Blob> {
  const doc = generatePdfDocBatch(dataList);
  return doc.output('blob');
}

export async function downloadMirrorsBatchPdf(
  dataList: MirrorData[],
  filename: string,
): Promise<void> {
  const doc = generatePdfDocBatch(dataList);
  doc.save(filename);
}

// ============================================================================
// Helpers de teste — usados pelo script `scripts/gen-test-pdf.ts`
// ============================================================================

export function _generatePdfDoc(data: MirrorData): jsPDF {
  return generatePdfDoc(data);
}

export function _generateTestSampleData(): MirrorData {
  // Abril/2026: dia 1 cai numa quarta-feira (DST não muda nada porque BRT é fixo).
  // Sequência de dias da semana abril 2026:
  const weekdayLabels = [
    'qua', 'qui', 'sex', 'sáb', 'dom', 'seg', 'ter',
    'qua', 'qui', 'sex', 'sáb', 'dom', 'seg', 'ter',
    'qua', 'qui', 'sex', 'sáb', 'dom', 'seg', 'ter',
    'qua', 'qui', 'sex', 'sáb', 'dom', 'seg', 'ter',
    'qua', 'qui',
  ];

  const rows: MirrorDayRow[] = weekdayLabels.map((dow, i) => {
    const dd = (i + 1).toString().padStart(2, '0');
    const date = `2026-04-${dd}`;
    const isSunday = dow === 'dom';

    if (isSunday) {
      return {
        date,
        label: `${dd}/04 ${dow}`,
        isSunday: true,
        isAbsentCompensated: false,
        ent1: { display: '', flag: null },
        sai1: { display: '', flag: null },
        ent2: { display: '', flag: null },
        sai2: { display: '', flag: null },
        expected: 0,
        daytime: 0,
        nighttime: 0,
        interval: 0,
        bankCredit: 0,
        bankDebit: 0,
      };
    }

    // Mistura algumas linhas com flags pra exercitar marcadores *, ~, ^
    const flag: MirrorTimeCell['flag'] =
      i === 5 ? 'included' :
      i === 9 ? 'requested' :
      i === 14 ? 'pre_assigned' :
      null;

    return {
      date,
      label: `${dd}/04 ${dow}`,
      isSunday: false,
      isAbsentCompensated: false,
      ent1: { display: '03:30', flag },
      sai1: { display: '05:00', flag },
      ent2: { display: '06:00', flag },
      sai2: { display: '11:50', flag },
      expected: 440,    // 7h20
      daytime: 350,
      nighttime: 90,
      interval: 60,
      bankCredit: 0,
      bankDebit: 30,
    };
  });

  return {
    company: {
      legal_name: 'CD LOGISTICA LTDA',
      cnpj: '53824315000110',
      logo_url: null,
      display_name: 'Caratinga Bauer',
    },
    employee: {
      name: 'RENATA CRISTINA LOPES',
      cpf: '06036498667',
      pis: '',
      badge_number: '06036498667',
      function_role: 'AUXILIAR DE LOGÍSTICA',
      schedule_type: 'Normal',
    },
    period: {
      start: '2026-04-01',
      end: '2026-04-30',
      emissionDate: '2026-04-24',
    },
    scheduleSummary: 'Qui-Sáb: 7h30 / Seg-Qua: 7h20 / Dom: folga',
    rows,
    totals: {
      expected: 11440,
      daytime: 6196,
      nighttime: 940,
      interval: 838,
      bankCredit: 289,
      bankDebit: 4583,
      bankNet: 289 - 4583,
    },
  };
}
