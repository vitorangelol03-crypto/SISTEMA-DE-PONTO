-- 03/09/2026: fechamento FINAL da leva 1 (payments + payment_packages).
-- CI verde confirmado (run 33821222840) com o client já 100% nas functions
-- SECURITY DEFINER. Trava a tabela INTEIRA (não só coluna — REVOKE de coluna
-- sozinho é ineficaz, achado de hoje) e devolve GRANT só nas colunas seguras.

REVOKE SELECT ON public.driverpay_payments FROM authenticated;
GRANT SELECT (id, company_id, period_id, driver_id, driver_name_snapshot, route_snapshot,
  created_at, updated_at, nota_fiscal_recebida, nota_fiscal_at, nota_fiscal_by,
  espelho_conferido, espelho_conferido_at, espelho_conferido_by)
  ON public.driverpay_payments TO authenticated;

REVOKE SELECT ON public.driverpay_payment_packages FROM authenticated;
GRANT SELECT (id, company_id, payment_id, platform_name, route, packages, created_at)
  ON public.driverpay_payment_packages TO authenticated;
