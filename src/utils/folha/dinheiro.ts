/**
 * DINHEIRO — o corte de centavos da folha, num lugar só (20/09/2026).
 *
 * Existia copiado em `folhaCalc`, `impostos`, `decimoTerceiro` e `rescisao`. O mesmo bug
 * morava nas quatro cópias, e corrigir quatro vezes seria convite para a quinta.
 */

/**
 * Trunca em centavos — o que o papel da contabilidade faz.
 *
 * Não é arredondamento: com arredondamento normal, 4 dos 11 recibos de INSS do gabarito
 * sairiam um centavo a MAIS.
 *
 * ⚠️ A ORDEM DAS DUAS LIMPEZAS É O PONTO. A versão antiga limpava o ruído e só depois
 * multiplicava por 100 — mas é a MULTIPLICAÇÃO que cria ruído novo: em ponto flutuante
 * `5.06 * 100` vale 505.99999999999994, e o `floor` derrubava para 505, pagando R$ 5,05.
 * Um centavo a menos, sempre contra o funcionário, em 5,34% dos salários quando o mês
 * não era cheio. Por isso agora multiplica PRIMEIRO e limpa DEPOIS.
 *
 * As 6 casas seguem necessárias no outro sentido: `1700 / 30 * 21` dá
 * 1189.9999999999998, e sem a limpeza o recibo da Silvia pagaria R$ 1.189,99.
 */
export function truncaCentavos(valor: number): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  const emCentavos = Number((valor * 100).toFixed(6));
  return Math.floor(emCentavos) / 100;
}
