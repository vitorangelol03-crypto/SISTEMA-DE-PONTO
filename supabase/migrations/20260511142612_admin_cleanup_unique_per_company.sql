-- TECH_DEBT 6.16 (sub-fase 7.2): admin_cleanup_config singleton-de-fato
-- sem UNIQUE(company_id).
--
-- Tabela funciona como singleton (1 row por empresa) na prática: getter usa
-- `.limit(1).maybeSingle()` sem filtro por company_id, e estado real em prod
-- tem 1 row pra Caratinga + 0 pra Ponte Nova. Adicionar UNIQUE permite
-- migrar para `upsert(onConflict: 'company_id')` no service, viabilizando
-- lazy-create automático para novas empresas.
--
-- Pre-check via MCP em 2026-05-11: 0 duplicatas a tratar.

ALTER TABLE public.admin_cleanup_config
  ADD CONSTRAINT admin_cleanup_config_company_id_key UNIQUE (company_id);

COMMENT ON CONSTRAINT admin_cleanup_config_company_id_key ON public.admin_cleanup_config IS
  'Garante 1 row por empresa — multi-empresa singleton-de-fato (TECH_DEBT 6.16). Pre-check em 2026-05-11 confirmou 0 duplicatas em prod (Caratinga 1 row, PN 0 rows).';
