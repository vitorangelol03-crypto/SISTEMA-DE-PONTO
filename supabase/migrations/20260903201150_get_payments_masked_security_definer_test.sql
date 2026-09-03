-- Fechamento da brecha REST (03/09/2026) — protótipo pra validar o padrão antes de
-- replicar nas outras 13 tabelas. Função SECURITY DEFINER em vez de view: quem chama
-- só precisa de EXECUTE na função (não SELECT na coluna crua), então o REVOKE da
-- tabela funciona de verdade desta vez — sem o problema de hoje (security_invoker
-- exige permissão de coluna do invocador pra QUALQUER coluna referenciada).
--
-- auth.jwt() continua funcionando normal aqui dentro (lê de uma configuração de
-- sessão, não depende do ROLE ativo) — então o mascaramento e o filtro de empresa
-- continuam corretos mesmo rodando como o DONO da function, não como quem pediu.
--
-- Parâmetros explícitos (não filtro via querystring do PostgREST) — evita depender
-- de um comportamento não verificado (filtro em cima de função RPC). Mais verboso,
-- mas testável com certeza.
--
-- Validado com prova real: um papel sem NENHUM privilégio na tabela payments/employees
-- conseguiu ler valor real (com permissão) e valor mascarado (sem permissão) através
-- desta function, e um usuário de outra empresa viu 0 linhas.
CREATE OR REPLACE FUNCTION public.get_payments_masked(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, employee_id uuid, date date, created_by text, created_at timestamptz, updated_at timestamptz,
  company_id uuid, bank_hours_minutes integer, bank_hours_applied_at timestamptz,
  daily_rate numeric, bonus numeric, total numeric, bonus_b numeric, bonus_c1 numeric, bonus_c2 numeric,
  bonus_breakdown jsonb, bank_hours_amount numeric,
  employees jsonb
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  SELECT
    p.id, p.employee_id, p.date, p.created_by, p.created_at, p.updated_at, p.company_id,
    p.bank_hours_minutes, p.bank_hours_applied_at,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.daily_rate ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.total ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_b ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_c1 ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_c2 ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_breakdown ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bank_hours_amount ELSE NULL END,
    jsonb_build_object('id', e.id, 'name', e.name, 'cpf', e.cpf, 'employment_type', e.employment_type)
  FROM public.payments p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.company_id = p_company_id
    AND ((p.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
    AND (p_start_date IS NULL OR p.date >= p_start_date)
    AND (p_end_date IS NULL OR p.date <= p_end_date)
    AND (p_employee_id IS NULL OR p.employee_id = p_employee_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_payments_masked(uuid, date, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_payments_masked(uuid, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payments_masked(uuid, date, date, uuid) FROM anon;
