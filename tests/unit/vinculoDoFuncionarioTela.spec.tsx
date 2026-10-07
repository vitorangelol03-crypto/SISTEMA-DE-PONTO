/**
 * "Funcionário vinculado" na tela de Permissões (07/10/2026, plano do tablet sem toque, entrega C).
 * O banco é falso aqui (quem decide de verdade está provado no E2E 135, contra o banco real).
 *
 * Roda com: npx vitest run vinculoDoFuncionarioTela
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const getFuncionariosParaVinculo = vi.fn();
const linkUserEmployee = vi.fn();

vi.mock('../../src/services/database', () => ({
  getFuncionariosParaVinculo: (...a: unknown[]) => getFuncionariosParaVinculo(...a),
  linkUserEmployee: (...a: unknown[]) => linkUserEmployee(...a),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { VinculoDoFuncionario } from '../../src/components/permissions/VinculoDoFuncionario';

const LISTA = [
  { id: 'e1', name: 'MARIA APARECIDA', cpf: '111.222.333-44', termination_date: null, registration_status: 'approved' },
  { id: 'e2', name: 'MARIA RECUSADA', cpf: '555.666.777-88', termination_date: null, registration_status: 'rejected' },
  { id: 'e3', name: 'MARIA DESLIGADA', cpf: '999.888.777-66', termination_date: '2020-01-01', registration_status: 'approved' },
  { id: 'e4', name: 'JOÃO', cpf: null, termination_date: null, registration_status: 'pending' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getFuncionariosParaVinculo.mockResolvedValue(LISTA);
});
afterEach(() => cleanup());

describe('Funcionário vinculado', () => {
  it('lista os funcionários DA EMPRESA DO USUÁRIO e só mostra quem pode ser ligado', async () => {
    render(<VinculoDoFuncionario userId="03" companyId="emp-do-usuario" vinculo={null} onMudou={vi.fn()} />);
    expect(screen.getByText(/Carregando funcionários/)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Buscar funcionário pelo nome')).toBeTruthy());
    expect(getFuncionariosParaVinculo).toHaveBeenCalledWith('emp-do-usuario');
    expect(screen.getByTestId('vinculo-atual').textContent).toBe('Sem vínculo.');

    fireEvent.change(screen.getByLabelText('Buscar funcionário pelo nome'), { target: { value: 'maria' } });
    const opcoes = screen.getByTestId('vinculo-opcoes');
    expect(opcoes.textContent).toContain('MARIA APARECIDA');
    expect(opcoes.textContent).toContain('•••3344'); // só o final do CPF
    expect(opcoes.textContent).not.toContain('RECUSADA');
    expect(opcoes.textContent).not.toContain('DESLIGADA');
  });

  it('"Ligar" salva pelo banco e avisa o pai', async () => {
    linkUserEmployee.mockResolvedValue('e1');
    const onMudou = vi.fn();
    render(<VinculoDoFuncionario userId="03" companyId="c" vinculo={null} onMudou={onMudou} />);
    await waitFor(() => expect(screen.getByLabelText('Buscar funcionário pelo nome')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Buscar funcionário pelo nome'), { target: { value: 'aparecida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(onMudou).toHaveBeenCalledWith({ id: 'e1', nome: 'MARIA APARECIDA' }));
    expect(linkUserEmployee).toHaveBeenCalledWith('03', 'e1');
  });

  it('o banco recusa: o MOTIVO dele aparece na tela e nada muda', async () => {
    linkUserEmployee.mockRejectedValue(new Error('Esse funcionário já está ligado ao usuário 02.'));
    const onMudou = vi.fn();
    render(<VinculoDoFuncionario userId="03" companyId="c" vinculo={null} onMudou={onMudou} />);
    await waitFor(() => expect(screen.getByLabelText('Buscar funcionário pelo nome')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Buscar funcionário pelo nome'), { target: { value: 'joão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(screen.getByTestId('vinculo-recusa').textContent).toBe('Esse funcionário já está ligado ao usuário 02.'));
    expect(onMudou).not.toHaveBeenCalled();
  });

  it('com vínculo: mostra quem é e "Remover vínculo" desfaz (null)', async () => {
    linkUserEmployee.mockResolvedValue(null);
    const onMudou = vi.fn();
    render(<VinculoDoFuncionario userId="03" companyId="c" vinculo={{ id: 'e1', nome: 'MARIA APARECIDA' }} onMudou={onMudou} />);
    await waitFor(() => expect(screen.getByTestId('vinculo-atual').textContent).toContain('•••3344'));
    expect(screen.getByTestId('vinculo-atual').textContent).toContain('MARIA APARECIDA');
    fireEvent.click(screen.getByRole('button', { name: /Remover vínculo/ }));
    await waitFor(() => expect(onMudou).toHaveBeenCalledWith(null));
    expect(linkUserEmployee).toHaveBeenCalledWith('03', null);
  });

  it('empresa sem funcionários e lista que não carregou: dizem o que houve', async () => {
    getFuncionariosParaVinculo.mockResolvedValueOnce([]);
    render(<VinculoDoFuncionario userId="03" companyId="c" vinculo={null} onMudou={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Nenhum funcionário nesta empresa.')).toBeTruthy());
    cleanup();

    getFuncionariosParaVinculo.mockRejectedValueOnce(new Error('falhou a rede'));
    render(<VinculoDoFuncionario userId="03" companyId="c" vinculo={null} onMudou={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('vinculo-erro-lista').textContent).toContain('falhou a rede'));
  });
});
