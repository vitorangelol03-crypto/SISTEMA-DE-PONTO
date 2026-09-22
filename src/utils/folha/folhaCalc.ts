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

import { semanaDaData } from '../dateUtils';
import { truncaCentavos } from './dinheiro';
import {
  calcularInss,
  calcularIrrf,
  faixaAplicada,
  type TabelaDoInss,
  type TabelaDoIrrf,
} from './impostos';

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
  /**
   * Falta injustificada derruba TAMBÉM o descanso da semana (DSR)?
   *
   * Pela CLT, quem falta sem atestado perde o descanso semanal remunerado daquela
   * semana — na prática uma falta custa dois dias. Nasce **desligada** (decisão do
   * Victor, 18/09: quer as duas opções disponíveis, sem mudar nada sozinho).
   */
  dsrNaFaltaInjustificada: boolean;
}

/**
 * Valores de 2026, da FONTE OFICIAL: Portaria Interministerial MPS/MF nº 13, de
 * 09/01/2026 — cota de **R$ 67,54** por filho para quem recebe até **R$ 1.980,38**.
 *
 * 🔴 O teto estava **R$ 1.906,04** até 22/09/2026, e isso negava o salário família de
 * quem ganha entre 1.906,05 e 1.980,38 (R$ 67,54 por filho, por mês). Os 11 recibos do
 * gabarito nunca pegariam: todos eles têm salário de R$ 1.700 — a mesma armadilha da
 * tabela do INSS em 21/09. **Bater com o gabarito não é estar certo; é estar certo no
 * pedaço que o gabarito cobre.**
 *
 * ⚠️ Mudam por lei todo ano: a empresa altera na tela de Configurações, e o ano de
 * vigência aparece junto — sem atualizar, a folha sai errada em silêncio.
 */
export const CONFIGURACAO_DA_FOLHA_PADRAO: ConfiguracaoDaFolha = {
  percentualFgts: 8,
  cotaSalarioFamilia: 67.54,
  tetoSalarioFamilia: 1980.38,
  dsrNaFaltaInjustificada: false,
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
  /** Dias efetivamente pagos como salário: referência − faltas − DSR perdido − férias. */
  diasPagos: number;
  diasDeFalta: number;
  /** Descansos semanais perdidos por falta injustificada (0 com a chave desligada). */
  diasDeDsrPerdido: number;
  diasDeFerias: number;
  ferias: number;
  tercoDeFerias: number;
  salarioDoMes: number;
  adicionalNoturno: number;
  salarioFamilia: number;
  /** Soma das premiações do mês. Entra no líquido e em NENHUMA base. */
  premiacao: number;
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  /** O salário do contrato, que o rodapé do recibo imprime como "Salário base". */
  salarioBase: number;
  baseFgts: number;
  valorFgts: number;
  /** Remuneração que sofre INSS: salário + noturno + férias + 1/3, menos as faltas. */
  baseInss: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  /** Quanto a Lei 15.270/2025 abateu do imposto neste mês. Zero se não houve. */
  reducaoDoIrrf: number;
  /** Qual caminho do IRRF ganhou — o recibo mostra, pra ninguém achar que é chute. */
  caminhoDoIrrf: 'simplificado' | 'deducoes' | null;
  /** Falso = o recibo precisa sair com o aviso de "valores em conferência". */
  tabelasConfirmadas: boolean;
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
  /**
   * DATAS das faltas que descontam (as injustificadas). Falta com atestado não entra
   * aqui — ela não desconta nada, que é o ponto de existirem os dois tipos.
   *
   * São datas, e não uma contagem, por causa do DSR: duas faltas na MESMA semana
   * derrubam UM descanso só, e sem a data não dá pra saber que semana é.
   */
  faltasInjustificadas?: readonly string[];
  /** Dias de férias dentro deste mês. Saem do salário e viram linha própria. */
  diasDeFerias?: number;
  /**
   * PREMIAÇÕES do mês (19/09/2026) — prêmio, PLR, bonificação.
   *
   * Decisão do Victor: *"tem que ser premiação para sair como bônus e não gera imposto"*.
   * Então ela **entra no bolso da pessoa e em mais nada**: não soma na base do INSS, não
   * soma na do FGTS, não sofre IRRF. A pessoa recebe exatamente o valor digitado.
   *
   * Isto não é invenção: é o que a contabilidade dele já faz. No recibo real do Maycon
   * (salário 2.200 + noturno 115,78) a base do FGTS é **2.315,78** — a PLR que ele
   * recebeu ficou de fora. Mesmo tratamento do salário família.
   *
   * ⚠️ Vale para prêmio EVENTUAL e PLR. Prêmio pago todo mês de forma habitual a lei
   * entende como salário e aí integraria a base — se isso passar a acontecer, é decisão
   * nova, não um ajuste de código.
   */
  premiacoes?: readonly { descricao?: string; valor: number }[];
  /** Tabela do INSS do ano. Sem ela, o recibo sai sem a linha (como antes desta leva). */
  tabelaInss?: TabelaDoInss;
  /** Tabela do IRRF do ano. Idem. */
  tabelaIrrf?: TabelaDoIrrf;
  /**
   * As duas tabelas do ano já foram conferidas com a contabilidade?
   *
   * Falso faz o recibo sair com o aviso de "valores em conferência" (decisão 3 do
   * Victor). Nasce falso: o sistema não é fonte oficial antes de bater com o contador.
   */
  tabelasConfirmadas?: boolean;
}

/** Dias corridos do mês. `new Date(ano, mes, 0)` cai no último dia do mês pedido. */
const diasDoMes = (ano: number, mes: number): number => new Date(ano, mes, 0).getDate();

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

/**
 * O período pedido é um MÊS FECHADO (dia 1 até o último dia do mesmo mês)?
 *
 * A folha de carteira assinada é MENSAL: o salário, o salário família e — principalmente
 * — o INSS e o IRRF só existem sobre o mês inteiro, porque são progressivos. Calcular
 * "a parte da semana" daria um imposto menor do que o real, e somar as quatro semanas
 * NÃO fecharia com o recibo do mês.
 *
 * Por isso a folha só entra em papel de mês fechado (decisão do Victor, 19/09/2026,
 * opção "não mostra, avisa"). Num recorte menor — uma semana, uma quinzena — o papel sai
 * sem as linhas da folha e com o aviso de onde o salário aparece. O ponto, as faltas e
 * os descontos de erro continuam saindo normalmente: só o que é mensal fica de fora.
 *
 * Comparação pelo texto 'YYYY-MM-DD', sem `new Date(string)`: o parse de ISO puxa UTC e
 * já custou dia trocado neste projeto.
 */
export function ehMesInteiro(inicio: string, fim: string): boolean {
  const [anoI, mesI, diaI] = (inicio ?? '').split('-').map(Number);
  const [anoF, mesF, diaF] = (fim ?? '').split('-').map(Number);
  if (!anoI || !mesI || !diaI || !anoF || !mesF || !diaF) return false;
  if (anoI !== anoF || mesI !== mesF) return false;
  return diaI === 1 && diaF === diasDoMes(anoI, mesI);
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

/**
 * Quantos dias de férias caem DENTRO do período pedido.
 *
 * As férias de alguém podem começar num mês e terminar no outro; o recibo de cada mês
 * só pode contar os dias que são dele, senão a pessoa perderia salário duas vezes.
 * Conta pelo texto 'YYYY-MM-DD', sem `new Date(string)` (o parse de ISO puxa UTC e já
 * custou dia trocado neste projeto).
 */
export function diasDeFeriasNoPeriodo(
  ferias: readonly { start_date: string; end_date: string }[],
  inicio: string,
  fim: string,
): number {
  const dias = new Set<string>();
  for (const f of ferias) {
    const de = f.start_date > inicio ? f.start_date : inicio;
    const ate = f.end_date < fim ? f.end_date : fim;
    if (de > ate) continue;
    for (let d = new Date(`${de}T00:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
      dias.add(d.toISOString().slice(0, 10));
    }
  }
  return dias.size;
}

/**
 * Semanas distintas em que houve falta — é assim que o DSR se perde: a CLT tira o
 * descanso DA SEMANA, então duas faltas na mesma semana derrubam um descanso só.
 */
function semanasComFalta(datas: readonly string[]): number {
  const semanas = new Set<string>();
  for (const data of datas) {
    try {
      semanas.add(semanaDaData(data).segunda);
    } catch {
      // Data inválida não vira desconto silencioso: ignora pro DSR e segue.
    }
  }
  return semanas.size;
}

/**
 * COMO A FALTA E AS FÉRIAS ENTRAM NO PAPEL (decidido em 18/09/2026):
 *
 * - **Férias REDUZEM a linha do salário** e viram linha própria de provento. Tem que ser
 *   assim: se o salário continuasse cheio e as férias somassem por cima, a pessoa
 *   receberia duas vezes pelos mesmos dias.
 * - **Falta NÃO reduz a linha do salário** — ela sai como DESCONTO, com a quantidade de
 *   dias à vista. É a lição de 04/08/2026 (o desconto de erro que ninguém via): descontar
 *   escondido, reduzindo a referência, deixa o funcionário sem saber para onde foi o
 *   dinheiro. O gabarito da contabilidade reduz a referência; aqui a conta dá no mesmo e
 *   o papel explica.
 *
 * O desconto da falta nunca passa do salário do mês, então o líquido não fica negativo
 * por mais faltas que existam.
 */
export function calcularFolha({
  ficha,
  config,
  ano,
  mes,
  adicionalNoturno,
  faltasInjustificadas,
  diasDeFerias,
  premiacoes,
  tabelaInss,
  tabelaIrrf,
  tabelasConfirmadas,
}: EntradaDaFolha): FolhaCalculada {
  const dias = diasDeReferencia(ficha.admissao, ano, mes);
  const salarioBase = Math.max(0, Number(ficha.salarioMensal) || 0);
  const noturno = doisDecimais(Math.max(0, Number(adicionalNoturno) || 0));

  // Férias: saem do salário e viram provento próprio.
  const feriasDias = Math.min(dias, Math.max(0, Math.trunc(Number(diasDeFerias) || 0)));
  const diasDeSalario = Math.max(0, dias - feriasDias);
  const salarioDoMes = proporcional(salarioBase, diasDeSalario);
  const ferias = proporcional(salarioBase, feriasDias);
  // O 1/3 constitucional, em linha separada (decisão do Victor, 18/09: "sim").
  const tercoDeFerias = truncaCentavos(ferias / 3);

  // Falta: só a injustificada chega aqui. A com atestado não desconta nada.
  const datasDeFalta = Array.from(new Set(faltasInjustificadas ?? []));
  const diasDeFalta = Math.min(diasDeSalario, datasDeFalta.length);
  const dsrPerdido = config.dsrNaFaltaInjustificada ? semanasComFalta(datasDeFalta) : 0;
  const diasDeDsrPerdido = Math.min(Math.max(0, diasDeSalario - diasDeFalta), dsrPerdido);
  const diasPagos = Math.max(0, diasDeSalario - diasDeFalta - diasDeDsrPerdido);
  const descontoDeFaltas = doisDecimais(salarioDoMes - proporcional(salarioBase, diasPagos));

  /**
   * A premiação é somada ANTES das bases de propósito — para deixar claro, ao ler, que
   * ela existe e mesmo assim NÃO entra em nenhuma delas. Ver o comentário em
   * `EntradaDaFolha.premiacoes`.
   */
  const listaDePremios = (premiacoes ?? []).filter(p => Number(p.valor) > 0);
  const premiacao = doisDecimais(listaDePremios.reduce((soma, p) => soma + Number(p.valor), 0));

  const filhos = Math.max(0, Math.trunc(Number(ficha.filhosSalarioFamilia) || 0));
  const temDireito = filhos > 0 && salarioBase > 0 && salarioBase <= config.tetoSalarioFamilia;
  const salarioFamilia = temDireito
    ? proporcional(doisDecimais(config.cotaSalarioFamilia * filhos), dias)
    : 0;

  /**
   * A remuneração que os impostos enxergam: salário + adicional noturno + férias + 1/3,
   * menos o que a falta tirou. O salário família fica FORA — provado no recibo da Camila
   * (1.700,00 + 72,87 = 1.772,87, sem os 67,54), e é a mesma base que o papel imprime
   * como "Base INSS" e "Base FGTS".
   */
  const remuneracaoTributavel = doisDecimais(
    Math.max(0, salarioDoMes + noturno + ferias + tercoDeFerias - descontoDeFaltas),
  );

  // O FGTS é custo da empresa: entra no papel como informação e NÃO abate o líquido.
  // Depende da chave da ficha; o INSS, não — por isso são duas variáveis.
  const baseFgts = ficha.fgtsAtivo ? remuneracaoTributavel : 0;
  const valorFgts = truncaCentavos((baseFgts * config.percentualFgts) / 100);

  const baseInss = remuneracaoTributavel;
  const inss = tabelaInss ? calcularInss(baseInss, tabelaInss) : 0;
  /**
   * ⚠️ Dependentes do IRRF usam o MESMO campo do salário família. Não é a mesma coisa na
   * lei (o do salário família tem limite de idade e de renda; o do IR é mais largo), mas
   * a ficha só tem um campo. Registrado pra confirmar com o contador.
   */
  // `incidenciaMensal` liga a redução da Lei 15.270/2025. É o ÚNICO lugar que liga:
  // 13º e rescisão são tributados à parte (decisão do Victor, 21/09).
  const resultadoIrrf = tabelaIrrf
    ? calcularIrrf(baseInss, inss, ficha.filhosSalarioFamilia ?? 0, tabelaIrrf, { incidenciaMensal: true })
    : null;

  const linhas: LinhaDaFolha[] = [];
  if (salarioDoMes > 0) {
    linhas.push({
      descricao: 'Salário mensalista',
      referencia: formataReferencia(diasDeSalario),
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
  for (const premio of listaDePremios) {
    linhas.push({
      descricao: premio.descricao?.trim() ? `Premiação — ${premio.descricao.trim()}` : 'Premiação',
      provento: doisDecimais(Number(premio.valor)),
      desconto: 0,
    });
  }
  if (ferias > 0) {
    linhas.push({
      descricao: 'Férias',
      referencia: formataReferencia(feriasDias),
      provento: ferias,
      desconto: 0,
    });
  }
  if (tercoDeFerias > 0) {
    linhas.push({ descricao: '1/3 de férias', provento: tercoDeFerias, desconto: 0 });
  }
  if (descontoDeFaltas > 0) {
    linhas.push({
      descricao: 'Faltas',
      referencia: formataReferencia(diasDeFalta + diasDeDsrPerdido),
      provento: 0,
      desconto: descontoDeFaltas,
    });
  }
  if (inss > 0 && tabelaInss) {
    // A referência é a FAIXA alcançada, como no papel ("9,00%") — e não a porcentagem
    // que a pessoa paga no total, que é sempre menor por ser progressivo.
    linhas.push({
      descricao: 'INSS',
      referencia: `${formataReferencia(faixaAplicada(baseInss, tabelaInss.faixas))}%`,
      provento: 0,
      desconto: inss,
    });
  }
  if (resultadoIrrf && resultadoIrrf.valor > 0 && tabelaIrrf) {
    // Quando a Lei 15.270 abateu alguma coisa, o papel DIZ quanto — senão o contador vê
    // um imposto menor que o da tabela e não tem como saber de onde saiu a diferença.
    const faixa = `${formataReferencia(faixaAplicada(resultadoIrrf.base, tabelaIrrf.faixas))}%`;
    linhas.push({
      descricao: 'IRRF',
      referencia:
        resultadoIrrf.reducao > 0
          ? `${faixa} - reducao Lei 15.270 R$ ${formataReferencia(resultadoIrrf.reducao)}`
          : faixa,
      provento: 0,
      desconto: resultadoIrrf.valor,
    });
  }

  const totalProventos = doisDecimais(linhas.reduce((soma, l) => soma + l.provento, 0));
  const totalDescontos = doisDecimais(linhas.reduce((soma, l) => soma + l.desconto, 0));

  return {
    diasDeReferencia: dias,
    diasPagos,
    diasDeFalta,
    diasDeDsrPerdido,
    diasDeFerias: feriasDias,
    ferias,
    tercoDeFerias,
    salarioDoMes,
    adicionalNoturno: noturno,
    salarioFamilia,
    premiacao,
    totalProventos,
    totalDescontos,
    liquido: doisDecimais(totalProventos - totalDescontos),
    salarioBase,
    baseFgts,
    valorFgts,
    baseInss,
    inss,
    baseIrrf: resultadoIrrf?.base ?? 0,
    irrf: resultadoIrrf?.valor ?? 0,
    reducaoDoIrrf: resultadoIrrf?.reducao ?? 0,
    caminhoDoIrrf: resultadoIrrf?.caminho ?? null,
    tabelasConfirmadas: Boolean(tabelasConfirmadas),
    linhas,
  };
}
