/**
 * Selecionar grupos ARRASTANDO o mouse (pedido do Victor, 04/08/2026).
 *
 * "segurar clique do mouse e ir descendo o sistema ir selecionando de forma
 * automática, podendo subir para cima para desselecionar".
 *
 * O risco aqui é marcar quem não devia num fechamento — por isso a regra é pura e
 * testada sem navegador. O comportamento é de FAIXA (não de pincel): vale o
 * intervalo entre a caixinha onde o clique começou e onde o mouse está agora.
 * Encolher a faixa devolve os de fora ao estado anterior ao arrasto — é isso que
 * faz "subir pra cima" desmarcar.
 */
import { describe, it, expect } from 'vitest';
import { selecaoDoArrasto, togglesNecessarios, type ArrastoSelecao } from '../../src/utils/arrastoSelecao';

const NOMES = ['A', 'B', 'C', 'D', 'E'];
const arrasto = (ancora: number, valor: boolean, antes: string[] = []): ArrastoSelecao =>
  ({ ancora, valor, antes: new Set(antes) });

const lista = (s: Set<string>): string[] => [...s].sort();

describe('selecaoDoArrasto — descer marca', () => {
  it('do A até o C marca A, B e C', () => {
    expect(lista(selecaoDoArrasto(NOMES, arrasto(0, true), 2))).toEqual(['A', 'B', 'C']);
  });

  it('parado na âncora marca só ela', () => {
    expect(lista(selecaoDoArrasto(NOMES, arrasto(0, true), 0))).toEqual(['A']);
  });

  it('arrastar pra CIMA a partir da âncora também marca (faixa vale nos dois lados)', () => {
    expect(lista(selecaoDoArrasto(NOMES, arrasto(3, true), 1))).toEqual(['B', 'C', 'D']);
  });
});

describe('🎯 subir pra cima DESMARCA o que acabou de marcar', () => {
  it('desceu até o D e voltou pro B: C e D saem', () => {
    const a = arrasto(0, true);
    expect(lista(selecaoDoArrasto(NOMES, a, 3))).toEqual(['A', 'B', 'C', 'D']);
    // ...mouse volta pra cima, encolhendo a faixa:
    expect(lista(selecaoDoArrasto(NOMES, a, 1))).toEqual(['A', 'B']);
  });

  it('voltar até a própria âncora deixa só ela', () => {
    const a = arrasto(1, true);
    expect(lista(selecaoDoArrasto(NOMES, a, 4))).toEqual(['B', 'C', 'D', 'E']);
    expect(lista(selecaoDoArrasto(NOMES, a, 1))).toEqual(['B']);
  });
});

describe('quem já estava marcado antes do arrasto', () => {
  it('🔴 encolher a faixa DEVOLVE o estado anterior, não zera', () => {
    // E já estava selecionado de antes. O arrasto A→C não pode derrubar o E.
    const a = arrasto(0, true, ['E']);
    expect(lista(selecaoDoArrasto(NOMES, a, 2))).toEqual(['A', 'B', 'C', 'E']);
    expect(lista(selecaoDoArrasto(NOMES, a, 0))).toEqual(['A', 'E']);
  });

  it('começar num JÁ MARCADO desmarca a faixa (valor = false)', () => {
    const a = arrasto(1, false, ['B', 'C', 'D']);
    expect(lista(selecaoDoArrasto(NOMES, a, 3))).toEqual([]);
    // voltando, C e D recuperam o que eram antes
    expect(lista(selecaoDoArrasto(NOMES, a, 1))).toEqual(['C', 'D']);
  });

  it('🔑 selecionado que o FILTRO escondeu não pode sumir no arrasto', () => {
    // "Z" estava selecionado mas não está na lista visível: o operador não viu,
    // então o arrasto não decidiu nada sobre ele.
    const a = arrasto(0, true, ['Z']);
    expect(lista(selecaoDoArrasto(NOMES, a, 1))).toEqual(['A', 'B', 'Z']);
  });
});

describe('togglesNecessarios — alterna só o que muda', () => {
  it('nada a fazer quando já está no estado desejado', () => {
    const atual = new Set(['A', 'B']);
    expect(togglesNecessarios(NOMES, atual, new Set(['A', 'B']))).toEqual([]);
  });

  it('devolve só a diferença, nos dois sentidos', () => {
    const atual = new Set(['A', 'B']);
    const desejada = new Set(['B', 'C']);
    expect(togglesNecessarios(NOMES, atual, desejada)).toEqual(['A', 'C']);
  });

  it('ignora quem não está na lista visível', () => {
    // "Z" difere entre atual e desejada, mas não aparece: não pode ser alternado
    // pela tela, que só conhece o que renderizou.
    expect(togglesNecessarios(NOMES, new Set(['Z']), new Set([]))).toEqual([]);
  });

  it('caso real: descer 3 grupos a partir do zero alterna exatamente 3', () => {
    const desejada = selecaoDoArrasto(NOMES, arrasto(0, true), 2);
    expect(togglesNecessarios(NOMES, new Set(), desejada)).toEqual(['A', 'B', 'C']);
  });
});
