-- triage_error_distributions: nenhum lugar no cliente lê value_per_error/total_deducted
-- (confirmado por grep — só period_start/period_end são lidos, direto da tabela crua, em
-- getTriageDistributionsForEmployees). Não precisa de function: REVOKE só nas colunas
-- de dinheiro + GRANT nas colunas seguras resolve (sem view no meio, sem o problema do
-- security_invoker de hoje).
REVOKE SELECT ON public.triage_error_distributions FROM authenticated;
GRANT SELECT (id, period_start, period_end, total_errors, total_employees, distributed_by,
  distributed_at, observations, company_id) ON public.triage_error_distributions TO authenticated;

-- View de hoje (triage_error_distributions_v) nunca foi consumida por nenhum lugar do
-- cliente (confirmado) — removida pra não ficar um artefato morto do padrão quebrado.
DROP VIEW IF EXISTS public.triage_error_distributions_v;
