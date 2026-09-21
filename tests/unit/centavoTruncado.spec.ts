import { describe, it, expect } from 'vitest';
import { CONFIGURACAO_DA_FOLHA_PADRAO, calcularFolha } from '../../src/utils/folha/folhaCalc';
import { TABELA_INSS_2026, TABELA_IRRF_2026, calcularInss } from '../../src/utils/folha/impostos';
import { calcularDecimoTerceiro } from '../../src/utils/folha/decimoTerceiro';

/**
 * O CENTAVO QUE O SISTEMA JOGAVA FORA (20/09/2026).
 *
 * O cortador de centavos fazia `Math.floor(valor * 100)`. Acontece que o computador
 * guarda `5,06 * 100` como **505.99999999999994** — o `floor` derruba para 505 e o
 * valor vira R$ 5,05. Um centavo a menos, **sempre contra o funcionário**.
 *
 * Achado por um conferidor independente (431 casos, 5.331 conferências) e medido
 * centavo a centavo de R$ 1.000 a R$ 15.000: pegava 5,34% dos salários no salário do
 * mês, 0,24% no FGTS e 0,04% no INSS. Pouco dinheiro, mas é o centavo que faz o papel
 * não bater com o da contabilidade — que é justamente para o que este sistema serve.
 *
 * A raiz era o cortador estar COPIADO em 4 arquivos. Agora é um só (`dinheiro.ts`):
 * bug copiado quatro vezes volta pela quinta.
 *
 * Os números abaixo não são inventados: saíram de uma varredura salário por salário
 * procurando exatamente os casos em que a conta cai num valor exato de centavo.
 */
describe('o centavo do truncamento', () => {
  const tabelas = { tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026 };
  const fichaBase = { filhosSalarioFamilia: 0, fgtsAtivo: true };

  it('🎯 o salário de mês quebrado não perde centavo', () => {
    // Admitido em 04/08: 28 dias de referência. 1401 / 30 * 28 = 1307,60 exato —
    // e o floor antigo pagava 1307,59.
    const folha = calcularFolha({
      ficha: { ...fichaBase, salarioMensal: 1401, admissao: '2026-08-04' },
      config: CONFIGURACAO_DA_FOLHA_PADRAO, ano: 2026, mes: 8, adicionalNoturno: 0, ...tabelas,
    });
    expect(folha.diasDeReferencia).toBe(28);
    expect(folha.salarioDoMes).toBe(1307.6);
  });

  it('🎯 o FGTS não perde centavo', () => {
    const folha = calcularFolha({
      ficha: { ...fichaBase, salarioMensal: 1601.75 },
      config: CONFIGURACAO_DA_FOLHA_PADRAO, ano: 2026, mes: 8, adicionalNoturno: 0, ...tabelas,
    });
    expect(folha.baseFgts).toBe(1601.75);
    expect(folha.valorFgts).toBe(128.14);   // era 128,13
  });

  it('🎯 o INSS não perde centavo', () => {
    // 21/09: exemplos REFEITOS. O INSS passou a usar a parcela a deduzir oficial, então
    // os casos antigos deixaram de cair na borda do centavo. Estes caem: com o truncador
    // com bug dariam 128,13 e 128,22.
    expect(calcularInss(1694, TABELA_INSS_2026)).toBe(128.14);
    expect(calcularInss(1695, TABELA_INSS_2026)).toBe(128.23);
  });

  it('🎯 o FGTS do 13º não perde centavo', () => {
    const decimo = calcularDecimoTerceiro({
      salarioMensal: 1518, avos: 1, parcela: 'primeira', percentualFgts: 8, fgtsAtivo: true, ...tabelas,
    });
    expect(decimo.brutoDaParcela).toBe(63.25);
    expect(decimo.fgts).toBe(5.06);   // era 5,05
  });

  it('continua TRUNCANDO de verdade — a correção não virou arredondamento', () => {
    // 1.906,04 * 8% = 152,4832. Truncar dá 152,48; arredondar daria 152,48 também,
    // então o caso que separa os dois é o do INSS abaixo.
    const folha = calcularFolha({
      ficha: { ...fichaBase, salarioMensal: 1906.04 },
      config: CONFIGURACAO_DA_FOLHA_PADRAO, ano: 2026, mes: 8, adicionalNoturno: 0, ...tabelas,
    });
    expect(folha.valorFgts).toBe(152.48);
    // INSS de 1.700: soma exata 128,6805. Truncado = 128,68. Arredondado seria 128,69.
    expect(calcularInss(1700, TABELA_INSS_2026)).toBe(128.68);
  });

  it('o caso da Silvia, que o comentário do código já protegia, continua de pé', () => {
    // 1700 / 30 * 21 dá 1189.9999999999998 em ponto flutuante: tem que pagar 1.190,00.
    const folha = calcularFolha({
      ficha: { ...fichaBase, salarioMensal: 1700 },
      config: CONFIGURACAO_DA_FOLHA_PADRAO, ano: 2026, mes: 8, adicionalNoturno: 0,
      diasDeFerias: 9, ...tabelas,
    });
    expect(folha.diasPagos).toBe(21);
    expect(folha.salarioDoMes).toBe(1190);
  });
});
