/**
 * Facial sem CPF + tablet de ponto (30/09/2026).
 *
 *  - o segredo do tablet vai junto em toda identificação (é o que o servidor confere);
 *  - servidor dizendo "aparelho não autorizado" → a tela entrega pro pai mostrar o aviso, e
 *    não finge que foi "Não reconheci";
 *  - o nome do tablet aparece na barra de cima (quem instala confere de relance).
 * Servidor falso com 150ms de atraso — o mock instantâneo já escondeu bug nesta tela.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const identifyFace = vi.fn();
const detectFace = vi.fn();

vi.mock('../../src/services/database', () => ({
  identifyFace: (...a: unknown[]) => identifyFace(...a),
  getEmployeeByCpf: vi.fn(),
  getEmployeeTodayAttendance: vi.fn(),
  logClockEvent: vi.fn(),
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
const comAtraso = <T,>(valor: T, ms = 150) => new Promise<T>((resolve) => setTimeout(() => resolve(valor), ms));

beforeEach(() => {
  vi.clearAllMocks();
  const track = { stop: vi.fn(), readyState: 'live', addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] }) },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 1 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  detectFace.mockResolvedValue(new Float32Array(128).fill(0.1));
});

afterEach(() => cleanup());

describe('facial sem CPF no tablet', () => {
  it('manda o segredo do tablet em toda identificação', async () => {
    identifyFace.mockImplementation(() => comAtraso({ matched: false }));

    render(
      <FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} deviceToken="segredo-do-tablet" deviceName="Tablet portaria" />,
    );

    await waitFor(() => expect(identifyFace).toHaveBeenCalled(), { timeout: 8000 });
    expect(identifyFace.mock.calls[0][0]).toBe('emp-1');
    expect(identifyFace.mock.calls[0][2]).toBe('segredo-do-tablet');
    expect(screen.getByTestId('clock-device-badge').textContent).toContain('Tablet portaria');
  }, 20_000);

  it('aparelho não autorizado: entrega pro pai (aviso de tablet), sem "Não reconheci"', async () => {
    identifyFace.mockImplementation(() => comAtraso({ matched: false, deviceBlocked: true }));
    const onDeviceBlocked = vi.fn();

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} onDeviceBlocked={onDeviceBlocked} />);

    await waitFor(() => expect(onDeviceBlocked).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(screen.queryByText(/Não reconheci/i)).toBeNull();
  }, 20_000);

  it('sem tablet: identifica como sempre (sem segredo na chamada)', async () => {
    identifyFace.mockImplementation(() => comAtraso({ matched: false }));

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} />);

    await waitFor(() => expect(identifyFace).toHaveBeenCalled(), { timeout: 8000 });
    expect(identifyFace.mock.calls[0][2]).toBeNull();
    expect(screen.queryByTestId('clock-device-badge')).toBeNull();
  }, 20_000);
});
