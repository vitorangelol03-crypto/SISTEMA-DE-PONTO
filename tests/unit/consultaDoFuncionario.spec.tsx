/**
 * Consulta do funcionário FORA da empresa — /erros (30/09/2026, roadmap item 5).
 *
 * Decisão do Victor: fora do tablet a pessoa "pode ver tudo mas não bater o ponto". O que trava:
 *  - TODO pedido leva o PIN dela (o servidor passou a conferir: antes, com o CPF de alguém, dava
 *    pra ver os erros e o ponto dele);
 *  - os pontos (resumo do mês + últimos 30 dias) aparecem junto dos erros e recibos;
 *  - 🔴 falha ao buscar os erros NÃO vira "Nenhum erro registrado — continue assim!" (era o que
 *    acontecia: qualquer erro de rede caía no cartão verde);
 *  - não existe botão de bater ponto nesta tela.
 * Servidor falso com 150ms de atraso (o mock instantâneo já escondeu bug neste projeto).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const getEmployeeErrorPeriods = vi.fn();
const getEmployeeErrorsByPeriod = vi.fn();
const getEmployeeAttendanceHistory = vi.fn();
const getMeusRecibos = vi.fn();

vi.mock('../../src/services/database', () => ({
  getEmployeeErrorPeriods: (...a: unknown[]) => getEmployeeErrorPeriods(...a),
  getEmployeeErrorsByPeriod: (...a: unknown[]) => getEmployeeErrorsByPeriod(...a),
  getEmployeeAttendanceHistory: (...a: unknown[]) => getEmployeeAttendanceHistory(...a),
  getMeusRecibos: (...a: unknown[]) => getMeusRecibos(...a),
  getReciboUrl: vi.fn(),
}));

vi.mock('../../src/contexts/useCompany', () => ({
  useCompany: () => ({ company: { id: 'emp-1', display_name: 'Caratinga' } }),
}));

import { EmployeeErrorsView } from '../../src/components/employee-clock/EmployeeErrorsView';

const comAtraso = <T,>(valor: T, ms = 150) => new Promise<T>((resolve) => setTimeout(() => resolve(valor), ms));
const falhaComAtraso = (ms = 150) => new Promise((_, reject) => setTimeout(() => reject(new Error('Acesso negado')), ms));

const PERIODO = { id: 'p-1', start_date: '2026-09-21', end_date: '2026-09-27', status: 'open', label: null };
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  getMeusRecibos.mockImplementation(() => comAtraso([]));
  getEmployeeErrorPeriods.mockImplementation(() => comAtraso([{ period: PERIODO, has_errors: true, total_errors: 2 }]));
  getEmployeeErrorsByPeriod.mockImplementation(() => comAtraso({
    period: PERIODO,
    individual_errors: [{ date: '2026-09-23', error_type: 'quantity', error_count: 2, observations: 'Pacote trocado' }],
    triage_errors: [],
    total_individual: 2,
    total_triage: 0,
  }));
  getEmployeeAttendanceHistory.mockImplementation(() => comAtraso([{
    id: 'a-1', employee_id: 'f-1', date: hojeISO(), status: 'present',
    entry_time: `${hojeISO()}T11:00:00.000Z`, exit_time_full: `${hojeISO()}T20:00:00.000Z`,
    hours_worked: 8, night_hours: 0, night_additional: 0,
  }]));
});

afterEach(() => cleanup());

describe('consulta do funcionário (/erros)', () => {
  it('🎯 todo pedido leva o PIN — erros, pontos e recibos', async () => {
    render(<EmployeeErrorsView employeeId="f-1" pin="4321" />);

    await waitFor(() => expect(screen.getByText('Pacote trocado')).toBeTruthy(), { timeout: 5000 });
    expect(getEmployeeErrorPeriods).toHaveBeenCalledWith('f-1', 'emp-1', { pin: '4321' });
    expect(getEmployeeErrorsByPeriod).toHaveBeenCalledWith('f-1', 'p-1', 'emp-1', { pin: '4321' });
    await waitFor(() => expect(getEmployeeAttendanceHistory).toHaveBeenCalledWith('f-1', 30, 'emp-1', { pin: '4321' }));
    expect(getMeusRecibos).toHaveBeenCalledWith('f-1', 'emp-1', '4321');
  }, 20_000);

  it('mostra os pontos dela (resumo do mês + últimos 30 dias) junto dos erros', async () => {
    render(<EmployeeErrorsView employeeId="f-1" pin="4321" />);

    await waitFor(() => expect(screen.getByText(/Últimos 30 dias/)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText(/Resumo do Mês/)).toBeTruthy();
    const [y, m, d] = hojeISO().split('-');
    expect(screen.getByText(`${d}/${m}/${y}`)).toBeTruthy();
    expect(screen.getAllByText('8h 00min').length).toBeGreaterThan(0);
  }, 20_000);

  it('🔴 erro do servidor ao buscar os erros NÃO vira "Nenhum erro registrado"', async () => {
    getEmployeeErrorPeriods.mockImplementation(() => falhaComAtraso());

    render(<EmployeeErrorsView employeeId="f-1" pin="4321" />);

    await waitFor(() => expect(screen.getByText(/Não consegui carregar seus erros/)).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByText(/Nenhum erro registrado/)).toBeNull();

    // "Tentar de novo" busca outra vez — e, voltando o servidor, os erros aparecem.
    getEmployeeErrorPeriods.mockImplementation(() => comAtraso([{ period: PERIODO, has_errors: true, total_errors: 2 }]));
    fireEvent.click(screen.getAllByRole('button', { name: 'Tentar de novo' })[0]);
    await waitFor(() => expect(screen.getByText('Pacote trocado')).toBeTruthy(), { timeout: 5000 });
  }, 20_000);

  it('pontos que não carregam: avisa, sem esconder os erros', async () => {
    getEmployeeAttendanceHistory.mockImplementation(() => falhaComAtraso());

    render(<EmployeeErrorsView employeeId="f-1" pin="4321" />);

    await waitFor(() => expect(screen.getByTestId('pontos-falhou')).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText('Pacote trocado')).toBeTruthy(), { timeout: 5000 });
  }, 20_000);

  it('não tem botão de bater ponto nesta tela', async () => {
    render(<EmployeeErrorsView employeeId="f-1" pin="4321" />);
    await waitFor(() => expect(screen.getByText(/Últimos 30 dias/)).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByRole('button', { name: /Registrar|Entrada|Saída/i })).toBeNull();
  }, 20_000);
});
