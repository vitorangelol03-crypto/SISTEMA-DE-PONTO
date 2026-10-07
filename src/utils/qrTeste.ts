/**
 * Partes PURAS da página de teste do QR no tablet (entrega B do plano do tablet sem toque,
 * 06/10/2026) — sem DOM, testadas no vitest.
 *
 * O teste responde o que decide o desenho do QR do supervisor (plano §4, risco nº 1): a câmera
 * FRONTAL do tablet, a 640×480, consegue ler um QR mostrado na tela de um celular? Em quanto
 * tempo? E isso convive com o reconhecimento de rosto, que roda no mesmo processador?
 */

/** 32 símbolos sem os que se confundem (I/1, O/0) — o mesmo alfabeto do código de ativação. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Código curto do QR de teste: "PT-" + 6 símbolos. Curto de propósito — QR com pouco texto
 * tem poucos quadradinhos (versão 1), que é o que a câmera frontal mais consegue ler.
 * `aleatorio` é injetável pro teste; em produção vem de crypto.getRandomValues.
 */
export function gerarCodigoDeTeste(aleatorio: (n: number) => Uint8Array = bytesAleatorios): string {
  const bytes = aleatorio(6);
  let codigo = 'PT-';
  for (let i = 0; i < 6; i++) codigo += ALFABETO[bytes[i] % ALFABETO.length];
  return codigo;
}

function bytesAleatorios(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** O texto lido é um código desta página? (o leitor ignora qualquer outro QR). */
export function ehCodigoDeTeste(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && /^PT-[A-HJ-NP-Z2-9]{6}$/.test(texto);
}

/** Medições acumuladas de um laço (leitura do QR ou detecção do rosto). */
export interface Medicoes {
  tentativas: number;
  acertos: number;
  somaMs: number;
  maxMs: number;
}

export const MEDICOES_ZERADAS: Medicoes = { tentativas: 0, acertos: 0, somaMs: 0, maxMs: 0 };

/** Soma uma volta do laço (quanto levou e se achou alguma coisa). Não muda o objeto recebido. */
export function somarMedicao(m: Medicoes, ms: number, achou: boolean): Medicoes {
  const tempo = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return {
    tentativas: m.tentativas + 1,
    acertos: m.acertos + (achou ? 1 : 0),
    somaMs: m.somaMs + tempo,
    maxMs: Math.max(m.maxMs, tempo),
  };
}

/** Média em ms, arredondada (0 sem tentativas). */
export function mediaMs(m: Medicoes): number {
  return m.tentativas > 0 ? Math.round(m.somaMs / m.tentativas) : 0;
}
