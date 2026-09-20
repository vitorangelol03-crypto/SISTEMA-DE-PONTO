import { describe, it, expect } from 'vitest';
import { montarLinhasDeValor, montarRelatorio } from '../../src/utils/relatorios/relatorioDados';
import { agregarFinanceiroPorPessoa } from '../../src/utils/financeiroPorPessoa';
import { calcularDecimoTerceiro } from '../../src/utils/folha/decimoTerceiro';
import { calcularRescisao } from '../../src/utils/folha/rescisao';
import { decimoDoRegistro, rescisaoDoRegistro } from '../../src/utils/folha/papelGravado';
import { TABELA_INSS_2026, TABELA_IRRF_2026 } from '../../src/utils/folha/impostos';
import type { Company, Employee, Payment } from '../../src/services/database';

/**
 * 13º E RESCISÃO NO RELATÓRIO (19/09/2026).
 *
 * Decisões do Victor: entram em **qualquer período que contenha a data** (diferente do
 * salário, que é mensal) e **cada verba numa linha**.
 *
 * O que estes testes protegem, além disso: o relatório LÊ o que foi gravado e nunca
 * recalcula — e quem é diarista continua com o relatório idêntico ao de antes.
 */

const decimo = () => calcularDecimoTerceiro({
  salarioMensal: 1700, avos: 12, parcela: 'unica',
  percentualFgts: 8, fgtsAtivo: true,
  tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026, tabelasConfirmadas: true,
});

const rescisao = () => calcularRescisao({
  salarioMensal: 1700, admissao: '2023-03-10', dataDeSaida: '2026-09-15',
  motivo: 'sem-justa-causa', aviso: 'indenizado', saldoFgts: 8500,
  percentualFgts: 8, fgtsAtivo: true,
  tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026, tabelasConfirmadas: true,
});

const funcionario = (over: Partial<Employee> = {}): Employee => ({
  id: 'emp-1', name: 'Ana Paula', cpf: '12345678901',
  function_role: 'Triagem', employment_type: 'Carteira Assinada', company_id: 'comp-1',
  expected_schedule: [0, 480, 480, 480, 480, 480, 240], ...over,
} as Employee);

const empresa = () => ({ id: 'comp-1', display_name: 'Empresa' } as Company);

const pagamento = (): Payment => ({
  id: 'p1', employee_id: 'emp-1', date: '2026-09-03',
  daily_rate: 100, bonus_b: 0, bonus_c1: 0, bonus_c2: 0, total: 100, company_id: 'comp-1',
} as Payment);

const dados = (emp = funcionario(), pagamentos: Payment[] = []) =>
  agregarFinanceiroPorPessoa([emp], pagamentos, [], [], []);

// ════════════════════════════════════════════════════════════════════════════
describe('as linhas do 13º e da rescisão no relatório', () => {
  it('🎯 cada verba vira uma linha, com a natureza certa', () => {
    const [d] = dados();
    const linhas = montarLinhasDeValor(d, undefined, [decimo()]);
    expect(linhas.map(l => [l.rotulo, l.natureza])).toEqual([
      ['13º salário', 'provento'],
      ['INSS sobre 13º', 'desconto'],
      ['FGTS depositado', 'custo-empresa'],
    ]);
  });

  it('🎯 a rescisão entra verba por verba (decisão do Victor)', () => {
    const [d] = dados();
    const rotulos = montarLinhasDeValor(d, undefined, [], [rescisao()]).map(l => l.rotulo);
    expect(rotulos).toContain('Saldo de salário');
    expect(rotulos).toContain('Aviso prévio indenizado');
    expect(rotulos).toContain('Férias vencidas');
    expect(rotulos).toContain('1/3 sobre férias vencidas');
    expect(rotulos).toContain('Multa de 40% do FGTS');
    expect(rotulos).toContain('INSS sobre saldo');
  });

  it('os rótulos não colidem com os da folha mensal', () => {
    const [d] = dados();
    const rotulos = montarLinhasDeValor(d, undefined, [decimo()], [rescisao()]).map(l => l.rotulo);
    // "INSS" seco é da folha do mês; aqui são os dois qualificados.
    expect(rotulos).not.toContain('INSS');
    expect(rotulos).toContain('INSS sobre 13º');
    expect(rotulos).toContain('INSS sobre saldo');
  });

  it('o FGTS do 13º e da rescisão soma no "custo da empresa", numa linha só', () => {
    const [d] = dados();
    const linhas = montarLinhasDeValor(d, undefined, [decimo()], [rescisao()]);
    const fgts = linhas.filter(l => l.natureza === 'custo-empresa');
    expect(fgts).toHaveLength(1);
    expect(fgts[0].valor).toBe(Number((decimo().fgts + rescisao().fgtsDoMes).toFixed(2)));
  });

  it('🎯 REGRESSÃO: sem 13º nem rescisão, o diarista sai idêntico ao de antes', () => {
    const [d] = dados(funcionario({ employment_type: 'Diarista' } as Partial<Employee>), [pagamento()]);
    expect(montarLinhasDeValor(d)).toEqual(montarLinhasDeValor(d, undefined, [], []));
    expect(montarLinhasDeValor(d).map(l => l.rotulo)).toEqual(['Diárias']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('o relatório montado', () => {
  const montar = (decimos = [decimo()], rescisoes: ReturnType<typeof rescisao>[] = [], pagamentos: Payment[] = []) =>
    montarRelatorio({
      tipo: 'financeiro',
      company: empresa(),
      periodo: { inicio: '2026-12-01', fim: '2026-12-31', rotulo: 'Dezembro' },
      financeiro: dados(funcionario(), pagamentos),
      attendances: [],
      decimosPorPessoa: new Map([['emp-1', decimos]]),
      rescisoesPorPessoa: new Map([['emp-1', rescisoes]]),
    });

  it('🎯 quem SÓ recebeu 13º no período entra no relatório', () => {
    const r = montar();
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0].decimos).toHaveLength(1);
  });

  it('🎯 o líquido soma o 13º ao que já havia', () => {
    const r = montar([decimo()], [], [pagamento()]);
    const p = r.pessoas[0];
    expect(p.totalLiquido).toBe(Number((100 + decimo().liquido).toFixed(2)));
    expect(Number((p.totalProventos - p.totalDescontos).toFixed(2))).toBe(p.totalLiquido);
  });

  it('as DUAS parcelas do 13º no mesmo período somam as duas', () => {
    const primeira = calcularDecimoTerceiro({
      salarioMensal: 1700, avos: 12, parcela: 'primeira',
      percentualFgts: 8, fgtsAtivo: true,
      tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026,
    });
    const segunda = calcularDecimoTerceiro({
      salarioMensal: 1700, avos: 12, parcela: 'segunda', jaPagoNaPrimeira: primeira.valor,
      percentualFgts: 8, fgtsAtivo: true,
      tabelaInss: TABELA_INSS_2026, tabelaIrrf: TABELA_IRRF_2026,
    });
    const p = montar([primeira, segunda]).pessoas[0];
    expect(p.decimos).toHaveLength(2);
    expect(p.totalLiquido).toBe(Number((primeira.valor + segunda.valor).toFixed(2)));
  });

  it('o relatório de PONTO continua sem nenhum centavo', () => {
    const r = montarRelatorio({
      tipo: 'ponto',
      company: empresa(),
      periodo: { inicio: '2026-12-01', fim: '2026-12-31', rotulo: 'Dezembro' },
      financeiro: dados(funcionario(), [pagamento()]),
      attendances: [],
      decimosPorPessoa: new Map([['emp-1', [decimo()]]]),
      rescisoesPorPessoa: new Map([['emp-1', [rescisao()]]]),
    });
    for (const p of r.pessoas) {
      expect(p.linhas).toEqual([]);
      expect(p.decimos).toEqual([]);
      expect(p.rescisoes).toEqual([]);
      expect(p.totalLiquido).toBe(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('🎯 o relatório LÊ o papel gravado, nunca recalcula', () => {
  it('com o papel guardado, usa o papel inteiro', () => {
    const emitido = decimo();
    const lido = decimoDoRegistro({
      parcela: 'unica', avos: 12, base: 1700, bruto: 1700,
      inss: emitido.inss, irrf: emitido.irrf, fgts: emitido.fgts,
      adiantamento: 0, valor: emitido.valor,
      papel: JSON.parse(JSON.stringify(emitido)),
    });
    expect(lido).toEqual(emitido);
  });

  it('sem o papel, monta o mínimo — o detalhe se perde, o DINHEIRO não', () => {
    const lido = decimoDoRegistro({
      parcela: 'unica', avos: 12, base: 1700, bruto: 1700,
      inss: 128.68, irrf: 0, fgts: 136, adiantamento: 0, valor: 1571.32,
      papel: {},
    });
    expect(lido.liquido).toBe(1571.32);
    expect(lido.linhas).toHaveLength(1);
    expect(lido.linhas[0].descricao).toBe('13º salário');
    expect(lido.linhas[0].provento).toBe(1571.32);
  });

  it('rescisão sem o papel também não perde o valor, e continua fechando', () => {
    const lida = rescisaoDoRegistro({
      motivo: 'sem-justa-causa', dias_de_aviso: 39, anos_de_casa: 3,
      data_de_saida: '2026-09-15',
      inss: 63.75, irrf: 0, inss_decimo: 106.24, irrf_decimo: 0,
      total_proventos: 15961.10, total_descontos: 169.99, liquido: 15791.11,
      papel: null,
    });
    expect(lida.liquido).toBe(15791.11);
    const soma = lida.linhas.reduce((t, l) => t + l.provento - l.desconto, 0);
    expect(Number(soma.toFixed(2))).toBe(15791.11);
  });

  it('o papel guardado da rescisão volta inteiro, com as referências', () => {
    const emitida = rescisao();
    const lida = rescisaoDoRegistro({
      motivo: emitida.motivo, dias_de_aviso: emitida.diasDeAviso, anos_de_casa: emitida.anosDeCasa,
      data_de_saida: '2026-09-15',
      inss: emitida.inss, irrf: emitida.irrf,
      inss_decimo: emitida.inssDoDecimo, irrf_decimo: emitida.irrfDoDecimo,
      total_proventos: emitida.totalProventos, total_descontos: emitida.totalDescontos,
      liquido: emitida.liquido,
      papel: JSON.parse(JSON.stringify(emitida)),
    });
    // As referências (dias, avos) são o que se perderia sem a coluna `papel`.
    expect(lida.linhas.find(l => l.descricao === 'Férias vencidas')?.referencia).toBeTruthy();
    expect(lida.diasDeFeriasVencidas).toBe(emitida.diasDeFeriasVencidas);
  });
});
