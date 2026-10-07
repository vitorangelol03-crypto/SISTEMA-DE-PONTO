/**
 * O ROSTO tirado pelo tablet no modo supervisor (07/10/2026, plano do tablet sem toque, entrega D)
 * — a parte PURA, testada no vitest.
 *
 * O tablet manda de 3 a 5 amostras (cada uma os 128 números do face-api) tiradas em sequência com a
 * pessoa parada na frente. Antes de o supervisor ver a foto e confirmar, o servidor confere:
 *   1. as amostras são da MESMA pessoa parada (perto umas das outras) — senão "fique parado";
 *   2. o rosto (a média) NÃO é de outra pessoa já cadastrada nas empresas do tablet — senão a
 *      facial sem CPF confundiria as duas (ou alguém estaria pondo o próprio rosto na ficha de outro);
 *   3. perto demais de alguém (entre o limite e o limite + folga): passa, com AVISO pro supervisor
 *      (o reconhecimento sem CPF pode dar "ambíguo" com essa pessoa).
 */
import { LIMITE_FACIAL } from './faceIdentify.ts';

export const MIN_AMOSTRAS = 3;
export const MAX_AMOSTRAS = 5;
/** Maior distância aceita ENTRE as amostras (mesma pessoa parada). A calibrar com o tablet real. */
export const AMOSTRAS_CONSISTENTES_ATE = 0.35;
/** Entre LIMITE_FACIAL e este valor, o rosto passa com aviso de "parecido com outra pessoa". */
export const AVISO_PARECIDO_ATE = 0.58;

/** As amostras, se forem de 3 a 5 rostos de 128 números finitos; null se não. */
export function lerAmostras(bruto: unknown): number[][] | null {
  if (!Array.isArray(bruto) || bruto.length < MIN_AMOSTRAS || bruto.length > MAX_AMOSTRAS) return null;
  const amostras: number[][] = [];
  for (const a of bruto) {
    if (!Array.isArray(a) || a.length !== 128) return null;
    const nums = a.map(Number);
    if (!nums.every((n) => Number.isFinite(n))) return null;
    amostras.push(nums);
  }
  return amostras;
}

export function distanciaEntre(a: readonly number[], b: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    soma += d * d;
  }
  return Math.sqrt(soma);
}

/** A maior distância entre duas amostras quaisquer (0 com uma só). */
export function maiorDistanciaEntreAmostras(amostras: readonly (readonly number[])[]): number {
  let maior = 0;
  for (let i = 0; i < amostras.length; i++) {
    for (let j = i + 1; j < amostras.length; j++) maior = Math.max(maior, distanciaEntre(amostras[i], amostras[j]));
  }
  return maior;
}

/** A média, número a número (o rosto que vai pra ficha). */
export function mediaDasAmostras(amostras: readonly (readonly number[])[]): number[] {
  const media = new Array<number>(128).fill(0);
  for (const a of amostras) for (let i = 0; i < 128; i++) media[i] += a[i] / amostras.length;
  return media;
}

export interface RostoCadastrado {
  id: string;
  nome: string;
  cpf: string | null;
  descriptor: number[];
}

export interface MaisParecido {
  id: string;
  nome: string;
  distancia: number;
}

export type DecisaoDoRosto =
  | { resultado: 'ok'; maisParecido: MaisParecido | null }
  | { resultado: 'aviso'; maisParecido: MaisParecido }
  | { resultado: 'recusa'; maisParecido: MaisParecido };

/**
 * O rosto novo é de outra pessoa já cadastrada? Compara com todos os rostos das empresas do tablet,
 * menos a própria ficha e quem tem o MESMO CPF (a mesma pessoa com ficha na outra empresa).
 */
export function decidirRostoNovo(
  media: readonly number[],
  cadastrados: readonly RostoCadastrado[],
  proprio: { id: string; cpf: string | null },
): DecisaoDoRosto {
  const cpfProprio = (proprio.cpf ?? '').replace(/\D/g, '');
  let maisParecido: MaisParecido | null = null;
  for (const c of cadastrados) {
    if (c.id === proprio.id) continue;
    if (cpfProprio && (c.cpf ?? '').replace(/\D/g, '') === cpfProprio) continue;
    const distancia = distanciaEntre(media, c.descriptor);
    if (!maisParecido || distancia < maisParecido.distancia) maisParecido = { id: c.id, nome: c.nome, distancia };
  }
  if (maisParecido && maisParecido.distancia < LIMITE_FACIAL) return { resultado: 'recusa', maisParecido };
  if (maisParecido && maisParecido.distancia < AVISO_PARECIDO_ATE) return { resultado: 'aviso', maisParecido };
  return { resultado: 'ok', maisParecido };
}
