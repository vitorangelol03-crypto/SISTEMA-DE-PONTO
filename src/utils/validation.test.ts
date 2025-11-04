import { describe, it, expect } from 'vitest';
import { validateCPF, formatCPF, isValidPassword, isNumericString } from './validation';

describe('validation.ts - Funções de Validação', () => {
  describe('validateCPF', () => {
    it('deve validar CPF válido', () => {
      expect(validateCPF('123.456.789-09')).toBe(true);
      expect(validateCPF('12345678909')).toBe(true);
    });

    it('deve rejeitar CPF inválido', () => {
      expect(validateCPF('111.111.111-11')).toBe(false);
      expect(validateCPF('000.000.000-00')).toBe(false);
      expect(validateCPF('123.456.789-00')).toBe(false);
    });

    it('deve rejeitar CPF com tamanho incorreto', () => {
      expect(validateCPF('123')).toBe(false);
      expect(validateCPF('123456789012345')).toBe(false);
    });

    it('deve rejeitar CPF com todos dígitos iguais', () => {
      expect(validateCPF('11111111111')).toBe(false);
      expect(validateCPF('22222222222')).toBe(false);
      expect(validateCPF('99999999999')).toBe(false);
    });
  });

  describe('formatCPF', () => {
    it('deve formatar CPF corretamente', () => {
      expect(formatCPF('12345678909')).toBe('123.456.789-09');
    });

    it('deve remover caracteres não numéricos antes de formatar', () => {
      expect(formatCPF('123.456.789-09')).toBe('123.456.789-09');
      expect(formatCPF('123abc456def789ghi09')).toBe('123.456.789-09');
    });
  });

  describe('isValidPassword', () => {
    it('deve aceitar senhas com 6 ou mais caracteres', () => {
      expect(isValidPassword('123456')).toBe(true);
      expect(isValidPassword('senhaForte123')).toBe(true);
    });

    it('deve rejeitar senhas com menos de 6 caracteres', () => {
      expect(isValidPassword('12345')).toBe(false);
      expect(isValidPassword('abc')).toBe(false);
      expect(isValidPassword('')).toBe(false);
    });
  });

  describe('isNumericString', () => {
    it('deve retornar true para strings numéricas', () => {
      expect(isNumericString('123')).toBe(true);
      expect(isNumericString('0')).toBe(true);
      expect(isNumericString('999999')).toBe(true);
    });

    it('deve retornar false para strings não numéricas', () => {
      expect(isNumericString('abc')).toBe(false);
      expect(isNumericString('123abc')).toBe(false);
      expect(isNumericString('12.34')).toBe(false);
      expect(isNumericString('')).toBe(false);
    });
  });
});
