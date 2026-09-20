import { describe, it, expect } from 'vitest';
import {
  apareceNoDia,
  apareceNoPeriodo,
  estaDesligado,
  podeBaterPonto,
} from '../../src/utils/desligados';

/**
 * A regra do desligado (19/09/2026).
 *
 * O caso que o Victor descreveu é o primeiro teste: trabalhou até o mês 8, recebeu no
 * mês 8, desligado no mês 9 — no mês 8 ele está lá, do mês 10 em diante não.
 */

const AGOSTO = { inicio: '2026-08-01', fim: '2026-08-31' };
const SETEMBRO = { inicio: '2026-09-01', fim: '2026-09-30' };
const OUTUBRO = { inicio: '2026-10-01', fim: '2026-10-31' };

describe('🎯 o caso do Victor: saiu em setembro', () => {
  const saiuEmSetembro = { termination_date: '2026-09-15' };

  it('em AGOSTO ele aparece — trabalhou e recebeu', () => {
    expect(apareceNoPeriodo(saiuEmSetembro, AGOSTO, true)).toBe(true);
    // E aparece mesmo que a tela não tenha achado dado nenhum: ele ainda era da casa.
    expect(apareceNoPeriodo(saiuEmSetembro, AGOSTO, false)).toBe(true);
  });

  it('em SETEMBRO ele aparece — saiu no meio do mês, tem acerto a receber', () => {
    expect(apareceNoPeriodo(saiuEmSetembro, SETEMBRO, false)).toBe(true);
  });

  it('🎯 em OUTUBRO ele SOME — não tem mais nada ali', () => {
    expect(apareceNoPeriodo(saiuEmSetembro, OUTUBRO, false)).toBe(false);
  });

  it('mas em OUTUBRO volta a aparecer SE tiver algo a receber', () => {
    // Pagamento atrasado, acerto lançado depois: o dinheiro não pode sumir da tela.
    expect(apareceNoPeriodo(saiuEmSetembro, OUTUBRO, true)).toBe(true);
  });
});

describe('quem não foi desligado aparece sempre', () => {
  it('sem data de saída, em qualquer período', () => {
    expect(apareceNoPeriodo({ termination_date: null }, OUTUBRO, false)).toBe(true);
    expect(apareceNoPeriodo({}, OUTUBRO, false)).toBe(true);
    expect(apareceNoPeriodo({ termination_date: '  ' }, OUTUBRO, false)).toBe(true);
  });
});

describe('a borda exata do período', () => {
  it('saiu no PRIMEIRO dia do período: aparece', () => {
    expect(apareceNoPeriodo({ termination_date: '2026-10-01' }, OUTUBRO, false)).toBe(true);
  });

  it('saiu no ÚLTIMO dia do período anterior: só com dado', () => {
    expect(apareceNoPeriodo({ termination_date: '2026-09-30' }, OUTUBRO, false)).toBe(false);
    expect(apareceNoPeriodo({ termination_date: '2026-09-30' }, OUTUBRO, true)).toBe(true);
  });
});

describe('telas de UM dia (o Ponto)', () => {
  it('no dia da saída ele ainda aparece', () => {
    expect(apareceNoDia({ termination_date: '2026-09-15' }, '2026-09-15', false)).toBe(true);
  });

  it('no dia seguinte, some — a não ser que tenha batido ponto', () => {
    expect(apareceNoDia({ termination_date: '2026-09-15' }, '2026-09-16', false)).toBe(false);
    expect(apareceNoDia({ termination_date: '2026-09-15' }, '2026-09-16', true)).toBe(true);
  });
});

describe('🎯 bater ponto — só até a data de saída (decisão do Victor)', () => {
  const saiDia15 = { termination_date: '2026-09-15' };

  it('bate normal antes e NO dia da saída', () => {
    expect(podeBaterPonto(saiDia15, '2026-09-10')).toBe(true);
    expect(podeBaterPonto(saiDia15, '2026-09-15')).toBe(true);
  });

  it('para no dia seguinte', () => {
    expect(podeBaterPonto(saiDia15, '2026-09-16')).toBe(false);
    expect(podeBaterPonto(saiDia15, '2026-12-01')).toBe(false);
  });

  it('🎯 registrar a rescisão ANTES não tira os dias que ela ainda vai trabalhar', () => {
    // Acerto lançado no dia 10 com saída no dia 15: ela bate os dias 11 a 15.
    for (const dia of ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15']) {
      expect(podeBaterPonto(saiDia15, dia)).toBe(true);
    }
  });

  it('quem não foi desligado bate sempre', () => {
    expect(podeBaterPonto({}, '2026-12-01')).toBe(true);
    expect(podeBaterPonto({ termination_date: null }, '2026-12-01')).toBe(true);
  });
});

describe('estaDesligado', () => {
  it('é só ter data de saída', () => {
    expect(estaDesligado({ termination_date: '2026-09-15' })).toBe(true);
    expect(estaDesligado({ termination_date: null })).toBe(false);
    expect(estaDesligado({})).toBe(false);
  });
});
