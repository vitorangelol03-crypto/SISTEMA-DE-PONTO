import { describe, it, expect } from 'vitest';
import { calcularDecimoTerceiro } from '../../src/utils/folha/decimoTerceiro';
import { calcularRescisao } from '../../src/utils/folha/rescisao';
import { linhasDoRecibo, totaisDoRecibo, type HoleriteData } from '../../src/utils/holeritePdf';
import { TABELA_INSS_2026, TABELA_IRRF_2026 } from '../../src/utils/folha/impostos';

/**
 * A 2ª VIA — releitura, nunca recálculo (19/09/2026).
 *
 * Por que isto merece teste próprio: as tabelas `payroll_thirteenth` e
 * `payroll_termination` guardam o papel INTEIRO como ele saiu. A tentação, na hora de
 * reimprimir, é recalcular — e aí, se o salário ou a tabela de imposto mudarem, a 2ª via
 * não bate com o dinheiro que saiu do caixa. Numa rescisão isso é grave: é o documento
 * que a pessoa assinou e que vale num processo.
 *
 * Estes testes mostram a divergência acontecendo, e provam que a releitura não sofre dela.
 */

const PAPEL_BASE: Omit<HoleriteData, 'decimo' | 'rescisao'> = {
  company: { name: 'CARATINGA' },
  employee: { name: 'FULANO', cpf: null },
  period: { start: '2026-01-01', end: '2026-12-31' },
  payments: [],
  errorDiscount: 0,
  triageDiscount: 0,
  totalDailyRate: 0,
  totalBonusB: 0,
  totalBonusC1: 0,
  totalBonusC2: 0,
  totalGross: 0,
  totalNet: 0,
};

const decimoCom = (salario: number) => calcularDecimoTerceiro({
  salarioMensal: salario, avos: 12, parcela: 'unica',
  percentualFgts: 8, fgtsAtivo: true,
  tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026, tabelasConfirmadas: true,
});

const rescisaoCom = (salario: number) => calcularRescisao({
  salarioMensal: salario, admissao: '2023-03-10', dataDeSaida: '2026-09-15',
  motivo: 'sem-justa-causa', aviso: 'indenizado', saldoFgts: 8500,
  percentualFgts: 8, fgtsAtivo: true,
  tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026, tabelasConfirmadas: true,
});

describe('a marca de 2ª via', () => {
  it('🎯 o papel diz na cara que é reimpressão', () => {
    // O título sai do desenho, então aqui prova-se o dado que o desenho lê.
    const papel: HoleriteData = { ...PAPEL_BASE, decimo: decimoCom(1700), segundaVia: true };
    expect(papel.segundaVia).toBe(true);
    // E o original não carrega a marca.
    const original: HoleriteData = { ...PAPEL_BASE, decimo: decimoCom(1700) };
    expect(original.segundaVia).toBeUndefined();
  });

  it('a marca não muda nenhum valor do papel', () => {
    const decimo = decimoCom(1700);
    const original = totaisDoRecibo({ ...PAPEL_BASE, decimo });
    const segunda = totaisDoRecibo({ ...PAPEL_BASE, decimo, segundaVia: true });
    expect(segunda).toEqual(original);
  });
});

describe('🎯 13º — releitura x recálculo, com o salário mudado depois', () => {
  it('o recálculo DIVERGE do que foi pago (é por isso que se guarda o papel)', () => {
    const emitido = decimoCom(1700);
    const recalculadoHoje = decimoCom(2000); // salário subiu depois
    expect(recalculadoHoje.valor).not.toBe(emitido.valor);
  });

  it('a 2ª via relida sai IGUAL ao original, linha por linha', () => {
    const emitido = decimoCom(1700);
    // O que a tabela guarda e devolve: o objeto inteiro, como saiu.
    const guardado = JSON.parse(JSON.stringify(emitido));

    const original = linhasDoRecibo({ ...PAPEL_BASE, decimo: emitido });
    const segundaVia = linhasDoRecibo({ ...PAPEL_BASE, decimo: guardado, segundaVia: true });

    expect(segundaVia.proventos).toEqual(original.proventos);
    expect(segundaVia.descontos).toEqual(original.descontos);
    expect(totaisDoRecibo({ ...PAPEL_BASE, decimo: guardado }))
      .toEqual(totaisDoRecibo({ ...PAPEL_BASE, decimo: emitido }));
  });

  it('a ida e volta pelo JSON não perde nem arredonda centavo', () => {
    const emitido = decimoCom(1733.37); // salário quebrado de propósito
    const guardado = JSON.parse(JSON.stringify(emitido));
    expect(guardado).toEqual(emitido);
    expect(guardado.valor).toBe(emitido.valor);
    expect(guardado.linhas).toHaveLength(emitido.linhas.length);
  });
});

describe('🎯 rescisão — o caso em que recalcular seria grave', () => {
  it('o recálculo com outro salário dá outro acerto', () => {
    expect(rescisaoCom(2000).liquido).not.toBe(rescisaoCom(1700).liquido);
  });

  it('a 2ª via relida reproduz o acerto assinado, verba por verba', () => {
    const emitida = rescisaoCom(1700);
    const guardada = JSON.parse(JSON.stringify(emitida));

    const original = linhasDoRecibo({ ...PAPEL_BASE, rescisao: emitida });
    const segunda = linhasDoRecibo({ ...PAPEL_BASE, rescisao: guardada, segundaVia: true });

    expect(segunda.proventos).toEqual(original.proventos);
    expect(segunda.descontos).toEqual(original.descontos);
    // E o líquido, que é o número que a pessoa confere.
    expect(totaisDoRecibo({ ...PAPEL_BASE, rescisao: guardada }).liquido)
      .toBe(totaisDoRecibo({ ...PAPEL_BASE, rescisao: emitida }).liquido);
  });

  it('as REFERÊNCIAS sobrevivem — dias e avos, que os valores sozinhos não guardam', () => {
    // Era isto que faltava: reconstruir só dos valores perderia "Férias vencidas (90,00)".
    const guardada = JSON.parse(JSON.stringify(rescisaoCom(1700)));
    const { proventos } = linhasDoRecibo({ ...PAPEL_BASE, rescisao: guardada, segundaVia: true });
    const feriasVencidas = proventos.find(l => l[0].startsWith('Férias vencidas'));
    expect(feriasVencidas?.[0]).toMatch(/\(\d+,\d{2}\)/);
    expect(proventos.find(l => l[0].startsWith('13º salário proporcional'))?.[0]).toContain('/12');
  });
});
