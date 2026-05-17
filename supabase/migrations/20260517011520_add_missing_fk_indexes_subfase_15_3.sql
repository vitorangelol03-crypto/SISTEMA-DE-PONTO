-- Sub-fase 15.3 (TECH_DEBT 14.B parcial): indexar 23 FKs sem index detectadas
-- pelo advisor unindexed_foreign_keys. Joins em FKs sem index causam seq scan
-- em tabelas com volume. Impacto cresce com volume PN pós-onboarding.
--
-- IF NOT EXISTS: idempotente, seguro re-aplicar.
-- Convenção: idx_<table>_<column> (consistente com padrão Supabase).

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_approved_by ON public.attendance(approved_by);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by ON public.attendance(marked_by);
CREATE INDEX IF NOT EXISTS idx_auto_cleanup_config_updated_by ON public.auto_cleanup_config(updated_by);
CREATE INDEX IF NOT EXISTS idx_bonus_removals_removed_by ON public.bonus_removals(removed_by);
CREATE INDEX IF NOT EXISTS idx_bonuses_created_by ON public.bonuses(created_by);
CREATE INDEX IF NOT EXISTS idx_cleanup_logs_user_id ON public.cleanup_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_data_retention_settings_updated_by ON public.data_retention_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_employees_created_by ON public.employees(created_by);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_by ON public.error_logs(resolved_by);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_records_created_by ON public.error_records(created_by);
CREATE INDEX IF NOT EXISTS idx_face_recognition_config_updated_by ON public.face_recognition_config(updated_by);
CREATE INDEX IF NOT EXISTS idx_payment_periods_created_by ON public.payment_periods(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);
CREATE INDEX IF NOT EXISTS idx_permission_logs_changed_by ON public.permission_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_permission_logs_user_id ON public.permission_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_triage_distribution_employees_distribution_id ON public.triage_distribution_employees(distribution_id);
CREATE INDEX IF NOT EXISTS idx_triage_distribution_employees_employee_id ON public.triage_distribution_employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_triage_error_distributions_distributed_by ON public.triage_error_distributions(distributed_by);
CREATE INDEX IF NOT EXISTS idx_triage_errors_created_by ON public.triage_errors(created_by);
CREATE INDEX IF NOT EXISTS idx_user_permissions_updated_by ON public.user_permissions(updated_by);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON public.users(created_by);
