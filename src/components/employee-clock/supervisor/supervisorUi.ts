/**
 * Partes PURAS da tela do supervisor no celular (07/10/2026, plano do tablet sem toque, entrega E).
 */
import type { PontoDoDia, QualidadeDoRosto } from '../../../services/supervisorTablet';

/** Segundos que faltam até `ateIso` (nunca negativo; data inválida = 0). */
export function segundosRestantes(ateIso: string | null | undefined, agora: number): number {
  if (!ateIso) return 0;
  const ate = new Date(ateIso).getTime();
  if (!Number.isFinite(ate)) return 0;
  return Math.max(0, Math.ceil((ate - agora) / 1000));
}

/** "1:59", "0:07", "19:30". */
export function formatarContagem(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/**
 * A ÚLTIMA marcação que entrou hoje ("Entrada 07:02") — o celular mostra quando a pessoa bate no
 * tablet depois do rosto confirmado. 2 ou 4 marcações; null se ainda não entrou nada.
 */
export function ultimaMarcacao(ponto: PontoDoDia | null | undefined): { rotulo: string; hora: string } | null {
  if (!ponto) return null;
  const ordem: Array<[keyof PontoDoDia, string]> = [
    ['exit_2_time', 'Saída final'],
    ['exit_time_full', 'Saída'],
    ['entry_2_time', 'Volta do almoço'],
    ['exit_1_time', 'Saída do almoço'],
    ['entry_1_time', 'Entrada'],
    ['entry_time', 'Entrada'],
  ];
  for (const [campo, rotulo] of ordem) {
    const v = ponto[campo];
    if (v) return { rotulo, hora: horaCurta(v) };
  }
  return null;
}

/** O aviso sobre a foto tirada (o supervisor decide se confirma). null = nada a avisar. */
export function avisoDaFoto(q: QualidadeDoRosto | null | undefined): string | null {
  if (!q) return null;
  if (q.resultado === 'aviso' && q.parecidoCom) {
    return `Atenção: este rosto ficou parecido com o de ${q.parecidoCom.nome}. Confira se é a pessoa certa.`;
  }
  // Refazer: muito diferente do rosto antigo — pode ser outra pessoa na frente do tablet.
  if (typeof q.distanciaDoRostoAntigo === 'number' && q.distanciaDoRostoAntigo >= 0.6) {
    return 'Atenção: este rosto ficou bem diferente do cadastrado antes. Confira se é a mesma pessoa.';
  }
  return null;
}

/** Por que o tablet recusou o rosto (status 'recusado'). */
export function motivoDaRecusa(q: QualidadeDoRosto | null | undefined): string {
  if (q?.parecidoCom) return `O rosto é parecido demais com o de ${q.parecidoCom.nome}. Confira quem está na frente do tablet e gere outro código.`;
  return 'A foto foi recusada. Gere outro código e tente de novo.';
}
