/**
 * QUEM FOI DESLIGADO some das telas — mas os dados antigos ficam (19/09/2026).
 *
 * Pedido do Victor, nas palavras dele: *"se o funcionário trabalhou até o mês 8, ele
 * recebeu no mês 8, no mês 9 ele foi desligado, no mês 8 nos registros financeiros vai
 * estar ele lá, mas no mês 9 ele já está como desligado"* — e *"não fica ocupando espaço
 * com registro à toa, acumulando dados que não vão servir para nada"*.
 *
 * ## A regra, inteira
 *
 * Uma pessoa desligada aparece numa tela de período quando:
 *   · ela saiu DURANTE ou DEPOIS daquele período (ainda era da casa em parte dele); ou
 *   · ela tem algum dado naquele período (trabalhou, recebeu, teve erro, tem acerto).
 *
 * Fora isso, some. Quem não tem data de saída aparece sempre — que é todo mundo hoje.
 *
 * ## Por que isto NÃO é uma conta nova
 *
 * O relatório já fazia exatamente isso desde 12/09, com o nome `teveAlgo`: quem não teve
 * nada no período não vira folha em branco. O que muda agora é que a mesma regra passa a
 * valer no Ponto, no Financeiro, nos Erros e no C6 — e ganha um lugar só, em vez de
 * viver copiada em cinco telas, que é como ela um dia divergiria.
 *
 * ## O que ela NÃO faz
 *
 * Não apaga nada e não esconde do cadastro. Na aba Funcionários o desligado continua
 * existindo, atrás do botão "Mostrar desligados" (decisão do Victor) — porque é de lá
 * que se conserta uma data de saída digitada errada.
 */

/** Só os campos que a regra olha — de propósito, para não amarrar no `Employee`. */
export interface PessoaComSaida {
  termination_date?: string | null;
}

export interface PeriodoDaTela {
  inicio: string;
  fim: string;
}

/**
 * A pessoa aparece nesta tela?
 *
 * `temDadoNoPeriodo` é quem chama que sabe: no Financeiro é ter pagamento, ponto, erro,
 * 13º ou rescisão; no Ponto é ter batida no dia. Passar `false` sem olhar esconderia
 * gente que ainda tem dinheiro a aparecer — é o único jeito de esta regra errar feio.
 */
export function apareceNoPeriodo(
  pessoa: PessoaComSaida,
  periodo: PeriodoDaTela,
  temDadoNoPeriodo: boolean,
): boolean {
  const saida = (pessoa.termination_date ?? '').trim();
  if (!saida) return true;
  // Saiu durante ou depois deste período: ainda era da casa em parte dele.
  if (saida >= periodo.inicio) return true;
  return temDadoNoPeriodo;
}

/** Atalho para as telas de UM DIA (o Ponto), onde início e fim são o mesmo. */
export function apareceNoDia(
  pessoa: PessoaComSaida,
  dia: string,
  temDadoNoDia: boolean,
): boolean {
  return apareceNoPeriodo(pessoa, { inicio: dia, fim: dia }, temDadoNoDia);
}

/**
 * A pessoa ainda pode BATER PONTO hoje?
 *
 * Decisão do Victor (19/09/2026): *"não, mas só depois da data de saída"* — quem sai dia
 * 15 bate até o dia 15, mesmo que a rescisão seja registrada antes. Registrar o acerto
 * no dia 10 não pode tirar da pessoa os cinco dias que ela ainda vai trabalhar.
 *
 * Isto é trava de verdade, no servidor — não basta esconder da tela.
 */
export function podeBaterPonto(pessoa: PessoaComSaida, hoje: string): boolean {
  const saida = (pessoa.termination_date ?? '').trim();
  if (!saida) return true;
  return hoje <= saida;
}

/** Já saiu, para efeito de listagem sem período (o cadastro). */
export function estaDesligado(pessoa: PessoaComSaida): boolean {
  return Boolean((pessoa.termination_date ?? '').trim());
}
