-- Sub-fase 14.4.5: criar tabela monitoring_settings que estava sendo
-- queryada em errorTracking.ts (checkIfEnabled), auditService.ts e
-- database.ts (getMonitoringSettings/updateMonitoringSetting) mas
-- nunca existia em prod (404 no boot toda vez).
CREATE TABLE IF NOT EXISTS public.monitoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb,
  description text,
  updated_by text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.monitoring_settings ENABLE ROW LEVEL SECURITY;

-- SELECT público (errorTracking.checkIfEnabled roda pré-login)
CREATE POLICY "monitoring_settings_public_select" ON public.monitoring_settings
  FOR SELECT TO public USING (true);

-- Modificação só admin master '9999'
CREATE POLICY "monitoring_settings_admin_master_all" ON public.monitoring_settings
  FOR ALL TO public
  USING ((auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((auth.jwt() ->> 'sub') = '9999');

-- Seed: error_tracking_enabled = true (errorTracking.checkIfEnabled lê)
INSERT INTO public.monitoring_settings (setting_key, setting_value, description)
VALUES ('error_tracking_enabled', 'true'::jsonb, 'Habilita captura de erros JS em error_logs')
ON CONFLICT (setting_key) DO NOTHING;
