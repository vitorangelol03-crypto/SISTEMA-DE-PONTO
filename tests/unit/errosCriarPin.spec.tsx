/**
 * /erros — 1º ACESSO SEM PIN (07/10/2026, decisão 12 do plano do tablet sem toque, entrega G): quem
 * foi cadastrado pelo supervisor no tablet nunca digitou um PIN; em vez de "acesse o terminal", cria o
 * PIN ali mesmo e entra. Servidor falso aqui — o de verdade está no E2E 36 (caso 8).
 *
 * Roda com: npx vitest run errosCriarPin
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const srv = {
  getEmployeeByCpf: vi.fn(),
  verifyEmployeePin: vi.fn(),
  setEmployeePin: vi.fn(),
  getCompaniesByEmployeeCpf: vi.fn(),
};
const toastError = vi.fn();

vi.mock('../../src/services/database', () => ({
  getEmployeeByCpf: (...a: unknown[]) => srv.getEmployeeByCpf(...a),
  verifyEmployeePin: (...a: unknown[]) => srv.verifyEmployeePin(...a),
  setEmployeePin: (...a: unknown[]) => srv.setEmployeePin(...a),
  getCompaniesByEmployeeCpf: (...a: unknown[]) => srv.getCompaniesByEmployeeCpf(...a),
}));
vi.mock('../../src/contexts/useCompany', () => ({ useCompany: () => ({ setCompany: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('../../src/components/employee-clock/useAtualizacaoAutomatica', () => ({ useAtualizacaoAutomatica: () => undefined }));
vi.mock('../../src/components/employee-clock/EmployeeErrorsView', () => ({
  EmployeeErrorsView: ({ employeeId, pin }: { employeeId: string; pin: string }) => (
    <div data-testid="painel-de-erros">{`${employeeId}|${pin}`}</div>
  ),
}));
vi.mock('react-hot-toast', () => ({ default: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

import { EmployeeErrorsPage } from '../../src/components/employee-clock/EmployeeErrorsPage';

const EMPRESA = { id: 'emp-1', name: 'Caratinga', display_name: 'Caratinga' };
const SEM_PIN = { id: 'e-1', name: 'MARIA DA SILVA', cpf: '52998224725', company_id: 'emp-1', pin_configured: false };

async function entrarComCpf() {
  fireEvent.change(screen.getByPlaceholderText('000.000.000-00'), { target: { value: '52998224725' } });
  fireEvent.click(screen.getByRole('button', { name: /^Continuar$/ }));
}
const preencher = (novo: string, repete: string) => {
  fireEvent.change(screen.getByLabelText('Nova senha (PIN)'), { target: { value: novo } });
  fireEvent.change(screen.getByLabelText('Repita a senha'), { target: { value: repete } });
};

beforeEach(() => {
  vi.resetAllMocks();
  srv.getCompaniesByEmployeeCpf.mockResolvedValue([EMPRESA]);
});
afterEach(() => cleanup());

describe('/erros — 1º acesso sem PIN', () => {
  it('sem PIN → cria ali mesmo (com a confirmação) e entra com ele', async () => {
    srv.getEmployeeByCpf.mockResolvedValue(SEM_PIN);
    srv.setEmployeePin.mockResolvedValue(undefined);
    render(<EmployeeErrorsPage />);
    await entrarComCpf();
    await waitFor(() => expect(screen.getByTestId('criar-pin')).toBeTruthy());
    expect(screen.getByText(/primeiro acesso/)).toBeTruthy();
    expect(screen.queryByText(/PIN não configurado/)).toBeNull(); // o recado antigo ("vá ao terminal") sumiu

    const criar = screen.getByRole('button', { name: 'Criar senha e entrar' }) as HTMLButtonElement;
    preencher('123', '123');
    expect(criar.disabled).toBe(true); // menos de 4 números
    preencher('1234', '1243');
    fireEvent.click(criar);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'As duas senhas não conferem. Digite de novo.');
    expect(srv.setEmployeePin).not.toHaveBeenCalled();

    preencher('1234', '1234');
    fireEvent.click(criar);
    await waitFor(() => expect(screen.getByTestId('painel-de-erros').textContent).toBe('e-1|1234'));
    expect(srv.setEmployeePin).toHaveBeenCalledWith('e-1', '1234');
  });

  it('o servidor diz que JÁ TEM PIN (criado agora por outra tela) → pede o PIN, não cria outro', async () => {
    srv.getEmployeeByCpf.mockResolvedValue(SEM_PIN);
    srv.setEmployeePin.mockRejectedValue(new Error('Este funcionário já tem PIN. Para trocar, peça ao responsável para resetar o PIN.'));
    render(<EmployeeErrorsPage />);
    await entrarComCpf();
    await waitFor(() => expect(screen.getByTestId('criar-pin')).toBeTruthy());
    preencher('4321', '4321');
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    await waitFor(() => expect(screen.getByText(/Digite seu PIN/)).toBeTruthy());
    expect(toastError).toHaveBeenCalledWith('Você já tem um PIN. Digite o seu PIN para entrar.');
    expect(screen.queryByTestId('painel-de-erros')).toBeNull();
  });

  it('sem internet ao salvar → avisa e continua na tela de criar', async () => {
    srv.getEmployeeByCpf.mockResolvedValue(SEM_PIN);
    srv.setEmployeePin.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<EmployeeErrorsPage />);
    await entrarComCpf();
    await waitFor(() => expect(screen.getByTestId('criar-pin')).toBeTruthy());
    preencher('4321', '4321');
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu pra salvar o PIN. Confira a internet e tente de novo.');
    expect(screen.getByTestId('criar-pin')).toBeTruthy();
  });

  it('quem JÁ tem PIN continua como sempre: digita o PIN (nada de criar)', async () => {
    srv.getEmployeeByCpf.mockResolvedValue({ ...SEM_PIN, pin_configured: true });
    render(<EmployeeErrorsPage />);
    await entrarComCpf();
    await waitFor(() => expect(screen.getByText(/Digite seu PIN/)).toBeTruthy());
    expect(screen.queryByTestId('criar-pin')).toBeNull();
  });
});
