/**
 * Somas que o HOLERITE imprime na tabela "Composição do Pagamento".
 *
 * POR QUE ISTO EXISTE (achado em 04/08/2026): o `FinancialTab` montava os dados de cada
 * funcionário **sem** estes quatro totais, mas o gerador do PDF os lia (`data.totalDailyRate
 * || 0`). Resultado no papel que vai pro funcionário:
 *   · "Diárias (N dias) → R$ 0,00" — sempre zerado;
 *   · as linhas de Bonificação B, C1 e C2 **nem apareciam** (o gerador só imprime quando o
 *     valor é maior que zero);
 *   · enquanto o TOTAL BRUTO e o LÍQUIDO, que vêm de campos reais, saíam certos.
 * Ou seja: o holerite se contradizia — detalhe zerado, total correto.
 *
 * Nada disso aparecia no conferidor de tipos porque, até 04/08, `tsc` na raiz deste projeto
 * não checava nada (project references com `"files": []`).
 *
 * Mora num módulo próprio, e não dentro do componente, pra poder ser testado sem React —
 * é o mesmo padrão do `driverPayShared`.
 */

/** O que cada pagamento contribui. Espelha as colunas de `payments` que o holerite usa. */
export interface PagamentoDoHolerite {
  daily_rate?: number | null;
  bonus_b?: number | null;
  bonus_c1?: number | null;
  bonus_c2?: number | null;
}

export interface TotaisDoHolerite {
  totalDailyRate: number;
  totalBonusB: number;
  totalBonusC1: number;
  totalBonusC2: number;
}

const soma = (pagamentos: readonly PagamentoDoHolerite[], campo: keyof PagamentoDoHolerite): number =>
  pagamentos.reduce((acc, p) => acc + (Number(p[campo]) || 0), 0);

/**
 * Soma diárias e bonificações dos MESMOS pagamentos que vão pro PDF.
 *
 * ⚠️ Tem que ser a mesma lista que alimenta `payments` no holerite: o gerador conta os
 * "dias trabalhados" e a quantidade de cada bônus a partir dela, então somar de outra
 * origem faria a contagem e o valor não baterem no mesmo papel.
 *
 * `Number(...) || 0` cobre null, undefined e string vinda do banco sem virar `NaN`.
 */
export function somarTotaisDoHolerite(pagamentos: readonly PagamentoDoHolerite[]): TotaisDoHolerite {
  return {
    totalDailyRate: soma(pagamentos, 'daily_rate'),
    totalBonusB: soma(pagamentos, 'bonus_b'),
    totalBonusC1: soma(pagamentos, 'bonus_c1'),
    totalBonusC2: soma(pagamentos, 'bonus_c2'),
  };
}
