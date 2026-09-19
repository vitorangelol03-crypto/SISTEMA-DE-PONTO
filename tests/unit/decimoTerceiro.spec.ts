import { describe, it, expect } from 'vitest';
import {
  calcularDecimoTerceiro,
  mediaMensalNoAno,
  mesesComAvo,
  type EntradaDoDecimo,
} from '../../src/utils/folha/decimoTerceiro';
import { decimoDaPessoa } from '../../src/utils/folha/decimoDaPessoa';
import { CONFIGURACAO_DA_FOLHA_PADRAO } from '../../src/utils/folha/folhaCalc';
import { TABELA_INSS_2026, TABELA_IRRF_2026 } from '../../src/utils/folha/impostos';

/**
 * 13º SALÁRIO (19/09/2026).
 *
 * ⚠️ **Este cálculo não tem gabarito.** Os 12 recibos reais da contabilidade que provaram
 * salário, FGTS e INSS são de julho — nenhum tem 13º. Então estes testes não provam
 * "bate com o papel da Arruda"; eles travam a REGRA DA CLT como escrita e, principalmente,
 * as invariantes que não podem quebrar seja qual for a tabela de imposto:
 *
 *   · 1ª parcela + 2ª parcela = parcela única (o caminho não muda o total);
 *   · a 1ª parcela sai sem NENHUM desconto;
 *   · imposto incide sobre o 13º INTEIRO, não sobre a parcela;
 *   · o FGTS das duas parcelas somado = o FGTS da parcela única.
 */

const TABELAS = { inss: TABELA_INSS_2026, irrf: TABELA_IRRF_2026, confirmadas: true };

const entrada = (over: Partial<EntradaDoDecimo> = {}): EntradaDoDecimo => ({
  salarioMensal: 1700,
  avos: 12,
  parcela: 'unica',
  percentualFgts: 8,
  fgtsAtivo: true,
  tabelaInss: TABELA_INSS_2026,
  tabelaIrrf: TABELA_IRRF_2026,
  tabelasConfirmadas: true,
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
describe('avos — a regra dos 15 dias (decisão 3 do Victor)', () => {
  it('quem já estava na empresa antes do ano tem os 12', () => {
    expect(mesesComAvo('2024-05-10', 2026)).toHaveLength(12);
    expect(mesesComAvo(null, 2026)).toHaveLength(12);
  });

  it('admitida em 20/03 perde março (12 dias) e sai com 9', () => {
    const meses = mesesComAvo('2026-03-20', 2026);
    expect(meses).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('admitida em 10/03 ganha março (22 dias) e sai com 10', () => {
    expect(mesesComAvo('2026-03-10', 2026)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('o corte é exatamente em 15 dias: dia 17 de março conta, dia 18 não', () => {
    // Março tem 31 dias: admitida em 17/03 sobram 15 → conta. Em 18/03 sobram 14 → não.
    expect(mesesComAvo('2026-03-17', 2026)).toContain(3);
    expect(mesesComAvo('2026-03-18', 2026)).not.toContain(3);
  });

  it('quem foi admitida depois do ano não tem avo nenhum', () => {
    expect(mesesComAvo('2027-01-05', 2026)).toEqual([]);
  });

  it('falta SEM atestado derruba o mês quando sobra menos de 15 dias', () => {
    const abril = (quantas: number) =>
      Array.from({ length: quantas }, (_, i) => `2026-04-${String(i + 1).padStart(2, '0')}`);

    // Abril tem 30 dias: 15 faltas deixam 15 → ainda conta. 16 faltas deixam 14 → cai.
    expect(mesesComAvo('2024-01-02', 2026, abril(15))).toContain(4);
    expect(mesesComAvo('2024-01-02', 2026, abril(16))).not.toContain(4);
  });

  it('falta de OUTRO ano não mexe nos avos deste', () => {
    expect(mesesComAvo('2024-01-02', 2026, ['2025-04-01', '2025-04-02'])).toHaveLength(12);
  });

  it('desligamento no meio do ano corta os meses seguintes', () => {
    expect(mesesComAvo('2024-01-02', 2026, [], '2026-06-20')).toEqual([1, 2, 3, 4, 5, 6]);
    // Desligada em 10/06 sobram 10 dias de junho → junho não conta.
    expect(mesesComAvo('2024-01-02', 2026, [], '2026-06-10')).toEqual([1, 2, 3, 4, 5]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('média das variáveis — divide pelos AVOS, não por 12', () => {
  it('quem tem 6 avos divide por 6', () => {
    const porMes = new Map([[7, 100], [8, 200], [9, 0], [10, 0], [11, 0], [12, 0]]);
    expect(mediaMensalNoAno(porMes, [7, 8, 9, 10, 11, 12])).toBe(50);
    // Se dividisse por 12, sairia 25 — e o 13º da pessoa viria menor que o devido.
  });

  it('sem avos não há média (e não divide por zero)', () => {
    expect(mediaMensalNoAno(new Map([[1, 500]]), [])).toBe(0);
  });

  it('mês sem lançamento entra como zero, não é pulado', () => {
    expect(mediaMensalNoAno(new Map([[1, 120]]), [1, 2])).toBe(60);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('13º — o valor e as parcelas', () => {
  it('12 avos e nenhum variável: o 13º bruto é um salário cheio', () => {
    expect(calcularDecimoTerceiro(entrada()).bruto).toBe(1700);
  });

  it('9 avos: paga nove doze avos', () => {
    // 1700 / 12 × 9 = 1275
    expect(calcularDecimoTerceiro(entrada({ avos: 9 })).bruto).toBe(1275);
  });

  it('a média do noturno entra na base (decisão 2 do Victor)', () => {
    const d = calcularDecimoTerceiro(entrada({ mediaDoNoturno: 60 }));
    expect(d.base).toBe(1760);
    expect(d.bruto).toBe(1760);
  });

  it('🎯 a 1ª parcela sai SEM NENHUM desconto — é o que a lei manda', () => {
    const d = calcularDecimoTerceiro(entrada({ parcela: 'primeira' }));
    expect(d.valor).toBe(850);
    expect(d.inss).toBe(0);
    expect(d.irrf).toBe(0);
    expect(d.totalDescontos).toBe(0);
    expect(d.linhas.map(l => l.descricao)).toEqual(['Adiantamento do 13º salário']);
  });

  it('🎯 o imposto incide sobre o 13º INTEIRO, não sobre a parcela', () => {
    const unica = calcularDecimoTerceiro(entrada({ parcela: 'unica' }));
    const segunda = calcularDecimoTerceiro(entrada({ parcela: 'segunda', jaPagoNaPrimeira: 850 }));
    // Mesmo INSS nas duas: a base é o 13º cheio, não a metade.
    expect(segunda.inss).toBe(unica.inss);
    expect(segunda.inss).toBe(128.68); // 7,5% até 1.621 + 9% sobre os 79 que passam
  });

  it('🎯 1ª parcela + 2ª parcela = parcela única (o caminho não muda o total)', () => {
    for (const salario of [1400, 1700, 2500, 4000, 6500, 9000]) {
      const unica = calcularDecimoTerceiro(entrada({ salarioMensal: salario, parcela: 'unica' }));
      const primeira = calcularDecimoTerceiro(entrada({ salarioMensal: salario, parcela: 'primeira' }));
      const segunda = calcularDecimoTerceiro(entrada({
        salarioMensal: salario, parcela: 'segunda', jaPagoNaPrimeira: primeira.valor,
      }));
      expect(Number((primeira.valor + segunda.valor).toFixed(2))).toBe(unica.valor);
    }
  });

  it('🎯 o FGTS das duas parcelas bate com o da única — com no máximo 1 centavo de diferença', () => {
    /**
     * ⚠️ NÃO é igualdade exata, e isso é de propósito. Truncar duas vezes (uma por
     * parcela) pode perder um centavo contra truncar uma vez só: base 1.715,45 dá
     * 68,61 + 68,61 = 137,22 em duas parcelas e 137,23 numa.
     *
     * O certo é o de duas: o FGTS é depositado **por parcela**, então cada depósito é
     * truncado no seu dia — não existe um depósito único de onde tirar o centavo. Este
     * teste trava a ordem de grandeza sem mentir sobre uma igualdade que não existe.
     *
     * A versão anterior exigia igualdade exata e passava só porque os salários
     * escolhidos davam números redondos. Descoberto gerando os 3 recibos de verdade.
     */
    for (const salario of [1400, 1700, 2501, 4000]) {
      for (const noturno of [0, 15.45, 33.33]) {
        const arg = { salarioMensal: salario, mediaDoNoturno: noturno };
        const unica = calcularDecimoTerceiro(entrada({ ...arg, parcela: 'unica' }));
        const primeira = calcularDecimoTerceiro(entrada({ ...arg, parcela: 'primeira' }));
        const segunda = calcularDecimoTerceiro(entrada({ ...arg, parcela: 'segunda' }));
        const diferenca = Math.abs(primeira.fgts + segunda.fgts - unica.fgts);
        expect(diferenca).toBeLessThanOrEqual(0.011);
      }
    }
  });

  it('🎯 já o LÍQUIDO das duas parcelas é igual ao da única, sem centavo perdido', () => {
    // Aqui a igualdade é exata mesmo: o adiantamento abatido na 2ª é exatamente o que a
    // 1ª pagou, então ele se cancela na soma seja qual for o arredondamento.
    for (const salario of [1400, 1700, 2501, 4000, 9000]) {
      for (const noturno of [0, 15.45, 33.33]) {
        const arg = { salarioMensal: salario, mediaDoNoturno: noturno };
        const unica = calcularDecimoTerceiro(entrada({ ...arg, parcela: 'unica' }));
        const primeira = calcularDecimoTerceiro(entrada({ ...arg, parcela: 'primeira' }));
        const segunda = calcularDecimoTerceiro(entrada({
          ...arg, parcela: 'segunda', jaPagoNaPrimeira: primeira.valor,
        }));
        expect(Number((primeira.valor + segunda.valor).toFixed(2))).toBe(unica.valor);
      }
    }
  });

  it('a 2ª parcela mostra o 13º inteiro e abate o adiantamento à vista', () => {
    const d = calcularDecimoTerceiro(entrada({ parcela: 'segunda', jaPagoNaPrimeira: 850 }));
    expect(d.linhas.map(l => l.descricao)).toEqual([
      '13º salário (2ª parcela)',
      'Adiantamento já pago',
      'INSS sobre 13º',
    ]);
    expect(d.linhas[0].provento).toBe(1700);
    expect(d.linhas[1].desconto).toBe(850);
    expect(d.valor).toBe(Number((1700 - d.inss - d.irrf - 850).toFixed(2)));
  });

  it('o adiantamento abatido é o que FOI PAGO, não uma conta refeita', () => {
    // Salário subiu entre novembro e dezembro: o adiantamento continua o que saiu do caixa.
    const d = calcularDecimoTerceiro(entrada({ salarioMensal: 2000, parcela: 'segunda', jaPagoNaPrimeira: 850 }));
    expect(d.adiantamento).toBe(850);
    expect(d.adiantamento).not.toBe(1000);
  });

  it('FGTS desligado na ficha não gera valor', () => {
    expect(calcularDecimoTerceiro(entrada({ fgtsAtivo: false })).fgts).toBe(0);
  });

  it('sem avos, não há 13º', () => {
    const d = calcularDecimoTerceiro(entrada({ avos: 0 }));
    expect(d.bruto).toBe(0);
    expect(d.valor).toBe(0);
  });

  it('salário alto NÃO deixa a 2ª parcela negativa — o INSS tem teto e o IR para em 27,5%', () => {
    const d = calcularDecimoTerceiro(entrada({ salarioMensal: 60000, parcela: 'segunda', jaPagoNaPrimeira: 30000 }));
    expect(d.valor).toBeGreaterThan(0);
    expect(d.parcelaNegativa).toBe(false);
  });

  it('a 2ª parcela negativa é sinalizada, não escondida', () => {
    /**
     * O caso REAL: o salário CAIU entre novembro e dezembro. O adiantamento abatido é o
     * que saiu do caixa (R$ 850), e o 13º novo inteiro vale menos que isso depois do
     * imposto. Zerar aqui faria a empresa engolir um imposto que ela tem que recolher.
     */
    const d = calcularDecimoTerceiro(entrada({ salarioMensal: 900, parcela: 'segunda', jaPagoNaPrimeira: 850 }));
    expect(d.valor).toBeLessThan(0);
    expect(d.parcelaNegativa).toBe(true);
    // E o caso normal não liga o alarme.
    expect(calcularDecimoTerceiro(entrada({ parcela: 'segunda', jaPagoNaPrimeira: 850 })).parcelaNegativa).toBe(false);
  });

  it('sem tabela de imposto, sai sem a linha — como antes de existirem', () => {
    const d = calcularDecimoTerceiro(entrada({ tabelaInss: undefined, tabelaIrrf: undefined }));
    expect(d.inss).toBe(0);
    expect(d.irrf).toBe(0);
    expect(d.valor).toBe(1700);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('decimoDaPessoa — quem tem 13º, e o porquê de quem não tem', () => {
  const base = {
    ano: 2026,
    parcela: 'unica' as const,
    pontos: [],
    config: CONFIGURACAO_DA_FOLHA_PADRAO,
    tabelas: TABELAS,
  };
  const ficha = (over: Record<string, unknown> = {}) => ({
    id: 'e1',
    employment_type: 'Carteira Assinada',
    monthly_salary: 1700,
    hire_date: '2024-01-02',
    fgts_enabled: true,
    family_allowance_children: 0,
    ...over,
  });

  it('diarista não tem 13º por aqui, e a tela sabe por quê', () => {
    const r = decimoDaPessoa({ ...base, ficha: ficha({ employment_type: 'Diarista' }) });
    expect(r.decimo).toBeUndefined();
    expect(r.motivo).toBe('nao-e-mensalista');
  });

  it('carteira assinada sem salário na ficha: motivo "sem-salario"', () => {
    const r = decimoDaPessoa({ ...base, ficha: ficha({ monthly_salary: 0 }) });
    expect(r.motivo).toBe('sem-salario');
  });

  it('admitida em dezembro com menos de 15 dias: motivo "sem-avos"', () => {
    const r = decimoDaPessoa({ ...base, ficha: ficha({ hire_date: '2026-12-20' }) });
    expect(r.motivo).toBe('sem-avos');
  });

  it('a média do noturno sai do PONTO, mês a mês', () => {
    // 10h noturnas em janeiro e 10h em fevereiro, nada nos outros meses.
    const pontos = [
      { date: '2026-01-05', status: 'present', night_hours: 10 },
      { date: '2026-02-05', status: 'present', night_hours: 10 },
    ];
    const r = decimoDaPessoa({ ...base, ficha: ficha(), pontos });
    // Adicional de 10h = 1700 ÷ 220 × 10 × 0,2 = R$ 15,45 em cada um dos dois meses.
    // A média sobre os 12 avos é 30,90 ÷ 12 = 2,575 → TRUNCADO em 2,57, como o resto da
    // folha (arredondar criaria diferença sistemática contra o gabarito da Arruda).
    expect(r.decimo!.base).toBe(1702.57);
  });

  it('falta COM atestado não derruba o avo; sem atestado derruba', () => {
    const faltas = (justificada: boolean) =>
      Array.from({ length: 20 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, '0')}`,
        status: 'absent',
        absence_justified: justificada,
      }));

    expect(decimoDaPessoa({ ...base, ficha: ficha(), pontos: faltas(true) }).decimo!.avos).toBe(12);
    expect(decimoDaPessoa({ ...base, ficha: ficha(), pontos: faltas(false) }).decimo!.avos).toBe(11);
  });

  it('ponto de outro ano é ignorado', () => {
    const pontos = [{ date: '2025-01-05', status: 'present', night_hours: 100 }];
    expect(decimoDaPessoa({ ...base, ficha: ficha(), pontos }).decimo!.base).toBe(1700);
  });
});
