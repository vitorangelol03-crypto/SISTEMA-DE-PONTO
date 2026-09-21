/**
 * O TUTORIAL DA FOLHA, em PDF (20/09/2026).
 *
 * Pedido do Victor: *"nada muito grande que tem que ficar lendo, nada maçante, direto
 * para leigos entender"* — com telas de verdade e exemplos.
 *
 * Por isso o desenho aqui é: **uma ideia por página**, título grande, três linhas de
 * texto no máximo, e a tela do sistema ocupando o resto. Quem gera as imagens é o
 * `tests/gerar-tutorial.spec.ts`, capturando o sistema rodando — nenhuma tela é
 * desenhada à mão, para o papel nunca mostrar algo que a pessoa não vai encontrar.
 *
 * ⚠️ NADA DE SETA "→" NO TEXTO. A fonte padrão do jsPDF não tem o caractere: ele sai
 * como `!'` E estraga a medida da linha, que deixa de quebrar e vaza pela margem. Pego
 * olhando a página renderizada, não o código. Use ">" — que é ASCII e mede certo.
 *
 * Mora em `src/utils` e não em `scripts/` porque usa o mesmo jsPDF do resto do sistema,
 * e porque assim o `tsc` confere ele junto com tudo.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const LARGURA = 595;   // A4 retrato, em pontos
const ALTURA = 842;
const MARGEM = 48;
const CONTEUDO = LARGURA - MARGEM * 2;

const AZUL: [number, number, number] = [37, 99, 175];
const CINZA: [number, number, number] = [90, 95, 105];
const VERDE: [number, number, number] = [22, 130, 70];
const ROXO: [number, number, number] = [110, 60, 160];

/** As imagens que o gerador captura, em data-URL. */
export interface TelasDoTutorial {
  ficha?: string;
  financeiro?: string;
  premiacao?: string;
  ferias?: string;
  decimo?: string;
  rescisao?: string;
}

/** Título grande + linha fina embaixo. Devolve o Y onde o conteúdo começa. */
function titulo(doc: jsPDF, numero: string, texto: string): number {
  doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.circle(MARGEM + 13, 62, 13, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(13);
  doc.text(numero, MARGEM + 13, 67, { align: 'center' });

  doc.setTextColor(20).setFont('helvetica', 'bold').setFontSize(19);
  doc.text(texto, MARGEM + 36, 68);

  doc.setDrawColor(220).setLineWidth(1);
  doc.line(MARGEM, 84, LARGURA - MARGEM, 84);
  return 106;
}

/** Parágrafo curto. Devolve o Y de baixo. */
function paragrafo(doc: jsPDF, y: number, texto: string, tamanho = 11): number {
  doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]).setFont('helvetica', 'normal').setFontSize(tamanho);
  const linhas = doc.splitTextToSize(texto, CONTEUDO);
  doc.text(linhas, MARGEM, y);
  return y + linhas.length * (tamanho + 4);
}

/** Caixa de destaque colorida, para os avisos que não podem passar batido. */
function destaque(doc: jsPDF, y: number, titulo_: string, texto: string, cor: [number, number, number]): number {
  const linhas = doc.splitTextToSize(texto, CONTEUDO - 24);
  const altura = 30 + linhas.length * 13;
  doc.setFillColor(cor[0], cor[1], cor[2]);
  doc.roundedRect(MARGEM, y, CONTEUDO, altura, 5, 5, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(11);
  doc.text(titulo_, MARGEM + 12, y + 19);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(linhas, MARGEM + 12, y + 34);
  return y + altura + 14;
}

/**
 * Encaixa a imagem da tela na largura do conteúdo, sem deformar e sem passar do rodapé.
 *
 * As capturas têm alturas muito diferentes (um modal x um painel inteiro), então a altura
 * disponível manda: se a proporção não couber, reduz a largura em vez de esticar.
 */
function tela(doc: jsPDF, y: number, imagem: string | undefined, alturaMax = ALTURA - 150 - 0): number {
  if (!imagem) return y;
  const props = doc.getImageProperties(imagem);
  const disponivel = Math.min(alturaMax, ALTURA - y - 56);
  let largura = CONTEUDO;
  let altura = (props.height * largura) / props.width;
  if (altura > disponivel) {
    altura = disponivel;
    largura = (props.width * altura) / props.height;
  }
  const x = MARGEM + (CONTEUDO - largura) / 2;
  doc.setDrawColor(210).setLineWidth(0.8);
  doc.rect(x - 2, y - 2, largura + 4, altura + 4);
  doc.addImage(imagem, 'JPEG', x, y, largura, altura, undefined, 'FAST');
  return y + altura + 16;
}

function rodape(doc: jsPDF, pagina: number): void {
  doc.setTextColor(170).setFont('helvetica', 'normal').setFontSize(8);
  doc.text('Sistema de Ponto — Folha de carteira assinada', MARGEM, ALTURA - 26);
  doc.text(String(pagina), LARGURA - MARGEM, ALTURA - 26, { align: 'right' });
}

export function montarTutorialFolha(telas: TelasDoTutorial): ArrayBuffer {
  // `compress` liga a compressão dos fluxos do PDF — com as telas em JPEG, é o que
  // leva o arquivo de quase 10 MB para algo que abre no celular sem sofrimento.
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
  let pagina = 0;
  const novaPagina = () => {
    if (pagina > 0) doc.addPage();
    pagina++;
  };

  // ═══════════════ CAPA ═══════════════
  novaPagina();
  doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.rect(0, 0, LARGURA, 260, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(30);
  doc.text('Folha de carteira', MARGEM, 120);
  doc.text('assinada', MARGEM, 156);
  doc.setFont('helvetica', 'normal').setFontSize(14);
  doc.text('Guia rápido — como usar as funções novas', MARGEM, 196);

  let y = 310;
  y = paragrafo(doc, y, 'Este guia mostra o que mudou no sistema e como usar, passo a passo, com as telas de verdade e um exemplo com números.', 12);
  y += 10;
  y = destaque(doc, y, 'Antes de tudo: nada do que já funcionava mudou.',
    'O pagamento por diária continua exatamente igual. Tudo que está aqui só acontece para quem é de carteira assinada E tem salário preenchido na ficha.', VERDE);

  y += 6;
  doc.setTextColor(20).setFont('helvetica', 'bold').setFontSize(13);
  doc.text('O que entrou', MARGEM, y);
  y += 12;
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM, right: MARGEM },
    tableWidth: CONTEUDO,
    head: [['', 'O que faz']],
    body: [
      ['Salário no recibo', 'Salário fixo, salário família, FGTS, INSS e Imposto de Renda'],
      ['Premiação', 'Um bônus lançado por você — sai limpo, sem desconto nenhum'],
      ['Férias', 'Quantos dias cada um já tem, e quem está prestes a vencer'],
      ['13º salário', 'Em duas parcelas ou de uma vez'],
      ['Rescisão', 'O acerto de contas, verba por verba'],
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 7, lineColor: 225, textColor: 40 },
    headStyles: { fillColor: [240, 243, 248], textColor: 40, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 140, fontStyle: 'bold' } },
  });
  rodape(doc, pagina);

  // ═══════════════ 1. A FICHA ═══════════════
  novaPagina();
  y = titulo(doc, '1', 'Preencher a ficha da pessoa');
  y = paragrafo(doc, y, 'Funcionários > procure a pessoa > botão Editar > role até o bloco "Folha".');
  y += 4;
  y = tela(doc, y, telas.ficha, 420);
  y = destaque(doc, y, 'Preencha também a Data de Admissão',
    'Sem ela o sistema não consegue calcular férias nem rescisão — e ele não chuta a data, de propósito.', [200, 120, 20]);
  rodape(doc, pagina);

  // ═══════════════ 2. O RECIBO ═══════════════
  novaPagina();
  y = titulo(doc, '2', 'O recibo do mês');
  y = paragrafo(doc, y, 'Financeiro > Pagamentos > escolha o mês > botão "Holerite PDF" na linha da pessoa.');
  y += 4;
  y = tela(doc, y, telas.financeiro, 190);

  doc.setTextColor(20).setFont('helvetica', 'bold').setFontSize(13);
  doc.text('Exemplo de um recibo', MARGEM, y + 6);
  autoTable(doc, {
    startY: y + 16,
    margin: { left: MARGEM, right: MARGEM },
    tableWidth: CONTEUDO,
    head: [['O que é', 'Entra', 'Sai']],
    body: [
      ['Salário do mês (30 dias)', '1.700,00', ''],
      ['Salário família (1 filho)', '67,54', ''],
      ['Premiação — Meta de agosto', '500,00', ''],
      ['Diárias (2 dias)', '200,00', ''],
      ['INSS', '', '128,68'],
    ],
    foot: [['A pessoa recebe', '2.338,86', '']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: 225, textColor: 40 },
    headStyles: { fillColor: [240, 243, 248], textColor: 40, fontStyle: 'bold' },
    footStyles: { fillColor: [232, 245, 236], textColor: 20, fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 1: { halign: 'right', cellWidth: 90 }, 2: { halign: 'right', cellWidth: 90 } },
  });
  rodape(doc, pagina);

  // ═══════════════ 3. COMO A CONTA FUNCIONA ═══════════════
  novaPagina();
  y = titulo(doc, '3', 'Como a conta funciona');
  y = paragrafo(doc, y, 'São três regras. Elas explicam quase tudo que aparece no recibo.');
  y += 10;

  y = destaque(doc, y, '1. O INSS e o FGTS saem só do SALÁRIO',
    'No exemplo, a conta é sobre R$ 1.700,00 — e não sobre os R$ 2.467,54 que ela recebe. Salário família e premiação ficam de fora. É assim que a sua contabilidade já faz.', AZUL);

  y = destaque(doc, y, '2. O FGTS não é descontado da pessoa',
    'Os R$ 136,00 do exemplo são depositados pela empresa. Aparecem no recibo como informação, e não saem do bolso de ninguém.', VERDE);

  y = destaque(doc, y, '3. A premiação sai limpa',
    'O valor que você digitar é exatamente o que a pessoa recebe: sem INSS, sem Imposto de Renda e sem FGTS em cima.', ROXO);

  y += 6;
  y = paragrafo(doc, y, 'Se aparecer uma tarja amarela escrita "VALORES EM CONFERÊNCIA" no recibo, é porque as tabelas de INSS e Imposto de Renda deste ano ainda não foram conferidas com o contador. Ela some quando alguém marcar isso em Configurações.', 10);
  rodape(doc, pagina);

  // ═══════════════ 4. A CONTA DO INSS ═══════════════
  novaPagina();
  y = titulo(doc, '4', 'A conta do INSS, por dentro');
  y = paragrafo(doc, y, 'O INSS é progressivo: cada faixa cobra só sobre o pedaço do salário que cai nela. Por isso quem ganha R$ 1.700 NÃO paga 9% de tudo.');
  y += 10;

  doc.setTextColor(20).setFont('helvetica', 'bold').setFontSize(12);
  doc.text('Exemplo: salário de R$ 1.700,00', MARGEM, y);
  autoTable(doc, {
    startY: y + 10,
    margin: { left: MARGEM, right: MARGEM },
    tableWidth: CONTEUDO,
    head: [['Faixa', 'Sobre quanto', 'Cobra', 'Dá']],
    body: [
      ['Até R$ 1.621,00', 'R$ 1.621,00', '7,5%', 'R$ 121,5750'],
      ['O que passa disso', 'R$ 79,00', '9%', 'R$ 7,1100'],
      ['', '', 'Soma', 'R$ 128,6850'],
    ],
    foot: [['', '', 'No recibo', 'R$ 128,68']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: 225, textColor: 40 },
    headStyles: { fillColor: [240, 243, 248], textColor: 40, fontStyle: 'bold' },
    footStyles: { fillColor: [232, 240, 250], textColor: 20, fontStyle: 'bold', fontSize: 11 },
    columnStyles: {
      1: { halign: 'right', cellWidth: 100 },
      2: { halign: 'right', cellWidth: 70 },
      3: { halign: 'right', cellWidth: 100 },
    },
  });
  // jspdf-autotable expõe finalY via doc.lastAutoTable em runtime (não tipado) — mesmo
  // idioma de mirrorPdf.ts/driverReport.ts.
  const ultima = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  y = (typeof ultima?.finalY === 'number' ? ultima.finalY : y + 120) + 18;

  y = destaque(doc, y, 'O recibo imprime "9,00%", mas ela não paga 9%',
    'A porcentagem impressa é a FAIXA que o salário alcançou, não o que a pessoa paga no total. Nos R$ 1.700 do exemplo, ela paga R$ 128,68 — que são 7,57% do salário. É a dúvida mais comum de quem lê o recibo.', ROXO);

  y = destaque(doc, y, 'O INSS tem um teto: para de crescer em R$ 8.475,55',
    'Quem ganha acima disso contribui como se ganhasse o teto. O desconto máximo de INSS é R$ 988,08 por mês, por mais alto que seja o salário.', AZUL);

  y = destaque(doc, y, 'A tabela oficial traz um atalho, e é ele que o sistema usa',
    'Em vez de somar faixa por faixa, a conta pode ser feita de uma vez: salário x 9% menos R$ 24,32 (a "parcela a deduzir" da tabela). Dá o mesmo resultado, e é o que a sua contabilidade usa — por isso o recibo bate com o dela.', VERDE);

  y = paragrafo(doc, y, 'As faixas ficam em Configurações e mudam por lei todo ano. Se a tabela estiver desatualizada, a conta sai errada EM SILÊNCIO: até 21/09/2026 este sistema tinha a tabela errada acima de R$ 2.902 e ninguém notaria, porque os recibos usados para conferir iam só até R$ 2.200. Por isso o ano de vigência aparece junto da tabela — e a tarja de conferência só sai quando o contador olhar.', 10);
  rodape(doc, pagina);

  // ═══════════════ 5. PREMIAÇÃO ═══════════════
  novaPagina();
  y = titulo(doc, '5', 'Lançar uma premiação');
  y = paragrafo(doc, y, 'Na mesma tela do mês, clique em "Premiação" na linha da pessoa. Digite o valor e, se quiser, o motivo — ele sai impresso no recibo.');
  y += 4;
  y = tela(doc, y, telas.premiacao, 420);
  y = destaque(doc, y, 'Ela cai no mês que está na tela',
    'A premiação aparece no recibo do período que você está olhando quando clicou. Se quiser em outro mês, mude o período antes.', [200, 120, 20]);
  rodape(doc, pagina);

  // ═══════════════ 6. FÉRIAS ═══════════════
  novaPagina();
  y = titulo(doc, '6', 'Férias — quem já tem, quem está vencendo');
  y = paragrafo(doc, y, 'Financeiro > Férias > Calcular. Quem está com férias vencidas aparece no topo, em vermelho.');
  y += 4;
  y = tela(doc, y, telas.ferias, 430);
  y = destaque(doc, y, 'Vermelho custa dinheiro',
    'Férias vencida é a que passou de 12 meses sem ser tirada — a lei manda pagar em dobro. Amarelo é quem vence nos próximos 90 dias.', [180, 50, 50]);
  rodape(doc, pagina);

  // ═══════════════ 7. 13º ═══════════════
  novaPagina();
  y = titulo(doc, '7', '13º salário');
  y = paragrafo(doc, y, 'Financeiro > 13º Salário > escolha o ano e a parcela > Calcular. Depois é só baixar os recibos e registrar.');
  y += 4;
  y = tela(doc, y, telas.decimo, 380);
  y = paragrafo(doc, y, 'Avos é quantos meses a pessoa trabalhou no ano: 12/12 é o ano inteiro. Quem entrou em julho tem 6/12 e recebe metade.', 10);
  y = destaque(doc, y, 'Baixar não é registrar',
    '"Baixar os recibos" só gera papel — dá para conferir à vontade. "Registrar" é o que grava, e é o que faz a 2ª parcela saber quanto a 1ª já pagou.', AZUL);
  rodape(doc, pagina);

  // ═══════════════ 8. RESCISÃO ═══════════════
  novaPagina();
  y = titulo(doc, '8', 'Rescisão');
  y = paragrafo(doc, y, 'Financeiro > Rescisão > procure a pessoa > escolha o motivo, a data e o aviso prévio. A conta aparece aberta antes de gerar qualquer papel.');
  y += 4;
  y = tela(doc, y, telas.rescisao, 400);
  y = destaque(doc, y, 'O saldo do FGTS é você quem digita',
    'O sistema não tem o extrato da Caixa, então não inventa a multa de 40%. Sem esse número, a multa simplesmente não entra na conta — e o papel avisa.', [200, 120, 20]);
  rodape(doc, pagina);

  // ═══════════════ 9. AS ARMADILHAS ═══════════════
  novaPagina();
  y = titulo(doc, '9', 'Três coisas que confundem');
  y += 6;

  y = destaque(doc, y, '1. O salário só aparece no recibo do MÊS inteiro',
    'Se você escolher uma semana ou uma quinzena, o salário não sai — e o papel explica por quê. Isso é de propósito: o INSS é calculado sobre o mês, e um pedaço dele daria um valor errado.', AZUL);

  y = destaque(doc, y, '2. Sem data de admissão, não tem férias nem rescisão',
    'A pessoa aparece numa lista à parte pedindo a data. O sistema prefere pedir a você do que chutar — férias é direito e é dinheiro.', [200, 120, 20]);

  y = destaque(doc, y, '3. A tarja amarela no recibo',
    'Ela diz "VALORES EM CONFERÊNCIA" e vai continuar aparecendo até o contador confirmar as tabelas de INSS e Imposto de Renda. É um lembrete, não um erro.', [150, 120, 20]);

  y += 10;
  y = paragrafo(doc, y, 'Recomendação: antes de preencher o salário de todo mundo, faça com UMA pessoa, gere o recibo dela e confira com a contabilidade. Se algo não bater, é uma pessoa só e dá para desfazer.', 11);
  rodape(doc, pagina);

  return doc.output('arraybuffer');
}
