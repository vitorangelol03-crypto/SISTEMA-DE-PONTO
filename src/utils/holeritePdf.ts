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
import type { FolhaCalculada } from './folha/folhaCalc';
import type { DecimoCalculado } from './folha/decimoTerceiro';
import { MOTIVOS, type RescisaoCalculada } from './folha/rescisao';

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
    cpf: string | null;
    functionRole?: string;
    employmentType?: string;
    hireDate?: string;
    registrationNumber?: string;
  };
  period: { start: string; end: string };
  payments: HoleritePaymentLine[];
  errorDiscount: number;
  triageDiscount: number;
  /**
   * Desconto por erros de QUANTIDADE que ja foi abatido do pagamento la atras (botao
   * "Descontar Erros") e por isso nao aparecia em lugar nenhum do papel (04/08/2026).
   *
   * Sem esta linha os proventos nao fechavam com o total: em 19 dos 46 funcionarios da
   * quinzena de julho a soma das diarias era de R$ 1 a R$ 50 MAIOR que o total gravado, e
   * o funcionario nao tinha como saber por que. Ausente/0 = nada a mostrar.
   */
  quantityErrorDiscount?: number;
  totalDailyRate: number;
  totalBonusB: number;
  totalBonusC1: number;
  totalBonusC2: number;
  totalGross: number;
  totalNet: number;
  generatedAt?: string;
  /**
   * FOLHA DE CARTEIRA ASSINADA (18/09/2026). Quando vem preenchida, o recibo sai no
   * modelo de mensalista: salário do mês, adicional noturno e salário família no lugar
   * das diárias, mais o rodapé com salário base, base do FGTS e valor do FGTS.
   *
   * Ausente = recibo de DIARISTA, exatamente como sempre foi. É o mesmo papel e o mesmo
   * gerador: o que muda é a lista de linhas, que já era lista justamente por isto.
   */
  folha?: FolhaCalculada;
  /**
   * A pessoa é mensalista com salário na ficha, mas o período do papel NÃO é um mês
   * fechado (19/09/2026, decisão do Victor: "não mostra, avisa").
   *
   * A folha é mensal — principalmente o INSS e o IRRF, que são progressivos sobre o mês.
   * Num recorte menor o recibo sai sem as linhas da folha e COM este aviso, em vez de um
   * valor de mês inteiro num papel de semana. Ver `ehMesInteiro` no `folhaCalc`.
   */
  folhaForaDoMes?: boolean;
  /**
   * 13º SALÁRIO (19/09/2026). Quando vem preenchido, o papel é o recibo da gratificação
   * natalina: as linhas do 13º, o abatimento do adiantamento e o imposto sobre o total.
   *
   * Sai num papel PRÓPRIO, separado do salário do mês — é assim que a contabilidade faz
   * e é o que a lei pede, porque o IRRF do 13º é tributação exclusiva na fonte: ele não
   * se soma ao imposto do mês. Misturar os dois no mesmo recibo faria a pessoa achar que
   * pagou imposto duas vezes.
   */
  decimo?: DecimoCalculado;
  /**
   * RESCISÃO (19/09/2026). Quando vem preenchida, o papel é o termo do acerto de contas:
   * saldo, aviso, 13º proporcional, férias vencidas e proporcionais com 1/3, a multa do
   * FGTS e os descontos.
   *
   * Papel PRÓPRIO, como o do 13º — e pelo mesmo motivo: as contas são separadas (o 13º
   * da rescisão é tributado à parte, e férias e aviso são isentos). Um papel só com tudo
   * misturado esconderia de onde saiu cada imposto.
   */
  rescisao?: RescisaoCalculada;
  /**
   * 2ª VIA (19/09/2026): este papel está sendo REIMPRESSO a partir do que foi gravado,
   * e não recalculado agora.
   *
   * O papel diz isso na cara de propósito. Duas vias do mesmo acerto circulando como
   * original é exatamente o que não pode existir — ainda mais numa rescisão, que é o
   * documento que vale num processo.
   */
  segundaVia?: boolean;
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

/** Uma folha A4 em branco, do jeito que o recibo espera. */
function novaFolha(): jsPDF {
  return new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
}

/**
 * Desenha UM recibo na folha atual do documento.
 *
 * Recebe o `doc` de fora — e não cria o seu — porque é isso que permite juntar
 * vários recibos num PDF só, uma folha por pessoa (pedido do Victor,
 * 11/09/2026). O desenho é exatamente o mesmo do recibo avulso: quem baixa um
 * PDF por pessoa e quem baixa o caderno recebem o MESMO papel.
 */
function desenharRecibo(doc: jsPDF, data: HoleriteData): void {
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
  /**
   * O papel diz o que ele é. Um recibo de 13º com o título "RECIBO DE PAGAMENTO" seria
   * confundido com o salário do mês — e os dois saem no mesmo dezembro.
   */
  const titulo = data.rescisao
    ? 'TERMO DE RESCISÃO DO CONTRATO DE TRABALHO'
    : data.decimo
      ? data.decimo.parcela === 'primeira' ? 'RECIBO DE 13º SALÁRIO — 1ª PARCELA'
        : data.decimo.parcela === 'segunda' ? 'RECIBO DE 13º SALÁRIO — 2ª PARCELA'
          : 'RECIBO DE 13º SALÁRIO'
      : 'RECIBO DE PAGAMENTO';
  doc.text(data.segundaVia ? `${titulo} — 2ª VIA` : titulo, PAGE_W / 2, 96, { align: 'center' });
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

  const { proventos, descontos } = linhasDoRecibo(data);

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
      // Tipo "-" pintado vermelho
      if (cell.section === 'body' && cell.column.index === 1 && cell.cell.text[0] === '-') {
        cell.cell.styles.textColor = [COLOR_DANGER[0], COLOR_DANGER[1], COLOR_DANGER[2]];
      }
    },
    margin: { left: X_LEFT, right: PAGE_W - X_RIGHT },
  });

  // @ts-expect-error — autoTable mutates doc.lastAutoTable
  const afterComp = doc.lastAutoTable?.finalY || compY + 100;

  // ═══ Resumo por Categoria ═══
  // ⚠️ PROVENTOS = a soma do que esta LISTADO acima (diarias + bonificacoes), nao o
  // `totalGross` — o total gravado ja vem com o desconto de quantidade abatido, e usa-lo
  // aqui deixava o papel sem fechar. Com a linha do desconto no lugar, agora bate:
  // proventos - descontos = liquido.
  const { totalProventos, totalDescontos, liquido: liquidoDoPapel } = totaisDoRecibo(data);

  autoTable(doc, {
    startY: afterComp + 12,
    body: [
      ['TOTAL DE PROVENTOS', fmtBRL(totalProventos)],
      ['TOTAL DE DESCONTOS', `-${fmtBRL(totalDescontos)}`],
    ],
    foot: [['VALOR LÍQUIDO A RECEBER', fmtBRL(liquidoDoPapel)]],
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

  // ═══ Rodapé da folha CLT: as BASES ═══
  // Igual ao modelo da contabilidade (Salário base · Base FGTS · Valor FGTS). O FGTS
  // aparece aqui, e NÃO na lista de descontos, porque é custo da empresa: não sai do
  // bolso do funcionário. Mostrar como desconto faria o líquido do papel não fechar.
  let afterBases = afterResumo;
  if (data.folha || data.decimo || data.rescisao) {
    const { folha, decimo, rescisao } = data;
    /**
     * As caixas do rodapé. No salário do mês são as cinco do modelo da contabilidade; no
     * 13º são as que explicam a gratificação — principalmente os AVOS, que é a pergunta
     * que todo funcionário faz ao ver um 13º menor que o salário.
     */
    const caixas: Array<[string, string]> = rescisao
      ? [
        ['Motivo', MOTIVOS.find(m => m.id === rescisao.motivo)?.nome ?? rescisao.motivo],
        ['Tempo de casa', `${rescisao.anosDeCasa} ano${rescisao.anosDeCasa === 1 ? '' : 's'}`],
        ['Aviso prévio', `${rescisao.diasDeAviso} dias`],
        ['Base INSS', fmtBRL(rescisao.baseInss)],
        ['FGTS do mês', fmtBRL(rescisao.fgtsDoMes)],
      ]
      : decimo
      ? [
        ['Avos', `${decimo.avos}/12`],
        ['Base do 13º', fmtBRL(decimo.base)],
        ['13º bruto', fmtBRL(decimo.bruto)],
        ['Valor FGTS', fmtBRL(decimo.fgts)],
        ['Base IRRF', fmtBRL(decimo.baseIrrf)],
      ]
      : [
        ['Salário base', fmtBRL(folha!.salarioBase)],
        ['Base INSS', fmtBRL(folha!.baseInss)],
        ['Base FGTS', fmtBRL(folha!.baseFgts)],
        ['Valor FGTS', fmtBRL(folha!.valorFgts)],
        ['Base IRRF', fmtBRL(folha!.baseIrrf)],
      ];
    const larguraTotal = X_RIGHT - X_LEFT;
    const larguraCaixa = larguraTotal / caixas.length;
    const topo = afterResumo + 18;
    const altura = 38;

    doc.setFillColor(COLOR_BG_BOX[0], COLOR_BG_BOX[1], COLOR_BG_BOX[2]);
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.rect(X_LEFT, topo, larguraTotal, altura, 'FD');

    caixas.forEach(([rotulo, valor], i) => {
      const centro = X_LEFT + larguraCaixa * i + larguraCaixa / 2;
      if (i > 0) doc.line(X_LEFT + larguraCaixa * i, topo, X_LEFT + larguraCaixa * i, topo + altura);
      doc.setFont('helvetica', 'bold').setFontSize(7.5);
      doc.setTextColor(100);
      doc.text(rotulo, centro, topo + 14, { align: 'center' });
      doc.setFont('helvetica', 'bold').setFontSize(9.5);
      doc.setTextColor(0);
      doc.text(valor, centro, topo + 30, { align: 'center' });
    });

    doc.setFont('helvetica', 'italic').setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(
      rescisao?.multaSemSaldoInformado
        ? 'ATENÇÃO: a multa do FGTS não foi calculada — o saldo depositado não foi informado.'
        : 'O FGTS é recolhido pela empresa e não é descontado do funcionário.',
      X_LEFT,
      topo + altura + 12,
    );
    doc.setTextColor(0);
    afterBases = topo + altura + 16;

    // AVISO DE CONFERÊNCIA (decisão do Victor, 18/09): enquanto as tabelas de INSS e IR
    // do ano não forem conferidas com a contabilidade, o papel diz isso na cara. O
    // sistema não é fonte oficial antes de rodar em paralelo por alguns meses.
    const confirmadas = rescisao ? rescisao.tabelasConfirmadas
      : decimo ? decimo.tabelasConfirmadas
        : folha!.tabelasConfirmadas;
    const temImposto = rescisao ? rescisao.inss > 0 || rescisao.irrf > 0 || rescisao.inssDoDecimo > 0
      : decimo ? decimo.inss > 0 || decimo.irrf > 0
        : folha!.inss > 0 || folha!.irrf > 0;
    if (!confirmadas && temImposto) {
      const alturaAviso = 22;
      doc.setFillColor(255, 247, 214);
      doc.setDrawColor(214, 178, 60);
      doc.setLineWidth(0.7);
      doc.rect(X_LEFT, afterBases + 6, X_RIGHT - X_LEFT, alturaAviso, 'FD');
      doc.setFont('helvetica', 'bold').setFontSize(8);
      doc.setTextColor(130, 95, 10);
      doc.text(
        'VALORES EM CONFERÊNCIA — as tabelas de INSS e IR deste ano ainda não foram conferidas com a contabilidade.',
        X_LEFT + 8,
        afterBases + 20,
      );
      doc.setTextColor(0);
      afterBases += 6 + alturaAviso + 4;
    }
  }

  // ═══ Aviso: a folha é mensal e este papel não é de um mês fechado ═══
  // Decisão do Victor (19/09/2026): num recorte menor que o mês o salário NÃO sai, e o
  // papel diz onde ele aparece. Sem este aviso o salário simplesmente sumiria e a pessoa
  // acharia que o sistema esqueceu. O resto do recibo (diárias, erros) sai normalmente.
  if (data.folhaForaDoMes && !data.folha) {
    const alturaAviso = 22;
    doc.setFillColor(238, 244, 252);
    doc.setDrawColor(120, 160, 210);
    doc.setLineWidth(0.7);
    doc.rect(X_LEFT, afterBases + 6, X_RIGHT - X_LEFT, alturaAviso, 'FD');
    doc.setFont('helvetica', 'bold').setFontSize(8);
    doc.setTextColor(40, 80, 140);
    doc.text(
      'O salário de carteira assinada aparece no recibo do MÊS — este período é menor que um mês.',
      X_LEFT + 8,
      afterBases + 20,
    );
    doc.setTextColor(0);
    afterBases += 6 + alturaAviso + 4;
  }

  // ═══ Footer: data + assinaturas ═══
  let yFooter = afterBases + 40;
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
}

/**
 * Os TOTAIS que o recibo imprime, sem desenhar nada.
 *
 * Mora fora do desenho pelo mesmo motivo do `linhasDoRecibo`: é a conta que decide o
 * número grande e verde do papel, e ela precisa ser testável sem jsPDF e sem React.
 * Foi a falta disso que deixou o furo de 18/09 passar — o cálculo da folha tinha 114
 * testes e o total do papel, nenhum.
 *
 * ## A invariante: proventos − descontos = líquido
 *
 * `totalNet` é o dinheiro do pagamento por DIÁRIA, já líquido de erro e triagem — é a
 * invariante que o conserto de 04/08/2026 estabeleceu: (diárias + bônus) − (erros +
 * triagem) = totalNet. A folha é a outra metade, e `folha.liquido` já é os proventos
 * dela menos os descontos dela. Somando as duas o papel continua fechando.
 *
 * Antes de 19/09/2026 o líquido era só o `totalNet`, e os descontos da folha nem eram
 * contados: quem tinha salário via "TOTAL DE PROVENTOS R$ 5.150,00", "TOTAL DE DESCONTOS
 * R$ 0,00" e "LÍQUIDO A RECEBER R$ 3.442,00" no mesmo papel.
 *
 * Quem não tem folha (a grande maioria) soma zero — o recibo de diarista não mudou.
 */
export function totaisDoRecibo(data: HoleriteData): {
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
} {
  const { quantityErrorDiscount } = linhasDoRecibo(data);
  const proventosDaFolha = (data.folha?.totalProventos ?? 0)
    + (data.decimo?.totalProventos ?? 0)
    + (data.rescisao?.totalProventos ?? 0);
  // A linha das diárias só entra se houver diária — senão o recibo de mensalista sairia
  // com "Diárias (0 dias) R$ 0,00". A mesma guarda do `linhasDoRecibo`.
  const temFolha = Boolean(data.folha || data.decimo || data.rescisao);
  const diariasNoPapel = !temFolha || data.totalDailyRate > 0 ? data.totalDailyRate : 0;

  return {
    totalProventos:
      proventosDaFolha + diariasNoPapel + data.totalBonusB + data.totalBonusC1 + data.totalBonusC2,
    totalDescontos:
      (data.folha?.totalDescontos ?? 0) + (data.decimo?.totalDescontos ?? 0)
      + (data.rescisao?.totalDescontos ?? 0)
      + quantityErrorDiscount + (data.errorDiscount || 0) + (data.triageDiscount || 0),
    liquido: (data.totalNet || 0) + (data.folha?.liquido ?? 0) + (data.decimo?.liquido ?? 0)
      + (data.rescisao?.liquido ?? 0),
  };
}

/**
 * As LINHAS que o recibo imprime, sem desenhar nada.
 *
 * Mora fora do desenho pra poder ser testada sem jsPDF e sem React — é a parte que
 * decide o que o funcionário vê no papel, e ela mudou em 18/09/2026 pra caber a folha
 * de carteira assinada. Devolve as colunas já formatadas, na ordem de impressão.
 */
export function linhasDoRecibo(data: HoleriteData): {
  proventos: Array<[string, string, string]>;
  descontos: Array<[string, string, string]>;
  quantityErrorDiscount: number;
} {
  const workingDays = workingDaysFromPayments(data.payments);
  const bonusCounts = bonusInstancesFromPayments(data.payments);
  const proventos: Array<[string, string, string]> = [];

  // Mensalista: as linhas vêm prontas do `folhaCalc` (salário, adicional noturno,
  // salário família, férias, faltas, INSS, IRRF), já na ordem do modelo da contabilidade
  // e com a referência (dias, cotas, faixa) que o papel mostra na coluna do meio.
  //
  // 🔴 CADA LINHA VAI PRO LADO CERTO (consertado em 19/09/2026). Até aqui, TODAS iam
  // para `proventos` — e as que são desconto (Faltas, INSS, IRRF) saíam no papel como
  // provento de "R$ 0,00", sem entrar no total de descontos e sem abater o líquido.
  // Um recibo de R$ 1.700 com uma falta e INSS imprimia "TOTAL DE DESCONTOS R$ 0,00".
  // Os testes de então só cobriam folha sem falta e sem imposto, onde só há provento.
  const descontosDaFolha: Array<[string, string, string]> = [];
  // O 13º usa o MESMO formato de linha da folha mensal, então passa pelo mesmo caminho —
  // e herda de graça a separação provento/desconto consertada em 19/09/2026.
  for (const linha of [
    ...(data.folha?.linhas ?? []),
    ...(data.decimo?.linhas ?? []),
    ...(data.rescisao?.linhas ?? []),
  ]) {
    const descricao = linha.referencia ? `${linha.descricao} (${linha.referencia})` : linha.descricao;
    if (linha.desconto > 0) descontosDaFolha.push([descricao, '-', fmtBRL(linha.desconto)]);
    else proventos.push([descricao, '+', fmtBRL(linha.provento)]);
  }

  // Diarista (ou quem tem os dois): a linha das diárias só entra se houver diária.
  // Sem esta guarda, o recibo de mensalista sairia com "Diárias (0 dias) R$ 0,00".
  if (!(data.folha || data.decimo || data.rescisao) || data.totalDailyRate > 0) {
    proventos.push([`Diárias (${workingDays} dia${workingDays !== 1 ? 's' : ''})`, '+', fmtBRL(data.totalDailyRate)]);
  }
  if (data.totalBonusB > 0) proventos.push([`Bonificação B (${bonusCounts.b}×)`, '+', fmtBRL(data.totalBonusB)]);
  if (data.totalBonusC1 > 0) proventos.push([`Bonificação C1 (${bonusCounts.c1}×)`, '+', fmtBRL(data.totalBonusC1)]);
  if (data.totalBonusC2 > 0) proventos.push([`Bonificação C2 (${bonusCounts.c2}×)`, '+', fmtBRL(data.totalBonusC2)]);

  const quantityErrorDiscount = data.quantityErrorDiscount || 0;
  // Folha primeiro (faltas, INSS, IRRF), como no modelo da contabilidade; os descontos
  // de erro e triagem vêm depois, na ordem em que o recibo de diarista sempre imprimiu.
  const descontos: Array<[string, string, string]> = [...descontosDaFolha];
  if (quantityErrorDiscount > 0) {
    descontos.push(['Desconto por erros de quantidade', '-', fmtBRL(quantityErrorDiscount)]);
  }
  if (data.errorDiscount > 0) descontos.push(['Desconto de Erros', '-', fmtBRL(data.errorDiscount)]);
  if (data.triageDiscount > 0) descontos.push(['Desconto de Triagem', '-', fmtBRL(data.triageDiscount)]);

  return { proventos, descontos, quantityErrorDiscount };
}

function buildPdf(data: HoleriteData): jsPDF {
  const doc = novaFolha();
  desenharRecibo(doc, data);
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

/**
 * UM PDF SÓ, com uma folha por pessoa — o "caderno" de recibos.
 *
 * Pedido do Victor (11/09/2026): *"ter a opção de baixar também um único PDF,
 * com várias folhas, e estar as folhas lá os PDF certinhos de cada um"*. É pra
 * imprimir a folha inteira de uma vez, em vez de abrir 40 arquivos.
 *
 * Cada pessoa começa numa folha NOVA (`addPage`), então recibo nenhum divide
 * página com outro — mesmo que o de alguém passe de uma folha (muitas diárias
 * listadas), o próximo começa limpo.
 *
 * A ordem é a que chega. Quem chama ordena por nome antes.
 */
export async function generateLoteHoleritePdf(lote: readonly HoleriteData[]): Promise<Blob> {
  if (lote.length === 0) throw new Error('Nada pra gerar: a lista veio vazia.');
  const doc = novaFolha();
  lote.forEach((data, i) => {
    if (i > 0) doc.addPage();
    desenharRecibo(doc, data);
  });
  return doc.output('blob');
}
