-- ============================================================================
-- App do Entregador — FASE 3 (Nota Fiscal): emitentes (CNPJs) + vinculo
-- plataforma->CNPJ + arquivos de NF enviados pelo driver + bucket privado.
-- Namespace driverpay_* : ISOLADO do produto SPX/logistica.
-- 100% ADITIVO e IDEMPOTENTE. Aplicar SOMENTE com OK do Victor. Rollback no rodape.
-- ============================================================================

-- ---------- 1. TABELAS ----------

-- Emitentes = os CNPJs para os quais o driver emite nota. Ex.: "iMile" (CNPJ A) e
-- "Shopee/Anjun/Loggi" (CNPJ B). Configuravel: a empresa pode ter N emitentes.
CREATE TABLE IF NOT EXISTS public.driverpay_nota_emitters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cnpj        text NOT NULL CHECK (length(btrim(cnpj)) > 0),
  label       text NOT NULL CHECK (length(btrim(label)) > 0),  -- rotulo curto (aparece no app e no nome do arquivo)
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_by  text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, cnpj)
);

-- Vinculo plataforma -> emitente (qual CNPJ fatura aquela plataforma). NULL = ainda nao
-- vinculada (nao gera slot de anexo). Aditivo: nao mexe nas colunas/plataformas existentes.
ALTER TABLE public.driverpay_platforms
  ADD COLUMN IF NOT EXISTS nota_emitter_id uuid REFERENCES public.driverpay_nota_emitters(id) ON DELETE SET NULL;

-- Arquivos de NF enviados pelo driver (1 linha por arquivo; varios por emitente permitido).
CREATE TABLE IF NOT EXISTS public.driverpay_nota_fiscal_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  period_id         uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  payment_id        uuid REFERENCES public.driverpay_payments(id) ON DELETE CASCADE, -- pagamento (periodo,driver); preenchido pela edge fn
  nota_emitter_id   uuid NOT NULL REFERENCES public.driverpay_nota_emitters(id) ON DELETE CASCADE,
  file_path         text NOT NULL CHECK (length(btrim(file_path)) > 0),  -- caminho no bucket privado driverpay-nota-fiscais
  file_type         text,                                                -- mime (image/jpeg, application/pdf...)
  original_filename text,
  status            text NOT NULL DEFAULT 'recebida' CHECK (status IN ('recebida','rejeitada')),
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  uploaded_by       text                                                  -- driver_id (o driver que enviou); sem FK (driver nao e users)
);

-- ---------- 2. INDICES (idx_<tabela>_<coluna>; toda FK indexada) ----------
CREATE INDEX IF NOT EXISTS idx_driverpay_emitters_company    ON public.driverpay_nota_emitters(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_emitters_created_by ON public.driverpay_nota_emitters(created_by);
CREATE INDEX IF NOT EXISTS idx_driverpay_platforms_emitter   ON public.driverpay_platforms(nota_emitter_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_nff_company         ON public.driverpay_nota_fiscal_files(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_nff_driver          ON public.driverpay_nota_fiscal_files(driver_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_nff_period          ON public.driverpay_nota_fiscal_files(period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_nff_payment         ON public.driverpay_nota_fiscal_files(payment_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_nff_emitter         ON public.driverpay_nota_fiscal_files(nota_emitter_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_nff_driver_period   ON public.driverpay_nota_fiscal_files(driver_id, period_id);

-- ---------- 3. RLS (mesma policy do modulo: empresa + mestre 9999/2626) ----------
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['driverpay_nota_emitters','driverpay_nota_fiscal_files'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS driverpay_rls ON public.%I;', t);
    EXECUTE format($p$CREATE POLICY driverpay_rls ON public.%I FOR ALL TO authenticated
      USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
      WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));$p$, t);
  END LOOP;
END $rls$;

-- ---------- 4. STORAGE: bucket privado das notas fiscais ----------
-- Documento fiscal: bucket PRIVADO. Driver sobe pela edge fn (service_role); painel
-- (2626/9999) le/baixa por signed URL. Sem policy anon.
INSERT INTO storage.buckets (id, name, public)
VALUES ('driverpay-nota-fiscais', 'driverpay-nota-fiscais', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS driverpay_nf_master_all ON storage.objects;
CREATE POLICY driverpay_nf_master_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'driverpay-nota-fiscais' AND ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (bucket_id = 'driverpay-nota-fiscais' AND ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ---------- 5. COMMENTS ----------
COMMENT ON TABLE public.driverpay_nota_emitters       IS 'App do Entregador: emitentes (CNPJs) para os quais o driver emite nota. Plataformas vinculam via driverpay_platforms.nota_emitter_id.';
COMMENT ON TABLE public.driverpay_nota_fiscal_files   IS 'App do Entregador: arquivos de NF enviados pelo driver (bucket privado driverpay-nota-fiscais). 1 linha por arquivo; multiplos por (driver,periodo,emitente) permitido.';
COMMENT ON COLUMN public.driverpay_platforms.nota_emitter_id IS 'App do Entregador: CNPJ/emitente que fatura esta plataforma (NULL = nao vinculada; nao gera slot de anexo no app).';

-- ============================================================================
-- ROLLBACK (se precisar):
--   DROP POLICY IF EXISTS driverpay_nf_master_all ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'driverpay-nota-fiscais';   -- (esvaziar objetos antes)
--   DROP TABLE IF EXISTS public.driverpay_nota_fiscal_files CASCADE;
--   ALTER TABLE public.driverpay_platforms DROP COLUMN IF EXISTS nota_emitter_id;
--   DROP TABLE IF EXISTS public.driverpay_nota_emitters CASCADE;
-- ============================================================================
