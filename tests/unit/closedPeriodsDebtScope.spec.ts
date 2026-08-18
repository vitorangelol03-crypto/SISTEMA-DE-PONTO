import { describe, it, expect } from 'vitest';
import {
  chaveLinha, origensDistintas, filtrarPorOrigem, linhasSelecionadasVisiveis,
  todasVisiveisSelecionadas, alternarTodosVisiveis, alternarUma,
} from '../../src/utils/closedPeriodsDebtScope';

const MAIO = { periodId: 'p-maio', periodLabel: 'Quinzena 1 Maio', driverId: 'a' };
const MAIO_B = { periodId: 'p-maio', periodLabel: 'Quinzena 1 Maio', driverId: 'b' };
const JUNHO = { periodId: 'p-junho', periodLabel: 'Quinzena 2 Junho', driverId: 'c' };

describe('chaveLinha — identifica a linha por quinzena de origem + driver', () => {
  it('mesmo driver em quinzenas diferentes gera chaves diferentes', () => {
    const mesmoDriverOutraQuinzena = { periodId: 'p-junho', periodLabel: 'Quinzena 2 Junho', driverId: 'a' };
    expect(chaveLinha(MAIO)).not.toBe(chaveLinha(mesmoDriverOutraQuinzena));
  });
});

describe('origensDistintas — quinzenas de origem pro filtro', () => {
  it('lista cada quinzena uma vez só, na ordem de aparição', () => {
    expect(origensDistintas([MAIO, MAIO_B, JUNHO])).toEqual([
      { id: 'p-maio', label: 'Quinzena 1 Maio' },
      { id: 'p-junho', label: 'Quinzena 2 Junho' },
    ]);
  });

  it('lista vazia não quebra', () => {
    expect(origensDistintas([])).toEqual([]);
  });
});

describe('filtrarPorOrigem — o filtro em si', () => {
  it('sem filtro (string vazia), mostra tudo', () => {
    expect(filtrarPorOrigem([MAIO, MAIO_B, JUNHO], '')).toHaveLength(3);
  });

  it('🎯 com filtro, só a quinzena escolhida', () => {
    expect(filtrarPorOrigem([MAIO, MAIO_B, JUNHO], 'p-maio')).toEqual([MAIO, MAIO_B]);
  });

  it('filtro pra quinzena sem nenhuma linha resulta em vazio', () => {
    expect(filtrarPorOrigem([MAIO], 'p-inexistente')).toEqual([]);
  });
});

describe('todasVisiveisSelecionadas — estado do checkbox "selecionar todos"', () => {
  it('lista vazia nunca está "toda selecionada"', () => {
    expect(todasVisiveisSelecionadas([], new Set())).toBe(false);
  });

  it('nada selecionado → false', () => {
    expect(todasVisiveisSelecionadas([MAIO, MAIO_B], new Set())).toBe(false);
  });

  it('só uma das duas selecionada → false', () => {
    expect(todasVisiveisSelecionadas([MAIO, MAIO_B], new Set([chaveLinha(MAIO)]))).toBe(false);
  });

  it('as duas selecionadas → true', () => {
    const sel = new Set([chaveLinha(MAIO), chaveLinha(MAIO_B)]);
    expect(todasVisiveisSelecionadas([MAIO, MAIO_B], sel)).toBe(true);
  });
});

describe('alternarTodosVisiveis — o "selecionar todos" respeita o filtro', () => {
  it('nenhuma visível selecionada → marca todas as visíveis', () => {
    const next = alternarTodosVisiveis([MAIO, MAIO_B], new Set());
    expect([...next].sort()).toEqual([chaveLinha(MAIO), chaveLinha(MAIO_B)].sort());
  });

  it('todas visíveis já selecionadas → desmarca só as visíveis', () => {
    const sel = new Set([chaveLinha(MAIO), chaveLinha(MAIO_B)]);
    const next = alternarTodosVisiveis([MAIO, MAIO_B], sel);
    expect(next.size).toBe(0);
  });

  it('🎯 não mexe em quem está selecionado mas FORA do filtro atual', () => {
    // JUNHO foi selecionado antes (outro filtro); agora o filtro só mostra MAIO/MAIO_B.
    const selAntes = new Set([chaveLinha(JUNHO)]);
    const next = alternarTodosVisiveis([MAIO, MAIO_B], selAntes);
    expect(next.has(chaveLinha(JUNHO))).toBe(true);
    expect(next.has(chaveLinha(MAIO))).toBe(true);
    expect(next.has(chaveLinha(MAIO_B))).toBe(true);
  });
});

describe('alternarUma — marca/desmarca uma linha só', () => {
  it('marca quando não estava selecionada', () => {
    const next = alternarUma(MAIO, new Set());
    expect(next.has(chaveLinha(MAIO))).toBe(true);
  });

  it('desmarca quando já estava selecionada', () => {
    const next = alternarUma(MAIO, new Set([chaveLinha(MAIO)]));
    expect(next.has(chaveLinha(MAIO))).toBe(false);
  });

  it('preserva o resto da seleção', () => {
    const next = alternarUma(MAIO, new Set([chaveLinha(JUNHO)]));
    expect(next.has(chaveLinha(JUNHO))).toBe(true);
    expect(next.has(chaveLinha(MAIO))).toBe(true);
  });
});

describe('linhasSelecionadasVisiveis — o que realmente migra em massa', () => {
  it('só as visíveis E marcadas — nunca extrapola o filtro atual', () => {
    // JUNHO está marcado, mas o filtro atual só mostra MAIO/MAIO_B.
    const sel = new Set([chaveLinha(MAIO), chaveLinha(JUNHO)]);
    const visiveis = filtrarPorOrigem([MAIO, MAIO_B, JUNHO], 'p-maio');
    expect(linhasSelecionadasVisiveis(visiveis, sel)).toEqual([MAIO]);
  });

  it('nada selecionado → vazio', () => {
    expect(linhasSelecionadasVisiveis([MAIO, MAIO_B], new Set())).toEqual([]);
  });
});
