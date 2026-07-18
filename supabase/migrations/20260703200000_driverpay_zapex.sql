-- Pagamentos Driver: plataforma ZAPEX (ganho por itens).
-- Cada Zapex = 1 entrega (codigo + data de entrega). O driver tem um VALOR UNITARIO
-- individual (zapex_rate, snapshot no pagamento). Total Zapex = qtd de itens x zapex_rate,
-- e SOMA no total a receber. Ao concluir: vai pro historico e o proximo periodo vem ZERADO
-- (nenhum item Zapex e carregado; so o zapex_rate persiste como default). Itens editam/excluem.
-- 100% aditivo.

-- 1. Colunas no pagamento (snapshot da taxa + total congelado)
ALTER TABLE public.driverpay_payments
  ADD COLUMN IF NOT EXISTS zapex_rate  numeric(10,2) NOT NULL DEFAULT 0 CHECK (zapex_rate >= 0),
  ADD COLUMN IF NOT EXISTS total_zapex numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_zapex >= 0);

-- 2. Tabela de itens Zapex
CREATE TABLE IF NOT EXISTS public.driverpay_zapex (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id    uuid NOT NULL REFERENCES public.driverpay_payments(id) ON DELETE CASCADE,
  code          text NOT NULL CHECK (length(btrim(code)) > 0),
  delivery_date date,
  created_by    text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driverpay_zapex_company    ON public.driverpay_zapex(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_zapex_payment    ON public.driverpay_zapex(payment_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_zapex_created_by ON public.driverpay_zapex(created_by);

-- 3. RLS (mesmo padrao do modulo: empresa + mestre 9999/2626)
ALTER TABLE public.driverpay_zapex ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_zapex;
CREATE POLICY driverpay_rls ON public.driverpay_zapex FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- 4. Triggers de trava (periodo concluido imutavel) + coerencia company_id (reusam as funcoes)
DROP TRIGGER IF EXISTS trg_driverpay_lock_zapex ON public.driverpay_zapex;
CREATE TRIGGER trg_driverpay_lock_zapex BEFORE INSERT OR UPDATE OR DELETE ON public.driverpay_zapex FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_period_locked();
DROP TRIGGER IF EXISTS trg_driverpay_child_zapex ON public.driverpay_zapex;
CREATE TRIGGER trg_driverpay_child_zapex BEFORE INSERT OR UPDATE ON public.driverpay_zapex FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_child_company();

-- 5. View de reconciliacao: agora inclui Zapex (SOMA). DROP+CREATE pois muda a ordem das colunas.
DROP VIEW IF EXISTS public.driverpay_payment_computed;
CREATE VIEW public.driverpay_payment_computed WITH (security_invoker = true) AS
SELECT dp.id AS payment_id, dp.period_id, dp.company_id, dp.driver_id,
  COALESCE(pk.amt,0) AS calc_packages,
  round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2) AS calc_zapex,
  COALESCE(ds.amt,0) AS calc_discounts,
  COALESCE(vl.amt,0) AS calc_vales,
  COALESCE(pk.amt,0) + round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2) - COALESCE(ds.amt,0) - COALESCE(vl.amt,0) AS calc_net
FROM public.driverpay_payments dp
LEFT JOIN LATERAL (SELECT round(SUM(packages * rate_snapshot),2) amt FROM public.driverpay_payment_packages WHERE payment_id = dp.id) pk ON true
LEFT JOIN LATERAL (SELECT count(*) cnt FROM public.driverpay_zapex WHERE payment_id = dp.id) zx ON true
LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM public.driverpay_discounts WHERE payment_id = dp.id) ds ON true
LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM public.driverpay_vales WHERE payment_id = dp.id) vl ON true;

-- 6. RPC de conclusao: congela total_zapex, carrega zapex_rate pro proximo periodo (itens ZERADOS)
CREATE OR REPLACE FUNCTION public.driverpay_conclude_period(
  p_period_id uuid, p_company_id uuid, p_user_id text,
  p_next_label text, p_next_start date DEFAULT NULL, p_next_end date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  LEFT JOIN LATERAL (SELECT round(SUM(packages * rate_snapshot),2) amt FROM driverpay_payment_packages WHERE payment_id = t.id) pk ON true
  LEFT JOIN LATERAL (SELECT count(*) cnt FROM driverpay_zapex WHERE payment_id = t.id) zx ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_discounts WHERE payment_id = t.id) ds ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_vales WHERE payment_id = t.id) vl ON true
  WHERE dp.id = t.id;

  UPDATE driverpay_periods SET status = 'concluido', concluded_at = now(), concluded_by = p_user_id WHERE id = p_period_id;

  INSERT INTO driverpay_periods (company_id, label, start_date, end_date, status, created_by)
    VALUES (p_company_id, p_next_label, p_next_start, p_next_end, 'aberto', p_user_id) RETURNING id INTO v_new;

  -- pre-carrega drivers ativos; carrega zapex_rate do periodo anterior (itens Zapex NAO sao carregados = zerado)
  INSERT INTO driverpay_payments (company_id, period_id, driver_id, driver_name_snapshot, route_snapshot, zapex_rate)
  SELECT p_company_id, v_new, d.id, d.name, d.route, COALESCE(odp.zapex_rate, 0)
  FROM driverpay_drivers d
  LEFT JOIN driverpay_payments odp ON odp.driver_id = d.id AND odp.period_id = p_period_id
  WHERE d.company_id = p_company_id AND d.active = true;

  -- esqueleto de rotas (pacotes eMile/ANJUN) com rate por rota
  INSERT INTO driverpay_payment_packages (company_id, payment_id, platform_name, route, packages, rate_snapshot)
  SELECT p_company_id, ndp.id, oldpk.platform_name, oldpk.route, 0, oldpk.rate_snapshot
  FROM driverpay_payments ndp
  JOIN driverpay_payments odp ON odp.driver_id = ndp.driver_id AND odp.period_id = p_period_id
  JOIN driverpay_payment_packages oldpk ON oldpk.payment_id = odp.id
  WHERE ndp.period_id = v_new;

  RETURN v_new;
END; $$;
GRANT EXECUTE ON FUNCTION public.driverpay_conclude_period(uuid,uuid,text,text,date,date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.driverpay_conclude_period(uuid,uuid,text,text,date,date) FROM PUBLIC, anon;

COMMENT ON TABLE public.driverpay_zapex IS 'Pagamentos Driver: itens Zapex (codigo + data de entrega). Ganho = qtd x driverpay_payments.zapex_rate.';
