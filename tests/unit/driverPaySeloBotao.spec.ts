/**
 * Os numerozinhos dos botões "Notas recebidas" e "Espelhos recebidos" (05/08/2026).
 *
 * Pedido do Victor: "se tiver nota pendente aparece a quantidade de nota pendente para
 * validar, e espelho também; não tendo pendências aparece o número em verdinho do total já
 * validado".
 *
 * ⚠️ O número do BOTÃO tem que ser o mesmo que aparece DENTRO da tela ao abrir. Se
 * divergirem, o operador confia no de fora e deixa nota sem validar. Por isso a contagem
 * dos prints usa a mesma `proofPrecisaAtencao` da aba "Precisam de você", e os repetidos
 * saem da mesma `printsRepetidos`.
 *
 * Roda com: npx vitest run driverPaySeloBotao
 */
import { describe, it, expect } from 'vitest';
import {
  seloDoBotao,
  printsRepetidos,
  proofPrecisaAtencao,
} from '../../src/components/driverpay/driverPayShared';

describe('seloDoBotao', () => {
  it('🎯 tendo pendência, mostra QUANTAS faltam (âmbar)', () => {
    expect(seloDoBotao(7, 40)).toEqual({ numero: 7, estado: 'pendente' });
  });

  it('🎯 sem pendência, mostra o total já validado (verde)', () => {
    expect(seloDoBotao(0, 58)).toEqual({ numero: 58, estado: 'ok' });
  });

  it('nada recebido ainda: sem numerozinho', () => {
    expect(seloDoBotao(0, 0)).toEqual({ numero: 0, estado: 'vazio' });
  });

  it('⚠️ a pendência manda mesmo com muita coisa validada', () => {
    expect(seloDoBotao(1, 999).estado).toBe('pendente');
    expect(seloDoBotao(1, 999).numero).toBe(1);
  });
});

// ── O número de fora bate com o de dentro ───────────────────────────────────
describe('contagem dos prints = a da aba "Precisam de você"', () => {
  const p = (
    id: string, driverId: string, status: string, checkStatus: string | null,
    validatedBy: string | null = null, fileSha256: string | null = null,
  ) => ({ id, driverId, driverName: driverId, status, checkStatus, validatedBy, nextCheckAt: null, fileSha256 });

  it('🎯 mesma conta nos dois lugares', () => {
    const proofs = [
      p('1', 'ana', 'validado', 'ok'),                    // conferido
      p('2', 'bia', 'recebido', 'divergente'),            // pendente
      p('3', 'caio', 'validado', 'divergente', '2626'),   // pessoa validou → conferido
      p('4', 'davi', 'rejeitado', 'ok'),                  // pendente (tem que reenviar)
    ];
    const rep = new Set(printsRepetidos(proofs).keys());
    const pendentes = proofs.filter((x) => proofPrecisaAtencao(x, rep)).length;
    const conferidos = proofs.filter((x) => x.status === 'validado' && !proofPrecisaAtencao(x, rep)).length;

    expect(pendentes).toBe(2);
    expect(conferidos).toBe(2);
    expect(seloDoBotao(pendentes, conferidos)).toEqual({ numero: 2, estado: 'pendente' });
  });

  it('tudo conferido: o selo fica verde com o total', () => {
    const proofs = [p('1', 'ana', 'validado', 'ok'), p('2', 'bia', 'validado', 'ok')];
    const rep = new Set(printsRepetidos(proofs).keys());
    const pendentes = proofs.filter((x) => proofPrecisaAtencao(x, rep)).length;
    const conferidos = proofs.filter((x) => x.status === 'validado' && !proofPrecisaAtencao(x, rep)).length;
    expect(seloDoBotao(pendentes, conferidos)).toEqual({ numero: 2, estado: 'ok' });
  });
});

describe('printsRepetidos — mesmo arquivo em drivers diferentes', () => {
  const p = (id: string, driverId: string, driverName: string, sha: string | null) =>
    ({ id, driverId, driverName, fileSha256: sha });

  it('🎯 aponta os dois lados do repetido, com o nome do outro', () => {
    const r = printsRepetidos([
      p('1', 'ana', 'ANA', 'AAA'),
      p('2', 'bia', 'BIA', 'AAA'),
      p('3', 'caio', 'CAIO', 'BBB'),
    ]);
    expect(r.get('1')).toEqual(['BIA']);
    expect(r.get('2')).toEqual(['ANA']);
    expect(r.has('3')).toBe(false);
  });

  it('mesmo arquivo do MESMO driver não é repetido (reenvio dele)', () => {
    const r = printsRepetidos([p('1', 'ana', 'ANA', 'AAA'), p('2', 'ana', 'ANA', 'AAA')]);
    expect(r.size).toBe(0);
  });

  it('sem impressão digital não acusa nada', () => {
    expect(printsRepetidos([p('1', 'ana', 'ANA', null), p('2', 'bia', 'BIA', null)]).size).toBe(0);
  });

  it('lista vazia não quebra', () => {
    expect(printsRepetidos([]).size).toBe(0);
  });
});
