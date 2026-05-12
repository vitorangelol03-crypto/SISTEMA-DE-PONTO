-- Sub-fase 11.1 — CUTOVER ATÔMICO.
-- (a) ENABLE RLS nas 32 tabelas core do Sistema de Ponto.
-- (b) DROP COLUMN public.users.password (plain) — fica só password_hash bcrypt.
-- Policies criadas em 11.2 ativam automaticamente.

BEGIN;

DO $$
DECLARE
  tbls text[] := ARRAY[
    'admin_cleanup_config', 'attendance', 'bank_hours_application_log',
    'bank_hours_overrides', 'bonus_blocks', 'bonus_removals', 'bonus_types',
    'bonuses', 'employees', 'error_records', 'face_auth_attempts',
    'face_recognition_config', 'geo_fraud_attempts', 'geolocation_config',
    'payment_period_config', 'payment_periods', 'payments',
    'triage_distribution_employees', 'triage_error_distributions',
    'triage_errors', 'user_permissions', 'users',
    'error_logs',
    'activity_logs', 'admin_cleanup_logs', 'admin_secret', 'audit_logs',
    'auto_cleanup_config', 'cleanup_logs', 'companies', 'data_retention_settings',
    'permission_logs'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END$$;

ALTER TABLE public.users DROP COLUMN IF EXISTS password;

COMMIT;
