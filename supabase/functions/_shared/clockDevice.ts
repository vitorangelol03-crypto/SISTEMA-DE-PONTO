/**
 * Ponto só no tablet da empresa (30/09/2026, roadmap item 3) — a parte PURA, usada pelas
 * edge functions employee-public-api e clock-in-validated e testada no vitest.
 *
 * Como o tablet prova que é "da empresa" (detalhe na migration 20260930034644):
 *   1. o 2626 gera no painel um CÓDIGO DE ATIVAÇÃO (8 símbolos, vale 15 min);
 *   2. no tablet, a tela de ponto troca o código por um SEGREDO guardado só nele;
 *   3. toda batida (e toda identificação sem CPF) leva o segredo; com a trava da empresa
 *      ligada, o servidor recusa quem não tem um segredo ATIVO que atenda aquela empresa.
 * O banco guarda só o sha256 do código e do segredo.
 */

/** 32 símbolos sem os que se confundem (I/1, O/0) — o mesmo alfabeto da função do banco. */
export const ALFABETO_DO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const MENSAGEM_APARELHO_NAO_AUTORIZADO =
  'Este aparelho não está autorizado. O ponto só pode ser registrado no tablet da empresa.';

/** "k7p2-9xqm" → "K7P29XQM". null se não sobrarem exatamente 8 símbolos do alfabeto. */
export function normalizarCodigoDeAtivacao(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const limpo = bruto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== 8) return null;
  for (const simbolo of limpo) {
    if (!ALFABETO_DO_CODIGO.includes(simbolo)) return null;
  }
  return limpo;
}

/** sha256 em hexadecimal minúsculo — igual a encode(extensions.digest(texto, 'sha256'), 'hex'). */
export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Segredo novo do tablet: 32 bytes aleatórios em base64url (43 caracteres). */
export function gerarSegredoDoTablet(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Formato mínimo de um segredo aceitável (evita ir ao banco com lixo). */
export function segredoTemFormatoValido(segredo: unknown): segredo is string {
  return typeof segredo === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(segredo);
}

export interface TabletAtivo {
  id: string;
  name: string;
  companyIds: string[];
  companyNames: string[];
}

/** Converte a linha das funções clock_device_resolve/clock_device_activate. */
export function tabletDaLinha(linha: unknown): TabletAtivo | null {
  if (!linha || typeof linha !== 'object') return null;
  const r = linha as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const ids = Array.isArray(r.company_ids) ? r.company_ids.filter((x): x is string => typeof x === 'string') : [];
  const nomes = Array.isArray(r.company_names) ? r.company_names.filter((x): x is string => typeof x === 'string') : [];
  if (ids.length === 0) return null;
  return { id: r.id, name: r.name, companyIds: ids, companyNames: nomes };
}

export type DecisaoDoAparelho =
  | { liberado: true }
  | { liberado: false; motivo: 'sem_tablet' | 'tablet_de_outra_empresa' };

/**
 * A regra em si. Trava desligada = sempre liberado (comportamento de antes). Trava ligada =
 * só um tablet ATIVO (resolvido pelo segredo) que atenda a empresa DO FUNCIONÁRIO.
 */
export function decidirAparelho(p: {
  travaLigada: boolean;
  tablet: TabletAtivo | null;
  companyId: string;
}): DecisaoDoAparelho {
  if (!p.travaLigada) return { liberado: true };
  if (!p.tablet) return { liberado: false, motivo: 'sem_tablet' };
  if (!p.tablet.companyIds.includes(p.companyId)) return { liberado: false, motivo: 'tablet_de_outra_empresa' };
  return { liberado: true };
}

/** O pedaço do cliente do Supabase que a resolução usa (rpc). */
export interface ClienteComRpc {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Resolve o segredo enviado pelo aparelho no tablet ATIVO correspondente (ou null).
 * Erro de banco LANÇA — quem chama decide; na trava ligada isso vira recusa (falha fechada).
 */
export async function resolverTablet(cliente: ClienteComRpc, segredo: unknown): Promise<TabletAtivo | null> {
  if (!segredoTemFormatoValido(segredo)) return null;
  const tokenHash = await sha256Hex(segredo);
  const { data, error } = await cliente.rpc('clock_device_resolve', { p_token_hash: tokenHash });
  if (error) throw new Error(`clock_device_resolve: ${error.message}`);
  const linha = Array.isArray(data) ? data[0] : data;
  return tabletDaLinha(linha);
}
