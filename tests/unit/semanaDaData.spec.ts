import { describe, it, expect } from 'vitest';
import { semanaDaData, getBrazilDate } from '../../src/utils/dateUtils';

/**
 * 🔴 A SEMANA QUE NASCIA UM DIA DESLOCADA (12/09/2026).
 *
 * A criação automática de semanas montava as datas assim:
 *
 *     const monday = new Date(today);
 *     monday.setDate(today.getDate() + offsetToMonday);
 *     const mondayStr = monday.toISOString().slice(0, 10);   // ⬅ o erro
 *
 * `toISOString()` fala UTC. No Brasil (UTC−3), das 21h em diante o dia em UTC já
 * é o SEGUINTE — então a segunda-feira 07/09 saía gravada como "08/09".
 *
 * Aconteceu de verdade: às 23h18 de 11/09/2026 o sistema criou
 * "Semana 08/09 a 14/09" na Ponte Nova **por cima** da "Semana 07/09 a 13/09".
 * Duas semanas cobrindo os mesmos dias = dia com dois donos, que é a doença por
 * trás do erro de R$ 82.980 em Caratinga.
 *
 * Estes testes travam a conta certa.
 */

describe('a semana de segunda a domingo', () => {
  it('🎯 sábado 12/09/2026 pertence à semana que começa na SEGUNDA 07/09', () => {
    // É o caso exato do bug: antes saía 08/09 a 14/09.
    expect(semanaDaData('2026-09-12')).toEqual({
      segunda: '2026-09-07',
      domingo: '2026-09-13',
    });
  });

  it('a própria segunda-feira fica onde está', () => {
    expect(semanaDaData('2026-09-07')).toEqual({
      segunda: '2026-09-07',
      domingo: '2026-09-13',
    });
  });

  it('🎯 domingo pertence à semana que ACABA nele, não à que começa no dia seguinte', () => {
    // `getDay()` devolve 0 pro domingo; quem esquece isso joga o domingo pra
    // semana errada e cria a sobreposição pelo outro lado.
    expect(semanaDaData('2026-09-13')).toEqual({
      segunda: '2026-09-07',
      domingo: '2026-09-13',
    });
  });

  it('atravessa a virada do mês', () => {
    expect(semanaDaData('2026-09-02')).toEqual({
      segunda: '2026-08-31',
      domingo: '2026-09-06',
    });
  });

  it('atravessa a virada do ano', () => {
    expect(semanaDaData('2026-01-01')).toEqual({
      segunda: '2025-12-29',
      domingo: '2026-01-04',
    });
  });

  it('data inválida reclama, não devolve lixo em silêncio', () => {
    expect(() => semanaDaData('nao-e-data')).toThrow(/inválida/);
  });
});

describe('as semanas nunca se sobrepõem', () => {
  it('🎯 um ano inteiro de dias: cada dia tem UMA dona, e as semanas se emendam', () => {
    // A prova de fogo do bug: se `toISOString()` voltasse, algum dia cairia numa
    // semana que não o contém, ou duas semanas cobririam o mesmo dia.
    const donas = new Map<string, string>();

    const d = new Date('2025-09-01T00:00:00Z');
    for (let i = 0; i < 400; i++) {
      const dia = d.toISOString().slice(0, 10);
      const { segunda, domingo } = semanaDaData(dia);

      expect(dia >= segunda && dia <= domingo, `${dia} tem que estar dentro de ${segunda}–${domingo}`).toBe(true);

      // O intervalo tem exatamente 7 dias.
      const dif = (new Date(`${domingo}T00:00:00Z`).getTime()
        - new Date(`${segunda}T00:00:00Z`).getTime()) / 86_400_000;
      expect(dif, `${segunda} a ${domingo}`).toBe(6);

      // Todo dia da mesma semana aponta pra MESMA segunda.
      const jaVisto = donas.get(dia);
      if (jaVisto) expect(jaVisto).toBe(segunda);
      donas.set(dia, segunda);

      d.setUTCDate(d.getUTCDate() + 1);
    }

    // E cada segunda encontrada abre exatamente uma semana.
    const segundas = [...new Set(donas.values())].sort();
    for (let i = 1; i < segundas.length; i++) {
      const dif = (new Date(`${segundas[i]}T00:00:00Z`).getTime()
        - new Date(`${segundas[i - 1]}T00:00:00Z`).getTime()) / 86_400_000;
      expect(dif, `de ${segundas[i - 1]} pra ${segundas[i]}`).toBe(7);
    }
  });
});

describe('a data de hoje é a do Brasil', () => {
  it('getBrazilDate devolve YYYY-MM-DD', () => {
    expect(getBrazilDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('🎯 e a semana de hoje contém hoje — seja qual for a hora da máquina', () => {
    // Este é o teste que teria pego o bug: rodando às 23h no Brasil, a semana
    // calculada precisa continuar contendo o dia de hoje.
    const hoje = getBrazilDate();
    const { segunda, domingo } = semanaDaData(hoje);
    expect(hoje >= segunda && hoje <= domingo).toBe(true);
  });
});
