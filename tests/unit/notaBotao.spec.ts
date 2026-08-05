/**
 * "Apos enviado o botão muda para: nota enviada" (05/08/2026, pedido do Victor).
 *
 * O botão do card do espelho era um convite eterno a mandar nota — e o driver, sem
 * nenhum sinal de que a dele já tinha chegado, mandava de novo. Daí a tela cheia de
 * nota repetida (o GESSILEY sozinho tinha 7 numa quinzena).
 *
 * O caso que mais importa aqui é o PARCIAL: um espelho pode pedir 2 notas (2 CNPJs).
 * Dizer "Nota enviada" com uma só seria pior que não dizer nada.
 */
import { describe, it, expect } from 'vitest';
import { estadoBotaoNota } from '../../src/utils/notaBotao';

describe('estadoBotaoNota', () => {
  it('🎯 nada enviado ainda: continua convidando', () => {
    expect(estadoBotaoNota({ nfVagas: 1, nfEnviadas: 0, nfRecusadas: 0 }))
      .toEqual({ texto: 'Anexar nota', tom: 'padrao' });
  });

  it('🎯 mandou a nota: o botão vira "Nota enviada" e fica verde', () => {
    expect(estadoBotaoNota({ nfVagas: 1, nfEnviadas: 1, nfRecusadas: 0 }))
      .toEqual({ texto: 'Nota enviada', tom: 'ok' });
  });

  it('🔴 espelho de 2 CNPJs com 1 nota NÃO diz "enviada" — diz o que falta', () => {
    // Se dissesse "Nota enviada", o driver pararia achando que acabou e a segunda
    // nota nunca chegaria.
    expect(estadoBotaoNota({ nfVagas: 2, nfEnviadas: 1, nfRecusadas: 0 }))
      .toEqual({ texto: 'Falta 1 nota', tom: 'padrao' });
  });

  it('faltando 2 ou mais, o texto vai no plural', () => {
    expect(estadoBotaoNota({ nfVagas: 3, nfEnviadas: 1, nfRecusadas: 0 }))
      .toEqual({ texto: 'Faltam 2 notas', tom: 'padrao' });
  });

  it('as duas no lugar: "Nota enviada"', () => {
    expect(estadoBotaoNota({ nfVagas: 2, nfEnviadas: 2, nfRecusadas: 0 }))
      .toEqual({ texto: 'Nota enviada', tom: 'ok' });
  });

  it('🔴 recusada ganha de tudo — é o único estado em que o driver precisa agir', () => {
    expect(estadoBotaoNota({ nfVagas: 2, nfEnviadas: 1, nfRecusadas: 1 }))
      .toEqual({ texto: 'Nota recusada', tom: 'recusada' });
    expect(estadoBotaoNota({ nfVagas: 1, nfEnviadas: 0, nfRecusadas: 1 }))
      .toEqual({ texto: 'Nota recusada', tom: 'recusada' });
  });

  it('espelho que não pede nota nenhuma não promete nada', () => {
    expect(estadoBotaoNota({ nfVagas: 0, nfEnviadas: 0, nfRecusadas: 0 }))
      .toEqual({ texto: 'Anexar nota', tom: 'padrao' });
  });

  it('🔴 edge fn antiga (sem os contadores) NÃO afirma "nota enviada"', () => {
    // O app fica em cache no celular do entregador. Sem número, o honesto é o texto
    // de sempre — afirmar que a nota chegou sem saber seria mentir pra ele.
    expect(estadoBotaoNota({})).toEqual({ texto: 'Anexar nota', tom: 'padrao' });
    expect(estadoBotaoNota({ nfEnviadas: 3 })).toEqual({ texto: 'Anexar nota', tom: 'padrao' });
  });

  it('contadores parciais não quebram (campo faltando vira zero)', () => {
    expect(estadoBotaoNota({ nfVagas: 1 })).toEqual({ texto: 'Anexar nota', tom: 'padrao' });
    expect(estadoBotaoNota({ nfVagas: 1, nfEnviadas: 1 })).toEqual({ texto: 'Nota enviada', tom: 'ok' });
  });

  it('enviadas acima do esperado (nota legada de outro espelho) ainda é "enviada"', () => {
    expect(estadoBotaoNota({ nfVagas: 1, nfEnviadas: 2, nfRecusadas: 0 }))
      .toEqual({ texto: 'Nota enviada', tom: 'ok' });
  });
});
