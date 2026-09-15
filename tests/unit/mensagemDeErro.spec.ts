import { describe, it, expect } from 'vitest';
import { mensagemDeErro, traduzirErroDoBanco } from '../../src/utils/mensagemDeErro';

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

  it('erro técnico do navegador (TypeError) ganha o contexto, senão fica sem sentido', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'), 'Erro ao carregar dados'))
      .toBe('Erro ao carregar dados: Failed to fetch');
  });

  it('erro de classe própria com código (ex.: PostgrestError) ganha contexto e código', () => {
    class ErroComCodigo extends Error {
      code = '42501';
      constructor(message: string) {
        super(message);
        this.name = 'PostgrestError';
      }
    }
    expect(mensagemDeErro(new ErroComCodigo('permission denied for table x'), 'Erro ao salvar pacotes'))
      .toBe('Erro ao salvar pacotes: permission denied for table x (código 42501)');
  });

  it('contexto que já termina em ponto recebe a causa depois de "Motivo:"', () => {
    expect(mensagemDeErro(ERRO_REAL_DO_SUPABASE, 'Não consegui gerar os recibos. Tente de novo.')).toBe(
      'Não consegui gerar os recibos. Tente de novo. Motivo: permission denied for table triage_error_distributions (código 42501)',
    );
  });

  it('sessão expirada vira a frase em português, venha como objeto ou como Error', () => {
    const frase = 'Sessão expirada — saia e faça login novamente para continuar.';
    expect(mensagemDeErro({ code: 'PGRST301', message: 'JWT expired' }, 'Erro ao salvar')).toBe(frase);
    expect(mensagemDeErro(new Error('JWT expired'), 'Erro ao salvar')).toBe(frase);
  });

  it('nome repetido vira "Já existe um registro com esse nome."', () => {
    expect(mensagemDeErro(
      { code: '23505', message: 'duplicate key value violates unique constraint "bonus_types_code_key"' },
      'Erro ao salvar',
    )).toBe('Já existe um registro com esse nome.');
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

describe('traduzirErroDoBanco', () => {
  it('só traduz o que tem frase certa; o resto devolve null', () => {
    expect(traduzirErroDoBanco({ code: 'PGRST301', message: 'JWT expired' })).toMatch(/Sessão expirada/);
    expect(traduzirErroDoBanco({ message: 'invalid JWT: unable to parse' })).toMatch(/Sessão expirada/);
    expect(traduzirErroDoBanco({ message: 'duplicate key value violates unique constraint "x"' })).toMatch(/Já existe/);
    expect(traduzirErroDoBanco({ message: 'new row violates row-level security policy' })).toBeNull();
    expect(traduzirErroDoBanco({})).toBeNull();
  });
});
