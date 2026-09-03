-- Correção CRÍTICA (03/09/2026): o REVOKE SELECT (coluna) das duas migrações de
-- mascaramento (20260902040000 driverpay, 20260903120000 financeiro/erros/c6) NÃO
-- bloqueava nada de verdade — o Supabase já concede GRANT ALL na TABELA INTEIRA pra
-- `authenticated` de fábrica (relacl confirma: authenticated=arwdDxtm/postgres), e
-- essa concessão AMPLA continua valendo mesmo com REVOKE numa coluna específica (o
-- REVOKE de coluna só remove uma concessão column-level que nunca existia aqui — não
-- sobrepõe a concessão table-level já presente). Resultado: a tabela crua continuava
-- 100% legível por chamada REST direta (`/rest/v1/payments?select=...`), pra
-- qualquer JWT autenticado, bypassando a view mascarada inteira. Confirmado via
-- has_column_privilege('authenticated', 'public.payments', 'daily_rate', 'SELECT')
-- = true mesmo depois do REVOKE de ontem/hoje.
--
-- Correção: REVOKE SELECT da TABELA INTEIRA de `authenticated`, e GRANT SELECT só
-- nas colunas que NÃO são de dinheiro. Views (payments_v etc.) continuam OK — rodam
-- com o dono (postgres), que nunca teve a concessão revogada. `anon` não precisa do
-- mesmo tratamento: RLS já barra 100% das linhas pra quem não tem JWT de empresa
-- válido, então nunca chega a expor coluna nenhuma.
--
-- Validado após aplicar: has_column_privilege('authenticated', 'public.payments',
-- 'daily_rate', 'SELECT') = false; has_column_privilege('authenticated',
-- 'public.driverpay_payments', 'total_net', 'SELECT') = false; colunas não-monetárias
-- e as views continuam = true.

-- ---------- driverpay (corrige a migração de 02/09) ----------
REVOKE SELECT ON public.driverpay_payments FROM authenticated;
GRANT SELECT (id, company_id, period_id, driver_id, driver_name_snapshot, route_snapshot,
  nota_fiscal_recebida, espelho_conferido, espelho_conferido_at, espelho_conferido_by,
  created_at, updated_at) ON public.driverpay_payments TO authenticated;

REVOKE SELECT ON public.driverpay_payment_packages FROM authenticated;
GRANT SELECT (id, company_id, payment_id, platform_name, route, packages, created_at)
  ON public.driverpay_payment_packages TO authenticated;

REVOKE SELECT ON public.driverpay_discounts FROM authenticated;
GRANT SELECT (id, company_id, payment_id, package_code, observation, package_status,
  proof1_path, proof2_path, proof_video_path, created_by, created_at)
  ON public.driverpay_discounts TO authenticated;

REVOKE SELECT ON public.driverpay_vales FROM authenticated;
GRANT SELECT (id, company_id, payment_id, vale_date, observation, created_by, created_at)
  ON public.driverpay_vales TO authenticated;

REVOKE SELECT ON public.driverpay_platforms FROM authenticated;
GRANT SELECT (id, company_id, name, sort_order, active, color, highlight_mirror,
  mirror_notice, mirror_separate_value, nota_emitter_id, created_by, created_at)
  ON public.driverpay_platforms TO authenticated;

REVOKE SELECT ON public.driverpay_platform_rates FROM authenticated;
GRANT SELECT (id, company_id, driver_id, platform_id, updated_by, updated_at)
  ON public.driverpay_platform_rates TO authenticated;

REVOKE SELECT ON public.driverpay_deduction_ledger FROM authenticated;
GRANT SELECT (id, company_id, period_id, driver_id, source, source_ref, created_at, created_by)
  ON public.driverpay_deduction_ledger TO authenticated;

REVOKE SELECT ON public.driverpay_deduction_carryover FROM authenticated;
GRANT SELECT (id, company_id, from_period_id, to_period_id, driver_id, created_at, created_by)
  ON public.driverpay_deduction_carryover TO authenticated;

-- ---------- financeiro/erros/c6 (corrige a migração de hoje, 20260903120000) ----------
REVOKE SELECT ON public.payments FROM authenticated;
GRANT SELECT (id, employee_id, date, created_by, created_at, updated_at, company_id,
  bank_hours_minutes, bank_hours_applied_at) ON public.payments TO authenticated;

REVOKE SELECT ON public.error_records FROM authenticated;
GRANT SELECT (id, employee_id, date, error_count, observations, created_by, created_at,
  updated_at, error_type, company_id) ON public.error_records TO authenticated;

REVOKE SELECT ON public.triage_errors FROM authenticated;
GRANT SELECT (id, date, error_count, observations, created_by, created_at, updated_at,
  triage_type, company_id) ON public.triage_errors TO authenticated;

REVOKE SELECT ON public.triage_error_distributions FROM authenticated;
GRANT SELECT (id, period_start, period_end, total_errors, total_employees, distributed_by,
  distributed_at, observations, company_id) ON public.triage_error_distributions TO authenticated;

REVOKE SELECT ON public.triage_distribution_employees FROM authenticated;
GRANT SELECT (id, distribution_id, employee_id, errors_share, created_at, company_id)
  ON public.triage_distribution_employees TO authenticated;

REVOKE SELECT ON public.bonus_removals FROM authenticated;
GRANT SELECT (id, employee_id, date, observation, removed_by, removed_at, created_at,
  bonus_type, company_id, bonus_type_id) ON public.bonus_removals TO authenticated;
