-- Sub-fase 15.2 (TECH_DEBT 14.B parcial): fix multiple_permissive_policies.
-- 22 tabelas core multi-empresa tinham 2 policies permissivas com mesmo qual:
--   - rls_company_match_modify (cmd ALL): cobre SELECT/INSERT/UPDATE/DELETE
--   - rls_company_match_select (cmd SELECT): redundante (mesmo USING)
-- Postgres OR-eia ambas em SELECT → multiple_permissive_policies warning +
-- overhead 2x na avaliação. Solução: drop rls_company_match_select; cmd ALL
-- no _modify já cobre SELECT com USING idêntico. Mesma semântica.
--
-- IMPORTANTE: NÃO drop _modify — ele tem cmd ALL que cobre INSERT/UPDATE/DELETE.

DROP POLICY IF EXISTS rls_company_match_select ON public.admin_cleanup_config;
DROP POLICY IF EXISTS rls_company_match_select ON public.attendance;
DROP POLICY IF EXISTS rls_company_match_select ON public.bank_hours_application_log;
DROP POLICY IF EXISTS rls_company_match_select ON public.bank_hours_overrides;
DROP POLICY IF EXISTS rls_company_match_select ON public.bonus_blocks;
DROP POLICY IF EXISTS rls_company_match_select ON public.bonus_removals;
DROP POLICY IF EXISTS rls_company_match_select ON public.bonus_types;
DROP POLICY IF EXISTS rls_company_match_select ON public.bonuses;
DROP POLICY IF EXISTS rls_company_match_select ON public.employees;
DROP POLICY IF EXISTS rls_company_match_select ON public.error_records;
DROP POLICY IF EXISTS rls_company_match_select ON public.face_auth_attempts;
DROP POLICY IF EXISTS rls_company_match_select ON public.face_recognition_config;
DROP POLICY IF EXISTS rls_company_match_select ON public.geo_fraud_attempts;
DROP POLICY IF EXISTS rls_company_match_select ON public.geolocation_config;
DROP POLICY IF EXISTS rls_company_match_select ON public.payment_period_config;
DROP POLICY IF EXISTS rls_company_match_select ON public.payment_periods;
DROP POLICY IF EXISTS rls_company_match_select ON public.payments;
DROP POLICY IF EXISTS rls_company_match_select ON public.triage_distribution_employees;
DROP POLICY IF EXISTS rls_company_match_select ON public.triage_error_distributions;
DROP POLICY IF EXISTS rls_company_match_select ON public.triage_errors;
DROP POLICY IF EXISTS rls_company_match_select ON public.user_permissions;
DROP POLICY IF EXISTS rls_company_match_select ON public.users;
