import { describe, it, expect } from 'vitest';
import { mensagemDeErro } from '../../src/utils/mensagemDeErro';

// O `error` que o Supabase devolveu de verdade em 15/09/2026 ao distribuir a
// triagem (corpo do 403 no log do banco): objeto comum, NÃO é instanceof Error.
const ERRO_REAL_DO_SUPABASE = {
  code: '42501',
  details: null,
  hint: null,
  message: 'permission denied for table triage_error_distributions',
};

describe('mensagemDeErro', () => {
  it('erro do Supabase mostra o contexto, a causa real e o código', () => {
    expect(ERRO_REAL_DO_SUPABASE instanceof Error).toBe(false);
    expect(mensagemDeErro(ERRO_REAL_DO_SUPABASE, 'Erro ao distribuir')).toBe(
      'Erro ao distribuir: permission denied for table triage_error_distributions (código 42501)',
    );
  });

  it('erro do Supabase sem código mostra só contexto e causa', () => {
    expect(mensagemDeErro({ message: 'Failed to fetch' }, 'Erro ao calcular'))
      .toBe('Erro ao calcular: Failed to fetch');
  });

  it('erro nosso (Error) continua saindo só com a mensagem, como antes', () => {
    const nosso = new Error('Nenhum funcionário presente nos dias com erro — distribuição impossível');
    expect(mensagemDeErro(nosso, 'Erro ao distribuir'))
      .toBe('Nenhum funcionário presente nos dias com erro — distribuição impossível');
  });

  it('mensagem vazia ou só com espaços cai no contexto', () => {
    expect(mensagemDeErro(new Error(''), 'Erro ao excluir')).toBe('Erro ao excluir');
    expect(mensagemDeErro({ message: '   ', code: '42501' }, 'Erro ao excluir')).toBe('Erro ao excluir');
    expect(mensagemDeErro('  ', 'Erro ao excluir')).toBe('Erro ao excluir');
  });

  it('código vazio não aparece', () => {
    expect(mensagemDeErro({ message: 'x', code: '' }, 'Erro ao registrar')).toBe('Erro ao registrar: x');
  });

  it('texto solto vira contexto + texto', () => {
    expect(mensagemDeErro('tempo esgotado', 'Erro ao carregar registros de triagem'))
      .toBe('Erro ao carregar registros de triagem: tempo esgotado');
  });

  it('o que não é erro (null, undefined, número, objeto sem mensagem) cai no contexto', () => {
    for (const coisa of [null, undefined, 42, {}, { code: '42501' }, { message: 123 }]) {
      expect(mensagemDeErro(coisa, 'Erro ao calcular')).toBe('Erro ao calcular');
    }
  });
});
