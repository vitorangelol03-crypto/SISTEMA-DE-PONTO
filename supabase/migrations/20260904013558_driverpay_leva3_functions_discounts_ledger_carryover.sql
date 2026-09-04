-- 03/09/2026: leva 3 (última) do fechamento da brecha REST no driverpay
-- (discounts + vales + deduction_ledger + deduction_carryover). Só cria as
-- functions — client code e REVOKE vêm depois, validados com CI a cada passo.
--
-- Nota: addDiscount/updateDiscount/addVale/updateVale/recordCarryover
-- (INSERT com dinheiro só em VALUES, UPDATE simples sem ON CONFLICT) e
-- recordDeductions (upsert com ON CONFLICT DO NOTHING, sem SET) NÃO
-- precisam de function — confirmado empiricamente que essas formas de
-- escrita não exigem SELECT na coluna de dinheiro.

CREATE OR REPLACE FUNCTION public.search_driverpay_discounts_masked(
  p_company_id uuid, p_code text
) RETURNS TABLE (
  id uuid, amount numeric, package_code text, package_status text, observation text, created_at timestamptz,
  proof1_path text, proof2_path text, proof_video_path text,
  driver_name text, period_label text, period_status text, period_concluded_at timestamptz
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  )
  SELECT d.id,
    CASE WHEN cv.ok THEN d.amount ELSE NULL END,
    d.package_code, d.package_status, d.observation, d.created_at,
    d.proof1_path, d.proof2_path, d.proof_video_path,
    pay.driver_name_snapshot, per.label, per.status, per.concluded_at
  FROM public.driverpay_discounts d
  JOIN public.driverpay_payments pay ON pay.id = d.payment_id
  JOIN public.driverpay_periods per ON per.id = pay.period_id
  CROSS JOIN can_view cv
  WHERE d.company_id = p_company_id
    AND (p_code = '' OR d.package_code ILIKE '%' || p_code || '%')
    AND ((d.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
  ORDER BY d.created_at DESC
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION public.search_driverpay_discounts_masked(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.search_driverpay_discounts_masked(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_driverpay_discounts_masked(uuid, text) FROM anon;

CREATE OR REPLACE FUNCTION public.get_driverpay_deduction_ledger_masked(
  p_company_id uuid, p_period_id uuid
) RETURNS TABLE (driver_id uuid, amount numeric)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  )
  SELECT l.driver_id, CASE WHEN cv.ok THEN l.amount ELSE NULL END
  FROM public.driverpay_deduction_ledger l, can_view cv
  WHERE l.company_id = p_company_id AND l.period_id = p_period_id
    AND ((l.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])));
$$;
GRANT EXECUTE ON FUNCTION public.get_driverpay_deduction_ledger_masked(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driverpay_deduction_ledger_masked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driverpay_deduction_ledger_masked(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.get_driverpay_deduction_carryover_masked(
  p_company_id uuid, p_from_period_id uuid, p_to_period_id uuid
) RETURNS TABLE (driver_id uuid, amount numeric)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  )
  SELECT c.driver_id, CASE WHEN cv.ok THEN c.amount ELSE NULL END
  FROM public.driverpay_deduction_carryover c, can_view cv
  WHERE c.company_id = p_company_id
    AND (p_from_period_id IS NULL OR c.from_period_id = p_from_period_id)
    AND (p_to_period_id IS NULL OR c.to_period_id = p_to_period_id)
    AND ((c.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])));
$$;
GRANT EXECUTE ON FUNCTION public.get_driverpay_deduction_carryover_masked(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driverpay_deduction_carryover_masked(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driverpay_deduction_carryover_masked(uuid, uuid, uuid) FROM anon;
