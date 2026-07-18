-- ============================================================================
-- Modulo "Pagamentos Driver" (iMile CTGA / Caratinga) - nova aba do Sistema de Ponto.
-- Namespace driverpay_* : ISOLADO do produto SPX/logistica que compartilha este
-- projeto Supabase (public.drivers / routes / route_groups / driver_route_links...).
-- 100% ADITIVO: nenhuma tabela/coluna/policy existente e alterada.
-- Rollback no rodape.
-- ============================================================================

-- ---------- 1. TABELAS ----------
CREATE TABLE IF NOT EXISTS public.driverpay_drivers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  route       text,
  pix_key     text,
  cpf         text,
  phone       text,
  active      boolean NOT NULL DEFAULT true,
  notes       text,
  created_by  text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driverpay_platforms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  default_rate numeric(10,2) NOT NULL DEFAULT 2.00 CHECK (default_rate >= 0),
  sort_order   integer NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_by   text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.driverpay_platform_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  driver_id   uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.driverpay_platforms(id) ON DELETE CASCADE,
  rate        numeric(10,2) NOT NULL DEFAULT 2.00 CHECK (rate >= 0),
  updated_by  text REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, platform_id)
);

CREATE TABLE IF NOT EXISTS public.driverpay_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  description  text,
  default_rate numeric(10,2) CHECK (default_rate IS NULL OR default_rate >= 0),
  created_by   text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.driverpay_group_members (
  group_id    uuid NOT NULL REFERENCES public.driverpay_groups(id) ON DELETE CASCADE,
  driver_id   uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, driver_id)
);

CREATE TABLE IF NOT EXISTS public.driverpay_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label         text NOT NULL CHECK (length(btrim(label)) > 0),
  start_date    date,
  end_date      date,
  status        text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','concluido')),
  concluded_at  timestamptz,
  concluded_by  text REFERENCES public.users(id) ON DELETE SET NULL,
  created_by    text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_driverpay_one_open_period
  ON public.driverpay_periods (company_id) WHERE status = 'aberto';

CREATE TABLE IF NOT EXISTS public.driverpay_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id             uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  driver_id             uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE RESTRICT,
  driver_name_snapshot  text NOT NULL,
  route_snapshot        text,
  total_packages_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_packages_amount >= 0),
  total_discounts       numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_discounts >= 0),
  total_vales           numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_vales >= 0),
  total_net             numeric(12,2) NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, driver_id)
);

CREATE TABLE IF NOT EXISTS public.driverpay_payment_packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id    uuid NOT NULL REFERENCES public.driverpay_payments(id) ON DELETE CASCADE,
  platform_name text NOT NULL CHECK (length(btrim(platform_name)) > 0),
  route         text NOT NULL DEFAULT '',
  packages      integer NOT NULL DEFAULT 0 CHECK (packages >= 0),
  rate_snapshot numeric(10,2) NOT NULL DEFAULT 2.00 CHECK (rate_snapshot >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, platform_name, route)
);

CREATE TABLE IF NOT EXISTS public.driverpay_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id    uuid NOT NULL REFERENCES public.driverpay_payments(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  package_code  text,
  observation   text,
  created_by    text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driverpay_vales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id    uuid NOT NULL REFERENCES public.driverpay_payments(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  vale_date     date,
  observation   text,
  created_by    text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- 2. INDICES (convencao idx_<tabela>_<coluna>; toda FK indexada) ----------
CREATE INDEX IF NOT EXISTS idx_driverpay_drivers_company        ON public.driverpay_drivers(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_drivers_created_by     ON public.driverpay_drivers(created_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_drivers_name_lower     ON public.driverpay_drivers(lower(name));
CREATE INDEX IF NOT EXISTS idx_driverpay_drivers_company_route  ON public.driverpay_drivers(company_id, route);
CREATE INDEX IF NOT EXISTS idx_driverpay_platforms_company      ON public.driverpay_platforms(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_platforms_created_by   ON public.driverpay_platforms(created_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_prates_company         ON public.driverpay_platform_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_prates_driver          ON public.driverpay_platform_rates(driver_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_prates_platform        ON public.driverpay_platform_rates(platform_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_prates_updated_by      ON public.driverpay_platform_rates(updated_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_groups_company         ON public.driverpay_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_groups_created_by      ON public.driverpay_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_gmembers_company       ON public.driverpay_group_members(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_gmembers_driver        ON public.driverpay_group_members(driver_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_periods_company        ON public.driverpay_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_periods_created_by     ON public.driverpay_periods(created_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_periods_concluded_by   ON public.driverpay_periods(concluded_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_payments_company       ON public.driverpay_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_payments_period        ON public.driverpay_payments(period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_payments_driver        ON public.driverpay_payments(driver_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_packages_company       ON public.driverpay_payment_packages(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_packages_payment       ON public.driverpay_payment_packages(payment_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_packages_company_route ON public.driverpay_payment_packages(company_id, route);
CREATE INDEX IF NOT EXISTS idx_driverpay_discounts_company      ON public.driverpay_discounts(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_discounts_payment      ON public.driverpay_discounts(payment_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_discounts_created_by   ON public.driverpay_discounts(created_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_vales_company          ON public.driverpay_vales(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_vales_payment          ON public.driverpay_vales(payment_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_vales_created_by       ON public.driverpay_vales(created_by);

-- ---------- 3. RLS (uma policy FOR ALL por tabela; empresa + mestre 9999/2626) ----------
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'driverpay_drivers','driverpay_platforms','driverpay_platform_rates','driverpay_groups',
    'driverpay_group_members','driverpay_periods','driverpay_payments','driverpay_payment_packages',
    'driverpay_discounts','driverpay_vales'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS driverpay_rls ON public.%I;', t);
    EXECUTE format($p$CREATE POLICY driverpay_rls ON public.%I FOR ALL TO authenticated
      USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
      WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));$p$, t);
  END LOOP;
END $rls$;

-- ---------- 4. TRIGGER de trava: periodo concluido = imutavel (molde do ponto 2626) ----------
CREATE OR REPLACE FUNCTION public.driverpay_enforce_period_locked()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_row record; v_period_id uuid; v_status text; v_sub text;
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_sub := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  IF v_sub = '2626' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_row := COALESCE(NEW, OLD);
  IF TG_TABLE_NAME = 'driverpay_payments' THEN
    v_period_id := v_row.period_id;
  ELSE
    SELECT p.period_id INTO v_period_id FROM public.driverpay_payments p WHERE p.id = v_row.payment_id;
  END IF;
  SELECT status INTO v_status FROM public.driverpay_periods WHERE id = v_period_id;
  IF v_status = 'concluido' THEN
    RAISE EXCEPTION 'Periodo de pagamento driver concluido e imutavel (somente mestre 2626 ou backend)';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $fn$;

DROP TRIGGER IF EXISTS trg_driverpay_lock_payments ON public.driverpay_payments;
CREATE TRIGGER trg_driverpay_lock_payments BEFORE INSERT OR UPDATE OR DELETE ON public.driverpay_payments          FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_period_locked();
DROP TRIGGER IF EXISTS trg_driverpay_lock_packages ON public.driverpay_payment_packages;
CREATE TRIGGER trg_driverpay_lock_packages BEFORE INSERT OR UPDATE OR DELETE ON public.driverpay_payment_packages  FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_period_locked();
DROP TRIGGER IF EXISTS trg_driverpay_lock_discounts ON public.driverpay_discounts;
CREATE TRIGGER trg_driverpay_lock_discounts BEFORE INSERT OR UPDATE OR DELETE ON public.driverpay_discounts        FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_period_locked();
DROP TRIGGER IF EXISTS trg_driverpay_lock_vales ON public.driverpay_vales;
CREATE TRIGGER trg_driverpay_lock_vales BEFORE INSERT OR UPDATE OR DELETE ON public.driverpay_vales                FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_period_locked();

-- ---------- 5. TRIGGER de coerencia: filha nao pode apontar pai de outra empresa ----------
CREATE OR REPLACE FUNCTION public.driverpay_enforce_child_company()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_pc uuid;
BEGIN
  SELECT company_id INTO v_pc FROM public.driverpay_payments WHERE id = NEW.payment_id;
  IF v_pc IS NULL OR NEW.company_id <> v_pc THEN
    RAISE EXCEPTION 'company_id da linha filha diverge do driverpay_payments pai';
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_driverpay_child_pkg ON public.driverpay_payment_packages;
CREATE TRIGGER trg_driverpay_child_pkg BEFORE INSERT OR UPDATE ON public.driverpay_payment_packages FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_child_company();
DROP TRIGGER IF EXISTS trg_driverpay_child_disc ON public.driverpay_discounts;
CREATE TRIGGER trg_driverpay_child_disc BEFORE INSERT OR UPDATE ON public.driverpay_discounts FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_child_company();
DROP TRIGGER IF EXISTS trg_driverpay_child_vale ON public.driverpay_vales;
CREATE TRIGGER trg_driverpay_child_vale BEFORE INSERT OR UPDATE ON public.driverpay_vales FOR EACH ROW EXECUTE FUNCTION public.driverpay_enforce_child_company();

-- ---------- 6. VIEW de reconciliacao (security_invoker: herda RLS) ----------
CREATE OR REPLACE VIEW public.driverpay_payment_computed WITH (security_invoker = true) AS
SELECT dp.id AS payment_id, dp.period_id, dp.company_id, dp.driver_id,
  COALESCE(pk.amt,0) AS calc_packages,
  COALESCE(ds.amt,0) AS calc_discounts,
  COALESCE(vl.amt,0) AS calc_vales,
  COALESCE(pk.amt,0) - COALESCE(ds.amt,0) - COALESCE(vl.amt,0) AS calc_net
FROM public.driverpay_payments dp
LEFT JOIN LATERAL (SELECT round(SUM(packages * rate_snapshot),2) amt FROM public.driverpay_payment_packages WHERE payment_id = dp.id) pk ON true
LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM public.driverpay_discounts WHERE payment_id = dp.id) ds ON true
LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM public.driverpay_vales WHERE payment_id = dp.id) vl ON true;

-- ---------- 7. RPCs (SECURITY DEFINER; validacao de posse; molde bank_hours) ----------
CREATE OR REPLACE FUNCTION public.driverpay_create_period(
  p_company_id uuid, p_user_id text, p_label text,
  p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_preload boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_new uuid;
BEGIN
  INSERT INTO driverpay_periods (company_id, label, start_date, end_date, status, created_by)
    VALUES (p_company_id, p_label, p_start, p_end, 'aberto', p_user_id) RETURNING id INTO v_new;
  IF p_preload THEN
    INSERT INTO driverpay_payments (company_id, period_id, driver_id, driver_name_snapshot, route_snapshot)
    SELECT p_company_id, v_new, d.id, d.name, d.route
    FROM driverpay_drivers d WHERE d.company_id = p_company_id AND d.active = true;
  END IF;
  RETURN v_new;
END; $$;
GRANT EXECUTE ON FUNCTION public.driverpay_create_period(uuid,text,text,date,date,boolean) TO authenticated, service_role;

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
    total_discounts       = COALESCE(ds.amt,0),
    total_vales           = COALESCE(vl.amt,0),
    total_net             = COALESCE(pk.amt,0) - COALESCE(ds.amt,0) - COALESCE(vl.amt,0),
    updated_at            = now()
  FROM (SELECT id FROM driverpay_payments WHERE period_id = p_period_id) t
  LEFT JOIN LATERAL (SELECT round(SUM(packages * rate_snapshot),2) amt FROM driverpay_payment_packages WHERE payment_id = t.id) pk ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_discounts WHERE payment_id = t.id) ds ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_vales WHERE payment_id = t.id) vl ON true
  WHERE dp.id = t.id;

  UPDATE driverpay_periods SET status = 'concluido', concluded_at = now(), concluded_by = p_user_id WHERE id = p_period_id;

  INSERT INTO driverpay_periods (company_id, label, start_date, end_date, status, created_by)
    VALUES (p_company_id, p_next_label, p_next_start, p_next_end, 'aberto', p_user_id) RETURNING id INTO v_new;

  INSERT INTO driverpay_payments (company_id, period_id, driver_id, driver_name_snapshot, route_snapshot)
  SELECT p_company_id, v_new, d.id, d.name, d.route
  FROM driverpay_drivers d WHERE d.company_id = p_company_id AND d.active = true;

  INSERT INTO driverpay_payment_packages (company_id, payment_id, platform_name, route, packages, rate_snapshot)
  SELECT p_company_id, ndp.id, oldpk.platform_name, oldpk.route, 0, oldpk.rate_snapshot
  FROM driverpay_payments ndp
  JOIN driverpay_payments odp ON odp.driver_id = ndp.driver_id AND odp.period_id = p_period_id
  JOIN driverpay_payment_packages oldpk ON oldpk.payment_id = odp.id
  WHERE ndp.period_id = v_new;

  RETURN v_new;
END; $$;
GRANT EXECUTE ON FUNCTION public.driverpay_conclude_period(uuid,uuid,text,text,date,date) TO authenticated, service_role;

-- ---------- 8. COMMENTS ----------
COMMENT ON TABLE public.driverpay_drivers            IS 'Pagamentos Driver: cadastro de entregadores (iMile). Isolado do produto SPX.';
COMMENT ON TABLE public.driverpay_periods            IS 'Pagamentos Driver: quinzenas. status aberto->concluido (imutavel, gera proxima).';
COMMENT ON TABLE public.driverpay_payments           IS 'Pagamentos Driver: 1 linha por (periodo, driver). Totais congelados na conclusao.';
COMMENT ON TABLE public.driverpay_payment_packages   IS 'Pagamentos Driver: pacotes por (plataforma, rota). Suporta multi-rota e multi-plataforma. rate_snapshot congela o valor/pacote.';

-- ============================================================================
-- ROLLBACK (se precisar):
--   DROP VIEW IF EXISTS public.driverpay_payment_computed;
--   DROP FUNCTION IF EXISTS public.driverpay_conclude_period(uuid,uuid,text,text,date,date);
--   DROP FUNCTION IF EXISTS public.driverpay_create_period(uuid,text,text,date,date,boolean);
--   DROP FUNCTION IF EXISTS public.driverpay_enforce_period_locked() CASCADE;
--   DROP FUNCTION IF EXISTS public.driverpay_enforce_child_company() CASCADE;
--   DROP TABLE IF EXISTS public.driverpay_vales, public.driverpay_discounts, public.driverpay_payment_packages,
--     public.driverpay_payments, public.driverpay_periods, public.driverpay_group_members, public.driverpay_groups,
--     public.driverpay_platform_rates, public.driverpay_platforms, public.driverpay_drivers CASCADE;
-- ============================================================================
