/**
 * Mascaramento de valores em R$ (03/09/2026, pedido do Victor: nenhum vazamento de valor
 * pra quem não tem permissão de ver — nem na tela, nem por trás dela).
 *
 * Mesma ideia do `formatBRLIf`/`HIDDEN_VALUE` de `driverpay/driverPayShared.ts`, só que
 * genérica (não presa a um módulo) — usada por Financeiro, Pagamento C6 e Erros. Não mexe
 * no que já funciona em Pagamentos Driver, que já tinha o seu próprio.
 */
export const HIDDEN_VALUE = '•••';

/**
 * "R$ 1.234,56" (ou "-R$ 1.234,56" se negativo) quando `canView`, senão "•••".
 *
 * ## O ponto do milhar entrou em 19/09/2026
 *
 * Até aqui saía "R$ 1700,00", sem separador — enquanto os PDFs (recibo, relatório,
 * espelho) sempre escreveram "R$ 1.700,00". Os dois números apareciam na MESMA empresa,
 * escritos diferente, e em valor de 5 ou 6 dígitos a tela ficava de leitura difícil:
 * "R$ 158000,00" não se lê de relance. Achado por um teste de E2E da folha.
 *
 * ## Por que agrupar na mão e não usar `Intl`
 *
 * `Intl.NumberFormat('pt-BR', { style: 'currency' })` separa o "R$" do número com um
 * **espaço não-quebrável** (U+00A0), e não com o espaço comum. Tudo que compara texto —
 * teste de E2E, busca do navegador, `includes` — deixaria de casar, por um caractere que
 * ninguém vê. O agrupamento manual mantém o formato byte a byte como já era, só com os
 * pontos a mais.
 */
export const moneyBRL = (n: number, canView: boolean): string => {
  if (!canView) return HIDDEN_VALUE;
  const sign = n < 0 ? '-' : '';
  // `toFixed(2)` já arredonda e garante os dois decimais; `NaN`/`Infinity` viram 0,00
  // em vez de espalhar "NaN" pela tela.
  const absoluto = Number.isFinite(n) ? Math.abs(n) : 0;
  const [inteiro, centavos] = absoluto.toFixed(2).split('.');
  // Ponto a cada 3 dígitos, da direita para a esquerda.
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${comMilhar},${centavos}`;
};
