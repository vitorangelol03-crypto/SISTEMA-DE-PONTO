import { describe, it, expect } from 'vitest';
import {
  validateCPF,
  formatCPF,
  isValidPassword,
  isNumericString,
  stripAccentsDashesDots,
  sanitizePublicRegistrationName,
  sanitizePublicRegistrationPixKey,
  sanitizePhoneDigits,
  validatePhoneDigits,
  formatPhoneDisplay,
} from './validation';

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

    it('deve rejeitar CPF nulo, vazio ou indefinido (CPF é opcional)', () => {
      expect(validateCPF('')).toBe(false);
      expect(validateCPF(null)).toBe(false);
      expect(validateCPF(undefined)).toBe(false);
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

    it('deve retornar string vazia para CPF nulo, vazio ou indefinido (CPF é opcional)', () => {
      expect(formatCPF('')).toBe('');
      expect(formatCPF(null)).toBe('');
      expect(formatCPF(undefined)).toBe('');
    });
  });

  describe('isValidPassword', () => {
    it('deve aceitar senhas com 4 ou mais caracteres', () => {
      expect(isValidPassword('1234')).toBe(true);
      expect(isValidPassword('123456')).toBe(true);
      expect(isValidPassword('senhaForte123')).toBe(true);
    });

    it('deve rejeitar senhas com menos de 4 caracteres', () => {
      expect(isValidPassword('123')).toBe(false);
      expect(isValidPassword('ab')).toBe(false);
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

  describe('stripAccentsDashesDots (cadastro público)', () => {
    it('remove acentos', () => {
      expect(stripAccentsDashesDots('José')).toBe('Jose');
      expect(stripAccentsDashesDots('João')).toBe('Joao');
      expect(stripAccentsDashesDots('conceição')).toBe('conceicao');
      expect(stripAccentsDashesDots('André')).toBe('Andre');
    });

    it('remove ponto e traço', () => {
      expect(stripAccentsDashesDots('joao.silva@gmail.com')).toBe('joaosilva@gmailcom');
      expect(stripAccentsDashesDots('a1b2c3d4-e5f6-0000-0000-000000000000')).toBe('a1b2c3d4e5f600000000000000000000');
      expect(stripAccentsDashesDots('Ana-Maria')).toBe('AnaMaria');
    });

    it('mantém letras, números e espaço', () => {
      expect(stripAccentsDashesDots('Maria da Silva 123')).toBe('Maria da Silva 123');
    });
  });

  describe('sanitizePublicRegistrationName', () => {
    it('remove acento e colapsa espaço duplo', () => {
      expect(sanitizePublicRegistrationName('José  da  Silva')).toBe('Jose da Silva');
    });

    it('tira espaço nas pontas', () => {
      expect(sanitizePublicRegistrationName('  João Souza  ')).toBe('Joao Souza');
    });
  });

  describe('sanitizePublicRegistrationPixKey', () => {
    it('remove acento/ponto/traço mesmo em e-mail e chave aleatória (decisão do Victor, 26/08)', () => {
      expect(sanitizePublicRegistrationPixKey('joao.silva@gmail.com')).toBe('joaosilva@gmailcom');
      expect(sanitizePublicRegistrationPixKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890'))
        .toBe('a1b2c3d4e5f67890abcdef1234567890');
    });
  });

  describe('sanitizePhoneDigits / validatePhoneDigits / formatPhoneDisplay', () => {
    it('mantém só dígitos, no máximo 11', () => {
      expect(sanitizePhoneDigits('(33) 99999-8888')).toBe('33999998888');
      expect(sanitizePhoneDigits('33 9 9999 8888 extra')).toBe('33999998888');
    });

    it('valida 10 ou 11 dígitos (fixo ou celular com 9)', () => {
      expect(validatePhoneDigits('33999998888')).toBe(true); // celular
      expect(validatePhoneDigits('3333334444')).toBe(true);  // fixo
      expect(validatePhoneDigits('339999888')).toBe(false);  // curto demais
      expect(validatePhoneDigits('339999988889')).toBe(false); // longo demais
    });

    it('formata pra exibição', () => {
      expect(formatPhoneDisplay('33999998888')).toBe('(33) 99999-8888');
      expect(formatPhoneDisplay('3333334444')).toBe('(33) 3333-4444');
      expect(formatPhoneDisplay(null)).toBe('');
    });
  });
});
