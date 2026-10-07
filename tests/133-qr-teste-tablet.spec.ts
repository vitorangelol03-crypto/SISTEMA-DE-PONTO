import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';

/**
 * E2E — página de teste do QR no tablet (`/qr-teste`, entrega B do plano do tablet sem toque,
 * 06/10/2026). A página não usa banco: nada aqui toca em produção.
 *
 *  1. Celular (`?mostrar=1`): desenha o QR e mostra o código "PT-XXXXXX".
 *  2. Tablet: a CÂMERA FALSA do Chrome toca um vídeo com um QR desenhado (gerado aqui mesmo,
 *     em Y4M) — a página tem que LER o código pelo mesmo caminho da câmera de verdade
 *     (getUserMedia → <video> → canvas → jsQR).
 *
 * O que este teste NÃO prova (e é o motivo da página existir): a câmera frontal REAL do tablet
 * lendo a tela de um celular — isso só o Victor, com o tablet na mão.
 */

const CODIGO = 'PT-QRTEST';

/** Vídeo Y4M 640×480 (o formato que o Chrome aceita como câmera falsa) com o QR no meio. */
function gerarVideoComQr(codigo: string): string {
  const W = 640;
  const H = 480;
  const qr = QRCode.create(codigo, { errorCorrectionLevel: 'L' });
  const n = qr.modules.size;
  const escala = 10;
  const borda = 4 * escala; // zona quieta do QR
  const lado = n * escala + 2 * borda;
  const x0 = Math.floor((W - lado) / 2);
  const y0 = Math.floor((H - lado) / 2);
  const Y = Buffer.alloc(W * H, 128); // fundo cinza
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const mx = Math.floor((x - borda) / escala);
      const my = Math.floor((y - borda) / escala);
      const dentro = mx >= 0 && my >= 0 && mx < n && my < n;
      const preto = dentro && qr.modules.get(my, mx) === 1;
      Y[(y0 + y) * W + (x0 + x)] = preto ? 16 : 235;
    }
  }
  const UV = Buffer.alloc((W / 2) * (H / 2), 128);
  const partes: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < 15; f++) partes.push(Buffer.from('FRAME\n'), Y, UV, UV);
  const arquivo = path.join(os.tmpdir(), `qr-teste-${process.pid}.y4m`);
  fs.writeFileSync(arquivo, Buffer.concat(partes));
  return arquivo;
}

const VIDEO = gerarVideoComQr(CODIGO);

// A câmera falsa do Chrome toca o vídeo com o QR (precisa ficar no topo: muda o navegador).
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${VIDEO}`,
    ],
  },
  permissions: ['camera'],
});

test.describe('Página de teste do QR no tablet (/qr-teste)', () => {
  test('celular: mostra o QR e o código curto', async ({ page }) => {
    await page.goto('/qr-teste?mostrar=1');
    await expect(page.getByText('Mostre este QR para a câmera do tablet')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('qr-teste-codigo')).toHaveText(/^PT-[A-HJ-NP-Z2-9]{6}$/);
    const canvas = page.getByTestId('qr-teste-canvas');
    await expect(canvas).toBeVisible();
    // O QR foi desenhado de fato (canvas com largura do tamanho "Médio").
    await expect.poll(async () => canvas.evaluate((c) => (c as HTMLCanvasElement).width)).toBeGreaterThan(100);
  });

  test('tablet: lê o código pela câmera falsa (getUserMedia → vídeo → jsQR)', async ({ page }) => {
    await page.goto('/qr-teste');
    await expect(page.getByText('Teste do QR no tablet')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('qr-teste-lidos')).toContainText(CODIGO, { timeout: 20_000 });
    const medicoes = page.getByTestId('qr-teste-medicoes');
    await expect(medicoes).toContainText('640×480');
    await expect(page.getByTestId('qr-teste-erro')).toHaveCount(0);
  });
});
