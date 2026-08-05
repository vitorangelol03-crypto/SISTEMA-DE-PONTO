/**
 * O valor por pacote que não alterava de jeito nenhum (05/08/2026).
 *
 * Relato do Victor: *"na config está 2.50, no grupo 2.5, mas está 2 reais a LOGGI e não
 * altera"*. Caso real do RODRIGO SANTOS TATIBANA: config 2,50, grupo Sta. Luzia 2,50,
 * linha da LOGGI presa em 2,00 — e nem salvar o perfil nem aplicar o grupo mexiam.
 *
 * Medido em produção: 12 linhas de LOGGI presas no padrão da plataforma (R$ 2,00) contra
 * config de 2,20/2,50/3,00 = R$ 300,00 a menos numa quinzena.
 *
 * O teste que mais importa é o do contrário: rota com preço combinado TEM que aparecer na
 * lista (pra pessoa decidir), e nunca ser sincronizada em silêncio.
 */
import { describe, it, expect } from 'vitest';
import { linhasForaDaConfig, diferencaEmReais } from '../../src/utils/rateSync';

const rota = (route: string, packages: Record<string, number>, rates: Record<string, number>) =>
  ({ route, packages, rates });

describe('linhasForaDaConfig', () => {
  it('🎯 o caso do RODRIGO: linha em 2,00 com config 2,50 aparece', () => {
    const fora = linhasForaDaConfig(
      [rota('Caratinga', { LOGGI: 20, SHOPEE: 1551 }, { LOGGI: 2.0, SHOPEE: 2.5 })],
      { LOGGI: 2.5, SHOPEE: 2.5 },
    );
    expect(fora).toEqual([
      { route: 'Caratinga', platformName: 'LOGGI', packages: 20, de: 2.0, para: 2.5 },
    ]);
  });

  it('tudo batendo com a config não devolve nada (não incomoda quem salvou um PIX)', () => {
    const fora = linhasForaDaConfig(
      [rota('Caratinga', { LOGGI: 20 }, { LOGGI: 2.5 })],
      { LOGGI: 2.5 },
    );
    expect(fora).toEqual([]);
  });

  it('🔴 rota com preço COMBINADO também aparece — quem decide é a pessoa', () => {
    // Caso real: Angelo, rota "Dom Lara", Shopee a 4,00 com config 2,00. A conta só
    // mostra; sincronizar sozinho tiraria R$ 338 dele sem ninguém perceber.
    const fora = linhasForaDaConfig(
      [rota('Dom Lara', { SHOPEE: 169 }, { SHOPEE: 4.0 })],
      { SHOPEE: 2.0 },
    );
    expect(fora).toHaveLength(1);
    expect(fora[0]).toMatchObject({ de: 4.0, para: 2.0, packages: 169 });
  });

  it('linha SEM valor gravado já segue a config — fica de fora', () => {
    const fora = linhasForaDaConfig([rota('Caratinga', { LOGGI: 20 }, {})], { LOGGI: 2.5 });
    expect(fora).toEqual([]);
  });

  it('plataforma sem config no perfil não entra (não há com o que comparar)', () => {
    const fora = linhasForaDaConfig([rota('X', { NOVA: 10 }, { NOVA: 3 })], { LOGGI: 2.5 });
    expect(fora).toEqual([]);
  });

  it('linha com ZERO pacote não entra (não muda dinheiro nenhum)', () => {
    const fora = linhasForaDaConfig([rota('X', { LOGGI: 0 }, { LOGGI: 2.0 })], { LOGGI: 2.5 });
    expect(fora).toEqual([]);
  });

  it('multi-rota: cada rota é avaliada sozinha', () => {
    const fora = linhasForaDaConfig(
      [
        rota('Inhapim', { LOGGI: 378 }, { LOGGI: 2.0 }),
        rota('Caratinga', { LOGGI: 100 }, { LOGGI: 2.2 }),
      ],
      { LOGGI: 2.2 },
    );
    expect(fora).toHaveLength(1);
    expect(fora[0].route).toBe('Inhapim');
  });

  it('centavos: 2,20 contra 2,2 não é divergência (nada de erro de float)', () => {
    expect(linhasForaDaConfig([rota('X', { LOGGI: 10 }, { LOGGI: 2.2 })], { LOGGI: 2.2000000001 }))
      .toEqual([]);
  });

  it('sem rotas devolve vazio', () => {
    expect(linhasForaDaConfig([], { LOGGI: 2.5 })).toEqual([]);
  });
});

describe('diferencaEmReais', () => {
  it('🎯 o Lucas Aredes: 378 pacotes de 2,00 pra 2,20 = +R$ 75,60', () => {
    const dif = diferencaEmReais([
      { route: 'Inhapim', platformName: 'LOGGI', packages: 378, de: 2.0, para: 2.2 },
    ]);
    expect(dif).toBe(75.6);
  });

  it('soma várias linhas e aceita queda', () => {
    const dif = diferencaEmReais([
      { route: 'A', platformName: 'LOGGI', packages: 20, de: 2.0, para: 2.5 },
      { route: 'B', platformName: 'SHOPEE', packages: 169, de: 4.0, para: 2.0 },
    ]);
    expect(dif).toBe(10 - 338);
  });

  it('lista vazia = zero', () => {
    expect(diferencaEmReais([])).toBe(0);
  });
});
