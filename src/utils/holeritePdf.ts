/**
 * Sub-fase 17.2 + 17.2.1: gerador de PDF de holerite/recibo de pagamento (v2).
 *
 * v2 (sub-fase 17.2.1): adiciona function_role, hire_date, totais por
 * categoria, dias trabalhados count, contagem de bônus aplicados, box
 * de dados pessoais em grid, melhor diagramação visual.
 *
 * Layout A4 portrait:
 *   - Header empresa centralizado (logo opcional vai aqui em futuro)
 *   - Título "RECIBO DE PAGAMENTO" + período em destaque
 *   - Box "Dados do Funcionário" em grid 2x4 (nome, CPF, função, tipo,
 *     matrícula, contratação, dias trab., total pagamentos)
 *   - Tabela "Composição do Pagamento" com proventos + descontos
 *   - Tabela "Resumo por Categoria" (proventos / descontos / líquido)
 *   - Footer: data geração + linhas de assinatura
 *
 * API pública (estável — só adiciona campos opcionais, não breaking):
 *   generateHoleritePdf(data: HoleriteData): Promise<Blob>
 *   downloadHoleritePdf(data: HoleriteData, filename?: string): Promise<void>
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCpf, formatDateBR } from './mirrorGenerator';

export interface HoleritePaymentLine {
  date: string;
  dailyRate: number;
  bonusB: number;
  bonusC1: number;
  bonusC2: number;
}

export interface HoleriteData {
  company: { name: string; cnpj?: string };
  employee: {
    name: string;
    cpf: string;
    functionRole?: string;
    employmentType?: string;
    hireDate?: string;
    registrationNumber?: string;
  };
  period: { start: string; end: string };
  payments: HoleritePaymentLine[];
  errorDiscount: number;
  triageDiscount: number;
  totalDailyRate: number;
  totalBonusB: number;
  totalBonusC1: number;
  totalBonusC2: number;
  totalGross: number;
  totalNet: number;
  generatedAt?: string;
}

const PAGE_W = 595;
const X_LEFT = 40;
const X_RIGHT = 555;

// Cores corporativas (defaults — sobrescrevíveis via futuro `theme`)
const COLOR_PRIMARY = [50, 100, 150];      // azul header
const COLOR_SUCCESS = [34, 139, 34];        // verde líquido
const COLOR_DANGER = [180, 50, 50];         // vermelho descontos
const COLOR_BG_BOX = [248, 250, 252];       // cinza claro box

function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function workingDaysFromPayments(payments: HoleritePaymentLine[]): number {
  return payments.filter((p) => p.dailyRate > 0).length;
}

function bonusInstancesFromPayments(payments: HoleritePaymentLine[]): { b: number; c1: number; c2: number } {
  return {
    b: payments.filter((p) => p.bonusB > 0).length,
    c1: payments.filter((p) => p.bonusC1 > 0).length,
    c2: payments.filter((p) => p.bonusC2 > 0).length,
  };
}

function buildPdf(data: HoleriteData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  // ═══ Header empresa ═══
  doc.setFont('helvetica', 'bold').setFontSize(18);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text(data.company.name.toUpperCase(), PAGE_W / 2, 50, { align: 'center' });

  doc.setTextColor(80);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  if (data.company.cnpj) {
    doc.text(`CNPJ: ${data.company.cnpj}`, PAGE_W / 2, 64, { align: 'center' });
  }

  // Título principal com fundo
  doc.setFillColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.rect(X_LEFT, 78, X_RIGHT - X_LEFT, 28, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold').setFontSize(14);
  doc.text('RECIBO DE PAGAMENTO', PAGE_W / 2, 96, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(10);
  const periodoStr = `Período: ${formatDateBR(data.period.start)} a ${formatDateBR(data.period.end)}`;
  doc.setTextColor(220);
  doc.setFontSize(9);
  doc.text(periodoStr, PAGE_W / 2, 100 + 4, { align: 'center', baseline: 'top' });
  doc.setTextColor(0);

  // ═══ Box dados funcionário (grid 2x4) ═══
  const boxY = 120;
  const boxH = 92;
  doc.setFillColor(COLOR_BG_BOX[0], COLOR_BG_BOX[1], COLOR_BG_BOX[2]);
  doc.rect(X_LEFT, boxY, X_RIGHT - X_LEFT, boxH, 'F');
  doc.setDrawColor(200);
  doc.setLineWidth(0.4);
  doc.rect(X_LEFT, boxY, X_RIGHT - X_LEFT, boxH, 'S');

  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text('DADOS DO FUNCIONÁRIO', X_LEFT + 10, boxY + 14);
  doc.setTextColor(0);

  // Grid 2 colunas × 4 linhas
  const col1X = X_LEFT + 10;
  const col2X = X_LEFT + (X_RIGHT - X_LEFT) / 2 + 5;
  const workingDays = workingDaysFromPayments(data.payments);
  const bonusCounts = bonusInstancesFromPayments(data.payments);
  const totalBonusEvents = bonusCounts.b + bonusCounts.c1 + bonusCounts.c2;

  const grid: Array<[string, string, string, string]> = [
    ['Nome', data.employee.name, 'Matrícula', data.employee.registrationNumber || '—'],
    ['CPF', formatCpf(data.employee.cpf), 'Função', data.employee.functionRole || '—'],
    ['Tipo de Contrato', data.employee.employmentType || '—', 'Data Admissão', data.employee.hireDate ? formatDateBR(data.employee.hireDate) : '—'],
    ['Dias Trabalhados', String(workingDays), 'Bônus Aplicados', String(totalBonusEvents)],
  ];

  let rowY = boxY + 28;
  for (const [k1, v1, k2, v2] of grid) {
    doc.setFont('helvetica', 'bold').setFontSize(8.5);
    doc.setTextColor(100);
    doc.text(`${k1}:`, col1X, rowY);
    doc.text(`${k2}:`, col2X, rowY);
    doc.setFont('helvetica', 'normal').setFontSize(9);
    doc.setTextColor(0);
    doc.text(v1, col1X + 75, rowY);
    doc.text(v2, col2X + 75, rowY);
    rowY += 14;
  }

  // ═══ Tabela Composição do Pagamento ═══
  const compY = boxY + boxH + 18;
  doc.setFont('helvetica', 'bold').setFontSize(11);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text('COMPOSIÇÃO DO PAGAMENTO', X_LEFT, compY);
  doc.setTextColor(0);

  const proventos: Array<[string, string, string]> = [
    [`Diárias (${workingDays} dia${workingDays !== 1 ? 's' : ''})`, '+', fmtBRL(data.totalDailyRate)],
  ];
  if (data.totalBonusB > 0) proventos.push([`Bonificação B (${bonusCounts.b}×)`, '+', fmtBRL(data.totalBonusB)]);
  if (data.totalBonusC1 > 0) proventos.push([`Bonificação C1 (${bonusCounts.c1}×)`, '+', fmtBRL(data.totalBonusC1)]);
  if (data.totalBonusC2 > 0) proventos.push([`Bonificação C2 (${bonusCounts.c2}×)`, '+', fmtBRL(data.totalBonusC2)]);

  const descontos: Array<[string, string, string]> = [];
  if (data.errorDiscount > 0) descontos.push(['Desconto de Erros', '−', fmtBRL(data.errorDiscount)]);
  if (data.triageDiscount > 0) descontos.push(['Desconto de Triagem', '−', fmtBRL(data.triageDiscount)]);

  autoTable(doc, {
    startY: compY + 6,
    head: [['Descrição', 'Tipo', 'Valor (R$)']],
    body: [...proventos, ...descontos],
    theme: 'grid',
    headStyles: { fillColor: [COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]], textColor: 255, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 9.5, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: 320 },
      1: { cellWidth: 50, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 145, halign: 'right' },
    },
    didParseCell: (cell) => {
      // Tipo "−" pintado vermelho
      if (cell.section === 'body' && cell.column.index === 1 && cell.cell.text[0] === '−') {
        cell.cell.styles.textColor = [COLOR_DANGER[0], COLOR_DANGER[1], COLOR_DANGER[2]];
      }
    },
    margin: { left: X_LEFT, right: PAGE_W - X_RIGHT },
  });

  // @ts-expect-error — autoTable mutates doc.lastAutoTable
  const afterComp = doc.lastAutoTable?.finalY || compY + 100;

  // ═══ Resumo por Categoria ═══
  const totalProventos = data.totalGross;
  const totalDescontos = (data.errorDiscount || 0) + (data.triageDiscount || 0);

  autoTable(doc, {
    startY: afterComp + 12,
    body: [
      ['TOTAL DE PROVENTOS', fmtBRL(totalProventos)],
      ['TOTAL DE DESCONTOS', `−${fmtBRL(totalDescontos)}`],
    ],
    foot: [['VALOR LÍQUIDO A RECEBER', fmtBRL(data.totalNet)]],
    theme: 'plain',
    styles: { fontSize: 10.5, cellPadding: 7 },
    bodyStyles: { fontStyle: 'bold' },
    footStyles: { fillColor: [COLOR_SUCCESS[0], COLOR_SUCCESS[1], COLOR_SUCCESS[2]], textColor: 255, fontStyle: 'bold', fontSize: 13 },
    columnStyles: {
      0: { cellWidth: 370 },
      1: { cellWidth: 145, halign: 'right' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'body' && cell.row.index === 1) {
        cell.cell.styles.textColor = [COLOR_DANGER[0], COLOR_DANGER[1], COLOR_DANGER[2]];
      }
    },
    margin: { left: X_LEFT, right: PAGE_W - X_RIGHT },
  });

  // @ts-expect-error — autoTable mutates doc.lastAutoTable
  const afterResumo = doc.lastAutoTable?.finalY || afterComp + 80;

  // ═══ Footer: data + assinaturas ═══
  let yFooter = afterResumo + 40;
  doc.setFont('helvetica', 'italic').setFontSize(8.5);
  doc.setTextColor(120);
  const generatedAt = data.generatedAt || new Date().toLocaleString('pt-BR');
  doc.text(`Documento gerado em ${generatedAt}`, X_LEFT, yFooter);
  doc.text('Sistema de Ponto — Recibo de Pagamento', X_RIGHT, yFooter, { align: 'right' });
  doc.setTextColor(0);

  yFooter += 50;
  doc.setLineWidth(0.5);
  doc.setDrawColor(80);

  doc.line(X_LEFT, yFooter, X_LEFT + 220, yFooter);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text('Assinatura do funcionário', X_LEFT + 110, yFooter + 14, { align: 'center' });

  doc.line(X_RIGHT - 220, yFooter, X_RIGHT, yFooter);
  doc.text('Assinatura do empregador', X_RIGHT - 110, yFooter + 14, { align: 'center' });

  return doc;
}

export async function generateHoleritePdf(data: HoleriteData): Promise<Blob> {
  const doc = buildPdf(data);
  return doc.output('blob');
}

export async function downloadHoleritePdf(data: HoleriteData, filename?: string): Promise<void> {
  const doc = buildPdf(data);
  const fname = filename || `holerite_${data.employee.name.replace(/\s+/g, '_')}_${data.period.start}_${data.period.end}.pdf`;
  doc.save(fname);
}
