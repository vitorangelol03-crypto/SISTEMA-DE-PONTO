-- 03/09/2026: descoberto via CI (teste C2 "Aplicar B=10" quebrado) que
-- INSERT ... ON CONFLICT DO UPDATE em payments TAMBÉM exige SELECT nas
-- colunas de dinheiro referenciadas no SET (via excluded.col) — não é só
-- leitura simples que precisa de function, upsert (usado em "editar diária"
-- e "aplicar bonificação") também. Confirmado empiricamente: UPDATE simples
-- (sem ON CONFLICT) NÃO precisa de SELECT extra, só o upsert.
--
-- Fix: mover os 2 upserts de payments (upsertPayment e o upsert dentro de
-- applyBonusToAllPresent) pra functions SECURITY DEFINER — mesmo padrão de
-- hoje. A function roda com o dono, não precisa de nenhum grant extra pro
-- authenticated na tabela.

CREATE OR REPLACE FUNCTION public.upsert_payment_rate_masked(
  p_employee_id uuid,
  p_date date,
  p_daily_rate numeric,
  p_bonus numeric,
  p_created_by text,
  p_company_id uuid
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT ((p_company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626']))) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  INSERT INTO public.payments (employee_id, date, daily_rate, bonus, total, created_by, updated_at, company_id)
  VALUES (p_employee_id, p_date, p_daily_rate, p_bonus, p_daily_rate + p_bonus, p_created_by, now(), p_company_id)
  ON CONFLICT (employee_id, date) DO UPDATE SET
    daily_rate = excluded.daily_rate,
    bonus = excluded.bonus,
    total = excluded.total,
    created_by = excluded.created_by,
    updated_at = excluded.updated_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_payment_rate_masked(uuid, date, numeric, numeric, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_payment_rate_masked(uuid, date, numeric, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_payment_rate_masked(uuid, date, numeric, numeric, text, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.upsert_payment_bonus_masked(
  p_employee_id uuid,
  p_date date,
  p_daily_rate numeric,
  p_bonus_b numeric,
  p_bonus_c1 numeric,
  p_bonus_c2 numeric,
  p_bonus_breakdown jsonb,
  p_created_by text,
  p_company_id uuid
) RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_bonus numeric := COALESCE(p_bonus_b, 0) + COALESCE(p_bonus_c1, 0) + COALESCE(p_bonus_c2, 0);
BEGIN
  IF NOT ((p_company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626']))) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  INSERT INTO public.payments (employee_id, date, daily_rate, bonus_b, bonus_c1, bonus_c2, bonus, total, bonus_breakdown, created_by, updated_at, company_id)
  VALUES (p_employee_id, p_date, p_daily_rate, p_bonus_b, p_bonus_c1, p_bonus_c2, v_bonus, p_daily_rate + v_bonus, p_bonus_breakdown, p_created_by, now(), p_company_id)
  ON CONFLICT (employee_id, date) DO UPDATE SET
    daily_rate = excluded.daily_rate,
    bonus_b = excluded.bonus_b,
    bonus_c1 = excluded.bonus_c1,
    bonus_c2 = excluded.bonus_c2,
    bonus = excluded.bonus,
    total = excluded.total,
    bonus_breakdown = excluded.bonus_breakdown,
    created_by = excluded.created_by,
    updated_at = excluded.updated_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_payment_bonus_masked(uuid, date, numeric, numeric, numeric, numeric, jsonb, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_payment_bonus_masked(uuid, date, numeric, numeric, numeric, numeric, jsonb, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_payment_bonus_masked(uuid, date, numeric, numeric, numeric, numeric, jsonb, text, uuid) FROM anon;
