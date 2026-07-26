-- =============================================================================
-- ALLOW MULTIPLE ERRORS PER DAY — error_records + triage_errors
-- =============================================================================
-- Pedido do Victor (26/07): poder lançar 2+ erros no MESMO dia pro mesmo
-- funcionário (misturando tipo 'quantity' e 'value'), e 2+ registros de
-- triagem no mesmo dia. Hoje o segundo lançamento SUBSTITUI o primeiro
-- porque o frontend usa upsert em cima destas travas de unicidade.
--
-- Contexto verificado em prod (26/07):
-- - error_records: UNIQUE (employee_id, date)  → error_records_employee_id_date_key
-- - triage_errors: UNIQUE (date, company_id)   → triage_errors_date_company_id_unique
--   (criada em 20260505202935_unique_triage_date_per_company.sql — superseded)
-- - RLS: policy ALL "rls_company_match_modify" em ambas — NÃO muda.
-- - Nenhuma função/trigger do banco referencia estas tabelas.
-- - Consumidores (Financeiro, C6, holerite, edge fn employee-public-api,
--   distribuição de triagem) somam por registro — funcionam com N linhas/dia.
--
-- ⚠️ ORDEM DE DEPLOY: aplicar SÓ DEPOIS do frontend novo (insert/update por id)
-- estar no ar. O painel antigo usa upsert com ON CONFLICT nestas constraints —
-- sem elas, o upsert falha (42P10) em qualquer registro de erro.
--
-- Rollback (só possível enquanto não houver 2 erros no mesmo dia lançados):
--   ALTER TABLE public.error_records
--     ADD CONSTRAINT error_records_employee_id_date_key UNIQUE (employee_id, date);
--   ALTER TABLE public.triage_errors
--     ADD CONSTRAINT triage_errors_date_company_id_unique UNIQUE (date, company_id);
-- =============================================================================

ALTER TABLE public.error_records
  DROP CONSTRAINT error_records_employee_id_date_key;

ALTER TABLE public.triage_errors
  DROP CONSTRAINT triage_errors_date_company_id_unique;
