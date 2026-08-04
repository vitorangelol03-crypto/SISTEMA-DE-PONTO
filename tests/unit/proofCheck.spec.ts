// Conferência do ESPELHO DO APP (print da tela da Shopee) — testes do módulo puro
// compartilhado pelas duas edge fns (driver-public-api e driverpay-proof-admin).
//
// Os exemplos seguem o print REAL que o Victor mandou em 04/08/2026:
//   tela "Entrega" · aba "Encerrado (1808)" · período "2026/07/01 - 2026/07/15"
//
// Decisões do Victor cobertas aqui:
//   - conferir só a plataforma SHOPEE;
//   - quantidade tem que bater EXATO (tolerância 0);
//   - data errada = recusa na hora, com o motivo na tela do driver;
//   - quantidade diferente = aceita calado e mostra SÓ pro painel.
//
// Roda com: npx vitest run proofCheck
import { describe, expect, it } from 'vitest';
import {
  isRealDate,
  parseProofCount,
  parseProofDate,
  PROOF_MAX_ATTEMPTS,
  proofIsFullyConfirmed,
  proofRetryDelayMinutes,
  proofShouldReject,
  proofShouldRequeue,
  runProofCheck,
  toBrDate,
  type ProofCheckInput,
} from '../../supabase/functions/_shared/proofCheck';

const QUINZENA = { periodStart: '2026-07-01', periodEnd: '2026-07-15' };

/** Cenário base: print certinho do Victor, planilha batendo. */
function entrada(over: Partial<ProofCheckInput> = {}): ProofCheckInput {
  return {
    reading: { legivel: true, entregues: 1808, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' },
    ...QUINZENA,
    expectedPackages: 1808,
    platformLabel: 'SHOPEE',
    ...over,
  };
}

describe('isRealDate', () => {
  it('aceita data que existe', () => {
    expect(isRealDate(2026, 7, 15)).toBe(true);
    expect(isRealDate(2024, 2, 29)).toBe(true); // bissexto
  });

  it('recusa data que nao existe', () => {
    expect(isRealDate(2026, 2, 29)).toBe(false); // 2026 nao e bissexto
    expect(isRealDate(2026, 2, 31)).toBe(false);
    expect(isRealDate(2026, 4, 31)).toBe(false); // abril tem 30
    expect(isRealDate(2026, 13, 1)).toBe(false);
    expect(isRealDate(2026, 0, 1)).toBe(false);
    expect(isRealDate(2026, 7, 0)).toBe(false);
  });

  it('recusa ano fora da faixa plausivel', () => {
    expect(isRealDate(1999, 7, 1)).toBe(false);
    expect(isRealDate(2101, 7, 1)).toBe(false);
  });
});

describe('parseProofDate', () => {
  it('le o formato que o app da Shopee mostra (ano/mes/dia com barra)', () => {
    expect(parseProofDate('2026/07/01')).toBe('2026-07-01');
    expect(parseProofDate('2026/07/15')).toBe('2026-07-15');
  });

  it('le ISO, ponto e um digito so', () => {
    expect(parseProofDate('2026-07-01')).toBe('2026-07-01');
    expect(parseProofDate('2026.07.01')).toBe('2026-07-01');
    expect(parseProofDate('2026-7-1')).toBe('2026-07-01');
  });

  it('le o formato brasileiro (dia primeiro)', () => {
    expect(parseProofDate('01/07/2026')).toBe('2026-07-01');
    expect(parseProofDate('15-07-2026')).toBe('2026-07-15');
  });

  it('desambigua pelo grupo de 4 digitos, nao pela ordem', () => {
    // 07/01 poderia ser 7 de janeiro ou 1 de julho — o ano manda.
    expect(parseProofDate('2026/07/01')).toBe('2026-07-01'); // ano na frente => mes 07
    expect(parseProofDate('07/01/2026')).toBe('2026-01-07'); // ano no fim   => dia 07
  });

  it('devolve null pra data impossivel', () => {
    expect(parseProofDate('2026-02-31')).toBeNull();
    expect(parseProofDate('31/02/2026')).toBeNull();
  });

  it('devolve null pra lixo, em vez de chutar', () => {
    expect(parseProofDate('')).toBeNull();
    expect(parseProofDate('ontem')).toBeNull();
    expect(parseProofDate('2026-07')).toBeNull();
    expect(parseProofDate(null)).toBeNull();
    expect(parseProofDate(undefined)).toBeNull();
    expect(parseProofDate({ dia: 1 })).toBeNull();
  });

  // Casos REAIS capturados em 04/08 medindo o gemini-3.6-flash / 3.5-flash com o
  // print do Victor: o modelo acerta a data e as vezes nao fecha a string.
  // Sem tolerar isso, 1 leitura boa em 8 era jogada fora (viraria "print ilegivel").
  describe('lixo grudado pela leitora (casos reais medidos)', () => {
    it('a mesma data repetida vale', () => {
      expect(parseProofDate('2026-07-012026-07-01')).toBe('2026-07-01');
    });

    it('raciocinio vazando depois da data vale', () => {
      expect(parseProofDate('2026-07-01Pools and explicit string requirements check: YYYY-MM-DD format:'))
        .toBe('2026-07-01');
      expect(parseProofDate("2026-07-01Plugin block formatting inside JSON is forbidden. Let's fix output directly."))
        .toBe('2026-07-01');
    });

    it('texto antes da data tambem vale', () => {
      expect(parseProofDate('periodo: 2026/07/15')).toBe('2026-07-15');
    });

    it('DUAS datas diferentes no mesmo campo e ambiguo -> null, nao chuta', () => {
      // Se o inicio e o fim vierem colados nao da pra saber qual e qual, e chutar
      // aqui faria o sistema RECUSAR o driver por "periodo errado" sem motivo.
      expect(parseProofDate('2026-07-012026-07-15')).toBeNull();
      expect(parseProofDate('2026-07-01 a 2026-07-15')).toBeNull();
    });

    it('data impossivel grudada faz desistir por inteiro', () => {
      expect(parseProofDate('2026-07-01 e 2026-02-31')).toBeNull();
    });
  });
});

describe('parseProofCount', () => {
  it('aceita numero inteiro direto', () => {
    expect(parseProofCount(1808)).toBe(1808);
    expect(parseProofCount(0)).toBe(0);
  });

  it('aceita numero em texto, com ponto de milhar', () => {
    expect(parseProofCount('1808')).toBe(1808);
    expect(parseProofCount('1.808')).toBe(1808);
    expect(parseProofCount('12.345')).toBe(12345);
  });

  it('espaco NAO e separador de milhar — senao "0 1808" viraria 1808', () => {
    // A tela mostra "Em Rota (0)" ao lado de "Encerrado (1808)". Aceitar espaco
    // como milhar fazia esse par colar num numero so, EM SILENCIO. Ambiguo = null.
    expect(parseProofCount('1 808')).toBeNull();
  });

  it('aceita o rotulo inteiro da aba', () => {
    expect(parseProofCount('Encerrado (1808)')).toBe(1808);
    expect(parseProofCount('encerrado: 1.808')).toBe(1808);
  });

  it('com varios numeros, so aceita o que estiver rotulado como Encerrado', () => {
    // A tela tem "Em Rota (0)" e "Ocorrencia" do lado — pegar o primeiro ou o maior
    // daria numero errado EM SILENCIO, que e pior que numero nenhum.
    expect(parseProofCount('Em Rota (0) Ocorrencia Encerrado (1808)')).toBe(1808);
    expect(parseProofCount('0 1808')).toBeNull();
    expect(parseProofCount('14:06 1808')).toBeNull();
  });

  it('devolve null pra valor invalido', () => {
    expect(parseProofCount(-5)).toBeNull();
    expect(parseProofCount(1.5)).toBeNull();
    expect(parseProofCount('')).toBeNull();
    expect(parseProofCount('mil oitocentos e oito')).toBeNull();
    expect(parseProofCount(null)).toBeNull();
    expect(parseProofCount(undefined)).toBeNull();
  });
});

describe('toBrDate', () => {
  it('mostra a data do jeito que o driver le', () => {
    expect(toBrDate('2026-07-01')).toBe('01/07/2026');
    expect(toBrDate(null)).toBe('?');
  });
});

describe('runProofCheck — print certo', () => {
  it('print do Victor batendo com a planilha: ok e pode confirmar sozinho', () => {
    const r = runProofCheck(entrada());
    expect(r.status).toBe('ok');
    expect(r.periodoOk).toBe(true);
    expect(r.qtdOk).toBe(true);
    expect(r.readPackages).toBe(1808);
    expect(r.readStart).toBe('2026-07-01');
    expect(r.readEnd).toBe('2026-07-15');
    expect(r.driverReasons).toEqual([]);
    expect(r.internalReasons).toEqual([]);
    expect(proofShouldReject(r)).toBe(false);
    expect(proofIsFullyConfirmed(r)).toBe(true);
  });
});

describe('runProofCheck — periodo errado (RECUSA na hora)', () => {
  it('print da outra quinzena e recusado', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1500, periodoInicio: '2026/07/16', periodoFim: '2026/07/31' },
    }));
    expect(r.status).toBe('periodo_errado');
    expect(r.periodoOk).toBe(false);
    expect(proofShouldReject(r)).toBe(true);
    expect(proofIsFullyConfirmed(r)).toBe(false);
  });

  it('o motivo que vai pro driver diz as duas datas e o que fazer', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1500, periodoInicio: '2026/07/16', periodoFim: '2026/07/31' },
    }));
    expect(r.driverReasons).toHaveLength(1);
    const msg = r.driverReasons[0];
    expect(msg).toContain('16/07/2026');
    expect(msg).toContain('31/07/2026');
    expect(msg).toContain('01/07/2026');
    expect(msg).toContain('15/07/2026');
    expect(msg).toContain('Selecionar data');
  });

  it('nao confere quantidade quando o periodo esta errado (numero de outro periodo nao vale)', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1808, periodoInicio: '2026/06/01', periodoFim: '2026/06/15' },
    }));
    expect(r.qtdOk).toBeNull();
  });

  it('um dia de diferenca ja e periodo errado', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1808, periodoInicio: '2026/07/01', periodoFim: '2026/07/16' },
    }));
    expect(r.status).toBe('periodo_errado');
  });
});

describe('runProofCheck — ilegivel (RECUSA na hora)', () => {
  it('a leitora avisou que nao enxergou a tela', () => {
    const r = runProofCheck(entrada({ reading: { legivel: false } }));
    expect(r.status).toBe('ilegivel');
    expect(proofShouldReject(r)).toBe(true);
    expect(r.driverReasons).toHaveLength(1);
    expect(r.driverReasons[0]).toContain('captura de tela');
  });

  it('faltou o periodo no print', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1808, periodoInicio: null, periodoFim: null },
    }));
    expect(r.status).toBe('ilegivel');
    expect(r.internalReasons[0]).toContain('o período');
  });

  it('faltou a quantidade no print', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: null, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' },
    }));
    expect(r.status).toBe('ilegivel');
    expect(r.internalReasons[0]).toContain('Encerrado');
  });

  it('quantidade ambigua (varios numeros sem rotulo) vira ilegivel, nao chute', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: '0 1808', periodoInicio: '2026/07/01', periodoFim: '2026/07/15' },
    }));
    expect(r.status).toBe('ilegivel');
    expect(r.readPackages).toBeNull();
  });
});

describe('runProofCheck — quantidade divergente (ACEITA, mostra so pro painel)', () => {
  it('faltando pacote no print: divergente, e NAO recusa', () => {
    const r = runProofCheck(entrada({ reading: { legivel: true, entregues: 1750, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } }));
    expect(r.status).toBe('divergente');
    expect(r.periodoOk).toBe(true);
    expect(r.qtdOk).toBe(false);
    expect(proofShouldReject(r)).toBe(false);
    expect(proofIsFullyConfirmed(r)).toBe(false);
  });

  it('o painel recebe os dois numeros e de que lado esta a diferenca', () => {
    const menos = runProofCheck(entrada({ reading: { legivel: true, entregues: 1750, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } }));
    expect(menos.internalReasons[0]).toContain('1808');
    expect(menos.internalReasons[0]).toContain('1750');
    expect(menos.internalReasons[0]).toContain('58 a menos');

    const mais = runProofCheck(entrada({ reading: { legivel: true, entregues: 1850, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } }));
    expect(mais.internalReasons[0]).toContain('42 a mais');
  });

  it('1 pacote de diferenca ja aparece (Victor escolheu bater EXATO)', () => {
    const r = runProofCheck(entrada({ reading: { legivel: true, entregues: 1807, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } }));
    expect(r.status).toBe('divergente');
    expect(r.qtdOk).toBe(false);
  });

  it('com folga configurada, a diferenca dentro dela passa', () => {
    const dentro = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1806, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' },
      tolerancePackages: 2,
    }));
    expect(dentro.status).toBe('ok');
    expect(dentro.qtdOk).toBe(true);

    const fora = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1805, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' },
      tolerancePackages: 2,
    }));
    expect(fora.status).toBe('divergente');
  });
});

describe('runProofCheck — sem base de comparacao', () => {
  it('planilha sem pacote pra ele nao reprova, mas tambem nao confirma sozinho', () => {
    const r = runProofCheck(entrada({ expectedPackages: 0 }));
    expect(r.status).toBe('ok');
    expect(r.periodoOk).toBe(true);
    expect(r.qtdOk).toBeNull();
    expect(proofShouldReject(r)).toBe(false);
    expect(proofIsFullyConfirmed(r)).toBe(false); // qtdOk null nao autoriza o automatico
  });
});

describe('runProofCheck — falha nossa nunca recusa o driver', () => {
  it('leitura indisponivel (rede/chave/excecao) vira pendente, silencioso pro driver', () => {
    const r = runProofCheck(entrada({ reading: null }));
    expect(r.status).toBe('pendente');
    expect(r.periodoOk).toBeNull();
    expect(r.qtdOk).toBeNull();
    expect(r.driverReasons).toEqual([]);
    expect(r.internalReasons[0]).toContain('Confira na mão');
    expect(proofShouldReject(r)).toBe(false);
    expect(proofIsFullyConfirmed(r)).toBe(false);
  });
});

describe('FILA de reconferencia — "se a API cair, espera ela voltar"', () => {
  it('so o "pendente" (falha NOSSA) volta pra fila', () => {
    const pendente = runProofCheck(entrada({ reading: null }));
    expect(proofShouldRequeue(pendente)).toBe(true);
    expect(proofShouldRequeue(null)).toBe(true);
  });

  it('resultado JA CONFERIDO nao volta pra fila', () => {
    expect(proofShouldRequeue(runProofCheck(entrada()))).toBe(false);                      // ok
    expect(proofShouldRequeue(runProofCheck(entrada({                                       // divergente
      reading: { legivel: true, entregues: 1750, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' },
    })))).toBe(false);
  });

  it('problema da FOTO nao volta pra fila — quem resolve e o driver reenviando', () => {
    // Tentar ler de novo a mesma foto ruim daria o mesmo resultado e so queimaria cota.
    expect(proofShouldRequeue(runProofCheck(entrada({ reading: { legivel: false } })))).toBe(false);
    expect(proofShouldRequeue(runProofCheck(entrada({
      reading: { legivel: true, entregues: 1808, periodoInicio: '2026/07/16', periodoFim: '2026/07/31' },
    })))).toBe(false);
  });

  it('a espera cresce e atravessa a virada do dia (quando a cota reseta)', () => {
    expect(proofRetryDelayMinutes(0)).toBe(15);    // pico de demanda passa rapido
    expect(proofRetryDelayMinutes(1)).toBe(60);
    expect(proofRetryDelayMinutes(2)).toBe(180);
    expect(proofRetryDelayMinutes(3)).toBe(360);
    expect(proofRetryDelayMinutes(4)).toBe(720);   // 12h = atravessa o reset da cota diaria
    expect(proofRetryDelayMinutes(7)).toBe(720);
  });

  it('a fila cobre mais de um dia antes de desistir', () => {
    let total = 0;
    for (let i = 0; i < PROOF_MAX_ATTEMPTS; i++) total += proofRetryDelayMinutes(i) ?? 0;
    expect(total / 60).toBeGreaterThan(48); // > 2 dias de cobertura
  });

  it('desiste depois do limite — dai fica so a conferencia manual', () => {
    expect(proofRetryDelayMinutes(PROOF_MAX_ATTEMPTS)).toBeNull();
    expect(proofRetryDelayMinutes(99)).toBeNull();
    expect(proofRetryDelayMinutes(-1)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLINDAGEM DA PRIVACIDADE — a regra mais importante da feature.
// Decisão do Victor: "driver so anexara a foto, ele nao pode ter acesso a nenhuma
// informacao". Se algum dia alguem mexer no runProofCheck e deixar o numero
// escapar pra mensagem do driver, estes testes quebram.
// ─────────────────────────────────────────────────────────────────────────────
describe('BLINDAGEM: o driver nunca ve numero de pacote', () => {
  const cenarios: Array<[string, ProofCheckInput]> = [
    ['faltando muito', entrada({ reading: { legivel: true, entregues: 900, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } })],
    ['faltando 1', entrada({ reading: { legivel: true, entregues: 1807, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } })],
    ['sobrando', entrada({ reading: { legivel: true, entregues: 2500, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } })],
    ['zerado', entrada({ reading: { legivel: true, entregues: 0, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } })],
  ];

  it.each(cenarios)('quantidade divergente (%s) nao gera NENHUM motivo pro driver', (_nome, input) => {
    const r = runProofCheck(input);
    expect(r.status).toBe('divergente');
    expect(r.driverReasons).toEqual([]);
    expect(r.internalReasons.length).toBeGreaterThan(0); // o painel ve
  });

  it('o esperado da planilha nunca aparece em driverReasons, em cenario nenhum', () => {
    const todos: ProofCheckInput[] = [
      ...cenarios.map(([, i]) => i),
      entrada(),
      entrada({ reading: null }),
      entrada({ reading: { legivel: false } }),
      entrada({ expectedPackages: 0 }),
      entrada({ reading: { legivel: true, entregues: 1808, periodoInicio: '2026/07/16', periodoFim: '2026/07/31' } }),
      entrada({ reading: { legivel: true, entregues: null, periodoInicio: '2026/07/01', periodoFim: '2026/07/15' } }),
    ];
    for (const input of todos) {
      const texto = runProofCheck(input).driverReasons.join(' ');
      expect(texto).not.toContain(String(input.expectedPackages)); // "1808"
      expect(texto).not.toMatch(/pacote/i);
      expect(texto).not.toMatch(/planilha/i);
    }
  });

  it('o print recusado por periodo mostra so datas — nenhum numero de pacote', () => {
    const r = runProofCheck(entrada({
      reading: { legivel: true, entregues: 1750, periodoInicio: '2026/07/16', periodoFim: '2026/07/31' },
    }));
    expect(r.driverReasons.join(' ')).not.toContain('1750'); // nem o que ELE mandou
    expect(r.driverReasons.join(' ')).not.toContain('1808'); // nem o nosso
  });
});
