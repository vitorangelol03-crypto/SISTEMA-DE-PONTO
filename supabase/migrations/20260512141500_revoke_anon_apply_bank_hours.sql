-- Sub-fase 11.5 — Revoke anon EXECUTE em apply_bank_hours_to_payment.
-- Função SECURITY DEFINER que altera payments — só authenticated (supervisor/admin).
REVOKE EXECUTE ON FUNCTION public.apply_bank_hours_to_payment(
  uuid, uuid, uuid, uuid, text, numeric, integer, numeric, integer, integer,
  integer, text, numeric, numeric, numeric, numeric, numeric, numeric, boolean, date, date
) FROM anon;
