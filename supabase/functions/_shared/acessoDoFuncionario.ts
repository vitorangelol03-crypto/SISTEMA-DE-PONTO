/**
 * Quem pode ler os dados de UM funcionário pelas telas públicas (30/09/2026, roadmap item 5).
 *
 * As telas do funcionário (/clock e /erros) não têm login de painel: até aqui, erros, ponto do
 * dia e histórico saíam só com o id — e `lookup-employee` entrega o id de qualquer um a partir
 * do CPF. Ou seja, com o CPF de alguém dava pra ver os erros e o ponto (com localização) dele.
 *
 * Agora a pessoa prova que é ela de um destes dois jeitos:
 *   - o PIN dela (o mesmo que já digitou pra entrar — nada de passo novo);
 *   - um COMPROVANTE FACIAL: o servidor reconheceu o rosto dela agora há pouco (`identify-face`)
 *     e devolveu um papel assinado que vale COMPROVANTE_VALIDADE_MS. É o caminho do tablet, onde
 *     ninguém digita CPF nem PIN — o rosto é a senha.
 *
 * O comprovante é `v1.<employeeId>.<companyId>.<vence_em_ms>.<assinatura>` com HMAC-SHA256. A
 * chave é derivada da service role (nunca sai do servidor); sem ela não se fabrica um comprovante.
 * Esta parte é PURA (a chave entra por parâmetro) — usada pela edge function e testada no vitest.
 */

/** 15 min: cobre a sessão do tablet (sai sozinha em 35s) e a do celular com folga. */
export const COMPROVANTE_VALIDADE_MS = 15 * 60 * 1000;

const ROTULO_DA_CHAVE = 'ponto-comprovante-facial-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paraBase64Url(buffer: ArrayBuffer): string {
  let binario = '';
  for (const b of new Uint8Array(buffer)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(chave: BufferSource, texto: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto));
}

/** Chave própria do comprovante, derivada do segredo do servidor (não reaproveita a service role crua). */
async function chaveDoComprovante(segredoDoServidor: string): Promise<ArrayBuffer> {
  if (!segredoDoServidor) throw new Error('segredo do servidor ausente');
  return hmac(new TextEncoder().encode(segredoDoServidor), ROTULO_DA_CHAVE);
}

/** Compara sem sair na 1ª diferença (não entrega, pelo tempo, quantos caracteres acertou). */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export async function emitirComprovanteFacial(
  segredoDoServidor: string, employeeId: string, companyId: string, agoraMs: number,
): Promise<string> {
  const corpo = `v1.${employeeId}.${companyId}.${agoraMs + COMPROVANTE_VALIDADE_MS}`;
  const assinatura = paraBase64Url(await hmac(await chaveDoComprovante(segredoDoServidor), corpo));
  return `${corpo}.${assinatura}`;
}

/** true só se o comprovante foi emitido por este servidor, PARA esta pessoa e empresa, e não venceu. */
export async function comprovanteFacialConfere(
  segredoDoServidor: string, comprovante: unknown, employeeId: string, companyId: string, agoraMs: number,
): Promise<boolean> {
  if (typeof comprovante !== 'string' || comprovante.length > 200) return false;
  const partes = comprovante.split('.');
  if (partes.length !== 5) return false;
  const [versao, empDoPapel, empresaDoPapel, venceEm, assinatura] = partes;
  if (versao !== 'v1' || !UUID.test(empDoPapel) || !UUID.test(empresaDoPapel)) return false;
  if (empDoPapel !== employeeId || empresaDoPapel !== companyId) return false;
  const vence = Number(venceEm);
  if (!Number.isSafeInteger(vence) || vence <= agoraMs) return false;
  const esperada = paraBase64Url(await hmac(await chaveDoComprovante(segredoDoServidor), partes.slice(0, 4).join('.')));
  return iguaisEmTempoConstante(assinatura, esperada);
}

/**
 * O que a pessoa mandou pra provar que é ela:
 *  - 'ok'       → PIN certo OU comprovante facial válido;
 *  - 'ausente'  → não mandou nem PIN nem comprovante (tela antiga, de antes de 30/09/2026);
 *  - 'invalido' → mandou e não confere.
 */
export type ProvaDoFuncionario = 'ok' | 'ausente' | 'invalido';

export async function decidirProva(params: {
  pin: unknown;
  comprovante: unknown;
  /** Confere o PIN no banco (bcrypt) — só é chamado se veio PIN. */
  pinConfere: (pin: string) => Promise<boolean>;
  comprovanteConfere: (comprovante: string) => Promise<boolean>;
}): Promise<ProvaDoFuncionario> {
  const temPin = typeof params.pin === 'string' && params.pin.length > 0;
  const temComprovante = typeof params.comprovante === 'string' && params.comprovante.length > 0;
  if (!temPin && !temComprovante) return 'ausente';
  if (temComprovante && await params.comprovanteConfere(params.comprovante as string)) return 'ok';
  if (temPin && await params.pinConfere(params.pin as string)) return 'ok';
  return 'invalido';
}
