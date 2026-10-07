/**
 * MODO GALPÃO — o tablet SEM TOQUE (06/10/2026, plano do tablet sem toque, entrega A; decisões do
 * Victor de 05/10 em .claude-checkpoints/PLANO_TABLET_SEM_TOQUE_2026-10-05.md §2):
 *
 *  - decisão 2: no lugar do descanso com toque, o MODO ECONÔMICO — tela escura, câmera LIGADA
 *    olhando a cada 2 s, acorda SOZINHA com rosto;
 *  - decisão 3: batida a menos de 10 min vira AVISO sem botão e a pessoa fica ignorada 60 s;
 *  - decisão 11: "Não reconheci — chame o supervisor";
 *  - a 2ª foto no fim da contagem (saiu da frente ou trocou de pessoa → não grava; é ela que vai
 *    pro 1:1 do servidor);
 *  - câmera e reconhecimento que falharam tentam de novo sozinhos a cada 30 s;
 *  - decisão 7: o rosto procurado em todas as empresas do tablet.
 *
 * NENHUM teste daqui toca na tela (sem fireEvent): é o que "sem toque" quer dizer.
 * Roda com: npx vitest run modoGalpaoSemToque
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, within } from '@testing-library/react';

const identifyFace = vi.fn();
const getEmployeeByCpf = vi.fn();
const getEmployeeTodayAttendance = vi.fn();
const detectFace = vi.fn();
const compareFaces = vi.fn();
const tentarDeNovo = vi.fn();
let errroDosModelos: string | null = null;

vi.mock('../../src/services/database', () => ({
  identifyFace: (...a: unknown[]) => identifyFace(...a),
  getEmployeeByCpf: (...a: unknown[]) => getEmployeeByCpf(...a),
  getEmployeeTodayAttendance: (...a: unknown[]) => getEmployeeTodayAttendance(...a),
  logClockEvent: vi.fn(),
}));

vi.mock('../../src/hooks/useFaceApi', () => ({
  useFaceApi: () => ({
    loading: false,
    ready: errroDosModelos === null,
    error: errroDosModelos,
    tentarDeNovo: (...a: unknown[]) => tentarDeNovo(...a),
    detectFace: (...a: unknown[]) => detectFace(...a),
    compareFaces: (...a: unknown[]) => compareFaces(...a),
  }),
}));

import { FaceIdentifyClock } from '../../src/components/employee-clock/FaceIdentifyClock';
import {
  CAMERA_DESCANSA_APOS_MS, GALPAO_AVISO_MS, GALPAO_TENTA_DE_NOVO_MS, horaDaMarcacao,
} from '../../src/components/employee-clock/clockGuards';

const EMPRESA = { id: 'emp-1', name: 'Caratinga', default_marking_count: 2 } as never;
const FUNCIONARIO = {
  id: 'f-1', name: 'MARIA APARECIDA DOS SANTOS', cpf: '12345678901',
  company_id: 'emp-1', marking_count: null,
} as never;
const ROSTO = new Float32Array(128).fill(0.1);
const ROSTO_DA_2A_FOTO = new Float32Array(128).fill(0.11);
const OUTRO_ROSTO = new Float32Array(128).fill(0.9);
const RECONHECIDA = { matched: true, employeeId: 'f-1', cpf: '12345678901', comprovanteFacial: 'c-1' };

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

/**
 * Avança o relógio em passos de 100 ms, deixando o React aplicar cada mudança entre um passo e outro
 * (como no navegador). Num passo só, o React só aplicaria tudo no FIM — a tela nem sairia de
 * "carregando" no meio do tempo (achado ao escrever este teste, 06/10/2026).
 */
const passar = async (ms: number) => {
  for (let feito = 0; feito < ms; feito += 100) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, ms - feito)); });
  }
};

/** Espera por CONDIÇÃO (não por tempo fixo): avança de 100 em 100 ms até `condicao` valer, no máximo `maxMs`. */
const esperarAte = async (condicao: () => boolean, maxMs: number): Promise<boolean> => {
  for (let feito = 0; feito < maxMs; feito += 100) {
    if (condicao()) return true;
    await passar(100);
  }
  return condicao();
};
const naTela = (texto: string | RegExp) => () => screen.queryByText(texto) !== null;

const renderGalpao = (onConfirmed = vi.fn()) => {
  render(
    <FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} descansaSemNinguem modoGalpao />,
  );
  return onConfirmed;
};

let camera: ReturnType<typeof fingirCamera>;

beforeEach(() => {
  vi.clearAllMocks();
  errroDosModelos = null;
  camera = fingirCamera();
  getEmployeeByCpf.mockResolvedValue(FUNCIONARIO);
  getEmployeeTodayAttendance.mockResolvedValue(null); // ninguém bateu hoje → a próxima é a ENTRADA
  compareFaces.mockReturnValue(1); // rostos diferentes, salvo quando o teste disser o contrário
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('modo econômico (decisão 2): a câmera não desliga e a tela acorda sozinha', () => {
  it('1 minuto sem ninguém → tela escura que pede pra OLHAR (não tocar); a câmera segue ligada e olha a cada 2 s', async () => {
    detectFace.mockResolvedValue(null);
    renderGalpao();
    await passar(1000);
    await passar(CAMERA_DESCANSA_APOS_MS + 2000);

    expect(screen.getByTestId('camera-economia')).toBeTruthy();
    expect(screen.getByText(/Olhe para a câmera para bater o ponto/)).toBeTruthy();
    expect(screen.queryByTestId('camera-descanso')).toBeNull(); // o descanso que pede toque NÃO aparece
    expect(camera.track.stop).not.toHaveBeenCalled(); // a câmera não desligou
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);

    // Devagar: em 10 s, umas 5 olhadas (no ritmo normal seriam ~14).
    const antes = detectFace.mock.calls.length;
    await passar(10_000);
    const olhadas = detectFace.mock.calls.length - antes;
    expect(olhadas).toBeGreaterThanOrEqual(3);
    expect(olhadas).toBeLessThanOrEqual(6);
  });

  it('rosto na frente no modo econômico → a tela ACENDE sozinha, reconhece e grava — com a 2ª foto indo pro servidor', async () => {
    detectFace.mockResolvedValue(null);
    identifyFace.mockResolvedValue(RECONHECIDA);
    compareFaces.mockReturnValue(0.1); // a 2ª foto é da mesma pessoa
    const onConfirmed = renderGalpao();
    await passar(1000);
    await passar(CAMERA_DESCANSA_APOS_MS + 2000);
    expect(screen.getByTestId('camera-economia')).toBeTruthy();

    // Maria chega: a 1ª foto acorda a tela; as seguintes são a 2ª foto do fim da contagem.
    detectFace.mockResolvedValueOnce(ROSTO).mockResolvedValue(ROSTO_DA_2A_FOTO);
    expect(await esperarAte(naTela(/Registrando/), 3000)).toBe(true); // olha a cada 2 s: acorda em até 2 s
    expect(screen.queryByTestId('camera-economia')).toBeNull();
    expect(identifyFace).toHaveBeenCalledTimes(1);

    expect(await esperarAte(() => onConfirmed.mock.calls.length > 0, 3000)).toBe(true); // contagem de 2 s + 2ª foto
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    const [emp, descritor, tipo] = onConfirmed.mock.calls[0];
    expect((emp as { id: string }).id).toBe('f-1');
    expect(tipo).toBe('entry');
    expect(descritor).toEqual(Array.from(ROSTO_DA_2A_FOTO)); // a foto NOVA, não a do 1:N
  });
});

describe('batida a menos de 10 min (decisão 3): aviso SEM botão, não grava', () => {
  it('saída 2 min depois da entrada → "você já bateu a entrada às HH:MM", sem botão; some sozinho e a pessoa fica ignorada', async () => {
    const entrada = new Date(Date.now() - 2 * 60_000).toISOString();
    getEmployeeTodayAttendance.mockResolvedValue({ entry_time: entrada, exit_time_full: null });
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue(RECONHECIDA);
    compareFaces.mockReturnValue(0.1); // a mesma Maria continua na frente da câmera
    const onConfirmed = renderGalpao();
    expect(await esperarAte(() => screen.queryByTestId('aviso-batida-recente') !== null, 5000)).toBe(true);

    const aviso = screen.getByTestId('aviso-batida-recente');
    expect(aviso.textContent).toContain(`já bateu a entrada às ${horaDaMarcacao(entrada)}`);
    expect(within(aviso).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('confirmar-saida-rapida')).toBeNull(); // a pergunta com botão é de fora do galpão

    await passar(GALPAO_AVISO_MS + 500);
    expect(screen.queryByTestId('aviso-batida-recente')).toBeNull(); // sumiu sozinho

    // Continua na frente: ignorada — o rosto bate no próprio tablet e nem consulta o servidor.
    expect(identifyFace).toHaveBeenCalledTimes(1);
    await passar(30_000);
    expect(identifyFace).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('aviso-batida-recente')).toBeNull();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

describe('quem não é reconhecido (decisão 11)', () => {
  it('3 recusas seguidas → "Não reconheci — chame o supervisor"', async () => {
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue({ matched: false });
    renderGalpao();
    expect(await esperarAte(naTela('❌ Não reconheci — chame o supervisor'), 10_000)).toBe(true);
    expect(identifyFace).toHaveBeenCalledTimes(3); // só depois de 3 recusas seguidas
  });
});

describe('a 2ª foto no fim da contagem segura a batida errada', () => {
  it('durante a contagem, "Fique parado olhando para a câmera" (07/10: quem andava não batia sem entender); fora do modo galpão, não', async () => {
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue(RECONHECIDA);
    renderGalpao();
    expect(await esperarAte(naTela(/Registrando/), 5000)).toBe(true);
    expect(screen.getByTestId('galpao-fique-parado').textContent).toContain('Fique parado olhando para a câmera');
    cleanup();

    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} descansaSemNinguem />);
    expect(await esperarAte(naTela(/Registrando/), 5000)).toBe(true);
    expect(screen.queryByTestId('galpao-fique-parado')).toBeNull(); // o tablet de sempre fica igual
  });

  it('TROCOU a pessoa na frente durante a contagem → o ponto NÃO é gravado', async () => {
    detectFace.mockResolvedValueOnce(ROSTO).mockResolvedValue(OUTRO_ROSTO);
    identifyFace.mockResolvedValue(RECONHECIDA);
    compareFaces.mockReturnValue(0.8); // a 2ª foto é de OUTRA pessoa
    const onConfirmed = renderGalpao();
    expect(await esperarAte(naTela(/Registrando/), 5000)).toBe(true);
    expect(await esperarAte(naTela('⚠️ Trocou a pessoa na frente — ponto NÃO registrado'), 4000)).toBe(true);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('SAIU da frente antes do fim → NÃO grava (procura o rosto 3 vezes antes de desistir) e quem voltar é reconhecido de novo', async () => {
    detectFace.mockResolvedValueOnce(ROSTO).mockResolvedValue(null);
    identifyFace.mockResolvedValue(RECONHECIDA);
    const onConfirmed = renderGalpao();
    expect(await esperarAte(naTela(/Registrando/), 5000)).toBe(true);
    const deteccoesAntes = detectFace.mock.calls.length;
    expect(await esperarAte(naTela('⚠️ Saiu da frente antes do fim — ponto NÃO registrado'), 4000)).toBe(true);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(detectFace.mock.calls.length - deteccoesAntes).toBe(3); // procurou 3 vezes antes de desistir

    // Ela volta pra frente da câmera: não ficou ignorada — o servidor é consultado de novo.
    await passar(GALPAO_AVISO_MS + 500);
    expect(identifyFace).toHaveBeenCalledTimes(1);
    detectFace.mockResolvedValue(ROSTO);
    expect(await esperarAte(() => identifyFace.mock.calls.length === 2, 4000)).toBe(true);
  });
});

describe('recuperação sozinha (ninguém toca no "Tentar de novo")', () => {
  it('câmera que não abriu tenta de novo SOZINHA a cada 30 s', async () => {
    detectFace.mockResolvedValue(null);
    camera.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' }));
    renderGalpao();
    await passar(1000);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    await passar(GALPAO_TENTA_DE_NOVO_MS + 1000);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Aproxime o rosto da câmera/)).toBeTruthy();
  });

  it('reconhecimento que não carregou (rede caiu) tenta de novo sozinho a cada 30 s', async () => {
    errroDosModelos = 'Failed to fetch';
    renderGalpao();
    await passar(1000);
    expect(screen.getByTestId('galpao-tentando-de-novo')).toBeTruthy();
    expect(tentarDeNovo).not.toHaveBeenCalled();
    await passar(GALPAO_TENTA_DE_NOVO_MS + 500);
    expect(tentarDeNovo).toHaveBeenCalledTimes(1);
  });
});

describe('as 2 empresas do tablet (decisão 7)', () => {
  it('pede pro servidor procurar em TODAS as empresas do tablet — e sem o modo galpão, o pedido é o de sempre', async () => {
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue({ matched: false });
    renderGalpao();
    expect(await esperarAte(() => identifyFace.mock.calls.length > 0, 4000)).toBe(true);
    expect(identifyFace.mock.calls[0][3]).toEqual({ todasAsEmpresasDoTablet: true });
    cleanup();

    identifyFace.mockClear();
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} descansaSemNinguem />);
    expect(await esperarAte(() => identifyFace.mock.calls.length > 0, 4000)).toBe(true);
    expect(identifyFace.mock.calls[0][3]).toBeUndefined();
  });

  it('ficha da OUTRA empresa: busca a pessoa e o ponto do dia NELA e usa o padrão de marcações dela (4)', async () => {
    detectFace.mockResolvedValue(ROSTO);
    identifyFace.mockResolvedValue({ ...RECONHECIDA, companyId: 'emp-2', defaultMarkingCount: 4 });
    getEmployeeByCpf.mockResolvedValue({ ...(FUNCIONARIO as object), company_id: 'emp-2' });
    renderGalpao();
    expect(await esperarAte(naTela(/Registrando/), 5000)).toBe(true);
    expect(getEmployeeByCpf).toHaveBeenCalledWith('12345678901', 'emp-2');
    expect(getEmployeeTodayAttendance).toHaveBeenCalledWith('f-1', 'emp-2', { comprovanteFacial: 'c-1' });
    // A 1ª das 4 marcações (na moldura e no cartão "Registrando ...").
    expect(screen.getByText(/Registrando/).textContent).toContain('Entrada manhã');
  });
});
