import { describe, it, expect } from 'vitest';
import { CONFIGURACAO_DA_FOLHA_PADRAO, calcularFolha, type EntradaDaFolha } from '../../src/utils/folha/folhaCalc';
import { TABELA_INSS_2026, TABELA_IRRF_2026 } from '../../src/utils/folha/impostos';

/**
 * PREMIAÇÃO (19/09/2026) — prêmio, PLR, bonificação.
 *
 * Decisão do Victor: *"tem que ser premiação para sair como bônus e não gera imposto"*.
 * Ela entra no bolso da pessoa e **em mais nada**.
 *
 * 🎯 E ISTO TEM GABARITO REAL, diferente do 13º e da rescisão: no recibo de julho/2026
 * do MAYCON (salário 2.200 + adicional noturno 115,78) a base do FGTS impressa é
 * **2.315,78** — a PLR que ele recebeu ficou de fora. O último teste deste arquivo é
 * exatamente esse papel.
 */

const base = (over: Partial<EntradaDaFolha> = {}): EntradaDaFolha => ({
  ficha: { salarioMensal: 1700, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao: '2024-01-02' },
  config: CONFIGURACAO_DA_FOLHA_PADRAO,
  ano: 2026,
  mes: 7,
  adicionalNoturno: 0,
  tabelaInss: TABELA_INSS_2026,
  tabelaIrrf: TABELA_IRRF_2026,
  tabelasConfirmadas: true,
  ...over,
});

describe('🎯 a premiação entra no bolso e em NENHUMA base', () => {
  const sem = calcularFolha(base());
  const com = calcularFolha(base({ premiacoes: [{ valor: 500 }] }));

  it('soma no líquido, cheia', () => {
    expect(com.premiacao).toBe(500);
    expect(com.liquido).toBe(Number((sem.liquido + 500).toFixed(2)));
  });

  it('NÃO entra na base do FGTS — a empresa não paga 8% em cima', () => {
    expect(com.baseFgts).toBe(sem.baseFgts);
    expect(com.valorFgts).toBe(sem.valorFgts);
  });

  it('NÃO entra na base do INSS — não desconta a mais do funcionário', () => {
    expect(com.baseInss).toBe(sem.baseInss);
    expect(com.inss).toBe(sem.inss);
  });

  it('NÃO muda o Imposto de Renda', () => {
    expect(com.irrf).toBe(sem.irrf);
    expect(com.baseIrrf).toBe(sem.baseIrrf);
  });

  it('não vira desconto nenhum', () => {
    expect(com.totalDescontos).toBe(sem.totalDescontos);
  });
});

describe('a linha no papel', () => {
  it('sem descrição, sai como "Premiação"', () => {
    const d = calcularFolha(base({ premiacoes: [{ valor: 300 }] }));
    const linha = d.linhas.find(l => l.descricao.startsWith('Premiação'))!;
    expect(linha.descricao).toBe('Premiação');
    expect(linha.provento).toBe(300);
    expect(linha.desconto).toBe(0);
  });

  it('com descrição, o motivo aparece no recibo', () => {
    const d = calcularFolha(base({ premiacoes: [{ descricao: 'Meta de agosto', valor: 300 }] }));
    expect(d.linhas.some(l => l.descricao === 'Premiação — Meta de agosto')).toBe(true);
  });

  it('várias premiações no mesmo mês saem em linhas separadas e somam', () => {
    const d = calcularFolha(base({
      premiacoes: [
        { descricao: 'Meta', valor: 300 },
        { descricao: 'Assiduidade', valor: 150 },
      ],
    }));
    expect(d.premiacao).toBe(450);
    expect(d.linhas.filter(l => l.descricao.startsWith('Premiação'))).toHaveLength(2);
  });

  it('premiação zerada ou negativa é ignorada, não vira linha vazia', () => {
    const d = calcularFolha(base({ premiacoes: [{ valor: 0 }, { valor: -50 }] }));
    expect(d.premiacao).toBe(0);
    expect(d.linhas.some(l => l.descricao.startsWith('Premiação'))).toBe(false);
  });

  it('a premiação vem DEPOIS do salário família e ANTES das férias, como no modelo', () => {
    const d = calcularFolha(base({
      ficha: { salarioMensal: 1700, filhosSalarioFamilia: 1, fgtsAtivo: true, admissao: '2024-01-02' },
      premiacoes: [{ valor: 300 }],
      diasDeFerias: 10,
    }));
    const ordem = d.linhas.map(l => l.descricao.split(' —')[0].split(' (')[0]);
    expect(ordem.indexOf('Salário família')).toBeLessThan(ordem.indexOf('Premiação'));
    expect(ordem.indexOf('Premiação')).toBeLessThan(ordem.indexOf('Férias'));
  });
});

describe('REGRESSÃO — sem premiação nada mudou', () => {
  it('o resultado é idêntico com lista vazia, undefined ou ausente', () => {
    const ausente = calcularFolha(base());
    expect(calcularFolha(base({ premiacoes: [] }))).toEqual(ausente);
    expect(calcularFolha(base({ premiacoes: undefined }))).toEqual(ausente);
    expect(ausente.premiacao).toBe(0);
  });
});

describe('🎯 GABARITO REAL — o recibo do Maycon (julho/2026)', () => {
  /**
   * Do papel da contabilidade Arruda: salário 2.200,00, adicional noturno 115,78,
   * **base do FGTS 2.315,78** e valor do FGTS 185,26. Ele recebeu PLR nesse mês, e ela
   * não está na base — é a prova de que premiação fica de fora.
   */
  const doMaycon = (premio: number) => calcularFolha({
    ficha: { salarioMensal: 2200, filhosSalarioFamilia: 0, fgtsAtivo: true, admissao: '2026-05-02' },
    config: CONFIGURACAO_DA_FOLHA_PADRAO,
    ano: 2026,
    mes: 7,
    adicionalNoturno: 115.78,
    premiacoes: premio > 0 ? [{ descricao: 'PLR', valor: premio }] : [],
  });

  it('a base e o valor do FGTS batem com o papel, com PLR ou sem', () => {
    for (const premio of [0, 500, 1200.55]) {
      const d = doMaycon(premio);
      expect(d.baseFgts, `com PLR de ${premio}`).toBe(2315.78);
      expect(d.valorFgts, `com PLR de ${premio}`).toBe(185.26);
    }
  });

  it('e a PLR aparece no papel, somando no que ele recebe', () => {
    const d = doMaycon(500);
    expect(d.linhas.some(l => l.descricao === 'Premiação — PLR')).toBe(true);
    expect(d.liquido).toBe(Number((doMaycon(0).liquido + 500).toFixed(2)));
  });
});
