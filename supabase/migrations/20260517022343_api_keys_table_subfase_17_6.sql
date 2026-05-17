-- Sub-fase 17.6: API pública READ-ONLY MVP — tabela api_keys.
-- Cada key é vinculada a 1 empresa, com scope (atualmente só 'read:employees'),
-- created_by (admin), opcional expires_at, e last_used_at pra audit.
--
-- Auth pattern: header `X-API-Key: <key>` na edge fn public-api-v1.
-- RLS: SELECT/ALL apenas admin master 9999 ou usuário da empresa dona da key.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read:employees']::TEXT[],
  created_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  call_count BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_keys_company_id ON public.api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON public.api_keys(created_by);

COMMENT ON TABLE public.api_keys IS 'Sub-fase 17.6: API keys pra acesso REST público read-only';
COMMENT ON COLUMN public.api_keys.key_hash IS 'bcrypt hash da API key (key plain mostrada UMA vez na criação)';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'Primeiros 8 chars da key pra display (ex: sp_abc12...)';
COMMENT ON COLUMN public.api_keys.scopes IS 'Array de scopes — MVP: [read:employees]';

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_api_keys_company_match ON public.api_keys
  FOR ALL
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') = '9999'));
