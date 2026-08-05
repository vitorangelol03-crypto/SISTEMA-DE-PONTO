/**
 * Pedir o print SOZINHO quando a planilha entra (05/08/2026, pedido do Victor).
 *
 * *"quando subir a planilha da shopee, todo usuário que tiver pacote da shopee e ainda não
 * tiver mandado o print do espelho, o sistema pedir de forma automática, para validar e
 * passar para próxima etapa"*.
 *
 * Antes disso alguém tinha que lembrar de clicar em "Solicitar espelho" depois de cada
 * importação — e quem entrasse na planilha DEPOIS do clique ficava sem pedido nenhum,
 * invisível: nem o app pedia, nem o painel cobrava.
 *
 * ⚠️ Quem já está com o **espelho conferido fica de fora**, mesmo sem print — é a outra
 * regra dele, na mesma conversa: *"quem já está validado continua validado, já passou dessa
 * parte"*. Sem isso, importar a planilha de novo voltaria a cobrar print de quem a equipe
 * já validou na mão.
 */

/** O mínimo que esta regra precisa saber de uma linha da grade. */
export interface AutoProofRowLike {
  driverId: string;
  espelhoConferido: boolean;
}

/**
 * Quem deve receber pedido de print AGORA, nesta plataforma.
 *
 * As três perguntas chegam como funções porque cada uma mora numa fonte diferente
 * (pacotes na linha, pedidos na tabela de solicitações, prints na de espelhos) — e assim a
 * regra fica testável sem banco.
 */
export function driversParaPedirPrint<R extends AutoProofRowLike>(
  rows: readonly R[],
  temPacote: (row: R) => boolean,
  jaTemPedido: (row: R) => boolean,
  jaMandouPrint: (row: R) => boolean,
): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.espelhoConferido) continue; // já passou dessa etapa
    if (!temPacote(row)) continue; // não entrega nessa plataforma
    if (jaMandouPrint(row)) continue; // já mandou, esperando conferência
    if (jaTemPedido(row)) continue; // já está sendo cobrado
    if (!ids.includes(row.driverId)) ids.push(row.driverId);
  }
  return ids;
}

/**
 * Em quais plataformas faz sentido pedir print sozinho.
 *
 * 🔑 NÃO é uma lista fixa com "SHOPEE" escrito no código: é a plataforma que **já tem
 * história de print** nesta empresa (alguém já pediu ou já recebeu um). Hoje isso dá
 * exatamente SHOPEE; no dia em que a CD pedir print de outra plataforma uma vez na mão,
 * dali em diante passa a ser automático também — sem ninguém mexer em código.
 *
 * Só entram plataformas que **vieram nesta importação**: subir a planilha da iMile não
 * pode disparar cobrança de print da Shopee.
 */
export function plataformasQuePedemPrint(
  importadas: readonly string[],
  comHistoricoDePrint: ReadonlySet<string>,
): string[] {
  return importadas.filter((nome) => comHistoricoDePrint.has(nome));
}
