/**
 * A conta do dinheiro de cada funcionário num período — em UM lugar só.
 *
 * Por que este arquivo existe (12/09/2026): o Victor pediu relatórios (ponto,
 * financeiro e geral) gerados de dentro do Financeiro. Esta conta morava dentro
 * do `FinancialTab.tsx` (`processFinancialData`), e o relatório precisaria dela
 * para OUTRO período — o filtrado no relatório, não o da tela.
 *
 * Copiar a conta para o relatório seria o começo de dois números divergindo:
 * a tela diria R$ X e o papel do funcionário R$ Y, e ninguém saberia qual está
 * certo. Então a função saiu da tela e virou este arquivo — é a MESMA conta,
 * movida, usada pelos dois.
 *
 * O que ela NÃO faz: buscar do banco. Recebe as listas já buscadas, é pura, e
 * por isso dá para testar sem rede.
 */

import type { Employee, Payment, Attendance, ErrorRecord } from '../services/database';
import { somarTotaisDoHolerite } from './holeriteTotals';

export interface TriageDiscount {
  period_start: string;
  period_end: string;
  value_deducted: number;
  errors_share: number;
}

export interface TriageDistributionRow {
  employee_id: string;
  period_start: string;
  period_end: string;
  value_deducted: number;
  errors_share: number;
}

export interface EmployeeFinancialData {
  employee: Employee;
  workDays: number;
  absences: number;
  customExitDays: number;
  payments: Payment[];
  errorRecords: ErrorRecord[];
  totalErrors: number;
  totalErrorValue: number;
  totalTriageDiscount: number;
  totalEarnedGross: number;
  totalEarned: number;
  triageDiscounts: TriageDiscount[];
  /**
   * Somas que o HOLERITE imprime na "Composição do Pagamento". Faltavam aqui, mas o
   * gerador do PDF já as lia — então o papel do funcionário saía com "Diárias R$ 0,00" e
   * SEM as linhas de bonificação, enquanto o total bruto/líquido saía certo (04/08/2026).
   */
  totalDailyRate: number;
  totalBonusB: number;
  totalBonusC1: number;
  totalBonusC2: number;
  /**
   * Horas noturnas do período (18/09/2026). A folha de carteira assinada precisa delas
   * pra calcular o adicional noturno em R$ — decisão do Victor: ligar o cálculo SÓ pra
   * carteira assinada, deixando o diarista como está.
   *
   * Lê os dois conjuntos de campos da linha de ponto, como o espelho passou a fazer em
   * 12/09: `night_hours` (legado) e os minutos novos. De 5.664 dias só 2.083 têm os
   * minutos — olhar só um deles zeraria a hora de quase metade dos dias.
   */
  totalNightHours: number;
}

/**
 * Monta a linha financeira de cada funcionário a partir das listas do período.
 *
 * Mantida IDÊNTICA à que rodava dentro da tela — inclusive as decisões abaixo,
 * que já estavam provadas em produção:
 *
 * - `payments.total` já vem com o desconto manual de erros de QUANTIDADE (o
 *   botão "Descontar Erros") embutido. Erros de VALOR e a triagem não tocam o
 *   `total` — são abatidos aqui.
 * - `totalEarned` nunca fica negativo: desconto maior que o ganho vira zero.
 */
/**
 * Horas noturnas de UM dia, olhando os dois conjuntos de campos que convivem na linha
 * de ponto: os minutos novos (`nighttime_minutes`) e a hora legado (`night_hours`).
 *
 * É a mesma lição de 12/09/2026, quando o espelho saía com 0h em 905 dias por ler só
 * os minutos. Aqui o minuto manda quando existe; senão, vale a hora legado.
 */
function horasNoturnasDoDia(att: Attendance): number {
  const minutos = Number((att as unknown as { nighttime_minutes?: number | null }).nighttime_minutes ?? 0);
  if (minutos > 0) return minutos / 60;
  return Number(att.night_hours ?? 0);
}

export function agregarFinanceiroPorPessoa(
  employeesData: Employee[],
  paymentsData: Payment[],
  attendancesData: Attendance[],
  errorRecordsData: ErrorRecord[],
  triageData: TriageDistributionRow[],
): EmployeeFinancialData[] {
  return employeesData.map(employee => {
    const employeeAttendances = attendancesData.filter(att => att.employee_id === employee.id);
    const employeePayments = paymentsData.filter(pay => pay.employee_id === employee.id);
    const employeeErrors = errorRecordsData.filter(err => err.employee_id === employee.id);
    const triageDiscounts = triageData
      .filter(t => t.employee_id === employee.id)
      .map(t => ({
        period_start: t.period_start,
        period_end: t.period_end,
        value_deducted: t.value_deducted,
        errors_share: t.errors_share,
      }));

    const workDays = employeeAttendances.filter(att => att.status === 'present').length;
    const absences = employeeAttendances.filter(att => att.status === 'absent').length;
    const customExitDays = employeeAttendances.filter(att => att.status === 'present' && att.exit_time).length;
    const totalErrors = employeeErrors
      .filter(e => (e.error_type ?? 'quantity') === 'quantity')
      .reduce((sum, err) => sum + (err.error_count ?? 0), 0);
    const totalErrorValue = employeeErrors
      .filter(e => e.error_type === 'value')
      .reduce((sum, err) => sum + Number(err.error_value ?? 0), 0);
    const totalTriageDiscount = triageDiscounts.reduce((s, t) => s + t.value_deducted, 0);
    const totalEarnedGross = employeePayments.reduce((sum, pay) => sum + (pay.total || 0), 0);
    const totalEarned = Math.max(0, totalEarnedGross - totalErrorValue - totalTriageDiscount);
    // Somas do holerite. Da MESMA lista que vai pro PDF: o gerador conta os dias e a
    // quantidade de cada bônus a partir dela, então outra origem faria contagem e valor
    // não baterem no mesmo papel.
    const totaisHolerite = somarTotaisDoHolerite(employeePayments);
    const totalNightHours = employeeAttendances.reduce((soma, att) => soma + horasNoturnasDoDia(att), 0);

    return {
      employee,
      workDays,
      absences,
      customExitDays,
      payments: employeePayments,
      errorRecords: employeeErrors,
      totalErrors,
      totalErrorValue,
      totalTriageDiscount,
      totalEarnedGross,
      totalEarned,
      triageDiscounts,
      ...totaisHolerite,
      totalNightHours: Math.round(totalNightHours * 100) / 100,
    };
  });
}

/**
 * O desconto de erros de QUANTIDADE que já foi abatido do pagamento lá atrás
 * (botão "Descontar Erros") e por isso não aparece em nenhuma linha.
 *
 * É a diferença entre o que foi LISTADO (diárias + bonificações) e o total que
 * ficou gravado. Sem essa linha, os proventos não fecham com o total e o
 * funcionário não tem como saber para onde foi o dinheiro — aconteceu de verdade
 * em 19 dos 46 funcionários da quinzena de julho/2026.
 *
 * Mora aqui porque o recibo E os relatórios precisam do MESMO número.
 */
export function descontoDeQuantidadeEmbutido(d: EmployeeFinancialData): number {
  const listado = d.totalDailyRate + d.totalBonusB + d.totalBonusC1 + d.totalBonusC2;
  return Math.max(0, listado - d.totalEarnedGross);
}
