import { describe, it, expect } from 'vitest';
import {
  LIMITE_FACIAL,
  MARGEM_MINIMA_1N,
  decidirIdentificacao,
  type CandidatoFacial,
} from '../../supabase/functions/_shared/faceIdentify';
import { FACE_MATCH_THRESHOLD } from '../../src/components/employee-clock/clockGuards';

/**
 * Facial SEM CPF (1:N) — 30/09/2026.
 *
 * O caso real: o 1:N nasceu com limite 0,42 e recusava gente certa. Das 597 batidas com facial
 * 1:1 aceitas em 14 dias (pessoa confirmada por CPF + senha + rosto), 250 tinham distância
 * entre 0,42 e 0,50 — a tela sem CPF diria "Não reconheci" pra elas. Decisão do Victor: o 1:N
 * exige o MESMO nível do 1:1.
 */

function c(id: string, distance: number): CandidatoFacial {
  return { id, name: `Pessoa ${id}`, cpf: `0000000000${id}`.slice(-11), distance };
}

describe('limite único da facial', () => {
  it('1:N e 1:1 usam o MESMO número — e o navegador também', () => {
    expect(LIMITE_FACIAL).toBe(0.5);
    // FaceVerification (1:1 no navegador) usa FACE_MATCH_THRESHOLD; o servidor reconfere com
    // LIMITE_FACIAL. Se um mudar sem o outro, a pessoa passa na tela e é recusada no servidor.
    expect(FACE_MATCH_THRESHOLD).toBe(LIMITE_FACIAL);
  });
});

describe('decidirIdentificacao', () => {
  it('🔴 regressão do caso real: 0,46 com o 2º longe = RECONHECE (o limite antigo 0,42 recusava)', () => {
    const r = decidirIdentificacao([c('1', 0.46), c('2', 0.71), c('3', 0.8)]);
    expect(r.outcome).toBe('matched');
    expect(r.best?.id).toBe('1');
  });

  it('a borda é exclusiva: 0,50 não passa (igual ao 1:1)', () => {
    expect(decidirIdentificacao([c('1', 0.5), c('2', 0.9)]).outcome).toBe('no_match');
    expect(decidirIdentificacao([c('1', 0.4999), c('2', 0.9)]).outcome).toBe('matched');
  });

  it('dois parecidos demais entre si = AMBÍGUO, não escolhe ninguém', () => {
    const r = decidirIdentificacao([c('1', 0.3), c('2', 0.35)]);
    expect(r.outcome).toBe('ambiguous');
    expect(r.second?.id).toBe('2');
  });

  it('com a margem mínima de folga, escolhe o 1º', () => {
    expect(MARGEM_MINIMA_1N).toBe(0.08);
    expect(decidirIdentificacao([c('1', 0.3), c('2', 0.39)]).outcome).toBe('matched');
  });

  it('ninguém perto o bastante = no_match (mesmo que dois estejam juntos lá longe)', () => {
    expect(decidirIdentificacao([c('1', 0.62), c('2', 0.63)]).outcome).toBe('no_match');
  });

  it('empresa sem ninguém cadastrado = no_candidates', () => {
    expect(decidirIdentificacao([])).toEqual({ outcome: 'no_candidates', best: null, second: null });
  });

  it('um cadastrado só: decide só pelo limite', () => {
    expect(decidirIdentificacao([c('1', 0.44)]).outcome).toBe('matched');
    expect(decidirIdentificacao([c('1', 0.55)]).outcome).toBe('no_match');
  });

  it('a ordem de chegada não importa; distância inválida é descartada', () => {
    const r = decidirIdentificacao([c('3', 0.9), c('x', Number.NaN), c('1', 0.2), c('2', 0.7)]);
    expect(r.best?.id).toBe('1');
    expect(r.second?.id).toBe('2');
    expect(r.outcome).toBe('matched');
  });
});
