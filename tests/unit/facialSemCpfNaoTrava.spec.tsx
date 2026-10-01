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
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const identifyFace = vi.fn();
const getEmployeeByCpf = vi.fn();
const getEmployeeTodayAttendance = vi.fn();
const detectFace = vi.fn();

vi.mock('../../src/services/database', () => ({
  identifyFace: (...a: unknown[]) => identifyFace(...a),
  getEmployeeByCpf: (...a: unknown[]) => getEmployeeByCpf(...a),
  getEmployeeTodayAttendance: (...a: unknown[]) => getEmployeeTodayAttendance(...a),
  // 30/09/2026: a câmera (useFrontCamera) registra erro de câmera no servidor.
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

/**
 * jsdom não tem câmera: finge stream, metadados prontos e frame com tamanho.
 * 30/09/2026: o stream falso ganhou `getVideoTracks` e a trilha ganhou `readyState` e
 * `addEventListener` — como um MediaStream de verdade. A câmera agora escuta o fim da trilha
 * (tela do tablet que apaga) e o falso antigo, sem isso, não era mais uma câmera plausível.
 */
function fingirCamera() {
  const track = { stop: vi.fn(), readyState: 'live', addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] }) },
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

    // E o registro acontece sozinho depois da contagem (o pai é quem grava).
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1), { timeout: 8000 });
    const [emp, descriptor, tipo] = onConfirmed.mock.calls[0];
    expect((emp as { id: string }).id).toBe('f-1');
    expect(tipo).toBe('entry');
    expect((descriptor as number[]).length).toBe(128);
  }, 20_000);

  /**
   * 30/09/2026 — contagem com o nome baixada de 3s pra 2s (decisão do Victor, meta 5–7s).
   * Trava as duas pontas: NÃO grava antes dos 2s (a pessoa ainda tem tempo de ver o nome) e
   * grava logo depois deles; e o "Não sou eu" dentro da janela impede a gravação.
   */
  it('contagem de 2s: mostra "em 2s", não grava antes e grava logo depois', async () => {
    identifyFace.mockResolvedValue({ matched: true, employeeId: 'f-1', cpf: '12345678901' });
    const onConfirmed = vi.fn();

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);

    // Mede a partir do NOME na tela (não do texto "em 2s": na contagem antiga de 3s, esse texto
    // também aparece — 1s depois do nome — e o teste passava igual; o A/B pegou).
    await waitFor(() => expect(screen.getByText('MARIA APARECIDA DOS SANTOS')).toBeTruthy(), { timeout: 8000 });
    const nomeNaTela = Date.now();
    expect(screen.getByText(/Registrando/).textContent).toMatch(/em 2s/);
    expect(onConfirmed).not.toHaveBeenCalled();

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const decorrido = Date.now() - nomeNaTela;
    // Não pode gravar antes da janela (~2s; folga de 150ms pro intervalo do jsdom)...
    expect(decorrido).toBeGreaterThanOrEqual(1850);
    // ...nem esperar a contagem antiga de 3s.
    expect(decorrido).toBeLessThan(2900);
  }, 20_000);

  it('"Não sou eu" dentro dos 2s: não grava', async () => {
    identifyFace.mockResolvedValue({ matched: true, employeeId: 'f-1', cpf: '12345678901' });
    const onConfirmed = vi.fn();

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('MARIA APARECIDA DOS SANTOS')).toBeTruthy(), { timeout: 8000 });
    fireEvent.click(screen.getByRole('button', { name: /Não sou eu/i }));

    // Provar que algo NÃO acontece exige deixar a janela passar: 2s da contagem + folga.
    // (A mesma pessoa ainda está na câmera, mas o cooldown de 6s impede reconhecê-la de novo.)
    await new Promise((r) => setTimeout(r, 2600));
    expect(onConfirmed).not.toHaveBeenCalled();
  }, 20_000);

  /**
   * 30/09/2026 (roadmap item 5): o ponto do dia só sai do servidor com a prova da pessoa. No
   * tablet não há PIN — a prova é o comprovante que o servidor devolve ao reconhecer o rosto.
   * Ele tem que ir na consulta do ponto do dia E chegar ao pai (que carrega o painel com ele).
   */
  it('comprovante do rosto: vai na consulta do ponto do dia e chega ao pai', async () => {
    identifyFace.mockImplementation(() => comAtraso({
      matched: true, employeeId: 'f-1', cpf: '12345678901', comprovanteFacial: 'comprovante-da-maria',
    }));
    const onConfirmed = vi.fn();

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(getEmployeeTodayAttendance).toHaveBeenCalledWith('f-1', 'emp-1', { comprovanteFacial: 'comprovante-da-maria' });
    expect(onConfirmed.mock.calls[0][4]).toBe('comprovante-da-maria');
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

    // 30/09/2026: o aviso só vem depois de 3 recusas SEGUIDAS (quadros ruins passam em silêncio
    // — ver NO_MATCH_BEFORE_WARNING); o que este teste trava continua igual: avisa e não trava.
    await waitFor(
      () => expect(screen.getByText(/Não reconheci/i)).toBeTruthy(),
      { timeout: 12_000 },
    );
    expect(identifyFace.mock.calls.length).toBeGreaterThanOrEqual(3);
    // Voltou a escanear sozinho: a instrução de aproximar o rosto reaparece.
    await waitFor(
      () => expect(screen.getByText(/Aproxime o rosto/i)).toBeTruthy(),
      { timeout: 8000 },
    );
  }, 30_000);

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
