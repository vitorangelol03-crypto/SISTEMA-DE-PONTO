/**
 * notaFiscalFileName — nome do arquivo de NF pro download (Fase 3): mantém acento/espaço,
 * remove caractere proibido no Windows/Android, numera a 2ª+ nota do mesmo driver/CNPJ.
 * Roda com: npx vitest run notaFiscalFileName
 */
import { describe, it, expect } from 'vitest';
import { notaFiscalFileName } from '../../src/components/driverpay/driverPayShared';

describe('notaFiscalFileName', () => {
  it('formato base: Driver - CNPJ - Quinzena.ext (mantém acentos)', () => {
    expect(notaFiscalFileName('Romário Alves', 'iMile', '1ª Quinzena Julho', 0, 'pdf'))
      .toBe('Romário Alves - iMile - 1ª Quinzena Julho.pdf');
  });

  it('remove caracteres proibidos (/ \\ : * ? " < > |) trocando por -', () => {
    expect(notaFiscalFileName('João/Maria', 'Shopee:Anjun', 'Q1', 0, 'jpg'))
      .toBe('João-Maria - Shopee-Anjun - Q1.jpg');
  });

  it('colapsa espaços e apara pontas', () => {
    expect(notaFiscalFileName('  Ana   Paula  ', 'iMile', 'Q2', 0, 'jpg'))
      .toBe('Ana Paula - iMile - Q2.jpg');
  });

  it('index 0 não numera; index>0 numera a partir de 2', () => {
    expect(notaFiscalFileName('Ana', 'iMile', 'Q1', 0, 'jpg')).toBe('Ana - iMile - Q1.jpg');
    expect(notaFiscalFileName('Ana', 'iMile', 'Q1', 1, 'jpg')).toBe('Ana - iMile - Q1 (2).jpg');
    expect(notaFiscalFileName('Ana', 'iMile', 'Q1', 2, 'jpg')).toBe('Ana - iMile - Q1 (3).jpg');
  });

  it('extensão é higienizada (default jpg)', () => {
    expect(notaFiscalFileName('Ana', 'iMile', 'Q1', 0, 'JPG')).toBe('Ana - iMile - Q1.jpg');
    expect(notaFiscalFileName('Ana', 'iMile', 'Q1', 0, '.png')).toBe('Ana - iMile - Q1.png');
    expect(notaFiscalFileName('Ana', 'iMile', 'Q1', 0, '')).toBe('Ana - iMile - Q1.jpg');
  });

  it('partes vazias viram "sem-nome" (não gera nome quebrado)', () => {
    expect(notaFiscalFileName('', '', '', 0, 'jpg')).toBe('sem-nome - sem-nome - sem-nome.jpg');
  });
});
