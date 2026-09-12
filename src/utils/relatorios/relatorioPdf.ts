/**
 * Os três relatórios em PDF (12/09/2026).
 *
 * Pedido do Victor, na letra: *"o PDF em vez de sair em tabela dentro do PDF vai
 * sair um PDF como se fosse um espelho mesmo… algo bonito na folha A4"*, e
 * *"cada folha um funcionário"*.
 *
 * Então:
 *  - a folha de PONTO **é** o espelho que a empresa já emite — mesmo gerador,
 *    mesmo desenho, mesma conta (`desenharEspelhoNaPagina`);
 *  - a folha FINANCEIRA é nova, no mesmo idioma visual: mesma margem, mesma
 *    fonte, mesmos quadros, A4 paisagem igual — para o relatório GERAL poder
 *    intercalar as duas sem o papel mudar de cara no meio;
 *  - o relatório GERAL dá, por pessoa, a folha do ponto e a do financeiro, uma
 *    depois da outra;
 *  - no fim de tudo vem a folha de FECHAMENTO, com o total de todo mundo.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { desenharEspelhoNaPagina } from '../mirrorPdf';
import { formatCnpj, formatCpf, formatDateBR, minutesToHHMMAlways } from '../mirrorGenerator';
import type { PessoaDoRelatorio, RelatorioMontado } from './relatorioDados';
import { nomeDoArquivo } from './relatorioExcel';

// As mesmas medidas do espelho — é o que faz as duas folhas parecerem do mesmo
// documento quando saem grudadas no relatório geral.
const X_LEFT = 19.6;
const X_RIGHT = 822;
const CONTENT_W = X_RIGHT - X_LEFT;
const Y_TOP = 24;
const LINE_W = 0.8;

const dinheiro = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
}

function desenharCabecalho(doc: jsPDF, r: RelatorioMontado, titulo: string): number {
  const yTop = Y_TOP;
  const yBot = yTop + 48;

  doc.setLineWidth(LINE_W);
  doc.setDrawColor(0);
  doc.rect(X_LEFT, yTop, CONTENT_W, yBot - yTop);
  doc.line(124, yTop, 124, yBot);
  doc.line(560, yTop, 560, yBot);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(iniciais(r.company.display_name ?? r.company.legal_name ?? '—'), (X_LEFT + 124) / 2, yTop + 29, { align: 'center' });

  doc.setFontSize(8);
  const xLabel = 130;
  const xValor = xLabel + 56;
  doc.setFont('helvetica', 'bold');
  doc.text('Empregador:', xLabel, yTop + 14);
  doc.text('CNPJ / CPF:', xLabel, yTop + 26);
  doc.text('Relatório:', xLabel, yTop + 38);
  doc.setFont('helvetica', 'normal');
  doc.text(r.company.legal_name || '—', xValor, yTop + 14);
  doc.text(formatCnpj(r.company.cnpj) || '—', xValor, yTop + 26);
  doc.text(titulo, xValor, yTop + 38);

  const xPer = (560 + X_RIGHT) / 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Período:', xPer, yTop + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(r.periodo.rotulo, xPer, yTop + 28, { align: 'center' });
  doc.text(`${formatDateBR(r.periodo.inicio)} a ${formatDateBR(r.periodo.fim)}`, xPer, yTop + 40, { align: 'center' });

  return yBot;
}

function desenharIdentificacao(doc: jsPDF, p: PessoaDoRelatorio, y: number): number {
  const yBot = y + 30;
  doc.rect(X_LEFT, y, CONTENT_W, yBot - y);
  doc.line(430, y, 430, yBot);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Colaborador:', X_LEFT + 6, y + 12);
  doc.text('CPF:', X_LEFT + 6, y + 24);
  doc.text('Função:', 436, y + 12);
  doc.text('Vínculo:', 436, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.text(p.employee.name, X_LEFT + 66, y + 12);
  doc.text(formatCpf(p.employee.cpf) || '—', X_LEFT + 66, y + 24);
  doc.text(p.employee.function_role || '—', 476, y + 12);
  doc.text(p.employee.employment_type ?? '—', 476, y + 24);

  return yBot;
}

/** A faixa de ponto da folha financeira: o "quantos dias e quantas horas". */
function desenharResumoDePonto(doc: jsPDF, p: PessoaDoRelatorio, y: number): number {
  const rp = p.resumoPonto;
  if (!rp) return y;

  const yBot = y + 26;
  doc.rect(X_LEFT, y, CONTENT_W, yBot - y);

  const campos: Array<[string, string]> = [
    ['Dias trabalhados', String(rp.diasTrabalhados)],
    ['Faltas', String(rp.faltas)],
  ];
  // Só mostra hora quando existe hora — numa folha sem espelho (relatório
  // financeiro) os minutos vêm zerados e "00:00" só faria ruído.
  if (rp.minutosDiurnos || rp.minutosNoturnos) {
    campos.push(
      ['Horas trabalhadas', minutesToHHMMAlways(rp.minutosDiurnos + rp.minutosNoturnos)],
      ['Horas noturnas', minutesToHHMMAlways(rp.minutosNoturnos)],
      ['Intervalo', minutesToHHMMAlways(rp.minutosIntervalo)],
      ['Saldo banco de horas', minutesToHHMMAlways(rp.bancoSaldo)],
    );
  }

  const largura = CONTENT_W / campos.length;
  campos.forEach(([label, valor], i) => {
    const xCentro = X_LEFT + largura * i + largura / 2;
    if (i > 0) doc.line(X_LEFT + largura * i, y, X_LEFT + largura * i, yBot);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label, xCentro, y + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(valor, xCentro, y + 21, { align: 'center' });
  });

  return yBot;
}

function desenharFolhaFinanceira(doc: jsPDF, r: RelatorioMontado, p: PessoaDoRelatorio): void {
  const titulo = r.tipo === 'geral' ? 'Geral (ponto e financeiro)' : 'Financeiro';
  let y = desenharCabecalho(doc, r, titulo);
  y = desenharIdentificacao(doc, p, y);
  y = desenharResumoDePonto(doc, p, y);

  const corpo = p.linhas.map(l => [
    l.rotulo,
    l.quantidade === null ? '' : String(l.quantidade),
    l.natureza === 'provento' ? dinheiro(l.valor) : '',
    l.natureza === 'desconto' ? dinheiro(l.valor) : '',
    l.natureza === 'custo-empresa' ? dinheiro(l.valor) : '',
  ]);

  if (corpo.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Sem lançamento financeiro neste período.', X_LEFT + 6, y + 18);
    y += 24;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: X_LEFT, right: 595 - X_RIGHT + 20 },
      tableWidth: CONTENT_W,
      head: [['Descrição', 'Qtd.', 'Provento', 'Desconto', 'Custo da empresa']],
      body: corpo,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, lineColor: 0, lineWidth: LINE_W, textColor: 0 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 320 },
        1: { cellWidth: 60, halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
    const depois = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (depois?.finalY ?? y) + 10;
  }

  // Fechamento: proventos, descontos e o líquido em destaque.
  const yBot = y + 30;
  doc.setLineWidth(LINE_W);
  doc.rect(X_LEFT, y, CONTENT_W, yBot - y);
  const blocos: Array<[string, string]> = [
    ['Total de proventos', dinheiro(p.totalProventos)],
    ['Total de descontos', dinheiro(p.totalDescontos)],
    ['LÍQUIDO RECEBIDO', dinheiro(p.totalLiquido)],
  ];
  if (p.totalCustoEmpresa > 0) blocos.push(['Custo da empresa', dinheiro(p.totalCustoEmpresa)]);

  const largura = CONTENT_W / blocos.length;
  blocos.forEach(([label, valor], i) => {
    const xCentro = X_LEFT + largura * i + largura / 2;
    if (i > 0) doc.line(X_LEFT + largura * i, y, X_LEFT + largura * i, yBot);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(label, xCentro, y + 12, { align: 'center' });
    doc.setFontSize(11);
    doc.text(valor, xCentro, y + 25, { align: 'center' });
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    'O adicional noturno não aparece em valor: o sistema nunca o calculou. As horas noturnas ao lado estão corretas.',
    X_LEFT,
    yBot + 12,
  );
}

function desenharFechamento(doc: jsPDF, r: RelatorioMontado): void {
  let y = desenharCabecalho(doc, r, 'Fechamento — todos os funcionários');

  const temDinheiro = r.tipo !== 'ponto';
  const cabecalho = ['Funcionário', 'Função', 'Vínculo', 'Dias', 'Faltas'];
  if (r.tipo !== 'financeiro') cabecalho.push('Horas', 'Noturnas');
  if (temDinheiro) cabecalho.push('Proventos', 'Descontos', 'Líquido');

  const corpo = r.pessoas.map(p => {
    const rp = p.resumoPonto;
    const linha = [
      p.employee.name,
      p.employee.function_role || '—',
      p.employee.employment_type ?? '—',
      String(rp?.diasTrabalhados ?? 0),
      String(rp?.faltas ?? 0),
    ];
    if (r.tipo !== 'financeiro') {
      linha.push(
        minutesToHHMMAlways((rp?.minutosDiurnos ?? 0) + (rp?.minutosNoturnos ?? 0)),
        minutesToHHMMAlways(rp?.minutosNoturnos ?? 0),
      );
    }
    if (temDinheiro) {
      linha.push(dinheiro(p.totalProventos), dinheiro(p.totalDescontos), dinheiro(p.totalLiquido));
    }
    return linha;
  });

  const rodape = ['TOTAL', '', `${r.totais.pessoas} pessoa${r.totais.pessoas === 1 ? '' : 's'}`,
    String(r.totais.diasTrabalhados), String(r.totais.faltas)];
  if (r.tipo !== 'financeiro') {
    rodape.push(minutesToHHMMAlways(r.totais.minutosTrabalhados), minutesToHHMMAlways(r.totais.minutosNoturnos));
  }
  if (temDinheiro) {
    rodape.push(dinheiro(r.totais.proventos), dinheiro(r.totais.descontos), dinheiro(r.totais.liquido));
  }

  autoTable(doc, {
    startY: y + 6,
    margin: { left: X_LEFT, right: 595 - X_RIGHT + 20 },
    tableWidth: CONTENT_W,
    head: [cabecalho],
    body: corpo,
    foot: [rodape],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3, lineColor: 0, lineWidth: LINE_W, textColor: 0 },
    headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 180 } },
  });

  const depois = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  y = (depois?.finalY ?? y) + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Emitido em ${formatDateBR(r.periodo.fim)} · ${r.totais.pessoas} funcionário(s) no período`, X_LEFT, y);
}

/** Monta o documento inteiro. Separado do download pra poder testar. */
export function montarDocumentoPdf(r: RelatorioMontado): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  let primeira = true;

  const novaFolha = () => {
    if (primeira) primeira = false;
    else doc.addPage('a4', 'landscape');
  };

  for (const p of r.pessoas) {
    if (p.espelho) {
      novaFolha();
      desenharEspelhoNaPagina(doc, p.espelho);
    }
    if (r.tipo !== 'ponto') {
      novaFolha();
      desenharFolhaFinanceira(doc, r, p);
    }
  }

  // A folha de fechamento só faz sentido com mais de uma pessoa — com uma só,
  // ela repetiria a folha anterior.
  if (r.pessoas.length > 1) {
    novaFolha();
    desenharFechamento(doc, r);
  }

  // Ninguém no período: uma folha dizendo isso, em vez de um PDF vazio que
  // parece defeito.
  if (primeira) {
    desenharCabecalho(doc, r, r.tipo === 'ponto' ? 'Ponto' : r.tipo === 'financeiro' ? 'Financeiro' : 'Geral');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('Nenhum funcionário com registro neste período e neste filtro.', X_LEFT + 6, 120);
  }

  return doc;
}

export async function gerarRelatorioPdf(r: RelatorioMontado): Promise<Blob> {
  return montarDocumentoPdf(r).output('blob');
}

export async function baixarRelatorioPdf(r: RelatorioMontado): Promise<void> {
  montarDocumentoPdf(r).save(nomeDoArquivo(r, 'pdf'));
}
