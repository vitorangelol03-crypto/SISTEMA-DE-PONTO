/**
 * Triagem dos prints recebidos — a aba "Precisam de você" (05/08/2026).
 *
 * O BUG QUE ISTO IMPEDE DE VOLTAR (print do MEIRIVALDO, produção):
 * o print dele foi lido quando a planilha ainda dizia 1401 e o print dizia 1402 → ficou
 * gravado `check_status: 'divergente'`. Depois a planilha foi corrigida pra 1402 e o Victor
 * validou na mão. Mesmo assim o cartão continuava em "Precisam de você", com um selo verde
 * "confere ✓" ao lado — porque a triagem olhava só o carimbo antigo, que ninguém apaga.
 * Uma vez divergente, divergente pra sempre.
 *
 * REGRA: validação HUMANA encerra o assunto. Só a RECUSA continua pedindo ação (o
 * entregador precisa mandar outro print).
 *
 * ⚠️ Errar aqui significa ou pendência eterna (o operador não confia mais na aba) ou
 * problema escondido (print divergente saindo da lista sem ninguém ver).
 *
 * Roda com: npx vitest run driverPayTriagemPrints
 */
import { describe, it, expect } from 'vitest';
import {
  proofPrecisaAtencao,
  validadoPorPessoa,
  type ProofParaTriagem,
} from '../../src/components/driverpay/driverPayShared';

const proof = (p: Partial<ProofParaTriagem> = {}): ProofParaTriagem => ({
  id: 'p1',
  status: 'recebido',
  checkStatus: 'ok',
  validatedBy: null,
  nextCheckAt: null,
  ...p,
});

describe('validadoPorPessoa', () => {
  it('validado por gente (id do usuário)', () => {
    expect(validadoPorPessoa(proof({ status: 'validado', validatedBy: '2626' }))).toBe(true);
  });

  it('⚠️ validado pelo SISTEMA grava null — não é validação humana', () => {
    expect(validadoPorPessoa(proof({ status: 'validado', validatedBy: null }))).toBe(false);
  });

  it('recebido com validatedBy preenchido não conta (status manda)', () => {
    expect(validadoPorPessoa(proof({ status: 'recebido', validatedBy: '2626' }))).toBe(false);
  });
});

describe('proofPrecisaAtencao', () => {
  it('🎯 CASO MEIRIVALDO: divergente ANTIGO + validado na mão = SAI da fila', () => {
    const meirivaldo = proof({ status: 'validado', checkStatus: 'divergente', validatedBy: '2626' });
    expect(proofPrecisaAtencao(meirivaldo)).toBe(false);
  });

  it('divergente e NINGUÉM validou: continua pedindo atenção', () => {
    expect(proofPrecisaAtencao(proof({ status: 'recebido', checkStatus: 'divergente' }))).toBe(true);
  });

  it('🎯 RECUSADO pede atenção mesmo depois de alguém ter validado antes', () => {
    // o entregador precisa mandar outro print — validação passada não apaga isso
    expect(proofPrecisaAtencao(proof({ status: 'rejeitado', validatedBy: '2626' }))).toBe(true);
  });

  it('validado pelo sistema, tudo ok: não pede nada', () => {
    expect(proofPrecisaAtencao(proof({ status: 'validado', checkStatus: 'ok', validatedBy: null }))).toBe(false);
  });

  it('parado — nem validado, nem na fila: pede atenção', () => {
    expect(proofPrecisaAtencao(proof({ status: 'recebido', checkStatus: null, nextCheckAt: null }))).toBe(true);
  });

  it('na FILA de releitura não é pendência do operador — o sistema tenta sozinho', () => {
    const naFila = proof({ status: 'recebido', checkStatus: 'pendente', nextCheckAt: '2026-08-05T12:00:00Z' });
    expect(proofPrecisaAtencao(naFila)).toBe(false);
  });

  it('ilegível e parado: pede atenção', () => {
    expect(proofPrecisaAtencao(proof({ status: 'recebido', checkStatus: 'ilegivel' }))).toBe(true);
  });

  it('print REPETIDO pede atenção (o app da Shopee não diz de quem é a foto)', () => {
    expect(proofPrecisaAtencao(proof({ status: 'validado', validatedBy: null }), new Set(['p1']))).toBe(true);
  });

  it('🎯 repetido que uma PESSOA já validou sai da fila — ela viu e decidiu', () => {
    const decidido = proof({ status: 'validado', validatedBy: '2626' });
    expect(proofPrecisaAtencao(decidido, new Set(['p1']))).toBe(false);
  });

  it('sem lista de repetidos funciona igual (parâmetro opcional)', () => {
    expect(proofPrecisaAtencao(proof({ status: 'validado', validatedBy: null }))).toBe(false);
  });

  it('⚠️ divergente validado por pessoa NÃO pode voltar pra fila numa nova leitura da tela', () => {
    // a mesma entrada, chamada duas vezes, dá o mesmo resultado (função pura, sem estado)
    const p = proof({ status: 'validado', checkStatus: 'divergente', validatedBy: '2626' });
    expect(proofPrecisaAtencao(p)).toBe(proofPrecisaAtencao(p));
    expect(proofPrecisaAtencao(p)).toBe(false);
  });
});
