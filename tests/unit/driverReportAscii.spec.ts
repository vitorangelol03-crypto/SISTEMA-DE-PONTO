import { describe, it, expect } from 'vitest';
import { asciiSafe, isValidCNPJ, sanitizePixKey, stripAccents } from '../../src/components/driverpay/driverPayShared';

/**
 * Decisões do Victor (28/07): o relatório vai direto pro banco, que não aceita acento
 * nem símbolo — o arquivo INTEIRO sai em ASCII; e chave PIX que for CPF/CNPJ sai só
 * com os números (e-mail/telefone/chave aleatória ficam intocados).
 */

describe('asciiSafe — arquivo do banco só aceita ASCII', () => {
  it('tira acento dos nomes reais que estavam saindo sujos no relatório', () => {
    expect(asciiSafe('Caíque Rezende Valério nascimento')).toBe('Caique Rezende Valerio nascimento');
    expect(asciiSafe('MÁRIO CASSEMIRO DE ALMEIDA NETO')).toBe('MARIO CASSEMIRO DE ALMEIDA NETO');
    expect(asciiSafe('JOÃO GABRIEL FERREIRA')).toBe('JOAO GABRIEL FERREIRA');
    expect(asciiSafe('IRINEU DOS SANTOS - suiço')).toBe('IRINEU DOS SANTOS - suico');
  });

  it('troca o travessão e os símbolos do título por equivalentes simples', () => {
    expect(asciiSafe('RELATÓRIO GERAL — CD LOGISTICA — Caratinga, MG'))
      .toBe('RELATORIO GERAL - CD LOGISTICA - Caratinga, MG');
    expect(asciiSafe('a · b')).toBe('a - b');
    expect(asciiSafe('1ª Quinzena / 2º turno')).toBe('1a Quinzena / 2o turno');
    expect(asciiSafe('aspas “curvas” e ‘simples’')).toBe('aspas "curvas" e \'simples\'');
  });

  it('derruba qualquer caractere que sobrar fora do ASCII', () => {
    expect(asciiSafe('emoji 🚚 aqui')).toBe('emoji  aqui');
    expect(asciiSafe('nbsp aqui')).toBe('nbsp aqui');
    expect(asciiSafe('R$ 1.234,56')).toBe('R$ 1.234,56'); // já era ASCII, não muda
  });

  it('aguenta vazio e nulo sem quebrar', () => {
    expect(asciiSafe('')).toBe('');
    expect(asciiSafe(null as unknown as string)).toBe('');
    expect(asciiSafe(undefined as unknown as string)).toBe('');
  });

  it('é mais forte que o stripAccents antigo (que deixava o travessão passar)', () => {
    expect(stripAccents('a — b')).toContain('—');
    expect(asciiSafe('a — b')).not.toContain('—');
  });
});

describe('isValidCNPJ', () => {
  it('aceita CNPJ real', () => {
    expect(isValidCNPJ('11802464000138')).toBe(true); // CD Logistica (do cadastro real)
    expect(isValidCNPJ('53824315000110')).toBe(true); // iMile (do cadastro real)
  });
  it('recusa dígito verificador errado, tamanho errado e repetido', () => {
    expect(isValidCNPJ('11802464000139')).toBe(false);
    expect(isValidCNPJ('1180246400013')).toBe(false);
    expect(isValidCNPJ('11111111111111')).toBe(false);
  });
});

describe('sanitizePixKey — CPF/CNPJ só com números', () => {
  it('limpa CPF com ponto e traço', () => {
    expect(sanitizePixKey('123.456.789-09')).toBe('12345678909');
  });

  it('limpa CNPJ com ponto, barra e traço', () => {
    expect(sanitizePixKey('11.802.464/0001-38')).toBe('11802464000138');
  });

  it('deixa quieto o que já está limpo', () => {
    expect(sanitizePixKey('11802464000138')).toBe('11802464000138');
    expect(sanitizePixKey('12345678909')).toBe('12345678909');
  });

  it('NÃO mexe em e-mail, telefone nem chave aleatória (o hífen faz parte da chave)', () => {
    expect(sanitizePixKey('fulano@email.com')).toBe('fulano@email.com');
    expect(sanitizePixKey('+5533998877665')).toBe('+5533998877665');
    const aleatoria = '123e4567-e89b-12d3-a456-426614174000';
    expect(sanitizePixKey(aleatoria)).toBe(aleatoria);
  });

  it('celular com DDD tem 11 dígitos mas NÃO é CPF — não pode virar só números', () => {
    // (33) 98765-4321 -> 33987654321: 11 dígitos, mas dígito verificador de CPF não fecha
    expect(sanitizePixKey('(33) 98765-4321')).toBe('(33) 98765-4321');
  });

  it('número de 11 dígitos que não é CPF válido fica como está', () => {
    expect(sanitizePixKey('11111111111')).toBe('11111111111');
  });

  it('vazio e nulo viram string vazia', () => {
    expect(sanitizePixKey(null)).toBe('');
    expect(sanitizePixKey(undefined)).toBe('');
    expect(sanitizePixKey('   ')).toBe('');
  });
});
