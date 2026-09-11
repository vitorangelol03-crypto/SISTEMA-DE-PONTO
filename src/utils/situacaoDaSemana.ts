/**
 * COMO A SEMANA APARECE NA TELA — um lugar só, pras 5 telas que mostram isso.
 *
 * 🔴 Até 11/09/2026 só existiam dois estados, e "pago" **não significava que
 * alguém pagou**: o sistema marcava `paid` sozinho em toda semana cujo
 * `end_date` já tinha passado. Por isso as 45 semanas de Caratinga apareciam
 * todas como pagas, sem ninguém ter confirmado nada.
 *
 * Agora são três:
 *
 * | status   | o que é                                   | como aparece            |
 * |----------|-------------------------------------------|-------------------------|
 * | `open`   | a semana está correndo                    | **ABERTA** (âmbar)      |
 * | `closed` | acabou, mas ninguém confirmou o pagamento | **A CONFIRMAR** (laranja)|
 * | `paid`   | alguém confirmou — com nome e data        | **paga** (verde)        |
 *
 * As 45 antigas continuam `paid` (decisão do Victor: são passado e ele pagou),
 * e se reconhecem por `paid_by` nulo — por isso a `paid` sem confirmação mostra
 * só "paga", sem o "por fulano".
 */

export type StatusDaSemana = 'open' | 'closed' | 'paid';

export interface SituacaoNaTela {
  /** O texto curto da etiqueta. */
  texto: string;
  /** As cores da etiqueta (classes do Tailwind). */
  cor: string;
  /** Dá pra lançar erro nesta semana? */
  aceitaLancamento: boolean;
  /** Já dá pra confirmar o pagamento dela? */
  podeConfirmar: boolean;
}

export function situacaoDaSemana(
  status: StatusDaSemana | string | null | undefined,
  paidBy?: string | null,
): SituacaoNaTela {
  if (status === 'open') {
    return {
      texto: 'ABERTA',
      cor: 'bg-amber-100 text-amber-800',
      aceitaLancamento: true,
      // Dá pra confirmar antes de a semana acabar — é o "paguei adiantado".
      podeConfirmar: true,
    };
  }
  if (status === 'closed') {
    return {
      texto: 'A CONFIRMAR',
      cor: 'bg-orange-100 text-orange-800',
      // A semana acabou mas o pagamento não saiu: ainda dá pra lançar erro, e é
      // justamente esta a janela pra isso (depois de confirmar, trava).
      aceitaLancamento: true,
      podeConfirmar: true,
    };
  }
  // 'paid' — e qualquer coisa inesperada cai aqui, que é o estado mais restrito.
  return {
    texto: paidBy ? 'paga' : 'paga',
    cor: 'bg-green-100 text-green-800',
    aceitaLancamento: false,
    podeConfirmar: false,
  };
}

/** "paga por 9999 em 11/09/2026" — o detalhe que vai no `title` da etiqueta. */
export function detalheDoPagamento(
  status: StatusDaSemana | string | null | undefined,
  paidBy?: string | null,
  paidAt?: string | null,
): string {
  if (status === 'open') return 'A semana está correndo.';
  if (status === 'closed') {
    return 'A semana acabou, mas ninguém confirmou o pagamento ainda. '
      + 'Confirme no arquivo de pagamento.';
  }
  if (!paidBy) {
    return 'Marcada como paga pelo sistema antigo, que fechava a semana sozinha '
      + 'quando a data passava — não há registro de quem confirmou.';
  }
  const quando = paidAt
    ? new Date(paidAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '';
  return `Pagamento confirmado por ${paidBy}${quando ? ` em ${quando}` : ''}.`;
}
