/**
 * A TELA de câmera (facial sem CPF, o fluxo do tablet) com cada recusa do navegador — 30/09/2026.
 *
 * Queixa real: "às vezes fala que a câmera está bloqueada, mas não está". O que estes testes
 * travam, com a tela de verdade (só a câmera e o servidor são falsos):
 *   - pedido de permissão fechado (o caso da queixa) → "Falta liberar a câmera" + botão que
 *     pede de novo; NUNCA "Câmera bloqueada";
 *   - o toque em "Ativar câmera" pede a câmera de novo e, liberada, a tela volta a escanear;
 *   - bloqueio de verdade → "Câmera bloqueada" com a dica do "Perguntar";
 *   - aparelho desligado / câmera ocupada → cada um com o seu texto;
 *   - todo erro vai pro servidor (logClockEvent) com a causa — antes não ia nada;
 *   - a saída pro CPF está sempre lá.
 * E um defeito antigo achado no caminho: o <video> não existia enquanto a tela mostrava
 * "Carregando câmera", a imagem não tinha onde entrar e a câmera era aberta DUAS vezes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const identifyFace = vi.fn();
const logClockEvent = vi.fn();
const detectFace = vi.fn();

vi.mock('../../src/services/database', () => ({
  identifyFace: (...a: unknown[]) => identifyFace(...a),
  getEmployeeByCpf: vi.fn(),
  getEmployeeTodayAttendance: vi.fn(),
  logClockEvent: (...a: unknown[]) => logClockEvent(...a),
}));

vi.mock('../../src/hooks/useFaceApi', () => ({
  useFaceApi: () => ({
    loading: false,
    ready: true,
    error: null,
    detectFace: (...a: unknown[]) => detectFace(...a),
    compareFaces: () => 0,
  }),
}));

import { FaceIdentifyClock } from '../../src/components/employee-clock/FaceIdentifyClock';

const EMPRESA = { id: 'emp-1', display_name: 'Caratinga', default_marking_count: 2 } as never;

function streamFalso() {
  const track = { stop: vi.fn(), readyState: 'live', addEventListener: vi.fn(), removeEventListener: vi.fn() };
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}

let getUserMedia: ReturnType<typeof vi.fn>;
let estadoDaPermissao: 'granted' | 'denied' | 'prompt';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia = vi.fn();
  estadoDaPermissao = 'prompt';
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: estadoDaPermissao })) },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 1 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  detectFace.mockResolvedValue(null); // ninguém na frente da câmera
});

afterEach(() => cleanup());

const renderizar = () =>
  render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} />);

describe('câmera que não abre — a causa certa na tela', () => {
  it('🎯 pedido de permissão FECHADO: "Falta liberar", nunca "bloqueada" — e o toque resolve', async () => {
    getUserMedia
      .mockRejectedValueOnce(new DOMException('Permission dismissed', 'NotAllowedError'))
      .mockResolvedValueOnce(streamFalso());

    renderizar();

    await waitFor(() => expect(screen.getByText('📷 Falta liberar a câmera')).toBeTruthy());
    expect(screen.queryByText(/Câmera bloqueada/i)).toBeNull();
    expect(screen.getByRole('button', { name: /CPF e senha/i })).toBeTruthy();

    // O erro chegou ao servidor, com a causa (antes: nada).
    await waitFor(() => expect(logClockEvent).toHaveBeenCalledTimes(1));
    const registro = logClockEvent.mock.calls[0][0] as { companyId: string; kind: string; details: Record<string, unknown> };
    expect(registro.companyId).toBe('emp-1');
    expect(registro.kind).toBe('camera_error');
    expect(registro.details).toMatchObject({
      component: 'FaceIdentifyClock', name: 'NotAllowedError', permissao: 'prompt', problema: 'permissao-pendente',
    });

    // O toque pede a câmera de novo; liberada, a tela volta a escanear.
    fireEvent.click(screen.getByRole('button', { name: 'Ativar câmera' }));
    await waitFor(() => expect(screen.getByText(/Aproxime o rosto/i)).toBeTruthy());
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('bloqueio DE VERDADE (estado denied): "Câmera bloqueada" com a dica do "Perguntar"', async () => {
    estadoDaPermissao = 'denied';
    getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    renderizar();

    await waitFor(() => expect(screen.getByText('📷 Câmera bloqueada')).toBeTruthy());
    expect(screen.getByText(/mude mesmo assim para/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Já liberei/i })).toBeTruthy();
  });

  it('o toque não resolveu (recusou de novo): passa a ensinar a liberar nas configurações', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    renderizar();
    await waitFor(() => expect(screen.getByText('📷 Falta liberar a câmera')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Ativar câmera' }));
    await waitFor(() => expect(screen.getByText('📷 Câmera bloqueada')).toBeTruthy());
  });

  it('aparelho não deixa o navegador usar a câmera: instrução do aparelho', async () => {
    estadoDaPermissao = 'granted';
    getUserMedia.mockRejectedValue(new DOMException('Permission denied by system', 'NotAllowedError'));

    renderizar();

    await waitFor(() => expect(screen.getByText('📷 Câmera desligada no aparelho')).toBeTruthy());
    expect(screen.queryByText(/Câmera bloqueada/i)).toBeNull();
  });

  it('câmera ocupada por outro aplicativo: "Câmera ocupada"', async () => {
    estadoDaPermissao = 'granted';
    getUserMedia.mockRejectedValue(new DOMException('Could not start video source', 'NotReadableError'));

    renderizar();

    await waitFor(() => expect(screen.getByText('📷 Câmera ocupada')).toBeTruthy());
  });
});

describe('o <video> existe desde o início (defeito antigo)', () => {
  it('abre a câmera UMA vez e a imagem entra no vídeo na primeira abertura', async () => {
    const stream = streamFalso();
    getUserMedia.mockResolvedValue(stream);

    const { container } = renderizar();

    await waitFor(() => expect(screen.getByText(/Aproxime o rosto/i)).toBeTruthy());
    const video = container.querySelector('video') as HTMLVideoElement & { srcObject: unknown };
    expect(video).toBeTruthy();
    expect(video.srcObject).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
