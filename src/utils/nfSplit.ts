/**
 * Nota dividida em 2 CNPJs (19/08/2026, decisão do Victor — redesenhada
 * 04/09/2026: virou "2 CNPJs diferentes"): formas de parcelamento e a conta
 * das fatias — o lado do PAINEL/APP.
 *
 * ⚠️ A MESMA conta existe no robô (supabase/functions/driver-public-api/nfCheck.ts,
 * `nfSplitSlices`) e um teste roda as duas lado a lado: o valor que o app mostra
 * na escolha da forma tem que ser EXATAMENTE o que o robô vai cobrar da nota.
 */

/**
 * Forma de divisão. 05/09/2026, decisão do Victor: sobrou SÓ meio a meio — o 70/30
 * deixou de existir (uma fatia igual pra cada CNPJ).
 */
export type NfSplitForm = '50';

export const NF_SPLIT_FORMS: ReadonlyArray<{ form: NfSplitForm; label: string }> = [
  { form: '50', label: '2 notas: metade / metade' },
];

/**
 * As DUAS fatias de um total para a forma escolhida. Regra do centavo: a fatia 1
 * arredonda pro centavo mais próximo e a fatia 2 leva o resto — a soma fecha
 * SEMPRE no total. Ex.: 10.356,81 → 50/50 = 5.178,41 + 5.178,40.
 */
export function nfSplitSlices(total: number, _form: NfSplitForm = '50'): [number, number] {
  const cents = Math.round(total * 100);
  const first = Math.round(cents / 2);
  return [first / 100, (cents - first) / 100];
}

/** Janela pra segunda nota chegar depois da primeira (05/09/2026: 10 → 30 minutos). */
export const NF_SPLIT_WINDOW_MIN = 30;

/** A dupla ainda está no prazo? (primeira enviada em `firstUploadedAt`). */
export function nfSplitStillOpen(firstUploadedAt: string | Date, now: Date): boolean {
  const inicio = new Date(firstUploadedAt).getTime();
  return now.getTime() - inicio <= NF_SPLIT_WINDOW_MIN * 60_000;
}
