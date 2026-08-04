/**
 * Prazo da nota fiscal POR ESPELHO (04/08/2026, decisões do Victor):
 *   1) cada espelho publicado carrega o seu prazo — "manda a nota até dia 3 às 18h";
 *   2) nota que chega DEPOIS fica "atrasada", e dá pra filtrar por isso;
 *   3) espelho publicado ANTES desta feature não tem prazo: a nota nunca fica atrasada
 *      (não dá pra cobrar um horário que ninguém combinou);
 *   4) vale a hora do ENVIO, não a da validação — o driver não controla quando conferem.
 *
 * Roda com: npx vitest run driverPayNfPrazo
 */
import { describe, it, expect } from 'vitest';
import {
  nfPrazoStatus,
  nfAtrasoLabel,
  prazoNfPadrao,
} from '../../src/components/driverpay/driverPayShared';

const PRAZO = '2026-08-03T18:00:00-03:00';

describe('nfPrazoStatus', () => {
  it('chegou antes do prazo: no prazo', () => {
    expect(nfPrazoStatus('2026-08-03T17:59:00-03:00', PRAZO)).toBe('no_prazo');
  });

  it('chegou EM CIMA do prazo conta como no prazo (o limite vale)', () => {
    expect(nfPrazoStatus('2026-08-03T18:00:00-03:00', PRAZO)).toBe('no_prazo');
  });

  it('🎯 chegou 1 minuto depois: ATRASADA', () => {
    expect(nfPrazoStatus('2026-08-03T18:01:00-03:00', PRAZO)).toBe('atrasada');
  });

  it('espelho sem prazo (publicado antes da feature): nunca atrasa', () => {
    expect(nfPrazoStatus('2027-01-01T00:00:00-03:00', null)).toBe('sem_prazo');
    expect(nfPrazoStatus('2027-01-01T00:00:00-03:00', undefined)).toBe('sem_prazo');
  });

  it('data podre não vira "atrasada" por acidente', () => {
    expect(nfPrazoStatus('nao-e-data', PRAZO)).toBe('sem_prazo');
    expect(nfPrazoStatus('2026-08-03T18:01:00-03:00', 'nao-e-data')).toBe('sem_prazo');
  });

  it('compara com fuso: 21:00 UTC = 18:00 de Brasília, ainda no prazo', () => {
    expect(nfPrazoStatus('2026-08-03T21:00:00Z', PRAZO)).toBe('no_prazo');
    expect(nfPrazoStatus('2026-08-03T21:01:00Z', PRAZO)).toBe('atrasada');
  });
});

describe('nfAtrasoLabel — explica o selo sem precisar abrir nada', () => {
  it('minutos', () => {
    expect(nfAtrasoLabel('2026-08-03T18:40:00-03:00', PRAZO)).toBe('40 min depois');
  });

  it('horas e minutos', () => {
    expect(nfAtrasoLabel('2026-08-03T20:15:00-03:00', PRAZO)).toBe('2 h e 15 min depois');
  });

  it('horas redondas não mostram "e 0 min"', () => {
    expect(nfAtrasoLabel('2026-08-03T20:00:00-03:00', PRAZO)).toBe('2 h depois');
  });

  it('dias', () => {
    expect(nfAtrasoLabel('2026-08-05T18:00:00-03:00', PRAZO)).toBe('2 dia(s) depois');
  });

  it('quem está no prazo (ou sem prazo) não ganha rótulo nenhum', () => {
    expect(nfAtrasoLabel('2026-08-03T10:00:00-03:00', PRAZO)).toBeNull();
    expect(nfAtrasoLabel('2027-01-01T00:00:00-03:00', null)).toBeNull();
  });
});

describe('prazoNfPadrao — 2 dias depois, 18:00', () => {
  it('soma 2 dias e fixa 18:00', () => {
    expect(prazoNfPadrao(new Date('2026-08-01T09:30:00-03:00'))).toEqual({ date: '2026-08-03', time: '18:00' });
  });

  it('vira o mês certo', () => {
    expect(prazoNfPadrao(new Date('2026-08-30T09:30:00-03:00')).date).toBe('2026-09-01');
  });

  it('vira o ano certo', () => {
    expect(prazoNfPadrao(new Date('2026-12-31T09:30:00-03:00')).date).toBe('2027-01-02');
  });
});
