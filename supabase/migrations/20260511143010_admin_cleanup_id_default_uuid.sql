-- Fix latente descoberto na sub-fase 7.2: admin_cleanup_config.id tinha
-- DEFAULT 'default' (text constante), o que tornava o upsert por
-- onConflict:'company_id' impossível pra qualquer empresa nova — INSERT
-- tentaria id='default' (já ocupado por Caratinga) e violaria PK.
--
-- Fix: mudar default pra gen_random_uuid()::text. Caratinga preserva
-- id='default' atual (UPDATE não toca id). Novas empresas ganham UUID
-- único automaticamente em INSERT, sem precisar passar id no app.
--
-- Validação E2E executada em 2026-05-11 via MCP: lazy-create funciona
-- (PN ganhou row com id UUID válido), idempotência preservada (re-upsert
-- atualiza em vez de duplicar). Row de teste removida após validação.

ALTER TABLE public.admin_cleanup_config
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

COMMENT ON COLUMN public.admin_cleanup_config.id IS
  'PK textual. Default gen_random_uuid()::text desde 2026-05-11 — antes era constante "default" que impedia INSERT pra novas empresas. Caratinga preserva id="default" legado.';
