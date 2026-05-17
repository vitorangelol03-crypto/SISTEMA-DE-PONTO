-- Sub-fase 15.1 (TECH_DEBT 14.B parcial): otimização auth_rls_initplan.
-- Reescreve 55 RLS policies trocando `auth.jwt()` por `(SELECT auth.jwt())`
-- pra cachear o resultado por query (subquery executada uma vez, não per-row).
-- Ganho perf escala com N (rows × policies). Sem mudança de semântica.
--
-- Estrutura: DROP + CREATE em transação implícita (apply_migration).
-- Policy names preservados pra compatibilidade.

-- ════════════════════════════════════════════════════════════════════
-- PATTERN A: rls_admin_only — admin master 9999 acesso total (cmd ALL)
-- 7 tabelas: activity_logs, admin_cleanup_logs, audit_logs,
--           auto_cleanup_config, cleanup_logs, data_retention_settings,
--           permission_logs
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS rls_admin_only ON public.activity_logs;
CREATE POLICY rls_admin_only ON public.activity_logs
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS rls_admin_only ON public.admin_cleanup_logs;
CREATE POLICY rls_admin_only ON public.admin_cleanup_logs
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS rls_admin_only ON public.audit_logs;
CREATE POLICY rls_admin_only ON public.audit_logs
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS rls_admin_only ON public.auto_cleanup_config;
CREATE POLICY rls_admin_only ON public.auto_cleanup_config
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS rls_admin_only ON public.cleanup_logs;
CREATE POLICY rls_admin_only ON public.cleanup_logs
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS rls_admin_only ON public.data_retention_settings;
CREATE POLICY rls_admin_only ON public.data_retention_settings
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS rls_admin_only ON public.permission_logs;
CREATE POLICY rls_admin_only ON public.permission_logs
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

-- ════════════════════════════════════════════════════════════════════
-- PATTERN B/C: rls_company_match_modify (ALL) + rls_company_match_select (SELECT)
-- 22 tabelas × 2 policies = 44 policies
-- NOTA: rls_company_match_select foi dropada em sub-fase 15.2 — manter aqui
-- só pra historico de aplicação cronológica.
-- ════════════════════════════════════════════════════════════════════

-- admin_cleanup_config
DROP POLICY IF EXISTS rls_company_match_modify ON public.admin_cleanup_config;
CREATE POLICY rls_company_match_modify ON public.admin_cleanup_config
  FOR ALL
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'));

DROP POLICY IF EXISTS rls_company_match_select ON public.admin_cleanup_config;
CREATE POLICY rls_company_match_select ON public.admin_cleanup_config
  FOR SELECT
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'));

-- attendance, bank_hours_application_log, bank_hours_overrides, bonus_blocks,
-- bonus_removals, bonus_types, bonuses, employees, error_records,
-- face_auth_attempts, face_recognition_config, geo_fraud_attempts,
-- geolocation_config, payment_period_config, payment_periods, payments,
-- triage_distribution_employees, triage_error_distributions, triage_errors,
-- user_permissions, users — mesmo pattern (DROP + CREATE _modify + _select).
-- 21 tabelas restantes seguem padrão idêntico (omitido aqui pra brevidade —
-- ver original aplicado via Supabase MCP em 2026-05-17 11:18:20Z).

-- ════════════════════════════════════════════════════════════════════
-- PATTERN D: error_logs especial (NULL company_id permitido)
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS rls_error_logs_admin_or_match ON public.error_logs;
CREATE POLICY rls_error_logs_admin_or_match ON public.error_logs
  FOR ALL
  USING (((SELECT auth.jwt() ->> 'sub') = '9999') OR (company_id IS NULL) OR ((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')))
  WITH CHECK (((SELECT auth.jwt() ->> 'sub') = '9999') OR (company_id IS NULL) OR ((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')));

-- ════════════════════════════════════════════════════════════════════
-- VARIAÇÕES ADMIN: companies, feature_versions, monitoring_settings
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS rls_companies_admin_modify ON public.companies;
CREATE POLICY rls_companies_admin_modify ON public.companies
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS feature_versions_admin_master_all ON public.feature_versions;
CREATE POLICY feature_versions_admin_master_all ON public.feature_versions
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

DROP POLICY IF EXISTS monitoring_settings_admin_master_all ON public.monitoring_settings;
CREATE POLICY monitoring_settings_admin_master_all ON public.monitoring_settings
  FOR ALL USING ((SELECT auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = '9999');

-- NOTA: source completo (com todas as 22 tabelas pattern B/C) está disponível
-- via `supabase_migrations.schema_migrations` no DB. Usar Supabase MCP
-- `execute_sql` se precisar replay completo.
