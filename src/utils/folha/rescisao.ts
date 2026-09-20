/**
 * RESCISÃO — o acerto de contas (leva 4, a última do que ficou da folha; 19/09/2026).
 *
 * ⚠️ **Sem gabarito, como o 13º.** Os 12 recibos da contabilidade são de folha mensal;
 * nenhum é rescisão. Isto é a CLT como escrita, e o papel sai com a mesma tarja de
 * "valores em conferência". Uma rescisão errada vira processo — este módulo prefere
 * mostrar a conta aberta, linha por linha, a entregar um número fechado.
 *
 * ## As decisões do Victor (19/09/2026)
 *
 * 1. **Os quatro motivos**: sem justa causa, pedido de demissão, justa causa e acordo.
 * 2. **O saldo do FGTS é DIGITADO.** O sistema não tem o histórico de depósitos (o FGTS
 *    só passou a ser calculado em 18/09/2026), então estimar a multa seria inventar o
 *    número mais caro do acerto. Sem o saldo, a linha da multa não sai.
 * 3. **Aviso prévio: 30 dias + 3 por ano de casa, teto de 90** (Lei 12.506/2011), e a
 *    tela pergunta se foi trabalhado ou indenizado.
 * 4. Gerar o acerto **só grava a data de saída** — não some com a pessoa das telas.
 *
 * ## O que cada motivo paga
 *
 * |                          | s/ justa causa | pedido | justa causa | acordo |
 * |--------------------------|:--------------:|:------:|:-----------:|:------:|
 * | Saldo de salário         |       ✓        |   ✓    |      ✓      |   ✓    |
 * | Aviso prévio indenizado  |       ✓        |   ✗¹   |      ✗      |  ½     |
 * | 13º proporcional         |       ✓        |   ✓    |      ✗      |   ✓    |
 * | Férias vencidas + 1/3    |       ✓        |   ✓    |      ✓      |   ✓    |
 * | Férias propor. + 1/3     |       ✓        |   ✓    |      ✗      |   ✓    |
 * | Multa do FGTS            |      40%       |   ✗    |      ✗      |  20%   |
 *
 * ¹ No pedido de demissão sem cumprir aviso é a PESSOA que deve à empresa: vira desconto,
 *   não provento — e de 30 dias secos, porque os 3 dias por ano são benefício de quem é
 *   mandado embora, não de quem pede pra sair.
 *
 * ## A projeção do aviso indenizado (o detalhe que muda avos)
 *
 * Aviso indenizado **projeta o contrato**: os dias do aviso contam como tempo de casa
 * para 13º e férias (Súmula 371 do TST). Quem sai em 20/12 com 33 dias de aviso conta
 * como se tivesse saído em 22/01 — e pode ganhar um avo a mais nos dois. Ignorar isso
 * paga a menos.
 *
 * ## O que é isento de imposto
 *
 * Férias indenizadas (vencidas e proporcionais), o 1/3, o aviso indenizado e a multa do
 * FGTS são **indenizatórios**: não entram na base do INSS nem do IRRF. Só o saldo de
 * salário e o 13º são tributados — e o 13º à parte, como sempre.
 */

import { feriasPorAvos, somaMeses, type FeriasDaPessoa } from './feriasPorAvos';
import { mesesComAvo } from './decimoTerceiro';
import type { LinhaDaFolha } from './folhaCalc';
import {
  calcularInss,
  calcularIrrf,
  faixaAplicada,
  type TabelaDoInss,
  type TabelaDoIrrf,
} from './impostos';

export type MotivoDaRescisao = 'sem-justa-causa' | 'pedido-de-demissao' | 'justa-causa' | 'acordo';
export type SituacaoDoAviso = 'trabalhado' | 'indenizado' | 'dispensado';

export const MOTIVOS: Array<{ id: MotivoDaRescisao; nome: string }> = [
  { id: 'sem-justa-causa', nome: 'Dispensa sem justa causa' },
  { id: 'pedido-de-demissao', nome: 'Pedido de demissão' },
  { id: 'justa-causa', nome: 'Dispensa por justa causa' },
  { id: 'acordo', nome: 'Acordo entre as partes (484-A)' },
];

/** O que cada motivo paga. Uma tabela, e não `if` espalhado — é o coração da conta. */
const REGRAS: Record<MotivoDaRescisao, {
  avisoDaEmpresa: 0 | 0.5 | 1;
  decimoProporcional: boolean;
  feriasProporcionais: boolean;
  multaFgts: number;
}> = {
  'sem-justa-causa': { avisoDaEmpresa: 1, decimoProporcional: true, feriasProporcionais: true, multaFgts: 40 },
  'pedido-de-demissao': { avisoDaEmpresa: 0, decimoProporcional: true, feriasProporcionais: true, multaFgts: 0 },
  'justa-causa': { avisoDaEmpresa: 0, decimoProporcional: false, feriasProporcionais: false, multaFgts: 0 },
  'acordo': { avisoDaEmpresa: 0.5, decimoProporcional: true, feriasProporcionais: true, multaFgts: 20 },
};

export interface EntradaDaRescisao {
  salarioMensal: number;
  admissao: string;
  /** Último dia trabalhado, 'YYYY-MM-DD'. */
  dataDeSaida: string;
  motivo: MotivoDaRescisao;
  aviso: SituacaoDoAviso;
  /** Saldo do FGTS depositado, digitado. Sem ele a multa não sai (decisão do Victor). */
  saldoFgts?: number;
  faltasInjustificadas?: readonly string[];
  feriasGozadas?: readonly { start_date: string; end_date: string }[];
  dependentes?: number;
  percentualFgts: number;
  fgtsAtivo: boolean;
  tabelaInss?: TabelaDoInss;
  tabelaIrrf?: TabelaDoIrrf;
  tabelasConfirmadas?: boolean;
}

export interface RescisaoCalculada {
  motivo: MotivoDaRescisao;
  /** Dias de aviso que a lei dá (30 + 3 por ano, teto 90). */
  diasDeAviso: number;
  /** A data que vale para contar avos — a saída, projetada pelo aviso indenizado. */
  dataProjetada: string;
  /** Anos completos de casa, que definem os dias de aviso. */
  anosDeCasa: number;

  saldoDeSalario: number;
  diasDeSaldo: number;
  avisoPrevio: number;
  /** Aviso que a PESSOA deve (pedido de demissão sem cumprir). Sai como desconto. */
  avisoDescontado: number;
  decimoProporcional: number;
  avosDoDecimo: number;
  feriasVencidas: number;
  tercoDasVencidas: number;
  diasDeFeriasVencidas: number;
  feriasProporcionais: number;
  tercoDasProporcionais: number;
  diasDeFeriasProporcionais: number;
  multaFgts: number;

  /** Base e valor dos impostos. Férias, 1/3, aviso e multa ficam de fora (indenizatórios). */
  baseInss: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  inssDoDecimo: number;
  irrfDoDecimo: number;

  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  /** FGTS do mês da saída — custo da empresa, não abate o líquido. */
  fgtsDoMes: number;
  tabelasConfirmadas: boolean;
  /** O saldo do FGTS não foi informado e o motivo dava direito à multa. */
  multaSemSaldoInformado: boolean;
  linhas: LinhaDaFolha[];
  /** As férias apuradas, para a tela mostrar de onde saiu o número. */
  ferias: FeriasDaPessoa;
}

const truncaCentavos = (valor: number): number => {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return Math.floor(Number(valor.toFixed(6)) * 100) / 100;
};

const doisDecimais = (valor: number): number => Number(valor.toFixed(2));
const formataReferencia = (valor: number): string => valor.toFixed(2).replace('.', ',');

/** Anos COMPLETOS entre a admissão e a saída. */
export function anosDeCasa(admissao: string, dataDeSaida: string): number {
  if (!admissao || !dataDeSaida || dataDeSaida < admissao) return 0;
  let anos = 0;
  while (somaMeses(admissao, (anos + 1) * 12) <= dataDeSaida) anos++;
  return anos;
}

/**
 * Dias de aviso prévio: 30 + 3 por ano completo, teto de 90 (Lei 12.506/2011).
 *
 * Os 3 dias por ano são benefício de quem é MANDADO EMBORA. Quem pede demissão e não
 * cumpre o aviso deve 30 dias secos — por isso este número não vale para os dois lados.
 */
export function diasDeAvisoPrevio(admissao: string, dataDeSaida: string): number {
  return Math.min(90, 30 + 3 * anosDeCasa(admissao, dataDeSaida));
}

/** O dia seguinte a uma data, N vezes. */
function somaDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function calcularRescisao(entrada: EntradaDaRescisao): RescisaoCalculada {
  const {
    salarioMensal, admissao, dataDeSaida, motivo, aviso, saldoFgts,
    faltasInjustificadas, feriasGozadas, dependentes,
    percentualFgts, fgtsAtivo, tabelaInss, tabelaIrrf, tabelasConfirmadas,
  } = entrada;

  const salario = Math.max(0, Number(salarioMensal) || 0);
  const regra = REGRAS[motivo];
  const anos = anosDeCasa(admissao, dataDeSaida);
  const diasDeAviso = diasDeAvisoPrevio(admissao, dataDeSaida);

  /**
   * A projeção do aviso INDENIZADO pago pela empresa: o contrato se estende, e os dias
   * contam para avos de 13º e férias. Aviso trabalhado não projeta (o tempo já passou
   * de verdade) e aviso do empregado também não.
   */
  const empresaPagaAviso = regra.avisoDaEmpresa > 0 && aviso === 'indenizado';
  const diasProjetados = empresaPagaAviso ? Math.round(diasDeAviso * regra.avisoDaEmpresa) : 0;
  const dataProjetada = diasProjetados > 0 ? somaDias(dataDeSaida, diasProjetados) : dataDeSaida;

  // ── Saldo de salário: os dias do mês até a saída ──
  const diasDeSaldo = Number(dataDeSaida.slice(8, 10));
  const saldoDeSalario = Math.min(salario, truncaCentavos((salario / 30) * diasDeSaldo));

  // ── Aviso prévio ──
  const avisoPrevio = empresaPagaAviso
    ? truncaCentavos((salario / 30) * diasProjetados)
    : 0;
  // Pedido de demissão sem cumprir aviso: a pessoa deve 30 dias à empresa.
  const avisoDescontado = motivo === 'pedido-de-demissao' && aviso === 'indenizado'
    ? truncaCentavos(salario)
    : 0;

  // ── 13º proporcional: avos do ano da saída, com a projeção do aviso ──
  const anoDaSaida = Number(dataProjetada.slice(0, 4));
  const avosDoDecimo = regra.decimoProporcional
    ? mesesComAvo(admissao, anoDaSaida, faltasInjustificadas ?? [], dataProjetada).length
    : 0;
  const decimoProporcional = truncaCentavos((salario / 12) * avosDoDecimo);

  // ── Férias: as vencidas e as proporcionais, pela mesma conta da tela de Férias ──
  const ferias = feriasPorAvos({
    admissao,
    hoje: dataProjetada,
    faltasInjustificadas,
    feriasGozadas,
    desligamento: dataProjetada,
  });

  const diasDeFeriasVencidas = ferias.saldoCheio;
  const feriasVencidas = truncaCentavos((salario / 30) * diasDeFeriasVencidas);
  const tercoDasVencidas = truncaCentavos(feriasVencidas / 3);

  const diasDeFeriasProporcionais = regra.feriasProporcionais ? ferias.proporcionalCheio : 0;
  const feriasProporcionais = truncaCentavos((salario / 30) * diasDeFeriasProporcionais);
  const tercoDasProporcionais = truncaCentavos(feriasProporcionais / 3);

  // ── Multa do FGTS: só com o saldo digitado (decisão do Victor) ──
  const saldo = Math.max(0, Number(saldoFgts) || 0);
  const multaFgts = regra.multaFgts > 0 && saldo > 0
    ? truncaCentavos((saldo * regra.multaFgts) / 100)
    : 0;
  const multaSemSaldoInformado = regra.multaFgts > 0 && saldo <= 0;

  /**
   * IMPOSTO — só o que é salário.
   *
   * Férias indenizadas, o 1/3, o aviso indenizado e a multa são indenizatórios: não
   * entram na base. Quem soma tudo numa base só desconta imposto sobre dinheiro que a
   * lei isenta, e o funcionário recebe a menos.
   */
  const baseInss = doisDecimais(saldoDeSalario);
  const inss = tabelaInss ? calcularInss(baseInss, tabelaInss) : 0;
  const doIrrf = tabelaIrrf ? calcularIrrf(baseInss, inss, dependentes ?? 0, tabelaIrrf) : null;
  const irrf = doIrrf?.valor ?? 0;

  // O 13º é tributado à parte, como sempre (exclusivo na fonte).
  const inssDoDecimo = decimoProporcional > 0 && tabelaInss ? calcularInss(decimoProporcional, tabelaInss) : 0;
  const doIrrfDecimo = decimoProporcional > 0 && tabelaIrrf
    ? calcularIrrf(decimoProporcional, inssDoDecimo, dependentes ?? 0, tabelaIrrf)
    : null;
  const irrfDoDecimo = doIrrfDecimo?.valor ?? 0;

  const fgtsDoMes = fgtsAtivo
    ? truncaCentavos(((saldoDeSalario + decimoProporcional + avisoPrevio) * percentualFgts) / 100)
    : 0;

  // ── As linhas do papel, na ordem em que a pessoa lê ──
  const linhas: LinhaDaFolha[] = [];
  const provento = (descricao: string, valor: number, referencia?: string) => {
    if (valor > 0) linhas.push({ descricao, referencia, provento: valor, desconto: 0 });
  };
  const desconto = (descricao: string, valor: number, referencia?: string) => {
    if (valor > 0) linhas.push({ descricao, referencia, provento: 0, desconto: valor });
  };

  provento('Saldo de salário', saldoDeSalario, formataReferencia(diasDeSaldo));
  provento('Aviso prévio indenizado', avisoPrevio, formataReferencia(diasProjetados));
  provento('13º salário proporcional', decimoProporcional, `${formataReferencia(avosDoDecimo)}/12`);
  provento('Férias vencidas', feriasVencidas, formataReferencia(diasDeFeriasVencidas));
  provento('1/3 sobre férias vencidas', tercoDasVencidas);
  provento('Férias proporcionais', feriasProporcionais, formataReferencia(diasDeFeriasProporcionais));
  provento('1/3 sobre férias proporcionais', tercoDasProporcionais);
  provento(`Multa de ${regra.multaFgts}% do FGTS`, multaFgts);

  desconto('Aviso prévio não cumprido', avisoDescontado, '30,00');
  if (inss > 0 && tabelaInss) {
    desconto('INSS sobre saldo', inss, `${formataReferencia(faixaAplicada(baseInss, tabelaInss.faixas))}%`);
  }
  if (irrf > 0 && tabelaIrrf && doIrrf) {
    desconto('IRRF sobre saldo', irrf, `${formataReferencia(faixaAplicada(doIrrf.base, tabelaIrrf.faixas))}%`);
  }
  if (inssDoDecimo > 0 && tabelaInss) {
    desconto('INSS sobre 13º', inssDoDecimo, `${formataReferencia(faixaAplicada(decimoProporcional, tabelaInss.faixas))}%`);
  }
  if (irrfDoDecimo > 0 && tabelaIrrf && doIrrfDecimo) {
    desconto('IRRF sobre 13º', irrfDoDecimo, `${formataReferencia(faixaAplicada(doIrrfDecimo.base, tabelaIrrf.faixas))}%`);
  }

  const totalProventos = doisDecimais(linhas.reduce((s, l) => s + l.provento, 0));
  const totalDescontos = doisDecimais(linhas.reduce((s, l) => s + l.desconto, 0));

  return {
    motivo,
    diasDeAviso,
    dataProjetada,
    anosDeCasa: anos,
    saldoDeSalario,
    diasDeSaldo,
    avisoPrevio,
    avisoDescontado,
    decimoProporcional,
    avosDoDecimo,
    feriasVencidas,
    tercoDasVencidas,
    diasDeFeriasVencidas,
    feriasProporcionais,
    tercoDasProporcionais,
    diasDeFeriasProporcionais,
    multaFgts,
    baseInss,
    inss,
    baseIrrf: doIrrf?.base ?? 0,
    irrf,
    inssDoDecimo,
    irrfDoDecimo,
    totalProventos,
    totalDescontos,
    liquido: doisDecimais(totalProventos - totalDescontos),
    fgtsDoMes,
    tabelasConfirmadas: Boolean(tabelasConfirmadas),
    multaSemSaldoInformado,
    linhas,
    ferias,
  };
}
