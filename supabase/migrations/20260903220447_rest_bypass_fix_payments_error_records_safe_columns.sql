-- 03/09/2026: getDataStatistics (aba Gerenciamento de Dados) lê a coluna
-- `date` de payments/error_records direto, filtrando por company_id — sem
-- nenhum valor de dinheiro envolvido. O REVOKE final de hoje (migration
-- ...204857) trancou a tabela INTEIRA, quebrando essa leitura (403 real,
-- pego pelo CI: "B. Navegar TODAS as tabs admin sem console errors" e
-- "G1. ... em PN sem console errors"). Corrige devolvendo GRANT só nas
-- colunas seguras (tudo que NÃO é valor de dinheiro) — mesmo padrão já
-- usado em triage_error_distributions hoje mais cedo. Colunas de dinheiro
-- (daily_rate/bonus/total/bonus_b/bonus_c1/bonus_c2/bonus_breakdown/
-- bank_hours_amount em payments; error_value em error_records) continuam
-- SEM grant nenhum pra authenticated — só saem mascaradas via as functions
-- get_payments_masked / get_error_records_masked.

GRANT SELECT (id, employee_id, date, created_by, created_at, updated_at,
  company_id, bank_hours_minutes, bank_hours_applied_at)
  ON public.payments TO authenticated;

GRANT SELECT (id, employee_id, date, error_count, observations, created_by,
  created_at, updated_at, error_type, company_id)
  ON public.error_records TO authenticated;
