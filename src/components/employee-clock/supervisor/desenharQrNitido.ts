import QRCode from 'qrcode';

/**
 * Desenha o QR com `lado` pontos de página, na nitidez REAL da tela (celular tem 2–3 pontos de tela
 * por ponto de página): sem isso o QR saía esticado, com as bordas dos quadradinhos borradas
 * (07/10/2026, 1º teste no tablet real).
 */
export function desenharQrNitido(
  canvas: HTMLCanvasElement,
  texto: string,
  lado: number,
  opcoes: { margem: number; correcao: 'L' | 'M' },
): Promise<void> {
  const nitidez = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
  return QRCode.toCanvas(canvas, texto, { errorCorrectionLevel: opcoes.correcao, margin: opcoes.margem, width: lado * nitidez })
    .then(() => {
      canvas.style.width = `${lado}px`;
      canvas.style.height = `${lado}px`;
    });
}
