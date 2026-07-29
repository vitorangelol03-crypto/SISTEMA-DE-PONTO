import { describe, it, expect } from 'vitest';
import { attendancesToReset, resetIsFiltered } from '../../src/utils/attendanceReset';

/**
 * Regressão do estrago de 28/07: o "Reset Geral" apagava o ponto de TODOS do dia,
 * ignorando a busca da tela. Na bateria E2E isso destruiu ponto REAL de Ponte Nova
 * (o spec 04 roda em PN e clica no botão) — e em produção bastavam dois cliques.
 */

const att = (employee_id: string) => ({ employee_id });
const emp = (id: string) => ({ id });

describe('attendancesToReset — o que o Reset Geral pode apagar', () => {
  it('SEM busca: pega todos (comportamento de sempre)', () => {
    const registros = [att('a'), att('b'), att('c')];
    const visiveis = [emp('a'), emp('b'), emp('c')];
    expect(attendancesToReset(registros, visiveis)).toHaveLength(3);
  });

  it('COM busca: pega SÓ quem está na lista filtrada', () => {
    const registros = [att('real1'), att('real2'), att('teste')];
    const visiveis = [emp('teste')]; // operador buscou pelo funcionário de teste
    const alvos = attendancesToReset(registros, visiveis);
    expect(alvos).toHaveLength(1);
    expect(alvos[0].employee_id).toBe('teste');
  });

  it('o cenário REAL que destruiu dado: buscar 1 e resetar não pode levar os outros', () => {
    // Ponte Nova no dia 28/07: 1 funcionário de teste + 2 reais com ponto
    const registros = [att('pw-test'), att('euder'), att('ronaldo')];
    const visiveis = [emp('pw-test')];
    const alvos = attendancesToReset(registros, visiveis).map((a) => a.employee_id);
    expect(alvos).toEqual(['pw-test']);
    expect(alvos).not.toContain('euder');
    expect(alvos).not.toContain('ronaldo');
  });

  it('funcionário visível SEM ponto não vira alvo (não existe registro pra apagar)', () => {
    const registros = [att('a')];
    const visiveis = [emp('a'), emp('b'), emp('c')];
    expect(attendancesToReset(registros, visiveis)).toHaveLength(1);
  });

  it('busca que não acha ninguém = nada é apagado', () => {
    expect(attendancesToReset([att('a'), att('b')], [])).toHaveLength(0);
  });

  it('listas vazias não quebram', () => {
    expect(attendancesToReset([], [])).toEqual([]);
  });
});

describe('resetIsFiltered — quando o modal precisa avisar', () => {
  it('sem busca: não avisa', () => {
    expect(resetIsFiltered([att('a'), att('b')], [emp('a'), emp('b')])).toBe(false);
  });

  it('com busca escondendo gente: AVISA', () => {
    expect(resetIsFiltered([att('a'), att('b')], [emp('a')])).toBe(true);
  });

  it('busca que mostra todo mundo: não avisa', () => {
    expect(resetIsFiltered([att('a')], [emp('a'), emp('b')])).toBe(false);
  });
});
