import type { FaceScanVisual } from './FaceScanFrame';

/**
 * O que a moldura do rosto está mostrando (05/10/2026, visual "Malha neon") — sai do mesmo `visual`
 * + contagem que as 3 telas de câmera já mandam pro FaceScanFrame. Fica num arquivo à parte porque
 * o arquivo do componente só pode exportar componente (Fast Refresh do Vite).
 */
export type FaseDaMoldura = 'procurando' | 'analisando' | 'contagem' | 'confirmado' | 'falhou' | 'parado';

export function faseDaMoldura(visual: FaceScanVisual, countdown = 0): FaseDaMoldura {
  if (visual.shake || visual.flash === 'fail' || visual.color === 'red') return 'falhou';
  if (countdown > 0) return 'contagem';
  if (visual.flash === 'success') return 'confirmado';
  if (visual.showScanLine) return 'procurando';
  if (visual.pulse) return 'analisando';
  return 'parado';
}
