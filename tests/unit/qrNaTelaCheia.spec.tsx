/**
 * O QR do supervisor ABRE EM TELA CHEIA, de ponta a ponta, na nitidez real da tela (07/10/2026, 1º
 * teste no tablet real: "aumente o tamanho do QR mesmo assim"). Roda com: npx vitest run qrNaTelaCheia
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const toCanvas = vi.fn();
vi.mock('qrcode', () => ({ default: { toCanvas: (...a: unknown[]) => toCanvas(...a) } }));

import { QrNaTela } from '../../src/components/employee-clock/supervisor/QrNaTela';

const TEXTO = 'PT1:P:ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const daqui = (ms: number) => new Date(Date.now() + ms).toISOString();
const definir = (nome: 'innerWidth' | 'innerHeight' | 'devicePixelRatio', valor: number) =>
  Object.defineProperty(window, nome, { configurable: true, value: valor });

beforeEach(() => {
  toCanvas.mockReset().mockResolvedValue(undefined);
  definir('innerWidth', 390); // celular comum
  definir('innerHeight', 844);
  definir('devicePixelRatio', 3); // tela densa: 3 pontos de tela por ponto de página
});
afterEach(() => cleanup());

describe('o QR do supervisor', () => {
  it('abre em tela cheia: a largura INTEIRA do celular, desenhado com 3× mais pontos (nítido)', async () => {
    render(<QrNaTela texto={TEXTO} expiraEm={daqui(120_000)} legenda="Mostre este código" />);
    const tela = screen.getByRole('dialog');
    expect(tela.getAttribute('data-qr')).toBe(TEXTO);
    expect(tela.getAttribute('data-testid')).toBe('qr-na-tela');
    const [canvas, texto, opcoes] = toCanvas.mock.calls[0] as [HTMLCanvasElement, string, Record<string, unknown>];
    expect([texto, opcoes]).toEqual([TEXTO, { errorCorrectionLevel: 'M', margin: 2, width: 390 * 3 }]);
    await waitFor(() => expect(canvas.style.width).toBe('390px')); // mostrado com 390 pontos de página
    expect(canvas.style.height).toBe('390px');
  });

  it('"Fechar" volta pro QR dentro do cartão; "Ampliar o QR" abre a tela cheia de novo', async () => {
    render(<QrNaTela texto={TEXTO} expiraEm={daqui(120_000)} legenda="Mostre este código" />);
    fireEvent.click(screen.getByRole('button', { name: /Fechar/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('qr-na-tela').getAttribute('data-qr')).toBe(TEXTO);
    await waitFor(() => expect(toCanvas).toHaveBeenCalledTimes(2));
    expect((toCanvas.mock.calls[1][2] as { width: number }).width).toBe((390 - 40) * 3);
    fireEvent.click(screen.getByRole('button', { name: /Ampliar o QR/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('celular deitado: a altura manda (o QR nunca passa da tela)', () => {
    definir('innerWidth', 844);
    definir('innerHeight', 390);
    render(<QrNaTela texto={TEXTO} expiraEm={daqui(120_000)} legenda="Mostre este código" />);
    expect((toCanvas.mock.calls[0][2] as { width: number }).width).toBe(Math.floor(390 * 0.72) * 3);
  });
});
