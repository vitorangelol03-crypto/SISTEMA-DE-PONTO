/**
 * Provas de desconto ao EDITAR (fotos + video).
 *
 * O bug que originou isto: editar um desconto e anexar foto nao salvava nada — a
 * tela coletava a imagem e o `updateDiscount` a descartava. Ao consertar, a parte
 * perigosa nao e subir o arquivo novo, e sim APAGAR o antigo: apagar o caminho
 * errado destroi prova de dinheiro, sem volta.
 */
import { describe, it, expect } from 'vitest';
import { orphanProofPaths, proofFileName, isKeptProof, type ProofSlot } from '../../src/utils/discountProofs';

const P1 = 'empresa/pgto/desc-1-aaaa.jpg';
const P2 = 'empresa/pgto/desc-2-bbbb.jpg';
const PV = 'empresa/pgto/desc-video-cccc.mp4';

describe('orphanProofPaths — o que sai do Storage ao editar', () => {
  it('nao apaga nada quando as provas continuam as mesmas', () => {
    expect(orphanProofPaths([P1, P2, PV], [P1, P2, PV])).toEqual([]);
  });

  it('apaga a foto que o usuario removeu', () => {
    expect(orphanProofPaths([P1, P2, null], [P1, null, null])).toEqual([P2]);
  });

  it('apaga a foto antiga quando ela e trocada por outra', () => {
    const nova = 'empresa/pgto/desc-1-zzzz.png';
    expect(orphanProofPaths([P1, null, null], [nova, null, null])).toEqual([P1]);
  });

  it('apaga o video removido sem tocar nas fotos', () => {
    expect(orphanProofPaths([P1, P2, PV], [P1, P2, null])).toEqual([PV]);
  });

  it('nao apaga nada quando so foi ADICIONADA uma foto', () => {
    expect(orphanProofPaths([P1, null, null], [P1, P2, null])).toEqual([]);
  });

  it('apaga tudo quando o usuario limpa as provas', () => {
    expect(orphanProofPaths([P1, P2, PV], [null, null, null])).toEqual([P1, P2, PV]);
  });

  it('nao repete caminho quando as duas fotos apontam pro mesmo arquivo', () => {
    expect(orphanProofPaths([P1, P1, null], [null, null, null])).toEqual([P1]);
  });

  it('a foto que so MUDOU DE LUGAR (slot 2 -> slot 1) nao e apagada', () => {
    // Remover a 1a foto faz a 2a subir de posicao. O arquivo e o mesmo:
    // comparar por posicao (e nao por conteudo) apagaria uma prova valida.
    expect(orphanProofPaths([P1, P2, null], [P2, null, null])).toEqual([P1]);
  });

  it('ignora undefined vindo de um desconto sem coluna preenchida', () => {
    expect(orphanProofPaths([undefined, undefined, undefined], [P1, null, null])).toEqual([]);
  });
});

describe('proofFileName — nome unico por prova nova', () => {
  it('monta nome com desconto, posicao, sufixo unico e extensao', () => {
    expect(proofFileName('desc', '1', 'jpg', 'ab12cd34')).toBe('desc-1-ab12cd34.jpg');
  });

  it('dois envios pro mesmo slot geram nomes DIFERENTES', () => {
    // O bucket nao tem policy de UPDATE: reusar o nome faria a RLS barrar o
    // segundo envio, e a foto nova sumiria em silencio.
    const a = proofFileName('desc', '1', 'jpg', 'aaaaaaaa');
    const b = proofFileName('desc', '1', 'jpg', 'bbbbbbbb');
    expect(a).not.toBe(b);
  });

  it('respeita a extensao do arquivo (png, webp, mp4)', () => {
    expect(proofFileName('d', '2', 'png', 'x')).toBe('d-2-x.png');
    expect(proofFileName('d', 'video', 'mp4', 'x')).toBe('d-video-x.mp4');
  });
});

describe('isKeptProof — separa prova salva de arquivo novo', () => {
  it('reconhece a prova que ja estava salva', () => {
    const slot: ProofSlot = { keep: P1 };
    expect(isKeptProof(slot)).toBe(true);
    if (isKeptProof(slot)) expect(slot.keep).toBe(P1);
  });

  it('reconhece o arquivo novo', () => {
    const slot: ProofSlot = { blob: new Blob(['x'], { type: 'image/jpeg' }) };
    expect(isKeptProof(slot)).toBe(false);
  });
});
