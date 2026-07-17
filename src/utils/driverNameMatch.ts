/**
 * Normalizacao e casamento de nomes de entregador vindos das planilhas com os
 * drivers cadastrados. Cada plataforma escreve o nome diferente:
 *   - iMile:  nome completo (as vezes com ":" ou espacos)   -> "Romario Alves Dornelas"
 *   - Shopee: "codigo-NOME", as vezes com lixo               -> "108810-WINGLISON..." / "87191-XPT (DUTRA) GERSON..."
 *   - Anjun:  login grudado                                   -> "RomarioAlvesD101" / "LUANKALLEBD101"
 *
 * Limpamos o nome (tira codigo-hifen, sufixo D101/101, "XPT (…)", acento) e casamos
 * por tokens. O que casa com certeza vira automatico; o resto vai para conferencia
 * manual (popup) e o vinculo escolhido vira ALIAS aprendido (driverpay_driver_aliases),
 * reconhecido automaticamente nas proximas importacoes.
 *
 * 100% puro (sem React/Supabase) para ser testavel.
 */

/** Preposicoes/conectores ignorados no casamento por tokens. */
const STOPWORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'di']);

/**
 * Quebra o nome em tokens "fortes" para casamento e para a chave de alias.
 * Remove: prefixo "12345-" (Shopee), conteudo entre parenteses, "XPT", camelCase
 * grudado (RomarioAlves -> romario alves), sufixos numericos/D101, acentos.
 */
export function driverTokens(raw: string): string[] {
  let s = String(raw ?? '');
  s = s.replace(/^\s*\d+\s*-\s*/, ''); // "108810-" (Shopee)
  s = s.replace(/\(.*?\)/g, ' '); // "(DUTRA)", "(Cordeiro)"
  s = s.replace(/\bxpt\b/gi, ' '); // "XPT"
  s = s.replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, '$1 $2'); // camelCase: RomarioAlves -> Romario Alves
  s = s.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2'); // "D101" -> "D 101"
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  return s
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t) && !/^\d+$/.test(t) && t !== 'd');
}

/** Chave normalizada estavel para gravar/consultar alias (tokens fortes juntos). */
export function normalizeDriverName(raw: string): string {
  return driverTokens(raw).join(' ');
}

export interface DriverCandidate {
  id: string;
  name: string;
}
export interface DriverAlias {
  alias_norm: string;
  driver_id: string;
}

export type MatchStatus = 'matched' | 'ambiguous' | 'new';

export interface DriverMatch {
  /** Nome como veio na planilha. */
  driverRaw: string;
  /** Chave normalizada (para gravar como alias se o usuario vincular). */
  norm: string;
  status: MatchStatus;
  /** Preenchido quando status = 'matched'. */
  driverId?: string;
  /** Ids candidatos quando status = 'ambiguous' (homonimos / varios possiveis). */
  candidateIds?: string[];
  /** true quando o match veio da caderneta de apelidos (ja aprendido). */
  fromAlias?: boolean;
}

/**
 * Casa um nome de entregador com um driver cadastrado.
 *  1) se ha alias aprendido para a chave normalizada -> matched (fromAlias);
 *  2) senao, casa por tokens (todos os tokens do raw contidos no cadastrado):
 *       exatamente 1 -> matched; varios -> ambiguous; nenhum -> new.
 */
export function matchDriver(
  driverRaw: string,
  drivers: DriverCandidate[],
  aliases: DriverAlias[] = [],
): DriverMatch {
  const norm = normalizeDriverName(driverRaw);

  const alias = aliases.find((a) => a.alias_norm === norm);
  if (alias) return { driverRaw, norm, status: 'matched', driverId: alias.driver_id, fromAlias: true };

  const qt = driverTokens(driverRaw);
  if (qt.length === 0) return { driverRaw, norm, status: 'new' };

  const hitIds = new Set<string>();
  for (const d of drivers) {
    const dt = new Set(driverTokens(d.name));
    if (qt.every((t) => dt.has(t))) hitIds.add(d.id);
  }
  const ids = [...hitIds];
  if (ids.length === 1) return { driverRaw, norm, status: 'matched', driverId: ids[0] };
  if (ids.length > 1) return { driverRaw, norm, status: 'ambiguous', candidateIds: ids };
  return { driverRaw, norm, status: 'new' };
}
