/**
 * Sub-fase 17.2: gerador de PDF de holerite/recibo de pagamento.
 *
 * Layout A4 portrait com:
 *   - Header: nome empresa + título "RECIBO DE PAGAMENTO"
 *   - Funcionário: nome + CPF + função
 *   - Período: data início → fim
 *   - Breakdown: dias trabalhados + bonus B/C1/C2 + descontos (erro/triagem) = líquido
 *   - Footer: assinatura do funcionário
 *
 * MVP — layout default (A4 portrait, fonte sans, sem logo da empresa).
 * Customizações (logo, layout corporativo) ficam como follow-up.
 *
 * API pública:
 *   downloadHoleritePdf(data: HoleriteData, filename?: string): Promise<void>
 *   generateHoleritePdf(data: HoleriteData): Promise<Blob>
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
    role?: string;
    employmentType?: string;
  };
  period: { start: string; end: string };
  payments: HoleritePaymentLine[];
  errorDiscount: number;
  triageDiscount: number;
  // Computed (passar pré-calculado pra evitar drift com FinancialTab)
  totalDailyRate: number;
  totalBonusB: number;
  totalBonusC1: number;
  totalBonusC2: number;
  totalGross: number;
  totalNet: number;
  generatedAt?: string;
}

const PAGE_W = 595; // A4 portrait
const X_LEFT = 40;
const X_RIGHT = 555;

function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function buildPdf(data: HoleriteData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  // === Header ===
  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text(data.company.name.toUpperCase(), PAGE_W / 2, 50, { align: 'center' });

  if (data.company.cnpj) {
    doc.setFont('helvetica', 'normal').setFontSize(9);
    doc.text(`CNPJ: ${data.company.cnpj}`, PAGE_W / 2, 65, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold').setFontSize(13);
  doc.text('RECIBO DE PAGAMENTO', PAGE_W / 2, 90, { align: 'center' });

  // Linha divisória
  doc.setLineWidth(0.5);
  doc.line(X_LEFT, 100, X_RIGHT, 100);

  // === Funcionário ===
  let y = 125;
  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.text('FUNCIONÁRIO:', X_LEFT, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.employee.name, X_LEFT + 90, y);

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.text('CPF:', X_LEFT, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCpf(data.employee.cpf), X_LEFT + 90, y);

  if (data.employee.employmentType) {
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.text('TIPO:', X_LEFT, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.employee.employmentType, X_LEFT + 90, y);
  }

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.text('PERÍODO:', X_LEFT, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatDateBR(data.period.start)} a ${formatDateBR(data.period.end)}`, X_LEFT + 90, y);

  y += 25;

  // === Tabela breakdown ===
  const body: Array<[string, string]> = [
    ['Dias trabalhados (diárias)', fmtBRL(data.totalDailyRate)],
  ];

  if (data.totalBonusB > 0) body.push(['Bonificação B', fmtBRL(data.totalBonusB)]);
  if (data.totalBonusC1 > 0) body.push(['Bonificação C1', fmtBRL(data.totalBonusC1)]);
  if (data.totalBonusC2 > 0) body.push(['Bonificação C2', fmtBRL(data.totalBonusC2)]);

  body.push(['', '']);
  body.push(['SUBTOTAL BRUTO', fmtBRL(data.totalGross)]);
  body.push(['', '']);

  if (data.errorDiscount > 0) body.push(['Desconto de erros', `-${fmtBRL(data.errorDiscount)}`]);
  if (data.triageDiscount > 0) body.push(['Desconto de triagem', `-${fmtBRL(data.triageDiscount)}`]);

  autoTable(doc, {
    startY: y,
    head: [['DESCRIÇÃO', 'VALOR']],
    body,
    foot: [['LÍQUIDO A RECEBER', fmtBRL(data.totalNet)]],
    theme: 'grid',
    headStyles: { fillColor: [50, 100, 150], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold', fontSize: 12 },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: 350 },
      1: { cellWidth: 165, halign: 'right' },
    },
    margin: { left: X_LEFT, right: PAGE_W - X_RIGHT },
  });

  // === Footer: data + assinaturas ===
  // @ts-expect-error — autoTable mutates doc.lastAutoTable
  const finalY = doc.lastAutoTable?.finalY || y + 200;

  let yFooter = finalY + 40;
  doc.setFont('helvetica', 'normal').setFontSize(9);
  const generatedAt = data.generatedAt || new Date().toLocaleString('pt-BR');
  doc.text(`Gerado em ${generatedAt}`, X_LEFT, yFooter);

  yFooter += 40;
  doc.setLineWidth(0.5);
  doc.line(X_LEFT, yFooter, X_LEFT + 200, yFooter);
  doc.text('Assinatura do funcionário', X_LEFT + 50, yFooter + 12);

  doc.line(X_RIGHT - 200, yFooter, X_RIGHT, yFooter);
  doc.text('Assinatura do empregador', X_RIGHT - 150, yFooter + 12);

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
