/**
 * O que falta na ficha pra folha sair (22/09/2026).
 *
 * A folha é honesta e silenciosa: sem salário, a pessoa não ganha linha nenhuma; sem data
 * de admissão, o direito de férias não é calculado. Quem olha a tela vê "não tem nada" e
 * não "falta preencher" — e hoje, em Caratinga, são 14 de 14 fichas de carteira assinada
 * sem salário. Esta conta é o que transforma o silêncio em lista com nome.
 *
 * Roda com: npx vitest run pendenciasDeCadastro
 */
import { describe, it, expect } from 'vitest';
import {
  pendenciasDeCadastro,
  quantasPessoasComPendencia,
  type FichaParaPendencia,
} from '../../src/utils/folha/pendenciasDeCadastro';

const ficha = (p: Partial<FichaParaPendencia> & { id: string; name: string }): FichaParaPendencia => ({
  employment_type: 'Carteira Assinada',
  contract_type: 'Carteira Assinada',
  monthly_salary: 2000,
  hire_date: '2025-03-01',
  fgts_enabled: true,
  registration_status: 'approved',
  termination_date: null,
  ...p,
});

const tipos = (fichas: FichaParaPendencia[]) => pendenciasDeCadastro(fichas).map((p) => p.tipo);

describe('pendenciasDeCadastro', () => {
  it('ficha completa não gera pendência nenhuma', () => {
    expect(pendenciasDeCadastro([ficha({ id: '1', name: 'Ana' })])).toEqual([]);
  });

  it('🎯 sem salário: a folha do mês não sai', () => {
    const r = pendenciasDeCadastro([ficha({ id: '1', name: 'Ana', monthly_salary: 0 })]);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('sem-salario');
    expect(r[0].pessoas).toEqual([{ id: '1', name: 'Ana' }]);
    expect(r[0].efeito).toMatch(/NÃO sai/);
  });

  it('salário nulo conta igual a zero', () => {
    expect(tipos([ficha({ id: '1', name: 'Ana', monthly_salary: null })])).toContain('sem-salario');
  });

  it('🎯 sem data de admissão: férias, 13º e rescisão ficam sem avos', () => {
    expect(tipos([ficha({ id: '1', name: 'Ana', hire_date: null })])).toEqual(['sem-admissao']);
    expect(tipos([ficha({ id: '2', name: 'Bia', hire_date: '   ' })])).toEqual(['sem-admissao']);
  });

  it('carteira assinada com FGTS desligado entra como aviso', () => {
    expect(tipos([ficha({ id: '1', name: 'Ana', fgts_enabled: false })])).toEqual(['fgts-desligado']);
    expect(tipos([ficha({ id: '2', name: 'Bia', fgts_enabled: null })])).toEqual(['fgts-desligado']);
  });

  it('🎯 os dois campos de vínculo discordando viram pendência, com os dois valores', () => {
    const r = pendenciasDeCadastro([
      ficha({ id: '1', name: 'Ana', employment_type: 'Carteira Assinada', contract_type: 'Diarista' }),
    ]);
    expect(r.map((p) => p.tipo)).toEqual(['vinculo-divergente']);
    expect(r[0].pessoas[0].detalhe).toBe('Carteira Assinada × Diarista');
  });

  it('🔑 "CLT" e "Carteira Assinada" são a MESMA coisa — não é divergência', () => {
    // É o caso de 21 fichas hoje: o campo operacional diz "Carteira Assinada" e o de
    // cadastro diz "CLT". Comparar as strings cruas acusaria 21 problemas que não existem
    // e esconderia os 6 de verdade (Diarista × CLT).
    expect(pendenciasDeCadastro([
      ficha({ id: '1', name: 'Ana', employment_type: 'Carteira Assinada', contract_type: 'CLT' }),
    ])).toEqual([]);
  });

  it('🎯 a divergência de verdade: Diarista × CLT', () => {
    const r = pendenciasDeCadastro([
      ficha({ id: '1', name: 'Zeca', employment_type: 'Diarista', contract_type: 'CLT',
              monthly_salary: 0, hire_date: null, fgts_enabled: false }),
    ]);
    expect(r.map((p) => p.tipo)).toEqual(['vinculo-divergente']);
    expect(r[0].pessoas[0].detalhe).toBe('Diarista × CLT');
  });

  it('🎯 carteira assinada com cadastro PENDENTE aparece — é o caso de Ponte Nova', () => {
    // 3 pessoas de PN batem ponto há meses (259, 264 e 92 registros) com o cadastro
    // "pending": não entram em folha nenhuma e nada na tela dizia isso.
    const r = pendenciasDeCadastro([
      ficha({ id: '1', name: 'Ronaldo', registration_status: 'pending', contract_type: 'CLT' }),
      ficha({ id: '2', name: 'Euder', registration_status: 'pending', contract_type: 'CLT' }),
    ]);
    expect(r.map((p) => p.tipo)).toEqual(['cadastro-pendente']);
    expect(r[0].pessoas).toHaveLength(2);
    expect(r[0].efeito).toMatch(/NÃO aprovado/);
  });

  it('diarista não é cobrado por salário, admissão nem FGTS', () => {
    const diarista = ficha({
      id: '1', name: 'Zeca', employment_type: 'Diarista', contract_type: 'Diarista',
      monthly_salary: 0, hire_date: null, fgts_enabled: false,
    });
    expect(pendenciasDeCadastro([diarista])).toEqual([]);
  });

  it('quem saiu da empresa não entra', () => {
    const saiu = ficha({ id: '1', name: 'Ana', monthly_salary: 0, termination_date: '2026-08-31' });
    expect(pendenciasDeCadastro([saiu])).toEqual([]);
  });

  it('quem está pendente só entra como "cadastro-pendente" — não como falta de salário', () => {
    // O salário vazio de quem nem foi aprovado ainda não é a pendência a resolver: o
    // que falta primeiro é aprovar o cadastro.
    const pendente = ficha({ id: '1', name: 'Ana', monthly_salary: 0, registration_status: 'pending' });
    expect(tipos([pendente])).toEqual(['cadastro-pendente']);
  });

  it('cadastro RECUSADO não entra de jeito nenhum', () => {
    const recusado = ficha({ id: '2', name: 'Bia', monthly_salary: 0, registration_status: 'rejected' });
    expect(pendenciasDeCadastro([recusado])).toEqual([]);
  });

  it('quem saiu não vira "cadastro-pendente" nem estando pendente', () => {
    const saiu = ficha({ id: '1', name: 'Ana', registration_status: 'pending', termination_date: '2026-08-31' });
    expect(pendenciasDeCadastro([saiu])).toEqual([]);
  });

  it('ficha antiga sem registration_status conta como aprovada', () => {
    const antiga = ficha({ id: '1', name: 'Ana', monthly_salary: 0, registration_status: null });
    expect(tipos([antiga])).toEqual(['sem-salario']);
  });

  it('ordem é a do impacto: salário, admissão, FGTS, vínculo', () => {
    const tudo = ficha({
      id: '1', name: 'Ana', monthly_salary: 0, hire_date: null,
      fgts_enabled: false, contract_type: 'Diarista',
    });
    expect(tipos([tudo])).toEqual(['sem-salario', 'sem-admissao', 'fgts-desligado', 'vinculo-divergente']);
  });

  it('a mesma pessoa em 3 pendências conta como UMA no total', () => {
    const tudo = ficha({ id: '1', name: 'Ana', monthly_salary: 0, hire_date: null, fgts_enabled: false });
    expect(quantasPessoasComPendencia(pendenciasDeCadastro([tudo]))).toBe(1);
  });

  it('🎯 o retrato real de Caratinga (22/09): 14 sem salário, 12 sem admissão', () => {
    const fichas: FichaParaPendencia[] = Array.from({ length: 14 }, (_, i) =>
      ficha({
        id: `c${i}`, name: `Pessoa ${i}`, monthly_salary: 0,
        hire_date: i < 12 ? null : '2025-01-10',
      }));
    const r = pendenciasDeCadastro(fichas);
    expect(r.find((p) => p.tipo === 'sem-salario')!.pessoas).toHaveLength(14);
    expect(r.find((p) => p.tipo === 'sem-admissao')!.pessoas).toHaveLength(12);
    expect(quantasPessoasComPendencia(r)).toBe(14);
  });
});
