-- EMERGÊNCIA (03/09/2026): a migração anterior (fix_column_revoke_ineffective_use_table_revoke,
-- 20260903130000) quebrou TODAS as views mascaradas (payments_v, error_records_v,
-- triage_errors_v, triage_error_distributions_v, triage_distribution_employees_v,
-- bonus_removals_v, driverpay_payments_v e as outras 7 do driverpay) — não só pra quem não
-- tem permissão, PRA TODO MUNDO, inclusive 2626. Causa: view com `security_invoker = true`
-- faz o Postgres checar a permissão de coluna do INVOCADOR (não do dono) pra QUALQUER
-- coluna referenciada na view, mesmo dentro de um CASE WHEN que devolveria NULL — ou
-- seja, sem SELECT na coluna crua, a view inteira vira "permission denied", mesmo pra
-- quem tem a permissão de ver o valor. Confirmado ao simular a query como authenticated:
-- "ERROR: 42501: permission denied for table payments" / "...driverpay_payments".
--
-- Reversão: devolve SELECT na tabela inteira pra `authenticated` (estado de ontem/hoje
-- ANTES da migração de correção) — restaura as views funcionando. O mascaramento
-- continua de pé (a CASE WHEN das views ainda esconde o valor de quem não tem
-- permissão) — só o REVOKE extra que fechava o bypass por REST direto é desfeito, até
-- a correção certa (function SECURITY DEFINER em vez de view security_invoker, que não
-- tem esse problema) ser desenhada e aplicada numa sessão futura.

GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT ON public.error_records TO authenticated;
GRANT SELECT ON public.triage_errors TO authenticated;
GRANT SELECT ON public.triage_error_distributions TO authenticated;
GRANT SELECT ON public.triage_distribution_employees TO authenticated;
GRANT SELECT ON public.bonus_removals TO authenticated;

GRANT SELECT ON public.driverpay_payments TO authenticated;
GRANT SELECT ON public.driverpay_payment_packages TO authenticated;
GRANT SELECT ON public.driverpay_discounts TO authenticated;
GRANT SELECT ON public.driverpay_vales TO authenticated;
GRANT SELECT ON public.driverpay_platforms TO authenticated;
GRANT SELECT ON public.driverpay_platform_rates TO authenticated;
GRANT SELECT ON public.driverpay_deduction_ledger TO authenticated;
GRANT SELECT ON public.driverpay_deduction_carryover TO authenticated;
