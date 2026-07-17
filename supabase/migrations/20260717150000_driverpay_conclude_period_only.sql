-- Conclui uma quinzena SEM abrir a proxima: congela os totais + marca 'concluido'.
-- Espelha driverpay_conclude_period (mesma logica de congelamento), sem o INSERT da
-- proxima quinzena. Aplicada em prod via MCP apply_migration (2026-07-17).
CREATE OR REPLACE FUNCTION public.driverpay_conclude_period_only(p_period_id uuid, p_company_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_company uuid; v_status text;
BEGIN
  SELECT company_id, status INTO v_company, v_status FROM driverpay_periods WHERE id = p_period_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Periodo % nao encontrado', p_period_id; END IF;
  IF v_company <> p_company_id THEN RAISE EXCEPTION 'Periodo nao pertence a empresa informada'; END IF;
  IF v_status = 'concluido' THEN RAISE EXCEPTION 'Periodo ja concluido'; END IF;
  UPDATE driverpay_payments dp SET
    total_packages_amount = COALESCE(pk.amt,0),
    total_zapex           = round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2),
    total_discounts       = COALESCE(ds.amt,0),
    total_vales           = COALESCE(vl.amt,0),
    total_net             = COALESCE(pk.amt,0) + round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2) - COALESCE(ds.amt,0) - COALESCE(vl.amt,0),
    updated_at            = now()
  FROM (SELECT id FROM driverpay_payments WHERE period_id = p_period_id) t
  LEFT JOIN LATERAL (SELECT round(SUM(packages * rate_snapshot),2) amt FROM driverpay_payment_packages WHERE payment_id = t.id) pk ON true
  LEFT JOIN LATERAL (SELECT count(*) cnt FROM driverpay_zapex WHERE payment_id = t.id) zx ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_discounts WHERE payment_id = t.id) ds ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_vales WHERE payment_id = t.id) vl ON true
  WHERE dp.id = t.id;
  UPDATE driverpay_periods SET status = 'concluido', concluded_at = now(), concluded_by = p_user_id WHERE id = p_period_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.driverpay_conclude_period_only(uuid, uuid, text) TO authenticated, service_role;
