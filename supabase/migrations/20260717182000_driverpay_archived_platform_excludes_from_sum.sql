-- Regra: pacotes de plataforma ARQUIVADA (active=false) ou inexistente saem da soma.
-- Vale para o calculo ao vivo (view) e para o congelamento ao concluir (funcoes).
-- Periodos ja concluidos NAO mudam (total_net deles ja esta gravado; nada re-le a view).
-- Com todas as plataformas ativas, o filtro nao altera nenhum valor (dormant ate arquivar).
-- Aplicada em prod via MCP apply_migration (2026-07-17); verificado que o total do periodo
-- aberto seguiu 265.846,00 (inalterado).

-- 1) View de calculo ao vivo: soma so pacotes de plataforma ativa.
CREATE OR REPLACE VIEW public.driverpay_payment_computed AS
SELECT dp.id AS payment_id,
    dp.period_id,
    dp.company_id,
    dp.driver_id,
    COALESCE(pk.amt, 0::numeric) AS calc_packages,
    round(COALESCE(zx.cnt, 0::bigint)::numeric * dp.zapex_rate, 2) AS calc_zapex,
    COALESCE(ds.amt, 0::numeric) AS calc_discounts,
    COALESCE(vl.amt, 0::numeric) AS calc_vales,
    COALESCE(pk.amt, 0::numeric) + round(COALESCE(zx.cnt, 0::bigint)::numeric * dp.zapex_rate, 2) - COALESCE(ds.amt, 0::numeric) - COALESCE(vl.amt, 0::numeric) AS calc_net
   FROM driverpay_payments dp
     LEFT JOIN LATERAL ( SELECT round(sum(pp.packages::numeric * pp.rate_snapshot), 2) AS amt
           FROM driverpay_payment_packages pp
          WHERE pp.payment_id = dp.id
            AND EXISTS (SELECT 1 FROM driverpay_platforms pl
                        WHERE pl.company_id = dp.company_id AND pl.name = pp.platform_name AND pl.active)) pk ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS cnt FROM driverpay_zapex WHERE driverpay_zapex.payment_id = dp.id) zx ON true
     LEFT JOIN LATERAL ( SELECT round(sum(driverpay_discounts.amount), 2) AS amt FROM driverpay_discounts WHERE driverpay_discounts.payment_id = dp.id) ds ON true
     LEFT JOIN LATERAL ( SELECT round(sum(driverpay_vales.amount), 2) AS amt FROM driverpay_vales WHERE driverpay_vales.payment_id = dp.id) vl ON true;

-- 2) Conclusao que abre a proxima: congela somando so plataforma ativa.
CREATE OR REPLACE FUNCTION public.driverpay_conclude_period(p_period_id uuid, p_company_id uuid, p_user_id text, p_next_label text, p_next_start date DEFAULT NULL::date, p_next_end date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_company uuid; v_status text; v_new uuid;
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
  LEFT JOIN LATERAL (SELECT round(SUM(pp.packages * pp.rate_snapshot),2) amt FROM driverpay_payment_packages pp
      WHERE pp.payment_id = t.id
        AND EXISTS (SELECT 1 FROM driverpay_platforms pl WHERE pl.company_id = p_company_id AND pl.name = pp.platform_name AND pl.active)) pk ON true
  LEFT JOIN LATERAL (SELECT count(*) cnt FROM driverpay_zapex WHERE payment_id = t.id) zx ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_discounts WHERE payment_id = t.id) ds ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_vales WHERE payment_id = t.id) vl ON true
  WHERE dp.id = t.id;
  UPDATE driverpay_periods SET status = 'concluido', concluded_at = now(), concluded_by = p_user_id WHERE id = p_period_id;
  INSERT INTO driverpay_periods (company_id, label, start_date, end_date, status, created_by)
    VALUES (p_company_id, p_next_label, p_next_start, p_next_end, 'aberto', p_user_id) RETURNING id INTO v_new;
  INSERT INTO driverpay_payments (company_id, period_id, driver_id, driver_name_snapshot, route_snapshot, zapex_rate)
  SELECT p_company_id, v_new, d.id, d.name, d.route, COALESCE(odp.zapex_rate, 0)
  FROM driverpay_drivers d
  LEFT JOIN driverpay_payments odp ON odp.driver_id = d.id AND odp.period_id = p_period_id
  WHERE d.company_id = p_company_id AND d.active = true;
  INSERT INTO driverpay_payment_packages (company_id, payment_id, platform_name, route, packages, rate_snapshot)
  SELECT p_company_id, ndp.id, oldpk.platform_name, oldpk.route, 0, oldpk.rate_snapshot
  FROM driverpay_payments ndp
  JOIN driverpay_payments odp ON odp.driver_id = ndp.driver_id AND odp.period_id = p_period_id
  JOIN driverpay_payment_packages oldpk ON oldpk.payment_id = odp.id
  WHERE ndp.period_id = v_new;
  RETURN v_new;
END; $function$;

-- 3) Conclusao sem abrir a proxima: mesmo congelamento filtrado.
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
  LEFT JOIN LATERAL (SELECT round(SUM(pp.packages * pp.rate_snapshot),2) amt FROM driverpay_payment_packages pp
      WHERE pp.payment_id = t.id
        AND EXISTS (SELECT 1 FROM driverpay_platforms pl WHERE pl.company_id = p_company_id AND pl.name = pp.platform_name AND pl.active)) pk ON true
  LEFT JOIN LATERAL (SELECT count(*) cnt FROM driverpay_zapex WHERE payment_id = t.id) zx ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_discounts WHERE payment_id = t.id) ds ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_vales WHERE payment_id = t.id) vl ON true
  WHERE dp.id = t.id;
  UPDATE driverpay_periods SET status = 'concluido', concluded_at = now(), concluded_by = p_user_id WHERE id = p_period_id;
END; $function$;
