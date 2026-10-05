/**
 * TABLET DE PONTO (05/10/2026, pedidos e decisões do Victor):
 *
 * 1. CÂMERA DESCANSA (só no TABLET — o pai liga com `descansaSemNinguem`): "se o tablet ficar o tempo
 *    todo com a câmera ligada, ele vai esquentar muito". Sem ninguém na frente por
 *    CAMERA_DESCANSA_APOS_MS (1 minuto), a câmera desliga e a tela mostra "Toque para bater o ponto";
 *    o toque religa a câmera na hora. No celular de cada um, nada muda.
 * 2. SAÍDA LOGO DEPOIS DA ENTRADA: quem ficava parado na frente do tablet depois de bater a entrada
 *    era reconhecido de novo e ganhava uma SAÍDA automática (2 vezes em 03/10). Agora, batida pelo
 *    rosto a menos de 10 min da anterior pergunta antes — como o botão de saída já perguntava.
 * 3. QUEM ACABOU DE BATER é ignorado pela câmera por 1 minuto (a tela volta em 8s com a pessoa ainda
 *    na frente) — sem nem consultar o servidor quando o rosto bate no próprio tablet.
 *
 * Roda com: npx vitest run tabletDescansoESaidaRapida
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

const identifyFace = vi.fn();
const getEmployeeByCpf = vi.fn();
const getEmployeeTodayAttendance = vi.fn();
const detectFace = vi.fn();
const compareFaces = vi.fn();

vi.mock('../../src/services/database', () => ({
  identifyFace: (...a: unknown[]) => identifyFace(...a),
  getEmployeeByCpf: (...a: unknown[]) => getEmployeeByCpf(...a),
  getEmployeeTodayAttendance: (...a: unknown[]) => getEmployeeTodayAttendance(...a),
  logClockEvent: vi.fn(),
}));

vi.mock('../../src/hooks/useFaceApi', () => ({
  useFaceApi: () => ({
    loading: false,
    ready: true,
    error: null,
    detectFace: (...a: unknown[]) => detectFace(...a),
    compareFaces: (...a: unknown[]) => compareFaces(...a),
  }),
}));

import { FaceIdentifyClock } from '../../src/components/employee-clock/FaceIdentifyClock';
import { CAMERA_DESCANSA_APOS_MS } from '../../src/components/employee-clock/clockGuards';

const EMPRESA = { id: 'emp-1', name: 'Caratinga', default_marking_count: 2 } as never;
const FUNCIONARIO = {
  id: 'f-1', name: 'MARIA APARECIDA DOS SANTOS', cpf: '12345678901',
  company_id: 'emp-1', marking_count: null,
} as never;
const ROSTO = new Float32Array(128).fill(0.1);

/** jsdom não tem câmera: finge stream e devolve a trilha + o getUserMedia pra conferir. */
function fingirCamera() {
  const track = { stop: vi.fn(), readyState: 'live', addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 1 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  return { track, getUserMedia };
}

const passar = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

let camera: ReturnType<typeof fingirCamera>;

beforeEach(() => {
  vi.clearAllMocks();
  camera = fingirCamera();
  getEmployeeByCpf.mockResolvedValue(FUNCIONARIO);
  compareFaces.mockReturnValue(1); // rostos diferentes, salvo quando o teste disser o contrário
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('câmera descansa sem ninguém na frente (o tablet não esquenta 24h)', () => {
  it('1 minuto sem rosto → câmera DESLIGA e aparece "Toque para bater o ponto"; o toque RELIGA na hora', async () => {
    vi.useFakeTimers();
    detectFace.mockResolvedValue(null); // ninguém na frente da câmera
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} descansaSemNinguem />);
    await passar(1000);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('camera-descanso')).toBeNull();

    await passar(CAMERA_DESCANSA_APOS_MS + 2000);
    expect(screen.getByTestId('camera-descanso')).toBeTruthy();
    expect(screen.getByText(/Toque para bater o ponto/)).toBeTruthy();
    expect(camera.track.stop).toHaveBeenCalled(); // a luz da câmera apaga de verdade

    fireEvent.click(screen.getByTestId('camera-descanso'));
    await passar(500);
    expect(screen.queryByTestId('camera-descanso')).toBeNull();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2); // reabriu
    expect(screen.getByText(/Aproxime o rosto da câmera/)).toBeTruthy();
  });

  it('a câmera falha ao religar (ocupada): não descansa por cima do problema e o "Tentar de novo" funciona', async () => {
    vi.useFakeTimers();
    detectFace.mockResolvedValue(null);
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} descansaSemNinguem />);
    await passar(1000);
    await passar(CAMERA_DESCANSA_APOS_MS + 2000);
    expect(screen.getByTestId('camera-descanso')).toBeTruthy();
    // Ao acordar, o Android responde "câmera ocupada".
    camera.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' }));
    fireEvent.click(screen.getByTestId('camera-descanso'));
    await passar(1000);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    await passar(CAMERA_DESCANSA_APOS_MS + 5000); // com a câmera em problema o minuto não conta
    expect(screen.queryByTestId('camera-descanso')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/i }));
    await passar(1000);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(3);
  });

  it('voltar pra tela (outro app; tela do aparelho acendeu) recomeça o minuto — não cai direto na tela escura', async () => {
    vi.useFakeTimers();
    detectFace.mockResolvedValue(null);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    try {
      render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} descansaSemNinguem />);
      await passar(1000);
      await passar(CAMERA_DESCANSA_APOS_MS - 10_000); // ~51s sem ninguém
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      await passar(20_000); // 71s desde o começo, 20s desde a volta
      expect(screen.queryByTestId('camera-descanso')).toBeNull();
      await passar(CAMERA_DESCANSA_APOS_MS); // 1 min desde a volta: agora descansa
      expect(screen.getByTestId('camera-descanso')).toBeTruthy();
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState; // volta a ser a do jsdom
    }
  });

  it('CELULAR (sem a opção do tablet): a câmera NÃO descansa — segue ligada, como sempre', async () => {
    vi.useFakeTimers();
    detectFace.mockResolvedValue(null);
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} />);
    await passar(1000);
    await passar(CAMERA_DESCANSA_APOS_MS * 3);
    expect(screen.queryByTestId('camera-descanso')).toBeNull();
    expect(camera.track.stop).not.toHaveBeenCalled();
  });

  it('com gente na frente da câmera NÃO descansa', async () => {
    vi.useFakeTimers();
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue({ matched: false }); // alguém sem cadastro, parado ali
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} descansaSemNinguem />);
    await passar(1000); // a câmera abre e a tela passa a procurar (o React só aplica ao fim de cada passo)
    await passar(CAMERA_DESCANSA_APOS_MS + 5000);
    expect(screen.queryByTestId('camera-descanso')).toBeNull();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('descansando, "Prefere digitar CPF e senha?" continua à mão (sem precisar acordar a câmera)', async () => {
    vi.useFakeTimers();
    detectFace.mockResolvedValue(null);
    const onUseCpf = vi.fn();
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={onUseCpf} descansaSemNinguem />);
    await passar(1000);
    await passar(CAMERA_DESCANSA_APOS_MS + 2000);
    expect(screen.getByTestId('camera-descanso')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /digitar CPF e senha/i }));
    expect(onUseCpf).toHaveBeenCalledTimes(1);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1); // não religou a câmera à toa
  });
});

describe('quem acabou de bater e continua na frente do tablet não é reconhecido de novo', () => {
  beforeEach(() => {
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue({ matched: true, employeeId: 'f-1', cpf: '12345678901', comprovanteFacial: 'c-1' });
    getEmployeeTodayAttendance.mockResolvedValue({ entry_time: new Date(Date.now() - 60_000).toISOString(), exit_time_full: null });
  });

  it('com o rosto da batida: nem consulta o servidor', async () => {
    compareFaces.mockReturnValue(0.1);
    const recemBatidos = { current: [{ employeeId: 'f-1', descriptor: Array.from(ROSTO), ate: Date.now() + 60_000 }] };
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} recemBatidos={recemBatidos} />);
    await new Promise((r) => setTimeout(r, 3000));
    expect(identifyFace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirmar-saida-rapida')).toBeNull();
  });

  it('batida sem rosto (pelo CPF): o servidor reconhece UMA vez, a tela não pergunta nem conta, e o rosto fica guardado', async () => {
    compareFaces.mockReturnValue(0.1); // a mesma pessoa continua na frente
    const recemBatidos: { current: { employeeId: string; descriptor?: number[]; ate: number }[] } = {
      current: [{ employeeId: 'f-1', ate: Date.now() + 60_000 }],
    };
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} recemBatidos={recemBatidos} />);
    await waitFor(() => expect(identifyFace).toHaveBeenCalled(), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 3000));
    expect(screen.queryByTestId('confirmar-saida-rapida')).toBeNull();
    expect(screen.queryByText(/Registrando/)).toBeNull();
    expect(identifyFace).toHaveBeenCalledTimes(1); // dali em diante o rosto bate no próprio tablet
    expect(recemBatidos.current[0].descriptor).toHaveLength(128);
  });
});

describe('saída pelo rosto logo depois da entrada pergunta antes (sem saída falsa)', () => {
  const entradaHaMinutos = (min: number) => ({
    entry_time: new Date(Date.now() - min * 60_000).toISOString(), exit_time_full: null,
  });

  beforeEach(() => {
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue({ matched: true, employeeId: 'f-1', cpf: '12345678901', comprovanteFacial: 'c-1' });
  });

  it('entrada há 2 min → pergunta "Registrar Saída agora?" e NÃO conta sozinho; "Sim" registra', async () => {
    getEmployeeTodayAttendance.mockResolvedValue(entradaHaMinutos(2));
    const onConfirmed = vi.fn();
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('confirmar-saida-rapida')).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByText(/há/).textContent).toMatch(/2 min/);
    expect(screen.queryByText(/Registrando/)).toBeNull();
    // Mesmo esperando mais que a contagem normal (2s), nada é gravado sem resposta.
    await new Promise((r) => setTimeout(r, 2600));
    expect(onConfirmed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Sim, registrar Saída agora/i }));
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onConfirmed.mock.calls[0][2]).toBe('exit');
    expect(onConfirmed.mock.calls[0][4]).toBe('c-1');
  });

  it('"Não, foi engano" (o botão principal) → não registra, não pergunta de novo e nem consulta o servidor enquanto a pessoa continua ali', async () => {
    getEmployeeTodayAttendance.mockResolvedValue(entradaHaMinutos(1));
    const onConfirmed = vi.fn();
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('confirmar-saida-rapida')).toBeTruthy(), { timeout: 8000 });
    compareFaces.mockReturnValue(0.2); // o mesmo rosto continua na câmera
    const consultasAntes = identifyFace.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Não, foi engano/ }));
    expect(screen.queryByTestId('confirmar-saida-rapida')).toBeNull();
    await new Promise((r) => setTimeout(r, 3000));
    expect(screen.queryByTestId('confirmar-saida-rapida')).toBeNull();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(identifyFace.mock.calls.length).toBe(consultasAntes); // o rosto bateu no próprio tablet
  });

  it('4 batidas: a VOLTA DO ALMOÇO logo depois da saída do almoço também pergunta (antes contava sozinho)', async () => {
    getEmployeeByCpf.mockResolvedValue({ ...(FUNCIONARIO as object), marking_count: 4 });
    getEmployeeTodayAttendance.mockResolvedValue({
      entry_1_time: new Date(Date.now() - 3 * 3600_000).toISOString(),
      exit_1_time: new Date(Date.now() - 2 * 60_000).toISOString(),
    });
    const onConfirmed = vi.fn();
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('confirmar-saida-rapida')).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByTestId('confirmar-saida-rapida').textContent).toMatch(/a saída do almoço há/);
    expect(screen.getByRole('button', { name: /Sim, registrar Volta almoço agora/i })).toBeTruthy();
    expect(screen.queryByText(/Registrando/)).toBeNull();
  });

  it('entrada há 30 min → saída normal, com a contagem de sempre (sem pergunta)', async () => {
    getEmployeeTodayAttendance.mockResolvedValue(entradaHaMinutos(30));
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Registrando/)).toBeTruthy(), { timeout: 8000 });
    expect(screen.queryByTestId('confirmar-saida-rapida')).toBeNull();
  });
});
