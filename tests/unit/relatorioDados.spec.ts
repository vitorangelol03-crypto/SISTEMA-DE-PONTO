/**
 * Os DADOS dos três relatórios (ponto · financeiro · geral), pedidos pelo Victor
 * em 12/09/2026.
 *
 * O que estes testes guardam:
 *  - cada tipo leva o que prometeu (o de ponto não pode vazar dinheiro; o
 *    financeiro não carrega o dia a dia);
 *  - a composição do pagamento FECHA: proventos − descontos = o líquido que a
 *    tela do Financeiro mostra;
 *  - o desconto que já saiu do total lá atrás aparece como linha (senão o papel
 *    não fecha e a pessoa não sabe para onde foi o dinheiro);
 *  - quem não teve nada no período não vira folha em branco.
 */

import { describe, it, expect } from 'vitest';
import { montarRelatorio, montarLinhasDeValor } from '../../src/utils/relatorios/relatorioDados';
import { agregarFinanceiroPorPessoa } from '../../src/utils/financeiroPorPessoa';
import type { Attendance, Employee, Company, Payment, ErrorRecord } from '../../src/services/database';

const PERIODO = { inicio: '2026-08-01', fim: '2026-08-07', rotulo: 'Semana 01/08 a 07/08' };

function funcionario(over: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    name: 'Ana Paula',
    cpf: '12345678901',
    pis: '12345678910',
    badge_number: '0001',
    function_role: 'Entregador',
    schedule_type: 'Normal',
    employment_type: 'Diarista',
    company_id: 'comp-1',
    expected_schedule: [0, 480, 480, 480, 480, 480, 240],
    ...over,
  } as Employee;
}

function empresa(): Company {
  return {
    id: 'comp-1',
    legal_name: 'EMPRESA TESTE LTDA',
    display_name: 'Empresa Teste',
    cnpj: '12345678000195',
    logo_url: null,
    default_schedule: [0, 480, 480, 480, 480, 480, 240],
  } as Company;
}

function pagamento(over: Partial<Payment> = {}): Payment {
  return {
    id: `pay-${over.date ?? 'x'}-${over.employee_id ?? 'emp-1'}`,
    employee_id: 'emp-1',
    date: '2026-08-03',
    daily_rate: 100,
    bonus: 0,
    bonus_b: 0,
    bonus_c1: 0,
    bonus_c2: 0,
    total: 100,
    company_id: 'comp-1',
    created_by: '2626',
    created_at: '2026-08-03T12:00:00Z',
    updated_at: '2026-08-03T12:00:00Z',
    ...over,
  } as Payment;
}

function ponto(over: Partial<Attendance> = {}): Attendance {
  return {
    id: `att-${over.date ?? 'x'}-${over.employee_id ?? 'emp-1'}`,
    employee_id: 'emp-1',
    date: '2026-08-03',
    status: 'present',
    entry_time: '2026-08-03T11:00:00Z',   // 08:00 BRT
    exit_time_full: '2026-08-03T20:00:00Z', // 17:00 BRT
    hours_worked: 8,
    night_hours: 0,
    company_id: 'comp-1',
    marked_by: '2626',
    created_at: '2026-08-03T12:00:00Z',
    ...over,
  } as Attendance;
}

function montar(tipo: 'ponto' | 'financeiro' | 'geral', args: {
  employees?: Employee[];
  payments?: Payment[];
  attendances?: Attendance[];
  errors?: ErrorRecord[];
  triagem?: Array<{ employee_id: string; period_start: string; period_end: string; value_deducted: number; errors_share: number }>;
} = {}) {
  const employees = args.employees ?? [funcionario()];
  const attendances = args.attendances ?? [ponto()];
  const financeiro = agregarFinanceiroPorPessoa(
    employees,
    args.payments ?? [pagamento()],
    attendances,
    args.errors ?? [],
    args.triagem ?? [],
  );
  return montarRelatorio({
    tipo,
    company: empresa(),
    periodo: PERIODO,
    financeiro,
    attendances,
    emissionDate: '2026-09-12',
  });
}

describe('montarRelatorio — o que cada tipo leva', () => {
  it('o de PONTO traz o dia a dia e NENHUM valor em dinheiro', () => {
    const r = montar('ponto');
    const pessoa = r.pessoas[0]!;

    expect(pessoa.espelho).not.toBeNull();
    expect(pessoa.espelho!.rows.length).toBe(7);          // a semana inteira
    expect(pessoa.linhas).toEqual([]);
    expect(pessoa.totalLiquido).toBe(0);
    expect(r.totais.liquido).toBe(0);
  });

  it('o FINANCEIRO traz o dinheiro e o mínimo de ponto (dias), sem o dia a dia', () => {
    const r = montar('financeiro');
    const pessoa = r.pessoas[0]!;

    expect(pessoa.espelho).toBeNull();
    expect(pessoa.resumoPonto!.diasTrabalhados).toBe(1);
    expect(pessoa.linhas.length).toBeGreaterThan(0);
    expect(pessoa.totalLiquido).toBe(100);
  });

  it('o GERAL traz os dois inteiros', () => {
    const r = montar('geral');
    const pessoa = r.pessoas[0]!;

    expect(pessoa.espelho).not.toBeNull();
    expect(pessoa.resumoPonto!.minutosDiurnos).toBeGreaterThan(0);
    expect(pessoa.linhas.length).toBeGreaterThan(0);
    expect(pessoa.totalLiquido).toBe(100);
  });
});

describe('montarRelatorio — quem entra na folha', () => {
  it('quem não teve NADA no período fica de fora (nada de folha em branco)', () => {
    const r = montar('geral', {
      employees: [funcionario(), funcionario({ id: 'emp-2', name: 'Bruno' })],
      payments: [pagamento()],
      attendances: [ponto()],
    });

    expect(r.pessoas.map(p => p.employee.name)).toEqual(['Ana Paula']);
    expect(r.totais.pessoas).toBe(1);
  });

  it('quem só bateu ponto entra, mesmo sem ter recebido nada', () => {
    const r = montar('geral', {
      employees: [funcionario({ id: 'emp-2', name: 'Bruno' })],
      payments: [],
      attendances: [ponto({ employee_id: 'emp-2' })],
    });

    expect(r.pessoas.length).toBe(1);
    expect(r.pessoas[0]!.totalLiquido).toBe(0);
  });

  it('sai em ordem alfabética — é como se procura alguém num maço de folhas', () => {
    const r = montar('geral', {
      employees: [
        funcionario({ id: 'emp-1', name: 'Zilda' }),
        funcionario({ id: 'emp-2', name: 'Ana' }),
        funcionario({ id: 'emp-3', name: 'Márcio' }),
      ],
      payments: [pagamento({ employee_id: 'emp-1' }), pagamento({ employee_id: 'emp-2' }), pagamento({ employee_id: 'emp-3' })],
      attendances: [ponto({ employee_id: 'emp-1' }), ponto({ employee_id: 'emp-2' }), ponto({ employee_id: 'emp-3' })],
    });

    expect(r.pessoas.map(p => p.employee.name)).toEqual(['Ana', 'Márcio', 'Zilda']);
  });
});

describe('montarLinhasDeValor — a composição tem que FECHAR', () => {
  it('diárias e bonificações viram linhas com quantidade', () => {
    const [d] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [
        pagamento({ date: '2026-08-03', daily_rate: 100, bonus_b: 10, total: 110 }),
        pagamento({ date: '2026-08-04', daily_rate: 100, total: 100 }),
      ],
      [], [], [],
    );
    const linhas = montarLinhasDeValor(d);

    const diarias = linhas.find(l => l.rotulo === 'Diárias')!;
    expect(diarias.quantidade).toBe(2);
    expect(diarias.valor).toBe(200);

    const bonusB = linhas.find(l => l.rotulo === 'Bonificação B')!;
    expect(bonusB.quantidade).toBe(1);
    expect(bonusB.valor).toBe(10);
  });

  it('o desconto que JÁ saiu do total aparece como linha — senão o papel não fecha', () => {
    // 100 de diária, total gravado 85: 15 saíram no botão "Descontar Erros".
    const [d] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [pagamento({ daily_rate: 100, total: 85 })],
      [],
      [{ id: 'e1', employee_id: 'emp-1', date: '2026-08-03', error_count: 3, error_type: 'quantity', error_value: 0, company_id: 'comp-1', created_by: '2626', created_at: '' } as ErrorRecord],
      [],
    );
    const linhas = montarLinhasDeValor(d);

    const desconto = linhas.find(l => l.rotulo === 'Desconto por pacotes com erro')!;
    expect(desconto.valor).toBe(15);
    expect(desconto.quantidade).toBe(3);

    const proventos = linhas.filter(l => l.natureza === 'provento').reduce((s, l) => s + l.valor, 0);
    const descontos = linhas.filter(l => l.natureza === 'desconto').reduce((s, l) => s + l.valor, 0);
    expect(proventos - descontos).toBe(d.totalEarned);   // FECHA
  });

  it('pacote errado que não foi descontado aparece com valor zero, não some do papel', () => {
    const [d] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [pagamento({ daily_rate: 100, total: 100 })],
      [],
      [{ id: 'e1', employee_id: 'emp-1', date: '2026-08-03', error_count: 4, error_type: 'quantity', error_value: 0, company_id: 'comp-1', created_by: '2626', created_at: '' } as ErrorRecord],
      [],
    );
    const linhas = montarLinhasDeValor(d);
    const linha = linhas.find(l => l.rotulo === 'Pacotes com erro (sem desconto)')!;

    expect(linha.quantidade).toBe(4);
    expect(linha.valor).toBe(0);
  });

  it('banco de horas: crédito é provento, débito é desconto', () => {
    const [credito] = agregarFinanceiroPorPessoa(
      [funcionario()], [pagamento({ bank_hours_amount: 25, total: 125 })], [], [], [],
    );
    const [debito] = agregarFinanceiroPorPessoa(
      [funcionario()], [pagamento({ bank_hours_amount: -40, total: 60 })], [], [], [],
    );

    expect(montarLinhasDeValor(credito).find(l => l.rotulo.includes('Banco de horas'))).toMatchObject({
      rotulo: 'Banco de horas (crédito)', natureza: 'provento', valor: 25,
    });
    expect(montarLinhasDeValor(debito).find(l => l.rotulo.includes('Banco de horas'))).toMatchObject({
      rotulo: 'Banco de horas (débito)', natureza: 'desconto', valor: 40,
    });
  });

  it('erro em valor e triagem entram como desconto, com a quantidade de pacotes da triagem', () => {
    const [d] = agregarFinanceiroPorPessoa(
      [funcionario()],
      [pagamento({ total: 300 })],
      [],
      [{ id: 'e1', employee_id: 'emp-1', date: '2026-08-03', error_count: 0, error_type: 'value', error_value: 50, company_id: 'comp-1', created_by: '2626', created_at: '' } as ErrorRecord],
      [{ employee_id: 'emp-1', period_start: '2026-08-01', period_end: '2026-08-07', value_deducted: 30, errors_share: 2 }],
    );
    const linhas = montarLinhasDeValor(d);

    expect(linhas.find(l => l.rotulo === 'Desconto por erro em valor')!.valor).toBe(50);
    expect(linhas.find(l => l.rotulo === 'Desconto da triagem')).toMatchObject({ valor: 30, quantidade: 2 });
  });

  it('quem não recebeu nada não gera linha nenhuma (papel limpo, não zerado)', () => {
    const [d] = agregarFinanceiroPorPessoa([funcionario()], [], [], [], []);
    expect(montarLinhasDeValor(d)).toEqual([]);
  });
});

describe('montarRelatorio — os totais do fim', () => {
  it('somam as pessoas, os dias e o dinheiro', () => {
    const r = montar('geral', {
      employees: [funcionario(), funcionario({ id: 'emp-2', name: 'Bruno' })],
      payments: [
        pagamento({ employee_id: 'emp-1', total: 100 }),
        pagamento({ employee_id: 'emp-2', date: '2026-08-04', total: 250 }),
      ],
      attendances: [
        ponto({ employee_id: 'emp-1' }),
        ponto({ employee_id: 'emp-2', date: '2026-08-04' }),
        ponto({ employee_id: 'emp-2', date: '2026-08-05', status: 'absent', entry_time: null, exit_time_full: null, hours_worked: null }),
      ],
    });

    expect(r.totais.pessoas).toBe(2);
    expect(r.totais.diasTrabalhados).toBe(2);
    expect(r.totais.faltas).toBe(1);
    expect(r.totais.liquido).toBe(350);
    expect(r.totais.minutosTrabalhados).toBeGreaterThan(0);
  });
});
