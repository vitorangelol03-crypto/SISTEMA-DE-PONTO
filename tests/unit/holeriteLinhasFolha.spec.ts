import { describe, it, expect } from 'vitest';
import { linhasDoRecibo, type HoleriteData } from '../../src/utils/holeritePdf';
import { CONFIGURACAO_DA_FOLHA_PADRAO, calcularFolha } from '../../src/utils/folha/folhaCalc';

/**
 * As LINHAS do recibo depois da folha de carteira assinada (18/09/2026).
 *
 * O que este teste protege: o recibo do DIARISTA — que é a maioria e está em produção
 * desde julho — não pode ter mudado nem uma linha. A folha entra só para quem tem
 * salário de mensalista na ficha.
 */

const BASE: HoleriteData = {
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

const folhaDe = (salario: number, filhos: number, noturno: number) =>
  calcularFolha({
    ficha: { salarioMensal: salario, filhosSalarioFamilia: filhos, fgtsAtivo: true, admissao: '2026-01-02' },
    config: CONFIGURACAO_DA_FOLHA_PADRAO,
    ano: 2026,
    mes: 7,
    adicionalNoturno: noturno,
  });

const descricoes = (data: HoleriteData) => linhasDoRecibo(data).proventos.map(l => l[0]);

describe('recibo do diarista — não mudou', () => {
  it('sai com as diárias e a bonificação, como sempre', () => {
    expect(descricoes(BASE)).toEqual(['Diárias (2 dias)', 'Bonificação B (1×)']);
    expect(linhasDoRecibo(BASE).proventos[0][2]).toContain('200,00');
  });

  it('os descontos continuam na ordem de antes', () => {
    const comDescontos: HoleriteData = {
      ...BASE,
      quantityErrorDiscount: 5,
      errorDiscount: 10,
      triageDiscount: 3,
    };
    expect(linhasDoRecibo(comDescontos).descontos.map(l => l[0])).toEqual([
      'Desconto por erros de quantidade',
      'Desconto de Erros',
      'Desconto de Triagem',
    ]);
  });

  it('um único dia não sai escrito "1 dias"', () => {
    const umDia: HoleriteData = { ...BASE, payments: [BASE.payments[0]], totalDailyRate: 100, totalBonusB: 0 };
    expect(descricoes(umDia)).toEqual(['Diárias (1 dia)']);
  });
});

describe('recibo de carteira assinada', () => {
  const mensalista: HoleriteData = {
    ...BASE,
    payments: [],
    totalDailyRate: 0,
    totalBonusB: 0,
    folha: folhaDe(1700, 1, 72.87),
  };

  it('traz salário, adicional noturno e salário família, na ordem do modelo', () => {
    expect(descricoes(mensalista)).toEqual([
      'Salário mensalista (30,00)',
      'Adicional noturno',
      'Salário família (1,00)',
    ]);
  });

  it('NÃO sai com a linha de diárias zerada', () => {
    expect(descricoes(mensalista).some(d => d.startsWith('Diárias'))).toBe(false);
  });

  it('os valores são os do cálculo, já formatados em real', () => {
    const linhas = linhasDoRecibo(mensalista).proventos;
    expect(linhas[0][2]).toContain('1.700,00');
    expect(linhas[1][2]).toContain('72,87');
    expect(linhas[2][2]).toContain('67,54');
  });

  it('o FGTS não entra como desconto (é custo da empresa)', () => {
    const { descontos } = linhasDoRecibo(mensalista);
    expect(descontos).toEqual([]);
    expect(descricoes(mensalista).some(d => d.includes('FGTS'))).toBe(false);
  });

  it('sem filhos, a linha do salário família não aparece', () => {
    const semFilhos: HoleriteData = { ...mensalista, folha: folhaDe(1700, 0, 72.87) };
    expect(descricoes(semFilhos)).toEqual(['Salário mensalista (30,00)', 'Adicional noturno']);
  });

  it('quem tem salário E diária no mesmo período vê as duas coisas', () => {
    const misto: HoleriteData = { ...BASE, folha: folhaDe(1700, 0, 0) };
    expect(descricoes(misto)).toEqual([
      'Salário mensalista (30,00)',
      'Diárias (2 dias)',
      'Bonificação B (1×)',
    ]);
  });
});
