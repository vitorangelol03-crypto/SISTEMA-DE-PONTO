-- 2026-06-27 — Adiciona o usuário mestre '2626' ao bypass de RLS, em paridade
-- total com '9999' (mestre cross-empresa). Troca `= '9999'` por
-- `IN ('9999','2626')` nas 36 policies que referenciam o mestre, preservando:
--   * a otimização initplan  (SELECT auth.jwt() ->> ...)
--   * o ramo de isolamento por empresa  (company_id = jwt.company_id)
-- Aplicada via MCP apply_migration (name: rls_add_master_2626).
-- Verificação real pós-aplicação (SET LOCAL ROLE authenticated + claims):
--   2626 -> 107 funcionários / 2 empresas | 8888(PN) -> 30/1 | 01(Caratinga) -> 77/1
DO $do$
DECLARE
  expr_a text := $q$(( SELECT (auth.jwt() ->> 'sub'::text)) IN ('9999'::text, '2626'::text))$q$;
  expr_b text := $q$(((company_id)::text = COALESCE(( SELECT (auth.jwt() ->> 'company_id'::text)), ''::text)) OR (( SELECT (auth.jwt() ->> 'sub'::text)) IN ('9999'::text, '2626'::text)))$q$;
  expr_c text := $q$((( SELECT (auth.jwt() ->> 'sub'::text)) IN ('9999'::text, '2626'::text)) OR (company_id IS NULL) OR ((company_id)::text = COALESCE(( SELECT (auth.jwt() ->> 'company_id'::text)), ''::text)))$q$;
  rec record;
  expr text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('activity_logs','rls_admin_only','a'),
      ('admin_cleanup_logs','rls_admin_only','a'),
      ('audit_logs','rls_admin_only','a'),
      ('auto_cleanup_config','rls_admin_only','a'),
      ('cleanup_logs','rls_admin_only','a'),
      ('companies','rls_companies_admin_modify','a'),
      ('data_retention_settings','rls_admin_only','a'),
      ('feature_versions','feature_versions_admin_master_all','a'),
      ('monitoring_settings','monitoring_settings_admin_master_all','a'),
      ('permission_logs','rls_admin_only','a'),
      ('admin_cleanup_config','rls_company_match_modify','b'),
      ('api_keys','rls_api_keys_company_match','b'),
      ('attendance','rls_company_match_modify','b'),
      ('bank_hours_application_log','rls_company_match_modify','b'),
      ('bank_hours_overrides','rls_company_match_modify','b'),
      ('bonus_blocks','rls_company_match_modify','b'),
      ('bonus_removals','rls_company_match_modify','b'),
      ('bonus_types','rls_company_match_modify','b'),
      ('bonuses','rls_company_match_modify','b'),
      ('employees','rls_company_match_modify','b'),
      ('error_records','rls_company_match_modify','b'),
      ('face_auth_attempts','rls_company_match_modify','b'),
      ('face_recognition_config','rls_company_match_modify','b'),
      ('geo_fraud_attempts','rls_company_match_modify','b'),
      ('geolocation_config','rls_company_match_modify','b'),
      ('payment_period_config','rls_company_match_modify','b'),
      ('payment_periods','rls_company_match_modify','b'),
      ('payments','rls_company_match_modify','b'),
      ('push_send_log','rls_push_send_log_company_match','b'),
      ('push_subscriptions','rls_push_subscriptions_company_match','b'),
      ('triage_distribution_employees','rls_company_match_modify','b'),
      ('triage_error_distributions','rls_company_match_modify','b'),
      ('triage_errors','rls_company_match_modify','b'),
      ('user_permissions','rls_company_match_modify','b'),
      ('users','rls_company_match_modify','b'),
      ('error_logs','rls_error_logs_admin_or_match','c')
    ) AS t(tbl, pol, pat)
  LOOP
    expr := CASE rec.pat WHEN 'a' THEN expr_a WHEN 'b' THEN expr_b ELSE expr_c END;
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', rec.pol, rec.tbl, expr, expr);
  END LOOP;
END
$do$;
