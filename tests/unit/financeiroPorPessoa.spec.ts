/**
 * A conta do dinheiro por pessoa — a MESMA que a tela do Financeiro e os
 * relatórios usam (12/09/2026, quando ela saiu de dentro do `FinancialTab`).
 *
 * O que estes testes guardam são as regras que já estavam provadas em produção
 * e que um "refactor inocente" apagaria sem ninguém ver:
 *
 *  - `payments.total` JÁ vem com o desconto de erros de QUANTIDADE embutido
 *    (botão "Descontar Erros"). Descontar de novo aqui roubaria o funcionário.
 *  - erro de VALOR e triagem NÃO tocam o `total` — são abatidos na exibição.
 *  - desconto maior que o ganho para em zero, nunca fica negativo.
 */

import { describe, it, expect } from 'vitest';
import { agregarFinanceiroPorPessoa } from '../../src/utils/financeiroPorPessoa';
import type { Employee, Payment, Attendance, ErrorRecord } from '../../src/services/database';

const EMP = 'emp-1';

function funcionario(over: Partial<Employee> = {}): Employee {
  return {
    id: EMP,
    name: 'Maria da Silva',
    cpf: '11122233344',
    employment_type: 'Diarista',
    function_role: 'Entregador',
    company_id: 'comp-1',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Employee;
}

function pagamento(over: Partial<Payment> = {}): Payment {
  return {
    id: `pay-${Math.abs(JSON.stringify(over).length)}`,
    employee_id: EMP,
    date: '2026-09-01',
    daily_rate: 100,
    bonus: 0,
    bonus_b: 0,
    bonus_c1: 0,
    bonus_c2: 0,
    total: 100,
    company_id: 'comp-1',
    created_by: '2626',
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
    ...over,
  } as Payment;
}

function ponto(over: Partial<Attendance> = {}): Attendance {
  return {
    id: `att-${over.date ?? 'x'}`,
    employee_id: EMP,
    date: '2026-09-01',
    status: 'present',
    company_id: 'comp-1',
    marked_by: '2626',
    created_at: '2026-09-01T12:00:00Z',
    ...over,
  } as Attendance;
}

function erro(over: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    id: `err-${over.error_type ?? 'q'}`,
    employee_id: EMP,
    date: '2026-09-02',
    error_count: 0,
    error_type: 'quantity',
    error_value: 0,
    company_id: 'comp-1',
    created_by: '2626',
    created_at: '2026-09-02T12:00:00Z',
    ...over,
  } as ErrorRecord;
}

describe('agregarFinanceiroPorPessoa', () => {
  it('soma diárias e bonificações do jeito que o holerite imprime', () => {
    const [r] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [
        pagamento({ date: '2026-09-01', daily_rate: 100, bonus_b: 10, total: 110 }),
        pagamento({ date: '2026-09-02', daily_rate: 100, bonus_c1: 20, total: 120 }),
      ],
      [],
      [],
      [],
    );

    expect(r.totalDailyRate).toBe(200);
    expect(r.totalBonusB).toBe(10);
    expect(r.totalBonusC1).toBe(20);
    expect(r.totalBonusC2).toBe(0);
    expect(r.totalEarnedGross).toBe(230);
  });

  it('NÃO desconta de novo o erro de quantidade — ele já saiu do total lá atrás', () => {
    // 3 pacotes errados já foram abatidos no `total` (100 viraram 85).
    const [r] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [pagamento({ daily_rate: 100, total: 85 })],
      [],
      [erro({ error_type: 'quantity', error_count: 3 })],
      [],
    );

    expect(r.totalErrors).toBe(3);        // aparece no papel
    expect(r.totalEarnedGross).toBe(85);
    expect(r.totalEarned).toBe(85);       // e NÃO 85 - algo
  });

  it('abate erro de VALOR e triagem, que não passam pelo total do pagamento', () => {
    const [r] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [pagamento({ total: 300 })],
      [],
      [erro({ error_type: 'value', error_value: 50 })],
      [{ employee_id: EMP, period_start: '2026-09-01', period_end: '2026-09-07', value_deducted: 30, errors_share: 2 }],
    );

    expect(r.totalErrorValue).toBe(50);
    expect(r.totalTriageDiscount).toBe(30);
    expect(r.totalEarnedGross).toBe(300);
    expect(r.totalEarned).toBe(220);
  });

  it('desconto maior que o ganho para em zero — nunca sai negativo', () => {
    const [r] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [pagamento({ total: 40 })],
      [],
      [erro({ error_type: 'value', error_value: 500 })],
      [],
    );

    expect(r.totalEarned).toBe(0);
  });

  it('conta dias trabalhados e faltas pelo ponto', () => {
    const [r] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [],
      [
        ponto({ date: '2026-09-01', status: 'present' }),
        ponto({ date: '2026-09-02', status: 'present' }),
        ponto({ date: '2026-09-03', status: 'absent' }),
      ],
      [],
      [],
    );

    expect(r.workDays).toBe(2);
    expect(r.absences).toBe(1);
  });

  it('não mistura gente: cada um leva só o que é dele', () => {
    const outro = funcionario({ id: 'emp-2', name: 'João' });
    const [maria, joao] = agregarFinanceiroPorPessoa(
      [funcionario(), outro],
      [pagamento({ total: 100 }), pagamento({ employee_id: 'emp-2', total: 700 })],
      [ponto({ date: '2026-09-01' }), ponto({ employee_id: 'emp-2', date: '2026-09-01' })],
      [erro({ error_type: 'value', error_value: 10 })],
      [],
    );

    expect(maria.totalEarnedGross).toBe(100);
    expect(maria.totalErrorValue).toBe(10);
    expect(joao.totalEarnedGross).toBe(700);
    expect(joao.totalErrorValue).toBe(0);   // o erro era da Maria
    expect(joao.workDays).toBe(1);
  });

  it('quem não tem nada no período aparece zerado, não some da lista', () => {
    const [r] = agregarFinanceiroPorPessoa([funcionario()], [], [], [], []);

    expect(r.employee.name).toBe('Maria da Silva');
    expect(r.workDays).toBe(0);
    expect(r.totalEarned).toBe(0);
    expect(r.payments).toEqual([]);
  });
});
