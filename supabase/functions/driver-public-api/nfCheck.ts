// Conferência automática de nota fiscal — funções PURAS (sem imports de runtime).
// Vive junto da edge fn (Deno importa via './nfCheck.ts') e é testada no vitest
// (tests/unit/nfCheck.spec.ts importa este arquivo direto — por isso: nada de
// APIs Deno/Node aqui, só string/number/RegExp).
//
// Regra de valor (provada na Fase 0 com as 18 notas reais de 26/07): a nota é
// emitida pelo valor do ESPELHO PUBLICADO (escopo grupo/individual + filtro de
// plataforma), não pelo total da quinzena. Os candidatos chegam prontos.

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

export function runNfCheck(input: NfCheckInput): NfCheckResult {
  const tolerance = (input.toleranceCents ?? 2) / 100;
  const base: Omit<NfCheckResult, 'status' | 'reasons'> = {
    cnpjOk: null, valorOk: null, nomeOk: null,
    matchedCandidates: [], foundValues: [], foundCnpjs: [],
  };

  const text = input.text ?? '';
  if (normText(text).length < 30) {
    return {
      ...base,
      status: 'ilegivel',
      reasons: [
        'Não conseguimos ler o conteúdo do PDF (parece foto ou documento escaneado). ' +
        'Envie o PDF original da nota, gerado pelo site/app do emissor.',
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
