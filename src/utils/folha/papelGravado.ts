/**
 * LER o papel que foi gravado — nunca recalcular (19/09/2026).
 *
 * O 13º e a rescisão guardam o cálculo inteiro na coluna `papel` (migration
 * `20260920023702`). Tanto a 2ª via quanto o relatório leem dali: recalcular um acerto
 * velho com o salário de hoje faria o número discordar do papel que a pessoa assinou.
 *
 * ## O caminho de segurança
 *
 * Se o `papel` vier vazio — um registro gravado antes de a coluna existir —, estas
 * funções montam um bloco MÍNIMO a partir dos valores que sempre foram gravados, com uma
 * linha só. O detalhe se perde; **o dinheiro, não**. Sumir com a verba do relatório
 * porque falta o detalhe seria pior: o total deixaria de fechar e ninguém saberia por quê.
 */

import type { DecimoCalculado, ParcelaDoDecimo } from './decimoTerceiro';
import type { MotivoDaRescisao, RescisaoCalculada } from './rescisao';

/** Tem cara de bloco gravado com o papel inteiro? */
function temPapel(papel: unknown): papel is { linhas: unknown[] } {
  return Boolean(
    papel
    && typeof papel === 'object'
    && Array.isArray((papel as { linhas?: unknown }).linhas)
    && (papel as { linhas: unknown[] }).linhas.length > 0,
  );
}

/** Os valores que as tabelas sempre gravaram, mesmo antes da coluna `papel`. */
export interface RegistroDoDecimo {
  parcela: ParcelaDoDecimo;
  avos: number;
  base: number;
  bruto: number;
  inss: number;
  irrf: number;
  fgts: number;
  adiantamento: number;
  valor: number;
  papel?: unknown;
}

export function decimoDoRegistro(r: RegistroDoDecimo): DecimoCalculado {
  if (temPapel(r.papel)) return r.papel as unknown as DecimoCalculado;

  const rotulo = r.parcela === 'primeira' ? 'Adiantamento do 13º salário'
    : r.parcela === 'segunda' ? '13º salário (2ª parcela)'
      : '13º salário';

  return {
    avos: r.avos,
    base: r.base,
    bruto: r.bruto,
    parcela: r.parcela,
    brutoDaParcela: r.valor,
    inss: r.inss,
    irrf: r.irrf,
    baseIrrf: 0,
    caminhoDoIrrf: null,
    adiantamento: r.adiantamento,
    valor: r.valor,
    fgts: r.fgts,
    totalProventos: r.valor,
    totalDescontos: 0,
    liquido: r.valor,
    tabelasConfirmadas: true,
    parcelaNegativa: false,
    // Uma linha só, com o líquido: o detalhe se perdeu, o dinheiro não.
    linhas: [{ descricao: rotulo, referencia: `${r.avos.toFixed(2).replace('.', ',')}/12`, provento: r.valor, desconto: 0 }],
  };
}

export interface RegistroDaRescisao {
  motivo: MotivoDaRescisao | string;
  dias_de_aviso: number;
  anos_de_casa: number;
  data_de_saida: string;
  inss: number;
  irrf: number;
  inss_decimo: number;
  irrf_decimo: number;
  total_proventos: number;
  total_descontos: number;
  liquido: number;
  papel?: unknown;
}

export function rescisaoDoRegistro(r: RegistroDaRescisao): RescisaoCalculada {
  if (temPapel(r.papel)) return r.papel as unknown as RescisaoCalculada;

  return {
    motivo: r.motivo as MotivoDaRescisao,
    diasDeAviso: r.dias_de_aviso,
    dataProjetada: r.data_de_saida,
    anosDeCasa: r.anos_de_casa,
    saldoDeSalario: 0,
    diasDeSaldo: 0,
    avisoPrevio: 0,
    avisoDescontado: 0,
    decimoProporcional: 0,
    avosDoDecimo: 0,
    feriasVencidas: 0,
    tercoDasVencidas: 0,
    diasDeFeriasVencidas: 0,
    feriasProporcionais: 0,
    tercoDasProporcionais: 0,
    diasDeFeriasProporcionais: 0,
    multaFgts: 0,
    baseInss: 0,
    inss: r.inss,
    baseIrrf: 0,
    irrf: r.irrf,
    inssDoDecimo: r.inss_decimo,
    irrfDoDecimo: r.irrf_decimo,
    totalProventos: r.total_proventos,
    totalDescontos: r.total_descontos,
    liquido: r.liquido,
    fgtsDoMes: 0,
    tabelasConfirmadas: true,
    multaSemSaldoInformado: false,
    // Uma linha de provento e uma de desconto: o total continua fechando.
    linhas: [
      { descricao: 'Rescisão (acerto)', provento: r.total_proventos, desconto: 0 },
      ...(r.total_descontos > 0
        ? [{ descricao: 'Descontos da rescisão', provento: 0, desconto: r.total_descontos }]
        : []),
    ],
    ferias: {
      semAdmissao: false, periodos: [], diasCheios: 0, diasComFaltas: 0,
      proporcionalCheio: 0, proporcionalComFaltas: 0, diasGozados: 0,
      saldoCheio: 0, saldoComFaltas: 0, vencimento: null, vencida: false, perto: false,
    },
  };
}
