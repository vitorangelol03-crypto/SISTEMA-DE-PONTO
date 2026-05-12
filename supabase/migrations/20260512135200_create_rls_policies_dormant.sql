-- Sub-fase 11.2 — criar policies em 32 tabelas core SEM habilitar RLS ainda.
-- Policies ficam DORMENTES até cutover atômico (11.1) que faz ENABLE.
-- Padrão: authenticated + match company_id OR admin master ('9999') bypass.

-- Categoria A — tabelas com `company_id` direto (22)
DO $$
DECLARE
  tbls text[] := ARRAY[
    'admin_cleanup_config', 'attendance', 'bank_hours_application_log',
    'bank_hours_overrides', 'bonus_blocks', 'bonus_removals', 'bonus_types',
    'bonuses', 'employees', 'error_records', 'face_auth_attempts',
    'face_recognition_config', 'geo_fraud_attempts', 'geolocation_config',
    'payment_period_config', 'payment_periods', 'payments',
    'triage_distribution_employees', 'triage_error_distributions',
    'triage_errors', 'user_permissions', 'users'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "rls_company_match_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "rls_company_match_modify" ON public.%I', t);
    EXECUTE format($pol$
      CREATE POLICY "rls_company_match_select" ON public.%I
        FOR SELECT TO authenticated
        USING (
          company_id::text = COALESCE(auth.jwt() ->> 'company_id', '')
          OR auth.jwt() ->> 'sub' = '9999'
        )
    $pol$, t);
    EXECUTE format($pol$
      CREATE POLICY "rls_company_match_modify" ON public.%I
        FOR ALL TO authenticated
        USING (
          company_id::text = COALESCE(auth.jwt() ->> 'company_id', '')
          OR auth.jwt() ->> 'sub' = '9999'
        )
        WITH CHECK (
          company_id::text = COALESCE(auth.jwt() ->> 'company_id', '')
          OR auth.jwt() ->> 'sub' = '9999'
        )
    $pol$, t);
  END LOOP;
END$$;

-- error_logs — company_id NULLABLE (logs pré-login podem ter NULL)
DROP POLICY IF EXISTS "rls_error_logs_admin_or_match" ON public.error_logs;
CREATE POLICY "rls_error_logs_admin_or_match" ON public.error_logs
  FOR ALL TO authenticated
  USING (
    auth.jwt() ->> 'sub' = '9999'
    OR company_id IS NULL
    OR company_id::text = COALESCE(auth.jwt() ->> 'company_id', '')
  )
  WITH CHECK (
    auth.jwt() ->> 'sub' = '9999'
    OR company_id IS NULL
    OR company_id::text = COALESCE(auth.jwt() ->> 'company_id', '')
  );

-- companies: SELECT all authenticated; INSERT/UPDATE/DELETE só admin
DROP POLICY IF EXISTS "rls_companies_select_all" ON public.companies;
DROP POLICY IF EXISTS "rls_companies_admin_modify" ON public.companies;
CREATE POLICY "rls_companies_select_all" ON public.companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_companies_admin_modify" ON public.companies
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'sub' = '9999')
  WITH CHECK (auth.jwt() ->> 'sub' = '9999');

-- admin_secret: ZERO acesso direto (operações via RPC verify/update_admin_secret)
DROP POLICY IF EXISTS "rls_admin_secret_deny_all" ON public.admin_secret;
CREATE POLICY "rls_admin_secret_deny_all" ON public.admin_secret
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Outras tabelas globais admin-only (logs + configs)
DO $$
DECLARE
  admin_tbls text[] := ARRAY[
    'activity_logs', 'admin_cleanup_logs', 'audit_logs',
    'auto_cleanup_config', 'cleanup_logs', 'data_retention_settings',
    'permission_logs'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY admin_tbls
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "rls_admin_only" ON public.%I', t);
    EXECUTE format($pol$
      CREATE POLICY "rls_admin_only" ON public.%I
        FOR ALL TO authenticated
        USING (auth.jwt() ->> 'sub' = '9999')
        WITH CHECK (auth.jwt() ->> 'sub' = '9999')
    $pol$, t);
  END LOOP;
END$$;
