-- 03/09/2026: leva 1 do fechamento da brecha REST no driverpay (payments +
-- payment_packages). A trava de coluna de 02/09 nunca funcionou (mesmo bug
-- desta manhã pro Financeiro) — authenticated ainda lê a tabela inteira.
-- SÓ CRIA AS FUNCTIONS AQUI — client code e REVOKE vêm em migrations
-- separadas, depois de validar cada passo (ordem disciplinada de hoje).

CREATE OR REPLACE FUNCTION public.recompute_driverpay_payment_totals_masked(p_payment_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_calc record;
BEGIN
  SELECT company_id INTO v_company_id FROM public.driverpay_payments WHERE id = p_payment_id;
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT ((v_company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626']))) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT calc_packages, calc_discounts, calc_vales, calc_zapex, calc_net
    INTO v_calc
    FROM public.driverpay_payment_computed
    WHERE payment_id = p_payment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.driverpay_payments SET
    total_packages_amount = COALESCE(v_calc.calc_packages, 0),
    total_discounts = COALESCE(v_calc.calc_discounts, 0),
    total_vales = COALESCE(v_calc.calc_vales, 0),
    total_zapex = COALESCE(v_calc.calc_zapex, 0),
    total_net = COALESCE(v_calc.calc_net, 0),
    updated_at = now()
  WHERE id = p_payment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.recompute_driverpay_payment_totals_masked(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.recompute_driverpay_payment_totals_masked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_driverpay_payment_totals_masked(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.get_driverpay_payments_masked(
  p_period_id uuid,
  p_company_id uuid
)
RETURNS TABLE (
  id uuid, company_id uuid, period_id uuid, driver_id uuid,
  driver_name_snapshot text, route_snapshot text,
  total_packages_amount numeric, total_discounts numeric, total_vales numeric, total_net numeric,
  zapex_rate numeric, total_zapex numeric,
  nota_fiscal_recebida boolean,
  espelho_conferido boolean, espelho_conferido_at timestamptz, espelho_conferido_by text,
  created_at timestamptz, updated_at timestamptz,
  packages jsonb, discounts jsonb, vales jsonb, zapex jsonb
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  )
  SELECT
    pay.id, pay.company_id, pay.period_id, pay.driver_id,
    pay.driver_name_snapshot, pay.route_snapshot,
    CASE WHEN cv.ok THEN pay.total_packages_amount ELSE NULL END,
    CASE WHEN cv.ok THEN pay.total_discounts ELSE NULL END,
    CASE WHEN cv.ok THEN pay.total_vales ELSE NULL END,
    CASE WHEN cv.ok THEN pay.total_net ELSE NULL END,
    CASE WHEN cv.ok THEN pay.zapex_rate ELSE NULL END,
    CASE WHEN cv.ok THEN pay.total_zapex ELSE NULL END,
    pay.nota_fiscal_recebida,
    pay.espelho_conferido, pay.espelho_conferido_at, pay.espelho_conferido_by,
    pay.created_at, pay.updated_at,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pk.id, 'company_id', pk.company_id, 'payment_id', pk.payment_id,
        'platform_name', pk.platform_name, 'route', pk.route, 'packages', pk.packages,
        'rate_snapshot', CASE WHEN cv.ok THEN pk.rate_snapshot ELSE NULL END,
        'created_at', pk.created_at
      )), '[]'::jsonb)
     FROM public.driverpay_payment_packages pk WHERE pk.payment_id = pay.id) AS packages,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'company_id', d.company_id, 'payment_id', d.payment_id,
        'amount', CASE WHEN cv.ok THEN d.amount ELSE NULL END,
        'package_code', d.package_code, 'observation', d.observation,
        'package_status', d.package_status,
        'proof1_path', d.proof1_path, 'proof2_path', d.proof2_path, 'proof_video_path', d.proof_video_path,
        'created_by', d.created_by, 'created_at', d.created_at
      )), '[]'::jsonb)
     FROM public.driverpay_discounts d WHERE d.payment_id = pay.id) AS discounts,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', v.id, 'company_id', v.company_id, 'payment_id', v.payment_id,
        'amount', CASE WHEN cv.ok THEN v.amount ELSE NULL END,
        'vale_date', v.vale_date, 'observation', v.observation,
        'created_by', v.created_by, 'created_at', v.created_at
      )), '[]'::jsonb)
     FROM public.driverpay_vales v WHERE v.payment_id = pay.id) AS vales,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', z.id, 'company_id', z.company_id, 'payment_id', z.payment_id,
        'code', z.code, 'delivery_date', z.delivery_date,
        'created_by', z.created_by, 'created_at', z.created_at
      )), '[]'::jsonb)
     FROM public.driverpay_zapex z WHERE z.payment_id = pay.id) AS zapex
  FROM public.driverpay_payments pay, can_view cv
  WHERE pay.period_id = p_period_id
    AND pay.company_id = p_company_id
    AND ((pay.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
  ORDER BY pay.driver_name_snapshot ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_driverpay_payments_masked(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driverpay_payments_masked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driverpay_payments_masked(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.upsert_driverpay_package_masked(
  p_company_id uuid, p_payment_id uuid, p_platform_name text, p_route text,
  p_packages integer, p_rate_snapshot numeric
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT ((p_company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626']))) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  INSERT INTO public.driverpay_payment_packages (company_id, payment_id, platform_name, route, packages, rate_snapshot)
  VALUES (p_company_id, p_payment_id, p_platform_name, p_route, p_packages, p_rate_snapshot)
  ON CONFLICT (payment_id, platform_name, route) DO UPDATE SET
    packages = excluded.packages,
    rate_snapshot = excluded.rate_snapshot;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_driverpay_package_masked(uuid, uuid, text, text, integer, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_driverpay_package_masked(uuid, uuid, text, text, integer, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_driverpay_package_masked(uuid, uuid, text, text, integer, numeric) FROM anon;

CREATE OR REPLACE FUNCTION public.update_driverpay_package_rate_where_changed_masked(
  p_company_id uuid, p_payment_id uuid, p_platform_name text, p_new_rate numeric
) RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT ((p_company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626']))) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  UPDATE public.driverpay_payment_packages
  SET rate_snapshot = p_new_rate
  WHERE payment_id = p_payment_id AND platform_name = p_platform_name AND rate_snapshot <> p_new_rate;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_driverpay_package_rate_where_changed_masked(uuid, uuid, text, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.update_driverpay_package_rate_where_changed_masked(uuid, uuid, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_driverpay_package_rate_where_changed_masked(uuid, uuid, text, numeric) FROM anon;

CREATE OR REPLACE FUNCTION public.get_driverpay_last_used_rates_masked(
  p_company_id uuid, p_driver_id uuid
) RETURNS TABLE (platform_name text, rate_snapshot numeric, created_at timestamptz)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  ),
  latest_payment AS (
    SELECT pay.id
    FROM public.driverpay_payments pay
    WHERE pay.company_id = p_company_id AND pay.driver_id = p_driver_id
      AND ((pay.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
    ORDER BY pay.created_at DESC
    LIMIT 1
  )
  SELECT pk.platform_name, CASE WHEN cv.ok THEN pk.rate_snapshot ELSE NULL END, pk.created_at
  FROM public.driverpay_payment_packages pk, can_view cv
  WHERE pk.payment_id = (SELECT id FROM latest_payment);
$$;
GRANT EXECUTE ON FUNCTION public.get_driverpay_last_used_rates_masked(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driverpay_last_used_rates_masked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driverpay_last_used_rates_masked(uuid, uuid) FROM anon;
