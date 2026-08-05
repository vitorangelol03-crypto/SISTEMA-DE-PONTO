/**
 * Selecionar arrastando o mouse (pedido do Victor, 04/08/2026).
 *
 * Na lista de grupos são dezenas de caixinhas; marcar uma a uma no dia do
 * fechamento é lento. Agora dá pra segurar o clique e ir descendo que ele vai
 * marcando — e **voltando pra cima ele desmarca** o que acabou de marcar.
 *
 * Por que "faixa" e não "pincel": no pincel (marca tudo por onde passa e pronto),
 * voltar não desfaz — quem passou do ponto teria que sair do arrasto e desmarcar
 * na mão, que é justamente o que ele pediu pra evitar. Aqui o que vale é a FAIXA
 * entre a caixinha onde o clique começou (âncora) e onde o mouse está agora:
 * encolher a faixa devolve os de fora ao estado em que estavam antes do arrasto.
 *
 * Puro de propósito: a parte que erra feio (marcar quem não devia) fica testável
 * sem navegador.
 */

/** O que o arrasto guarda desde o clique inicial. */
export interface ArrastoSelecao {
  /** Índice da caixinha onde o clique começou. */
  ancora: number;
  /** Estado que a faixa recebe: `true` marca, `false` desmarca. */
  valor: boolean;
  /** Quem estava selecionado ANTES do arrasto — é o que a faixa devolve ao encolher. */
  antes: ReadonlySet<string>;
}

/**
 * Como a seleção deve ficar com o mouse sobre o índice `atual`.
 *
 * Fora da faixa, cada item volta ao que era antes do arrasto. Dentro dela, todos
 * recebem `valor`. A faixa é inclusiva nas duas pontas e funciona pros dois lados
 * (arrastar pra cima a partir da âncora também marca).
 */
export function selecaoDoArrasto(
  nomes: readonly string[],
  arrasto: ArrastoSelecao,
  atual: number,
): Set<string> {
  const ini = Math.min(arrasto.ancora, atual);
  const fim = Math.max(arrasto.ancora, atual);
  const saida = new Set<string>();
  for (let i = 0; i < nomes.length; i++) {
    const nome = nomes[i];
    const naFaixa = i >= ini && i <= fim;
    const marcado = naFaixa ? arrasto.valor : arrasto.antes.has(nome);
    if (marcado) saida.add(nome);
  }
  // Quem está selecionado mas não aparece na lista (filtro escondeu) não pode ser
  // perdido pelo arrasto — o operador não viu, então não decidiu nada sobre ele.
  for (const nome of arrasto.antes) if (!nomes.includes(nome)) saida.add(nome);
  return saida;
}

/**
 * Quais nomes precisam ser alternados para sair de `atual` e chegar em `desejada`.
 *
 * A tela só sabe ALTERNAR um por vez (`onToggleSelGroup`), então o que muda é
 * calculado aqui: alternar só o necessário evita piscar a lista inteira e mantém
 * intacto quem não faz parte da faixa.
 */
export function togglesNecessarios(
  nomes: readonly string[],
  atual: ReadonlySet<string>,
  desejada: ReadonlySet<string>,
): string[] {
  return nomes.filter((nome) => atual.has(nome) !== desejada.has(nome));
}
