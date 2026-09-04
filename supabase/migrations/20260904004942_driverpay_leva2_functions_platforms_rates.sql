-- 03/09/2026: leva 2 do fechamento da brecha REST no driverpay (platforms +
-- platform_rates). Só cria as functions — client code e REVOKE vêm depois,
-- validados com CI a cada passo.

CREATE OR REPLACE FUNCTION public.get_driverpay_platforms_masked(
  p_company_id uuid, p_only_active boolean
) RETURNS TABLE (
  id uuid, company_id uuid, name text, default_rate numeric, sort_order integer, active boolean,
  color text, highlight_mirror boolean, mirror_notice text, mirror_separate_value boolean,
  nota_emitter_id uuid, created_by text, created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  )
  SELECT pl.id, pl.company_id, pl.name,
    CASE WHEN cv.ok THEN pl.default_rate ELSE NULL END,
    pl.sort_order, pl.active, pl.color, pl.highlight_mirror, pl.mirror_notice, pl.mirror_separate_value,
    pl.nota_emitter_id, pl.created_by, pl.created_at
  FROM public.driverpay_platforms pl, can_view cv
  WHERE pl.company_id = p_company_id
    AND (NOT p_only_active OR pl.active)
    AND ((pl.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
  ORDER BY pl.sort_order ASC, pl.name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_driverpay_platforms_masked(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driverpay_platforms_masked(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driverpay_platforms_masked(uuid, boolean) FROM anon;

CREATE OR REPLACE FUNCTION public.create_driverpay_platform_masked(
  p_company_id uuid, p_name text, p_default_rate numeric, p_sort_order integer, p_color text, p_created_by text
) RETURNS TABLE (
  id uuid, company_id uuid, name text, default_rate numeric, sort_order integer, active boolean,
  color text, highlight_mirror boolean, mirror_notice text, mirror_separate_value boolean,
  nota_emitter_id uuid, created_by text, created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT ((p_company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626']))) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  INSERT INTO public.driverpay_platforms (company_id, name, default_rate, sort_order, color, created_by)
  VALUES (p_company_id, p_name, p_default_rate, p_sort_order, p_color, p_created_by)
  RETURNING driverpay_platforms.id INTO v_id;

  RETURN QUERY
  SELECT pl.id, pl.company_id, pl.name,
    CASE WHEN ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues'))
      THEN pl.default_rate ELSE NULL END,
    pl.sort_order, pl.active, pl.color, pl.highlight_mirror, pl.mirror_notice, pl.mirror_separate_value,
    pl.nota_emitter_id, pl.created_by, pl.created_at
  FROM public.driverpay_platforms pl WHERE pl.id = v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_driverpay_platform_masked(uuid, text, numeric, integer, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_driverpay_platform_masked(uuid, text, numeric, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_driverpay_platform_masked(uuid, text, numeric, integer, text, text) FROM anon;

CREATE OR REPLACE FUNCTION public.get_driverpay_platform_rates_masked(
  p_company_id uuid,
  p_driver_id uuid
) RETURNS TABLE (
  id uuid, company_id uuid, driver_id uuid, platform_id uuid, platform_name text,
  rate numeric, updated_by text, updated_at timestamptz
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  ),
  scope AS (
    SELECT COALESCE(p_company_id, (SELECT d.company_id FROM public.driverpay_drivers d WHERE d.id = p_driver_id)) AS cid
  )
  SELECT r.id, r.company_id, r.driver_id, r.platform_id, p.name,
    CASE WHEN cv.ok THEN r.rate ELSE NULL END, r.updated_by, r.updated_at
  FROM public.driverpay_platform_rates r
  JOIN public.driverpay_platforms p ON p.id = r.platform_id
  CROSS JOIN can_view cv
  CROSS JOIN scope s
  WHERE r.company_id = s.cid
    AND (p_driver_id IS NULL OR r.driver_id = p_driver_id)
    AND ((s.cid::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])));
$$;
GRANT EXECUTE ON FUNCTION public.get_driverpay_platform_rates_masked(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driverpay_platform_rates_masked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driverpay_platform_rates_masked(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.upsert_driverpay_platform_rates_masked(
  p_company_id uuid, p_driver_ids uuid[], p_platform_id uuid, p_rate numeric, p_updated_by text
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
  INSERT INTO public.driverpay_platform_rates (company_id, driver_id, platform_id, rate, updated_by, updated_at)
  SELECT p_company_id, d, p_platform_id, p_rate, p_updated_by, now()
  FROM unnest(p_driver_ids) AS d
  ON CONFLICT (driver_id, platform_id) DO UPDATE SET
    rate = excluded.rate, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_driverpay_platform_rates_masked(uuid, uuid[], uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_driverpay_platform_rates_masked(uuid, uuid[], uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_driverpay_platform_rates_masked(uuid, uuid[], uuid, numeric, text) FROM anon;
