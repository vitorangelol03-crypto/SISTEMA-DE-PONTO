/**
 * "Qual valor esperar na nota" — a tag nova em Notas recebidas (05/08/2026).
 *
 * Pedido do Victor: "coloca para aparecer o valor do espelho na tagzinha, assim já sabemos
 * qual valor esperar na nota". Antes esse número só aparecia DENTRO da mensagem de recusa —
 * ou seja, só depois de dar errado.
 *
 * De onde sai: a conferência automática grava em `check_details.candidates` todos os valores
 * que a nota podia ter (o do espelho publicado, o líquido, a soma por CNPJ) e, em
 * `matchedCandidates`, qual deles bateu. Formatos reais lidos de produção.
 *
 * ⚠️ Mostrar valor errado aqui faz o operador validar nota errada. Por isso o teste cobre
 * o caso "não bateu" (tem que mostrar o do ESPELHO, que é o que o entregador viu no app).
 *
 * Roda com: npx vitest run driverPayValorEsperadoNota
 */
import { describe, it, expect } from 'vitest';
import { valorEsperadoDaNota, rotuloDoCandidato } from '../../src/components/driverpay/driverPayShared';

describe('valorEsperadoDaNota', () => {
  it('🎯 nota VALIDADA: mostra o valor que bateu, marcado como bateu', () => {
    // check_details real de produção
    const d = {
      reasons: [], backfill: true,
      candidates: {
        liquido_grupo: 8494, somaCnpj_grupo: 7632,
        liquido_individual: 4728, somaCnpj_individual: 4280,
        espelho_selection_LOGGI: 246,
      },
      matchedCandidates: ['espelho_selection_LOGGI'],
      autoValidated: true,
    };
    expect(valorEsperadoDaNota(d)).toMatchObject({ valor: 246, bateu: true, doEspelho: true });
  });

  it('🎯 nota que NÃO bateu: mostra o valor DO ESPELHO (o que ela deveria ter)', () => {
    const d = {
      candidates: { liquido_individual: 9374, espelho_selection_SHOPEE: 1234.5 },
      matchedCandidates: [],
    };
    expect(valorEsperadoDaNota(d)).toMatchObject({ valor: 1234.5, bateu: false, doEspelho: true });
  });

  it('bateu num candidato que NÃO é o espelho: mostra esse, e diz que não é do espelho', () => {
    const d = {
      candidates: { liquido_individual: 500, espelho_selection_LOGGI: 246 },
      matchedCandidates: ['liquido_individual'],
    };
    expect(valorEsperadoDaNota(d)).toMatchObject({ valor: 500, bateu: true, doEspelho: false });
  });

  it('⚠️ sem candidato de espelho e sem match: não inventa número', () => {
    const d = { candidates: { liquido_individual: 900 }, matchedCandidates: [] };
    expect(valorEsperadoDaNota(d)).toBeNull();
  });

  it('nota nunca conferida (sem check_details): não mostra tag', () => {
    expect(valorEsperadoDaNota(null)).toBeNull();
    expect(valorEsperadoDaNota(undefined)).toBeNull();
  });

  it('check_details sem candidates não quebra', () => {
    expect(valorEsperadoDaNota({ reasons: ['x'] })).toBeNull();
  });

  it('candidates vazio não mostra nada', () => {
    expect(valorEsperadoDaNota({ candidates: {}, matchedCandidates: [] })).toBeNull();
  });

  it('matchedCandidates apontando pra chave que não existe cai no espelho', () => {
    const d = { candidates: { espelho_selection_ANJUN: 77 }, matchedCandidates: ['sumiu'] };
    expect(valorEsperadoDaNota(d)).toMatchObject({ valor: 77, bateu: false, doEspelho: true });
  });

  it('valor zero é um valor válido (nota de R$ 0,00 existe)', () => {
    const d = { candidates: { espelho_selection_LOGGI: 0 }, matchedCandidates: [] };
    expect(valorEsperadoDaNota(d)).toMatchObject({ valor: 0, bateu: false, doEspelho: true });
  });

  it('matchedCandidates ausente é tratado como "não bateu"', () => {
    const d = { candidates: { espelho_x: 10 } };
    expect(valorEsperadoDaNota(d)).toMatchObject({ valor: 10, bateu: false, doEspelho: true });
  });

  // ── De qual valor a tag está falando (05/08/2026) ──────────────────────────
  // Medido em produção: a MESMA nota tinha tag "R$ 18.885,87" e recusa dizendo
  // "esperado: R$ 4.338,10". Os dois números são reais e diferentes — o primeiro é o
  // espelho do grupo, o segundo é o candidato mais PRÓXIMO do que o entregador digitou
  // (a recusa escolhe assim pra explicar o erro pra ele). Sem dizer QUAL é qual, a tela
  // parece se contradizer, e quem confere valida errado.
  describe('rotuloDoCandidato — a tag precisa dizer de qual valor está falando', () => {
    it('🎯 espelho do grupo cheio × abatido', () => {
      expect(rotuloDoCandidato('espelho_group_cheio')).toBe('espelho do GRUPO (valor cheio)');
      expect(rotuloDoCandidato('espelho_group_abatido')).toMatch(/GRUPO.*abatidos/);
    });

    it('espelho individual', () => {
      expect(rotuloDoCandidato('espelho_individual_cheio')).toMatch(/individual.*cheio/);
    });

    it('espelho de uma plataforma só', () => {
      expect(rotuloDoCandidato('espelho_selection_LOGGI')).toBe('espelho só de LOGGI');
    });

    it('candidatos que não são espelho também têm nome em português', () => {
      expect(rotuloDoCandidato('liquido_individual')).toBe('total líquido do entregador');
      expect(rotuloDoCandidato('somaCnpj_individual_abatido')).toBe('soma dele neste CNPJ, com abate');
    });

    it('chave desconhecida não quebra — devolve ela mesma', () => {
      expect(rotuloDoCandidato('chave_nova_do_futuro')).toBe('chave_nova_do_futuro');
    });

    it('🎯 o caso real: a tag carrega o rótulo junto do número', () => {
      const d = {
        candidates: { liquido_grupo: 18885.87, espelho_group_cheio: 18885.87, somaCnpj_individual_abatido: 4338.1 },
        matchedCandidates: [],
      };
      expect(valorEsperadoDaNota(d)).toMatchObject({
        valor: 18885.87, bateu: false, origem: 'espelho_group_cheio',
        rotulo: 'espelho do GRUPO (valor cheio)',
      });
    });
  });
});