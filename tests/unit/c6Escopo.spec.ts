/**
 * Escopo do pagamento C6 — quem entra no arquivo do banco.
 *
 * Pedido do Victor (09/09/2026): "geral tudo junto, ou somente carteira assinada, ou
 * diaristas, ou 1 de um e outro de outro". Os três primeiros já saíam pelo filtro de tipo
 * de contrato; o **avulso** (escolher pessoa por pessoa, misturando os dois tipos) é o que
 * não existia — antes a exportação SEMPRE pegava a lista inteira, e a seleção de linhas só
 * servia pra trocar data em lote.
 *
 * Isto mexe em dinheiro: gerar de menos deixa gente sem receber, gerar de mais paga quem
 * não devia. Por isso a regra é testada isolada do componente.
 *
 * Roda com: npx vitest run c6Escopo
 */
import { describe, it, expect } from 'vitest';
import { linhasDoEscopo, ehEscopoAvulso } from '../../src/utils/c6Escopo';

type Linha = { id: string; nome: string };

const LISTA: Linha[] = [
  { id: 'a', nome: 'Ana (diarista)' },
  { id: 'b', nome: 'Bruno (carteira assinada)' },
  { id: 'c', nome: 'Carla (diarista)' },
  { id: 'd', nome: 'Davi (carteira assinada)' },
];

describe('linhasDoEscopo — sem seleção, nada muda', () => {
  it('sem ninguém marcado, sai a lista inteira (como era antes)', () => {
    expect(linhasDoEscopo(LISTA, new Set())).toEqual(LISTA);
  });

  it('devolve uma cópia — mexer no resultado não altera a lista da tela', () => {
    const saida = linhasDoEscopo(LISTA, new Set());
    saida.pop();
    expect(LISTA).toHaveLength(4);
  });

  it('lista vazia continua vazia', () => {
    expect(linhasDoEscopo([], new Set())).toEqual([]);
  });
});

describe('linhasDoEscopo — avulso', () => {
  it('marcou 1, sai só 1', () => {
    const saida = linhasDoEscopo(LISTA, new Set(['b']));
    expect(saida.map((l) => l.id)).toEqual(['b']);
  });

  it('"1 de um e outro de outro": mistura diarista e carteira assinada', () => {
    const saida = linhasDoEscopo(LISTA, new Set(['a', 'd']));
    expect(saida.map((l) => l.nome)).toEqual(['Ana (diarista)', 'Davi (carteira assinada)']);
  });

  it('mantém a ordem da tela, não a ordem em que foram marcados', () => {
    const saida = linhasDoEscopo(LISTA, new Set(['d', 'a', 'c']));
    expect(saida.map((l) => l.id)).toEqual(['a', 'c', 'd']);
  });

  it('marcar todo mundo é o mesmo que a lista inteira', () => {
    const saida = linhasDoEscopo(LISTA, new Set(['a', 'b', 'c', 'd']));
    expect(saida).toEqual(LISTA);
  });

  it('🔴 seleção órfã NÃO vira arquivo com todo mundo', () => {
    // Cenário real: a lista foi recarregada e as marcas ficaram apontando pra linhas que
    // não existem mais. O perigo seria cair no ramo "sem seleção" e pagar a lista inteira.
    const saida = linhasDoEscopo(LISTA, new Set(['zzz']));
    expect(saida).toEqual([]);
  });

  it('marca parcialmente órfã leva só quem ainda existe', () => {
    const saida = linhasDoEscopo(LISTA, new Set(['b', 'sumiu']));
    expect(saida.map((l) => l.id)).toEqual(['b']);
  });
});

describe('ehEscopoAvulso — quando avisar na tela', () => {
  it('sem seleção, não é avulso', () => {
    expect(ehEscopoAvulso(new Set())).toBe(false);
  });
  it('com seleção, é avulso (a tela precisa avisar quantos vão)', () => {
    expect(ehEscopoAvulso(new Set(['a']))).toBe(true);
  });
});
