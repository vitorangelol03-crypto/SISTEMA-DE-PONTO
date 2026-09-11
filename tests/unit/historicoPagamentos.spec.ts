/**
 * HISTÓRICO EM GAVETAS — a conta da Etapa 2 (desenhada com o Victor em 10/09/2026).
 *
 * As regras que este arquivo tranca, todas decisões dele:
 *  - a semana cai na gaveta do mês em que foi PAGA ("ela cai no mês que foi paga");
 *  - o mês fechado mostra valor, pagos (D × C), descontados e erros SEM abrir;
 *  - erro de diarista e de carteira assinada contam separados;
 *  - o número do mês é a SOMA das semanas — gaveta fechada e aberta não podem divergir;
 *  - o vínculo vem CARIMBADO no pagamento: quem virou CLT continua diarista no passado.
 *
 * Os períodos usam as datas REAIS do banco (semanas cadastradas desde julho).
 */
import { describe, it, expect } from 'vitest';
import {
  montarHistorico,
  foraDasGavetas,
  intervaloDaSemana,
  mesDaData,
  textoErros,
  type PeriodoDePagamento,
  type PagamentoDoHistorico,
  type ErroDoHistorico,
} from '../../src/utils/historicoPagamentos';

const per = (
  id: string, label: string, startDate: string, endDate: string, paymentDate: string,
  status = 'paid',
): PeriodoDePagamento => ({ id, label, startDate, endDate, paymentDate, status });

const pag = (
  employeeId: string, date: string, total: number, vinculo: 'Diarista' | 'Carteira Assinada' = 'Diarista',
): PagamentoDoHistorico => ({ id: `${employeeId}-${date}`, employeeId, date, total, vinculo });

const err = (
  employeeId: string, date: string, quantidade: number, valor: number,
  vinculo: 'Diarista' | 'Carteira Assinada' = 'Diarista',
): ErroDoHistorico => ({
  id: `e-${employeeId}-${date}`, employeeId, nome: employeeId, equipe: 'Triagem - Shopee',
  vinculo, date, quantidade, valor, descricao: `${quantidade} fora de rota`,
});

// Datas REAIS do banco (payment_periods de Caratinga)
const SEMANAS_REAIS = [
  per('p1', 'Semana 28/07 a 03/08', '2026-07-28', '2026-08-03', '2026-08-03'),
  per('p2', 'Semana 04/08 a 10/08', '2026-08-04', '2026-08-10', '2026-08-10'),
  per('p3', 'Semana 31/08 a 06/09', '2026-08-31', '2026-09-06', '2026-09-06'),
  per('p4', 'Semana 07/09 a 13/09', '2026-09-07', '2026-09-13', '2026-09-13', 'open'),
];

describe('a semana cai no mês em que foi PAGA', () => {
  it('🎯 28/07–03/08 paga em agosto → gaveta de AGOSTO (não julho)', () => {
    const h = montarHistorico([SEMANAS_REAIS[0]], [], [], '2026-09');
    expect(h).toHaveLength(1);
    expect(h[0].chave).toBe('2026-08');
    expect(h[0].nome).toBe('AGOSTO');
  });

  it('🎯 31/08–06/09 paga em setembro → gaveta de SETEMBRO (não agosto)', () => {
    const h = montarHistorico([SEMANAS_REAIS[2]], [], [], '2026-09');
    expect(h[0].chave).toBe('2026-09');
  });

  it('a data que manda é a do pagamento, não a do início nem a do fim', () => {
    // mesma semana, pago no mês seguinte: muda de gaveta
    const antes = montarHistorico([per('x', 'S', '2026-09-29', '2026-10-05', '2026-10-05')], [], [], '2026-10');
    expect(antes[0].chave).toBe('2026-10');
    const depois = montarHistorico([per('x', 'S', '2026-09-29', '2026-10-05', '2026-09-30')], [], [], '2026-10');
    expect(depois[0].chave).toBe('2026-09');
  });

  it('gaveta mais recente em cima', () => {
    const h = montarHistorico(SEMANAS_REAIS, [], [], '2026-09');
    expect(h.map((m) => m.chave)).toEqual(['2026-09', '2026-08']);
  });
});

describe('os números da linha fechada', () => {
  const pagamentos = [
    // semana de 04–10/08: 3 diaristas (um com 2 diárias) e 1 CLT
    pag('d1', '2026-08-04', 50), pag('d1', '2026-08-05', 50),
    pag('d2', '2026-08-06', 50),
    pag('d3', '2026-08-07', 50),
    pag('c1', '2026-08-10', 1600, 'Carteira Assinada'),
  ];
  const erros = [
    err('d1', '2026-08-05', 5, 25),          // descontado
    err('d2', '2026-08-06', 2, 0),           // erro sem desconto
    err('c1', '2026-08-07', 4, 20, 'Carteira Assinada'),   // erro de CLT, descontado
  ];

  it('conta PESSOAS pagas, não lançamentos (2 diárias do mesmo = 1 pago)', () => {
    const h = montarHistorico([SEMANAS_REAIS[1]], pagamentos, erros, '2026-09');
    const s = h[0].semanas[0];
    expect(s.pagos).toBe(4);            // d1, d2, d3, c1
    expect(s.pagosDiarista).toBe(3);
    expect(s.pagosClt).toBe(1);
    expect(s.valor).toBe(1800);         // 50*4 + 1600
  });

  it('descontado é quem teve VALOR tirado — erro só de quantidade não conta', () => {
    const h = montarHistorico([SEMANAS_REAIS[1]], pagamentos, erros, '2026-09');
    expect(h[0].semanas[0].descontados).toBe(2);   // d1 e c1; d2 teve erro sem valor
  });

  it('🎯 erros separados por vínculo, no mês E na semana', () => {
    const h = montarHistorico([SEMANAS_REAIS[1]], pagamentos, erros, '2026-09');
    const s = h[0].semanas[0];
    expect([s.erros, s.errosDiarista, s.errosClt]).toEqual([3, 2, 1]);
    expect([h[0].erros, h[0].errosDiarista, h[0].errosClt]).toEqual([3, 2, 1]);
  });

  it('o bloco do carteira assinada é mensal e fica à parte das semanas', () => {
    const h = montarHistorico([SEMANAS_REAIS[1]], pagamentos, erros, '2026-09');
    expect(h[0].carteiraAssinada).toEqual({ valor: 1600, pessoas: 1, descontados: 1, erros: 1 });
  });
});

describe('o mês é a SOMA das semanas (gaveta fechada não pode divergir da aberta)', () => {
  it('🎯 valor, pagos e erros do mês batem com a soma das semanas dele', () => {
    const pagamentos = [
      pag('d1', '2026-08-04', 50), pag('d2', '2026-08-05', 50),   // semana 2
      pag('d1', '2026-07-29', 50), pag('d3', '2026-08-01', 50),   // semana 1 (atravessa o mês)
      pag('c1', '2026-08-10', 1600, 'Carteira Assinada'),
    ];
    const erros = [
      err('d1', '2026-08-04', 3, 15),
      err('d3', '2026-08-01', 2, 10),
      err('c1', '2026-08-10', 1, 5, 'Carteira Assinada'),
    ];
    const h = montarHistorico([SEMANAS_REAIS[0], SEMANAS_REAIS[1]], pagamentos, erros, '2026-09');
    const mes = h[0];
    expect(mes.chave).toBe('2026-08');
    expect(mes.semanas).toHaveLength(2);

    const somaValor = mes.semanas.reduce((s, w) => s + w.valor, 0);
    const somaErros = mes.semanas.reduce((s, w) => s + w.erros, 0);
    expect(mes.valor).toBe(somaValor);
    expect(mes.erros).toBe(somaErros);
    expect(mes.errosDiarista + mes.errosClt).toBe(mes.erros);
    // pessoa que aparece nas duas semanas conta UMA vez no mês
    expect(mes.pagos).toBe(4);
    expect(mes.semanas.reduce((s, w) => s + w.pagos, 0)).toBe(5);
  });
});

describe('o vínculo é o CARIMBADO no pagamento, não o da ficha', () => {
  it('🎯 quem virou CLT continua contando como diarista no passado', () => {
    // Mesma pessoa: pagamentos antigos carimbados Diarista, os novos CLT.
    const pagamentos = [
      pag('pessoa', '2026-08-04', 50, 'Diarista'),
      pag('pessoa', '2026-09-08', 1600, 'Carteira Assinada'),
    ];
    const h = montarHistorico([SEMANAS_REAIS[1], SEMANAS_REAIS[3]], pagamentos, [], '2026-09');
    const agosto = h.find((m) => m.chave === '2026-08')!;
    const setembro = h.find((m) => m.chave === '2026-09')!;
    expect([agosto.pagosDiarista, agosto.pagosClt]).toEqual([1, 0]);
    expect([setembro.pagosDiarista, setembro.pagosClt]).toEqual([0, 1]);
    // e o histórico antigo NÃO virou CLT
    expect(agosto.carteiraAssinada.pessoas).toBe(0);
  });
});

describe('numeração e rótulos', () => {
  it('as semanas são numeradas DENTRO da gaveta do mês', () => {
    const h = montarHistorico([SEMANAS_REAIS[0], SEMANAS_REAIS[1]], [], [], '2026-09');
    expect(h[0].semanas.map((s) => s.numero)).toEqual(['Semana 1', 'Semana 2']);
    // a Semana 1 de AGOSTO começa em julho — e está certo, foi paga em agosto
    expect(h[0].semanas[0].startDate).toBe('2026-07-28');
  });

  it('intervalo encurta quando fecha no mesmo mês e mostra os dois quando atravessa', () => {
    expect(intervaloDaSemana('2026-09-01', '2026-09-07')).toBe('01 – 07/09');
    expect(intervaloDaSemana('2026-07-28', '2026-08-03')).toBe('28/07 – 03/08');
  });

  it('mês em andamento ganha o selo (e é quem abre sozinha)', () => {
    const h = montarHistorico(SEMANAS_REAIS, [], [], '2026-09');
    expect(h.find((m) => m.chave === '2026-09')!.emAndamento).toBe(true);
    expect(h.find((m) => m.chave === '2026-08')!.emAndamento).toBe(false);
  });

  it('texto dos erros', () => {
    expect(textoErros(0, 0, 0)).toBe('sem erro');
    expect(textoErros(1, 1, 0)).toBe('1 erro (1 D · 0 C)');
    expect(textoErros(4, 3, 1)).toBe('4 erros (3 D · 1 C)');
  });

  it('mesDaData não passa por Date (fuso não muda a gaveta)', () => {
    expect(mesDaData('2026-09-01')).toBe('2026-09');
    expect(mesDaData('2026-12-31')).toBe('2026-12');
  });
});

describe('bordas', () => {
  it('sem período nenhum: nenhuma gaveta', () => {
    expect(montarHistorico([], [], [], '2026-09')).toEqual([]);
  });

  it('pagamento zerado não conta como pago', () => {
    const h = montarHistorico([SEMANAS_REAIS[1]], [pag('d1', '2026-08-05', 0)], [], '2026-09');
    expect(h[0].semanas[0].pagos).toBe(0);
    expect(h[0].semanas[0].valor).toBe(0);
  });

  it('pagamento fora de qualquer semana não entra em gaveta nenhuma', () => {
    const h = montarHistorico([SEMANAS_REAIS[1]], [pag('d1', '2026-08-20', 50)], [], '2026-09');
    expect(h[0].semanas[0].pagos).toBe(0);
    expect(h[0].valor).toBe(0);
  });

  it('semanas sobrepostas (as duas séries que existem no banco) não quebram a conta', () => {
    // 17/08–23/08 e 18/08–24/08 existem as duas em produção, e 19/08 cabe nas duas.
    //
    // ⚠️ Este teste EXIGIA que o pagamento aparecesse nas DUAS semanas. Era a
    // duplicação carimbada como se fosse o certo — a gaveta aberta somava o
    // dobro da fechada. Quem estava errado era a expectativa: um dia pertence a
    // UMA semana só (a que começa antes). Reescrito em 11/09/2026.
    const sobrepostas = [
      per('a', 'Semana 17/08 a 23/08', '2026-08-17', '2026-08-23', '2026-08-23'),
      per('b', 'Semana 18/08 a 24/08', '2026-08-18', '2026-08-24', '2026-08-24'),
    ];
    const h = montarHistorico(sobrepostas, [pag('d1', '2026-08-19', 50)], [], '2026-09');
    expect(h[0].semanas.filter((s) => s.pagos > 0), 'em UMA semana só').toHaveLength(1);
    expect(h[0].semanas.reduce((t, s) => t + s.valor, 0), 'soma das semanas = mês').toBe(h[0].valor);
    expect(h[0].pagos).toBe(1);
    expect(h[0].valor).toBe(50);
  });
});

/**
 * 🔴 O BUG QUE AS CONFERÊNCIAS NA TELA PEGARAM (11/09/2026), EM DOIS ATOS
 *
 * Em produção existem semanas SOBREPOSTAS — 31/08–06/09 e 01–07/09 convivem, de
 * quando o dia de início da semana mudou.
 *
 * 1º ato: o mês somava as listas das semanas e contava o mesmo erro duas vezes —
 *   setembro apareceu com "106 erros", que eram 54 + 52 do MESMO conjunto.
 * 2º ato (o fix era pela metade): tirar a duplicata SÓ no mês deixou as semanas
 *   ainda duplicando entre si. A gaveta ABERTA somava R$ 16.194 enquanto a linha
 *   FECHADA dizia R$ 8.472, e R$ 1.748 do dia 27/07 apareciam em julho E em
 *   agosto — porque 21–27/07 é paga em julho e 27/07–02/08 em agosto.
 *
 * A regra agora é DONO ÚNICO: cada lançamento pertence a UMA semana. Estes
 * testes provam a invariante, não o comportamento de um fix específico — se
 * alguém voltar a duplicar, eles quebram.
 */
describe('dono único: nada é contado em duas gavetas', () => {
  const sobrepostas = [
    per('s1', 'Semana 31/08 a 06/09', '2026-08-31', '2026-09-06', '2026-09-06'),
    per('s2', 'Semana 01/09 a 07/09', '2026-09-01', '2026-09-07', '2026-09-07'),
  ];

  it('🎯 um dia que cai nas DUAS semanas pertence a EXATAMENTE UMA', () => {
    // 02/09 está dentro das duas.
    const h = montarHistorico(sobrepostas, [], [err('d1', '2026-09-02', 3, 15)], '2026-09');
    const quantasSemanasContaram = h[0].semanas.filter((s) => s.erros > 0).length;
    expect(quantasSemanasContaram, 'o erro tem que aparecer em UMA semana só').toBe(1);
    expect(h[0].erros).toBe(1);
    expect(h[0].listaErros).toHaveLength(1);
  });

  it('🎯 a gaveta ABERTA fecha com a FECHADA: soma das semanas = mês', () => {
    const pagamentos = [
      pag('d1', '2026-09-02', 120),   // nas duas semanas
      pag('d2', '2026-09-05', 80),    // nas duas semanas
      pag('d3', '2026-08-31', 50),    // só na s1
      pag('d4', '2026-09-07', 90),    // só na s2
    ];
    const erros = [
      err('d1', '2026-09-02', 3, 15),
      err('c1', '2026-09-03', 2, 10, 'Carteira Assinada'),
      err('d4', '2026-09-07', 1, 5),
    ];
    const h = montarHistorico(sobrepostas, pagamentos, erros, '2026-09');
    const mes = h[0];

    const somaSemanas = (campo: 'valor' | 'erros' | 'errosDiarista' | 'errosClt') =>
      mes.semanas.reduce((t, s) => t + s[campo], 0);

    expect(somaSemanas('valor'), 'valor').toBe(mes.valor);
    expect(somaSemanas('erros'), 'erros').toBe(mes.erros);
    expect(somaSemanas('errosDiarista'), 'erros diarista').toBe(mes.errosDiarista);
    expect(somaSemanas('errosClt'), 'erros CLT').toBe(mes.errosClt);
    // E o valor é o do caixa, sem nada em dobro.
    expect(mes.valor).toBe(120 + 80 + 50 + 90);
  });

  it('🎯 nenhum lançamento aparece na lista de duas semanas', () => {
    const pagamentos = [pag('d1', '2026-09-02', 120), pag('d2', '2026-09-05', 80)];
    const erros = [err('d1', '2026-09-02', 3, 15), err('d2', '2026-09-05', 1, 5)];
    const h = montarHistorico(sobrepostas, pagamentos, erros, '2026-09');
    const idsPorSemana = h[0].semanas.map((s) => s.listaErros.map((e) => e.id));
    const todos = idsPorSemana.flat();
    expect(new Set(todos).size, 'nenhum id repetido entre as semanas').toBe(todos.length);
  });

  it('a divisão por vínculo do mês também não duplica', () => {
    const erros = [
      err('d1', '2026-09-02', 3, 15),
      err('c1', '2026-09-03', 2, 10, 'Carteira Assinada'),
    ];
    const h = montarHistorico(sobrepostas, [], erros, '2026-09');
    expect([h[0].erros, h[0].errosDiarista, h[0].errosClt]).toEqual([2, 1, 1]);
  });

  it('e o pagamento também conta uma vez só', () => {
    const h = montarHistorico(sobrepostas, [pag('d1', '2026-09-02', 50)], [], '2026-09');
    expect(h[0].pagos).toBe(1);
    expect(h[0].valor).toBe(50);
  });
});

/**
 * 🎯 O CASO REAL DO 27/07 — o dinheiro que aparecia em DOIS MESES.
 *
 * "Semana 21/07 a 27/07" é paga em JULHO e "Semana 27/07 a 02/08" em AGOSTO.
 * O dia 27/07 está nas duas, então R$ 1.748 entravam na gaveta de julho E na de
 * agosto, inflando o ano. Com dono único, entra em uma só.
 */
describe('semana que atravessa o mês não conta o dia nos dois meses', () => {
  const atravessa = [
    per('j', 'Semana 21/07 a 27/07', '2026-07-21', '2026-07-27', '2026-07-27'),
    per('a', 'Semana 27/07 a 02/08', '2026-07-27', '2026-08-02', '2026-08-02'),
  ];

  it('🎯 o pagamento do 27/07 entra em UM mês só', () => {
    const h = montarHistorico(atravessa, [pag('d1', '2026-07-27', 1748)], [], '2026-08');
    const mesesComValor = h.filter((m) => m.valor > 0);
    expect(mesesComValor, 'um mês só recebe o dinheiro').toHaveLength(1);
    expect(mesesComValor[0].valor).toBe(1748);
    // E o total do período inteiro é o do caixa, não o dobro.
    expect(h.reduce((t, m) => t + m.valor, 0)).toBe(1748);
  });

  it('quem começa antes leva o dia — a semana de julho', () => {
    const h = montarHistorico(atravessa, [pag('d1', '2026-07-27', 1748)], [], '2026-08');
    const julho = h.find((m) => m.chave === '2026-07');
    expect(julho?.valor).toBe(1748);
    expect(h.find((m) => m.chave === '2026-08')?.valor).toBe(0);
  });
});

/**
 * 🔴 VALOR MASCARADO NÃO É ZERO (achado em revisão, 11/09/2026).
 *
 * Quem não tem permissão de ver dinheiro recebe `total = null` da RPC. Tratar
 * isso como 0 fazia a gaveta dizer "0 pagos (0 diaristas · 0 CLT)" — como se
 * ninguém tivesse recebido. A pessoa foi paga; o valor é que está escondido.
 */
describe('valor mascarado conta a pessoa, esconde o dinheiro', () => {
  const semana = [per('p1', 'Semana 1', '2026-09-01', '2026-09-07', '2026-09-07')];

  it('🎯 pagamento mascarado continua sendo "1 pago"', () => {
    const h = montarHistorico(
      semana,
      [{ id: 'x', employeeId: 'd1', date: '2026-09-02', total: null, vinculo: 'Diarista' }],
      [], '2026-09',
    );
    expect(h[0].pagos, 'a pessoa existe mesmo sem ver o valor').toBe(1);
    expect(h[0].pagosDiarista).toBe(1);
    expect(h[0].valor, 'o valor some, a pessoa não').toBe(0);
  });

  it('pagamento de R$ 0,00 de verdade NÃO conta como pago', () => {
    const h = montarHistorico(semana, [pag('d1', '2026-09-02', 0)], [], '2026-09');
    expect(h[0].pagos).toBe(0);
  });

  it('erro com desconto mascarado conta como descontado', () => {
    const h = montarHistorico(
      semana, [pag('d1', '2026-09-02', 100)],
      [{
        id: 'e1', employeeId: 'd1', nome: 'D1', equipe: 'Triagem', vinculo: 'Diarista',
        date: '2026-09-02', quantidade: 2, valor: null, descricao: '',
      }],
      '2026-09',
    );
    expect(h[0].descontados).toBe(1);
  });

  it('erro só de quantidade (R$ 0) não conta como descontado', () => {
    const h = montarHistorico(semana, [pag('d1', '2026-09-02', 100)],
      [err('d1', '2026-09-02', 2, 0)], '2026-09');
    expect(h[0].erros).toBe(1);
    expect(h[0].descontados).toBe(0);
  });
});

/**
 * 🔴 O QUE NÃO CABE EM GAVETA NENHUMA (achado em revisão, 11/09/2026).
 *
 * Em produção há 15 erros em dias que nenhum período cobre. Eles sumiam calados:
 * dinheiro e erro reais fora de toda soma, sem uma linha dizendo isso.
 */
describe('foraDasGavetas: o que sumia calado', () => {
  const semana = [per('p1', 'Semana 1', '2026-09-01', '2026-09-07', '2026-09-07')];

  it('🎯 dia que nenhum período cobre volta na lista de órfãos', () => {
    const fora = foraDasGavetas(
      semana,
      [pag('d1', '2026-09-20', 300)],
      [err('d1', '2026-09-20', 2, 10)],
    );
    expect(fora.pagamentos).toHaveLength(1);
    expect(fora.erros).toHaveLength(1);
  });

  it('o que está dentro de um período NÃO é órfão', () => {
    const fora = foraDasGavetas(semana, [pag('d1', '2026-09-02', 300)], [err('d1', '2026-09-02', 2, 10)]);
    expect(fora.pagamentos).toHaveLength(0);
    expect(fora.erros).toHaveLength(0);
  });

  it('🎯 período SEM data de pagamento também deixa órfão — a gaveta é pela data de pagamento', () => {
    const semData = [per('p1', 'Semana 1', '2026-09-01', '2026-09-07', '')];
    const fora = foraDasGavetas(semData, [pag('d1', '2026-09-02', 300)], []);
    expect(fora.pagamentos, 'sem data de pagamento não há mês pra cair').toHaveLength(1);
    // E confirma que ele realmente não aparece em gaveta nenhuma.
    const h = montarHistorico(semData, [pag('d1', '2026-09-02', 300)], [], '2026-09');
    expect(h).toHaveLength(0);
  });

  it('pagamento de R$ 0,00 órfão não polui o aviso', () => {
    const fora = foraDasGavetas(semana, [pag('d1', '2026-09-20', 0)], []);
    expect(fora.pagamentos).toHaveLength(0);
  });
});

/**
 * 🎯 A SEMANA GÊMEA — a mesma semana cadastrada DUAS VEZES (11/09/2026).
 *
 * Produção tem 10 pares assim em Caratinga ("Semana 31/08 a 06/09" e "Semana
 * 01/09 a 07/09", e por aí vai). Com o dono único, a que começa antes leva os
 * dias e a outra aparece zerada — o que fazia a tela mentir: dizia "R$ 0,00 · 0
 * pagos" e, clicando, a lista vinha CHEIA (ela filtra por data).
 *
 * ⚠️ O primeiro critério que tentei foi "ficou com ZERO dias" e não pegava nada:
 * a gêmea fica com 1 dia solto na ponta (o 07/09, que a de 31/08–06/09 não
 * alcança). O certo é "perdeu a MAIORIA dos dias".
 */
describe('semana gêmea: a mesma semana cadastrada duas vezes', () => {
  const gemeas = [
    per('a', 'Semana 31/08 a 06/09', '2026-08-31', '2026-09-06', '2026-09-06'),
    per('b', 'Semana 01/09 a 07/09', '2026-09-01', '2026-09-07', '2026-09-07'),
    per('c', 'Semana 07/09 a 13/09', '2026-09-07', '2026-09-13', '2026-09-13'),
  ];

  it('🎯 a que perdeu a maioria dos dias é marcada como gêmea', () => {
    const h = montarHistorico(gemeas, [], [], '2026-09');
    const porNome = new Map(h[0].semanas.map((s) => [s.label, s]));

    const a = porNome.get('Semana 31/08 a 06/09')!;
    const b = porNome.get('Semana 01/09 a 07/09')!;
    const c = porNome.get('Semana 07/09 a 13/09')!;

    expect(a.gemeaDe, 'a que começa antes fica com tudo').toBeNull();
    expect(b.gemeaDe, 'a do meio perdeu 6 de 7 dias').not.toBeNull();
    expect(b.gemeaDe).toContain('31/08');
    expect(c.gemeaDe, 'perdeu só 1 dia — NÃO é gêmea').toBeNull();
  });

  it('a gêmea fica com 1 dia, não com zero (o critério errado que tentei antes)', () => {
    const h = montarHistorico(gemeas, [], [], '2026-09');
    const b = h[0].semanas.find((s) => s.label === 'Semana 01/09 a 07/09')!;
    expect(b.diasProprios, 'o 07/09 sobra pra ela').toBe(1);
    expect(b.diasNoTotal).toBe(7);
  });

  it('🎯 o dinheiro continua contando UMA vez, na semana que ficou com os dias', () => {
    const pagamentos = [pag('d1', '2026-09-02', 500), pag('d2', '2026-09-04', 300)];
    const h = montarHistorico(gemeas, pagamentos, [], '2026-09');
    const a = h[0].semanas.find((s) => s.label === 'Semana 31/08 a 06/09')!;
    const b = h[0].semanas.find((s) => s.label === 'Semana 01/09 a 07/09')!;

    expect(a.valor).toBe(800);
    expect(b.valor, 'a gêmea não repete o dinheiro').toBe(0);
    expect(h[0].valor, 'e o mês continua sendo a soma das semanas').toBe(800);
  });

  it('sem sobreposição, ninguém é marcado', () => {
    const normais = [
      per('x', 'Semana 1', '2026-09-01', '2026-09-07', '2026-09-07'),
      per('y', 'Semana 2', '2026-09-08', '2026-09-14', '2026-09-14'),
    ];
    const h = montarHistorico(normais, [], [], '2026-09');
    expect(h[0].semanas.every((s) => s.gemeaDe === null)).toBe(true);
    expect(h[0].semanas.every((s) => s.diasProprios === 7)).toBe(true);
  });
});
