// Conferência automática do ESPELHO DO APP (print da tela da Shopee) — funções
// PURAS, sem imports de runtime. Vive em _shared/ porque DUAS edge fns usam:
// `driver-public-api` (driver anexa pelo portal) e `driverpay-proof-admin`
// (operador anexa pelo painel). O vitest importa este arquivo direto
// (tests/unit/proofCheck.spec.ts) — por isso: nada de API Deno/Node aqui,
// só string/number/RegExp. Mesma regra do nfCheck.ts.
//
// O QUE ESTAMOS CONFERINDO (pedido do Victor, 04/08/2026): a planilha da Shopee
// pode vir com a quantidade de pacotes errada por driver. O driver manda o print
// da tela "Entrega" do app dele, que mostra duas coisas:
//   - o período selecionado  ->  "2026/07/01 - 2026/07/15"
//   - a aba Encerrado        ->  "Encerrado (1808)"  = pacotes entregues
// O sistema compara os dois com a quinzena que está sendo paga e com a planilha.
//
// ⚠️ REGRA DE PRIVACIDADE (decisão do Victor): o driver NÃO pode ver nenhuma
// informação nossa — nem quantos pacotes a planilha diz, nem que houve diferença.
// Por isso os motivos saem em DUAS listas:
//   - driverReasons   -> vai pra tela do driver. SÓ data errada ou print ilegível.
//   - internalReasons -> fica no painel. Aqui sim entra a diferença de quantidade.
// Diferença de quantidade JAMAIS entra em driverReasons. Há teste unitário
// dedicado a blindar isso.

/** O que a leitura da imagem devolveu (visionRead.ts monta isto). Campos crus: */
/** os normalizadores abaixo é que decidem se dá pra usar. */
export interface ProofReadingRaw {
  /** A leitora conseguiu enxergar a tela? */
  legivel?: unknown;
  /** Número da aba "Encerrado". Pode vir number, "1808", "1.808" ou "Encerrado (1808)". */
  entregues?: unknown;
  /** Início do período selecionado. ISO, BR ou com barras. */
  periodoInicio?: unknown;
  /** Fim do período selecionado. */
  periodoFim?: unknown;
}

export interface ProofCheckInput {
  /** null = a leitura falhou de vez (rede, chave, exceção). NUNCA recusa o driver. */
  reading: ProofReadingRaw | null;
  /** Quinzena que está sendo paga, YYYY-MM-DD. */
  periodStart: string;
  periodEnd: string;
  /** Pacotes que a planilha diz pra ESTE driver nesta plataforma. <= 0 = sem base. */
  expectedPackages: number;
  /** Rótulo humano da plataforma, pra mensagem interna (ex.: "SHOPEE"). */
  platformLabel: string;
  /** Folga aceita na quantidade. Padrão 0 = tem que bater exato (decisão do Victor). */
  tolerancePackages?: number;
}

export interface ProofCheckResult {
  /**
   * ok             -> bate tudo, pode marcar "espelho conferido" sozinho
   * divergente     -> quantidade diferente: ACEITA o print, mostra só pro painel
   * periodo_errado -> print de outra quinzena: RECUSA na hora, driver reenvia
   * ilegivel       -> não deu pra ler nada: RECUSA na hora, driver reenvia
   * pendente       -> a leitura falhou por culpa nossa: aceita e fica pra conferir na mão
   *
   * Quem RECUSA (HTTP 422) é o chamador, por `proofShouldReject(result)` — a regra
   * mora aqui embaixo pra não ficar espalhada entre as duas edge fns.
   */
  status: 'ok' | 'divergente' | 'periodo_errado' | 'ilegivel' | 'pendente';
  /** null = não deu pra conferir. false = período do print ≠ quinzena (RECUSA). */
  periodoOk: boolean | null;
  /** null = sem base de comparação (planilha sem pacote). false = quantidade diferente. */
  qtdOk: boolean | null;
  /** O que a leitura entendeu, já normalizado (vai pro banco e pro painel). */
  readPackages: number | null;
  readStart: string | null;
  readEnd: string | null;
  /** Motivos que o DRIVER pode ver. Só data errada / ilegível. Nunca quantidade. */
  driverReasons: string[];
  /** Motivos completos, só pro painel. */
  internalReasons: string[];
}

// ─── Normalizadores (blindagem: a leitora pode devolver formato torto) ────────

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** A data existe de verdade? (pega 31/02, 31/04 e 29/02 fora de bissexto) */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  const max = month === 2 && isLeap(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= max;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Ano-mês-dia (`2026-07-01`, `2026/07/01`) ou dia-mês-ano (`01/07/2026`). */
const DATE_TOKEN = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/g;

/**
 * Normaliza uma data pra `YYYY-MM-DD`. Aceita `2026-07-01`, `2026/07/01`,
 * `2026.07.01`, `01/07/2026`, `01-07-2026`. Desambigua pelo grupo de 4 dígitos:
 * se vem primeiro é ano-mês-dia, se vem por último é dia-mês-ano.
 *
 * ⚠️ TOLERA LIXO GRUDADO, mas NÃO chuta. Medido em 04/08 com o print real: o
 * modelo acerta a data e às vezes não fecha a string, devolvendo coisas como
 *   "2026-07-012026-07-01"                          (a mesma data repetida)
 *   "2026-07-01Pools and explicit string require..."  (raciocínio vazando)
 * Exigir que o campo fosse SÓ a data jogava fora leitura boa (1 em 8 no melhor
 * modelo). Então: extrai todas as datas da string e
 *   - nenhuma          -> null
 *   - todas iguais     -> usa (os dois casos acima caem aqui)
 *   - duas diferentes  -> null, é ambíguo (ex.: início e fim colados no mesmo
 *                         campo — não dá pra saber qual é qual, e chutar aqui
 *                         significaria recusar o driver pela data errada)
 */
export function parseProofDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim();
  if (!s) return null;

  const achadas = new Set<string>();
  for (const m of s.matchAll(DATE_TOKEN)) {
    // Grupos 1-3 = ano primeiro; grupos 4-6 = dia primeiro.
    const [y, mo, d] = m[1] !== undefined
      ? [Number(m[1]), Number(m[2]), Number(m[3])]
      : [Number(m[6]), Number(m[5]), Number(m[4])];
    if (!isRealDate(y, mo, d)) return null; // data impossível no meio = desiste
    achadas.add(`${y}-${pad2(mo)}-${pad2(d)}`);
  }

  return achadas.size === 1 ? [...achadas][0] : null;
}

/**
 * Um número: `1808` ou `1.808` (ponto SÓ como separador de milhar, em grupos de 3).
 * Espaço NÃO separa milhar de propósito — ver o comentário em `parseProofCount`.
 */
const NUM_TOKEN = /\d+(?:\.\d{3})+|\d+/g;

/**
 * Normaliza a quantidade de pacotes. Aceita `1808`, `"1808"`, `"1.808"` e o rótulo
 * inteiro `"Encerrado (1808)"`.
 *
 * ⚠️ Quando a string tem MAIS DE UM número (ex.: "Em Rota (0) ... Encerrado (1808)"),
 * só devolve valor se der pra identificar o de "Encerrado" — chutar o maior ou o
 * primeiro daria número errado em silêncio, que é pior que número nenhum.
 *
 * ⚠️ Espaço não é separador de milhar. A primeira versão aceitava `"1 808"` e com
 * isso lia `"0 1808"` (a tela mostra "Em Rota (0)" ao lado) como **1808** — o teste
 * pegou. Como a leitora devolve número inteiro e o app é pt-BR, o suporte a espaço
 * não valia o risco de gravar quantidade errada calado.
 */
export function parseProofCount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;

  const toInt = (g: string) => {
    const digits = g.replace(/\./g, '');
    if (!/^\d+$/.test(digits)) return null;
    const n = Number(digits);
    return Number.isSafeInteger(n) ? n : null;
  };

  const groups = s.match(NUM_TOKEN) ?? [];
  if (groups.length === 1) return toInt(groups[0]);

  // Vários números: só aceita se estiver rotulado como "Encerrado".
  const encerrado = s.match(/ENCERRAD[OA]\s*[:(]?\s*(\d+(?:\.\d{3})+|\d+)/i);
  return encerrado ? toInt(encerrado[1]) : null;
}

/** `2026-07-01` -> `01/07/2026` (é assim que a mensagem chega no driver). */
export function toBrDate(iso: string | null): string {
  if (!iso) return '?';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ─── A conferência ───────────────────────────────────────────────────────────

const MSG_ILEGIVEL =
  'Não consegui ler o print. Prefira tirar o print pelo próprio celular (botão de captura de tela) ' +
  'em vez de fotografar a tela de outro aparelho, e confira se aparecem a data do período no topo ' +
  'e o número que fica ao lado de "Encerrado". Depois envie de novo.';

export function runProofCheck(input: ProofCheckInput): ProofCheckResult {
  const tolerance = Math.max(0, input.tolerancePackages ?? 0);
  const base: Omit<ProofCheckResult, 'status' | 'driverReasons' | 'internalReasons'> = {
    periodoOk: null,
    qtdOk: null,
    readPackages: null,
    readStart: null,
    readEnd: null,
  };

  // 1) Falha nossa (rede/chave/exceção): nunca recusa ninguém. Fica pra conferir na mão.
  if (input.reading === null) {
    return {
      ...base,
      status: 'pendente',
      driverReasons: [],
      internalReasons: ['Não foi possível conferir automaticamente (falha na leitura). Confira na mão.'],
    };
  }

  const readPackages = parseProofCount(input.reading.entregues);
  const readStart = parseProofDate(input.reading.periodoInicio);
  const readEnd = parseProofDate(input.reading.periodoFim);
  const said = { ...base, readPackages, readStart, readEnd };

  // 2) Ilegível: a leitora avisou, ou faltou período, ou faltou a quantidade.
  //    Recusar aqui não vaza nada — não é informação nossa, é a foto que está ruim.
  const leitoraDisseIlegivel = input.reading.legivel === false;
  if (leitoraDisseIlegivel || readStart === null || readEnd === null || readPackages === null) {
    const faltou: string[] = [];
    if (readStart === null || readEnd === null) faltou.push('o período');
    if (readPackages === null) faltou.push('a quantidade de "Encerrado"');
    return {
      ...said,
      status: 'ilegivel',
      driverReasons: [MSG_ILEGIVEL],
      internalReasons: [
        leitoraDisseIlegivel
          ? 'A leitura não conseguiu enxergar a tela do app no print.'
          : `Não deu pra extrair ${faltou.join(' nem ')} do print.`,
      ],
    };
  }

  // 3) Período: tem que ser EXATAMENTE a quinzena que está sendo paga. Se o driver
  //    filtrou outro intervalo no app, o número dele é de outro período e não serve.
  //    Aqui a recusa é imediata — e o motivo pode ir pro driver (não é dado nosso).
  const periodoOk = readStart === input.periodStart && readEnd === input.periodEnd;
  if (!periodoOk) {
    return {
      ...said,
      status: 'periodo_errado',
      periodoOk: false,
      driverReasons: [
        `O print que você enviou é do período de ${toBrDate(readStart)} a ${toBrDate(readEnd)}, ` +
        `mas estamos pagando a quinzena de ${toBrDate(input.periodStart)} a ${toBrDate(input.periodEnd)}. ` +
        'No app, toque em "Selecionar data", escolha esse período e mande o print de novo.',
      ],
      internalReasons: [
        `Período do print (${toBrDate(readStart)} a ${toBrDate(readEnd)}) diferente da quinzena ` +
        `(${toBrDate(input.periodStart)} a ${toBrDate(input.periodEnd)}). Recusado na hora.`,
      ],
    };
  }

  // 4) Quantidade. Sem base de comparação (planilha sem pacote pra ele nesta
  //    plataforma) não reprova — mesma regra do valor na conferência de NF.
  if (!(input.expectedPackages > 0)) {
    return {
      ...said,
      status: 'ok',
      periodoOk: true,
      qtdOk: null,
      driverReasons: [],
      internalReasons: [
        `Sem quantidade na planilha pra conferir (${input.platformLabel}). Período confere.`,
      ],
    };
  }

  const diff = readPackages - input.expectedPackages;
  const qtdOk = Math.abs(diff) <= tolerance;
  if (!qtdOk) {
    // ⚠️ driverReasons VAZIO de propósito: o driver não pode saber que divergiu.
    return {
      ...said,
      status: 'divergente',
      periodoOk: true,
      qtdOk: false,
      driverReasons: [],
      internalReasons: [
        `${input.platformLabel}: a planilha diz ${input.expectedPackages} pacotes e o print mostra ` +
        `${readPackages} — ${diff > 0 ? `${diff} a mais` : `${Math.abs(diff)} a menos`} no print.`,
      ],
    };
  }

  return {
    ...said,
    status: 'ok',
    periodoOk: true,
    qtdOk: true,
    driverReasons: [],
    internalReasons: [],
  };
}

/**
 * O print deve ser RECUSADO na hora (HTTP 422, driver reenvia)?
 *
 * Só quando o problema é da FOTO — print de outra quinzena ou ilegível. Esses dois
 * o driver consegue resolver sozinho, e o motivo não revela nada nosso.
 *
 * Quantidade diferente NUNCA recusa: o print é aceito em silêncio e a divergência
 * aparece só no painel (decisão do Victor, 04/08). Falha nossa ('pendente') também
 * nunca recusa.
 */
export function proofShouldReject(result: ProofCheckResult): boolean {
  return result.status === 'ilegivel' || result.status === 'periodo_errado';
}

/**
 * Quantas leituras SEGUIDAS de "data errada" são precisas para APAGAR o print.
 *
 * 🔑 Por que não basta uma: em 04/08/2026 a IA leu a MESMA foto (do GESSILEY) duas
 * vezes com respostas diferentes — na 1ª disse 4049 pacotes no período 16-31/07
 * (data errada), na 2ª disse 3733 no período 01-15/07 (data certa). A planilha
 * esperava 3734, ou seja, a 2ª leitura era a correta e a 1ª foi invenção. Apagar
 * na primeira leitura teria destruído um print BOM.
 *
 * Decisão do Victor: recusa na hora (o entregador já é avisado e pode reenviar),
 * mas só apaga quando uma SEGUNDA leitura confirmar a data errada.
 */
export const PROOF_CONFIRMACOES_PARA_APAGAR = 2;

/**
 * Quantas leituras seguidas disseram "data errada", contando esta.
 * Qualquer outro veredito ZERA a contagem — inclusive 'pendente', porque falha
 * nossa (cota/rede) não é prova de nada sobre a foto.
 */
export function proofContarDataErrada(seguidasAntes: number, result: ProofCheckResult): number {
  const base = Number.isFinite(seguidasAntes) && seguidasAntes > 0 ? Math.floor(seguidasAntes) : 0;
  return result.status === 'periodo_errado' ? base + 1 : 0;
}

/** Já dá pra apagar? Só com data errada confirmada por leituras independentes. */
export function proofDeveApagar(result: ProofCheckResult, seguidasIncluindoEsta: number): boolean {
  return result.status === 'periodo_errado' && seguidasIncluindoEsta >= PROOF_CONFIRMACOES_PARA_APAGAR;
}

/**
 * O print está 100% conferido — é o que autoriza marcar "espelho conferido"
 * sozinho. Exige os DOIS positivos de verdade: `null` (sem base pra conferir)
 * não vale, do mesmo jeito que a conferência de NF só auto-valida com os três
 * checks explicitamente `true`.
 */
export function proofIsFullyConfirmed(result: ProofCheckResult): boolean {
  return result.status === 'ok' && result.periodoOk === true && result.qtdOk === true;
}

// ─── A FILA de reconferência ─────────────────────────────────────────────────
// Pedido do Victor (04/08): "o sistema tem que validar o máximo possível com a
// API; se ela cair, fica em fila esperando ela voltar ou ser validada manualmente".
//
// Por que a fila é necessária: no plano grátis a cota é de 20 leituras por dia
// POR MODELO. Numa leva de ~89 drivers a cota pode acabar no meio do caminho —
// e quem sobrou não pode virar trabalho manual só por causa disso. O print fica
// `pendente` e volta a ser tentado sozinho.

/** Depois disto, para de tentar sozinho e fica só a conferência manual. */
export const PROOF_MAX_ATTEMPTS = 8;

/**
 * Quanto esperar antes da próxima tentativa, em MINUTOS. `null` = desistiu.
 *
 * A escada é curta no começo (pico de demanda e queda de API passam rápido) e
 * cresce até 12h, que é o que atravessa a virada do dia — o momento em que a
 * cota diária reseta e a leitura volta a funcionar sozinha. Com 8 tentativas a
 * fila cobre uns 2 dias antes de desistir.
 */
export function proofRetryDelayMinutes(attempts: number): number | null {
  if (!Number.isFinite(attempts) || attempts < 0) return null;
  if (attempts >= PROOF_MAX_ATTEMPTS) return null;
  const escada = [15, 60, 180, 360, 720, 720, 720, 720];
  return escada[Math.min(attempts, escada.length - 1)];
}

/**
 * Este resultado deve voltar pra fila? Só o `pendente` — que é falha NOSSA
 * (cota, rede, API fora). Todo o resto já é resposta final:
 *   ok / divergente  -> conferiu, acabou;
 *   ilegivel / periodo_errado -> o problema é a foto, quem resolve é o driver
 *                                reenviando (tentar de novo daria o mesmo).
 */
export function proofShouldRequeue(result: ProofCheckResult | null, dataErradaSeguidas = 0): boolean {
  if (result === null || result.status === 'pendente') return true;
  // Data errada volta pra fila até uma SEGUNDA leitura confirmar — é o que autoriza
  // apagar. Sem isto, uma leitura ruim sozinha decidiria o destino do print.
  if (result.status === 'periodo_errado' && dataErradaSeguidas < PROOF_CONFIRMACOES_PARA_APAGAR) return true;
  return false;
}
