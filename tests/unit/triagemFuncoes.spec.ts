import { describe, it, expect } from 'vitest';
import { entraNaTriagem, marcarFuncao, TRIAGE_CONFIG_PADRAO, type TriageConfig } from '../../src/utils/triagemFuncoes';

// O caso real que motivou (15/09/2026): Caratinga com o administrativo fora.
const CARATINGA: TriageConfig = {
  excludedFunctionRoles: ['Auxiliar Administrativo'],
  excludeNoFunction: false,
};

describe('entraNaTriagem', () => {
  it('sem configuração salva, todo mundo entra (como sempre foi)', () => {
    for (const funcao of ['Triagem - Shopee', 'Auxiliar Administrativo', null, undefined, '']) {
      expect(entraNaTriagem(funcao, TRIAGE_CONFIG_PADRAO)).toBe(true);
    }
  });

  it('função desmarcada fica fora; as outras entram', () => {
    expect(entraNaTriagem('Auxiliar Administrativo', CARATINGA)).toBe(false);
    expect(entraNaTriagem('Triagem - Shopee', CARATINGA)).toBe(true);
    expect(entraNaTriagem('Triagem - Transportadoras', CARATINGA)).toBe(true);
  });

  it('função nova, que ninguém desmarcou, entra', () => {
    expect(entraNaTriagem('Conferente', CARATINGA)).toBe(true);
  });

  it('espaço nas pontas do cadastro não tira ninguém da regra', () => {
    expect(entraNaTriagem('  Auxiliar Administrativo ', CARATINGA)).toBe(false);
  });

  it('sem função: entra por padrão, fica fora se desmarcado', () => {
    for (const vazio of [null, undefined, '', '   ']) {
      expect(entraNaTriagem(vazio, CARATINGA)).toBe(true);
      expect(entraNaTriagem(vazio, { ...CARATINGA, excludeNoFunction: true })).toBe(false);
    }
  });
});

describe('marcarFuncao', () => {
  it('desmarcar acrescenta sem apagar as outras, em ordem e sem repetir', () => {
    const depois = marcarFuncao(CARATINGA, 'Triagem - Transportadoras', false);
    expect(depois.excludedFunctionRoles).toEqual(['Auxiliar Administrativo', 'Triagem - Transportadoras']);
    expect(marcarFuncao(depois, 'Triagem - Transportadoras', false).excludedFunctionRoles)
      .toEqual(['Auxiliar Administrativo', 'Triagem - Transportadoras']);
  });

  it('marcar tira só aquela função da lista de fora', () => {
    expect(marcarFuncao(CARATINGA, 'Auxiliar Administrativo', true).excludedFunctionRoles).toEqual([]);
  });

  it('não mexe no "sem função" nem na configuração original', () => {
    const original: TriageConfig = { excludedFunctionRoles: ['A'], excludeNoFunction: true };
    const depois = marcarFuncao(original, 'B', false);
    expect(depois.excludeNoFunction).toBe(true);
    expect(original.excludedFunctionRoles).toEqual(['A']);
  });
});
