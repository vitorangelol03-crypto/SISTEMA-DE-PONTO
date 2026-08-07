/**
 * Quanto abater de vale/perda de CADA pessoa neste pagamento (07/08/2026, decisões do Victor).
 *
 * ## O problema
 *
 * O "Descontar vales e perdas" era um interruptor só, pra planilha inteira. Pagando por
 * plataforma (paga a Shopee, depois paga a eMile), as duas posições erram:
 *
 *  - **marcado** → desconta de todo mundo, inclusive de quem já foi descontado na Shopee.
 *    Medido em produção na 1ª quinzena de julho: **R$ 1.885,14 cobrados em dobro de 25 pessoas**;
 *  - **desmarcado** → não desconta de ninguém, inclusive de quem só entrega eMile e ainda não
 *    teve nada abatido. O desconto some.
 *
 * O pedido dele foi literal: *"eu poder aplicar os descontos sem que o cara que entrega shopee
 * e eMile tome desconto duas vezes e o cara que entrega eMile tome seu desconto"*.
 *
 * ## A regra
 *
 * O desconto vira **saldo**, igual conta a pagar: cada pessoa deve `vales + perdas` na quinzena,
 * e cada pagamento abate um pedaço. O que já foi abatido vive no livro-caixa
 * (`driverpay_deduction_ledger`); o que falta é a diferença.
 *
 * 🔑 **Nunca abate mais do que a pessoa recebe naquele pagamento** (decisão dele, "guardar o que
 * sobrou"): quem deve R$ 97,89 e recebe R$ 28,00 da plataforma sendo paga tem R$ 28,00 abatidos
 * agora, sai com R$ 0,00 — e continua devendo R$ 69,89 pro próximo pagamento. Antes disso a
 * linha sairia **−R$ 69,89** numa planilha de pagamento (medido: acontece com JOÃO PEDRO DA
 * SILVEIRA SILVA e Bruno Eduardo Silva na 1ª quinzena de julho).
 *
 * Puro de propósito: quem decide desconto de dinheiro não pode depender de React nem de banco
 * pra ser testado.
 */

/** Como o operador escolheu descontar nesta planilha. */
export type ModoDesconto =
  /** Só de quem ainda deve — pessoa por pessoa, com saldo. É o padrão novo. */
  | 'pendentes'
  /** De todo mundo, o valor cheio (o "marcado" de sempre; pode deixar a linha negativa). */
  | 'todos'
  /** De ninguém (o "desmarcado" de sempre — pagamento parcial). */
  | 'nenhum';

/** Arredonda em centavos. Dinheiro nunca pode carregar resto de float. */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** O que se sabe da dívida de vale/perda de uma pessoa nesta quinzena. */
export interface SaldoDesconto {
  /** Vales + perdas lançados na quinzena, em R$. */
  total: number;
  /** Quanto já foi abatido dela nesta quinzena (soma do livro-caixa), em R$. */
  jaAbatido: number;
}

/**
 * Quanto a pessoa AINDA deve. Nunca negativo — abater mais do que o devido (por correção
 * manual no banco, por exemplo) não vira crédito a favor dela.
 */
export function saldoDevedor({ total, jaAbatido }: SaldoDesconto): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const falta = total - (Number.isFinite(jaAbatido) ? jaAbatido : 0);
  return falta > 0 ? round2(falta) : 0;
}

/**
 * Quanto abater desta pessoa NESTE pagamento.
 *
 * `brutoNoEscopo` é o que ela recebe nas plataformas deste relatório — o teto do que dá pra
 * abater sem a linha virar negativa. No modo `todos` o teto NÃO se aplica: é o comportamento
 * antigo, preservado de propósito pra quem quiser o abate cheio de uma vez.
 */
export function abaterAgora(
  modo: ModoDesconto,
  saldo: SaldoDesconto,
  brutoNoEscopo: number,
): number {
  if (modo === 'nenhum') return 0;
  if (modo === 'todos') return round2(Math.max(0, saldo.total));
  const falta = saldoDevedor(saldo);
  if (falta <= 0) return 0;
  const teto = Number.isFinite(brutoNoEscopo) && brutoNoEscopo > 0 ? brutoNoEscopo : 0;
  return round2(Math.min(falta, teto));
}

/** Uma pessoa no escopo do relatório, do ponto de vista do desconto. */
export interface PessoaDesconto {
  driverId: string;
  name: string;
  /** Vales + perdas dela na quinzena. */
  total: number;
  /** Já abatido (livro-caixa). */
  jaAbatido: number;
  /** Bruto dela nas plataformas deste relatório. */
  brutoNoEscopo: number;
}

/** Uma linha da prévia: quem, quanto. */
export interface LinhaResumo {
  driverId: string;
  name: string;
  valor: number;
}

/**
 * A conta que a janela mostra ANTES de baixar o arquivo — pra ele ver a decisão em vez de
 * conferir 25 nomes na mão, que era o que a faixa amarela pedia.
 */
export interface ResumoDesconto {
  /** Vão ter desconto agora (e quanto sai de cada um). */
  vaoDescontar: LinhaResumo[];
  /** Tinham vale/perda mas já foram descontados antes — saem sem desconto. */
  jaDescontados: LinhaResumo[];
  /** Não coube tudo: abateu o que deu e sobrou saldo pro próximo pagamento. */
  sobrando: LinhaResumo[];
  totalDescontar: number;
  totalJaDescontado: number;
  totalSobrando: number;
}

/** Soma em centavos, sem resto de float. */
const soma = (linhas: readonly LinhaResumo[]): number =>
  round2(linhas.reduce((s, l) => s + l.valor, 0));

/**
 * Monta a prévia do desconto pro escopo inteiro.
 *
 * Quem não tem vale nem perda **não aparece em lugar nenhum** — foi o erro do aviso antigo,
 * que listava 55 pessoas das quais 38 não deviam nada e assustava à toa.
 */
export function resumoDesconto(
  modo: ModoDesconto,
  pessoas: readonly PessoaDesconto[],
): ResumoDesconto {
  const vaoDescontar: LinhaResumo[] = [];
  const jaDescontados: LinhaResumo[] = [];
  const sobrando: LinhaResumo[] = [];

  for (const p of pessoas) {
    if (!Number.isFinite(p.total) || p.total <= 0) continue; // nada a descontar
    const linha = (valor: number): LinhaResumo => ({ driverId: p.driverId, name: p.name, valor });
    const falta = saldoDevedor(p);
    const abate = abaterAgora(modo, p, p.brutoNoEscopo);

    if (abate > 0) vaoDescontar.push(linha(abate));
    // Já quitado antes deste pagamento: é o caso que evitava o desconto duplo.
    if (modo === 'pendentes' && falta <= 0) jaDescontados.push(linha(p.total));
    // Coube só um pedaço: o resto fica pro próximo pagamento (decisão "guardar o que sobrou").
    if (modo === 'pendentes' && falta > 0 && abate < falta) sobrando.push(linha(round2(falta - abate)));
  }

  const ordena = (a: LinhaResumo, b: LinhaResumo): number => b.valor - a.valor;
  vaoDescontar.sort(ordena);
  jaDescontados.sort(ordena);
  sobrando.sort(ordena);

  return {
    vaoDescontar,
    jaDescontados,
    sobrando,
    totalDescontar: soma(vaoDescontar),
    totalJaDescontado: soma(jaDescontados),
    totalSobrando: soma(sobrando),
  };
}
