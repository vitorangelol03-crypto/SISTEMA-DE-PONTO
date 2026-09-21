import { describe, it, expect } from 'vitest';
import {
  CONFIGURACAO_DA_FOLHA_PADRAO,
  calcularFolha,
  ehMesInteiro,
} from '../../src/utils/folha/folhaCalc';
import { folhaDaPessoa } from '../../src/utils/folha/folhaDaPessoa';
import { TABELA_INSS_2026, TABELA_IRRF_2026 } from '../../src/utils/folha/impostos';
import { linhasDoRecibo, totaisDoRecibo, type HoleriteData } from '../../src/utils/holeritePdf';
import { montarLinhasDeValor, montarRelatorio } from '../../src/utils/relatorios/relatorioDados';
import { agregarFinanceiroPorPessoa } from '../../src/utils/financeiroPorPessoa';
import type { Employee, Company, Payment } from '../../src/services/database';

/**
 * A FOLHA CHEGANDO NO PAPEL E NO RELATÓRIO (19/09/2026).
 *
 * 🔴 O FURO QUE ESTES TESTES FECHAM. Até 18/09 o recibo jogava TODAS as linhas da folha
 * na coluna de proventos — inclusive as que são desconto. Um recibo de R$ 1.700 com uma
 * falta e INSS imprimia:
 *
 *     Faltas (1,00)          +  R$   0,00
 *     INSS (9,00%)           +  R$   0,00
 *     TOTAL DE DESCONTOS       -R$   0,00
 *     VALOR LÍQUIDO A RECEBER   R$   0,00     (a conta da folha dava R$ 1.519,75)
 *
 * Os 114 testes da folha provavam o CÁLCULO, que estava certo; os 9 do recibo só usavam
 * folha sem falta e sem imposto, onde só existe provento. Ninguém testava o papel com
 * desconto. Por isso os testes daqui atravessam as três camadas — cálculo, recibo e
 * relatório — em vez de parar no cálculo.
 */

const TABELAS = { inss: TABELA_INSS_2026, irrf: TABELA_IRRF_2026, confirmadas: true };

/** Mensalista de R$ 1.700 com uma falta sem atestado em julho. */
const folhaComDesconto = () =>
  calcularFolha({
    ficha: { salarioMensal: 1700, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao: '2026-01-02' },
    config: CONFIGURACAO_DA_FOLHA_PADRAO,
    ano: 2026,
    mes: 7,
    adicionalNoturno: 0,
    faltasInjustificadas: ['2026-07-10'],
    tabelaInss: TABELA_INSS_2026,
    tabelasConfirmadas: true,
  });

const BASE_DIARISTA: HoleriteData = {
  company: { name: 'Empresa' },
  employee: { name: 'Fulano', cpf: null },
  period: { start: '2026-07-01', end: '2026-07-31' },
  payments: [
    { date: '2026-07-01', dailyRate: 100, bonusB: 0, bonusC1: 0, bonusC2: 0 },
    { date: '2026-07-02', dailyRate: 100, bonusB: 10, bonusC1: 0, bonusC2: 0 },
  ],
  errorDiscount: 0,
  triageDiscount: 0,
  totalDailyRate: 200,
  totalBonusB: 10,
  totalBonusC1: 0,
  totalBonusC2: 0,
  totalGross: 210,
  totalNet: 210,
};

// ════════════════════════════════════════════════════════════════════════════
describe('ehMesInteiro — a folha só entra em mês fechado', () => {
  it('reconhece o mês inteiro, inclusive os de 28, 30 e 31 dias', () => {
    expect(ehMesInteiro('2026-09-01', '2026-09-30')).toBe(true);
    expect(ehMesInteiro('2026-07-01', '2026-07-31')).toBe(true);
    expect(ehMesInteiro('2026-02-01', '2026-02-28')).toBe(true);
  });

  it('fevereiro de ano bissexto exige o dia 29', () => {
    expect(ehMesInteiro('2028-02-01', '2028-02-29')).toBe(true);
    expect(ehMesInteiro('2028-02-01', '2028-02-28')).toBe(false);
  });

  it('recusa semana, quinzena, mês que começa no dia 2 e recorte de dois meses', () => {
    expect(ehMesInteiro('2026-09-01', '2026-09-07')).toBe(false);
    expect(ehMesInteiro('2026-09-01', '2026-09-15')).toBe(false);
    expect(ehMesInteiro('2026-09-16', '2026-09-30')).toBe(false);
    expect(ehMesInteiro('2026-09-02', '2026-09-30')).toBe(false);
    expect(ehMesInteiro('2026-09-01', '2026-10-31')).toBe(false);
    expect(ehMesInteiro('2026-01-01', '2026-12-31')).toBe(false);
  });

  it('data inválida não vira "mês inteiro" por acidente', () => {
    expect(ehMesInteiro('', '')).toBe(false);
    expect(ehMesInteiro('xx', '2026-09-30')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('folhaDaPessoa — quem tem folha e quando', () => {
  const entrada = (ficha: Record<string, unknown>, inicio = '2026-07-01', fim = '2026-07-31') => ({
    ficha: { id: 'e1', ...ficha },
    inicio,
    fim,
    config: CONFIGURACAO_DA_FOLHA_PADRAO,
    ferias: [],
    tabelas: TABELAS,
    horasNoturnas: 0,
    faltasInjustificadas: [],
  });

  it('diarista não tem folha, nem com salário digitado por engano', () => {
    const r = folhaDaPessoa(entrada({ employment_type: 'Diarista', monthly_salary: 1700 }));
    expect(r.folha).toBeUndefined();
    expect(r.foraDoMes).toBe(false);
  });

  it('carteira assinada SEM salário não tem folha — é o caso das 98 fichas de hoje', () => {
    const r = folhaDaPessoa(entrada({ employment_type: 'Carteira Assinada', monthly_salary: 0 }));
    expect(r.folha).toBeUndefined();
    expect(r.foraDoMes).toBe(false);
  });

  it('carteira assinada com salário, em mês fechado, tem folha', () => {
    const r = folhaDaPessoa(entrada({ employment_type: 'Carteira Assinada', monthly_salary: 1700 }));
    expect(r.folha?.salarioDoMes).toBe(1700);
    expect(r.foraDoMes).toBe(false);
  });

  it('numa SEMANA a folha não sai, e o aviso fica ligado', () => {
    const r = folhaDaPessoa(
      entrada({ employment_type: 'Carteira Assinada', monthly_salary: 1700 }, '2026-07-01', '2026-07-07'),
    );
    expect(r.folha).toBeUndefined();
    expect(r.foraDoMes).toBe(true);
  });

  it('quem não é mensalista NÃO recebe o aviso numa semana — não é ausência, é inexistência', () => {
    const r = folhaDaPessoa(entrada({ employment_type: 'Diarista' }, '2026-07-01', '2026-07-07'));
    expect(r.foraDoMes).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('recibo — os descontos da folha vão pro lado certo', () => {
  const mensalista: HoleriteData = {
    ...BASE_DIARISTA,
    payments: [],
    totalDailyRate: 0,
    totalBonusB: 0,
    totalGross: 0,
    totalNet: 0,
    folha: folhaComDesconto(),
  };

  it('falta e INSS saem como DESCONTO, com o valor real', () => {
    const { descontos } = linhasDoRecibo(mensalista);
    // A faixa impressa é a que a base ALCANÇOU, não a que a pessoa paga no total: a base
    // aqui é 1.643,33 (salário menos a falta) e a 1ª faixa acaba em 1.621,00 — então ela
    // encosta na de 9%, como a Camila do recibo real (base 1.772,87 → "9,00%"). O INSS
    // efetivo é bem menor: R$ 123,57 são 7,52% de 1.643,33.
    // 21/09: era 123,58 pela soma faixa a faixa; com a parcela a deduzir oficial
    // (1.643,33 × 9% − 24,32) dá 123,5797 → 123,57. É o método que reproduz os 11
    // recibos reais da contabilidade.
    expect(descontos.map(l => [l[0], l[1]])).toEqual([
      ['Faltas (1,00)', '-'],
      ['INSS (9,00%)', '-'],
    ]);
    // R$ 1.700 ÷ 30 = R$ 56,66 por dia; a falta tira um dia.
    expect(descontos[0][2]).toContain('56,67');
    expect(descontos[1][2]).toContain('123,57');
  });

  it('nenhuma linha de desconto aparece nos proventos valendo R$ 0,00 (o furo de 18/09)', () => {
    const { proventos } = linhasDoRecibo(mensalista);
    expect(proventos.map(l => l[0])).toEqual(['Salário mensalista (30,00)']);
    expect(proventos.some(l => l[2].includes('0,00') && l[2] === 'R$ 0,00')).toBe(false);
  });

  it('o papel FECHA: proventos − descontos = líquido', () => {
    const t = totaisDoRecibo(mensalista);
    expect(Number((t.totalProventos - t.totalDescontos).toFixed(2))).toBe(t.liquido);
    expect(t.liquido).toBe(mensalista.folha!.liquido);
    expect(t.totalDescontos).toBeGreaterThan(0);
  });

  it('quem tem salário E diária: o líquido soma as duas metades e o papel fecha', () => {
    const misto: HoleriteData = {
      ...BASE_DIARISTA,
      quantityErrorDiscount: 8,
      totalGross: 202,
      totalNet: 202,
      folha: folhaComDesconto(),
    };
    const t = totaisDoRecibo(misto);
    // Proventos listados: salário 1.700 + diárias 200 + bônus 10.
    expect(t.totalProventos).toBe(1910);
    expect(Number((t.totalProventos - t.totalDescontos).toFixed(2))).toBe(t.liquido);
    expect(t.liquido).toBe(Number((202 + misto.folha!.liquido).toFixed(2)));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('recibo do diarista — NÃO mudou nem uma linha', () => {
  it('as linhas continuam as mesmas', () => {
    const { proventos, descontos } = linhasDoRecibo(BASE_DIARISTA);
    expect(proventos.map(l => l[0])).toEqual(['Diárias (2 dias)', 'Bonificação B (1×)']);
    expect(descontos).toEqual([]);
  });

  it('os totais continuam os mesmos, e o líquido é o pagamento gravado', () => {
    const t = totaisDoRecibo(BASE_DIARISTA);
    expect(t.totalProventos).toBe(210);
    expect(t.totalDescontos).toBe(0);
    expect(t.liquido).toBe(210);
  });

  it('com desconto de erro e triagem, o papel fecha como fechava desde 04/08', () => {
    const comDescontos: HoleriteData = {
      ...BASE_DIARISTA,
      quantityErrorDiscount: 5,
      errorDiscount: 10,
      triageDiscount: 3,
      totalGross: 205,
      totalNet: 192,
    };
    const t = totaisDoRecibo(comDescontos);
    expect(t.totalProventos - t.totalDescontos).toBe(t.liquido);
    expect(t.liquido).toBe(192);
    expect(linhasDoRecibo(comDescontos).descontos.map(l => l[0])).toEqual([
      'Desconto por erros de quantidade',
      'Desconto de Erros',
      'Desconto de Triagem',
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
const PERIODO_MES = { inicio: '2026-07-01', fim: '2026-07-31', rotulo: 'Julho/2026' };

function funcionario(over: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    name: 'Ana Paula',
    cpf: '12345678901',
    function_role: 'Triagem',
    employment_type: 'Diarista',
    company_id: 'comp-1',
    expected_schedule: [0, 480, 480, 480, 480, 480, 240],
    ...over,
  } as Employee;
}

const empresa = () => ({ id: 'comp-1', display_name: 'Empresa Teste' } as Company);

const pagamento = (over: Partial<Payment> = {}): Payment => ({
  id: 'pay-1',
  employee_id: 'emp-1',
  date: '2026-07-03',
  daily_rate: 100,
  bonus_b: 0,
  bonus_c1: 0,
  bonus_c2: 0,
  total: 100,
  company_id: 'comp-1',
  ...over,
} as Payment);

describe('relatório — a folha entra como mais linhas', () => {
  const dados = (emp: Employee, pagamentos: Payment[] = []) =>
    agregarFinanceiroPorPessoa([emp], pagamentos, [], [], []);

  it('sem folha, as linhas do diarista são exatamente as de antes', () => {
    const [d] = dados(funcionario(), [pagamento()]);
    expect(montarLinhasDeValor(d)).toEqual(montarLinhasDeValor(d, undefined));
    expect(montarLinhasDeValor(d).map(l => l.rotulo)).toEqual(['Diárias']);
  });

  it('com folha: salário na frente, descontos atrás e o FGTS como custo da empresa', () => {
    const [d] = dados(funcionario());
    const linhas = montarLinhasDeValor(d, folhaComDesconto());

    expect(linhas.map(l => [l.rotulo, l.natureza])).toEqual([
      ['Salário mensalista', 'provento'],
      ['Faltas', 'desconto'],
      ['INSS', 'desconto'],
      ['FGTS depositado', 'custo-empresa'],
    ]);
  });

  it('a quantidade sai como número quando é dia/cota, e vazia quando é porcentagem', () => {
    const [d] = dados(funcionario());
    const linhas = montarLinhasDeValor(d, folhaComDesconto());
    expect(linhas.find(l => l.rotulo === 'Salário mensalista')?.quantidade).toBe(30);
    expect(linhas.find(l => l.rotulo === 'Faltas')?.quantidade).toBe(1);
    // "9,00%" não é quantidade — vira null em vez de NaN na planilha.
    expect(linhas.find(l => l.rotulo === 'INSS')?.quantidade).toBeNull();
  });

  it('o FGTS não entra em provento nem em desconto — não mexe no líquido', () => {
    const [d] = dados(funcionario());
    const folha = folhaComDesconto();
    const linhas = montarLinhasDeValor(d, folha);
    const fgts = linhas.find(l => l.rotulo === 'FGTS depositado')!;
    expect(fgts.valor).toBe(folha.valorFgts);
    expect(fgts.valor).toBeGreaterThan(0);
    expect(linhas.filter(l => l.natureza === 'provento').reduce((s, l) => s + l.valor, 0))
      .toBe(folha.totalProventos);
  });
});

describe('relatório montado — o líquido soma as duas metades', () => {
  const mensalista = funcionario({
    id: 'emp-1',
    employment_type: 'Carteira Assinada',
    monthly_salary: 1700,
  } as Partial<Employee>);

  const montar = (inicio: string, fim: string, pagamentos: Payment[] = []) => {
    const financeiro = agregarFinanceiroPorPessoa([mensalista], pagamentos, [], [], []);
    const folhaPorPessoa = new Map([
      ['emp-1', folhaDaPessoa({
        ficha: mensalista,
        inicio,
        fim,
        config: CONFIGURACAO_DA_FOLHA_PADRAO,
        ferias: [],
        tabelas: TABELAS,
        horasNoturnas: 0,
        faltasInjustificadas: [],
      })],
    ]);
    return montarRelatorio({
      tipo: 'financeiro',
      company: empresa(),
      periodo: { inicio, fim, rotulo: 'x' },
      financeiro,
      attendances: [],
      folhaPorPessoa,
    });
  };

  it('quem só tem salário entra no relatório mesmo sem ponto e sem pagamento', () => {
    const r = montar('2026-07-01', '2026-07-31');
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0].totalLiquido).toBe(r.pessoas[0].folha!.liquido);
    expect(r.pessoas[0].folhaForaDoMes).toBe(false);
  });

  it('salário + diária: o líquido é a soma, e fecha com proventos − descontos', () => {
    const r = montar('2026-07-01', '2026-07-31', [pagamento()]);
    const p = r.pessoas[0];
    expect(p.totalLiquido).toBe(Number((100 + p.folha!.liquido).toFixed(2)));
    expect(Number((p.totalProventos - p.totalDescontos).toFixed(2))).toBe(p.totalLiquido);
  });

  it('numa semana a folha não entra e o aviso liga', () => {
    const r = montar('2026-07-01', '2026-07-07', [pagamento()]);
    const p = r.pessoas[0];
    expect(p.folha).toBeUndefined();
    expect(p.folhaForaDoMes).toBe(true);
    expect(p.linhas.map(l => l.rotulo)).toEqual(['Diárias']);
    expect(p.totalLiquido).toBe(100);
  });

  it('o relatório de PONTO continua sem nenhum centavo, mesmo com salário na ficha', () => {
    const financeiro = agregarFinanceiroPorPessoa([mensalista], [pagamento()], [], [], []);
    const r = montarRelatorio({
      tipo: 'ponto',
      company: empresa(),
      periodo: PERIODO_MES,
      financeiro,
      attendances: [],
      folhaPorPessoa: new Map([
        ['emp-1', folhaDaPessoa({
          ficha: mensalista,
          inicio: PERIODO_MES.inicio,
          fim: PERIODO_MES.fim,
          config: CONFIGURACAO_DA_FOLHA_PADRAO,
          ferias: [],
          tabelas: TABELAS,
          horasNoturnas: 0,
          faltasInjustificadas: [],
        })],
      ]),
    });
    for (const p of r.pessoas) {
      expect(p.linhas).toEqual([]);
      expect(p.totalLiquido).toBe(0);
      expect(p.folha).toBeUndefined();
      expect(p.folhaForaDoMes).toBe(false);
    }
  });
});
