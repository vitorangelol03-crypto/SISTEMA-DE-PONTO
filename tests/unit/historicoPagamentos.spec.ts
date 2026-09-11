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
    // 17/08–23/08 e 18/08–24/08 existem as duas em produção
    const sobrepostas = [
      per('a', 'Semana 17/08 a 23/08', '2026-08-17', '2026-08-23', '2026-08-23'),
      per('b', 'Semana 18/08 a 24/08', '2026-08-18', '2026-08-24', '2026-08-24'),
    ];
    const h = montarHistorico(sobrepostas, [pag('d1', '2026-08-19', 50)], [], '2026-09');
    // o pagamento aparece nas duas semanas (ele cabe nas duas), mas o MÊS conta a pessoa uma vez
    expect(h[0].semanas[0].pagos).toBe(1);
    expect(h[0].semanas[1].pagos).toBe(1);
    expect(h[0].pagos).toBe(1);
  });
});

/**
 * 🔴 O BUG QUE A PRIMEIRA CONFERÊNCIA NA TELA PEGOU (11/09/2026)
 *
 * Em produção existem semanas SOBREPOSTAS — 31/08–06/09 e 01–07/09 convivem, de
 * quando o dia de início da semana mudou. O mês somava as listas das semanas e
 * contava o mesmo erro duas vezes: setembro apareceu com "106 erros", que eram
 * 54 + 52 do MESMO conjunto.
 */
describe('semanas sobrepostas não duplicam o total do mês', () => {
  const sobrepostas = [
    per('s1', 'Semana 31/08 a 06/09', '2026-08-31', '2026-09-06', '2026-09-06'),
    per('s2', 'Semana 01/09 a 07/09', '2026-09-01', '2026-09-07', '2026-09-07'),
  ];

  it('🎯 um erro que cai nas DUAS semanas conta UMA vez no mês', () => {
    // 02/09 está dentro das duas
    const erros = [err('d1', '2026-09-02', 3, 15)];
    const h = montarHistorico(sobrepostas, [], erros, '2026-09');
    expect(h[0].semanas[0].erros).toBe(1);
    expect(h[0].semanas[1].erros).toBe(1);
    expect(h[0].erros).toBe(1);              // ← era 2 antes do fix
    expect(h[0].listaErros).toHaveLength(1);
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
