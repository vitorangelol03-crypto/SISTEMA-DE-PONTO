/**
 * O 13º DE UMA PESSOA a partir do ponto do ano (19/09/2026).
 *
 * Mesmo papel que o `folhaDaPessoa` faz para o mês: traduzir o que o banco tem (ficha +
 * ponto) para a entrada da conta pura, num lugar só. A tela do 13º, o recibo e qualquer
 * relatório futuro usam esta função — não uma cópia dela.
 *
 * ## De onde sai cada número
 *
 * · **Avos:** do `hire_date` da ficha e das faltas SEM atestado do ano, pela regra dos
 *   15 dias (decisão 3 do Victor). Ver `mesesComAvo`.
 * · **Média do adicional noturno:** do PONTO. Para cada mês que dá avo, soma as horas
 *   noturnas (pela mesma `horasNoturnasDoDia` do Financeiro e do espelho — nunca uma
 *   segunda conta) e converte em R$ com a `calcularAdicionalNoturno`. A média é sobre os
 *   meses que contam, não sobre 12.
 *
 * ⚠️ **A conversão usa o salário de HOJE para todos os meses.** O sistema não guarda
 * histórico de salário, então não há como saber quanto valia a hora em março. Na prática
 * isto é o que a contabilidade também faz quando não houve reajuste no ano; se houve, o
 * valor sai um pouco diferente. Está registrado, não escondido — e some no dia em que a
 * ficha guardar o histórico.
 */

import { horasNoturnasDoDia, type PontoComNoturno } from '../financeiroPorPessoa';
import { calcularAdicionalNoturno, type ConfiguracaoDaFolha } from './folhaCalc';
import {
  calcularDecimoTerceiro,
  mediaMensalNoAno,
  mesesComAvo,
  type DecimoCalculado,
  type ParcelaDoDecimo,
} from './decimoTerceiro';
import type { FichaParaFolha, TabelasParaFolha } from './folhaDaPessoa';

/** Um dia de ponto, com o mínimo que o 13º precisa. */
export interface PontoParaDecimo extends PontoComNoturno {
  date: string;
  status?: string | null;
  absence_justified?: boolean | null;
}

export interface EntradaDoDecimoDaPessoa {
  ficha: FichaParaFolha;
  ano: number;
  parcela: ParcelaDoDecimo;
  /** O ponto do ANO inteiro dessa pessoa. Vazio = sem faltas e sem noturno. */
  pontos: readonly PontoParaDecimo[];
  config: ConfiguracaoDaFolha;
  tabelas: TabelasParaFolha;
  /** O que a 1ª parcela já pagou, como foi GRAVADO. Só a 2ª usa. */
  jaPagoNaPrimeira?: number;
  /** Data de desligamento, quando houver — o ano para nela. */
  desligamento?: string | null;
}

export interface DecimoDaPessoa {
  /** `undefined` quando a pessoa não é mensalista com salário, ou não tem nenhum avo. */
  decimo?: DecimoCalculado;
  /** Por que não tem 13º — a tela mostra, em vez de esconder a pessoa. */
  motivo?: 'nao-e-mensalista' | 'sem-salario' | 'sem-avos';
}

export function decimoDaPessoa({
  ficha,
  ano,
  parcela,
  pontos,
  config,
  tabelas,
  jaPagoNaPrimeira,
  desligamento,
}: EntradaDoDecimoDaPessoa): DecimoDaPessoa {
  if (ficha.employment_type !== 'Carteira Assinada') return { motivo: 'nao-e-mensalista' };
  const salario = Number(ficha.monthly_salary ?? 0);
  if (salario <= 0) return { motivo: 'sem-salario' };

  const doAno = pontos.filter(p => (p.date ?? '').startsWith(`${ano}-`));

  const faltasInjustificadas = doAno
    .filter(p => p.status === 'absent' && !p.absence_justified)
    .map(p => p.date);

  const meses = mesesComAvo(ficha.hire_date, ano, faltasInjustificadas, desligamento);
  if (meses.length === 0) return { motivo: 'sem-avos' };

  // Horas noturnas mês a mês → adicional em R$ mês a mês → média dos meses que contam.
  const horasPorMes = new Map<number, number>();
  for (const p of doAno) {
    const mes = Number((p.date ?? '').slice(5, 7));
    if (!mes) continue;
    horasPorMes.set(mes, (horasPorMes.get(mes) ?? 0) + horasNoturnasDoDia(p));
  }
  const noturnoPorMes = new Map<number, number>();
  for (const [mes, horas] of horasPorMes) {
    noturnoPorMes.set(mes, calcularAdicionalNoturno(salario, horas));
  }

  return {
    decimo: calcularDecimoTerceiro({
      salarioMensal: salario,
      mediaDoNoturno: mediaMensalNoAno(noturnoPorMes, meses),
      avos: meses.length,
      parcela,
      jaPagoNaPrimeira,
      dependentes: ficha.family_allowance_children ?? 0,
      percentualFgts: config.percentualFgts,
      fgtsAtivo: ficha.fgts_enabled ?? false,
      tabelaInss: tabelas.inss ?? undefined,
      tabelaIrrf: tabelas.irrf ?? undefined,
      tabelasConfirmadas: tabelas.confirmadas,
    }),
  };
}
