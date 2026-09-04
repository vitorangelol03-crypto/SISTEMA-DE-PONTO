-- 03/09/2026: fechamento FINAL da leva 2 (platforms + platform_rates).
-- CI verde confirmado (run 33823806883) com o client já 100% nas functions
-- SECURITY DEFINER.

REVOKE SELECT ON public.driverpay_platforms FROM authenticated;
GRANT SELECT (id, company_id, name, sort_order, active, color, highlight_mirror,
  mirror_notice, mirror_separate_value, nota_emitter_id, created_by, created_at)
  ON public.driverpay_platforms TO authenticated;

REVOKE SELECT ON public.driverpay_platform_rates FROM authenticated;
GRANT SELECT (id, company_id, driver_id, platform_id, updated_by, updated_at)
  ON public.driverpay_platform_rates TO authenticated;
