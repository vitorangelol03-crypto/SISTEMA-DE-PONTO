/**
 * Quem recebe CARTÃO DE PRINT — a regra, num lugar só (22/09/2026, decisão do Victor).
 *
 * 🔴 EXISTE POR UM CASO REAL: até 21/09/2026, enquanto a planilha de uma plataforma não
 * era importada, o pedido "pra todos" cobrava print de **todo mundo que estava em grupo** —
 * inclusive de quem nunca entregou naquela plataforma. Na 2ª quinzena de agosto isso pôs
 * **31 pessoas sem um pacote de Shopee** como cartão na tela do líder, e foi assim que o
 * print da **Greice** (1.132 pacotes) acabou gravado no **Mikael**, que tem 0 Shopee: o
 * pagamento DELE ficou com "espelho conferido ✓" e o dela sem.
 *
 * A regra nova, decidida por ele em 22/09:
 *   - **pedido individual** cobra sempre (o operador escolheu aquela pessoa de propósito);
 *   - **pedido "pra todos"**, enquanto a planilha não chegou, cobra só quem **já entregou
 *     naquela plataforma nas últimas 2 quinzenas**;
 *   - **entregador novo**, sem histórico em nada, **não é cobrado** — ele não fica
 *     esquecido, porque o pedido automático pós-importação (05/08) pega quem tem pacote;
 *   - **planilha já importada**: nada muda, vale a regra de sempre (só quem tem pacote).
 *
 * Ser apertado custa pouco: o atraso vai no máximo até a planilha entrar. Ser largo custa
 * print no nome errado, que é dinheiro marcado como conferido pra quem não entregou.
 *
 * ⚠️ ESTA CONTA MORA EM DOIS LUGARES: aqui (usado pela edge function `driver-public-api`,
 * que monta a tela do entregador) e em `expectedProofPlatforms`
 * (`src/components/driverpay/driverPayShared.ts`, que monta a grade do painel). Elas
 * **não podem divergir em silêncio** — `tests/unit/driverPayCartaoPrintHistorico.spec.ts`
 * roda as duas lado a lado sobre a mesma tabela de casos, igual já se faz com a
 * conferência de quantidade (`runProofCheck` × `statusPorQuantidade`).
 */

/** Tudo que a decisão precisa saber sobre UM (entregador × plataforma). */
export interface EntradaDoCartaoDePrint {
  /** Existe pedido "pra todos" que alcança este entregador (ele está em grupo). */
  praTodos: boolean;
  /** Existe pedido individual DELE nesta plataforma. */
  soPraEle: boolean;
  /** Ele tem pacote nesta plataforma nesta quinzena. */
  temPacote: boolean;
  /** A planilha desta plataforma ainda NÃO foi importada nesta quinzena. */
  semPlanilha: boolean;
  /** Ele entregou nesta plataforma na janela de histórico (ver `QUINZENAS_DE_HISTORICO`). */
  entregouAntes: boolean;
}

/**
 * Quantas quinzenas passadas contam como "já entregou aqui" (decisão do Victor, 22/09/2026:
 * *"as últimas 2 quinzenas"*). Quem rodou Shopee uma vez em junho e parou não conta.
 */
export const QUINZENAS_DE_HISTORICO = 2;

/** Ele deve mandar print desta plataforma nesta quinzena? */
export function deveCobrarPrint(e: EntradaDoCartaoDePrint): boolean {
  if (!e.praTodos && !e.soPraEle) return false; // ninguém pediu dele
  // Com planilha na mão a pergunta é só uma: ele entregou nesta plataforma?
  if (!e.semPlanilha) return e.temPacote;
  // Sem planilha ninguém tem pacote ainda. Pacote > 0 aqui só acontece com lançamento
  // manual, e nesse caso ele entregou — cobra.
  if (e.temPacote) return true;
  if (e.soPraEle) return true; // escolha explícita do operador vale mais que o histórico
  return e.entregouAntes;
}
