import { describe, it, expect } from 'vitest';
import {
  anosDeCasa,
  calcularRescisao,
  diasDeAvisoPrevio,
  type EntradaDaRescisao,
  type MotivoDaRescisao,
} from '../../src/utils/folha/rescisao';
import { TABELA_INSS_2026, TABELA_IRRF_2026 } from '../../src/utils/folha/impostos';

/**
 * RESCISÃO (19/09/2026).
 *
 * ⚠️ **Sem gabarito**: nenhum dos 12 recibos da contabilidade é rescisão. Estes testes
 * travam a CLT como escrita e, sobretudo, as diferenças entre os quatro motivos — que
 * é onde errar custa caro dos dois lados.
 */

const base = (over: Partial<EntradaDaRescisao> = {}): EntradaDaRescisao => ({
  salarioMensal: 1700,
  admissao: '2023-03-10',
  dataDeSaida: '2026-09-15',
  motivo: 'sem-justa-causa',
  aviso: 'indenizado',
  percentualFgts: 8,
  fgtsAtivo: true,
  tabelaInss: TABELA_INSS_2026,
  tabelaIrrf: TABELA_IRRF_2026,
  tabelasConfirmadas: true,
  ...over,
});

const descricoes = (r: ReturnType<typeof calcularRescisao>) => r.linhas.map(l => l.descricao);

// ════════════════════════════════════════════════════════════════════════════
describe('aviso prévio — 30 dias + 3 por ano, teto de 90', () => {
  it('conta os anos COMPLETOS de casa', () => {
    expect(anosDeCasa('2023-03-10', '2026-03-09')).toBe(2); // faltou 1 dia pro 3º
    expect(anosDeCasa('2023-03-10', '2026-03-10')).toBe(3);
    expect(anosDeCasa('2026-01-10', '2026-09-15')).toBe(0);
  });

  it('os dias saem certos em cada faixa', () => {
    expect(diasDeAvisoPrevio('2026-01-10', '2026-09-15')).toBe(30); // menos de 1 ano
    expect(diasDeAvisoPrevio('2025-01-10', '2026-09-15')).toBe(33); // 1 ano
    expect(diasDeAvisoPrevio('2021-01-10', '2026-09-15')).toBe(45); // 5 anos
  });

  it('🎯 para no teto de 90 dias, por mais tempo de casa que tenha', () => {
    // 20 anos daria 30 + 60 = 90; 30 anos daria 120, mas a lei corta em 90.
    expect(diasDeAvisoPrevio('2006-01-10', '2026-09-15')).toBe(90);
    expect(diasDeAvisoPrevio('1996-01-10', '2026-09-15')).toBe(90);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('saldo de salário', () => {
  it('paga os dias do mês até a saída', () => {
    // Saída dia 15: 1700 ÷ 30 × 15 = 850
    expect(calcularRescisao(base({ dataDeSaida: '2026-09-15' })).saldoDeSalario).toBe(850);
  });

  it('saída no último dia do mês não passa do salário cheio', () => {
    const r = calcularRescisao(base({ dataDeSaida: '2026-07-31' }));
    expect(r.diasDeSaldo).toBe(31);
    expect(r.saldoDeSalario).toBe(1700); // não 1.756,66
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('🎯 o que cada motivo paga', () => {
  const rodar = (motivo: MotivoDaRescisao) => calcularRescisao(base({ motivo }));

  it('sem justa causa: paga tudo', () => {
    const r = rodar('sem-justa-causa');
    expect(r.avisoPrevio).toBeGreaterThan(0);
    expect(r.decimoProporcional).toBeGreaterThan(0);
    expect(r.feriasProporcionais).toBeGreaterThan(0);
    expect(descricoes(r)).toContain('Férias vencidas');
  });

  it('pedido de demissão: sem aviso da empresa e sem multa', () => {
    const r = rodar('pedido-de-demissao');
    expect(r.avisoPrevio).toBe(0);
    expect(r.multaFgts).toBe(0);
    // Mas o 13º e as férias continuam.
    expect(r.decimoProporcional).toBeGreaterThan(0);
    expect(r.feriasProporcionais).toBeGreaterThan(0);
  });

  it('🎯 justa causa: perde 13º proporcional, férias proporcionais, aviso e multa', () => {
    const r = rodar('justa-causa');
    expect(r.avisoPrevio).toBe(0);
    expect(r.decimoProporcional).toBe(0);
    expect(r.feriasProporcionais).toBe(0);
    expect(r.multaFgts).toBe(0);
    // As férias VENCIDAS ela não perde — nem na justa causa.
    expect(r.feriasVencidas).toBeGreaterThan(0);
    expect(descricoes(r)).toContain('1/3 sobre férias vencidas');
  });

  it('acordo 484-A: metade do aviso e metade da multa', () => {
    const semJusta = calcularRescisao(base({ motivo: 'sem-justa-causa', saldoFgts: 10000 }));
    const acordo = calcularRescisao(base({ motivo: 'acordo', saldoFgts: 10000 }));
    expect(acordo.multaFgts).toBe(2000);         // 20% de 10.000
    expect(semJusta.multaFgts).toBe(4000);       // 40%
    expect(acordo.avisoPrevio).toBeLessThan(semJusta.avisoPrevio);
    expect(acordo.avisoPrevio).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('multa do FGTS — o saldo é digitado (decisão do Victor)', () => {
  it('sem o saldo informado, a multa não sai e a tela é avisada', () => {
    const r = calcularRescisao(base({ saldoFgts: 0 }));
    expect(r.multaFgts).toBe(0);
    expect(r.multaSemSaldoInformado).toBe(true);
    expect(descricoes(r).some(d => d.includes('Multa'))).toBe(false);
  });

  it('com o saldo, a multa entra como provento', () => {
    const r = calcularRescisao(base({ saldoFgts: 8500 }));
    expect(r.multaFgts).toBe(3400); // 40%
    expect(r.multaSemSaldoInformado).toBe(false);
    expect(descricoes(r)).toContain('Multa de 40% do FGTS');
  });

  it('num motivo sem direito a multa, não avisa nada mesmo sem saldo', () => {
    expect(calcularRescisao(base({ motivo: 'justa-causa', saldoFgts: 0 })).multaSemSaldoInformado).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('🎯 a projeção do aviso indenizado (Súmula 371)', () => {
  it('aviso indenizado estende a data que conta os avos', () => {
    const r = calcularRescisao(base({ admissao: '2023-03-10', dataDeSaida: '2026-12-20', aviso: 'indenizado' }));
    expect(r.diasDeAviso).toBe(39); // 3 anos completos → 30 + 9
    expect(r.dataProjetada).toBe('2027-01-28');
  });

  it('aviso TRABALHADO não projeta — o tempo já passou de verdade', () => {
    const r = calcularRescisao(base({ dataDeSaida: '2026-12-20', aviso: 'trabalhado' }));
    expect(r.dataProjetada).toBe('2026-12-20');
    expect(r.avisoPrevio).toBe(0); // já foi pago no salário
  });

  it('aviso dispensado não projeta e não paga', () => {
    const r = calcularRescisao(base({ aviso: 'dispensado' }));
    expect(r.avisoPrevio).toBe(0);
    expect(r.dataProjetada).toBe('2026-09-15');
  });

  it('a projeção pode dar um avo a mais no 13º — e isso é dinheiro', () => {
    // Saída em 20/12 com 39 dias de aviso projeta para 28/01 do ano seguinte.
    const projetada = calcularRescisao(base({ dataDeSaida: '2026-12-20', aviso: 'indenizado' }));
    const seca = calcularRescisao(base({ dataDeSaida: '2026-12-20', aviso: 'trabalhado' }));
    // O ano da saída muda com a projeção: a conta do 13º passa a ser a de 2027.
    expect(projetada.dataProjetada.slice(0, 4)).toBe('2027');
    expect(seca.dataProjetada.slice(0, 4)).toBe('2026');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('🎯 imposto só sobre o que é salário', () => {
  it('férias, 1/3, aviso e multa NÃO entram na base do INSS', () => {
    const r = calcularRescisao(base({ saldoFgts: 10000 }));
    // A base é só o saldo de salário.
    expect(r.baseInss).toBe(r.saldoDeSalario);
    expect(r.baseInss).toBeLessThan(r.totalProventos);
  });

  it('o 13º é tributado à parte, não somado ao saldo', () => {
    const r = calcularRescisao(base());
    expect(r.inssDoDecimo).toBeGreaterThan(0);
    expect(r.inss).toBeGreaterThan(0);
    // Duas contas separadas: a do saldo e a do 13º.
    expect(r.baseInss).not.toBe(r.decimoProporcional);
    expect(descricoes(r)).toContain('INSS sobre saldo');
    // "proporcional" no rótulo: em dezembro a pessoa pode ter o 13º do ano E a rescisão,
    // e duas linhas "INSS sobre 13º" no mesmo relatório parecem erro de duplicação.
    expect(descricoes(r)).toContain('INSS sobre 13º proporcional');
  });

  it('sem tabela de imposto, sai sem desconto — como antes de elas existirem', () => {
    const r = calcularRescisao(base({ tabelaInss: undefined, tabelaIrrf: undefined }));
    expect(r.inss).toBe(0);
    expect(r.irrf).toBe(0);
    expect(r.inssDoDecimo).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('pedido de demissão sem cumprir aviso: quem deve é a pessoa', () => {
  it('vira DESCONTO de 30 dias, não provento', () => {
    const r = calcularRescisao(base({ motivo: 'pedido-de-demissao', aviso: 'indenizado' }));
    expect(r.avisoPrevio).toBe(0);
    expect(r.avisoDescontado).toBe(1700);
    const linha = r.linhas.find(l => l.descricao === 'Aviso prévio não cumprido')!;
    expect(linha.desconto).toBe(1700);
    expect(linha.provento).toBe(0);
  });

  it('são 30 dias secos — os 3 por ano são benefício de quem é mandado embora', () => {
    const veterana = calcularRescisao(base({
      admissao: '2016-01-10', motivo: 'pedido-de-demissao', aviso: 'indenizado',
    }));
    expect(veterana.diasDeAviso).toBe(60); // o que a lei daria SE fosse dispensa
    expect(veterana.avisoDescontado).toBe(1700); // mas o desconto é de 1 salário
  });

  it('cumprindo o aviso, não desconta nada', () => {
    expect(calcularRescisao(base({ motivo: 'pedido-de-demissao', aviso: 'trabalhado' })).avisoDescontado).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('o papel fecha', () => {
  it('🎯 proventos − descontos = líquido, nos quatro motivos', () => {
    for (const motivo of ['sem-justa-causa', 'pedido-de-demissao', 'justa-causa', 'acordo'] as MotivoDaRescisao[]) {
      for (const aviso of ['trabalhado', 'indenizado', 'dispensado'] as const) {
        const r = calcularRescisao(base({ motivo, aviso, saldoFgts: 9000 }));
        expect(Number((r.totalProventos - r.totalDescontos).toFixed(2))).toBe(r.liquido);
      }
    }
  });

  it('as férias saem da MESMA conta da tela de Férias', () => {
    const r = calcularRescisao(base());
    expect(r.diasDeFeriasVencidas).toBe(r.ferias.saldoCheio);
    expect(r.diasDeFeriasProporcionais).toBe(r.ferias.proporcionalCheio);
  });

  it('férias já tiradas abatem das vencidas', () => {
    const semGozo = calcularRescisao(base());
    const comGozo = calcularRescisao(base({
      feriasGozadas: [{ start_date: '2026-02-01', end_date: '2026-03-02' }], // 30 dias
    }));
    expect(comGozo.diasDeFeriasVencidas).toBeLessThan(semGozo.diasDeFeriasVencidas);
  });

  it('o 1/3 é um terço das férias, sempre', () => {
    const r = calcularRescisao(base());
    expect(r.tercoDasVencidas).toBe(Math.floor((r.feriasVencidas / 3) * 100) / 100);
    expect(r.tercoDasProporcionais).toBe(Math.floor((r.feriasProporcionais / 3) * 100) / 100);
  });
});
