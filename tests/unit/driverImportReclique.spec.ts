/**
 * Import de planilha: clicar "Importar" de novo depois de uma falha NO MEIO não pode
 * duplicar os entregadores novos.
 *
 * 🔴 O bug (achado em 31/08/2026): se o import quebrava no meio, os entregadores já
 * criados ficavam no banco, mas o modal mantinha as resoluções antigas ("criar novo").
 * O segundo clique criava os MESMOS entregadores outra vez — gente duplicada, com os
 * pacotes contados duas vezes. Pior: `createDriver` chama `ensureDriverInOpenPeriods`,
 * então cada duplicado ainda poluía a grade de TODAS as quinzenas abertas.
 *
 * A saída é o apelido: `upsertDriverAlias` é idempotente por (empresa, apelido) e roda
 * logo depois de criar o entregador. Numa segunda tentativa o apelido já aponta pro
 * entregador criado na primeira — é só reaproveitar.
 *
 * Roda com: npx vitest run driverImportReclique
 */
import { describe, it, expect } from 'vitest';
import { driverIdDeApelidoConhecido } from '../../src/utils/driverImportApply';

const vazio = new Map<string, string>();

describe('driverIdDeApelidoConhecido — o import vira repetível', () => {
  it('primeira tentativa, ninguém conhecido: cria (retorna null)', () => {
    expect(driverIdDeApelidoConhecido('JOAO DA SILVA', 'joao da silva', vazio, vazio)).toBeNull();
  });

  it('SEGUNDA tentativa: o apelido gravado na 1ª aponta pro entregador — reaproveita', () => {
    const aliases = new Map([['joao da silva', 'driver-123']]);
    expect(driverIdDeApelidoConhecido('JOAO DA SILVA', 'joao da silva', aliases, vazio)).toBe('driver-123');
  });

  it('mesmo entregador em várias linhas da MESMA execução cria só uma vez', () => {
    // o mesmo driverRaw aparece uma vez por cidade/plataforma
    const criados = new Map([['JOAO DA SILVA', 'driver-novo']]);
    expect(driverIdDeApelidoConhecido('JOAO DA SILVA', 'joao da silva', vazio, criados)).toBe('driver-novo');
  });

  it('o que foi criado nesta execução tem precedência sobre o apelido antigo', () => {
    const aliases = new Map([['joao da silva', 'driver-antigo']]);
    const criados = new Map([['JOAO DA SILVA', 'driver-desta-execucao']]);
    expect(driverIdDeApelidoConhecido('JOAO DA SILVA', 'joao da silva', aliases, criados))
      .toBe('driver-desta-execucao');
  });

  it('apelido de OUTRO entregador não é reaproveitado', () => {
    const aliases = new Map([['maria souza', 'driver-maria']]);
    expect(driverIdDeApelidoConhecido('JOAO DA SILVA', 'joao da silva', aliases, vazio)).toBeNull();
  });

  it('cenário completo: falha no meio e reimportação não duplica ninguém', () => {
    const linhas = [
      { raw: 'JOAO DA SILVA', norm: 'joao da silva' },
      { raw: 'MARIA SOUZA', norm: 'maria souza' },
      { raw: 'JOAO DA SILVA', norm: 'joao da silva' }, // outra cidade
      { raw: 'PEDRO LIMA', norm: 'pedro lima' },
    ];

    // 1ª tentativa: quebra depois de gravar João e Maria
    const aliasesNoBanco = new Map<string, string>();
    const criados1 = new Map<string, string>();
    let criacoes1 = 0;
    for (const l of linhas.slice(0, 3)) {
      if (!driverIdDeApelidoConhecido(l.raw, l.norm, aliasesNoBanco, criados1)) {
        const novo = `driver-${l.norm}`;
        criados1.set(l.raw, novo);
        aliasesNoBanco.set(l.norm, novo); // upsertDriverAlias grava logo apos criar
        criacoes1 += 1;
      }
    }
    expect(criacoes1).toBe(2); // Joao e Maria (a 3a linha e o Joao de novo)

    // 2ª tentativa (reclique): o modal ainda diz "criar novo" para os três
    const criados2 = new Map<string, string>();
    let criacoes2 = 0;
    for (const l of linhas) {
      if (!driverIdDeApelidoConhecido(l.raw, l.norm, aliasesNoBanco, criados2)) {
        const novo = `driver-${l.norm}`;
        criados2.set(l.raw, novo);
        aliasesNoBanco.set(l.norm, novo);
        criacoes2 += 1;
      }
    }
    // só o PEDRO, que a primeira tentativa não alcançou. Joao e Maria NAO sao recriados.
    expect(criacoes2).toBe(1);
    expect(aliasesNoBanco.size).toBe(3); // 3 entregadores no total, nenhum duplicado
  });
});
