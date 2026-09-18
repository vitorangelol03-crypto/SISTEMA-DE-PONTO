import { describe, it, expect } from 'vitest';
import {
  CONFIGURACAO_DA_FOLHA_PADRAO,
  HORAS_MENSAIS_CLT,
  calcularAdicionalNoturno,
  calcularFolha,
  diasDeReferencia,
  type ConfiguracaoDaFolha,
} from '../../src/utils/folha/folhaCalc';

/**
 * GABARITO REAL — "569 - REC PGTO", Julho/2026, CD LOGISTICA, contabilidade Arruda
 * (sistema SCI). São os 12 recibos que a empresa entregou de verdade; os números
 * abaixo foram EXTRAÍDOS do PDF, não digitados à mão.
 *
 * O combinado com o Victor (18/09/2026): esta leva cobre salário do mês, salário
 * família, base e valor do FGTS. INSS, IRRF, férias e PLR ficam para a segunda leva.
 */
interface ReciboDoPapel {
  nome: string;
  admissao: string;
  salarioBase: number;
  filhos: number;
  adicionalNoturno: number;
  diasDeReferencia: number;
  salarioDoMes: number;
  salarioFamilia: number;
  baseFgts: number;
  valorFgts: number;
}

const JULHO_2026 = { ano: 2026, mes: 7 };

const RECIBOS: ReciboDoPapel[] = [
  {
    nome: 'CAMILA VITORIA MARTINS',
    admissao: '2026-01-02',
    salarioBase: 1700.00,
    filhos: 1,
    adicionalNoturno: 72.87,
    // do papel:
    diasDeReferencia: 30.00,
    salarioDoMes: 1700.00,
    salarioFamilia: 67.54,
    baseFgts: 1772.87,
    valorFgts: 141.82,
  },
  {
    nome: 'EDILAINE DOS SANTOS FERREIRA GOMES',
    admissao: '2026-05-06',
    salarioBase: 1700.00,
    filhos: 1,
    adicionalNoturno: 77.89,
    // do papel:
    diasDeReferencia: 30.00,
    salarioDoMes: 1700.00,
    salarioFamilia: 67.54,
    baseFgts: 1777.89,
    valorFgts: 142.23,
  },
  {
    nome: 'FABIO DE PAULA LUCIO',
    admissao: '2026-07-08',
    salarioBase: 1700.00,
    filhos: 0,
    adicionalNoturno: 32.56,
    // do papel:
    diasDeReferencia: 24.00,
    salarioDoMes: 1360.00,
    salarioFamilia: 0,
    baseFgts: 1392.56,
    valorFgts: 111.40,
  },
  {
    nome: 'GEANDRA MARIA DE OLIVEIRA LIMA',
    admissao: '2026-07-01',
    salarioBase: 1700.00,
    filhos: 0,
    adicionalNoturno: 73.29,
    // do papel:
    diasDeReferencia: 31.00,
    salarioDoMes: 1700.00,
    salarioFamilia: 0,
    baseFgts: 1773.29,
    valorFgts: 141.86,
  },
  {
    nome: 'ICARO DA COSTA BITENCOURT',
    admissao: '2026-05-02',
    salarioBase: 1700.00,
    filhos: 0,
    adicionalNoturno: 73.42,
    // do papel:
    diasDeReferencia: 30.00,
    salarioDoMes: 1700.00,
    salarioFamilia: 0,
    baseFgts: 1773.42,
    valorFgts: 141.87,
  },
  {
    nome: 'KAMILA CRISTINA FERNANDES ALVES',
    admissao: '2026-04-03',
    salarioBase: 2000.00,
    filhos: 0,
    adicionalNoturno: 8.05,
    // do papel:
    diasDeReferencia: 30.00,
    salarioDoMes: 2000.00,
    salarioFamilia: 0,
    baseFgts: 2008.05,
    valorFgts: 160.64,
  },
  {
    nome: 'KEILAMARA SOUZA LANNA',
    admissao: '2024-03-26',
    salarioBase: 2200.00,
    filhos: 0,
    adicionalNoturno: 98.60,
    // do papel:
    diasDeReferencia: 30.00,
    salarioDoMes: 2200.00,
    salarioFamilia: 0,
    baseFgts: 2298.60,
    valorFgts: 183.88,
  },
  {
    nome: 'MAYCON JUNIOR PEREIRA DOS SANTOS',
    admissao: '2026-05-02',
    salarioBase: 2200.00,
    filhos: 0,
    adicionalNoturno: 115.78,
    // do papel:
    diasDeReferencia: 30.00,
    salarioDoMes: 2200.00,
    salarioFamilia: 0,
    baseFgts: 2315.78,
    valorFgts: 185.26,
  },
  {
    nome: 'MIRIANE MESSIAS HONORATO',
    admissao: '2026-07-01',
    salarioBase: 1700.00,
    filhos: 0,
    adicionalNoturno: 77.73,
    // do papel:
    diasDeReferencia: 31.00,
    salarioDoMes: 1700.00,
    salarioFamilia: 0,
    baseFgts: 1777.73,
    valorFgts: 142.21,
  },
  {
    nome: 'SILVIA NEIDE DE SOUZA',
    admissao: '2025-07-21',
    salarioBase: 1700.00,
    filhos: 0,
    adicionalNoturno: 61.62,
    // do papel:
    diasDeReferencia: 21.00,
    salarioDoMes: 1190.00,
    salarioFamilia: 0,
    baseFgts: 2042.28,
    valorFgts: 163.38,
  },
  {
    nome: 'TUANY KELY CARVALHO LIMA DA SILVA',
    admissao: '2026-01-09',
    salarioBase: 2000.00,
    filhos: 0,
    adicionalNoturno: 122.81,
    // do papel:
    diasDeReferencia: 30.00,
    salarioDoMes: 2000.00,
    salarioFamilia: 0,
    baseFgts: 2122.81,
    valorFgts: 169.82,
  },
  {
    nome: 'VITORIA APARECIDA DE CASTRO',
    admissao: '2026-07-10',
    salarioBase: 1700.00,
    filhos: 2,
    adicionalNoturno: 34.64,
    // do papel:
    diasDeReferencia: 22.00,
    salarioDoMes: 1206.45,
    salarioFamilia: 99.05,
    baseFgts: 1241.09,
    valorFgts: 99.28,
  },
];

/** Os dois que têm linha fora do escopo desta leva — cada um tratado à parte, abaixo. */
const FORA_DO_ESCOPO = ['SILVIA NEIDE DE SOUZA', 'VITORIA APARECIDA DE CASTRO'];

const fichaDe = (r: ReciboDoPapel) => ({
  salarioMensal: r.salarioBase,
  filhosSalarioFamilia: r.filhos,
  fgtsAtivo: true,
  admissao: r.admissao,
});

const calcular = (r: ReciboDoPapel, config: ConfiguracaoDaFolha = CONFIGURACAO_DA_FOLHA_PADRAO) =>
  calcularFolha({ ficha: fichaDe(r), config, ...JULHO_2026, adicionalNoturno: r.adicionalNoturno });

describe('folha CLT — contra os 12 recibos reais de Julho/2026', () => {
  for (const recibo of RECIBOS.filter(r => !FORA_DO_ESCOPO.includes(r.nome))) {
    describe(recibo.nome, () => {
      it('dias de referência, salário do mês e salário família batem com o papel', () => {
        const folha = calcular(recibo);
        expect(folha.diasDeReferencia).toBe(recibo.diasDeReferencia);
        expect(folha.salarioDoMes).toBe(recibo.salarioDoMes);
        expect(folha.salarioFamilia).toBe(recibo.salarioFamilia);
      });

      it('base e valor do FGTS batem centavo a centavo', () => {
        const folha = calcular(recibo);
        expect(folha.baseFgts).toBe(recibo.baseFgts);
        expect(folha.valorFgts).toBe(recibo.valorFgts);
      });
    });
  }
});

describe('folha CLT — os dois recibos com linha fora do escopo', () => {
  const silvia = RECIBOS.find(r => r.nome === 'SILVIA NEIDE DE SOUZA')!;
  const vitoria = RECIBOS.find(r => r.nome === 'VITORIA APARECIDA DE CASTRO')!;

  it('Silvia (tem férias no papel): esta leva paga o mês inteiro, porque não desconta falta nem férias', () => {
    const folha = calcular(silvia);
    // Ela é da casa desde 21/07/2025, então a regra de admissão não a toca: 30 dias.
    expect(folha.diasDeReferencia).toBe(30);
    expect(folha.salarioDoMes).toBe(1700);
    // O papel traz 21 dias e R$ 1.190,00 porque ela tirou 9 dias de FÉRIAS, e traz base de
    // FGTS de 2.042,28 porque as férias entram nela. Férias e faltas são a segunda leva:
    // até lá, o recibo de quem faltou sai com o salário cheio. Registrado, não escondido.
    expect(silvia.diasDeReferencia).toBe(21);
    expect(silvia.salarioDoMes).toBe(1190);
    expect(folha.baseFgts).toBe(1761.62); // 1.700,00 + 61,62 de adicional noturno
  });

  it('Vitoria: divergência conhecida do mês de admissão — o papel dividiu por 31, a regra da CLT divide por 30', () => {
    const folha = calcular(vitoria);
    expect(folha.diasDeReferencia).toBe(22); // 10/07 a 31/07, igual ao papel
    expect(folha.salarioDoMes).toBe(1246.66); // 1.700 ÷ 30 × 22; o papel traz 1.206,45 (÷ 31)
    expect(vitoria.salarioDoMes).toBe(1206.45);
    // O salário família dela, esse sim, bate: 2 cotas proporcionais aos 22 dias.
    expect(folha.salarioFamilia).toBe(vitoria.salarioFamilia);
  });
});

describe('dias de referência', () => {
  it('quem já estava na empresa antes do mês tem 30 dias', () => {
    expect(diasDeReferencia('2024-03-26', 2026, 7)).toBe(30);
    expect(diasDeReferencia('2026-06-30', 2026, 7)).toBe(30);
  });

  it('quem foi admitido dentro do mês conta da admissão até o último dia', () => {
    expect(diasDeReferencia('2026-07-01', 2026, 7)).toBe(31); // julho tem 31 dias
    expect(diasDeReferencia('2026-07-10', 2026, 7)).toBe(22);
    expect(diasDeReferencia('2026-07-31', 2026, 7)).toBe(1);
    expect(diasDeReferencia('2026-02-10', 2026, 2)).toBe(19); // fevereiro de 2026: 28 dias
  });

  it('admitido depois do mês não tem dia nenhum', () => {
    expect(diasDeReferencia('2026-08-01', 2026, 7)).toBe(0);
  });

  it('ficha sem admissão preenchida conta o mês inteiro (é o que temos hoje: 95 de 98 sem data)', () => {
    expect(diasDeReferencia(null, 2026, 7)).toBe(30);
    expect(diasDeReferencia(undefined, 2026, 7)).toBe(30);
    expect(diasDeReferencia('', 2026, 7)).toBe(30);
  });
});

describe('FGTS', () => {
  const base = (salario: number, noturno = 0, fgtsAtivo = true) =>
    calcularFolha({
      ficha: { salarioMensal: salario, filhosSalarioFamilia: 0, fgtsAtivo, admissao: '2020-01-01' },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: noturno,
    });

  it('é 8% truncado, nunca arredondado para cima (Camila: 141,82 e não 141,83)', () => {
    expect(base(1700, 72.87).valorFgts).toBe(141.82);
    expect(base(2200, 98.6).valorFgts).toBe(183.88); // 183,888 no papel vira 183,88
  });

  it('desligado na ficha: base e valor zerados, e o salário não muda', () => {
    const folha = base(1700, 72.87, false);
    expect(folha.valorFgts).toBe(0);
    expect(folha.baseFgts).toBe(0);
    expect(folha.salarioDoMes).toBe(1700);
  });

  it('a porcentagem vem da configuração, não do código', () => {
    const config = { ...CONFIGURACAO_DA_FOLHA_PADRAO, percentualFgts: 11.2 };
    const folha = calcularFolha({
      ficha: { salarioMensal: 1700, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao: '2020-01-01' },
      config,
      ...JULHO_2026,
      adicionalNoturno: 0,
    });
    expect(folha.valorFgts).toBe(190.4);
  });

  it('não é desconto: o líquido não muda por causa dele', () => {
    expect(base(1700, 0).liquido).toBe(base(1700, 0, false).liquido);
  });
});

describe('salário família', () => {
  const comFilhos = (filhos: number, salario = 1700, admissao = '2020-01-01') =>
    calcularFolha({
      ficha: { salarioMensal: salario, filhosSalarioFamilia: filhos, fgtsAtivo: true, admissao },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: 0,
    });

  it('é a cota vezes o número de filhos', () => {
    expect(comFilhos(0).salarioFamilia).toBe(0);
    expect(comFilhos(1).salarioFamilia).toBe(67.54);
    expect(comFilhos(2).salarioFamilia).toBe(135.08);
  });

  it('quem ganha acima do teto não recebe', () => {
    expect(comFilhos(2, 1906.04).salarioFamilia).toBe(135.08);
    expect(comFilhos(2, 1906.05).salarioFamilia).toBe(0);
  });

  it('no mês de admissão é proporcional e truncado (Vitoria: 2 cotas em 22 dias = 99,05)', () => {
    expect(comFilhos(2, 1700, '2026-07-10').salarioFamilia).toBe(99.05);
  });

  it('entra como provento e soma no líquido, ao contrário do FGTS', () => {
    const folha = comFilhos(1);
    expect(folha.totalProventos).toBe(1767.54);
    expect(folha.liquido).toBe(1767.54);
  });

  it('fica FORA da base do FGTS (Camila: 1.700 + 72,87, sem os 67,54)', () => {
    const folha = calcularFolha({
      ficha: { salarioMensal: 1700, filhosSalarioFamilia: 1, fgtsAtivo: true, admissao: '2026-01-02' },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: 72.87,
    });
    expect(folha.baseFgts).toBe(1772.87);
  });
});

describe('salário do mês', () => {
  const dias = (admissao: string) =>
    calcularFolha({
      ficha: { salarioMensal: 1700, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: 0,
    });

  it('nunca passa do salário cheio, mesmo em mês de 31 dias (Geandra e Miriane, admitidas em 01/07)', () => {
    expect(dias('2026-07-01').diasDeReferencia).toBe(31);
    expect(dias('2026-07-01').salarioDoMes).toBe(1700);
  });

  it('mês inteiro paga o salário cheio', () => {
    expect(dias('2020-01-01').salarioDoMes).toBe(1700);
  });

  it('ficha sem salário preenchido não inventa valor', () => {
    const folha = calcularFolha({
      ficha: { salarioMensal: 0, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao: '2020-01-01' },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: 0,
    });
    expect(folha.salarioDoMes).toBe(0);
    expect(folha.valorFgts).toBe(0);
    expect(folha.liquido).toBe(0);
  });
});

describe('as linhas que vão para o papel', () => {
  it('saem na ordem do modelo da contabilidade, sem linha zerada', () => {
    const folha = calcularFolha({
      ficha: { salarioMensal: 1700, filhosSalarioFamilia: 1, fgtsAtivo: true, admissao: '2026-01-02' },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: 72.87,
    });
    expect(folha.linhas.map(l => l.descricao)).toEqual([
      'Salário mensalista',
      'Adicional noturno',
      'Salário família',
    ]);
    expect(folha.linhas[0].referencia).toBe('30,00');
    expect(folha.linhas[2].referencia).toBe('1,00');
  });

  it('sem adicional noturno e sem filhos, sobra só o salário', () => {
    const folha = calcularFolha({
      ficha: { salarioMensal: 1700, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao: '2020-01-01' },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: 0,
    });
    expect(folha.linhas.map(l => l.descricao)).toEqual(['Salário mensalista']);
  });
});

describe('adicional noturno do mensalista', () => {
  it('é 20% da hora do mês, truncado em centavos', () => {
    // 1.700 ÷ 220 = 7,7272… · × 20% = 1,5454… por hora noturna.
    expect(calcularAdicionalNoturno(1700, 10)).toBe(15.45);
    expect(calcularAdicionalNoturno(2200, 47.15)).toBe(94.3);
  });

  it('sem salário, sem horas ou com jornada zerada, não inventa valor', () => {
    expect(calcularAdicionalNoturno(0, 10)).toBe(0);
    expect(calcularAdicionalNoturno(1700, 0)).toBe(0);
    expect(calcularAdicionalNoturno(1700, 10, 0)).toBe(0);
  });

  it('negativo não vira dinheiro', () => {
    expect(calcularAdicionalNoturno(-1700, 10)).toBe(0);
    expect(calcularAdicionalNoturno(1700, -10)).toBe(0);
  });

  it('a jornada mensal é parâmetro, não número chumbado', () => {
    expect(HORAS_MENSAIS_CLT).toBe(220);
    expect(calcularAdicionalNoturno(1700, 10, 200)).toBe(17);
  });

  it('entra na base do FGTS quando chega na folha', () => {
    const noturno = calcularAdicionalNoturno(1700, 10);
    const folha = calcularFolha({
      ficha: { salarioMensal: 1700, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao: '2020-01-01' },
      config: CONFIGURACAO_DA_FOLHA_PADRAO,
      ...JULHO_2026,
      adicionalNoturno: noturno,
    });
    expect(folha.baseFgts).toBe(1715.45);
    expect(folha.valorFgts).toBe(137.23); // 1.715,45 × 8% = 137,236 → truncado
  });
});
