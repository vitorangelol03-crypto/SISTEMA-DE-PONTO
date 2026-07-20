/**
 * Aba "Pagamentos Driver" (iMile CTGA) — gerador de PDF do espelho de pagamento.
 *
 * Layout A4 **portrait**, seguindo o idioma do holerite (`holeritePdf.ts`):
 * header da empresa + faixa azul de título + box de dados + tabelas autoTable
 * com `foot`, descontos/vales em vermelho, faixa verde de TOTAL A RECEBER e
 * assinaturas. Batch multipágina e leitura de `finalY` via cast tipado seguem o
 * idioma de `mirrorPdf.ts` (sem `@ts-expect-error`).
 *
 * O PDF **não recalcula dinheiro** — recebe `DriverMirrorData` já computado pelo
 * gerador (`driverMirrorGenerator.ts`), fonte única da fórmula.
 *
 * API pública (assinaturas estáveis — o Agente Componentes depende):
 *   generateDriverMirrorPdf(data)                      → Promise<Blob>
 *   downloadDriverMirrorPdf(data, filename?)           → Promise<void>
 *   generateDriverGroupMirrorPdf(data, opts?)          → Promise<Blob>
 *   downloadDriverGroupMirrorPdf(data, filename?, opts?)→ Promise<void>
 *   generateDriverMirrorsBatchPdf(list)                → Promise<Blob>
 *   downloadDriverMirrorsBatchPdf(list, filename?)     → Promise<void>
 */

import { jsPDF } from 'jspdf';
import autoTable, { type RowInput, type Styles } from 'jspdf-autotable';
import {
  type DriverMirrorData,
  type DriverGroupMirrorData,
  type MirrorCutoffLine,
  type SeparatedPlatformTotal,
  fmtBRL,
  fmtQty,
  formatDateBR,
  formatCnpj,
  joinRouteCities,
  packagesForPlatform,
  collectPlatformNames,
  platformLineLabel,
  separatedPlatformTotals,
  separatedAmount,
} from './driverMirrorGenerator';

// Reexporta os tipos para que consumidores possam importar tudo deste módulo.
export type {
  DriverMirrorData,
  DriverGroupMirrorData,
  DriverRoute,
  DriverPlatformLine,
  DriverDiscountLine,
  DriverValeLine,
  DriverMirrorTotals,
  DriverMirrorCompany,
  DriverMirrorPeriod,
  MirrorCutoffLine,
} from './driverMirrorGenerator';

/** Opções do espelho de grupo. `compact`: só a página-resumo (sem espelhos individuais). */
export interface DriverGroupMirrorOptions {
  compact?: boolean;
}

// ─── Constantes de layout (pt) — A4 portrait, idioma holeritePdf ──────────────

const PAGE_W = 595;
const PAGE_H = 842;
const X_LEFT = 40;
const X_RIGHT = 555;
const CONTENT_W = X_RIGHT - X_LEFT; // 515
const TOP_MARGIN = 50;
const PAGE_BOTTOM = PAGE_H - 40; // 802

// Cores (tuplas RGB — satisfazem o tipo `Color` do autoTable sem spread).
const COLOR_PRIMARY: [number, number, number] = [37, 99, 235]; // blue-600
const COLOR_SUCCESS: [number, number, number] = [21, 128, 61]; // green-700
const COLOR_DANGER: [number, number, number] = [185, 28, 28]; // red-700
const COLOR_BG_BOX: [number, number, number] = [249, 250, 251]; // gray-50
const COLOR_BORDER: [number, number, number] = [229, 231, 235]; // gray-200
const COLOR_MUTED: [number, number, number] = [107, 114, 128]; // gray-500
const COLOR_INK: [number, number, number] = [17, 24, 39]; // gray-900
const COLOR_SECTION: [number, number, number] = [75, 85, 99]; // gray-600
const COLOR_BAND_SUB: [number, number, number] = [219, 234, 254]; // blue-100
const COLOR_FOOT_BG: [number, number, number] = [238, 242, 247]; // gray-100 azulado
// 2026-07-19 — destaque/avisos dos espelhos (pedido do Victor):
const COLOR_HL_YELLOW: [number, number, number] = [254, 240, 138]; // yellow-200 (célula destacada)
const COLOR_NOTICE_BG: [number, number, number] = [254, 249, 195]; // yellow-100 (faixas de aviso)
const COLOR_NOTICE_BORDER: [number, number, number] = [234, 179, 8]; // yellow-500 (borda/setas)
const COLOR_PNR: [number, number, number] = [126, 34, 206]; // purple-700 (pill PNR da tela)
const COLOR_LOST: [number, number, number] = [194, 65, 12]; // orange-700 (pill LOST da tela)
const WHITE: [number, number, number] = [255, 255, 255];

// Estilos base compartilhados pelas tabelas autoTable.
const BASE_TABLE_STYLES: Partial<Styles> = {
  font: 'helvetica',
  fontSize: 9.5,
  cellPadding: 5,
  lineColor: COLOR_BORDER,
  lineWidth: 0.4,
  textColor: COLOR_INK,
};
const AUTOTABLE_MARGIN = { left: X_LEFT, right: PAGE_W - X_RIGHT };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lê `finalY` da última tabela via cast tipado (idioma `mirrorPdf.ts`). */
function getFinalY(doc: jsPDF, fallback: number): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof last?.finalY === 'number' ? last.finalY : fallback;
}

/** Quebra de página quando não há espaço; retorna o novo Y (topo da página nova). */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_BOTTOM) {
    doc.addPage('a4', 'portrait');
    return TOP_MARGIN;
  }
  return y;
}

function sanitizeFilenamePart(value: string): string {
  return (value || '')
    .trim()
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_');
}

function periodDisplay(period: DriverMirrorData['period']): string {
  if (period.start && period.end) {
    return `${formatDateBR(period.start)} a ${formatDateBR(period.end)}`;
  }
  return period.label;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): void {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...COLOR_SECTION);
  doc.text(title, X_LEFT, y);
  doc.setTextColor(0);
}

/** Pílula branca "CONCLUÍDO" alinhada à direita dentro da faixa azul. */
function drawStatusPill(doc: jsPDF, label: string, rightX: number, centerY: number): void {
  doc.setFont('helvetica', 'bold').setFontSize(8);
  const textW = doc.getTextWidth(label);
  const padX = 7;
  const h = 15;
  const w = textW + padX * 2;
  const x = rightX - w;
  const y = centerY - h / 2;
  doc.setFillColor(...WHITE);
  doc.roundedRect(x, y, w, h, 4, 4, 'F');
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text(label, x + padX, centerY + 2.8);
}

/** Header da empresa (nome + linha "cidade · CNPJ"). Desenha no topo da página. */
function drawCompanyHeader(doc: jsPDF, company: DriverMirrorData['company']): void {
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...COLOR_PRIMARY);
  doc.text(company.name.toUpperCase(), PAGE_W / 2, 50, { align: 'center' });

  const sub: string[] = [];
  if (company.city) sub.push(company.city);
  if (company.cnpj) sub.push(`CNPJ ${formatCnpj(company.cnpj)}`);
  if (sub.length > 0) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COLOR_MUTED);
    doc.text(sub.join('  ·  '), PAGE_W / 2, 64, { align: 'center' });
  }
  doc.setTextColor(0);
}

/** Faixa azul de título + rótulo do período + pílula de status opcional. */
function drawBand(
  doc: jsPDF,
  title: string,
  period: DriverMirrorData['period'],
): void {
  const bandY = 78;
  const bandH = 30;
  doc.setFillColor(...COLOR_PRIMARY);
  doc.rect(X_LEFT, bandY, CONTENT_W, bandH, 'F');

  doc.setTextColor(...WHITE).setFont('helvetica', 'bold').setFontSize(12.5);
  doc.text(title, X_LEFT + 12, bandY + 13);

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COLOR_BAND_SUB);
  doc.text(period.label, X_LEFT + 12, bandY + 24);

  if (period.status === 'concluido') {
    drawStatusPill(doc, 'CONCLUÍDO', X_RIGHT - 12, bandY + bandH / 2);
  }
  doc.setTextColor(0);
}

/** Campo empilhado (rótulo maiúsculo cinza + valor). Retorna o Y da última linha do valor. */
function drawStackedField(
  doc: jsPDF,
  key: string,
  value: string,
  x: number,
  keyY: number,
  maxWidth?: number,
): number {
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...COLOR_MUTED);
  doc.text(key.toUpperCase(), x, keyY);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...COLOR_INK);
  const text = value && value.trim().length > 0 ? value : '—';
  if (maxWidth) {
    const lines = (doc.splitTextToSize(text, maxWidth) as string[]).slice(0, 2);
    lines.forEach((line, i) => doc.text(line, x, keyY + 11 + i * 11));
    return keyY + 11 + (lines.length - 1) * 11;
  }
  doc.text(text, x, keyY + 11);
  return keyY + 11;
}

// ─── Avisos dos espelhos (2026-07-19) ────────────────────────────────────────

interface MirrorSegment {
  text: string;
  bold?: boolean;
  color?: [number, number, number];
  size: number;
  /**
   * Gap em pt ANTES do segmento. Espaço-caractere entre segmentos é engolido
   * pelos visualizadores (a fonte substituta desenha o trecho longo anterior
   * um pouco mais largo que a medida do jsPDF) — gap de posição não é.
   */
  padLeft?: number;
}

/** Escreve segmentos com estilos mistos numa linha única centralizada. */
function drawSegmentsCentered(doc: jsPDF, segments: MirrorSegment[], y: number): void {
  const widths = segments.map((s) => {
    doc.setFont('helvetica', s.bold ? 'bold' : 'normal').setFontSize(s.size);
    return doc.getTextWidth(s.text) + (s.padLeft ?? 0);
  });
  let x = PAGE_W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  segments.forEach((s, i) => {
    doc
      .setFont('helvetica', s.bold ? 'bold' : 'normal')
      .setFontSize(s.size)
      .setTextColor(...(s.color ?? COLOR_INK));
    doc.text(s.text, x + (s.padLeft ?? 0), y);
    x += widths[i];
  });
  doc.setTextColor(0);
}

/** Largura total de uma linha de segmentos (para auto-ajuste de fonte). */
function segmentsWidth(doc: jsPDF, segments: MirrorSegment[]): number {
  return segments.reduce((sum, s) => {
    doc.setFont('helvetica', s.bold ? 'bold' : 'normal').setFontSize(s.size);
    return sum + doc.getTextWidth(s.text) + (s.padLeft ?? 0);
  }, 0);
}

/** Reduz proporcionalmente as fontes até a linha caber na largura útil da faixa. */
function fitSegments(doc: jsPDF, segments: MirrorSegment[], maxWidth: number): MirrorSegment[] {
  let scaled = segments;
  for (let i = 0; i < 6 && segmentsWidth(doc, scaled) > maxWidth; i++) {
    scaled = scaled.map((s) => ({ ...s, size: Math.max(6.5, s.size * 0.93) }));
  }
  return scaled;
}

/**
 * Faixa amarela do CORTE DAS NOTAS (presente em todo espelho quando configurada):
 * hora/data em vermelho grande; 2ª linha com a data de pagamento tardio.
 * Auto-ajusta a fonte para o texto NUNCA vazar da faixa (simetria garantida).
 */
function drawCutoffBand(doc: jsPDF, cutoff: MirrorCutoffLine, y: number): number {
  const h = 42;
  const usable = CONTENT_W - 24;
  doc.setFillColor(...COLOR_NOTICE_BG);
  doc.rect(X_LEFT, y, CONTENT_W, h, 'F');
  doc.setDrawColor(...COLOR_NOTICE_BORDER).setLineWidth(1);
  doc.rect(X_LEFT, y, CONTENT_W, h, 'S');

  // Separação entre segmentos via padLeft (gap de posição) — nunca por
  // espaço-caractere, que os visualizadores engolem (ver MirrorSegment).
  const line1 = fitSegments(
    doc,
    [
      { text: 'As notas deverão ser enviadas até as', bold: true, size: 9.5 },
      { text: `${cutoff.time}H do dia ${cutoff.date}`, bold: true, color: COLOR_DANGER, size: 11.5, padLeft: 4 },
      { text: ', fiquem atentos para que não ocorra atrasos no pagamento!', bold: true, size: 9.5 },
    ],
    usable,
  );
  drawSegmentsCentered(doc, line1, y + 17);

  const line2 = fitSegments(
    doc,
    [
      { text: 'Caso exceda o horário de corte seu pagamento vai ocorrer dia', size: 8.5 },
      { text: cutoff.lateDate, bold: true, color: COLOR_DANGER, size: 9.5, padLeft: 4 },
    ],
    usable,
  );
  drawSegmentsCentered(doc, line2, y + 33);
  return y + h + 10;
}

interface NoticeBandAnchor {
  platform: string;
  bottomY: number;
  page: number;
}

/**
 * Faixas de AVISO POR PLATAFORMA (grandes/chamativas; nome da plataforma em
 * destaque). Retorna o novo y + âncoras para as setas de ligação.
 */
function drawPlatformNoticeBands(
  doc: jsPDF,
  notices: Array<{ platform: string; text: string }>,
  y: number,
): { y: number; anchors: NoticeBandAnchor[] } {
  const anchors: NoticeBandAnchor[] = [];
  for (const n of notices) {
    // Prefixo em linha própria quando a mensagem quebra — nada de texto grudado.
    const prefix = `AVISO ${n.platform.toUpperCase()}`;
    doc.setFont('helvetica', 'bold').setFontSize(10.5);
    const prefixW = doc.getTextWidth(`${prefix}:`);
    const msgLines = doc.splitTextToSize(n.text, CONTENT_W - 32 - prefixW - 8) as string[];
    const singleLine = msgLines.length === 1;
    const bodyLines = singleLine ? [] : (doc.splitTextToSize(n.text, CONTENT_W - 32) as string[]);
    const h = singleLine ? 26 : 24 + bodyLines.length * 13;
    y = ensureSpace(doc, y, h + 10);

    doc.setFillColor(...COLOR_NOTICE_BG);
    doc.rect(X_LEFT, y, CONTENT_W, h, 'F');
    doc.setDrawColor(...COLOR_NOTICE_BORDER).setLineWidth(1.2);
    doc.rect(X_LEFT, y, CONTENT_W, h, 'S');

    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...COLOR_DANGER);
    doc.text(`${prefix}:`, X_LEFT + 16, y + 17);
    doc.setTextColor(...COLOR_INK);
    if (singleLine) {
      doc.text(n.text, X_LEFT + 16 + prefixW + 6, y + 17);
    } else {
      let ty = y + 31;
      for (const line of bodyLines) {
        doc.text(line, X_LEFT + 16, ty);
        ty += 13;
      }
    }
    doc.setTextColor(0);

    anchors.push({ platform: n.platform, bottomY: y + h, page: doc.getCurrentPageInfo().pageNumber });
    y += h + 8;
  }
  return { y, anchors };
}

/**
 * Marcadores de seta LIMPOS (design 19/07 v2 — a linha comprida atravessava o
 * layout): triângulo ▶ colado à esquerda da LINHA destacada (individual) e
 * triângulo ▼ logo acima da COLUNA destacada (grupo). A ligação com a faixa de
 * aviso é feita pelo NOME da plataforma no próprio aviso.
 */
function drawRowArrow(doc: jsPDF, rowCenterY: number): void {
  doc.setFillColor(...COLOR_NOTICE_BORDER);
  doc.triangle(X_LEFT - 12, rowCenterY - 4.5, X_LEFT - 12, rowCenterY + 4.5, X_LEFT - 3, rowCenterY, 'F');
}

function drawColumnArrow(doc: jsPDF, centerX: number, headTopY: number): void {
  doc.setFillColor(...COLOR_NOTICE_BORDER);
  doc.triangle(centerX - 5, headTopY - 7, centerX + 5, headTopY - 7, centerX, headTopY - 1, 'F');
}

/**
 * Faixa amarela do VALOR SEPARADO (2026-07-20): o valor da plataforma marcada
 * sai FORA do TOTAL A RECEBER. O texto é explícito de propósito — os drivers
 * são leigos e não podem achar que vão receber o valor duas vezes (nem que
 * ele "sumiu" do total).
 */
function drawSeparatedValueBanner(
  doc: jsPDF,
  label: string,
  sepItem: SeparatedPlatformTotal,
  y: number,
): number {
  const h = 44;
  doc.setFillColor(...COLOR_NOTICE_BG);
  doc.rect(X_LEFT, y, CONTENT_W, h, 'F');
  doc.setDrawColor(...COLOR_NOTICE_BORDER).setLineWidth(1.2);
  doc.rect(X_LEFT, y, CONTENT_W, h, 'S');

  // Auto-fit (aprendizado 19/07): rótulo e aviso NUNCA vazam da faixa nem
  // encostam no valor — reduz a fonte até caber (simetria garantida).
  doc.setFont('helvetica', 'bold').setFontSize(14);
  const valueW = doc.getTextWidth(fmtBRL(sepItem.amount));
  const maxLabelW = CONTENT_W - 28 - valueW - 12;
  let labelSize = 11;
  doc.setFontSize(labelSize).setTextColor(...COLOR_INK);
  for (let i = 0; i < 6 && doc.getTextWidth(label) > maxLabelW; i++) {
    labelSize = Math.max(6.5, labelSize * 0.93);
    doc.setFontSize(labelSize);
  }
  doc.text(label, X_LEFT + 14, y + 18);
  doc.setFontSize(14);
  doc.text(fmtBRL(sepItem.amount), X_RIGHT - 14, y + 19, { align: 'right' });

  const warn = 'ESTE VALOR É PAGO SEPARADO — ELE NÃO ESTÁ SOMADO NO "TOTAL A RECEBER" ACIMA.';
  let warnSize = 8.5;
  doc.setFont('helvetica', 'bold').setFontSize(warnSize).setTextColor(...COLOR_DANGER);
  for (let i = 0; i < 6 && doc.getTextWidth(warn) > CONTENT_W - 28; i++) {
    warnSize = Math.max(6.5, warnSize * 0.93);
    doc.setFontSize(warnSize);
  }
  doc.text(warn, X_LEFT + 14, y + 34);
  doc.setTextColor(0);
  return y + h;
}

/** Faixa verde de resumo (idioma mockup `.esp-resumo .grand`). */
function drawGreenBanner(doc: jsPDF, label: string, value: string, y: number): number {
  const h = 34;
  doc.setFillColor(...COLOR_SUCCESS);
  doc.rect(X_LEFT, y, CONTENT_W, h, 'F');
  doc.setTextColor(...WHITE).setFont('helvetica', 'bold').setFontSize(11);
  doc.text(label, X_LEFT + 14, y + h / 2 + 3.5);
  doc.setFontSize(16);
  doc.text(value, X_RIGHT - 14, y + h / 2 + 5, { align: 'right' });
  doc.setTextColor(0);
  return y + h;
}

// ─── Espelho individual ───────────────────────────────────────────────────────

/** Desenha um espelho de driver na página atual (assume topo livre). */
function drawDriverMirrorPage(doc: jsPDF, data: DriverMirrorData): void {
  const { company, period, driver, platforms, discounts, vales, totals } = data;

  drawCompanyHeader(doc, company);
  drawBand(doc, 'ESPELHO DE PAGAMENTO — DRIVER', period);

  // ── Avisos do topo (2026-07-19): corte das notas + avisos de plataforma ──
  // Regra de presença: `platforms` já contém só plataformas com pacotes>0 deste driver.
  // Dedup por plataforma: multi-rota (2026-07-20) gera uma linha POR ROTA — o aviso
  // continua saindo UMA vez por plataforma.
  const noticeMap = new Map<string, string>();
  for (const p of platforms) {
    if (p.highlight && p.notice) noticeMap.set(p.platform, p.notice);
  }
  const platformNotices = Array.from(noticeMap, ([platform, text]) => ({ platform, text }));
  let topY = 118;
  if (data.cutoff) topY = drawCutoffBand(doc, data.cutoff, topY);
  if (platformNotices.length > 0) {
    topY = drawPlatformNoticeBands(doc, platformNotices, topY).y;
  }

  // ── Box "DADOS DO DRIVER" ──
  const routeText = joinRouteCities(driver.routes) || '—';
  doc.setFont('helvetica', 'normal').setFontSize(10);
  const routeLines = (doc.splitTextToSize(routeText, CONTENT_W - 24) as string[]).slice(0, 2);

  const boxY = topY + 2;
  const col1X = X_LEFT + 12;
  const col2X = X_LEFT + CONTENT_W / 2 + 6;
  const titleY = boxY + 15;
  const row1KeyY = boxY + 32;
  const row2KeyY = boxY + 60;
  const rotaKeyY = boxY + 88;
  const lastRotaValY = rotaKeyY + 11 + (routeLines.length - 1) * 11;
  const boxH = lastRotaValY - boxY + 12;

  doc.setFillColor(...COLOR_BG_BOX);
  doc.rect(X_LEFT, boxY, CONTENT_W, boxH, 'F');
  doc.setDrawColor(...COLOR_BORDER).setLineWidth(0.5);
  doc.rect(X_LEFT, boxY, CONTENT_W, boxH, 'S');

  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...COLOR_PRIMARY);
  doc.text('DADOS DO DRIVER', col1X, titleY);
  doc.setTextColor(0);

  drawStackedField(doc, 'Driver', driver.name, col1X, row1KeyY);
  drawStackedField(doc, 'Grupo', driver.group || '—', col2X, row1KeyY);
  drawStackedField(doc, 'Período', periodDisplay(period), col1X, row2KeyY);
  drawStackedField(doc, 'Chave PIX', driver.pixKey || '—', col2X, row2KeyY);

  // Rota(s) — largura total, até 2 linhas.
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...COLOR_MUTED);
  doc.text(driver.routes.length > 1 ? 'ROTAS' : 'ROTA', col1X, rotaKeyY);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...COLOR_INK);
  routeLines.forEach((line, i) => doc.text(line, col1X, rotaKeyY + 11 + i * 11));
  doc.setTextColor(0);

  let y = boxY + boxH + 20;
  const platformNames = platforms.map((p) => p.platform);

  // ── Detalhe por rota × plataforma (só multi-rota com breakdown) ──
  const hasRouteBreakdown =
    driver.routes.length > 1 && driver.routes.some((r) => r.packagesByPlatform);
  if (hasRouteBreakdown && platformNames.length > 0) {
    y = ensureSpace(doc, y, 70);
    drawSectionTitle(doc, 'PACOTES POR ROTA × PLATAFORMA', y);

    const head: RowInput[] = [['Rota / Cidade', ...platformNames, 'Total']];
    const body: RowInput[] = driver.routes.map((r) => {
      const byPlat = r.packagesByPlatform ?? {};
      const cols = platformNames.map((name) => fmtQty(byPlat[name] ?? 0));
      const total = platformNames.reduce((s, name) => s + (byPlat[name] ?? 0), 0);
      return [r.city || '—', ...cols, fmtQty(total)];
    });
    const footPlatformSums = platformNames.map((name) =>
      fmtQty(driver.routes.reduce((s, r) => s + (r.packagesByPlatform?.[name] ?? 0), 0)),
    );
    const grandTotal = driver.routes.reduce((s, r) => s + (r.totalPackages ?? 0), 0);
    const foot: RowInput[] = [['Total por plataforma', ...footPlatformSums, fmtQty(grandTotal)]];

    const columnStyles: Record<string, Partial<Styles>> = { 0: { halign: 'left' } };
    for (let i = 1; i <= platformNames.length + 1; i++) columnStyles[i] = { halign: 'right' };

    autoTable(doc, {
      startY: y + 6,
      head,
      body,
      foot,
      theme: 'grid',
      styles: BASE_TABLE_STYLES,
      headStyles: { fillColor: COLOR_FOOT_BG, textColor: COLOR_SECTION, fontStyle: 'bold' },
      footStyles: { fillColor: COLOR_FOOT_BG, textColor: COLOR_INK, fontStyle: 'bold' },
      columnStyles,
      margin: AUTOTABLE_MARGIN,
    });
    y = getFinalY(doc, y + 6) + 16;
  }

  // ── Valores por plataforma ──
  y = ensureSpace(doc, y, 80);
  drawSectionTitle(doc, 'VALORES POR PLATAFORMA', y);

  // Valor separado (2026-07-20): plataformas marcadas saem do total exibido e
  // ganham linha própria no rodapé + faixa amarela junto do TOTAL A RECEBER.
  const sep = separatedPlatformTotals(platforms);
  const sepTotal = sep.reduce((s, x) => s + x.amount, 0);
  const sepNames = sep.map((s) => s.platform.toUpperCase()).join(' + ');

  const platHead: RowInput[] = [['Plataforma', 'Pacotes', 'Valor/Pacote', 'Subtotal (R$)']];
  // Multi-rota (2026-07-20): pode haver mais de uma linha da mesma plataforma
  // ("SHOPEE — Caratinga", "SHOPEE — COLETA"), cada uma com a taxa real da rota.
  const platBody: RowInput[] = platforms.map((p) => [
    platformLineLabel(p),
    fmtQty(p.packages),
    fmtBRL(p.unitValue),
    fmtBRL(p.subtotal),
  ]);
  const platFoot: RowInput[] = [
    ...sep.map((s): RowInput => [
      {
        content: `TOTAL ${s.platform.toUpperCase()} — PAGO SEPARADO, FORA DO TOTAL ABAIXO`,
        colSpan: 3,
        styles: { halign: 'left' },
      },
      { content: fmtBRL(s.amount), styles: { halign: 'right' } },
    ]),
    [
      {
        content: sep.length > 0 ? `TOTAL A RECEBER DE PACOTES (sem ${sepNames})` : 'TOTAL A RECEBER DE PACOTES',
        colSpan: 3,
        styles: { halign: 'left' },
      },
      { content: fmtBRL(totals.packagesValue - sepTotal), styles: { halign: 'right' } },
    ],
  ];

  // Destaque amarelo (2026-07-19): linha inteira da plataforma marcada; a seta ▶
  // é desenhada direto no didDrawCell (design v2, sem linha atravessando o layout).
  autoTable(doc, {
    startY: y + 6,
    head: platHead,
    body: platBody,
    foot: platFoot,
    theme: 'grid',
    styles: BASE_TABLE_STYLES,
    headStyles: { fillColor: COLOR_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
    footStyles: { fillColor: COLOR_FOOT_BG, textColor: COLOR_INK, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right', cellWidth: 80 },
      2: { halign: 'right', cellWidth: 100 },
      3: { halign: 'right', cellWidth: 120 },
    },
    didParseCell: (cell) => {
      if (cell.section === 'body' && platforms[cell.row.index]?.highlight) {
        cell.cell.styles.fillColor = COLOR_HL_YELLOW;
        if (cell.column.index === 0) cell.cell.styles.fontStyle = 'bold';
      }
      // Rodapé: as linhas de valor separado (antes do total) saem em amarelo.
      if (cell.section === 'foot' && cell.row.index < sep.length) {
        cell.cell.styles.fillColor = COLOR_HL_YELLOW;
        cell.cell.styles.textColor = COLOR_INK;
      }
    },
    didDrawCell: (cell) => {
      if (cell.section === 'body' && cell.column.index === 0) {
        const p = platforms[cell.row.index];
        if (p?.highlight && p?.notice) {
          drawRowArrow(doc, cell.cell.y + cell.cell.height / 2);
        }
      }
    },
    margin: AUTOTABLE_MARGIN,
  });
  y = getFinalY(doc, y + 6) + 16;

  // ── Descontos (só se houver) ──
  if (discounts.length > 0) {
    y = ensureSpace(doc, y, 70);
    drawSectionTitle(doc, 'DESCONTOS', y);

    const head: RowInput[] = [['ID do Pacote', 'Descrição', 'Valor (R$)']];
    const body: RowInput[] = discounts.map((d) => [
      d.packageId || '—',
      d.description || '—',
      `- ${fmtBRL(d.value)}`,
    ]);
    const foot: RowInput[] = [
      [
        { content: 'Subtotal de descontos', colSpan: 2, styles: { halign: 'left' } },
        { content: `- ${fmtBRL(totals.discountsValue)}`, styles: { halign: 'right' } },
      ],
    ];

    autoTable(doc, {
      startY: y + 6,
      head,
      body,
      foot,
      theme: 'grid',
      styles: BASE_TABLE_STYLES,
      headStyles: { fillColor: COLOR_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
      footStyles: { fillColor: COLOR_FOOT_BG, textColor: COLOR_DANGER, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: 150 },
        1: { halign: 'left' },
        2: { halign: 'right', cellWidth: 120 },
      },
      didParseCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 2) {
          cell.cell.styles.textColor = COLOR_DANGER;
        }
      },
      margin: AUTOTABLE_MARGIN,
    });
    y = getFinalY(doc, y + 6) + 16;
  }

  // ── Vales / adiantamentos (só se houver) ──
  if (vales.length > 0) {
    y = ensureSpace(doc, y, 70);
    drawSectionTitle(doc, 'VALES / ADIANTAMENTOS', y);

    const head: RowInput[] = [['Data', 'Observação', 'Valor (R$)']];
    const body: RowInput[] = vales.map((v) => [
      v.date ? formatDateBR(v.date) : '—',
      v.note || '—',
      `- ${fmtBRL(v.value)}`,
    ]);
    const foot: RowInput[] = [
      [
        { content: 'Subtotal de vales', colSpan: 2, styles: { halign: 'left' } },
        { content: `- ${fmtBRL(totals.valesValue)}`, styles: { halign: 'right' } },
      ],
    ];

    autoTable(doc, {
      startY: y + 6,
      head,
      body,
      foot,
      theme: 'grid',
      styles: BASE_TABLE_STYLES,
      headStyles: { fillColor: COLOR_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
      footStyles: { fillColor: COLOR_FOOT_BG, textColor: COLOR_DANGER, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: 110 },
        1: { halign: 'left' },
        2: { halign: 'right', cellWidth: 120 },
      },
      didParseCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 2) {
          cell.cell.styles.textColor = COLOR_DANGER;
        }
      },
      margin: AUTOTABLE_MARGIN,
    });
    y = getFinalY(doc, y + 6) + 16;
  }

  // ── Resumo (theme plain) — idioma holeritePdf ──
  y = ensureSpace(doc, y, 120);
  const resumoBody: RowInput[] = [
    [
      sep.length > 0 ? `Total de pacotes (sem ${sepNames})` : 'Total de pacotes',
      `+ ${fmtBRL(totals.packagesValue - sepTotal)}`,
    ],
    ['Descontos', `- ${fmtBRL(totals.discountsValue)}`],
    ['Vales / adiantamentos', `- ${fmtBRL(totals.valesValue)}`],
  ];

  autoTable(doc, {
    startY: y,
    body: resumoBody,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10.5, cellPadding: 6, textColor: COLOR_INK },
    bodyStyles: { fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 345 },
      1: { cellWidth: 170, halign: 'right' },
    },
    didParseCell: (cell) => {
      if (cell.section === 'body' && cell.column.index === 1) {
        if (
          (cell.row.index === 1 && totals.discountsValue > 0) ||
          (cell.row.index === 2 && totals.valesValue > 0)
        ) {
          cell.cell.styles.textColor = COLOR_DANGER;
        }
      }
    },
    margin: AUTOTABLE_MARGIN,
  });
  y = getFinalY(doc, y) + 8;

  // 2ª posição dos avisos de plataforma (pedido do Victor: ≥2 lugares por espelho).
  if (platformNotices.length > 0) {
    const r2 = drawPlatformNoticeBands(doc, platformNotices, y);
    y = r2.y;
  }

  y = ensureSpace(doc, y, 60);
  y = drawGreenBanner(doc, 'TOTAL A RECEBER', fmtBRL(totals.toReceive - sepTotal), y);

  // Valor separado (2026-07-20): faixa amarela POR plataforma marcada, colada no
  // total verde, com aviso explícito de que o valor é pago à parte.
  for (const s of sep) {
    y = ensureSpace(doc, y + 8, 54);
    y = drawSeparatedValueBanner(
      doc,
      `TOTAL ${s.platform.toUpperCase()} (${fmtQty(s.packages)} pacotes)`,
      s,
      y,
    );
  }

  // ── Assinaturas + rodapé ──
  y = ensureSpace(doc, y, 96);
  const signY = y + 44;
  doc.setDrawColor(120).setLineWidth(0.5);
  doc.line(X_LEFT, signY, X_LEFT + 220, signY);
  doc.line(X_RIGHT - 220, signY, X_RIGHT, signY);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...COLOR_MUTED);
  doc.text('Assinatura do Driver', X_LEFT + 110, signY + 14, { align: 'center' });
  doc.text('Responsável / Financeiro', X_RIGHT - 110, signY + 14, { align: 'center' });

  const footY = signY + 34;
  const generatedAt = data.generatedAt || new Date().toLocaleString('pt-BR');
  doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...COLOR_MUTED);
  doc.text(`Documento gerado em ${generatedAt}`, X_LEFT, footY);
  doc.text(`${company.name} — Espelho de Pagamento Driver`, X_RIGHT, footY, { align: 'right' });
  doc.setTextColor(0);
}

// ─── Espelho de grupo ─────────────────────────────────────────────────────────

/** Página-resumo do grupo (pacotes SEPARADOS POR PLATAFORMA + subtotal). Retorna finalY. */
function drawGroupSummaryPage(
  doc: jsPDF,
  data: DriverGroupMirrorData,
  includeIndividuals: boolean,
): number {
  const { company, period, groupName, drivers, groupTotals } = data;

  drawCompanyHeader(doc, company);
  drawBand(doc, `ESPELHO DE GRUPO — ${groupName}`, period);

  // ── Avisos do topo (2026-07-19) — presença: só plataformas com pacotes no GRUPO ──
  const noticeByPlatform = new Map<string, string>();
  const highlightedPlatforms = new Set<string>();
  for (const d of drivers) {
    for (const p of d.platforms) {
      if (p.platform === 'Zapex') continue;
      if (p.highlight) highlightedPlatforms.add(p.platform);
      if (p.highlight && p.notice) noticeByPlatform.set(p.platform, p.notice);
    }
  }
  const platformNotices = Array.from(noticeByPlatform, ([platform, text]) => ({ platform, text }));
  let topY = 118;
  if (data.cutoff) topY = drawCutoffBand(doc, data.cutoff, topY);
  if (platformNotices.length > 0) {
    topY = drawPlatformNoticeBands(doc, platformNotices, topY).y;
  }

  // Valor separado (2026-07-20): soma por plataforma marcada em TODO o grupo.
  // O "A Receber" de cada driver e o total verde saem SEM esse valor; ele ganha
  // faixa amarela própria junto do total do grupo.
  const groupSepMap = new Map<string, SeparatedPlatformTotal>();
  const groupSepOrder: string[] = [];
  for (const d of drivers) {
    for (const s of separatedPlatformTotals(d.platforms)) {
      let entry = groupSepMap.get(s.platform);
      if (!entry) {
        entry = { platform: s.platform, packages: 0, amount: 0 };
        groupSepMap.set(s.platform, entry);
        groupSepOrder.push(s.platform);
      }
      entry.packages += s.packages;
      entry.amount += s.amount;
    }
  }
  const groupSep = groupSepOrder.map((name) => groupSepMap.get(name)!);
  const groupSepTotal = groupSep.reduce((s, x) => s + x.amount, 0);

  // Box compacto do grupo.
  const boxY = topY + 2;
  const boxH = 44;
  doc.setFillColor(...COLOR_BG_BOX);
  doc.rect(X_LEFT, boxY, CONTENT_W, boxH, 'F');
  doc.setDrawColor(...COLOR_BORDER).setLineWidth(0.5);
  doc.rect(X_LEFT, boxY, CONTENT_W, boxH, 'S');
  const gcol1 = X_LEFT + 12;
  const gcol2 = X_LEFT + CONTENT_W / 3 + 6;
  const gcol3 = X_LEFT + (2 * CONTENT_W) / 3 + 6;
  drawStackedField(doc, 'Grupo', groupName, gcol1, boxY + 16);
  drawStackedField(doc, 'Drivers', fmtQty(groupTotals.driverCount), gcol2, boxY + 16);
  drawStackedField(doc, 'Período', periodDisplay(period), gcol3, boxY + 16);

  let y = boxY + boxH + 20;
  y = ensureSpace(doc, y, 90);
  drawSectionTitle(doc, 'RESUMO DO GRUPO · PACOTES POR PLATAFORMA', y);

  // Zapex e modelada como "plataforma", mas no resumo do grupo entra como uma coluna
  // de VALOR (R$) destacada em verde — nao como quantidade junto dos pacotes. So aparece
  // quando algum driver do grupo tem Zapex.
  const platformNames = collectPlatformNames(drivers).filter((n) => n !== 'Zapex');
  const zapexValueOf = (d: DriverMirrorData): number =>
    d.platforms.find((p) => p.platform === 'Zapex')?.subtotal ?? 0;
  const hasZapex = drivers.some((d) => zapexValueOf(d) > 0);
  const zapexTotal = drivers.reduce((s, d) => s + zapexValueOf(d), 0);
  const zapexIdx = 2 + platformNames.length; // valido apenas quando hasZapex
  const descIdx = 2 + platformNames.length + (hasZapex ? 1 : 0);
  const valeIdx = descIdx + 1;
  const netIdx = valeIdx + 1;

  const head: RowInput[] = [
    ['Driver', 'Rota(s)', ...platformNames, ...(hasZapex ? ['Zapex'] : []), 'Desconto', 'Vale', 'A Receber'],
  ];
  const body: RowInput[] = drivers.map((d) => {
    const platCols = platformNames.map((name) => fmtQty(packagesForPlatform(d, name)));
    const zapexCol = hasZapex ? [zapexValueOf(d) > 0 ? `+ ${fmtBRL(zapexValueOf(d))}` : '—'] : [];
    return [
      d.driver.name,
      joinRouteCities(d.driver.routes) || '—',
      ...platCols,
      ...zapexCol,
      d.totals.discountsValue > 0 ? `- ${fmtBRL(d.totals.discountsValue)}` : '—',
      d.totals.valesValue > 0 ? `- ${fmtBRL(d.totals.valesValue)}` : '—',
      // Valor separado fica FORA do "A Receber" exibido (sai na faixa amarela).
      fmtBRL(d.totals.toReceive - separatedAmount(d.platforms)),
    ];
  });
  const footPlatSums = platformNames.map((name) =>
    fmtQty(drivers.reduce((s, d) => s + packagesForPlatform(d, name), 0)),
  );
  const foot: RowInput[] = [
    [
      { content: `SUBTOTAL — ${fmtQty(groupTotals.driverCount)} driver(s)`, colSpan: 2 },
      ...footPlatSums.map((v) => ({ content: v })),
      ...(hasZapex ? [{ content: `+ ${fmtBRL(zapexTotal)}` }] : []),
      { content: `- ${fmtBRL(groupTotals.discountsValue)}` },
      { content: `- ${fmtBRL(groupTotals.valesValue)}` },
      { content: fmtBRL(groupTotals.toReceive - groupSepTotal) },
    ],
  ];

  const columnStyles: Record<string, Partial<Styles>> = {
    0: { halign: 'left' },
    1: { halign: 'left' },
  };
  for (let i = 2; i < 2 + platformNames.length; i++) columnStyles[i] = { halign: 'right' };
  if (hasZapex) columnStyles[zapexIdx] = { halign: 'right' };
  columnStyles[descIdx] = { halign: 'right' };
  columnStyles[valeIdx] = { halign: 'right' };
  columnStyles[netIdx] = { halign: 'right' };

  // Índices das colunas destacadas (2026-07-19); a seta ▼ é desenhada direto no
  // didDrawCell do cabeçalho (design v2, sem linha atravessando o layout).
  const highlightedCols = new Set<number>();
  platformNames.forEach((name, i) => {
    if (highlightedPlatforms.has(name)) highlightedCols.add(2 + i);
  });
  const noticedPlatforms = new Set(platformNotices.map((n) => n.platform));

  autoTable(doc, {
    startY: y + 6,
    head,
    body,
    foot,
    theme: 'grid',
    styles: { ...BASE_TABLE_STYLES, fontSize: 9 },
    headStyles: { fillColor: COLOR_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
    footStyles: { fillColor: COLOR_SUCCESS, textColor: WHITE, fontStyle: 'bold' },
    columnStyles,
    didParseCell: (cell) => {
      // Coluna da plataforma destacada: corpo amarelo; cabeçalho amarelo com tinta forte.
      if (highlightedCols.has(cell.column.index)) {
        if (cell.section === 'body') {
          cell.cell.styles.fillColor = COLOR_HL_YELLOW;
          cell.cell.styles.fontStyle = 'bold';
        } else if (cell.section === 'head') {
          cell.cell.styles.fillColor = COLOR_HL_YELLOW;
          cell.cell.styles.textColor = COLOR_INK;
        }
      }
      if (cell.section === 'body') {
        if (
          (cell.column.index === descIdx || cell.column.index === valeIdx) &&
          cell.cell.text[0] !== '—'
        ) {
          cell.cell.styles.textColor = COLOR_DANGER;
        }
        if (hasZapex && cell.column.index === zapexIdx && cell.cell.text[0] !== '—') {
          cell.cell.styles.textColor = COLOR_SUCCESS;
          cell.cell.styles.fontStyle = 'bold';
        }
        if (cell.column.index === netIdx) {
          cell.cell.styles.textColor = COLOR_SUCCESS;
          cell.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawCell: (cell) => {
      if (cell.section === 'head' && highlightedCols.has(cell.column.index)) {
        const name = platformNames[cell.column.index - 2];
        if (noticedPlatforms.has(name)) {
          drawColumnArrow(doc, cell.cell.x + cell.cell.width / 2, cell.cell.y);
        }
      }
    },
    margin: AUTOTABLE_MARGIN,
  });
  y = getFinalY(doc, y + 6) + 14;

  // ── Descontos do grupo (2026-07-19): de quem, código, marca, obs e valor ──
  const groupDiscounts = drivers.flatMap((d) =>
    d.discounts.map((dd) => ({ driver: d.driver.name, ...dd })),
  );
  if (groupDiscounts.length > 0) {
    const DISCOUNT_LIMIT = 12;
    const shown = groupDiscounts.slice(0, DISCOUNT_LIMIT); // flatMap preserva agrupamento por driver
    const rest = groupDiscounts.length - shown.length;
    y = ensureSpace(doc, y, 80);
    drawSectionTitle(doc, 'DESCONTOS DO GRUPO', y);

    const dHead: RowInput[] = [['Driver', 'Código do pacote', 'Marca', 'Observação', 'Valor (R$)']];
    const dBody: RowInput[] = shown.map((s) => [
      s.driver,
      s.packageId || '—',
      s.status ?? '—',
      s.description || '—',
      `- ${fmtBRL(s.value)}`,
    ]);
    const dFoot: RowInput[] = [
      [
        {
          content:
            rest > 0
              ? `… e mais ${rest} desconto(s) — ver o recibo individual de cada driver`
              : 'Total de descontos do grupo',
          colSpan: 4,
          styles: { halign: 'left' },
        },
        { content: `- ${fmtBRL(groupTotals.discountsValue)}`, styles: { halign: 'right' } },
      ],
    ];

    autoTable(doc, {
      startY: y + 6,
      head: dHead,
      body: dBody,
      foot: dFoot,
      theme: 'grid',
      styles: { ...BASE_TABLE_STYLES, fontSize: 8.5 },
      headStyles: { fillColor: COLOR_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
      footStyles: { fillColor: COLOR_FOOT_BG, textColor: COLOR_DANGER, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'left', cellWidth: 110 },
        2: { halign: 'center', cellWidth: 48 },
        3: { halign: 'left' },
        4: { halign: 'right', cellWidth: 80 },
      },
      didParseCell: (cell) => {
        if (cell.section === 'body') {
          if (cell.column.index === 2) {
            const mark = cell.cell.text[0];
            if (mark === 'PNR') {
              cell.cell.styles.textColor = COLOR_PNR;
              cell.cell.styles.fontStyle = 'bold';
            } else if (mark === 'LOST') {
              cell.cell.styles.textColor = COLOR_LOST;
              cell.cell.styles.fontStyle = 'bold';
            }
          }
          if (cell.column.index === 4) cell.cell.styles.textColor = COLOR_DANGER;
        }
      },
      margin: AUTOTABLE_MARGIN,
    });
    y = getFinalY(doc, y + 6) + 14;
  }

  // 2ª posição dos avisos de plataforma (≥2 lugares por espelho).
  if (platformNotices.length > 0) {
    const r2 = drawPlatformNoticeBands(doc, platformNotices, y);
    y = r2.y;
  }

  y = ensureSpace(doc, y, 50);
  y = drawGreenBanner(
    doc,
    `TOTAL A RECEBER — ${groupName.toUpperCase()}`,
    fmtBRL(groupTotals.toReceive - groupSepTotal),
    y,
  );

  // Valor separado (2026-07-20): faixa amarela com a soma da plataforma no grupo.
  for (const s of groupSep) {
    y = ensureSpace(doc, y + 8, 54);
    y = drawSeparatedValueBanner(
      doc,
      `TOTAL ${s.platform.toUpperCase()} DO GRUPO (${fmtQty(s.packages)} pacotes)`,
      s,
      y,
    );
  }

  const footY = ensureSpace(doc, y + 22, 20);
  const generatedAt = data.generatedAt || new Date().toLocaleString('pt-BR');
  doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...COLOR_MUTED);
  doc.text(`Documento gerado em ${generatedAt}`, X_LEFT, footY);
  doc.text(
    includeIndividuals
      ? 'Páginas seguintes: recibo individual de cada driver'
      : 'Somente resumo do grupo',
    X_RIGHT,
    footY,
    { align: 'right' },
  );
  doc.setTextColor(0);
  return footY;
}

// ─── Montagem dos documentos ──────────────────────────────────────────────────

function buildDriverMirrorDoc(data: DriverMirrorData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  drawDriverMirrorPage(doc, data);
  return doc;
}

function buildDriverGroupMirrorDoc(
  data: DriverGroupMirrorData,
  opts?: DriverGroupMirrorOptions,
): jsPDF {
  const includeIndividuals = !opts?.compact;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  drawGroupSummaryPage(doc, data, includeIndividuals);
  if (includeIndividuals) {
    for (const driver of data.drivers) {
      doc.addPage('a4', 'portrait');
      drawDriverMirrorPage(doc, driver);
    }
  }
  return doc;
}

function buildDriverMirrorsBatchDoc(list: DriverMirrorData[]): jsPDF {
  if (list.length === 0) throw new Error('Lista de espelhos vazia');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  list.forEach((data, idx) => {
    if (idx > 0) doc.addPage('a4', 'portrait');
    drawDriverMirrorPage(doc, data);
  });
  return doc;
}

/**
 * Espelhos da SELEÇÃO (2026-07-18): grupos marcados saem no formato "espelho de
 * grupo" (resumo + recibos, como o botão azul) e drivers avulsos como página
 * individual — tudo num único PDF, na ordem grupos → avulsos.
 */
function buildDriverSelectionMirrorDoc(
  groups: DriverGroupMirrorData[],
  singles: DriverMirrorData[],
  opts?: DriverGroupMirrorOptions,
): jsPDF {
  if (groups.length === 0 && singles.length === 0) throw new Error('Seleção de espelhos vazia');
  const includeIndividuals = !opts?.compact;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  let firstPage = true;
  const newPage = () => {
    if (!firstPage) doc.addPage('a4', 'portrait');
    firstPage = false;
  };
  for (const g of groups) {
    newPage();
    drawGroupSummaryPage(doc, g, includeIndividuals);
    if (includeIndividuals) {
      for (const d of g.drivers) {
        newPage();
        drawDriverMirrorPage(doc, d);
      }
    }
  }
  for (const s of singles) {
    newPage();
    drawDriverMirrorPage(doc, s);
  }
  return doc;
}

// ─── API pública ──────────────────────────────────────────────────────────────

export async function generateDriverMirrorPdf(data: DriverMirrorData): Promise<Blob> {
  return buildDriverMirrorDoc(data).output('blob');
}

export async function downloadDriverMirrorPdf(
  data: DriverMirrorData,
  filename?: string,
): Promise<void> {
  const doc = buildDriverMirrorDoc(data);
  const fname =
    filename ||
    `espelho-driver-${sanitizeFilenamePart(data.driver.name)}-${sanitizeFilenamePart(data.period.label)}.pdf`;
  doc.save(fname);
}

export async function generateDriverGroupMirrorPdf(
  data: DriverGroupMirrorData,
  opts?: DriverGroupMirrorOptions,
): Promise<Blob> {
  return buildDriverGroupMirrorDoc(data, opts).output('blob');
}

export async function downloadDriverGroupMirrorPdf(
  data: DriverGroupMirrorData,
  filename?: string,
  opts?: DriverGroupMirrorOptions,
): Promise<void> {
  const doc = buildDriverGroupMirrorDoc(data, opts);
  const fname =
    filename ||
    `espelho-grupo-${sanitizeFilenamePart(data.groupName)}-${sanitizeFilenamePart(data.period.label)}.pdf`;
  doc.save(fname);
}

export async function generateDriverMirrorsBatchPdf(list: DriverMirrorData[]): Promise<Blob> {
  return buildDriverMirrorsBatchDoc(list).output('blob');
}

export async function generateDriverSelectionMirrorPdf(
  groups: DriverGroupMirrorData[],
  singles: DriverMirrorData[],
  opts?: DriverGroupMirrorOptions,
): Promise<Blob> {
  return buildDriverSelectionMirrorDoc(groups, singles, opts).output('blob');
}

export async function downloadDriverSelectionMirrorPdf(
  groups: DriverGroupMirrorData[],
  singles: DriverMirrorData[],
  filename?: string,
  opts?: DriverGroupMirrorOptions,
): Promise<void> {
  const doc = buildDriverSelectionMirrorDoc(groups, singles, opts);
  const period = groups[0]?.period.label ?? singles[0]?.period.label ?? '';
  doc.save(filename || `espelhos-selecao-${sanitizeFilenamePart(period)}.pdf`);
}

export async function downloadDriverMirrorsBatchPdf(
  list: DriverMirrorData[],
  filename?: string,
): Promise<void> {
  const doc = buildDriverMirrorsBatchDoc(list);
  const first = list[0];
  const fname =
    filename ||
    (first
      ? `espelhos-driver-${sanitizeFilenamePart(first.company.name)}-${sanitizeFilenamePart(first.period.label)}.pdf`
      : 'espelhos-driver.pdf');
  doc.save(fname);
}
