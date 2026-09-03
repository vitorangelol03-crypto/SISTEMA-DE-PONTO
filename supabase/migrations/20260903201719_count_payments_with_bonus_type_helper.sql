-- getBonusInfoForDate (aba Ponto, fora do escopo de hoje mas não pode quebrar) filtra
-- payments por ".gt(coluna_de_bonus, 0)" — filtrar EM CIMA de uma coluna também exige
-- SELECT nela (mesma regra de hoje), e o formato fixo de get_payments_masked não cobre
-- essa contagem dinâmica. Function pequena e dedicada só pra isto.
CREATE OR REPLACE FUNCTION public.count_payments_with_bonus_type(
  p_company_id uuid,
  p_date date,
  p_bonus_column text
)
RETURNS integer
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE plpgsql
AS $$
DECLARE
  cnt integer;
BEGIN
  IF NOT ((p_company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626']))) THEN
    RETURN 0;
  END IF;
  IF p_bonus_column NOT IN ('bonus_b', 'bonus_c1', 'bonus_c2') THEN
    RAISE EXCEPTION 'coluna de bônus inválida: %', p_bonus_column;
  END IF;
  SELECT count(*) INTO cnt FROM public.payments
  WHERE company_id = p_company_id AND date = p_date
    AND CASE p_bonus_column
          WHEN 'bonus_b' THEN bonus_b
          WHEN 'bonus_c1' THEN bonus_c1
          WHEN 'bonus_c2' THEN bonus_c2
        END > 0;
  RETURN cnt;
END;
$$;
GRANT EXECUTE ON FUNCTION public.count_payments_with_bonus_type(uuid, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.count_payments_with_bonus_type(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_payments_with_bonus_type(uuid, date, text) FROM anon;
