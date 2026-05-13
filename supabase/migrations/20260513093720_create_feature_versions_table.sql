-- Sub-fase 14.4.1: criar tabela feature_versions que estava sendo
-- queryada em tutorialService.ts mas nunca existia em prod (404 em
-- console toda vez que TutorialTab é montada).
CREATE TABLE IF NOT EXISTS public.feature_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  version text NOT NULL DEFAULT '1.0',
  description text,
  release_date timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.feature_versions ENABLE ROW LEVEL SECURITY;

-- SELECT público (frontend lê sem login pra detectar badge "Novo")
CREATE POLICY "feature_versions_public_select" ON public.feature_versions
  FOR SELECT TO public USING (true);

-- Modificação só admin master '9999' (release notes via UI futura)
CREATE POLICY "feature_versions_admin_master_all" ON public.feature_versions
  FOR ALL TO public
  USING ((auth.jwt() ->> 'sub') = '9999')
  WITH CHECK ((auth.jwt() ->> 'sub') = '9999');
