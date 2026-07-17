-- Fundacao da importacao automatica de planilhas (iMile / Shopee / Anjun).
-- Aplicada em prod via MCP apply_migration (2026-07-17); versionada aqui.
--
-- 1) Caderneta de apelidos: mapeia o nome/login como vem na planilha -> driver
--    cadastrado. O sistema aprende: ao vincular um apelido 1x (ex.: "LUANKALLEBD101"
--    -> Luan Kalleb), reconhece automatico nas proximas importacoes.
-- 2) Remove a trava de "1 periodo aberto por empresa" (permite varios abertos).
--
-- Obs.: a plataforma "Coleta Shopee" e DADO especifico da Caratinga (nao schema),
-- criada a parte via INSERT em driverpay_platforms — nao entra nesta migration
-- versionada para nao hardcodar company_id de producao.

CREATE TABLE IF NOT EXISTS public.driverpay_driver_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  alias_raw text NOT NULL,          -- texto original como veio na planilha
  alias_norm text NOT NULL,         -- normalizado p/ lookup (minusculo, sem acento/codigo/sufixo)
  source text,                      -- 'imile' | 'shopee' | 'anjun' (informativo)
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driverpay_driver_aliases_norm_chk CHECK (length(btrim(alias_norm)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driverpay_alias_company_norm
  ON public.driverpay_driver_aliases (company_id, alias_norm);
CREATE INDEX IF NOT EXISTS idx_driverpay_alias_driver
  ON public.driverpay_driver_aliases (driver_id);

ALTER TABLE public.driverpay_driver_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY driverpay_rls ON public.driverpay_driver_aliases
  FOR ALL
  USING (
    (company_id)::text = COALESCE((SELECT (auth.jwt() ->> 'company_id')), '')
    OR (SELECT (auth.jwt() ->> 'sub')) = ANY (ARRAY['9999','2626'])
  )
  WITH CHECK (
    (company_id)::text = COALESCE((SELECT (auth.jwt() ->> 'company_id')), '')
    OR (SELECT (auth.jwt() ->> 'sub')) = ANY (ARRAY['9999','2626'])
  );

DROP INDEX IF EXISTS public.uq_driverpay_one_open_period;
