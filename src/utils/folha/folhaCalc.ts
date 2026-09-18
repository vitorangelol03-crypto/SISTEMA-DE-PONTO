/**
 * FOLHA DE CARTEIRA ASSINADA — salário do mês, salário família e FGTS.
 *
 * Etapa 3 do `PLANO_FINANCEIRO_2026-09.md`, aprovada pelo Victor em 18/09/2026.
 * **Esta leva calcula só isto.** INSS, IRRF, férias, PLR e 13º ficam para a segunda
 * leva (decisão dele) — o recibo mostra a BASE do FGTS e do INSS, não o valor do INSS.
 *
 * Nada aqui toca o pagamento de diarista, que continua vindo de `payments` como sempre.
 *
 * AS REGRAS NÃO FORAM DEDUZIDAS: cada uma foi conferida contra os 12 recibos reais de
 * Julho/2026 que a contabilidade Arruda entregou ("569 - REC PGTO", sistema SCI), lidos
 * de dentro do PDF. O teste `tests/unit/folhaCalc.spec.ts` é esse gabarito.
 *
 *   · Salário do mês = salário ÷ 30 × dias, **sem passar do salário cheio** — o teto
 *     importa: Geandra e Miriane foram admitidas em 01/07 e têm 31 dias de referência;
 *     sem o limite receberiam 1.756,66 em vez dos 1.700,00 do papel.
 *   · Valor do FGTS = 8% da base, **truncado** em centavos, nunca arredondado — bate em
 *     12 de 12 recibos; arredondando para o mais próximo erraria em 4 (a Camila receberia
 *     141,83 no lugar dos 141,82 do papel).
 *   · Base do FGTS = salário do mês + adicional noturno. O salário família fica **fora**
 *     (Camila: 1.700,00 + 72,87 = 1.772,87, sem os 67,54) e a PLR também (Maycon).
 *   · Salário família = cota × filhos, proporcional aos dias no mês de admissão e também
 *     truncado (Vitoria, 2 cotas em 22 dias: 135,08 ÷ 30 × 22 = 99,058… → 99,05).
 *
 * ⚠️ UMA DIVERGÊNCIA CONHECIDA, do mês de admissão: o papel da Vitoria (admitida em
 * 10/07) dividiu o salário por 31 e não por 30, enquanto o do Fábio (admitido em 08/07,
 * mesmo mês) dividiu por 30. Os dois não cabem na mesma regra. Aqui ficou o ÷ 30, que é
 * o da CLT e o que bate em 11 dos 12 — **a confirmar com a contabilidade** antes de a
 * folha virar oficial. Está registrado no teste, não escondido.
 *
 * Mora fora do componente, como o `driverPayCalc`, pra poder ser testado sem React.
 */

/** O que a ficha do funcionário guarda de folha. Espelha as colunas novas de `employees`. */
export interface FichaDeFolha {
  /** Salário do contrato, cheio. 0 quando ninguém preencheu ainda. */
  salarioMensal: number;
  /** Quantos filhos dão direito à cota do salário família (digitado, decisão de 18/09). */
  filhosSalarioFamilia: number;
  /** FGTS é ligado POR PESSOA (decisão do Victor) — desligado não gera base nem valor. */
  fgtsAtivo: boolean;
  /** Admissão em 'YYYY-MM-DD'. Hoje só 3 de 98 fichas têm — sem ela, conta o mês inteiro. */
  admissao?: string | null;
}

/** O que a empresa configura, por ano de vigência. Nada disso é chumbado no código. */
export interface ConfiguracaoDaFolha {
  /** Porcentagem do FGTS sobre a base. A lei diz 8; fica configurável mesmo assim. */
  percentualFgts: number;
  /** Quanto vale cada cota do salário família. */
  cotaSalarioFamilia: number;
  /** Salário até o qual a pessoa tem direito à cota. Acima disso, não recebe. */
  tetoSalarioFamilia: number;
}

/**
 * Valores de 2026, conferidos no recibo de Julho/2026 (cota 67,54).
 * ⚠️ Mudam por lei todo ano: a empresa altera na tela de Configurações, e o ano de
 * vigência aparece junto — sem atualizar, a folha sai errada em silêncio.
 */
export const CONFIGURACAO_DA_FOLHA_PADRAO: ConfiguracaoDaFolha = {
  percentualFgts: 8,
  cotaSalarioFamilia: 67.54,
  tetoSalarioFamilia: 1906.04,
};

/** Uma linha impressa na tabela "Composição do Pagamento" do recibo. */
export interface LinhaDaFolha {
  descricao: string;
  /** Coluna "REFERÊNCIAS" do modelo: dias, quantidade de cotas, porcentagem. */
  referencia?: string;
  provento: number;
  desconto: number;
}

export interface FolhaCalculada {
  diasDeReferencia: number;
  salarioDoMes: number;
  adicionalNoturno: number;
  salarioFamilia: number;
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  /** O salário do contrato, que o rodapé do recibo imprime como "Salário base". */
  salarioBase: number;
  baseFgts: number;
  valorFgts: number;
  linhas: LinhaDaFolha[];
}

export interface EntradaDaFolha {
  ficha: FichaDeFolha;
  config: ConfiguracaoDaFolha;
  ano: number;
  /** Mês de 1 a 12. */
  mes: number;
  /** Vem do ponto do mês, já em dinheiro — a folha não recalcula hora. */
  adicionalNoturno: number;
}

/** Dias corridos do mês. `new Date(ano, mes, 0)` cai no último dia do mês pedido. */
const diasDoMes = (ano: number, mes: number): number => new Date(ano, mes, 0).getDate();

/**
 * Trunca em centavos.
 *
 * O arredondamento de 6 casas antes do corte NÃO é enfeite: `1700 / 30 * 21` dá
 * 1189.9999999999998 em ponto flutuante, e truncar direto pagaria R$ 1.189,99 no lugar
 * dos R$ 1.190,00 do recibo da Silvia — um centavo a menos numa folha de verdade.
 */
const truncaCentavos = (valor: number): number => {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  const semRuido = Number(valor.toFixed(6));
  return Math.floor(semRuido * 100) / 100;
};

const doisDecimais = (valor: number): number => Number(valor.toFixed(2));

const formataReferencia = (valor: number): string => valor.toFixed(2).replace('.', ',');

/**
 * Quantos dias o mês conta para esta pessoa.
 *
 * Quem já estava na empresa: 30 (o mês comercial da CLT, que é o que o recibo imprime
 * mesmo em julho, de 31 dias). Quem foi admitido no meio: da admissão até o último dia
 * do mês — é assim que o papel traz os 24 dias do Fábio (08/07) e os 22 da Vitoria (10/07).
 */
export function diasDeReferencia(
  admissao: string | null | undefined,
  ano: number,
  mes: number,
): number {
  const data = (admissao ?? '').trim();
  if (!data) return 30;

  // Comparação pelo texto 'YYYY-MM-DD', sem `new Date(string)`: o parse de ISO puxa UTC
  // e já custou dia trocado neste projeto.
  const [anoAdm, mesAdm, diaAdm] = data.split('-').map(Number);
  if (!anoAdm || !mesAdm || !diaAdm) return 30;

  const admitidaAntes = anoAdm < ano || (anoAdm === ano && mesAdm < mes);
  if (admitidaAntes) return 30;

  const admitidaDepois = anoAdm > ano || (anoAdm === ano && mesAdm > mes);
  if (admitidaDepois) return 0;

  return diasDoMes(ano, mes) - diaAdm + 1;
}

/** Proporcional aos dias, limitado ao valor cheio e truncado em centavos. */
const proporcional = (valorCheio: number, dias: number): number =>
  Math.min(valorCheio, truncaCentavos((valorCheio / 30) * dias));

/**
 * Jornada mensal usada pra achar o valor da hora: 220 horas (44h por semana), o padrão
 * da CLT para mensalista.
 *
 * ⚠️ NÃO foi possível provar contra o recibo da contabilidade: o gabarito traz o VALOR do
 * adicional, mas não as horas noturnas de onde ele saiu, e as 12 pessoas do papel não têm
 * ponto neste sistema. É o número padrão, não um número conferido — a confirmar com a
 * contabilidade antes de a folha virar oficial.
 */
export const HORAS_MENSAIS_CLT = 220;

/**
 * Adicional noturno em R$ para MENSALISTA: 20% sobre a hora, nas horas noturnas.
 *
 * Só carteira assinada usa isto (decisão do Victor, 18/09/2026). O diarista continua
 * como sempre — a conta dele vive no `clockOut`, a partir da diária, e não foi tocada.
 *
 * Por que não dava pra reaproveitar a conta do diarista: lá a hora sai da DIÁRIA dividida
 * pelas horas do dia; aqui sai do salário do mês dividido pela jornada mensal. São duas
 * contas diferentes para a mesma palavra.
 */
export function calcularAdicionalNoturno(
  salarioMensal: number,
  horasNoturnas: number,
  horasMensais: number = HORAS_MENSAIS_CLT,
): number {
  const salario = Math.max(0, Number(salarioMensal) || 0);
  const horas = Math.max(0, Number(horasNoturnas) || 0);
  if (salario <= 0 || horas <= 0 || horasMensais <= 0) return 0;
  return truncaCentavos((salario / horasMensais) * horas * 0.2);
}

export function calcularFolha({ ficha, config, ano, mes, adicionalNoturno }: EntradaDaFolha): FolhaCalculada {
  const dias = diasDeReferencia(ficha.admissao, ano, mes);
  const salarioBase = Math.max(0, Number(ficha.salarioMensal) || 0);
  const noturno = doisDecimais(Math.max(0, Number(adicionalNoturno) || 0));

  const salarioDoMes = proporcional(salarioBase, dias);

  const filhos = Math.max(0, Math.trunc(Number(ficha.filhosSalarioFamilia) || 0));
  const temDireito = filhos > 0 && salarioBase > 0 && salarioBase <= config.tetoSalarioFamilia;
  const salarioFamilia = temDireito
    ? proporcional(doisDecimais(config.cotaSalarioFamilia * filhos), dias)
    : 0;

  // O FGTS é custo da empresa: entra no papel como informação e NÃO abate o líquido.
  const baseFgts = ficha.fgtsAtivo ? doisDecimais(salarioDoMes + noturno) : 0;
  const valorFgts = truncaCentavos((baseFgts * config.percentualFgts) / 100);

  const linhas: LinhaDaFolha[] = [];
  if (salarioDoMes > 0) {
    linhas.push({
      descricao: 'Salário mensalista',
      referencia: formataReferencia(dias),
      provento: salarioDoMes,
      desconto: 0,
    });
  }
  if (noturno > 0) {
    linhas.push({ descricao: 'Adicional noturno', provento: noturno, desconto: 0 });
  }
  if (salarioFamilia > 0) {
    linhas.push({
      descricao: 'Salário família',
      referencia: formataReferencia(filhos),
      provento: salarioFamilia,
      desconto: 0,
    });
  }

  const totalProventos = doisDecimais(linhas.reduce((soma, l) => soma + l.provento, 0));
  const totalDescontos = doisDecimais(linhas.reduce((soma, l) => soma + l.desconto, 0));

  return {
    diasDeReferencia: dias,
    salarioDoMes,
    adicionalNoturno: noturno,
    salarioFamilia,
    totalProventos,
    totalDescontos,
    liquido: doisDecimais(totalProventos - totalDescontos),
    salarioBase,
    baseFgts,
    valorFgts,
    linhas,
  };
}
