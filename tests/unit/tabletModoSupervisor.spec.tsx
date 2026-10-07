/**
 * O TABLET no modo supervisor (07/10/2026, plano do tablet sem toque, entrega F): o cartão que
 * aparece quando a câmera vê o QR do celular do supervisor, e o encaixe dele no reconhecimento
 * (FaceIdentifyClock). Servidor, câmera e leitor de QR falsos aqui — o caminho de verdade (QR na
 * câmera falsa do Chromium, rosto real, servidor real) está no E2E 137.
 *
 * NENHUM teste daqui toca na tela (sem fireEvent): o tablet é sem toque.
 * Roda com: npx vitest run tabletModoSupervisor
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';

const tabletLeuQr = vi.fn();
const tabletEnviaRosto = vi.fn();
const tabletEstadoDoQr = vi.fn();
const lerQrDoQuadro = vi.fn();

vi.mock('../../src/services/supervisorTablet', async () => {
  const real = await vi.importActual<typeof import('../../src/services/supervisorTablet')>('../../src/services/supervisorTablet');
  return {
    ...real,
    tabletLeuQr: (...a: unknown[]) => tabletLeuQr(...a),
    tabletEnviaRosto: (...a: unknown[]) => tabletEnviaRosto(...a),
    tabletEstadoDoQr: (...a: unknown[]) => tabletEstadoDoQr(...a),
  };
});
vi.mock('../../src/components/employee-clock/tabletSupervisor/leitorDeQr', async () => {
  const real = await vi.importActual<typeof import('../../src/components/employee-clock/tabletSupervisor/leitorDeQr')>(
    '../../src/components/employee-clock/tabletSupervisor/leitorDeQr');
  return { ...real, lerQrDoQuadro: (...a: unknown[]) => lerQrDoQuadro(...a), fotoPequenaDoQuadro: () => 'data:image/jpeg;base64,AAAA' };
});

// Pro encaixe no reconhecimento (FaceIdentifyClock) — o mesmo molde do modoGalpaoSemToque.
const identifyFace = vi.fn();
const getEmployeeByCpf = vi.fn();
const getEmployeeTodayAttendance = vi.fn();
const detectFace = vi.fn();
const compareFaces = vi.fn();
const contarRostos = vi.fn();
vi.mock('../../src/services/database', () => ({
  identifyFace: (...a: unknown[]) => identifyFace(...a),
  getEmployeeByCpf: (...a: unknown[]) => getEmployeeByCpf(...a),
  getEmployeeTodayAttendance: (...a: unknown[]) => getEmployeeTodayAttendance(...a),
  logClockEvent: vi.fn(),
}));
vi.mock('../../src/hooks/useFaceApi', () => ({
  useFaceApi: () => ({
    loading: false, ready: true, error: null, tentarDeNovo: vi.fn(),
    detectFace: (...a: unknown[]) => detectFace(...a),
    compareFaces: (...a: unknown[]) => compareFaces(...a),
    contarRostos: (...a: unknown[]) => contarRostos(...a),
  }),
}));

import { ErroDoSupervisor, type StatusDoQr } from '../../src/services/supervisorTablet';
import { ehQrDoSistema } from '../../src/components/employee-clock/tabletSupervisor/leitorDeQr';
import { TabletModoSupervisor, AMOSTRAS_DO_ROSTO } from '../../src/components/employee-clock/tabletSupervisor/TabletModoSupervisor';
import { FaceIdentifyClock } from '../../src/components/employee-clock/FaceIdentifyClock';
import { GALPAO_IGNORA_SUPERVISOR_MS } from '../../src/components/employee-clock/clockGuards';

const QR_P = 'PT1:P:ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const QR_R = 'PT1:R:ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LEITURA = { tipo: 'rosto' as const, qrId: 'qr-2', employeeId: 'e-maria', primeiroNome: 'MARIA', modo: 'novo' as const, baterPonto: true, prazoCapturaMs: 60_000 };
const PAREOU = { tipo: 'parear' as const, supervisor: { id: '03', nome: 'JOAO SILVA' }, funcionarioDoSupervisorId: 'e-joao' };
const ROSTO = new Float32Array(128).fill(0.1);

/** Relógio falso em passos de 100 ms, deixando o React aplicar cada mudança (ver modoGalpaoSemToque). */
const passar = async (ms: number) => {
  for (let feito = 0; feito < ms; feito += 100) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, ms - feito)); });
  }
};
/** Espera por CONDIÇÃO (não por tempo fixo), no máximo `maxMs`. */
const esperarAte = async (condicao: () => boolean, maxMs: number): Promise<boolean> => {
  for (let feito = 0; feito < maxMs; feito += 100) {
    if (condicao()) return true;
    await passar(100);
  }
  return condicao();
};
const naTela = (texto: string | RegExp) => () => screen.queryByText(texto) !== null;
const temId = (id: string) => () => screen.queryByTestId(id) !== null;
const video = { current: document.createElement('video') };

beforeEach(() => {
  // reset (não só clear): resposta "uma vez só" que sobrou de um teste que falhou não vaza pro próximo.
  vi.resetAllMocks();
  vi.useFakeTimers();
  lerQrDoQuadro.mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('só QR do próprio sistema conta', () => {
  it('formato PT1:P/R + 26 símbolos; o resto é ignorado', () => {
    expect(ehQrDoSistema(QR_P)).toBe(true);
    expect(ehQrDoSistema(QR_R)).toBe(true);
    expect(ehQrDoSistema('https://exemplo.com')).toBe(false);
    expect(ehQrDoSistema('PT-QRTEST')).toBe(false); // o da página /qr-teste
    expect(ehQrDoSistema('PT1:X:ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false);
    expect(ehQrDoSistema(null)).toBe(false);
  });
});

describe('o cartão do supervisor no tablet', () => {
  const montar = (inicio: { qrText: string } | { rosto: typeof LEITURA }, onFim = vi.fn()) => {
    render(<TabletModoSupervisor videoRef={video} deviceToken="seg" inicio={inicio} detectFace={detectFace} contarRostos={contarRostos} onFim={onFim} />);
    return onFim;
  };

  it('o QR é lido UMA vez mesmo com o efeito rodando 2 vezes (modo estrito do React) — QR é de 1 uso', async () => {
    // Como o servidor de verdade: a 1ª leitura ganha o QR; uma 2ª levaria "já usado" (achado no E2E 137).
    tabletLeuQr.mockResolvedValueOnce(PAREOU)
      .mockRejectedValueOnce(new ErroDoSupervisor('Código vencido ou já usado.', 404, null));
    render(
      <StrictMode>
        <TabletModoSupervisor videoRef={video} deviceToken="seg" inicio={{ qrText: QR_P }} detectFace={detectFace} contarRostos={contarRostos} onFim={vi.fn()} />
      </StrictMode>,
    );
    await passar(300);
    expect(tabletLeuQr).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tablet-celular-conectado').textContent).toContain('conectado ✓');
    expect(screen.queryByTestId('tablet-supervisor-aviso')).toBeNull();
  });

  it('QR de conectar → "Celular de JOAO conectado ✓" e, 3 s depois, avisa quem ignorar', async () => {
    tabletLeuQr.mockResolvedValue(PAREOU);
    const onFim = montar({ qrText: QR_P });
    await passar(300);
    expect(screen.getByTestId('tablet-celular-conectado').textContent).toContain('Celular de JOAO conectado');
    expect(tabletLeuQr).toHaveBeenCalledWith('seg', QR_P);
    expect(onFim).not.toHaveBeenCalled();
    await passar(3100);
    expect(onFim).toHaveBeenCalledWith({ tipo: 'parear', ignorarFuncionario: 'e-joao' });
  });

  it('QR do rosto: só com UMA pessoa na frente; 4 fotos → manda pro servidor', async () => {
    contarRostos.mockResolvedValueOnce(2).mockResolvedValue(1); // primeiro, duas pessoas na frente
    detectFace.mockResolvedValue(ROSTO);
    tabletEnviaRosto.mockResolvedValue({ ok: true, aviso: false });
    const onFim = montar({ rosto: LEITURA });
    await passar(200);
    expect(screen.getByTestId('tablet-captura-nome').textContent).toBe('MARIA, olhe para a câmera');
    expect(screen.getByText('Só uma pessoa na frente do tablet.')).toBeTruthy();
    expect(detectFace).not.toHaveBeenCalled(); // com 2 rostos, nenhuma foto conta
    await passar(4000);
    expect(tabletEnviaRosto).toHaveBeenCalledTimes(1);
    const [token, qrId, amostras, foto] = tabletEnviaRosto.mock.calls[0];
    expect([token, qrId, (amostras as number[][]).length, foto]).toEqual(['seg', 'qr-2', AMOSTRAS_DO_ROSTO, 'data:image/jpeg;base64,AAAA']);
    expect((amostras as number[][])[0]).toHaveLength(128);
    expect(onFim).toHaveBeenCalledWith({ tipo: 'rosto-enviado', leitura: LEITURA });
  });

  it('o servidor diz que a pessoa se MEXEU → recomeça as fotos COM o aviso; rosto de OUTRA pessoa → aviso e volta', async () => {
    contarRostos.mockResolvedValue(1);
    detectFace.mockResolvedValue(ROSTO);
    tabletEnviaRosto
      .mockRejectedValueOnce(new ErroDoSupervisor('Fique parado olhando para a câmera.', 422, 'mexeu'))
      .mockRejectedValueOnce(new ErroDoSupervisor('Esse rosto é muito parecido com o de outra pessoa já cadastrada.', 409, 'parecido'));
    const onFim = montar({ rosto: LEITURA });
    expect(await esperarAte(() => tabletEnviaRosto.mock.calls.length === 1, 3000)).toBe(true);
    expect(await esperarAte(temId('tablet-captura-mexeu'), 1000)).toBe(true);
    await passar(700); // a captura nova já tirou fotos — e o aviso continua
    expect(screen.getByTestId('tablet-captura-mexeu').textContent).toBe('Fique parado olhando para a câmera.');
    expect(await esperarAte(() => tabletEnviaRosto.mock.calls.length === 2, 3000)).toBe(true);
    expect(await esperarAte(temId('tablet-supervisor-aviso'), 1000)).toBe(true);
    expect(screen.getByTestId('tablet-supervisor-aviso').textContent).toContain('parecido');
    expect(onFim).not.toHaveBeenCalled();
    await passar(3100);
    expect(onFim).toHaveBeenCalledWith({ tipo: 'erro' });
  });

  it('ninguém na frente até o prazo de captura → avisa pra gerar outro código e volta sozinho', async () => {
    contarRostos.mockResolvedValue(0);
    const onFim = montar({ rosto: LEITURA });
    await passar(1000);
    expect(screen.getByText('Olhe para a câmera.')).toBeTruthy();
    await passar(55_000);
    expect(screen.getByTestId('tablet-supervisor-aviso').textContent).toContain('O tempo pra tirar o rosto acabou');
    expect(tabletEnviaRosto).not.toHaveBeenCalled();
    await passar(3100);
    expect(onFim).toHaveBeenCalledWith({ tipo: 'erro' });
  });

  it('QR vencido/usado (recusa do servidor) e sem internet: o motivo na tela e volta sozinho', async () => {
    tabletLeuQr.mockRejectedValueOnce(new ErroDoSupervisor('Código vencido ou já usado. Gere outro no celular.', 404, null));
    const onFim = montar({ qrText: QR_P });
    await passar(300);
    expect(screen.getByTestId('tablet-supervisor-aviso').textContent).toBe('Código vencido ou já usado. Gere outro no celular.');
    await passar(3100);
    expect(onFim).toHaveBeenCalledWith({ tipo: 'erro' });
    cleanup();

    tabletLeuQr.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    montar({ qrText: QR_P });
    await passar(300);
    expect(screen.getByTestId('tablet-supervisor-aviso').textContent).toBe('Sem internet — o código não foi lido.');
  });
});

describe('o encaixe no reconhecimento do tablet (modo galpão)', () => {
  const EMPRESA = { id: 'emp-1', name: 'Caratinga', default_marking_count: 2 } as never;
  const JOAO = { id: 'e-joao', name: 'JOAO SILVA', cpf: '12345678901', company_id: 'emp-1', marking_count: null } as never;
  const JOAO_RECONHECIDO = { matched: true, employeeId: 'e-joao', cpf: '12345678901', comprovanteFacial: 'c' };
  /** Estado do QR do rosto "no servidor" — o tablet pergunta, o teste muda (como o supervisor no celular). */
  let estadoNoServidor: StatusDoQr = 'capturado';

  function fingirCamera() {
    const track = { stop: vi.fn(), readyState: 'live', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  }

  const renderTablet = () => {
    const onConfirmed = vi.fn();
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={onConfirmed} onUseCpf={vi.fn()} descansaSemNinguem modoGalpao deviceToken="seg" />);
    return onConfirmed;
  };

  beforeEach(() => {
    fingirCamera();
    detectFace.mockResolvedValue(ROSTO);
    compareFaces.mockReturnValue(1); // a comparação local nunca dá "mesmo rosto": tudo passa pelo servidor
    contarRostos.mockResolvedValue(1);
    getEmployeeByCpf.mockResolvedValue(JOAO);
    getEmployeeTodayAttendance.mockResolvedValue(null);
    estadoNoServidor = 'capturado';
    tabletEstadoDoQr.mockImplementation(async () => ({ status: estadoNoServidor, employeeId: 'e-maria', baterPonto: true, tentativas: 0 }));
    tabletEnviaRosto.mockImplementation(async () => { estadoNoServidor = 'capturado'; return { ok: true, aviso: false }; });
  });

  it('QR visto DURANTE a contagem do nome cancela a contagem; o MESMO QR não é lido de novo; o supervisor fica ignorado 2 min', async () => {
    identifyFace.mockResolvedValue(JOAO_RECONHECIDO);
    tabletLeuQr.mockResolvedValue(PAREOU);
    const onConfirmed = renderTablet();
    expect(await esperarAte(naTela(/Registrando/), 10_000)).toBe(true); // a contagem do João começou
    lerQrDoQuadro.mockReturnValue(QR_P); // ele mostra o celular (e o QR fica na frente da câmera)
    expect(await esperarAte(temId('tablet-celular-conectado'), 3000)).toBe(true);
    expect(screen.queryByText(/Registrando/)).toBeNull(); // a contagem foi cancelada
    expect(tabletLeuQr).toHaveBeenCalledWith('seg', QR_P);

    // O cartão some sozinho; o MESMO QR, ainda na frente, não é lido de novo.
    await passar(8000);
    expect(screen.queryByTestId('tablet-modo-supervisor')).toBeNull();
    expect(tabletLeuQr).toHaveBeenCalledTimes(1);
    lerQrDoQuadro.mockReturnValue(null); // o celular saiu da frente

    // O João (funcionário do supervisor) continua na frente: o servidor o reconhece, mas o ponto não bate.
    const consultasAntes = identifyFace.mock.calls.length;
    await passar(60_000);
    expect(identifyFace.mock.calls.length).toBeGreaterThan(consultasAntes); // o tablet seguiu reconhecendo
    expect(screen.queryByText(/Registrando/)).toBeNull();
    expect(onConfirmed).not.toHaveBeenCalled();

    // Passados os 2 min, ele volta ao normal.
    expect(await esperarAte(naTela(/Registrando/), GALPAO_IGNORA_SUPERVISOR_MS)).toBe(true);
  });

  it('QR do rosto: tira as fotos, espera o supervisor SEM piscar "Não reconheci" e mostra "✓ Rosto … cadastrado"', async () => {
    identifyFace.mockResolvedValue({ matched: false }); // a Maria ainda não tem rosto
    lerQrDoQuadro.mockReturnValueOnce(QR_R);
    tabletLeuQr.mockResolvedValue(LEITURA);
    renderTablet();
    expect(await esperarAte(temId('tablet-captura-nome'), 5000)).toBe(true);
    expect(await esperarAte(temId('tablet-aguardando-confirmacao'), 10_000)).toBe(true);
    expect(screen.getByTestId('tablet-aguardando-confirmacao').textContent).toContain('confirmar o rosto de MARIA');
    expect(tabletEnviaRosto).toHaveBeenCalledTimes(1);

    // Esperando: o tablet segue consultando quem aparece, mas NUNCA diz "Não reconheci" (3 recusas
    // seguidas diriam) — conferido a cada 100 ms da janela, não só no fim dela.
    const antes = identifyFace.mock.calls.length;
    expect(await esperarAte(naTela(/Não reconheci/), 10_000)).toBe(false);
    expect(identifyFace.mock.calls.length - antes).toBeGreaterThanOrEqual(3);

    estadoNoServidor = 'confirmado'; // o supervisor confirmou no celular
    expect(await esperarAte(temId('tablet-faixa-supervisor'), 5000)).toBe(true);
    expect(screen.getByTestId('tablet-faixa-supervisor').textContent).toBe('✓ Rosto de MARIA cadastrado');
    expect(screen.queryByTestId('tablet-aguardando-confirmacao')).toBeNull();
    // Acabou a espera: rosto desconhecido volta a ouvir "chame o supervisor".
    expect(await esperarAte(naTela(/Não reconheci/), 10_000)).toBe(true);
  });

  it('o supervisor pede OUTRA foto → o tablet tira de novo sozinho, sem ler o QR outra vez', async () => {
    identifyFace.mockResolvedValue({ matched: false });
    lerQrDoQuadro.mockReturnValueOnce(QR_R);
    tabletLeuQr.mockResolvedValue(LEITURA);
    renderTablet();
    expect(await esperarAte(temId('tablet-aguardando-confirmacao'), 10_000)).toBe(true);
    expect(screen.queryByTestId('tablet-captura-nome')).toBeNull();

    estadoNoServidor = 'lido'; // "Tirar de novo" no celular
    expect(await esperarAte(temId('tablet-captura-nome'), 5000)).toBe(true);
    expect(await esperarAte(() => tabletEnviaRosto.mock.calls.length === 2, 5000)).toBe(true);
    expect(tabletLeuQr).toHaveBeenCalledTimes(1);
    expect(await esperarAte(temId('tablet-aguardando-confirmacao'), 3000)).toBe(true);
  });

  const REFAZER_JOAO = { ...LEITURA, employeeId: 'e-joao', primeiroNome: 'JOAO', modo: 'refazer' as const, baterPonto: false };

  it('rosto REFEITO sem "bater o ponto agora": reconhecido (rosto antigo) na espera e 2 min depois, mas NÃO bate', async () => {
    identifyFace.mockResolvedValue(JOAO_RECONHECIDO); // o rosto ANTIGO vale até a confirmação
    lerQrDoQuadro.mockReturnValueOnce(QR_R);
    tabletLeuQr.mockResolvedValue(REFAZER_JOAO);
    const onConfirmed = renderTablet();
    expect(await esperarAte(temId('tablet-aguardando-confirmacao'), 10_000)).toBe(true);

    // Esperando o supervisor: o servidor reconhece o João, mas a contagem nunca começa.
    const antes = identifyFace.mock.calls.length;
    expect(await esperarAte(naTela(/Registrando/), 15_000)).toBe(false);
    expect(identifyFace.mock.calls.length).toBeGreaterThan(antes);

    estadoNoServidor = 'confirmado';
    expect(await esperarAte(temId('tablet-faixa-supervisor'), 5000)).toBe(true);
    expect(screen.getByTestId('tablet-faixa-supervisor').textContent).toBe('✓ Rosto de JOAO refeito');
    // Confirmado: mais 2 min sem bater (ele ainda está na frente)...
    expect(await esperarAte(naTela(/Registrando/), GALPAO_IGNORA_SUPERVISOR_MS - 10_000)).toBe(false);
    expect(onConfirmed).not.toHaveBeenCalled();
    // ...e então volta ao normal.
    expect(await esperarAte(naTela(/Registrando/), 20_000)).toBe(true);
  });

  it('sem "bater o ponto agora", a foto de novo FALHOU: a pessoa fica 2 min sem bater — e não para sempre', async () => {
    identifyFace.mockResolvedValue(JOAO_RECONHECIDO);
    lerQrDoQuadro.mockReturnValueOnce(QR_R);
    tabletLeuQr.mockResolvedValue(REFAZER_JOAO);
    tabletEnviaRosto
      .mockImplementationOnce(async () => { estadoNoServidor = 'capturado'; return { ok: true, aviso: false }; })
      .mockRejectedValueOnce(new ErroDoSupervisor('Esse rosto é muito parecido com o de outra pessoa já cadastrada.', 409, 'parecido'));
    const onConfirmed = renderTablet();
    expect(await esperarAte(temId('tablet-aguardando-confirmacao'), 10_000)).toBe(true);
    estadoNoServidor = 'lido'; // "Tirar de novo" no celular — e a 2ª foto é recusada
    expect(await esperarAte(temId('tablet-supervisor-aviso'), 10_000)).toBe(true);
    expect(await esperarAte(() => screen.queryByTestId('tablet-modo-supervisor') === null, 5000)).toBe(true); // o aviso some sozinho
    expect(await esperarAte(naTela(/Registrando/), GALPAO_IGNORA_SUPERVISOR_MS - 10_000)).toBe(false);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(await esperarAte(naTela(/Registrando/), 20_000)).toBe(true);
  });

  it('sem o segredo do tablet, ou fora do modo galpão, o QR nem é procurado', async () => {
    identifyFace.mockResolvedValue({ matched: false });
    lerQrDoQuadro.mockReturnValue(QR_P);
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} descansaSemNinguem modoGalpao />);
    await passar(5000);
    cleanup();
    render(<FaceIdentifyClock company={EMPRESA} onConfirmed={vi.fn()} onUseCpf={vi.fn()} deviceToken="seg" />);
    await passar(5000);
    expect(detectFace).toHaveBeenCalled(); // a câmera estava olhando
    expect(lerQrDoQuadro).not.toHaveBeenCalled();
    expect(tabletLeuQr).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tablet-modo-supervisor')).toBeNull();
  });
});
