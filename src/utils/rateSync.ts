/**
 * O valor por pacote que está GRAVADO no período bate com a config do driver?
 * (05/08/2026 — relato do Victor: *"na config está 2.50, no grupo 2.5, mas está 2 reais
 * a LOGGI e não altera"*.)
 *
 * ## O que estava acontecendo
 *
 * Quando a planilha entra, o valor por pacote é **carimbado** na linha (`rate_snapshot`) —
 * é o que congela o histórico das quinzenas fechadas. Mudar a config depois não volta
 * atrás sozinho, e isso é certo.
 *
 * O errado era o jeito de decidir quando o carimbo podia ser refeito: o sistema só
 * atualizava a linha que **ainda estava no valor antigo**, tratando qualquer outro valor
 * como "alguém escolheu esse preço nesta rota de propósito". No RODRIGO, a linha estava em
 * R$ 2,00 e a config dele **já era** R$ 2,50 — então o sistema concluía "isso foi
 * combinado" e preservava para sempre. Salvar o perfil não mexia, aplicar o grupo também
 * não. Medido: **12 linhas de LOGGI travadas em R$ 2,00** (o padrão da plataforma) contra
 * config de 2,20/2,50/3,00 — R$ 300,00 a menos numa quinzena só.
 *
 * ## O desenho novo
 *
 * A conta aqui só **mostra a divergência**. Quem decide é quem está na tela: o painel lista
 * rota por rota (de → para) e pede confirmação antes de gravar. Assim o valor volta a ser
 * editável **sem** virar efeito colateral invisível de salvar um PIX — que é justamente o
 * risco de sincronizar sozinho: existem 3 linhas em produção com preço combinado por rota
 * (rotas "Dom Lara", "Coleta", "LOGGI QUARTEL"), e elas não podem ser atropeladas.
 */

/** O mínimo de uma rota pra esta conta (mesma forma do `RouteLine` da grade). */
export interface RotaComTaxa {
  route: string;
  packages: Record<string, number>;
  /** Valor gravado no pacote daquela rota (rate_snapshot). Ausente = segue a config. */
  rates: Record<string, number>;
}

/** Uma linha cujo valor gravado difere da config do driver. */
export interface LinhaForaDaConfig {
  route: string;
  platformName: string;
  packages: number;
  /** Valor que está valendo hoje naquela linha. */
  de: number;
  /** Valor que a config do driver manda. */
  para: number;
}

const emCentavos = (v: number) => Math.round(Number(v) * 100);

/**
 * Quais linhas do período estão com valor diferente da config do driver.
 *
 * `config` é o `ratesByPlatform` da grade: a config do perfil, ou o padrão da plataforma
 * quando ele não tem config própria. Linha **sem** valor gravado já segue a config — não
 * aparece aqui. Linha com **zero pacote** também não: não muda dinheiro nenhum e só faria
 * a confirmação virar uma parede de texto.
 */
export function linhasForaDaConfig(
  rotas: readonly RotaComTaxa[],
  config: Readonly<Record<string, number>>,
): LinhaForaDaConfig[] {
  const fora: LinhaForaDaConfig[] = [];
  for (const rl of rotas) {
    for (const [platformName, pacotes] of Object.entries(rl.packages)) {
      if ((pacotes ?? 0) <= 0) continue;
      const gravado = rl.rates[platformName];
      if (gravado === undefined || gravado === null) continue; // já segue a config
      const daConfig = config[platformName];
      if (daConfig === undefined || daConfig === null) continue; // plataforma sem config
      if (emCentavos(gravado) === emCentavos(daConfig)) continue;
      fora.push({ route: rl.route, platformName, packages: pacotes, de: gravado, para: daConfig });
    }
  }
  return fora;
}

/** Quanto o total a receber do driver muda se todas as linhas forem sincronizadas. */
export function diferencaEmReais(linhas: readonly LinhaForaDaConfig[]): number {
  const centavos = linhas.reduce(
    (soma, l) => soma + l.packages * (emCentavos(l.para) - emCentavos(l.de)),
    0,
  );
  return centavos / 100;
}
