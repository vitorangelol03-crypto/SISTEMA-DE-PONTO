import { describe, it, expect, vi } from 'vitest';
import {
  COMPROVANTE_VALIDADE_MS,
  comprovanteFacialConfere,
  decidirProva,
  emitirComprovanteFacial,
} from '../../supabase/functions/_shared/acessoDoFuncionario';

/**
 * Quem pode ler erros, ponto do dia e histórico de UM funcionário pelas telas públicas
 * (30/09/2026, roadmap item 5). Antes bastava o id — que `lookup-employee` entrega a partir do
 * CPF. O que PRECISA ser verdade:
 *  - o comprovante do rosto vale só pra AQUELA pessoa, naquela empresa, por 15 min;
 *  - ninguém fabrica nem adapta um comprovante sem o segredo do servidor;
 *  - PIN certo OU comprovante válido = ok; prova errada = recusa; sem prova = 'ausente'
 *    (o servidor decide o que fazer com 'ausente' — ver EXIGIR_PROVA_DO_FUNCIONARIO).
 */

const SEGREDO = 'segredo-do-servidor-de-teste';
const MARIA = '11111111-1111-4111-8111-111111111111';
const JOAO = '22222222-2222-4222-8222-222222222222';
const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PONTE_NOVA = '2b2abc4b-084c-4cf0-b5f1-02792513241d';
const AGORA = 1_790_000_000_000;

describe('comprovante facial', () => {
  it('vale pra pessoa e empresa dele, dentro dos 15 min', async () => {
    const c = await emitirComprovanteFacial(SEGREDO, MARIA, CARATINGA, AGORA);
    expect(await comprovanteFacialConfere(SEGREDO, c, MARIA, CARATINGA, AGORA)).toBe(true);
    expect(await comprovanteFacialConfere(SEGREDO, c, MARIA, CARATINGA, AGORA + COMPROVANTE_VALIDADE_MS - 1)).toBe(true);
  });

  it('venceu: recusado', async () => {
    const c = await emitirComprovanteFacial(SEGREDO, MARIA, CARATINGA, AGORA);
    expect(await comprovanteFacialConfere(SEGREDO, c, MARIA, CARATINGA, AGORA + COMPROVANTE_VALIDADE_MS)).toBe(false);
  });

  it('o comprovante da Maria não abre os dados do João, nem os da Maria em outra empresa', async () => {
    const c = await emitirComprovanteFacial(SEGREDO, MARIA, CARATINGA, AGORA);
    expect(await comprovanteFacialConfere(SEGREDO, c, JOAO, CARATINGA, AGORA)).toBe(false);
    expect(await comprovanteFacialConfere(SEGREDO, c, MARIA, PONTE_NOVA, AGORA)).toBe(false);
  });

  it('trocar o nome ou o prazo dentro do papel quebra a assinatura', async () => {
    const c = await emitirComprovanteFacial(SEGREDO, MARIA, CARATINGA, AGORA);
    const [v, , empresa, vence, assinatura] = c.split('.');
    const doJoao = [v, JOAO, empresa, vence, assinatura].join('.');
    expect(await comprovanteFacialConfere(SEGREDO, doJoao, JOAO, CARATINGA, AGORA)).toBe(false);
    const esticado = [v, MARIA, empresa, String(Number(vence) + 86_400_000), assinatura].join('.');
    expect(await comprovanteFacialConfere(SEGREDO, esticado, MARIA, CARATINGA, AGORA + COMPROVANTE_VALIDADE_MS)).toBe(false);
  });

  it('sem o segredo do servidor não se fabrica comprovante', async () => {
    const falso = await emitirComprovanteFacial('outro-segredo', MARIA, CARATINGA, AGORA);
    expect(await comprovanteFacialConfere(SEGREDO, falso, MARIA, CARATINGA, AGORA)).toBe(false);
  });

  it('lixo, vazio e formato errado: recusados sem quebrar', async () => {
    for (const lixo of [undefined, null, 123, '', 'abc', 'v1.a.b.c.d', 'v2.x', 'x'.repeat(500), {}]) {
      expect(await comprovanteFacialConfere(SEGREDO, lixo, MARIA, CARATINGA, AGORA)).toBe(false);
    }
  });

  it('servidor sem segredo configurado não emite (falha fechada)', async () => {
    await expect(emitirComprovanteFacial('', MARIA, CARATINGA, AGORA)).rejects.toThrow();
  });
});

describe('decidirProva', () => {
  const sim = vi.fn(async () => true);
  const nao = vi.fn(async () => false);

  it('sem PIN e sem comprovante: ausente (e não vai ao banco)', async () => {
    const pinConfere = vi.fn(async () => true);
    expect(await decidirProva({ pin: undefined, comprovante: '', pinConfere, comprovanteConfere: sim })).toBe('ausente');
    expect(pinConfere).not.toHaveBeenCalled();
  });

  it('PIN certo: ok · PIN errado: invalido', async () => {
    expect(await decidirProva({ pin: '1234', comprovante: undefined, pinConfere: sim, comprovanteConfere: nao })).toBe('ok');
    expect(await decidirProva({ pin: '9999', comprovante: undefined, pinConfere: nao, comprovanteConfere: nao })).toBe('invalido');
  });

  it('comprovante válido: ok sem conferir PIN · comprovante ruim: invalido', async () => {
    const pinConfere = vi.fn(async () => true);
    expect(await decidirProva({ pin: undefined, comprovante: 'c', pinConfere, comprovanteConfere: sim })).toBe('ok');
    expect(pinConfere).not.toHaveBeenCalled();
    expect(await decidirProva({ pin: undefined, comprovante: 'c', pinConfere: sim, comprovanteConfere: nao })).toBe('invalido');
  });

  it('PIN que não é texto não conta como prova', async () => {
    expect(await decidirProva({ pin: 1234, comprovante: undefined, pinConfere: sim, comprovanteConfere: sim })).toBe('ausente');
  });

  it('erro ao ler o PIN no banco SOBE (vira 500 no servidor, nunca "liberado")', async () => {
    const quebra = async () => { throw new Error('banco fora'); };
    await expect(decidirProva({ pin: '1234', comprovante: undefined, pinConfere: quebra, comprovanteConfere: nao })).rejects.toThrow('banco fora');
  });
});
