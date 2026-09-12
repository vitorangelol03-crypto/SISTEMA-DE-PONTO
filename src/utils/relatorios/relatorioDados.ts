/**
 * Os DADOS dos relatórios — uma folha por pessoa, montada antes de virar PDF ou
 * planilha (12/09/2026, pedido do Victor).
 *
 * São três relatórios, e cada um sai nos dois formatos:
 *
 *   ponto       o mais completo possível do PONTO, sem nada de dinheiro
 *   financeiro  focado no dinheiro, com o mínimo de ponto (dias e horas)
 *   geral       os dois inteiros, na mesma folha
 *
 * ## Por que este arquivo só monta dados
 *
 * O PDF e a planilha mostram a MESMA coisa de jeitos diferentes. Se cada um
 * montasse a sua conta, um dia iam divergir e ninguém saberia qual está certo.
 * Aqui é a conta; lá é só desenho.
 *
 * ## O que ele reaproveita (nada aqui é conta nova)
 *
 * - o dia a dia do ponto vem do `buildMirrorData`, o MESMO do espelho que a
 *   empresa já emite — inclusive o cálculo de diurnas, noturnas e intervalo;
 * - o dinheiro vem do `agregarFinanceiroPorPessoa`, a MESMA conta da tela do
 *   Financeiro e do recibo do funcionário.
 *
 * ## As linhas de valor são uma LISTA, não campos fixos
 *
 * Vale, FGTS e salário família ainda não existem no sistema (12/09/2026 — vão
 * ser implementados depois). Quando existirem, entram como mais itens da lista,
 * sem mexer no desenho do PDF nem da planilha. É por isso que é lista.
 *
 * ## O adicional noturno não aparece em R$
 *
 * Decisão do Victor (12/09/2026, opção "c"): o sistema NUNCA calculou esse
 * valor — são 2.443 dias com hora noturna e R$ 0,00 em todos, porque o código
 * procura a diária dentro do registro de ponto, onde essa coluna não existe.
 * Enquanto ele não decide se o adicional é devido, o relatório mostra as HORAS
 * noturnas (que estão certas) e nenhum valor. Melhor faltar do que mentir.
 */

import type { Employee, Company, Attendance } from '../../services/database';
import type { EmployeeFinancialData } from '../financeiroPorPessoa';
import { descontoDeQuantidadeEmbutido } from '../financeiroPorPessoa';
import { buildMirrorData, type MirrorData } from '../mirrorGenerator';

export type TipoRelatorio = 'ponto' | 'financeiro' | 'geral';

/** O que cada tipo de relatório leva. */
export const RELATORIO_TEM_PONTO: Record<TipoRelatorio, boolean> = {
  ponto: true,
  financeiro: false,
  geral: true,
};

export const RELATORIO_TEM_DINHEIRO: Record<TipoRelatorio, boolean> = {
  ponto: false,
  financeiro: true,
  geral: true,
};

/**
 * Uma linha da composição do pagamento.
 *
 * `natureza` separa três coisas que NÃO podem ser somadas juntas:
 *  - `provento`      entra no bolso da pessoa;
 *  - `desconto`      sai do bolso da pessoa;
 *  - `custo-empresa` a empresa paga, mas não é da pessoa (será o caso do FGTS).
 */
export interface LinhaDeValor {
  rotulo: string;
  /** Quantidade quando faz sentido contar (12 diárias, 3 pacotes). Senão, null. */
  quantidade: number | null;
  valor: number;
  natureza: 'provento' | 'desconto' | 'custo-empresa';
}

export interface ResumoDePonto {
  diasTrabalhados: number;
  faltas: number;
  minutosEsperados: number;
  minutosDiurnos: number;
  minutosNoturnos: number;
  minutosIntervalo: number;
  bancoCredito: number;
  bancoDebito: number;
  bancoSaldo: number;
}

export interface PessoaDoRelatorio {
  employee: Employee;
  /** O dia a dia do ponto. Só nos relatórios que têm ponto. */
  espelho: MirrorData | null;
  /** Os totais do ponto. Só nos relatórios que têm ponto. */
  resumoPonto: ResumoDePonto | null;
  /** A composição do pagamento. Vazia nos relatórios que não têm dinheiro. */
  linhas: LinhaDeValor[];
  totalProventos: number;
  totalDescontos: number;
  /** O que a pessoa recebeu — o mesmo número que a tela do Financeiro mostra. */
  totalLiquido: number;
  totalCustoEmpresa: number;
}

export interface TotaisDoRelatorio {
  pessoas: number;
  diasTrabalhados: number;
  faltas: number;
  minutosTrabalhados: number;
  minutosNoturnos: number;
  proventos: number;
  descontos: number;
  liquido: number;
  custoEmpresa: number;
}

export interface RelatorioMontado {
  tipo: TipoRelatorio;
  company: Company;
  periodo: { inicio: string; fim: string; rotulo: string };
  pessoas: PessoaDoRelatorio[];
  totais: TotaisDoRelatorio;
}

export interface MontarRelatorioInput {
  tipo: TipoRelatorio;
  company: Company;
  periodo: { inicio: string; fim: string; rotulo: string };
  /** Quem entra, já filtrado por função/vínculo/seleção pela tela. */
  financeiro: EmployeeFinancialData[];
  /** Todas as batidas do período, de todo mundo — separadas aqui por pessoa. */
  attendances: Attendance[];
  emissionDate?: string;
}

/** Conta quantos pagamentos têm aquele campo preenchido (0 não conta). */
function quantosCom(pagamentos: EmployeeFinancialData['payments'], campo: 'daily_rate' | 'bonus_b' | 'bonus_c1' | 'bonus_c2'): number {
  return pagamentos.filter(p => Number(p[campo] ?? 0) !== 0).length;
}

/**
 * A composição do pagamento de uma pessoa, em linhas.
 *
 * A ordem importa: primeiro o que entra, depois o que sai — é como o recibo já
 * imprime, e é como a pessoa lê.
 */
export function montarLinhasDeValor(d: EmployeeFinancialData): LinhaDeValor[] {
  const linhas: LinhaDeValor[] = [];

  if (d.totalDailyRate !== 0) {
    linhas.push({ rotulo: 'Diárias', quantidade: quantosCom(d.payments, 'daily_rate'), valor: d.totalDailyRate, natureza: 'provento' });
  }
  if (d.totalBonusB !== 0) {
    linhas.push({ rotulo: 'Bonificação B', quantidade: quantosCom(d.payments, 'bonus_b'), valor: d.totalBonusB, natureza: 'provento' });
  }
  if (d.totalBonusC1 !== 0) {
    linhas.push({ rotulo: 'Bonificação C1', quantidade: quantosCom(d.payments, 'bonus_c1'), valor: d.totalBonusC1, natureza: 'provento' });
  }
  if (d.totalBonusC2 !== 0) {
    linhas.push({ rotulo: 'Bonificação C2', quantidade: quantosCom(d.payments, 'bonus_c2'), valor: d.totalBonusC2, natureza: 'provento' });
  }

  // Banco de horas: crédito entra, débito sai. Já está DENTRO do total gravado
  // (a RPC de aplicar reescreve `payments.total`), então aqui ele é só a
  // explicação de um valor que já aconteceu — não se soma de novo no líquido.
  const banco = d.payments.reduce((s, p) => s + Number(p.bank_hours_amount ?? 0), 0);
  if (banco > 0) {
    linhas.push({ rotulo: 'Banco de horas (crédito)', quantidade: null, valor: banco, natureza: 'provento' });
  } else if (banco < 0) {
    linhas.push({ rotulo: 'Banco de horas (débito)', quantidade: null, valor: Math.abs(banco), natureza: 'desconto' });
  }

  // Erro de QUANTIDADE: o valor já saiu do total lá atrás, no botão "Descontar
  // Erros". Sem esta linha os proventos não fecham com o líquido e a pessoa não
  // tem como saber para onde foi o dinheiro.
  const embutido = descontoDeQuantidadeEmbutido(d);
  if (embutido > 0) {
    linhas.push({ rotulo: 'Desconto por pacotes com erro', quantidade: d.totalErrors || null, valor: embutido, natureza: 'desconto' });
  } else if (d.totalErrors > 0) {
    // Teve pacote errado, mas nada foi descontado (o botão não foi usado).
    // Aparece com valor zero DE PROPÓSITO: some da conta, não do papel.
    linhas.push({ rotulo: 'Pacotes com erro (sem desconto)', quantidade: d.totalErrors, valor: 0, natureza: 'desconto' });
  }

  if (d.totalErrorValue > 0) {
    linhas.push({ rotulo: 'Desconto por erro em valor', quantidade: null, valor: d.totalErrorValue, natureza: 'desconto' });
  }
  if (d.totalTriageDiscount > 0) {
    const pacotes = d.triageDiscounts.reduce((s, t) => s + (t.errors_share ?? 0), 0);
    linhas.push({ rotulo: 'Desconto da triagem', quantidade: pacotes || null, valor: d.totalTriageDiscount, natureza: 'desconto' });
  }

  return linhas;
}

function resumoDoEspelho(espelho: MirrorData, d: EmployeeFinancialData): ResumoDePonto {
  const t = espelho.totals;
  return {
    diasTrabalhados: d.workDays,
    faltas: d.absences,
    minutosEsperados: t.expected,
    minutosDiurnos: t.daytime,
    minutosNoturnos: t.nighttime,
    minutosIntervalo: t.interval,
    bancoCredito: t.bankCredit,
    bancoDebito: t.bankDebit,
    bancoSaldo: t.bankNet,
  };
}

/**
 * Monta o relatório inteiro: uma folha por pessoa, mais os totais do fim.
 *
 * Quem não teve NADA no período (nem ponto nem pagamento) fica de fora — senão
 * o relatório do mês viria com dezenas de folhas em branco de gente que não
 * trabalhou. Quem teve qualquer coisa entra, mesmo que zerado.
 */
export function montarRelatorio(input: MontarRelatorioInput): RelatorioMontado {
  const { tipo, company, periodo, financeiro, attendances, emissionDate } = input;
  const temPonto = RELATORIO_TEM_PONTO[tipo];
  const temDinheiro = RELATORIO_TEM_DINHEIRO[tipo];

  const pontoPorPessoa = new Map<string, Attendance[]>();
  for (const att of attendances) {
    const lista = pontoPorPessoa.get(att.employee_id);
    if (lista) lista.push(att);
    else pontoPorPessoa.set(att.employee_id, [att]);
  }

  const pessoas: PessoaDoRelatorio[] = [];

  for (const d of financeiro) {
    const doPonto = pontoPorPessoa.get(d.employee.id) ?? [];
    const teveAlgo = doPonto.length > 0 || d.payments.length > 0
      || d.errorRecords.length > 0 || d.triageDiscounts.length > 0;
    if (!teveAlgo) continue;

    const espelho = temPonto
      ? buildMirrorData({
          employee: d.employee,
          company,
          period: { start: periodo.inicio, end: periodo.fim },
          attendances: doPonto,
          emissionDate,
        })
      : null;

    const linhas = temDinheiro ? montarLinhasDeValor(d) : [];
    const totalProventos = linhas.filter(l => l.natureza === 'provento').reduce((s, l) => s + l.valor, 0);
    const totalDescontos = linhas.filter(l => l.natureza === 'desconto').reduce((s, l) => s + l.valor, 0);
    const totalCustoEmpresa = linhas.filter(l => l.natureza === 'custo-empresa').reduce((s, l) => s + l.valor, 0);

    pessoas.push({
      employee: d.employee,
      espelho,
      // O resumo do ponto aparece nos TRÊS relatórios: no financeiro ele é o
      // "quantos dias e quantas horas" que o Victor pediu. A diferença é que
      // sem espelho não há dia a dia, só os totais que a conta do dinheiro já
      // conhece (dias e faltas).
      resumoPonto: espelho
        ? resumoDoEspelho(espelho, d)
        : temDinheiro
          ? {
              diasTrabalhados: d.workDays,
              faltas: d.absences,
              minutosEsperados: 0,
              minutosDiurnos: 0,
              minutosNoturnos: 0,
              minutosIntervalo: 0,
              bancoCredito: 0,
              bancoDebito: 0,
              bancoSaldo: 0,
            }
          : null,
      linhas,
      totalProventos,
      totalDescontos,
      totalLiquido: temDinheiro ? d.totalEarned : 0,
      totalCustoEmpresa,
    });
  }

  // Ordem alfabética: é como a pessoa procura alguém num maço de folhas.
  pessoas.sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'pt-BR'));

  const totais: TotaisDoRelatorio = {
    pessoas: pessoas.length,
    diasTrabalhados: pessoas.reduce((s, p) => s + (p.resumoPonto?.diasTrabalhados ?? 0), 0),
    faltas: pessoas.reduce((s, p) => s + (p.resumoPonto?.faltas ?? 0), 0),
    minutosTrabalhados: pessoas.reduce((s, p) => s + (p.resumoPonto?.minutosDiurnos ?? 0) + (p.resumoPonto?.minutosNoturnos ?? 0), 0),
    minutosNoturnos: pessoas.reduce((s, p) => s + (p.resumoPonto?.minutosNoturnos ?? 0), 0),
    proventos: pessoas.reduce((s, p) => s + p.totalProventos, 0),
    descontos: pessoas.reduce((s, p) => s + p.totalDescontos, 0),
    liquido: pessoas.reduce((s, p) => s + p.totalLiquido, 0),
    custoEmpresa: pessoas.reduce((s, p) => s + p.totalCustoEmpresa, 0),
  };

  return { tipo, company, periodo, pessoas, totais };
}
