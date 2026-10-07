import { describe, it, expect } from 'vitest';
import {
  LIMITE_FACIAL,
  decidirIdentificacao,
  escolherFichaDaPessoa,
  fichasDaPessoa,
  juntarCandidatosPorCpf,
  pontoAbertoNoDia,
  type CandidatoFacialComEmpresa,
} from '../../supabase/functions/_shared/faceIdentify';

/**
 * MODO GALPÃO — o rosto procurado nas DUAS empresas do tablet (06/10/2026, decisão 7 do plano do
 * tablet sem toque): Caratinga e Ponte Nova no mesmo galpão. Quem tem ficha nas duas (mesmo CPF)
 * bate onde já tem ponto aberto no dia; sem ponto aberto, na empresa "de casa" do tablet.
 *
 * Roda com: npx vitest run faceIdentifyDuasEmpresas
 */

const CARATINGA = 'emp-caratinga';
const PONTE_NOVA = 'emp-ponte-nova';

function ficha(id: string, cpf: string, companyId: string, distance: number): CandidatoFacialComEmpresa {
  return { id, name: `Pessoa ${id}`, cpf, companyId, distance };
}

describe('juntarCandidatosPorCpf — a mesma pessoa nas 2 empresas não vira "ambíguo"', () => {
  it('sem juntar, as 2 fichas da MESMA pessoa empatam e o 1:N recusa; juntando, reconhece', () => {
    const candidatos = [
      ficha('maria-car', '111.222.333-44', CARATINGA, 0.30),
      ficha('maria-pn', '11122233344', PONTE_NOVA, 0.33),
      ficha('joao', '99988877766', CARATINGA, 0.62),
    ];
    expect(decidirIdentificacao(candidatos).outcome).toBe('ambiguous'); // o defeito que a junção evita
    const juntos = juntarCandidatosPorCpf(candidatos);
    expect(juntos.map((c) => c.id).sort()).toEqual(['joao', 'maria-car']);
    const r = decidirIdentificacao(juntos);
    expect(r.outcome).toBe('matched');
    expect(r.best?.id).toBe('maria-car');
  });

  it('pessoas DIFERENTES parecidas continuam "ambíguo" (a margem contra o 2º segue valendo)', () => {
    const juntos = juntarCandidatosPorCpf([
      ficha('a', '11111111111', CARATINGA, 0.30),
      ficha('b', '22222222222', PONTE_NOVA, 0.33),
    ]);
    expect(decidirIdentificacao(juntos).outcome).toBe('ambiguous');
  });

  it('ficha sem CPF não é juntada com ninguém', () => {
    const juntos = juntarCandidatosPorCpf([
      ficha('x', '', CARATINGA, 0.2),
      ficha('y', '', PONTE_NOVA, 0.25),
    ]);
    expect(juntos).toHaveLength(2);
  });
});

describe('fichasDaPessoa — só fichas do MESMO CPF que também batem com o rosto', () => {
  it('fica de fora a ficha da mesma pessoa cujo rosto cadastrado não bate (o 1:1 do servidor recusaria)', () => {
    const todos = [
      ficha('maria-car', '11122233344', CARATINGA, 0.30),
      ficha('maria-pn', '11122233344', PONTE_NOVA, LIMITE_FACIAL + 0.05),
      ficha('joao', '99988877766', CARATINGA, 0.31),
    ];
    expect(fichasDaPessoa(todos, todos[0]).map((f) => f.id)).toEqual(['maria-car']);
  });
});

describe('pontoAbertoNoDia', () => {
  it('2 marcações: entrou e não saiu = aberto', () => {
    expect(pontoAbertoNoDia({ entry_time: '2026-10-06T10:00:00Z', exit_time_full: null })).toBe(true);
    expect(pontoAbertoNoDia({ entry_time: '2026-10-06T10:00:00Z', exit_time_full: '2026-10-06T19:00:00Z' })).toBe(false);
  });
  it('4 marcações: aberto até a saída final', () => {
    expect(pontoAbertoNoDia({ entry_1_time: '2026-10-06T10:00:00Z', exit_2_time: null })).toBe(true);
    expect(pontoAbertoNoDia({ entry_1_time: '2026-10-06T10:00:00Z', exit_2_time: '2026-10-06T19:00:00Z' })).toBe(false);
  });
  it('sem registro ou sem entrada = não aberto', () => {
    expect(pontoAbertoNoDia(null)).toBe(false);
    expect(pontoAbertoNoDia({})).toBe(false);
  });
});

describe('escolherFichaDaPessoa — decisão 7', () => {
  const car = ficha('maria-car', '11122233344', CARATINGA, 0.33);
  const pn = ficha('maria-pn', '11122233344', PONTE_NOVA, 0.30);

  it('ponto aberto no dia manda: bate onde já entrou, mesmo fora da empresa de casa', () => {
    expect(escolherFichaDaPessoa([car, pn], CARATINGA, new Set(['maria-pn']))?.id).toBe('maria-pn');
  });
  it('sem ponto aberto: a empresa de casa do tablet', () => {
    expect(escolherFichaDaPessoa([car, pn], CARATINGA, new Set())?.id).toBe('maria-car');
    expect(escolherFichaDaPessoa([car, pn], PONTE_NOVA, new Set())?.id).toBe('maria-pn');
  });
  it('sem ficha na empresa de casa: a mais parecida', () => {
    expect(escolherFichaDaPessoa([car, pn], 'outra-empresa', new Set())?.id).toBe('maria-pn');
  });
  it('uma ficha só (o caso de hoje): é ela', () => {
    expect(escolherFichaDaPessoa([pn], CARATINGA, new Set())?.id).toBe('maria-pn');
    expect(escolherFichaDaPessoa([], CARATINGA, new Set())).toBeNull();
  });
});
