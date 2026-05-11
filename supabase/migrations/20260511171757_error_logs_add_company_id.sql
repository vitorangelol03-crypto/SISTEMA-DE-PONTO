-- Sub-fase 7.4 (TECH_DEBT 6.24): error_logs sem company_id.
-- Tabela funciona como singleton-de-fato (sem isolamento por empresa).
-- Adicionar company_id permite auditoria multi-empresa em produção.
--
-- Coluna NULLABLE pra cobrir 2 cenários:
--   1. Erros disparados pré-login (sem contexto de empresa) → company_id=NULL.
--   2. Erros em fluxos globais (cron, batch jobs) → company_id=NULL.
-- FK com ON DELETE SET NULL: se empresa for removida, logs preservados.
--
-- Pre-checks via MCP em 2026-05-11:
--   - Schema atual confirmado SEM company_id.
--   - 0 rows em prod (tabela nunca foi escrita) → migration sem backfill.
--
-- Validações pós-deploy:
--   - information_schema.columns confirma company_id nullable=YES, uuid
--   - pg_constraint confirma FK ON DELETE SET NULL → companies(id)
--   - Index idx_error_logs_company_id criado pra queries filtradas

ALTER TABLE public.error_logs
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_company_id ON public.error_logs(company_id);

COMMENT ON COLUMN public.error_logs.company_id IS
  'FK opcional pra companies — sub-fase 7.4. NULL = erro pré-login ou fluxo global sem contexto de empresa.';
