/**
 * O tablet lendo o QR do supervisor (07/10/2026, plano do tablet sem toque, entrega F).
 *
 * Usa o MESMO <video> do reconhecimento (abrir outra câmera faz o Android responder "câmera
 * ocupada"): a cada volta do laço, o quadro INTEIRO vai pro jsQR (JavaScript puro — o leitor nativo
 * BarcodeDetector não existe no Chromium). Quadro inteiro, e não um recorte do meio: o supervisor
 * não mira, e o QR fora do centro também tem que ser lido. O tempo por quadro no tablet REAL ainda
 * não foi medido — é o que a página /qr-teste mede (com o reconhecimento rodando junto); se pesar,
 * o próximo passo é ler um quadro reduzido.
 * Só QR do PRÓPRIO sistema conta ("PT1:P:" / "PT1:R:" + 26 símbolos); qualquer outro é ignorado.
 */
import jsQR from 'jsqr';

const FORMATO = /^PT1:[PR]:[A-Z2-7]{26}$/;

export function ehQrDoSistema(texto: string | null | undefined): texto is string {
  return typeof texto === 'string' && FORMATO.test(texto.trim());
}

/** Procura um QR do sistema no quadro atual do vídeo. null se não achou (ou o vídeo não tem imagem). */
export function lerQrDoQuadro(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const achado = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
  return achado && ehQrDoSistema(achado.data) ? achado.data.trim() : null;
}

/**
 * A foto PEQUENA pro supervisor conferir no celular: o quadrado do meio da imagem (onde a pessoa
 * está, de frente pro tablet), espelhado como a pessoa se vê, em JPEG de `lado`×`lado`. Fica bem
 * abaixo do limite do servidor (60 mil caracteres) e nunca vai pro armazenamento público.
 */
export function fotoPequenaDoQuadro(video: HTMLVideoElement, canvas: HTMLCanvasElement, lado = 200): string | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const tamanho = Math.min(video.videoWidth, video.videoHeight);
  const x = (video.videoWidth - tamanho) / 2;
  const y = (video.videoHeight - tamanho) / 2;
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.save();
  ctx.translate(lado, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, x, y, tamanho, tamanho, 0, 0, lado, lado);
  ctx.restore();
  return canvas.toDataURL('image/jpeg', 0.75);
}
