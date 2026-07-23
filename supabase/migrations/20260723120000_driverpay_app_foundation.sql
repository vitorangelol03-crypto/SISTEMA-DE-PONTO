-- ============================================================================
-- App do Entregador — FASE 0 (fundacao): credencial de login do driver +
-- publicacao de espelho pro app + bucket privado dos espelhos.
-- Namespace driverpay_* : ISOLADO do produto SPX/logistica.
-- 100% ADITIVO: nenhuma tabela/coluna/policy/bucket existente e alterada.
-- Aplicar SOMENTE com OK do Victor (regra do projeto). Rollback no rodape.
-- ============================================================================

-- ---------- 1. TABELAS ----------

-- Credencial de acesso do entregador ao app. Fica FORA de driverpay_drivers
-- (que e lida com select * na UI do painel) pra o hash de senha NUNCA vazar.
-- Linha criada de forma "lazy" no 1o login (edge fn), quando o driver entra
-- com a senha inicial 1234 e e obrigado a trocar (must_change=true).
CREATE TABLE IF NOT EXISTS public.driverpay_driver_auth (
  driver_id       uuid PRIMARY KEY REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  password_hash   text,                                  -- bcrypt; NULL ate a 1a troca
  must_change     boolean     NOT NULL DEFAULT true,     -- forca troca no 1o acesso
  failed_attempts integer     NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until    timestamptz,                           -- bloqueio temporario apos N erros
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Espelho publicado pro app: 1 linha por envio. O painel (2626) cria; o driver
-- destinatario ve via edge fn. Em envio de grupo, driver_id = LIDER (so ele recebe).
CREATE TABLE IF NOT EXISTS public.driverpay_mirror_publications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id       uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  driver_id       uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE, -- destinatario (lider no grupo)
  scope           text NOT NULL DEFAULT 'individual' CHECK (scope IN ('individual','group','selection')),
  group_id        uuid REFERENCES public.driverpay_groups(id) ON DELETE SET NULL,          -- preenchido em scope='group'
  platform_filter jsonb,                                                                    -- array de nomes de plataforma; NULL = todas (D3)
  pdf_path        text NOT NULL CHECK (length(btrim(pdf_path)) > 0),                         -- caminho no bucket privado driverpay-mirrors
  delivered_at    timestamptz NOT NULL DEFAULT now(),
  delivered_by    text REFERENCES public.users(id) ON DELETE SET NULL,
  viewed_at       timestamptz,                                                              -- 1a abertura pelo driver
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- 2. INDICES (convencao idx_<tabela>_<coluna>; toda FK indexada) ----------
CREATE INDEX IF NOT EXISTS idx_driverpay_driver_auth_company     ON public.driverpay_driver_auth(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_mpub_company            ON public.driverpay_mirror_publications(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_mpub_period             ON public.driverpay_mirror_publications(period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_mpub_driver             ON public.driverpay_mirror_publications(driver_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_mpub_group              ON public.driverpay_mirror_publications(group_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_mpub_delivered_by       ON public.driverpay_mirror_publications(delivered_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_mpub_driver_period      ON public.driverpay_mirror_publications(driver_id, period_id);

-- ---------- 3. RLS ----------
-- driverpay_driver_auth: DENY-ALL para authenticated (nenhuma policy permissiva).
-- So o service_role (edge fn driver-public-api) acessa — ele BYPASSA RLS por design.
-- Assim o painel/app com JWT normal nunca le/escreve credencial (hash protegido).
ALTER TABLE public.driverpay_driver_auth ENABLE ROW LEVEL SECURITY;
-- (sem CREATE POLICY: RLS ligada sem policy = tudo negado pra authenticated/anon)

-- driverpay_mirror_publications: mesma policy do modulo (empresa + mestre 9999/2626),
-- pro painel criar/listar as publicacoes. Edge fn (service_role) bypassa.
ALTER TABLE public.driverpay_mirror_publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_mirror_publications;
CREATE POLICY driverpay_rls ON public.driverpay_mirror_publications FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ---------- 4. STORAGE: bucket privado dos espelhos ----------
-- Documento financeiro: bucket PRIVADO (diferente do driverpay-discount-proofs, que e publico).
-- Driver nunca le o bucket direto — recebe link assinado (createSignedUrl) da edge fn.
INSERT INTO storage.buckets (id, name, public)
VALUES ('driverpay-mirrors', 'driverpay-mirrors', false)
ON CONFLICT (id) DO NOTHING;

-- Painel (2626/9999) gera o PDF no cliente e sobe pro bucket; tambem le (aba "Publicacoes").
-- Escrita/leitura do bucket restrita ao mestre; driver acessa so por URL assinada.
DROP POLICY IF EXISTS driverpay_mirrors_master_all ON storage.objects;
CREATE POLICY driverpay_mirrors_master_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'driverpay-mirrors' AND ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (bucket_id = 'driverpay-mirrors' AND ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ---------- 5. COMMENTS ----------
COMMENT ON TABLE public.driverpay_driver_auth          IS 'App do Entregador: credencial de login do driver (CPF+senha bcrypt). DENY-ALL a authenticated; so service_role (edge fn). Criada lazy no 1o login (1234 -> troca).';
COMMENT ON TABLE public.driverpay_mirror_publications  IS 'App do Entregador: espelho publicado pro app (individual/grupo/selecao). Grupo => driver_id e o LIDER. platform_filter (jsonb) guarda o filtro D3; pdf_path no bucket privado driverpay-mirrors.';

-- ============================================================================
-- ROLLBACK (se precisar):
--   DROP POLICY IF EXISTS driverpay_mirrors_master_all ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'driverpay-mirrors';   -- (esvaziar objetos antes)
--   DROP TABLE IF EXISTS public.driverpay_mirror_publications CASCADE;
--   DROP TABLE IF EXISTS public.driverpay_driver_auth CASCADE;
-- ============================================================================
