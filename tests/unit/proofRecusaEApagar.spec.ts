/**
 * Print com DATA ERRADA: recusa na hora, apaga só na SEGUNDA confirmação (04/08/2026).
 *
 * 🔑 Por que não apaga na primeira leitura — caso GESSILEY, medido em produção:
 * a IA leu a MESMA foto duas vezes com respostas diferentes. Na 1ª disse 4049
 * pacotes no período 16-31/07 (data errada); na 2ª disse 3733 no período 01-15/07
 * (data certa). A planilha esperava 3734 — ou seja, a 2ª leitura era a correta e a
 * 1ª foi invenção. Apagar na primeira teria destruído um print BOM, e o entregador
 * reenviaria à toa.
 *
 * Decisão do Victor: **(B)** recusa na hora (ele já vê o motivo e pode reenviar),
 * mas só apaga quando uma SEGUNDA leitura confirmar a data errada.
 */
import { describe, it, expect } from 'vitest';
import {
  proofContarDataErrada,
  proofDeveApagar,
  proofShouldRequeue,
  proofShouldReject,
  PROOF_CONFIRMACOES_PARA_APAGAR,
  type ProofCheckResult,
} from '../../supabase/functions/_shared/proofCheck';

/** Resultado de conferência mínimo, só com o que estas regras olham. */
const res = (status: ProofCheckResult['status']): ProofCheckResult =>
  ({
    status,
    periodoOk: status === 'periodo_errado' ? false : true,
    qtdOk: status === 'ok',
    readPackages: null,
    readStart: null,
    readEnd: null,
    expectedPackages: null,
    driverReasons: [],
    internalReasons: [],
  }) as unknown as ProofCheckResult;

describe('contagem de leituras seguidas de data errada', () => {
  it('primeira leitura com data errada conta 1', () => {
    expect(proofContarDataErrada(0, res('periodo_errado'))).toBe(1);
  });

  it('segunda leitura seguida com data errada conta 2', () => {
    expect(proofContarDataErrada(1, res('periodo_errado'))).toBe(2);
  });

  it('🔑 leitura que ABSOLVE zera a contagem — é o caso do Gessiley', () => {
    // 1ª leitura disse data errada; a 2ª leu o período certo. A contagem tem que
    // voltar a zero, senão uma 3ª leitura ruim apagaria um print bom.
    expect(proofContarDataErrada(1, res('divergente'))).toBe(0);
    expect(proofContarDataErrada(1, res('ok'))).toBe(0);
  });

  it('falha NOSSA (pendente) zera: cota/rede não é prova sobre a foto', () => {
    expect(proofContarDataErrada(1, res('pendente'))).toBe(0);
  });

  it('print ilegível não conta como data errada', () => {
    expect(proofContarDataErrada(1, res('ilegivel'))).toBe(0);
  });

  it('contagem estragada no banco não vira lixo negativo', () => {
    expect(proofContarDataErrada(-5, res('periodo_errado'))).toBe(1);
    expect(proofContarDataErrada(NaN, res('periodo_errado'))).toBe(1);
  });
});

describe('quando pode APAGAR o print', () => {
  it('🔴 NUNCA apaga na primeira leitura, mesmo com data errada', () => {
    expect(proofDeveApagar(res('periodo_errado'), 1)).toBe(false);
  });

  it('apaga quando a SEGUNDA leitura confirma', () => {
    expect(proofDeveApagar(res('periodo_errado'), 2)).toBe(true);
  });

  it('nunca apaga por quantidade divergente, ilegível ou falha nossa', () => {
    for (const s of ['divergente', 'ilegivel', 'pendente', 'ok'] as const) {
      expect(proofDeveApagar(res(s), 5)).toBe(false);
    }
  });

  it('o número de confirmações exigido é 2', () => {
    expect(PROOF_CONFIRMACOES_PARA_APAGAR).toBe(2);
  });
});

describe('volta pra fila', () => {
  it('data errada na 1ª leitura VOLTA — é a 2ª leitura que decide se apaga', () => {
    expect(proofShouldRequeue(res('periodo_errado'), 1)).toBe(true);
  });

  it('data errada já confirmada 2x NÃO volta (vai ser apagado)', () => {
    expect(proofShouldRequeue(res('periodo_errado'), 2)).toBe(false);
  });

  it('falha nossa continua voltando, como antes', () => {
    expect(proofShouldRequeue(res('pendente'))).toBe(true);
    expect(proofShouldRequeue(null)).toBe(true);
  });

  it('conferido, divergente e ilegível não voltam', () => {
    expect(proofShouldRequeue(res('ok'))).toBe(false);
    expect(proofShouldRequeue(res('divergente'))).toBe(false);
    expect(proofShouldRequeue(res('ilegivel'))).toBe(false);
  });

  it('sem informar a contagem, o comportamento antigo é preservado', () => {
    // Chamadas antigas passam só o resultado: data errada não volta (default 0 < 2
    // faria voltar) — este teste fixa o contrato novo pra ninguém quebrar sem ver.
    expect(proofShouldRequeue(res('periodo_errado'))).toBe(true);
  });
});

describe('recusa (o que o entregador vê) não mudou', () => {
  it('data errada e ilegível recusam; divergente e pendente não', () => {
    expect(proofShouldReject(res('periodo_errado'))).toBe(true);
    expect(proofShouldReject(res('ilegivel'))).toBe(true);
    expect(proofShouldReject(res('divergente'))).toBe(false);
    expect(proofShouldReject(res('pendente'))).toBe(false);
    expect(proofShouldReject(res('ok'))).toBe(false);
  });
});
