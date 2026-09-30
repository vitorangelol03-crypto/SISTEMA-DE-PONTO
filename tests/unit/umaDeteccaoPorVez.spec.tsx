/**
 * UMA DETECÇÃO DE ROSTO POR VEZ — nas 3 telas de câmera (30/09/2026).
 *
 * 🔴 O defeito: o intervalo de cada tela disparava uma detecção nova a cada 0,5–0,7s SEM
 * esperar a anterior. Em aparelho lento (ou na 1ª detecção, que prepara a placa de vídeo), as
 * detecções se empilhavam e disputavam o processador. Medido no Chromium com a máquina
 * carregada, com a MESMA biblioteca, modelos e câmera do sistema: sem guarda, 56 detecções ao
 * mesmo tempo e o 1º rosto achado aos 35s; com guarda, 1 por vez e rosto aos 13s. Foi isso
 * que travou o cadastro do rosto no teste de cliques reais ("Procurando rosto..." sem fim).
 *
 * Aqui a detecção falsa demora 1,2s — mais que o intervalo de qualquer tela — e o teste conta
 * quantas estão rodando ao mesmo tempo. Tem que ser no máximo 1.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

let emAndamento = 0;
let maximoAoMesmoTempo = 0;
let chamadas = 0;
const detectFace = vi.fn(async () => {
  chamadas += 1;
  emAndamento += 1;
  maximoAoMesmoTempo = Math.max(maximoAoMesmoTempo, emAndamento);
  await new Promise((r) => setTimeout(r, 1200));
  emAndamento -= 1;
  return null; // ninguém na frente da câmera: o laço continua tentando
});

// O MESMO objeto em toda chamada — como o hook de verdade, cujo `detectFace` é um useCallback
// estável. Um objeto novo por render reiniciaria a cada 0,5s os laços que dependem de
// `detectFace` (verificação e cadastro) e o teste mediria o dublê, não a tela.
vi.mock('../../src/hooks/useFaceApi', () => {
  const api = {
    loading: false,
    ready: true,
    error: null,
    detectFace: (...a: unknown[]) => detectFace(...(a as [])),
    compareFaces: () => 1,
  };
  return { useFaceApi: () => api };
});

vi.mock('../../src/services/database', () => ({
  identifyFace: vi.fn(),
  getEmployeeByCpf: vi.fn(),
  getEmployeeTodayAttendance: vi.fn(),
  getFaceDescriptor: vi.fn(async () => Array.from({ length: 128 }, () => 0.1)),
  logFaceAttempt: vi.fn(),
  saveFaceData: vi.fn(),
  logClockEvent: vi.fn(),
}));

vi.mock('../../src/contexts/useCompany', () => ({
  useCompany: () => ({ company: { id: 'emp-1' } }),
}));

vi.mock('../../src/lib/supabase', () => ({ supabase: {} }));

import { FaceIdentifyClock } from '../../src/components/employee-clock/FaceIdentifyClock';
import { FaceVerification } from '../../src/components/employee-clock/FaceVerification';
import { FaceRegistration } from '../../src/components/employee-clock/FaceRegistration';

const EMPRESA = { id: 'emp-1', display_name: 'Caratinga', default_marking_count: 2 } as never;
const FUNCIONARIO = { id: 'f-1', name: 'MARIA DOS SANTOS', cpf: '12345678901', company_id: 'emp-1' } as never;

beforeEach(() => {
  emAndamento = 0;
  maximoAoMesmoTempo = 0;
  chamadas = 0;
  detectFace.mockClear();
  const track = { stop: vi.fn(), readyState: 'live', addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] }) },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(async () => {
  cleanup();
  // Detecção que ainda estava em andamento termina DEPOIS do fim do caso e desconta do
  // contador do caso seguinte (deu "0 ao mesmo tempo" na 1ª versão deste teste). Cada caso só
  // acaba quando a última detecção dele acabou.
  await waitFor(() => expect(emAndamento).toBe(0), { timeout: 10_000 });
});

async function esperarVariasVoltas() {
  // Várias voltas do intervalo cabem aqui; sem guarda, a 2ª detecção começa antes da 1ª acabar.
  await waitFor(() => expect(chamadas).toBeGreaterThanOrEqual(3), { timeout: 10_000 });
}

describe('uma detecção de rosto por vez', () => {
  it('facial sem CPF (tablet)', async () => {
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} />);
    await esperarVariasVoltas();
    expect(maximoAoMesmoTempo).toBe(1);
  }, 20_000);

  it('verificação com CPF', async () => {
    render(<FaceVerification employee={FUNCIONARIO} onSuccess={vi.fn()} onFail={vi.fn()} />);
    await esperarVariasVoltas();
    expect(maximoAoMesmoTempo).toBe(1);
  }, 20_000);

  it('cadastro do rosto', async () => {
    render(<FaceRegistration employee={FUNCIONARIO} onComplete={vi.fn()} />);
    await esperarVariasVoltas();
    expect(maximoAoMesmoTempo).toBe(1);
  }, 20_000);
});
