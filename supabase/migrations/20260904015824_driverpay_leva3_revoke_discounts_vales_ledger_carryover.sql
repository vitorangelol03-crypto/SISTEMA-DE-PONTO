-- 03/09/2026: fechamento FINAL da leva 3 (última) do driverpay — discounts,
-- vales, deduction_ledger, deduction_carryover. CI verde confirmado (run
-- 33826641223) com o client já 100% nas functions SECURITY DEFINER.
-- Isso fecha as 8 tabelas do driverpay.

REVOKE SELECT ON public.driverpay_discounts FROM authenticated;
GRANT SELECT (id, company_id, payment_id, package_code, package_status, observation,
  created_by, created_at, proof1_path, proof2_path, proof_video_path)
  ON public.driverpay_discounts TO authenticated;

REVOKE SELECT ON public.driverpay_vales FROM authenticated;
GRANT SELECT (id, company_id, payment_id, vale_date, observation, created_by, created_at)
  ON public.driverpay_vales TO authenticated;

REVOKE SELECT ON public.driverpay_deduction_ledger FROM authenticated;
GRANT SELECT (id, company_id, period_id, driver_id, source, source_ref, created_at, created_by)
  ON public.driverpay_deduction_ledger TO authenticated;

REVOKE SELECT ON public.driverpay_deduction_carryover FROM authenticated;
GRANT SELECT (id, company_id, from_period_id, to_period_id, driver_id, created_at, created_by)
  ON public.driverpay_deduction_carryover TO authenticated;
