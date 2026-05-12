-- Sub-fase 11.0 — Drop de 32 tabelas backup_* legado.
-- Decisão Victor 2026-05-11: backups antigos de migrations passadas sem
-- mecanismo de restore. Mantê-las exigia RLS/policy individual. Drop
-- limpa 32/85 advisors security e remove `backup_pre_v2_users` (que
-- expunha coluna `password` plain).
DROP TABLE IF EXISTS public.backup_attendance_20260420 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_20260422 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_20260425 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_20260427 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_20260428 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_20260429 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_20260430 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_20260501 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_7days_20260425 CASCADE;
DROP TABLE IF EXISTS public.backup_attendance_pre_etapa2 CASCADE;
DROP TABLE IF EXISTS public.backup_bonuses_20260420 CASCADE;
DROP TABLE IF EXISTS public.backup_bonuses_20260501 CASCADE;
DROP TABLE IF EXISTS public.backup_companies_pre_etapa2 CASCADE;
DROP TABLE IF EXISTS public.backup_employees_pre_etapa2 CASCADE;
DROP TABLE IF EXISTS public.backup_error_records_20260501 CASCADE;
DROP TABLE IF EXISTS public.backup_errors_20260420 CASCADE;
DROP TABLE IF EXISTS public.backup_geo_fraud_attempts_20260501 CASCADE;
DROP TABLE IF EXISTS public.backup_payments_20260420 CASCADE;
DROP TABLE IF EXISTS public.backup_payments_20260428 CASCADE;
DROP TABLE IF EXISTS public.backup_payments_20260429 CASCADE;
DROP TABLE IF EXISTS public.backup_payments_20260430 CASCADE;
DROP TABLE IF EXISTS public.backup_payments_20260501 CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_attendance CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_bonus_removals CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_bonuses CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_employees CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_error_records CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_payment_periods CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_payments CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_triage_errors CASCADE;
DROP TABLE IF EXISTS public.backup_pre_v2_users CASCADE;
DROP TABLE IF EXISTS public.backup_triage_errors_20260501 CASCADE;
