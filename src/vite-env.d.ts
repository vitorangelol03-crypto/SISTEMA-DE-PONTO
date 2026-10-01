/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Etiqueta única deste build (vite.config.ts → etiquetaDaVersao). Não existe nos testes unitários. */
declare const __VERSAO_DO_APP__: string;
