import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Sub-fase 14.4.9: refator definitivo. Era Proxy + buildClient recriando
// client a cada setAuthToken → N instâncias de GoTrueClient → warning
// "Multiple GoTrueClient instances detected". Solução: UMA instância +
// fetch interceptor que lê o JWT custom de sessionStorage a CADA request.
// Sem rebuild, sem proxy, sem warning.

const TOKEN_STORAGE_KEY = 'sb-custom-token';

// Custom fetch: injeta Authorization Bearer <jwt> dinamicamente em cada
// request. Sempre lê do sessionStorage (source-of-truth) — assim mudanças
// via setAuthToken são imediatamente refletidas sem precisar rebuild.
const customFetch: typeof fetch = (input, init) => {
  let token: string | null = null;
  try {
    token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
  } catch { /* ignore */ }

  if (!token) {
    // Sem JWT custom → request usa apenas o anon key configurado pelo
    // Supabase JS (Authorization padrão Bearer <anon>).
    return fetch(input, init);
  }

  // Substitui Authorization pra Bearer <jwt custom>.
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

// UMA instância de SupabaseClient pro app inteiro.
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: 'sistema-ponto-gotrue',
  },
  global: {
    fetch: customFetch,
  },
});

/** Atualiza o JWT custom em sessionStorage. fetch interceptor pega na
 *  próxima call automaticamente — sem rebuild do client. */
export function setAuthToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Retorna o JWT custom atual (ou null se não logado). Usado por chamadas
 *  diretas a edge functions que precisam autorizar com o token do admin. */
export function getAuthToken(): string | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

/** Limpa o token (logout). */
export function clearAuthToken(): void {
  setAuthToken(null);
}
