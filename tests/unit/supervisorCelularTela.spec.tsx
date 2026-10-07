/**
 * MODO SUPERVISOR no celular — `/clock?supervisor=1` (07/10/2026, plano do tablet sem toque,
 * entrega E). As regras puras da tela e as telas com o servidor FALSO (o servidor de verdade está
 * provado no teste ao vivo edgeFnPontoSupervisorApi e no E2E 136).
 *
 * Roda com: npx vitest run supervisorCelularTela
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const srv = {
  entrarComoSupervisor: vi.fn(),
  gerarQrDeConectar: vi.fn(),
  estadoDoQr: vi.fn(),
  listarFuncoesDoSupervisor: vi.fn(),
  cadastrarPeloTablet: vi.fn(),
  gerarQrDoRosto: vi.fn(),
  decidirRostoCapturado: vi.fn(),
};

vi.mock('../../src/services/supervisorTablet', async () => {
  const real = await vi.importActual<typeof import('../../src/services/supervisorTablet')>('../../src/services/supervisorTablet');
  return {
    ...real,
    entrarComoSupervisor: (...a: unknown[]) => srv.entrarComoSupervisor(...a),
    gerarQrDeConectar: (...a: unknown[]) => srv.gerarQrDeConectar(...a),
    estadoDoQr: (...a: unknown[]) => srv.estadoDoQr(...a),
    listarFuncoesDoSupervisor: (...a: unknown[]) => srv.listarFuncoesDoSupervisor(...a),
    cadastrarPeloTablet: (...a: unknown[]) => srv.cadastrarPeloTablet(...a),
    gerarQrDoRosto: (...a: unknown[]) => srv.gerarQrDoRosto(...a),
    decidirRostoCapturado: (...a: unknown[]) => srv.decidirRostoCapturado(...a),
  };
});
vi.mock('../../src/contexts/useCompany', () => ({
  useCompany: () => ({ availableCompanies: [{ id: 'emp-pn', display_name: 'Ponte Nova' }] }),
}));
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }));

import { ErroDoSupervisor } from '../../src/services/supervisorTablet';
import { avisoDaFoto, formatarContagem, motivoDaRecusa, segundosRestantes, ultimaMarcacao } from '../../src/components/employee-clock/supervisor/supervisorUi';
import { EntrarComoSupervisor } from '../../src/components/employee-clock/supervisor/EntrarComoSupervisor';
import { ConectarAoTablet } from '../../src/components/employee-clock/supervisor/ConectarAoTablet';
import { CadastroPeloTablet } from '../../src/components/employee-clock/supervisor/CadastroPeloTablet';
import { RostoPeloTablet } from '../../src/components/employee-clock/supervisor/RostoPeloTablet';

const daqui = (ms: number) => new Date(Date.now() + ms).toISOString();
const QR = { qrId: 'qr-1', qrText: 'PT1:P:ABCDEFGHIJKLMNOPQRSTUVWXYZ', expiresAt: daqui(120_000) };

beforeEach(() => { Object.values(srv).forEach((f) => f.mockReset()); });
afterEach(() => cleanup());

describe('regras puras da tela', () => {
  it('contagem regressiva', () => {
    const agora = Date.parse('2026-10-07T10:00:00Z');
    expect(segundosRestantes('2026-10-07T10:01:59Z', agora)).toBe(119);
    expect(segundosRestantes('2026-10-07T09:00:00Z', agora)).toBe(0);
    expect(segundosRestantes(null, agora)).toBe(0);
    expect(formatarContagem(119)).toBe('1:59');
    expect(formatarContagem(7)).toBe('0:07');
  });
  it('a ÚLTIMA marcação do dia (2 ou 4 marcações)', () => {
    const vazio = { entry_time: null, entry_1_time: null, exit_1_time: null, entry_2_time: null, exit_2_time: null, exit_time_full: null };
    expect(ultimaMarcacao(null)).toBeNull();
    expect(ultimaMarcacao(vazio)).toBeNull();
    expect(ultimaMarcacao({ ...vazio, entry_time: '2026-10-07T10:02:00Z' })).toEqual({ rotulo: 'Entrada', hora: '07:02' });
    expect(ultimaMarcacao({ ...vazio, entry_1_time: '2026-10-07T10:02:00Z', exit_1_time: '2026-10-07T15:00:00Z' })?.rotulo).toBe('Saída do almoço');
  });
  it('avisos da foto e motivo da recusa', () => {
    expect(avisoDaFoto({ resultado: 'aviso', parecidoCom: { nome: 'JOAO', distancia: 0.55 } })).toContain('JOAO');
    expect(avisoDaFoto({ resultado: 'ok', distanciaDoRostoAntigo: 0.7 })).toContain('bem diferente');
    expect(avisoDaFoto({ resultado: 'ok', distanciaDoRostoAntigo: 0.3 })).toBeNull();
    expect(motivoDaRecusa({ parecidoCom: { nome: 'JOAO', distancia: 0.2 } })).toContain('JOAO');
  });
});

describe('login do supervisor', () => {
  it('a mensagem do servidor vai pra tela (ex.: trava de 15 min)', async () => {
    srv.entrarComoSupervisor.mockRejectedValue(new ErroDoSupervisor('Muitas tentativas erradas. Tente de novo em 15 minutos.', 423, null));
    render(<EntrarComoSupervisor aviso={null} onEntrou={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Seu código do painel'), { target: { value: '03' } });
    fireEvent.change(screen.getByLabelText('Senha do painel'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar como supervisor/ }));
    await waitFor(() => expect(screen.getByTestId('supervisor-login-erro').textContent).toContain('15 minutos'));
  });
  it('mestre (2626) escolhe a empresa; os outros, não', async () => {
    srv.entrarComoSupervisor.mockResolvedValue({ sessionToken: 's' });
    const onEntrou = vi.fn();
    render(<EntrarComoSupervisor aviso={null} onEntrou={onEntrou} />);
    fireEvent.change(screen.getByLabelText('Seu código do painel'), { target: { value: '03' } });
    expect(screen.queryByLabelText('Empresa')).toBeNull();
    fireEvent.change(screen.getByLabelText('Seu código do painel'), { target: { value: '2626' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp-pn' } });
    fireEvent.change(screen.getByLabelText('Senha do painel'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar como supervisor/ }));
    await waitFor(() => expect(onEntrou).toHaveBeenCalled());
    expect(srv.entrarComoSupervisor).toHaveBeenCalledWith('2626', 'segredo', 'emp-pn');
  });
});

describe('conectar ao tablet', () => {
  it('o QR de conectar nasce UMA vez mesmo com o efeito rodando 2 vezes (modo estrito do React)', async () => {
    // Cada QR novo cancela o anterior no servidor: 2 QRs deixavam o celular podendo mostrar o cancelado.
    srv.gerarQrDeConectar.mockResolvedValue(QR);
    srv.estadoDoQr.mockResolvedValue({ status: 'pendente', tipo: 'parear', tablet: null, tentativas: 0 });
    render(<StrictMode><ConectarAoTablet session="s" onConectado={vi.fn()} onSessaoAcabou={vi.fn()} /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId('qr-na-tela').getAttribute('data-qr')).toBe(QR.qrText));
    expect(srv.gerarQrDeConectar).toHaveBeenCalledTimes(1);
  });

  it('mostra o QR e, quando o tablet lê, avisa e segue', async () => {
    srv.gerarQrDeConectar.mockResolvedValue(QR);
    srv.estadoDoQr.mockResolvedValueOnce({ status: 'pendente', tipo: 'parear', tablet: null, tentativas: 0 })
      .mockResolvedValue({ status: 'lido', tipo: 'parear', tablet: 'TABLET GALPAO', tentativas: 0 });
    const onConectado = vi.fn();
    render(<ConectarAoTablet session="s" onConectado={onConectado} onSessaoAcabou={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('qr-na-tela').getAttribute('data-qr')).toBe(QR.qrText));
    await waitFor(() => expect(screen.getByTestId('conectado').textContent).toContain('TABLET GALPAO'), { timeout: 5000 });
    await waitFor(() => expect(onConectado).toHaveBeenCalledWith('TABLET GALPAO'), { timeout: 3000 });
  });
  it('QR vencido → "gerar outro"; sessão que acabou → volta pro login', async () => {
    srv.gerarQrDeConectar.mockResolvedValue(QR);
    srv.estadoDoQr.mockResolvedValue({ status: 'vencido', tipo: 'parear', tablet: null, tentativas: 0 });
    render(<ConectarAoTablet session="s" onConectado={vi.fn()} onSessaoAcabou={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /gerar outro/ })).toBeTruthy());
    cleanup();

    srv.gerarQrDeConectar.mockRejectedValue(new ErroDoSupervisor('acabou', 401, null));
    const onSessaoAcabou = vi.fn();
    render(<ConectarAoTablet session="s" onConectado={vi.fn()} onSessaoAcabou={onSessaoAcabou} />);
    await waitFor(() => expect(onSessaoAcabou).toHaveBeenCalled());
  });
});

describe('cadastrar funcionário novo', () => {
  const preencher = (cpf: string) => {
    fireEvent.change(screen.getByLabelText('Nome completo *'), { target: { value: 'Maria da Silva' } });
    fireEvent.change(screen.getByLabelText('CPF *'), { target: { value: cpf } });
    fireEvent.change(screen.getByLabelText('Telefone *'), { target: { value: '33999990000' } });
    fireEvent.change(screen.getByLabelText('Função *'), { target: { value: 'Separador' } });
  };

  it('CPF com dígito errado nem vai pro servidor', async () => {
    srv.listarFuncoesDoSupervisor.mockResolvedValue({ funcoes: ['Separador'] });
    render(<CadastroPeloTablet session="s" podeRefazer onCadastrado={vi.fn()} onJaExiste={vi.fn()} onVoltar={vi.fn()} onSessaoAcabou={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Função *').tagName).toBe('SELECT'));
    preencher('52998224724');
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(await screen.findByText(/CPF inválido/)).toBeTruthy();
    expect(srv.cadastrarPeloTablet).not.toHaveBeenCalled();
  });
  it('salva e segue pro rosto; CPF já cadastrado oferece refazer o rosto', async () => {
    srv.listarFuncoesDoSupervisor.mockResolvedValue({ funcoes: ['Separador'] });
    srv.cadastrarPeloTablet.mockResolvedValueOnce({ employeeId: 'e-novo', nome: 'Maria da Silva' });
    const onCadastrado = vi.fn();
    render(<CadastroPeloTablet session="s" podeRefazer onCadastrado={onCadastrado} onJaExiste={vi.fn()} onVoltar={vi.fn()} onSessaoAcabou={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Função *').tagName).toBe('SELECT'));
    preencher('52998224725');
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(onCadastrado).toHaveBeenCalledWith({ employeeId: 'e-novo', nome: 'Maria da Silva' }));
    expect(srv.cadastrarPeloTablet).toHaveBeenCalledWith('s', { name: 'Maria da Silva', cpf: '52998224725', phone: '33999990000', functionRole: 'Separador' });
    cleanup();

    srv.cadastrarPeloTablet.mockResolvedValueOnce({ jaExiste: true, employeeId: 'e-velho', nome: 'MARIA ANTIGA' });
    const onJaExiste = vi.fn();
    render(<CadastroPeloTablet session="s" podeRefazer onCadastrado={vi.fn()} onJaExiste={onJaExiste} onVoltar={vi.fn()} onSessaoAcabou={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Função *').tagName).toBe('SELECT'));
    preencher('52998224725');
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Refazer o rosto de MARIA/ }));
    expect(onJaExiste).toHaveBeenCalledWith({ employeeId: 'e-velho', nome: 'MARIA ANTIGA' });
  });
});

describe('o rosto pelo tablet', () => {
  const FOTO = 'data:image/jpeg;base64,AAAA';
  it('foto tirada: o supervisor vê e confirma; depois a batida aparece', async () => {
    srv.gerarQrDoRosto.mockResolvedValue({ ...QR, qrText: 'PT1:R:ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
    srv.estadoDoQr.mockResolvedValue({ status: 'capturado', tipo: 'rosto', tablet: 'T', tentativas: 0, foto: FOTO, qualidade: { resultado: 'ok' } });
    srv.decidirRostoCapturado.mockResolvedValue({ status: 'confirmado' });
    render(<RostoPeloTablet session="s" funcionario={{ employeeId: 'e1', nome: 'MARIA DA SILVA' }} modo="novo" onFim={vi.fn()} onSessaoAcabou={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar o código do rosto/ }));
    await waitFor(() => expect(screen.getByTestId('rosto-capturado')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByRole('img').getAttribute('src')).toBe(FOTO);
    expect(srv.gerarQrDoRosto).toHaveBeenCalledWith('s', 'e1', 'novo', true);

    const vazio = { entry_time: null, entry_1_time: null, exit_1_time: null, entry_2_time: null, exit_2_time: null, exit_time_full: null };
    srv.estadoDoQr.mockResolvedValueOnce({ status: 'confirmado', tipo: 'rosto', tablet: 'T', tentativas: 0, pontoDeHoje: null })
      .mockResolvedValue({ status: 'confirmado', tipo: 'rosto', tablet: 'T', tentativas: 0, pontoDeHoje: { ...vazio, entry_time: '2026-10-07T10:02:00Z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(srv.decidirRostoCapturado).toHaveBeenCalledWith('s', 'qr-1', true);
    await waitFor(() => expect(screen.getByTestId('rosto-ponto').textContent).toBe('Entrada registrada às 07:02'), { timeout: 8000 });
  });
  it('recusado por parecer outra pessoa: diz com quem e oferece gerar outro', async () => {
    srv.gerarQrDoRosto.mockResolvedValue(QR);
    srv.estadoDoQr.mockResolvedValue({ status: 'recusado', tipo: 'rosto', tablet: 'T', tentativas: 0, qualidade: { resultado: 'recusa', parecidoCom: { nome: 'JOAO SOUZA', distancia: 0.3 } } });
    render(<RostoPeloTablet session="s" funcionario={{ employeeId: 'e1', nome: 'MARIA' }} modo="refazer" onFim={vi.fn()} onSessaoAcabou={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar o código do rosto/ }));
    await waitFor(() => expect(screen.getByTestId('rosto-falhou').textContent).toContain('JOAO SOUZA'), { timeout: 5000 });
    expect(screen.getByRole('button', { name: /Gerar outro código/ })).toBeTruthy();
  });
});
