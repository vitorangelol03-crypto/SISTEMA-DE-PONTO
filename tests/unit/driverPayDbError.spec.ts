import { describe, it, expect } from 'vitest';
import { throwDbError } from '../../src/services/driverPay';
import { mensagemDeErro } from '../../src/utils/mensagemDeErro';

/**
 * Regressão do bug de prod 2026-07-18: sessão expirada (JWT vencido → PATCH 401)
 * aparecia como toast genérico "Erro ao renomear grupo", porque o objeto de erro
 * do PostgREST não é instanceof Error e os catch das telas caíam no fallback.
 * throwDbError converte SEMPRE em Error com mensagem legível.
 */
describe('throwDbError — tradutor de erros do PostgREST', () => {
  it('JWT expirado por código PGRST301 → mensagem de sessão expirada', () => {
    expect(() => throwDbError({ code: 'PGRST301', message: 'JWT expired' })).toThrowError(
      /Sessão expirada — saia e faça login novamente/
    );
  });

  it('JWT expirado só pela mensagem (sem código) → sessão expirada', () => {
    expect(() => throwDbError({ message: 'JWT expired' })).toThrowError(/Sessão expirada/);
  });

  it('JWT inválido → sessão expirada', () => {
    expect(() => throwDbError({ message: 'invalid JWT: unable to parse' })).toThrowError(/Sessão expirada/);
  });

  it('violação de nome único (23505) → "Já existe um registro com esse nome."', () => {
    expect(() =>
      throwDbError({ code: '23505', message: 'duplicate key value violates unique constraint "driverpay_groups_company_id_name_key"' })
    ).toThrowError(/Já existe um registro com esse nome/);
  });

  it('duplicate key só pela mensagem → mesma tradução', () => {
    expect(() => throwDbError({ message: 'duplicate key value violates unique constraint "x"' })).toThrowError(
      /Já existe um registro/
    );
  });

  it('erro comum → repassa a mensagem real (não engole)', () => {
    expect(() => throwDbError({ message: 'new row violates row-level security policy' })).toThrowError(
      /row-level security/
    );
  });

  it('erro sem mensagem → fallback legível', () => {
    expect(() => throwDbError({})).toThrowError(/Erro de comunicação com o banco de dados/);
  });

  it('o que sai é SEMPRE instanceof Error (toast mostra e.message)', () => {
    try {
      throwDbError({ code: 'PGRST301', message: 'JWT expired' });
      expect.unreachable('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  // 15/09/2026: a tela passou a mostrar a causa real em todas as abas. O erro CRU (em
  // inglês) sai marcado e com o código, pra tela juntar o contexto; o traduzido segue
  // saindo sozinho, como sempre.
  it('erro cru sai marcado com o código, e a tela junta o contexto', () => {
    let capturado: unknown;
    try {
      throwDbError({ code: '42501', message: 'new row violates row-level security policy' });
    } catch (e) {
      capturado = e;
    }
    expect(capturado).toBeInstanceOf(Error);
    expect(mensagemDeErro(capturado, 'Erro ao salvar pacotes'))
      .toBe('Erro ao salvar pacotes: new row violates row-level security policy (código 42501)');
  });

  it('erro traduzido continua saindo sozinho na tela', () => {
    let capturado: unknown;
    try {
      throwDbError({ code: 'PGRST301', message: 'JWT expired' });
    } catch (e) {
      capturado = e;
    }
    expect(mensagemDeErro(capturado, 'Erro ao renomear grupo'))
      .toBe('Sessão expirada — saia e faça login novamente para continuar.');
  });
});
