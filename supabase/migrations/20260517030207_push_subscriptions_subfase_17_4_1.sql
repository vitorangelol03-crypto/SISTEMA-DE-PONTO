-- Sub-fase 17.4.1: Firebase Push infra local — tabela push_subscriptions.
-- Cada subscription representa 1 device de 1 funcionário/user.
-- FCM token é renovado pelo client periodicamente — UPSERT por device_id evita duplicação.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('user', 'employee')),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  user_agent TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT push_subscriptions_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_company_id ON public.push_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_fcm_token ON public.push_subscriptions(fcm_token);

COMMENT ON TABLE public.push_subscriptions IS 'Sub-fase 17.4.1: FCM tokens por device pra push notifications';
COMMENT ON COLUMN public.push_subscriptions.user_type IS 'user (admin/supervisor) ou employee (funcionário)';
COMMENT ON COLUMN public.push_subscriptions.device_id IS 'ID único do device (gerado client-side, persistido)';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_push_subscriptions_company_match ON public.push_subscriptions
  FOR ALL
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'));

-- Tabela de logs de envio (audit)
CREATE TABLE IF NOT EXISTS public.push_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sent_by TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('all', 'user', 'employee', 'role')),
  target_id TEXT,
  recipients_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  fcm_response JSONB
);

CREATE INDEX IF NOT EXISTS idx_push_send_log_company_id ON public.push_send_log(company_id);
CREATE INDEX IF NOT EXISTS idx_push_send_log_sent_at ON public.push_send_log(sent_at DESC);

ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_push_send_log_company_match ON public.push_send_log
  FOR ALL
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'));
