-- Sub-fase 8.5 (TECH_DEBT 6.8): RPC transacional pra encapsular as 3 ops do
-- applyBankHoursToPayment (UPDATE payment + INSERT log + UPDATE attendance
-- zero_balance) em uma única transação atômica.
--
-- Pre-fix: 3 ops sequenciais no TS. Se a 2ª falhasse, payment ficava marcado
-- como "aplicado" mas sem log de auditoria → estado inconsistente.
-- Pós-fix: BEGIN/COMMIT implícito do PL/pgSQL. Falha em qualquer step
-- reverte TUDO (incluindo o UPDATE payment).
--
-- SECURITY DEFINER pra contornar RLS futuro (sub-fase 11.x). Função
-- explicitamente verifica que o payment pertence ao company_id passado
-- pra evitar elevation of privilege.

CREATE OR REPLACE FUNCTION public.apply_bank_hours_to_payment(
  p_payment_id uuid,
  p_employee_id uuid,
  p_company_id uuid,
  p_payment_period_id uuid,
  p_supervisor_id text,
  p_bank_hours_amount numeric,
  p_bank_hours_minutes integer,
  p_total_after numeric,
  p_credit_minutes integer,
  p_debit_minutes integer,
  p_net_minutes integer,
  p_formula_used text,
  p_hour_value numeric,
  p_extra_multiplier numeric,
  p_amount_credit numeric,
  p_amount_debit numeric,
  p_amount_net numeric,
  p_total_before numeric,
  p_zero_balance boolean,
  p_range_start date,
  p_range_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id uuid;
  v_payment_company uuid;
  v_now timestamptz := now();
BEGIN
  -- Validação de pertencimento: payment realmente é desse company_id?
  -- Previne elevation of privilege (caller passa company_id falso).
  SELECT company_id INTO v_payment_company FROM payments WHERE id = p_payment_id;
  IF v_payment_company IS NULL THEN
    RAISE EXCEPTION 'Payment % não encontrado', p_payment_id;
  END IF;
  IF v_payment_company <> p_company_id THEN
    RAISE EXCEPTION 'Payment % não pertence à empresa %', p_payment_id, p_company_id;
  END IF;

  -- 1. UPDATE payment (mesma semântica do TS pré-fix).
  UPDATE payments SET
    bank_hours_amount = p_bank_hours_amount,
    bank_hours_minutes = p_bank_hours_minutes,
    bank_hours_applied_at = v_now,
    total = p_total_after,
    updated_at = v_now
  WHERE id = p_payment_id;

  -- 2. INSERT log de auditoria. RAISE EXCEPTION (failure) faz ROLLBACK
  --    da transação inteira, revertendo o UPDATE acima.
  INSERT INTO bank_hours_application_log (
    company_id, employee_id, payment_period_id, applied_at, applied_by,
    bank_credit_minutes, bank_debit_minutes, net_balance_minutes,
    formula_used, hour_value_used, extra_multiplier_used,
    amount_credit, amount_debit, amount_net,
    payment_total_before, payment_total_after
  ) VALUES (
    p_company_id, p_employee_id, p_payment_period_id, v_now, p_supervisor_id,
    p_credit_minutes, p_debit_minutes, p_net_minutes,
    p_formula_used, p_hour_value, p_extra_multiplier,
    p_amount_credit, p_amount_debit, p_amount_net,
    p_total_before, p_total_after
  ) RETURNING id INTO v_log_id;

  -- 3. UPDATE attendance zero_balance (opcional via flag). Falha aqui
  --    também faz ROLLBACK das 2 primeiras operações.
  IF p_zero_balance THEN
    UPDATE attendance SET
      bank_credit_minutes = 0,
      bank_debit_minutes = 0
    WHERE employee_id = p_employee_id
      AND date BETWEEN p_range_start AND p_range_end;
  END IF;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.apply_bank_hours_to_payment IS
  'Sub-fase 8.5: encapsula as 3 ops do apply em transação atômica. Se qualquer step falhar, rollback completo. SECURITY DEFINER + validação de company_id pertencimento.';

GRANT EXECUTE ON FUNCTION public.apply_bank_hours_to_payment TO anon, authenticated, service_role;
