-- Fechamento da brecha REST (03/09/2026), continuação — mesmo padrão validado com
-- prova real (payments). Functions SECURITY DEFINER pras 4 tabelas mais simples
-- de hoje (error_records, triage_errors, triage_distribution_employees,
-- bonus_removals). Ainda não mexe em GRANT/REVOKE da tabela crua nem no código do
-- cliente (isso vem na migration final_revoke, depois do código atualizado e
-- validado com E2E).

CREATE OR REPLACE FUNCTION public.get_error_records_masked(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, employee_id uuid, date date, error_count integer, observations text,
  created_by text, created_at timestamptz, updated_at timestamptz, error_type text, company_id uuid,
  error_value numeric, employees jsonb
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  SELECT er.id, er.employee_id, er.date, er.error_count, er.observations, er.created_by, er.created_at, er.updated_at, er.error_type, er.company_id,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
         THEN er.error_value ELSE NULL END,
    jsonb_build_object('id', e.id, 'name', e.name, 'cpf', e.cpf, 'employment_type', e.employment_type)
  FROM public.error_records er
  JOIN public.employees e ON e.id = er.employee_id
  WHERE er.company_id = p_company_id
    AND ((er.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
    AND (p_start_date IS NULL OR er.date >= p_start_date)
    AND (p_end_date IS NULL OR er.date <= p_end_date)
    AND (p_employee_id IS NULL OR er.employee_id = p_employee_id);
$$;
GRANT EXECUTE ON FUNCTION public.get_error_records_masked(uuid, date, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_error_records_masked(uuid, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_error_records_masked(uuid, date, date, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.get_triage_errors_masked(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid, date date, error_count integer, observations text, created_by text, created_at timestamptz,
  updated_at timestamptz, triage_type text, company_id uuid, direct_value numeric
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  SELECT t.id, t.date, t.error_count, t.observations, t.created_by, t.created_at, t.updated_at, t.triage_type, t.company_id,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
         THEN t.direct_value ELSE NULL END
  FROM public.triage_errors t
  WHERE t.company_id = p_company_id
    AND ((t.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
    AND (p_start_date IS NULL OR t.date >= p_start_date)
    AND (p_end_date IS NULL OR t.date <= p_end_date);
$$;
GRANT EXECUTE ON FUNCTION public.get_triage_errors_masked(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_triage_errors_masked(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_triage_errors_masked(uuid, date, date) FROM anon;

CREATE OR REPLACE FUNCTION public.get_triage_distribution_employees_masked(
  p_company_id uuid,
  p_employee_ids uuid[],
  p_distribution_ids uuid[]
)
RETURNS TABLE (
  id uuid, distribution_id uuid, employee_id uuid, errors_share integer, created_at timestamptz,
  company_id uuid, value_deducted numeric
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  SELECT tde.id, tde.distribution_id, tde.employee_id, tde.errors_share, tde.created_at, tde.company_id,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
         THEN tde.value_deducted ELSE NULL END
  FROM public.triage_distribution_employees tde
  WHERE tde.company_id = p_company_id
    AND ((tde.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
    AND tde.employee_id = ANY (p_employee_ids)
    AND tde.distribution_id = ANY (p_distribution_ids);
$$;
GRANT EXECUTE ON FUNCTION public.get_triage_distribution_employees_masked(uuid, uuid[], uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_triage_distribution_employees_masked(uuid, uuid[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_triage_distribution_employees_masked(uuid, uuid[], uuid[]) FROM anon;

CREATE OR REPLACE FUNCTION public.get_bonus_removals_masked(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, employee_id uuid, date date, observation text, removed_by text, removed_at timestamptz,
  created_at timestamptz, bonus_type text, company_id uuid, bonus_type_id uuid,
  bonus_amount_removed numeric, employees jsonb
)
SECURITY DEFINER
SET search_path = public
STABLE
LANGUAGE sql
AS $$
  SELECT br.id, br.employee_id, br.date, br.observation, br.removed_by, br.removed_at, br.created_at, br.bonus_type, br.company_id, br.bonus_type_id,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
         THEN br.bonus_amount_removed ELSE NULL END,
    jsonb_build_object('id', e.id, 'name', e.name, 'cpf', e.cpf)
  FROM public.bonus_removals br
  JOIN public.employees e ON e.id = br.employee_id
  WHERE br.company_id = p_company_id
    AND ((br.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
    AND (p_start_date IS NULL OR br.date >= p_start_date)
    AND (p_end_date IS NULL OR br.date <= p_end_date)
    AND (p_employee_id IS NULL OR br.employee_id = p_employee_id)
  ORDER BY br.removed_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_bonus_removals_masked(uuid, date, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_bonus_removals_masked(uuid, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bonus_removals_masked(uuid, date, date, uuid) FROM anon;
