/**
 * Câmera da tela de ponto — abrir e ENTENDER o erro (30/09/2026).
 *
 * 🔴 A QUEIXA: "às vezes fala que a câmera está bloqueada, mas não está".
 * Até aqui as três telas de câmera (sem CPF, com CPF e cadastro do rosto) tratavam QUALQUER
 * recusa do navegador (`NotAllowedError`) como "você bloqueou a câmera" e mandavam a pessoa
 * procurar um bloqueio nas configurações do site. Só que o navegador dá essa mesma recusa em
 * situações em que o site NÃO está bloqueado:
 *   - o pedido de permissão foi fechado/ignorado ("Permission dismissed") — no Chrome, depois de
 *     ignorar 3 vezes, ele passa a recusar SOZINHO por dias, e as configurações do site continuam
 *     mostrando "Perguntar" (é exatamente "diz que está bloqueada mas não está");
 *   - a câmera está desligada para o NAVEGADOR nas configurações do aparelho
 *     ("Permission denied by system") — no site aparece "Permitir";
 *   - outros casos do navegador em que a permissão está "granted"/"prompt".
 * E nenhum erro de câmera chegava ao servidor, então não havia como saber qual era.
 *
 * Agora o erro é classificado pelo NOME, pela MENSAGEM e pelo estado real da permissão, e cada
 * caso tem a sua instrução (ver CameraProblem.tsx). O erro também é registrado no servidor.
 */

export type EstadoDaPermissao = 'granted' | 'denied' | 'prompt' | 'unknown';

export type ProblemaDeCamera =
  /** Permissão do SITE negada (estado 'denied' — inclui o bloqueio automático do Chrome). */
  | 'bloqueada-no-navegador'
  /** O aparelho não deixa o navegador usar a câmera (configuração do sistema). */
  | 'bloqueada-no-aparelho'
  /** O navegador recusou sem o site estar bloqueado — basta pedir de novo com um toque. */
  | 'permissao-pendente'
  /** Outro aplicativo está usando a câmera, ou ela travou. */
  | 'em-uso'
  /** Nenhuma câmera encontrada. */
  | 'sem-camera'
  /** Página sem HTTPS (ou navegador sem suporte a câmera). */
  | 'sem-https'
  | 'desconhecido';

export interface ErroDeCameraDescrito {
  name: string;
  message: string;
}

export function descreverErro(err: unknown): ErroDeCameraDescrito {
  if (err && typeof err === 'object') {
    const e = err as { name?: unknown; message?: unknown };
    return {
      name: typeof e.name === 'string' ? e.name : 'Error',
      message: typeof e.message === 'string' ? e.message : String(err),
    };
  }
  return { name: 'Error', message: String(err) };
}

/** Estado REAL da permissão de câmera ('unknown' quando o navegador não sabe dizer — ex.: Safari). */
export async function lerPermissaoDaCamera(): Promise<EstadoDaPermissao> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state === 'granted' || status.state === 'denied' || status.state === 'prompt' ? status.state : 'unknown';
  } catch (err) {
    // Safari/iOS não conhece 'camera' em permissions.query: é "não sei", não é erro da tela.
    console.info('permissions.query(camera) indisponível neste navegador:', descreverErro(err).message);
    return 'unknown';
  }
}

/**
 * Classifica a recusa do navegador.
 * @param jaPediuComToque a tela já pediu de novo a partir de um toque da pessoa e a recusa se
 *   repetiu — aí não adianta pedir mais, o bloqueio é de configuração.
 */
export function classificarErroDeCamera(
  err: unknown,
  permissao: EstadoDaPermissao,
  jaPediuComToque = false,
): ProblemaDeCamera {
  const { name, message } = descreverErro(err);

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (/system/i.test(message)) return 'bloqueada-no-aparelho';
    if (permissao === 'denied') return 'bloqueada-no-navegador';
    return jaPediuComToque ? 'bloqueada-no-navegador' : 'permissao-pendente';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'em-uso';
  if (
    name === 'NotFoundError' || name === 'DevicesNotFoundError'
    || name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError'
  ) {
    return 'sem-camera';
  }
  if (name === 'SecurityError' || /HTTPS/.test(message)) return 'sem-https';
  return 'desconhecido';
}

/** Erro lançado quando o navegador não tem câmera nenhuma (sem HTTPS ou sem suporte). */
export class CameraIndisponivelError extends Error {
  constructor() {
    super('A câmera não está disponível neste navegador. Acesse via HTTPS ou localhost.');
    this.name = 'SecurityError';
  }
}

/**
 * Abre a câmera frontal. Se o aparelho não tiver uma câmera que satisfaça o pedido ideal
 * (frontal 640×480), tenta de novo com "qualquer câmera" antes de desistir.
 */
export async function abrirCameraFrontal(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraIndisponivelError();
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    const { name } = descreverErro(err);
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError' || name === 'NotFoundError') {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw err;
  }
}

/** A câmera ainda está viva? (tela apagada / app em segundo plano costumam ENCERRAR a trilha). */
export function streamVivo(stream: MediaStream | null): boolean {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
}
