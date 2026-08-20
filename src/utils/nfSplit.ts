/**
 * Nota dividida em 2 nomes (19/08/2026, decisão do Victor): formas de
 * parcelamento e a conta das fatias — o lado do PAINEL/APP.
 *
 * ⚠️ A MESMA conta existe no robô (supabase/functions/driver-public-api/nfCheck.ts,
 * `nfSplitSlices`) e um teste roda as duas lado a lado: o valor que o app mostra
 * na escolha da forma tem que ser EXATAMENTE o que o robô vai cobrar da nota.
 */

/** Formas de parcelamento (decisão do Victor: só estas três; 'unica' = sem divisão). */
export type NfSplitForm = '50' | '70-30';

export const NF_SPLIT_FORMS: ReadonlyArray<{ form: NfSplitForm; label: string }> = [
  { form: '50', label: '2 notas: metade / metade' },
  { form: '70-30', label: '2 notas: 70% e 30%' },
];

/**
 * As DUAS fatias de um total para a forma escolhida. Regra do centavo: a fatia 1
 * arredonda pro centavo mais próximo e a fatia 2 leva o resto — a soma fecha
 * SEMPRE no total. Ex.: 10.356,81 → 50/50 = 5.178,41 + 5.178,40.
 */
export function nfSplitSlices(total: number, form: NfSplitForm): [number, number] {
  const cents = Math.round(total * 100);
  const first = form === '50' ? Math.round(cents / 2) : Math.round(cents * 0.7);
  return [first / 100, (cents - first) / 100];
}

/** Janela pra segunda nota chegar depois da primeira (decisão do Victor: 10 minutos). */
export const NF_SPLIT_WINDOW_MIN = 10;

/** A dupla ainda está no prazo? (primeira enviada em `firstUploadedAt`). */
export function nfSplitStillOpen(firstUploadedAt: string | Date, now: Date): boolean {
  const inicio = new Date(firstUploadedAt).getTime();
  return now.getTime() - inicio <= NF_SPLIT_WINDOW_MIN * 60_000;
}
