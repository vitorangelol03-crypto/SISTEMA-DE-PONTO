/**
 * Travas da "Bonificação do Dia" (05/08/2026, decisões do Victor).
 *
 * O botão aplicava em TODOS que bateram ponto no dia, IGNORANDO a busca da tela e
 * sem dizer quem ia receber. Resultado real: 20 funcionários da Caratinga com R$ 10
 * que ninguém lançou (04/08), e outros em 18/05.
 *
 * É o mesmo defeito do "Reset Geral" corrigido em 29/07 — e a mesma solução:
 * respeitar a lista visível, dizer quantos e quem, e avisar quando o valor digitado
 * diverge do configurado.
 */
import { describe, it, expect } from 'vitest';
import {
  bonusTargets,
  bonusIsFiltered,
  bonusExcludedIds,
  bonusTargetNames,
  bonusValorDivergente,
} from '../../src/utils/bonusScope';

const PRESENTES = [{ employee_id: 'a' }, { employee_id: 'b' }, { employee_id: 'c' }];
const TODOS = [{ id: 'a', name: 'Adair' }, { id: 'b', name: 'Bruno' }, { id: 'c', name: 'Carlos' }];

describe('bonusTargets — quem recebe', () => {
  it('SEM busca: todos que bateram ponto recebem (comportamento de sempre)', () => {
    expect(bonusTargets(PRESENTES, TODOS)).toHaveLength(3);
  });

  it('🎯 COM busca: só quem está na tela recebe', () => {
    const visiveis = [{ id: 'b', name: 'Bruno' }];
    expect(bonusTargets(PRESENTES, visiveis).map((a) => a.employee_id)).toEqual(['b']);
  });

  it('quem está na tela mas NÃO bateu ponto não recebe', () => {
    const visiveis = [...TODOS, { id: 'z', name: 'Zeca (faltou)' }];
    expect(bonusTargets(PRESENTES, visiveis)).toHaveLength(3);
  });

  it('busca que não acha ninguém presente resulta em zero (a tela barra antes de aplicar)', () => {
    expect(bonusTargets(PRESENTES, [{ id: 'z', name: 'Zeca' }])).toEqual([]);
  });
});

describe('bonusIsFiltered — o aviso de busca ativa', () => {
  it('sem busca não avisa', () => {
    expect(bonusIsFiltered(PRESENTES, TODOS)).toBe(false);
  });

  it('com gente escondida pela busca, avisa', () => {
    expect(bonusIsFiltered(PRESENTES, [{ id: 'a', name: 'Adair' }])).toBe(true);
  });
});

describe('bonusExcludedIds — quem o serviço tem que pular', () => {
  it('sem busca, não exclui ninguém', () => {
    expect(bonusExcludedIds(PRESENTES, TODOS)).toEqual([]);
  });

  it('exclui exatamente quem tem ponto e a busca escondeu', () => {
    expect(bonusExcludedIds(PRESENTES, [{ id: 'b', name: 'Bruno' }]).sort()).toEqual(['a', 'c']);
  });

  it('não repete id quando a pessoa tem mais de um registro de ponto', () => {
    const dobrado = [...PRESENTES, { employee_id: 'a' }];
    expect(bonusExcludedIds(dobrado, [{ id: 'b', name: 'Bruno' }]).sort()).toEqual(['a', 'c']);
  });
});

describe('bonusTargetNames — o que a confirmação mostra', () => {
  it('lista os nomes e o total', () => {
    const r = bonusTargetNames(PRESENTES, TODOS);
    expect(r.total).toBe(3);
    expect(r.nomes).toEqual(['Adair', 'Bruno', 'Carlos']);
    expect(r.restantes).toBe(0);
  });

  it('corta em 5 e diz quantos sobraram — 20 nomes numa caixa seria ilegível', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, name: `Func ${i}` }));
    const pontos = muitos.map((e) => ({ employee_id: e.id }));
    const r = bonusTargetNames(pontos, muitos);
    expect(r.total).toBe(20);
    expect(r.nomes).toHaveLength(5);
    expect(r.restantes).toBe(15);
  });

  it('respeita a busca: só nomes de quem vai receber', () => {
    const r = bonusTargetNames(PRESENTES, [{ id: 'c', name: 'Carlos' }]);
    expect(r.nomes).toEqual(['Carlos']);
    expect(r.total).toBe(1);
  });
});

describe('bonusValorDivergente — o aviso que teria pego o caso real', () => {
  it('🎯 R$ 10 digitado onde o configurado é R$ 15 avisa', () => {
    // Exatamente o caso de 04/08: Bônus B da Caratinga é R$ 15, o teste aplicou 10.
    expect(bonusValorDivergente(10, 15)).toBe(true);
  });

  it('valor igual ao configurado não avisa', () => {
    expect(bonusValorDivergente(15, 15)).toBe(false);
  });

  it('diferença de centavo de arredondamento não avisa', () => {
    expect(bonusValorDivergente(15.001, 15)).toBe(false);
  });

  it('sem valor configurado não há o que comparar', () => {
    expect(bonusValorDivergente(10, null)).toBe(false);
    expect(bonusValorDivergente(10, undefined)).toBe(false);
    expect(bonusValorDivergente(10, 0)).toBe(false);
  });

  it('valor maior que o configurado também avisa (não é só pra menos)', () => {
    expect(bonusValorDivergente(50, 15)).toBe(true);
  });
});
