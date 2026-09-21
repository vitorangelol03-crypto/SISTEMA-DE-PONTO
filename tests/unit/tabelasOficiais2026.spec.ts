import { describe, it, expect } from 'vitest';
import { CONFIGURACAO_DA_FOLHA_PADRAO, calcularFolha } from '../../src/utils/folha/folhaCalc';
import { TABELA_INSS_2026, TABELA_IRRF_2026, calcularInss, calcularIrrf } from '../../src/utils/folha/impostos';
import { calcularDecimoTerceiro } from '../../src/utils/folha/decimoTerceiro';

/**
 * AS TABELAS OFICIAIS DE 2026 (21/09/2026).
 *
 * 🔴 O QUE DEU ERRADO ANTES. A tabela do INSS foi **derivada dos 11 recibos reais** e
 * reproduzia todos eles — mas o maior salário do gabarito era R$ 2.200, e 3 das 4 faixas
 * e o teto estavam errados ACIMA disso. Num salário de R$ 5.000 descontava R$ 493,18 no
 * lugar de R$ 501,51; num de R$ 9.500, R$ 1.070,67 no lugar do teto de R$ 988,09.
 *
 * E o IRRF não tinha a **redução da Lei 15.270/2025**, que desde janeiro isenta quem
 * ganha até R$ 5.000: o sistema cobrava R$ 312,89 de quem não devia pagar nada.
 *
 * A lição, que é o motivo deste arquivo existir: **bater com o gabarito não é estar
 * certo — é estar certo no pedaço que o gabarito cobre.** Por isso aqui os números vêm
 * da fonte oficial e os casos cobrem justamente onde os recibos não chegavam.
 *
 * FONTES: Portaria Interministerial MPS/MF nº 13, de 09/01/2026 (INSS) · Lei nº
 * 15.270/2025 e a página de exemplos da Receita Federal (IRRF).
 */
describe('tabela oficial do INSS de 2026', () => {
  const inss = (base: number) => calcularInss(base, TABELA_INSS_2026);

  it('as 4 faixas oficiais, nos pontos que o gabarito antigo NÃO cobria', () => {
    expect(inss(1621)).toBe(121.57);       // fim da 1ª faixa
    expect(inss(1700)).toBe(128.68);       // o caso do tutorial — não mudou
    expect(inss(2902.84)).toBe(236.93);    // fim da 2ª faixa
    expect(inss(3000)).toBe(248.6);        // 🎯 antes dava 245,68
    expect(inss(5000)).toBe(501.51);       // 🎯 antes dava 493,18
  });

  it('🎯 o teto: o INSS para de crescer em R$ 8.475,55', () => {
    // ⚠️ DIVERGÊNCIA CONHECIDA, e de propósito: a fórmula oficial (14% menos a parcela
    // a deduzir de 198,49) dá R$ 988,08, enquanto o material do governo publica
    // R$ 988,09 como "contribuição máxima" — que é o valor da soma faixa a faixa. A
    // inconsistência é do próprio material: a parcela 198,49 é arredondada de 198,4856.
    // Fica o da FÓRMULA, que é o que a folha usa em todo o resto. Só afeta salário no
    // teto ou acima; o Victor não tem ninguém perto. 📋 A confirmar com o contador.
    expect(inss(8475.55)).toBe(988.08);
    expect(inss(9500)).toBe(988.08);       // antes dava 1.070,67, passando do teto
    expect(inss(50000)).toBe(988.08);
  });

  it('🎯 a PARCELA A DEDUZIR é o que faz o papel bater — não é detalhe', () => {
    // O caso que denunciou tudo: somando faixa a faixa a Camila dava 135,24 e o recibo
    // real da contabilidade dizia 135,23. A parcela publicada (24,32) é arredondada de
    // 24,315, e esse meio centavo vira um centavo depois do truncamento.
    expect(inss(1772.87)).toBe(135.23);

    const semParcela = { ...TABELA_INSS_2026, faixas: TABELA_INSS_2026.faixas.map(f => ({ ate: f.ate, aliquota: f.aliquota })) };
    expect(calcularInss(1772.87, semParcela)).toBe(135.24);   // a soma faixa a faixa erra
  });
});

describe('redução do IRRF — Lei 15.270/2025', () => {
  const mensal = { incidenciaMensal: true };
  const irrf = (bruto: number, inssPago: number, deps = 0, opcoes = mensal) =>
    calcularIrrf(bruto, inssPago, deps, TABELA_IRRF_2026, opcoes);

  it('🎯 O GABARITO OFICIAL DA RECEITA: a Rita, de R$ 6.000', () => {
    // Exemplo publicado: base 5.350,40 → imposto 562,63 → redução 179,75 → IRRF 382,88.
    // O INSS de 649,60 é o do enunciado, não o que a nossa tabela calcularia.
    const r = irrf(6000, 649.6);
    expect(r.base).toBeCloseTo(5350.4, 2);
    expect(r.valorSemReducao).toBe(562.63);
    expect(r.reducao).toBe(179.75);
    expect(r.valor).toBe(382.88);
  });

  it('🎯 quem ganha até R$ 5.000 não paga NADA de imposto', () => {
    for (const salario of [3200, 3500, 4000, 4500, 5000]) {
      const r = irrf(salario, calcularInss(salario, TABELA_INSS_2026));
      expect(r.valorSemReducao).toBeGreaterThan(0);   // a tabela cobraria
      expect(r.valor).toBe(0);                        // a lei zera
    }
  });

  it('exatamente em R$ 5.000 a redução máxima e o imposto são o MESMO número', () => {
    // Não é coincidência: os R$ 312,89 da lei são o imposto que a tabela dá nesse ponto.
    const r = irrf(5000, calcularInss(5000, TABELA_INSS_2026));
    expect(r.valorSemReducao).toBe(312.89);
    expect(r.reducao).toBe(312.89);
    expect(r.valor).toBe(0);
  });

  it('entre R$ 5.000 e R$ 7.350 a redução vai diminuindo', () => {
    const cinco = irrf(5000.01, calcularInss(5000.01, TABELA_INSS_2026));
    expect(cinco.valor).toBe(0);

    const meio = irrf(5500, calcularInss(5500, TABELA_INSS_2026));
    expect(meio.reducao).toBe(246.32);
    expect(meio.valor).toBe(190.47);
  });

  it('🎯 em R$ 7.350 a redução acaba, e acima disso não existe', () => {
    const limite = irrf(7350, calcularInss(7350, TABELA_INSS_2026));
    expect(limite.reducao).toBe(0);
    expect(limite.valor).toBe(limite.valorSemReducao);

    const acima = irrf(9000, calcularInss(9000, TABELA_INSS_2026));
    expect(acima.reducao).toBe(0);
    expect(acima.valor).toBe(acima.valorSemReducao);
  });

  it('a redução NÃO sai sem o chamador pedir — o padrão é não reduzir', () => {
    const semPedir = calcularIrrf(5000, calcularInss(5000, TABELA_INSS_2026), 0, TABELA_IRRF_2026);
    expect(semPedir.reducao).toBe(0);
    expect(semPedir.valor).toBe(312.89);
  });

  it('ano SEM redução na tabela continua calculando como antes', () => {
    const semLei = { ...TABELA_IRRF_2026, reducao: null };
    const r = calcularIrrf(5000, calcularInss(5000, TABELA_INSS_2026), 0, semLei, mensal);
    expect(r.reducao).toBe(0);
    expect(r.valor).toBe(312.89);
  });
});

describe('onde a redução vale, e onde NÃO vale', () => {
  const tabelas = { tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026 };

  it('🎯 na folha do MÊS ela vale, e o papel diz quanto foi abatido', () => {
    const folha = calcularFolha({
      ficha: { salarioMensal: 5500, filhosSalarioFamilia: 0, fgtsAtivo: true },
      config: CONFIGURACAO_DA_FOLHA_PADRAO, ano: 2026, mes: 8, adicionalNoturno: 0, ...tabelas,
    });
    expect(folha.reducaoDoIrrf).toBe(246.32);
    expect(folha.irrf).toBe(190.47);
    const linha = folha.linhas.find(l => l.descricao === 'IRRF');
    expect(linha?.referencia).toContain('Lei 15.270');
    expect(linha?.referencia).toContain('246,32');
  });

  it('🎯 quem ganha R$ 4.000 não tem linha de IRRF nenhuma no recibo', () => {
    const folha = calcularFolha({
      ficha: { salarioMensal: 4000, filhosSalarioFamilia: 0, fgtsAtivo: true },
      config: CONFIGURACAO_DA_FOLHA_PADRAO, ano: 2026, mes: 8, adicionalNoturno: 0, ...tabelas,
    });
    expect(folha.irrf).toBe(0);
    expect(folha.linhas.find(l => l.descricao === 'IRRF')).toBeUndefined();
  });

  it('🎯 no 13º a redução NÃO se aplica (decisão do Victor, 21/09)', () => {
    // A lei fala em rendimento sujeito à incidência MENSAL; o 13º é tributado à parte.
    const decimo = calcularDecimoTerceiro({
      salarioMensal: 5000, avos: 12, parcela: 'unica', percentualFgts: 8, fgtsAtivo: true, ...tabelas,
    });
    expect(decimo.bruto).toBe(5000);
    expect(decimo.irrf).toBe(312.89);   // o imposto CHEIO, sem redução
  });
});
