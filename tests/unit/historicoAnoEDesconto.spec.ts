import { describe, it, expect } from 'vitest';
import {
  agruparPorAno, textoDesconto, explicarDesconto,
  type MesDoHistorico,
} from '../../src/utils/historicoPagamentos';

/**
 * 🔴 A ETIQUETA QUE CONFUNDIA, E A GAVETA DE ANO (12/09/2026).
 *
 * O Victor, olhando o histórico: *"vamos adicionar a gaveta de ano também, aí
 * fica aberta automática a do ano atual; e vamos arrumar essa tag de erro com
 * desconto, tá falando que tem muito e pouca coisa descontado, está confuso"*.
 *
 * A confusão tinha causa concreta: a tela mostrava **"28 descontados"** ao lado
 * de **"216 erros"**. Um conta PESSOA, o outro conta LANÇAMENTO — unidades
 * diferentes lado a lado. E o dinheiro, que é o que interessa, não aparecia.
 *
 * Números reais de agosto/2026 (Caratinga): 200 erros lançados, dos quais só 74
 * descontaram algo; 126 eram só de quantidade e não tiraram nada. Total
 * descontado: R$ 1.824,99, de 28 pessoas.
 */

/** Um mês de mentirinha, só com o que estes testes olham. */
function mes(over: Partial<MesDoHistorico> & { chave: string; ano: string }): MesDoHistorico {
  return {
    nome: 'MÊS', emAndamento: false, semanas: [], listaErros: [],
    carteiraAssinada: { valor: 0, pessoas: 0, descontados: 0, erros: 0 },
    valor: 0, pagos: 0, pagosDiarista: 0, pagosClt: 0,
    totalFuncionarios: 0, totalDiarista: 0, totalClt: 0,
    descontados: 0, valorDescontado: 0, errosComDesconto: 0, errosMascarados: 0,
    erros: 0, errosDiarista: 0, errosClt: 0,
    ...over,
  } as MesDoHistorico;
}

describe('a gaveta de ano', () => {
  it('🎯 junta os meses no ano certo, do mais novo pro mais antigo', () => {
    const anos = agruparPorAno([
      mes({ chave: '2026-09', ano: '2026' }),
      mes({ chave: '2026-08', ano: '2026' }),
      mes({ chave: '2025-12', ano: '2025' }),
    ], '2026');

    expect(anos.map((a) => a.ano)).toEqual(['2026', '2025']);
    expect(anos[0].meses.map((m) => m.chave)).toEqual(['2026-09', '2026-08']);
  });

  it('🎯 o ano CORRENTE é o que abre sozinho', () => {
    const anos = agruparPorAno([
      mes({ chave: '2026-09', ano: '2026' }),
      mes({ chave: '2025-12', ano: '2025' }),
    ], '2026');
    expect(anos.find((a) => a.ano === '2026')?.emAndamento).toBe(true);
    expect(anos.find((a) => a.ano === '2025')?.emAndamento).toBe(false);
  });

  it('🎯 DINHEIRO soma; PESSOA não — senão o ano diria mais gente do que existe', () => {
    // A mesma pessoa recebe em janeiro E em fevereiro. Somar diria "60 pagos"
    // numa empresa que tem 40. É a mesma armadilha já resolvida de semana pra
    // mês: o maior mês é a aproximação honesta.
    const anos = agruparPorAno([
      mes({ chave: '2026-02', ano: '2026', valor: 1000, pagos: 30, pagosDiarista: 20, pagosClt: 10 }),
      mes({ chave: '2026-01', ano: '2026', valor: 500, pagos: 25, pagosDiarista: 15, pagosClt: 10 }),
    ], '2026');

    expect(anos[0].valor, 'o dinheiro soma').toBe(1500);
    expect(anos[0].pagos, 'pessoa NÃO soma — é o maior mês').toBe(30);
    expect(anos[0].pagosDiarista).toBe(20);
    expect(anos[0].pagosClt).toBe(10);
  });

  it('LANÇAMENTO soma: cada erro pertence a um mês só', () => {
    const anos = agruparPorAno([
      mes({ chave: '2026-02', ano: '2026', erros: 200, errosDiarista: 148, errosClt: 52,
            valorDescontado: 1824.99, errosComDesconto: 74 }),
      mes({ chave: '2026-01', ano: '2026', erros: 121, errosDiarista: 80, errosClt: 41,
            valorDescontado: 964, errosComDesconto: 31 }),
    ], '2026');

    expect(anos[0].erros).toBe(321);
    expect(anos[0].errosDiarista).toBe(228);
    expect(anos[0].errosClt).toBe(93);
    expect(anos[0].errosComDesconto).toBe(105);
    expect(anos[0].valorDescontado, 'sem sobra de ponto flutuante').toBe(2788.99);
  });

  it('ano sem semana nenhuma ainda entrega um intervalo utilizável', () => {
    const anos = agruparPorAno([mes({ chave: '2025-05', ano: '2025' })], '2026');
    expect(anos[0].inicio).toBe('2025-01-01');
    expect(anos[0].fim).toBe('2025-12-31');
  });

  it('lista vazia não quebra', () => {
    expect(agruparPorAno([], '2026')).toEqual([]);
  });
});

describe('a etiqueta do desconto', () => {
  const agosto = { valorDescontado: 1824.99, descontados: 28, errosMascarados: 0 };

  it('🎯 mostra o DINHEIRO e as pessoas, não dois números de unidades diferentes', () => {
    expect(textoDesconto(agosto)).toBe('− R$ 1.824,99 de 28 pessoas');
  });

  it('uma pessoa só fala no singular', () => {
    expect(textoDesconto({ valorDescontado: 50, descontados: 1, errosMascarados: 0 }))
      .toBe('− R$ 50,00 de 1 pessoa');
  });

  it('sem desconto nenhum, diz isso — não "R$ 0,00 de 0 pessoas"', () => {
    expect(textoDesconto({ valorDescontado: 0, descontados: 0, errosMascarados: 0 }))
      .toBe('nada descontado');
  });

  it('🎯 sem permissão de ver R$, esconde o valor mas mantém as pessoas', () => {
    expect(textoDesconto(agosto, false)).toBe('− R$ •••• de 28 pessoas');
  });

  it('🎯 com erro MASCARADO o total está incompleto — esconde em vez de mentir', () => {
    // Mostrar "R$ 900,00" quando 3 erros têm valor escondido daria um número
    // que parece exato e não é.
    const t = textoDesconto({ valorDescontado: 900, descontados: 10, errosMascarados: 3 });
    expect(t).toBe('− R$ •••• de 10 pessoas');
  });
});

describe('a explicação que desfaz a confusão', () => {
  it('🎯 diz quantos erros NÃO descontaram nada — que era o que faltava', () => {
    const t = explicarDesconto({ erros: 216, errosComDesconto: 74, errosMascarados: 0 });
    expect(t).toContain('74 de 216 erros descontaram em dinheiro');
    expect(t).toContain('142');
    expect(t).toMatch(/só de quantidade/);
  });

  it('quando todos descontaram, não inventa a parte que não existe', () => {
    const t = explicarDesconto({ erros: 5, errosComDesconto: 5, errosMascarados: 0 });
    expect(t).toContain('5 de 5 erros descontaram em dinheiro');
    expect(t).not.toMatch(/só de quantidade/);
  });

  it('um erro só fala no singular', () => {
    const t = explicarDesconto({ erros: 1, errosComDesconto: 0, errosMascarados: 0 });
    expect(t).toContain('1 foi só de quantidade e não descontou nada');
  });

  it('avisa quando há valor escondido', () => {
    const t = explicarDesconto({ erros: 10, errosComDesconto: 4, errosMascarados: 2 });
    expect(t).toMatch(/2 com valor escondido/);
    expect(t).toContain('4 de 10');
  });

  it('sem erro nenhum, diz isso', () => {
    expect(explicarDesconto({ erros: 0, errosComDesconto: 0, errosMascarados: 0 }))
      .toBe('Nenhum erro neste período.');
  });
});
