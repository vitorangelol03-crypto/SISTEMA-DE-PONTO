/**
 * INSS E IMPOSTO DE RENDA da folha de carteira assinada.
 *
 * ⚠️ LEIA ANTES DE CONFIAR NUM NÚMERO — e leia a história, porque ela é a lição:
 *
 * **Até 20/09/2026 as duas tabelas eram DERIVADAS dos 11 recibos reais de Julho/2026 da
 * contabilidade Arruda.** Reproduziam os 11 exatamente. Pareciam certas. Não eram: o
 * maior salário do gabarito era R$ 2.200, e acima de R$ 2.902 três das quatro faixas do
 * INSS e o teto estavam errados. Num salário de R$ 5.000 descontava R$ 493,18 no lugar
 * de R$ 501,51; num de R$ 9.500, R$ 1.070,67 quando o teto é R$ 988,08.
 *
 * 🔴 **Bater com o gabarito não é estar certo — é estar certo no pedaço que o gabarito
 * cobre.** Se este arquivo tiver uma só lição, é essa.
 *
 * **Em 21/09/2026 passaram a vir da fonte oficial:**
 * · INSS — Portaria Interministerial MPS/MF nº 13, de 09/01/2026, conferida em duas
 *   fontes independentes.
 * · IRRF — tabela de 2026 da Receita Federal, **mais a redução da Lei nº 15.270/2025**,
 *   que o sistema simplesmente não tinha: ele cobrava imposto de quem a lei isenta
 *   (R$ 312,89 de quem ganha R$ 5.000, que não deviam sair do bolso da pessoa).
 *
 * 🎯 **O MÉTODO É `base × alíquota − parcela a deduzir`**, e não a soma faixa a faixa.
 * Os dois são a mesma conta em teoria; na prática a parcela publicada é arredondada
 * (24,315 vira 24,32) e o meio centavo vira um centavo depois do truncamento. Trocar a
 * tabela pela oficial deixou o gabarito dos 11 recibos VERMELHO em 4 — e foi a parcela
 * a deduzir que devolveu os 11. Quando os dois discordam, vale o papel do contador.
 *
 * ⚠️ Uma divergência conhecida, no TETO: a fórmula dá R$ 988,08 e o material oficial
 * publica R$ 988,09 como contribuição máxima (o valor da soma faixa a faixa). É
 * inconsistência do próprio material. Fica o da fórmula. 📋 A confirmar com o contador.
 *
 * ⚠️ A redução da Lei 15.270 **só sai na folha do MÊS**: o 13º e as verbas da rescisão
 * são tributados à parte (decisão do Victor, 21/09). `calcularIrrf` só reduz se quem
 * chama pedir — o padrão é não reduzir.
 *
 * Nada disto é fonte oficial ainda: `confirmado` segue FALSO no banco e o recibo sai com
 * a tarja "VALORES EM CONFERÊNCIA" até a contabilidade do Victor olhar (decisão dele).
 *
 * O que vale em produção é a tabela do ano no banco (`payroll_tax_tables`), editável na
 * tela de Configurações. As constantes aqui embaixo são só o padrão de emergência.
 */
import { truncaCentavos } from './dinheiro';

/** Uma faixa da tabela progressiva. `ate` nulo = a última, sem teto. */
export interface FaixaDeImposto {
  ate: number | null;
  aliquota: number;
  /**
   * A "PARCELA A DEDUZIR" que a tabela oficial publica junto da alíquota.
   *
   * 🔴 NÃO É ENFEITE, e não dá na mesma que somar faixa a faixa. A parcela publicada é
   * ARREDONDADA (na 2ª faixa do INSS a conta exata dá 24,315 e a tabela traz 24,32), e
   * esse meio centavo vira um centavo inteiro depois do truncamento. Nos 11 recibos
   * reais da contabilidade do Victor: somando faixa a faixa erra 4; com a parcela a
   * deduzir acerta 11 de 11.
   *
   * Ausente = tabela antiga, sem a parcela: aí a conta volta a ser a soma progressiva.
   */
  deduzir?: number;
}

export interface TabelaDoInss {
  faixas: FaixaDeImposto[];
  /** Teto do salário de contribuição: acima disso o INSS para de crescer. */
  teto: number;
}

/**
 * REDUÇÃO do imposto apurado — Lei nº 15.270, de 26/11/2025, valendo desde janeiro/2026.
 *
 * Não é uma faixa nem um abatimento na base: é um desconto aplicado **sobre o imposto já
 * calculado**. Por isso não cabia na tabela como ela era, e virou um bloco à parte.
 *
 * Fica no BANCO (coluna `reducao`), não chumbado aqui, porque muda por lei — que é
 * exatamente a lição da tabela do INSS que ficou errada por três dias.
 */
export interface ReducaoDoIrrf {
  /** Até este rendimento, a redução zera o imposto. */
  ate: number;
  /** Teto da redução na primeira faixa (o imposto no ponto `ate`, pelo simplificado). */
  maxima: number;
  /** Termo fixo da faixa intermediária: `coef − taxa × rendimento`. */
  coef: number;
  taxa: number;
  /** Acima deste rendimento não há redução nenhuma. */
  limite: number;
}

export interface TabelaDoIrrf {
  faixas: FaixaDeImposto[];
  /** Quanto cada dependente abate da base (caminho das deduções legais). */
  deducaoPorDependente: number;
  /** Abatimento único do caminho simplificado. */
  descontoSimplificado: number;
  /** Redução da Lei 15.270/2025. Ausente = ano sem redução (e a conta fica como era). */
  reducao?: ReducaoDoIrrf | null;
}

/**
 * Soma progressiva: cada faixa incide só sobre a parte do valor que cai dentro dela.
 *
 * É o erro clássico de quem lê o recibo: a Camila aparece com "9,00%" e base 1.772,87,
 * mas paga 135,23 — 7,6% efetivos, não 9%. Os 9% valem só sobre o que passa da 1ª faixa.
 */
function somaProgressiva(valor: number, faixas: readonly FaixaDeImposto[]): number {
  let imposto = 0;
  let piso = 0;
  for (const faixa of faixas) {
    if (valor <= piso) break;
    const topo = faixa.ate ?? Infinity;
    const dentroDaFaixa = Math.min(valor, topo) - piso;
    if (dentroDaFaixa > 0) imposto += dentroDaFaixa * (faixa.aliquota / 100);
    piso = topo;
  }
  return imposto;
}

/**
 * O imposto pela tabela, do jeito que o papel da contabilidade calcula.
 *
 * Com `deduzir` na faixa: `valor × alíquota − parcela a deduzir` — o método que a
 * própria tabela oficial publica, e o que reproduz os 11 recibos reais.
 * Sem `deduzir`: cai na soma progressiva, pra tabela antiga continuar funcionando.
 *
 * Os dois são a MESMA conta em teoria; na prática discordam em 1 centavo porque a
 * parcela publicada é arredondada. Quando discordam, vale o papel.
 */
function impostoDaTabela(valor: number, faixas: readonly FaixaDeImposto[]): number {
  if (valor <= 0) return 0;
  const faixa = faixas.find((f) => f.ate === null || valor <= f.ate) ?? faixas[faixas.length - 1];
  if (!faixa) return 0;
  if (typeof faixa.deduzir === 'number') {
    return Math.max(0, valor * (faixa.aliquota / 100) - faixa.deduzir);
  }
  return somaProgressiva(valor, faixas);
}

/** A faixa em que o valor caiu — é o que a coluna "REFERÊNCIAS" do recibo imprime. */
export function faixaAplicada(valor: number, faixas: readonly FaixaDeImposto[]): number {
  let aplicada = faixas[0]?.aliquota ?? 0;
  for (const faixa of faixas) {
    if (faixa.ate === null || valor <= faixa.ate) return faixa.aliquota;
    aplicada = faixa.aliquota;
  }
  return aplicada;
}

/**
 * INSS sobre a base (salário + adicional noturno + férias, sem o salário família).
 *
 * O teto do salário de contribuição limita a BASE, não o imposto: quem ganha acima dele
 * contribui como se ganhasse o teto.
 */
export function calcularInss(base: number, tabela: TabelaDoInss): number {
  const valor = Math.max(0, Number(base) || 0);
  if (valor <= 0) return 0;
  const limitada = tabela.teto > 0 ? Math.min(valor, tabela.teto) : valor;
  return truncaCentavos(impostoDaTabela(limitada, tabela.faixas));
}

export interface ResultadoDoIrrf {
  base: number;
  /** O que sai do bolso da pessoa: já com a redução da Lei 15.270 abatida. */
  valor: number;
  /** Qual caminho ganhou — o recibo e a tela mostram, pra ninguém achar que é chute. */
  caminho: 'simplificado' | 'deducoes';
  /** Imposto pela tabela, ANTES da redução. Igual a `valor` nos anos sem redução. */
  valorSemReducao: number;
  /** Quanto a Lei 15.270 abateu. Zero quando não há redução. */
  reducao: number;
}

/**
 * Quanto a Lei 15.270/2025 abate do imposto já apurado.
 *
 * A redução olha o **rendimento tributável bruto** (o salário), não a base de cálculo —
 * é assim no exemplo oficial da Receita: Rita ganha R$ 6.000, a base dela é R$ 5.350,40,
 * e a redução usa os R$ 6.000.
 *
 * Nunca passa do imposto: ninguém recebe IRRF de volta pela folha.
 */
function reducaoDaLei(rendimento: number, imposto: number, reducao?: ReducaoDoIrrf | null): number {
  if (!reducao || imposto <= 0 || rendimento <= 0) return 0;
  if (rendimento <= reducao.ate) return Math.min(imposto, reducao.maxima);
  if (rendimento > reducao.limite) return 0;
  const bruta = reducao.coef - reducao.taxa * rendimento;
  return Math.min(imposto, truncaCentavos(bruta));
}

/**
 * IRRF sobre o que sobra depois do INSS.
 *
 * A lei deixa escolher entre o **desconto simplificado** (um abatimento único) e as
 * **deduções legais** (INSS + dependentes), e vale o que resultar em MENOS imposto —
 * decisão 2 do Victor, que é também o que a Receita manda.
 *
 * Desde 21/09/2026 aplica também a **redução da Lei 15.270/2025** sobre o imposto
 * apurado. Até então o sistema cobrava IRRF de quem a lei isenta: num salário de
 * R$ 5.000 descontava R$ 312,89 que não deviam sair do bolso da pessoa.
 *
 * ⚠️ A escolha do caminho é feita ANTES da redução, e é o certo: os dois caminhos
 * recebem a mesma redução (ela depende do rendimento, não da base), então o que dava
 * menos imposto continua dando menos.
 *
 * ⚠️ A REDUÇÃO SÓ SAI SE O CHAMADOR PEDIR (`incidenciaMensal`). O padrão é NÃO reduzir,
 * de propósito: a lei fala em "rendimentos sujeitos à incidência MENSAL", e o 13º e as
 * verbas da rescisão são tributados à parte. Decisão do Victor em 21/09 — e o padrão
 * conservador é o certo aqui, porque reduzir por engano faz a empresa recolher imposto
 * a MENOS, que é dívida; não reduzir por engano vira restituição na declaração.
 * Quem chamar de um lugar novo tem que dizer o que está calculando.
 *
 * 📋 Pendente de confirmação com o contador: se a redução vale no saldo de salário da
 * rescisão (que é rendimento do mês). Hoje NÃO aplica lá.
 */
export function calcularIrrf(
  baseBruta: number,
  inss: number,
  dependentes: number,
  tabela: TabelaDoIrrf,
  opcoes?: { incidenciaMensal?: boolean },
): ResultadoDoIrrf {
  const bruto = Math.max(0, Number(baseBruta) || 0);
  const contribuicao = Math.max(0, Number(inss) || 0);
  const filhos = Math.max(0, Math.trunc(Number(dependentes) || 0));

  const porDeducoes = Math.max(0, bruto - contribuicao - filhos * tabela.deducaoPorDependente);
  const porSimplificado = Math.max(0, bruto - tabela.descontoSimplificado);

  const impostoDeducoes = truncaCentavos(impostoDaTabela(porDeducoes, tabela.faixas));
  const impostoSimplificado = truncaCentavos(impostoDaTabela(porSimplificado, tabela.faixas));

  const [base, apurado, caminho]: [number, number, 'simplificado' | 'deducoes'] =
    impostoSimplificado <= impostoDeducoes
      ? [porSimplificado, impostoSimplificado, 'simplificado']
      : [porDeducoes, impostoDeducoes, 'deducoes'];

  const reducao = opcoes?.incidenciaMensal ? reducaoDaLei(bruto, apurado, tabela.reducao) : 0;
  return { base, caminho, valorSemReducao: apurado, reducao, valor: truncaCentavos(apurado - reducao) };
}

/**
 * TABELAS DE 2026 — valores OFICIAIS desde 21/09/2026, ainda **não conferidas com a
 * contabilidade do Victor**.
 *
 * 🔴 ATÉ 21/09 ESTAVAM ERRADAS. A versão anterior foi derivada dos 11 recibos reais e
 * acertava só até R$ 2.902 — justamente onde o gabarito parava (maior salário: R$ 2.200).
 * Acima disso errava: 3 das 4 faixas do INSS e o teto. Num salário de R$ 5.000 descontava
 * R$ 493,18 no lugar de R$ 501,51; num de R$ 9.500, R$ 1.070,67 no lugar de R$ 988,09.
 *
 * A lição: **bater com o gabarito não é o mesmo que estar certo** — é estar certo no
 * pedaço que o gabarito cobre.
 *
 * Estes números vêm da fonte oficial, conferidos em duas fontes independentes, e a
 * contribuição máxima que elas publicam (R$ 988,09) bate com o cálculo progressivo destas
 * faixas. Mesmo assim `confirmado` segue FALSO no banco e o recibo continua com a tarja
 * "VALORES EM CONFERÊNCIA": ninguém da contabilidade olhou ainda (decisão do Victor).
 *
 * Isto aqui é só o PADRÃO de emergência — o que vale é a tabela do ano no banco
 * (`payroll_tax_tables`), editável na tela de Configurações.
 */
export const TABELA_INSS_2026: TabelaDoInss = {
  // Portaria Interministerial MPS/MF nº 13, de 09/01/2026.
  faixas: [
    { ate: 1621.0, aliquota: 7.5, deduzir: 0 },
    { ate: 2902.84, aliquota: 9, deduzir: 24.32 },
    { ate: 4354.27, aliquota: 12, deduzir: 111.4 },
    { ate: 8475.55, aliquota: 14, deduzir: 198.49 },
  ],
  teto: 8475.55,
};

export const TABELA_IRRF_2026: TabelaDoIrrf = {
  faixas: [
    { ate: 2428.8, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 7.5, deduzir: 182.16 },
    { ate: 3751.05, aliquota: 15, deduzir: 394.16 },
    { ate: 4664.68, aliquota: 22.5, deduzir: 675.49 },
    { ate: null, aliquota: 27.5, deduzir: 908.73 },
  ],
  deducaoPorDependente: 189.59,
  descontoSimplificado: 607.2,
  // Lei 15.270/2025: até R$ 5.000 de salário o imposto zera; de R$ 5.000,01 a R$ 7.350
  // cai aos poucos; acima disso não há redução. Os R$ 312,89 não são um número solto —
  // é exatamente o imposto que a tabela dá em R$ 5.000 pelo caminho simplificado
  // (22,5% sobre 4.392,80 menos a parcela a deduzir), então a isenção fecha certinha.
  reducao: { ate: 5000, maxima: 312.89, coef: 978.62, taxa: 0.133145, limite: 7350 },
};
