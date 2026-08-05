/**
 * O que o botão de nota do card do espelho deve dizer (05/08/2026).
 *
 * Pedido do Victor: *"apos enviado o botão muda para driver, nota enviada"*. Antes
 * ele dizia "Anexar nota" pra sempre — e o driver, sem sinal nenhum de que a nota
 * chegou, mandava de novo. Foi assim que a tela encheu de nota repetida.
 *
 * ⚠️ Um espelho pode pedir MAIS DE UMA nota (2 CNPJs). Dizer "Nota enviada" com uma
 * só das duas no lugar seria pior que não dizer nada: o driver pararia achando que
 * acabou. Por isso o estado parcial existe e fala quantas faltam.
 */
export type TomBotaoNota = 'padrao' | 'ok' | 'recusada';

export interface EstadoBotaoNota {
  texto: string;
  tom: TomBotaoNota;
}

export interface EspelhoComNota {
  /** Quantas notas este espelho pede. `undefined` = edge fn antiga (não sabemos). */
  nfVagas?: number;
  /** Quantas já chegaram (recebida/validada). */
  nfEnviadas?: number;
  /** Vagas com nota recusada e nenhuma boa no lugar. */
  nfRecusadas?: number;
}

export function estadoBotaoNota(m: EspelhoComNota): EstadoBotaoNota {
  const vagas = m.nfVagas;
  // Edge fn antiga em cache não manda os contadores. Melhor o texto de sempre do que
  // afirmar "nota enviada" sem base — o driver confia no que está escrito aqui.
  if (typeof vagas !== 'number') return { texto: 'Anexar nota', tom: 'padrao' };

  const enviadas = m.nfEnviadas ?? 0;
  const recusadas = m.nfRecusadas ?? 0;

  // Recusada ganha de tudo: é o único estado em que o driver precisa AGIR (e, desde a
  // regra de uma nota por vaga, precisa da CD excluir antes de mandar outra).
  if (recusadas > 0) return { texto: 'Nota recusada', tom: 'recusada' };
  if (vagas === 0) return { texto: 'Anexar nota', tom: 'padrao' };
  if (enviadas >= vagas) return { texto: 'Nota enviada', tom: 'ok' };
  if (enviadas > 0) {
    const faltam = vagas - enviadas;
    return { texto: faltam === 1 ? 'Falta 1 nota' : `Faltam ${faltam} notas`, tom: 'padrao' };
  }
  return { texto: 'Anexar nota', tom: 'padrao' };
}
