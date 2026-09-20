import { describe, it, expect } from 'vitest';
import {
  diasDeFeriasGozados,
  diasPelaTabelaDeFaltas,
  feriasPorAvos,
  somaMeses,
} from '../../src/utils/folha/feriasPorAvos';

/**
 * FÉRIAS POR AVOS — o direito adquirido (19/09/2026).
 *
 * Como o 13º, isto **não tem gabarito da contabilidade**: os 12 recibos de julho pagam
 * o mês, não mostram saldo de férias. O que estes testes travam é a regra da CLT como
 * escrita e, principalmente, as bordas que fazem a conta errar sem ninguém ver:
 * admissão em dia 31, período que ainda não fechou, e o cálculo do vencimento.
 */

// ════════════════════════════════════════════════════════════════════════════
describe('somaMeses — a borda que quebra quem entra dia 31', () => {
  it('mês normal soma normal', () => {
    expect(somaMeses('2025-05-10', 12)).toBe('2026-05-10');
    expect(somaMeses('2025-05-10', 1)).toBe('2025-06-10');
  });

  it('dia 31 gruda no último dia do mês que não tem 31', () => {
    // Sem isto o Date escorregaria para 03/03 e o período aquisitivo sairia torto.
    expect(somaMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somaMeses('2028-01-31', 1)).toBe('2028-02-29'); // bissexto
    expect(somaMeses('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('atravessa o ano certo', () => {
    expect(somaMeses('2026-11-15', 3)).toBe('2027-02-15');
    expect(somaMeses('2026-12-31', 12)).toBe('2027-12-31');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('tabela de faltas do art. 130', () => {
  it('os cinco degraus, nos pontos exatos de virada', () => {
    expect(diasPelaTabelaDeFaltas(0)).toBe(30);
    expect(diasPelaTabelaDeFaltas(5)).toBe(30);
    expect(diasPelaTabelaDeFaltas(6)).toBe(24);
    expect(diasPelaTabelaDeFaltas(14)).toBe(24);
    expect(diasPelaTabelaDeFaltas(15)).toBe(18);
    expect(diasPelaTabelaDeFaltas(23)).toBe(18);
    expect(diasPelaTabelaDeFaltas(24)).toBe(12);
    expect(diasPelaTabelaDeFaltas(32)).toBe(12);
    expect(diasPelaTabelaDeFaltas(33)).toBe(0);
    expect(diasPelaTabelaDeFaltas(200)).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('dias de férias já tirados', () => {
  it('conta os dias das duas pontas', () => {
    expect(diasDeFeriasGozados([{ start_date: '2026-03-01', end_date: '2026-03-30' }])).toBe(30);
    expect(diasDeFeriasGozados([{ start_date: '2026-03-01', end_date: '2026-03-01' }])).toBe(1);
  });

  it('períodos que se sobrepõem não contam o mesmo dia duas vezes', () => {
    expect(diasDeFeriasGozados([
      { start_date: '2026-03-01', end_date: '2026-03-10' },
      { start_date: '2026-03-05', end_date: '2026-03-15' },
    ])).toBe(15);
  });

  it('lançamento invertido é ignorado, não vira número negativo', () => {
    expect(diasDeFeriasGozados([{ start_date: '2026-03-10', end_date: '2026-03-01' }])).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('férias por avos — o direito', () => {
  const base = { hoje: '2026-09-19' };

  it('🎯 SEM data de admissão o sistema não inventa nada (decisão do Victor)', () => {
    const r = feriasPorAvos({ ...base, admissao: null });
    expect(r.semAdmissao).toBe(true);
    expect(r.diasCheios).toBe(0);
    expect(r.periodos).toEqual([]);
  });

  it('data de admissão inválida também não vira conta', () => {
    expect(feriasPorAvos({ ...base, admissao: 'ontem' }).semAdmissao).toBe(true);
    expect(feriasPorAvos({ ...base, admissao: '' }).semAdmissao).toBe(true);
  });

  it('quem foi admitida amanhã não tem direito nenhum — mas a ficha está preenchida', () => {
    const r = feriasPorAvos({ ...base, admissao: '2026-12-01' });
    expect(r.semAdmissao).toBe(false);
    expect(r.diasCheios).toBe(0);
  });

  it('🎯 um período aquisitivo fechado dá 30 dias', () => {
    // Admitida em 10/05/2025: o período 10/05/2025 → 09/05/2026 fechou.
    const r = feriasPorAvos({ ...base, admissao: '2025-05-10' });
    expect(r.periodos[0]).toMatchObject({
      inicio: '2025-05-10',
      fim: '2026-05-09',
      completo: true,
      avos: 12,
      diasCheios: 30,
      diasComFaltas: 30,
      limiteParaGozar: '2027-05-09',
    });
    expect(r.saldoCheio).toBe(30);
  });

  it('🎯 o proporcional em curso NÃO entra no que a pessoa pode tirar', () => {
    /**
     * A separação que um teste vermelho pegou em 19/09: somar os dois faria a tela
     * deixar agendar 40 dias para quem só pode tirar 30. O proporcional só vira
     * direito de gozo quando o período fecha — antes disso ele é coisa de rescisão.
     */
    const r = feriasPorAvos({ ...base, admissao: '2025-05-10' });
    // O 2º período começou em 10/05/2026; até 19/09/2026 fecharam 4 meses (10/05→09/09).
    const emCurso = r.periodos[1];
    expect(emCurso.completo).toBe(false);
    expect(emCurso.avos).toBe(4);
    expect(emCurso.diasCheios).toBe(10); // 4 × 30 ÷ 12
    expect(emCurso.limiteParaGozar).toBeNull();

    expect(r.diasCheios).toBe(30);           // só o período fechado
    expect(r.proporcionalCheio).toBe(10);    // o em curso, à parte
    expect(r.saldoCheio).toBe(30);           // o que dá pra tirar hoje
  });

  it('o mês que ainda não terminou NÃO vira avo', () => {
    // Admitida em 10/09/2026, hoje é 19/09: nem um mês fechou.
    const r = feriasPorAvos({ ...base, admissao: '2026-09-10' });
    expect(r.periodos[0].avos).toBe(0);
    expect(r.diasCheios).toBe(0);
  });

  it('🎯 os DOIS números saem: 30 cheios e o corte da tabela de faltas', () => {
    // 8 faltas sem atestado dentro do 1º período → a tabela corta para 24.
    const faltas = Array.from({ length: 8 }, (_, i) => `2025-07-${String(i + 1).padStart(2, '0')}`);
    const r = feriasPorAvos({ ...base, admissao: '2025-05-10', faltasInjustificadas: faltas });
    expect(r.periodos[0].faltasInjustificadas).toBe(8);
    expect(r.periodos[0].diasCheios).toBe(30);
    expect(r.periodos[0].diasComFaltas).toBe(24);
  });

  it('falta de OUTRO período não corta este', () => {
    // 8 faltas em 2026-07 caem no 2º período, não no 1º.
    const faltas = Array.from({ length: 8 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
    const r = feriasPorAvos({ ...base, admissao: '2025-05-10', faltasInjustificadas: faltas });
    expect(r.periodos[0].faltasInjustificadas).toBe(0);
    expect(r.periodos[0].diasComFaltas).toBe(30);
    expect(r.periodos[1].faltasInjustificadas).toBe(8);
  });

  it('mais de 32 faltas no período zeram as férias dele', () => {
    const faltas = Array.from({ length: 33 }, (_, i) => {
      const dia = i + 1;
      return dia <= 31 ? `2025-07-${String(dia).padStart(2, '0')}` : `2025-08-${String(dia - 31).padStart(2, '0')}`;
    });
    const r = feriasPorAvos({ ...base, admissao: '2025-05-10', faltasInjustificadas: faltas });
    expect(r.periodos[0].diasComFaltas).toBe(0);
    expect(r.periodos[0].diasCheios).toBe(30);
  });

  it('🎯 férias já tiradas abatem do saldo', () => {
    const r = feriasPorAvos({
      ...base,
      admissao: '2025-05-10',
      feriasGozadas: [{ start_date: '2026-06-01', end_date: '2026-06-30' }],
    });
    expect(r.diasGozados).toBe(30);
    expect(r.diasCheios).toBe(30);        // direito de período fechado
    expect(r.proporcionalCheio).toBe(10); // o em curso não entra no saldo
    expect(r.saldoCheio).toBe(0);         // tirou tudo que podia
  });

  it('o saldo não fica negativo quem tirou mais do que tinha', () => {
    const r = feriasPorAvos({
      ...base,
      admissao: '2026-01-10',
      feriasGozadas: [{ start_date: '2026-06-01', end_date: '2026-06-30' }],
    });
    expect(r.saldoCheio).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('vencimento — o alerta que evita pagar em dobro', () => {
  it('🎯 passou de 12 meses depois do período fechado = VENCIDA', () => {
    // Admitida 10/05/2024: 1º período fecha 09/05/2025, prazo para gozar até 09/05/2026.
    const r = feriasPorAvos({ admissao: '2024-05-10', hoje: '2026-09-19' });
    expect(r.vencimento).toBe('2026-05-09');
    expect(r.vencida).toBe(true);
  });

  it('quem já tirou os 30 dias do período velho não está vencida', () => {
    const r = feriasPorAvos({
      admissao: '2024-05-10',
      hoje: '2026-09-19',
      feriasGozadas: [{ start_date: '2026-01-05', end_date: '2026-02-03' }], // 30 dias
    });
    // O vencimento passa a ser o do período SEGUINTE, que ainda não venceu.
    expect(r.vencimento).toBe('2027-05-09');
    expect(r.vencida).toBe(false);
  });

  it('🎯 vence nos próximos 90 dias = aviso com tempo de agir', () => {
    // 1º período fecha 09/11/2025, prazo até 09/11/2026 — 51 dias à frente de 19/09.
    const r = feriasPorAvos({ admissao: '2024-11-10', hoje: '2026-09-19' });
    expect(r.vencimento).toBe('2026-11-09');
    expect(r.vencida).toBe(false);
    expect(r.perto).toBe(true);
  });

  it('vencimento longe não liga aviso nenhum', () => {
    const r = feriasPorAvos({ admissao: '2025-05-10', hoje: '2026-09-19' });
    expect(r.vencimento).toBe('2027-05-09');
    expect(r.vencida).toBe(false);
    expect(r.perto).toBe(false);
  });

  it('quem ainda não fechou o primeiro período não tem vencimento', () => {
    const r = feriasPorAvos({ admissao: '2026-03-10', hoje: '2026-09-19' });
    expect(r.vencimento).toBeNull();
    expect(r.vencida).toBe(false);
    expect(r.perto).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('casos reais das 21 pessoas de carteira assinada', () => {
  it('quem entrou em 06/11/2025 já fechou o 1º período e tem 30 dias', () => {
    const r = feriasPorAvos({ admissao: '2025-11-06', hoje: '2026-11-19' });
    expect(r.periodos[0].completo).toBe(true);
    expect(r.saldoCheio).toBeGreaterThanOrEqual(30);
    expect(r.vencimento).toBe('2027-11-05');
  });

  it('quem entrou em 06/08/2026 ainda não tem direito fechado', () => {
    const r = feriasPorAvos({ admissao: '2026-08-06', hoje: '2026-09-19' });
    expect(r.periodos[0].completo).toBe(false);
    expect(r.periodos[0].avos).toBe(1); // 06/08 a 05/09 fechou
    expect(r.saldoCheio).toBe(0);           // nada a tirar: o período não fechou
    expect(r.proporcionalCheio).toBe(2);    // 1 × 30 ÷ 12, truncado — só vale em rescisão
  });

  it('desligamento para o direito na data da saída', () => {
    const semSaida = feriasPorAvos({ admissao: '2025-05-10', hoje: '2026-09-19' });
    const comSaida = feriasPorAvos({ admissao: '2025-05-10', hoje: '2026-09-19', desligamento: '2026-06-30' });
    // O período fechado é o mesmo; o que encolhe é o proporcional em formação.
    expect(comSaida.diasCheios).toBe(semSaida.diasCheios);
    expect(comSaida.proporcionalCheio).toBeLessThan(semSaida.proporcionalCheio);
    expect(comSaida.periodos[1].avos).toBe(1); // só 10/05 a 09/06 fechou antes da saída
  });
});
