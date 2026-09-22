/**
 * PONTO POR RECONHECIMENTO, SEM DIGITAR CPF — a tela não pode travar em "Identificando..."
 *
 * 🔴 O CASO REAL (22/09/2026, relato dos supervisores ao Victor): *"na hora que o sistema
 * estava validando, sem digitar o CPF — que é o caso do tablet — o sistema fica só
 * validando a facial deles, não entra. Eles têm que clicar lá para digitar o CPF."*
 *
 * A CAUSA era o ciclo de vida do React, não a facial: o loop de escaneamento dependia de
 * `phase`, e ao achar um rosto o código fazia `setPhase('identifying')` **antes** do
 * `await identifyFace(...)`. A troca de fase re-executava o efeito, o cleanup punha
 * `mounted = false`, e quando a resposta do servidor chegava ela caía num
 * `if (!mounted) return;` — a identificação era descartada e a tela ficava em
 * "Identificando..." **para sempre**, sem reconhecer e sem voltar a escanear.
 *
 * O que este teste trava:
 *   1. rosto detectado + servidor identificando → a tela chega a mostrar o NOME e registra
 *      (é o que não acontecia);
 *   2. enquanto o servidor não responde, a saída manual ("digitar CPF e senha") continua
 *      na tela — ninguém pode ficar preso sem alternativa.
 *
 * Roda com: npx vitest run facialSemCpfNaoTrava
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const identifyFace = vi.fn();
const getEmployeeByCpf = vi.fn();
const getEmployeeTodayAttendance = vi.fn();
const detectFace = vi.fn();

vi.mock('../../src/services/database', () => ({
  identifyFace: (...a: unknown[]) => identifyFace(...a),
  getEmployeeByCpf: (...a: unknown[]) => getEmployeeByCpf(...a),
  getEmployeeTodayAttendance: (...a: unknown[]) => getEmployeeTodayAttendance(...a),
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

const EMPRESA = { id: 'emp-1', name: 'Caratinga', default_marking_count: 2 } as never;
const FUNCIONARIO = {
  id: 'f-1', name: 'MARIA APARECIDA DOS SANTOS', cpf: '12345678901',
  company_id: 'emp-1', marking_count: null,
} as never;

/**
 * O servidor demora — e é ISSO que o bug precisava pra aparecer.
 *
 * Com um mock que responde na hora, a continuação do `await` roda no mesmo microtask,
 * ANTES do React re-renderizar, e o bug NÃO aparece (provado no A/B: o teste passava
 * igual com o código quebrado). No mundo real `identifyFace` é uma chamada de rede de
 * centenas de milissegundos: o React re-renderiza primeiro, o efeito antigo é desmontado
 * e a resposta cai num `mounted` já falso. 150ms reproduz exatamente essa ordem.
 */
const comAtraso = <T,>(valor: T, ms = 150) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(valor), ms));

/** jsdom não tem câmera: finge stream, metadados prontos e frame com tamanho. */
function fingirCamera() {
  const track = { stop: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 1 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  fingirCamera();
  // Um rosto sempre visível na câmera.
  detectFace.mockResolvedValue(new Float32Array(128).fill(0.1));
  getEmployeeByCpf.mockResolvedValue(FUNCIONARIO);
  getEmployeeTodayAttendance.mockResolvedValue(null); // nada batido hoje → próxima é a Entrada
});

afterEach(() => cleanup());

describe('facial sem CPF (o fluxo do tablet)', () => {
  it('🎯 identifica e mostra o NOME — não fica preso em "Identificando..."', async () => {
    identifyFace.mockImplementation(() => comAtraso({ matched: true, employeeId: 'f-1', cpf: '12345678901' }));
    getEmployeeByCpf.mockImplementation(() => comAtraso(FUNCIONARIO));
    getEmployeeTodayAttendance.mockImplementation(() => comAtraso(null));
    const onConfirmed = vi.fn();

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);

    // O nome na tela é a prova de que a resposta do servidor foi APROVEITADA.
    await waitFor(
      () => expect(screen.getByText('MARIA APARECIDA DOS SANTOS')).toBeTruthy(),
      { timeout: 8000 },
    );
    expect(screen.getByText(/Registrando/i)).toBeTruthy();

    // E o registro acontece sozinho depois da contagem de 3s (o pai é quem grava).
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1), { timeout: 8000 });
    const [emp, descriptor, tipo] = onConfirmed.mock.calls[0];
    expect((emp as { id: string }).id).toBe('f-1');
    expect(tipo).toBe('entry');
    expect((descriptor as number[]).length).toBe(128);
  }, 20_000);

  it('servidor lento: a saída manual continua na tela (ninguém fica preso)', async () => {
    // Resposta que nunca chega — o pior caso do galpão com rede ruim.
    identifyFace.mockReturnValue(new Promise(() => {}));

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} />);

    await waitFor(() => expect(identifyFace).toHaveBeenCalled(), { timeout: 8000 });
    await waitFor(
      () => expect(screen.getByRole('button', { name: /digitar CPF e senha/i })).toBeTruthy(),
      { timeout: 8000 },
    );
  }, 20_000);

  it('não reconhecido: avisa e volta a escanear (não trava)', async () => {
    identifyFace.mockImplementation(() => comAtraso({ matched: false }));

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} />);

    await waitFor(
      () => expect(screen.getByText(/Não reconheci/i)).toBeTruthy(),
      { timeout: 8000 },
    );
    // Voltou a escanear sozinho: a instrução de aproximar o rosto reaparece.
    await waitFor(
      () => expect(screen.getByText(/Aproxime o rosto/i)).toBeTruthy(),
      { timeout: 8000 },
    );
  }, 20_000);

  it('ponto do dia já completo: diz isso e volta a escanear', async () => {
    identifyFace.mockImplementation(() => comAtraso({ matched: true, employeeId: 'f-1', cpf: '12345678901' }));
    getEmployeeByCpf.mockImplementation(() => comAtraso(FUNCIONARIO));
    getEmployeeTodayAttendance.mockImplementation(() => comAtraso({
      id: 'a-1', employee_id: 'f-1', entry_time: '08:00', exit_time_full: '17:00',
    }));
    const onConfirmed = vi.fn();

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);

    await waitFor(
      () => expect(screen.getByText(/ponto completo hoje/i)).toBeTruthy(),
      { timeout: 8000 },
    );
    expect(onConfirmed).not.toHaveBeenCalled();
  }, 20_000);
});
