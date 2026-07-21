import { describe, it, expect } from 'vitest';
import { clockFailureMessage } from '../../src/components/employee-clock/clockMessages';

// Regressão do bug de 2026-07-20: recusa de geolocalização vinha no campo
// `message` (HTTP 200) e a tela só lia `error` → funcionário via erro genérico.
describe('clockFailureMessage', () => {
  it('usa o campo error quando presente (erros 4xx/5xx)', () => {
    expect(clockFailureMessage({ error: 'Nenhuma entrada registrada hoje' }))
      .toBe('❌ Nenhuma entrada registrada hoje');
  });

  it('usa o campo message quando error está ausente (recusas de negócio)', () => {
    expect(clockFailureMessage({ message: 'Localização não fornecida' }))
      .toBe('❌ Localização não fornecida');
  });

  it('mostra o motivo de fora da área permitida', () => {
    expect(clockFailureMessage({ message: 'Fora da área permitida (350m)' }))
      .toBe('❌ Fora da área permitida (350m)');
  });

  it('error tem prioridade sobre message quando os dois vêm', () => {
    expect(clockFailureMessage({ error: 'CPF não confere', message: 'outro' }))
      .toBe('❌ CPF não confere');
  });

  it('cai no genérico quando nenhum motivo vem', () => {
    expect(clockFailureMessage({}))
      .toBe('❌ Erro ao registrar ponto. Tente novamente.');
  });
});
