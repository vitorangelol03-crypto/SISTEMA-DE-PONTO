// Conferência automática de nota fiscal — funções PURAS (sem imports de runtime).
// Vive junto da edge fn (Deno importa via './nfCheck.ts') e é testada no vitest
// (tests/unit/nfCheck.spec.ts importa este arquivo direto — por isso: nada de
// APIs Deno/Node aqui, só string/number/RegExp).
//
// Regra de valor (provada na Fase 0 com as 18 notas reais de 26/07): a nota é
// emitida pelo valor do ESPELHO PUBLICADO (escopo grupo/individual + filtro de
// plataforma), não pelo total da quinzena. Os candidatos chegam prontos.

/** Entrada do valor esperado de UM espelho publicado (tudo já somado pelo chamador). */
export interface MirrorExpectedValueInput {
  /** Bruto (pacotes × taxa + Zapex) das plataformas que o espelho mostra. */
  grossInScope: number;
  /** Vales + perdas de quem o espelho cobre (o driver, ou o grupo inteiro). */
  deductions: number;
  /** Líquido persistido (total_net) das mesmas pessoas — já com vales/perdas abatidos. */
  netFull: number;
  /** O espelho tinha filtro de plataforma? */
  hasPlatformFilter: boolean;
  /** O espelho ABATEU os vales/perdas? (coluna include_deductions da publicação) */
  includeDeductions: boolean;
}

/**
 * Valor pelo qual o driver deve emitir a nota daquele espelho publicado.
 *
 * Regra (2026-07-27): a nota segue SEMPRE o "TOTAL A RECEBER" impresso no espelho.
 *  - sem filtro + com abate  -> total_net (é o espelho cheio de sempre);
 *  - com filtro + com abate  -> bruto das plataformas do filtro MENOS vales/perdas
 *    (era o furo antigo: a fn esperava o bruto e recusaria a nota certa de quem tem
 *    desconto — hoje nenhum publicado tem, mas a regra passa a bater sempre);
 *  - sem abate (parcial)     -> bruto puro, com ou sem filtro: os vales/perdas saem
 *    listados no espelho mas não entram no total.
 */
export function mirrorExpectedValue(i: MirrorExpectedValueInput): number {
  const round2 = (v: number) => Math.round(v * 100) / 100;
  if (!i.includeDeductions) return round2(i.grossInScope);
  if (!i.hasPlatformFilter) return round2(i.netFull);
  return round2(i.grossInScope - i.deductions);
}

export interface NfCheckInput {
  /** Texto extraído do PDF ('' ou curto demais = ilegível). */
  text: string;
  /** CNPJ do slot (tomador esperado), só dígitos. */
  expectedCnpj: string;
  /** Rótulo do CNPJ pra mensagem (ex.: "Shopee/Anjun/Loggi"). */
  expectedCnpjLabel: string;
  driverName: string;
  recebedorNome: string | null;
  /** label -> valor esperado (ex.: espelho_group_LOGGI: 238). Vazio = sem base p/ conferir valor. */
  valueCandidates: Record<string, number>;
  /** Tolerância em centavos (padrão 2 = ±R$ 0,02, só arredondamento). */
  toleranceCents?: number;
}

export interface NfCheckResult {
  status: 'ok' | 'divergente' | 'ilegivel';
  /** null = não deu pra conferir (ex.: sem espelho publicado) — NUNCA motiva recusa. */
  cnpjOk: boolean | null;
  valorOk: boolean | null;
  nomeOk: boolean | null;
  /** Quais candidatos de valor bateram (labels). */
  matchedCandidates: string[];
  /** Maiores valores achados na nota (p/ mensagem e auditoria). */
  foundValues: number[];
  /** CNPJs achados na nota (só dígitos, p/ auditoria). */
  foundCnpjs: string[];
  /** Motivos de recusa em português leigo (vazio quando status = ok). */
  reasons: string[];
}

/** Remove acentos, colapsa espaços, caixa alta. */
/**
 * O PDF veio sem texto legivel? (05/08/2026)
 *
 * MESMO limite que decide a recusa por "parece foto ou documento escaneado" logo
 * abaixo — exportado pra que o caminho que chama a IA use exatamente o mesmo
 * criterio. Se fossem dois numeros diferentes, existiria a faixa absurda em que a
 * IA nao e chamada e mesmo assim a nota e recusada por ilegivel.
 */
export function nfTextoIlegivel(text: string | null | undefined): boolean {
  return normText(text ?? '').length < 30;
}

/**
 * UMA NOTA POR VAGA (05/08/2026) — quais notas já enviadas ocupam a vaga do envio.
 *
 * Vaga = (espelho × CNPJ). O chamador já filtrou pelo CNPJ; aqui decide o espelho.
 *
 * A regra da nota LEGADA (`mirror_platform_key = null`, de antes de existir nota por
 * espelho) é a mesma do `nfSlots`: ela conta como enviada em QUALQUER espelho daquele
 * CNPJ. Tem que ser igual nos dois lados — se a tela dissesse "já enviada" e o envio
 * deixasse passar (ou o contrário), a nota apareceria em um lugar e sumiria no outro.
 *
 * ⚠️ Nota RECUSADA também ocupa: decisão do Victor ("eles só vão poder anexar outra
 * quando a atual for excluída"), diferente do print, onde recusado libera a vaga.
 */
export function notasQueOcupamVaga<T extends { mirror_platform_key: string | null }>(
  jaEnviadas: T[], mirrorKeyDoEnvio: string | null,
): T[] {
  return jaEnviadas.filter((f) => {
    const k = f.mirror_platform_key ?? null;
    if (k === mirrorKeyDoEnvio) return true;
    return mirrorKeyDoEnvio !== null && k === null;
  });
}

export function normText(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

export function formatCnpj(digits: string): string {
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/** CNPJs no texto (14 dígitos, com ou sem pontuação), normalizados pra só dígitos. */
export function findCnpjs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\s*\/?\s*\d{4}\s*-?\s*\d{2}\b/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length === 14) out.add(digits);
  }
  return [...out];
}

/** Valores monetários: 1.234,56 · 1234,56 · 1234.56 (formatos BR e ponto-decimal). */
export function findMoneyValues(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/\b\d+(?:\.\d{3})*,\d{2}\b/g)) {
    out.add(Math.round(parseFloat(m[0].replace(/\./g, '').replace(',', '.')) * 100) / 100);
  }
  for (const m of text.matchAll(/\b\d+\.\d{2}\b/g)) {
    out.add(Math.round(parseFloat(m[0]) * 100) / 100);
  }
  return [...out];
}

/**
 * Nome presente no texto? Aceita o nome completo ou "primeiro + segundo nome"
 * (nota do MEI costuma vir "12.345.678 FULANO DE TAL" ou abreviar o resto).
 */
export function nameMatches(name: string | null | undefined, normalizedText: string): boolean | null {
  if (!name || !name.trim()) return null;
  const n = normText(name);
  if (normalizedText.includes(n)) return true;
  const parts = n.split(' ').filter((p) => p.length > 1);
  if (parts.length >= 2 && normalizedText.includes(`${parts[0]} ${parts[1]}`)) return true;
  return false;
}

/**
 * O PDF enviado é o NOSSO ESPELHO em vez da nota fiscal? (05/08/2026)
 *
 * 🔴 ACHADO EM PRODUÇÃO: 4 arquivos de 2 entregadores (Romario e Thiago) eram o PDF do
 * espelho reenviado como se fosse a nota — e a conferência **validou os quatro sozinha**.
 * Faz sentido: ela procura o NOME, o CNPJ e o VALOR dentro do PDF, e o espelho tem
 * exatamente as três coisas (é o nosso documento, com o nome dele e o nosso CNPJ). Tanto
 * que bateu com TODOS os valores candidatos de uma vez — nota de verdade bate com um só.
 *
 * O cabeçalho "ESPELHO DE GRUPO" / "ESPELHO DE PAGAMENTO" é gerado só por nós
 * (utils/driverMirrorPdf), então não há risco de recusar nota legítima: nenhuma prefeitura
 * emite NFS-e com esse título.
 */
export function ehNossoEspelho(text: string | null | undefined): boolean {
  const t = (text ?? '').toUpperCase().replace(/\s+/g, ' ');
  return /ESPELHO DE (GRUPO|PAGAMENTO)/.test(t);
}

export function runNfCheck(input: NfCheckInput): NfCheckResult {
  const tolerance = (input.toleranceCents ?? 2) / 100;
  const base: Omit<NfCheckResult, 'status' | 'reasons'> = {
    cnpjOk: null, valorOk: null, nomeOk: null,
    matchedCandidates: [], foundValues: [], foundCnpjs: [],
  };

  const text = input.text ?? '';
  if (nfTextoIlegivel(text)) {
    return {
      ...base,
      status: 'ilegivel',
      reasons: [
        'Não conseguimos ler o conteúdo do PDF (parece foto ou documento escaneado). ' +
        'Envie o PDF original da nota, gerado pelo site/app do emissor.',
      ],
    };
  }

  // ⚠️ Antes de qualquer conferência: o espelho passaria em TODAS elas (tem o nome, o
  // nosso CNPJ e o valor). Recusa na hora, com a explicação do que fazer.
  if (ehNossoEspelho(text)) {
    return {
      ...base,
      status: 'divergente',
      reasons: [
        'Este arquivo é o ESPELHO que a gente te mandou, não a sua nota fiscal. ' +
        'Use o espelho só para saber o valor: emita a NOTA no site da prefeitura ' +
        'e envie aqui o PDF dela.',
      ],
    };
  }

  const ntext = normText(text);
  const reasons: string[] = [];

  // CNPJ do tomador
  const foundCnpjs = findCnpjs(text);
  const cnpjOk = input.expectedCnpj ? foundCnpjs.includes(input.expectedCnpj) : null;
  if (cnpjOk === false) {
    reasons.push(
      `A nota não foi emitida para o CNPJ ${formatCnpj(input.expectedCnpj)} (${input.expectedCnpjLabel}). ` +
      'Emita a nota contra esse CNPJ e envie de novo.'
    );
  }

  // Valor — só reprova quando EXISTE base de comparação e nada bateu.
  const foundValues = findMoneyValues(text);
  const candEntries = Object.entries(input.valueCandidates).filter(([, v]) => v > 0);
  let valorOk: boolean | null = null;
  const matchedCandidates: string[] = [];
  if (candEntries.length > 0) {
    for (const [label, expected] of candEntries) {
      if (foundValues.some((v) => Math.abs(v - expected) <= tolerance + 1e-9)) {
        matchedCandidates.push(label);
      }
    }
    valorOk = matchedCandidates.length > 0;
    if (!valorOk) {
      const biggest = foundValues.length ? Math.max(...foundValues) : null;
      const expectedShown = candEntries
        .map(([, v]) => v)
        .sort((a, b) => (biggest === null ? a - b : Math.abs(a - biggest) - Math.abs(b - biggest)))[0];
      reasons.push(
        `O valor da nota${biggest !== null ? ` (${fmtBRL(biggest)})` : ''} não bate com o valor do seu espelho ` +
        `(esperado: ${fmtBRL(expectedShown)}). Confira o espelho no app e emita a nota pelo valor certo.`
      );
    }
  }

  // Nome: driver OU recebedor cadastrado
  const driverMatch = nameMatches(input.driverName, ntext);
  const recebedorMatch = nameMatches(input.recebedorNome, ntext);
  const nomeOk = driverMatch === null && recebedorMatch === null ? null : Boolean(driverMatch || recebedorMatch);
  if (nomeOk === false) {
    const quem = input.recebedorNome
      ? `${input.driverName} ou ${input.recebedorNome} (recebedor cadastrado)`
      : input.driverName;
    reasons.push(
      `A nota deve estar no nome de ${quem}. ` +
      'Se quem emite a nota mudou, avise a CD pra atualizar o cadastro do recebedor.'
    );
  }

  const status: NfCheckResult['status'] = reasons.length > 0 ? 'divergente' : 'ok';
  return {
    ...base,
    status,
    cnpjOk,
    valorOk,
    nomeOk,
    matchedCandidates,
    foundValues: foundValues.sort((a, b) => b - a).slice(0, 8),
    foundCnpjs,
    reasons,
  };
}
