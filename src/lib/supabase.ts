import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Sub-fase 14.4.8: storageKey único por buildClient pra eliminar warning
// "Multiple GoTrueClient instances detected" que aparecia toda vez que o
// client era recriado (init + login + logout). GoTrueClient é instanciado
// internamente pelo createClient; se múltiplos compartilham a mesma
// storageKey (default 'sb-auth-token'), supabase-js warns. Como nós usamos
// JWT custom em sessionStorage separado ('sb-custom-token') e desabilitamos
// persistSession, a storageKey do GoTrueClient não é usada — qualquer valor
// único funciona. Counter monotônico garante unicidade.
// IMPORTANTE: declarado ANTES de _client porque buildClient lê esta var.
let _clientBuildCounter = 0;

function buildClient(token: string | null): SupabaseClient {
  const storageKey = `sistema-ponto-gotrue-${++_clientBuildCounter}`;
  const baseAuth = { persistSession: false, autoRefreshToken: false, storageKey };
  return createClient(supabaseUrl, supabaseKey, token
    ? {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: baseAuth,
      }
    : { auth: baseAuth });
}

// Sub-fase 11.3/11.1 — Client mutável pra trocar token em runtime.
// Singleton com Proxy: imports de `supabase` resolvem dinamicamente o client
// atual, mesmo se trocado após setAuthToken().
let _client: SupabaseClient = buildClient(null);

// Tenta restaurar token de sessionStorage (login anterior).
try {
  const saved = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sb-custom-token') : null;
  if (saved) _client = buildClient(saved);
} catch { /* ignore */ }

// Proxy: redirige all property access pro client atual.
// Bind nas funções pra preservar `this` correto.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    // deno-lint-ignore no-explicit-any
    const value = (_client as unknown as Record<PropertyKey, unknown>)[prop];
    if (typeof value === 'function') return value.bind(_client);
    return value;
  },
});

/** Atualiza o JWT custom usado em todas próximas calls Supabase. */
export function setAuthToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem('sb-custom-token', token);
    else sessionStorage.removeItem('sb-custom-token');
  } catch { /* ignore */ }
  _client = buildClient(token);
}

/** Retorna o JWT custom atual (ou null se não logado). Usado por chamadas
 *  diretas a edge functions que precisam autorizar com o token do admin. */
export function getAuthToken(): string | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sb-custom-token') : null;
  } catch {
    return null;
  }
}

/** Limpa o token (logout). */
export function clearAuthToken(): void {
  setAuthToken(null);
}
