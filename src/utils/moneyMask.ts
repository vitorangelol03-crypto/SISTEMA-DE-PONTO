/**
 * Mascaramento de valores em R$ (03/09/2026, pedido do Victor: nenhum vazamento de valor
 * pra quem não tem permissão de ver — nem na tela, nem por trás dela).
 *
 * Mesma ideia do `formatBRLIf`/`HIDDEN_VALUE` de `driverpay/driverPayShared.ts`, só que
 * genérica (não presa a um módulo) — usada por Financeiro, Pagamento C6 e Erros. Não mexe
 * no que já funciona em Pagamentos Driver, que já tinha o seu próprio.
 */
export const HIDDEN_VALUE = '•••';

/** "R$ 12,34" (ou "-R$ 12,34" se negativo) quando `canView`, senão "•••". */
export const moneyBRL = (n: number, canView: boolean): string => {
  if (!canView) return HIDDEN_VALUE;
  const sign = n < 0 ? '-' : '';
  return `${sign}R$ ${Math.abs(n).toFixed(2).replace('.', ',')}`;
};
