/**
 * QR do MODO SUPERVISOR do tablet (07/10/2026, plano do tablet sem toque, entrega D) — a parte PURA.
 *
 * O celular do supervisor mostra um QR; a câmera do tablet lê. Dois tipos:
 *   - 'parear' (QR1): o celular se apresenta ao tablet — a sessão fica PAREADA com aquele tablet
 *     (prova de que o supervisor está na frente de um tablet ativo da empresa);
 *   - 'rosto'  (QR2): leva o tablet a tirar o rosto de UM funcionário.
 *
 * O texto é curto de propósito: "PT1:P:" ou "PT1:R:" + 26 símbolos base32 (128 bits) — cabe num QR
 * pequeno (versão 2, modo alfanumérico), o que a câmera frontal a 640×480 lê melhor. Nada de nome,
 * CPF ou empresa dentro: o banco guarda só o sha256 do código (tablet_qr_tokens.token_hash).
 */

export type TipoDoQr = 'parear' | 'rosto';

/** Prazo pra o tablet LER o QR. */
export const QR_VALIDO_MS = 2 * 60_000;
/** Depois de lido o QR de rosto, o tablet tem este tempo pra tirar o rosto. */
export const CAPTURA_PRAZO_MS = 60_000;
/** Depois do rosto tirado, o supervisor tem este tempo pra confirmar no celular. */
export const CONFIRMA_PRAZO_MS = 2 * 60_000;
/** A sessão do supervisor no celular. */
export const SESSAO_MS = 20 * 60_000;
/** "Tira de novo" (o supervisor recusou a foto) até este número de vezes no mesmo QR. */
export const MAX_TENTATIVAS_DE_ROSTO = 3;

/** Base32 (RFC 4648): maiúsculas e 2–7 — tudo dentro do modo alfanumérico do QR. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TAMANHO_DO_CODIGO = 26; // 128 bits ÷ 5 = 25,6 → 26 símbolos

function bytesAleatorios(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** Código novo: 128 bits aleatórios em base32 (26 símbolos). `aleatorio` injetável pro teste. */
export function gerarCodigoDoQr(aleatorio: (n: number) => Uint8Array = bytesAleatorios): string {
  const bytes = aleatorio(16);
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
    valor &= (1 << bits) - 1; // só os bits que ainda não viraram símbolo (sem estourar 32 bits)
  }
  if (bits > 0) saida += BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

/** O texto que vai DENTRO do QR. */
export function textoDoQr(tipo: TipoDoQr, codigo: string): string {
  return `PT1:${tipo === 'parear' ? 'P' : 'R'}:${codigo}`;
}

/** Lê o texto de um QR; null se não for um QR deste sistema (o tablet ignora qualquer outro QR). */
export function lerTextoDoQr(texto: unknown): { tipo: TipoDoQr; codigo: string } | null {
  if (typeof texto !== 'string') return null;
  const m = /^PT1:([PR]):([A-Z2-7]{26})$/.exec(texto.trim());
  if (!m) return null;
  return { tipo: m[1] === 'P' ? 'parear' : 'rosto', codigo: m[2] };
}

/** Ainda dentro do prazo? (`inicioIso` nulo = não começou → fora). */
export function dentroDoPrazo(inicioIso: string | null | undefined, prazoMs: number, agora: number): boolean {
  if (!inicioIso) return false;
  const inicio = new Date(inicioIso).getTime();
  return Number.isFinite(inicio) && agora - inicio <= prazoMs;
}

/** A sessão do supervisor ainda vale (não encerrada e dentro do prazo)? */
export function sessaoValida(s: { status: string; expires_at: string } | null | undefined, agora: number): boolean {
  if (!s || s.status === 'encerrada') return false;
  const fim = new Date(s.expires_at).getTime();
  return Number.isFinite(fim) && agora < fim;
}
