-- ============================================================================
-- NOTA DIVIDIDA EM 2 NOMES AUTORIZADOS (19/08/2026, decisão do Victor)
--
-- O problema: os melhores drivers estouram o teto do MEI e passaram a dividir a
-- nota "no braço" (quinzena alternada, CNPJ da esposa, "10 mil no meu nome e o
-- resto no de outro") — sem registro e sem controle nenhum no sistema.
--
-- O desenho dele:
--   1. No perfil do driver, cadastrar as pessoas AUTORIZADAS a emitir nota por
--      ele (máx 2 além do próprio) — o robô passa a validar o nome contra essa
--      lista (validação por NOME, como já faz com driver/recebedor).
--   2. No app, ao anexar a nota, ele escolhe a forma: única · 50/50 · 70/30.
--      Escolhida a forma, o app mostra O VALOR EXATO de cada nota.
--   3. Duas notas que somam o espelho validam juntas; a segunda tem 10 MINUTOS
--      pra chegar depois da primeira (o app avisa antes do primeiro envio).
--
-- Tudo ADITIVO: coluna nova nasce NULL (nota única segue exatamente como hoje);
-- tabela nova sem linha = comportamento de sempre.
-- ============================================================================

-- ---------- 1. Nomes autorizados a emitir nota, por driver ----------
CREATE TABLE IF NOT EXISTS public.driverpay_driver_nota_names (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  driver_id   uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),  -- nome como sai na nota (validação é por NOME)
  cnpj        text,                                            -- informativo (não valida por ele)
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, name)
);

CREATE INDEX IF NOT EXISTS idx_driverpay_nfnames_company ON public.driverpay_driver_nota_names(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_nfnames_driver  ON public.driverpay_driver_nota_names(driver_id);

-- Máximo 2 nomes por driver (decisão do Victor: "deixa só dois nomes diferentes
-- no máximo"). Trigger em vez de regra no app: vale pra qualquer caminho de escrita.
CREATE OR REPLACE FUNCTION public.driverpay_nfnames_cap2()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.driverpay_driver_nota_names WHERE driver_id = NEW.driver_id) >= 2 THEN
    RAISE EXCEPTION 'Máximo de 2 nomes autorizados por driver';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_driverpay_nfnames_cap2 ON public.driverpay_driver_nota_names;
CREATE TRIGGER trg_driverpay_nfnames_cap2
  BEFORE INSERT ON public.driverpay_driver_nota_names
  FOR EACH ROW EXECUTE FUNCTION public.driverpay_nfnames_cap2();

-- RLS: mesmo padrão das demais driverpay_* (empresa do JWT ou mestres 9999/2626).
ALTER TABLE public.driverpay_driver_nota_names ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_driver_nota_names;
CREATE POLICY driverpay_rls ON public.driverpay_driver_nota_names FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ---------- 2. A nota aprende a ser METADE de uma dupla ----------
ALTER TABLE public.driverpay_nota_fiscal_files
  -- Valor que a conferência LEU nesta nota (hoje ela lê mas não guarda o número;
  -- sem isso não há como casar a parte 2 com o que falta da parte 1).
  ADD COLUMN IF NOT EXISTS read_value     numeric,
  -- Identidade da DUPLA: as 2 notas do parcelamento compartilham o mesmo grupo.
  -- NULL = nota única (comportamento de sempre).
  ADD COLUMN IF NOT EXISTS split_group    uuid,
  ADD COLUMN IF NOT EXISTS split_form     text CHECK (split_form IN ('50', '70-30')),
  ADD COLUMN IF NOT EXISTS split_part     smallint CHECK (split_part IN (1, 2)),
  -- O valor que ESTA nota devia ter (a fatia mostrada no app na hora da escolha).
  ADD COLUMN IF NOT EXISTS split_expected numeric,
  -- Qual nome autorizado casou nesta nota (a dupla exige nomes DIFERENTES).
  ADD COLUMN IF NOT EXISTS matched_name   text;

CREATE INDEX IF NOT EXISTS idx_driverpay_nff_split_group ON public.driverpay_nota_fiscal_files(split_group) WHERE split_group IS NOT NULL;

-- ---------- 3. COMMENTS ----------
COMMENT ON TABLE public.driverpay_driver_nota_names IS
  'Nota dividida (19/08/2026): nomes AUTORIZADOS a emitir nota por este driver (máx 2, trigger). O robô valida o nome do prestador contra: nome do driver, recebedor_nome e esta lista.';
COMMENT ON COLUMN public.driverpay_nota_fiscal_files.split_group IS
  'Nota dividida: as 2 notas da dupla compartilham este uuid. NULL = nota única. A dupla só valida quando as 2 fatias batem (mesma quinzena/CNPJ, nomes diferentes, 10 min entre a 1ª e a 2ª).';
COMMENT ON COLUMN public.driverpay_nota_fiscal_files.split_expected IS
  'Nota dividida: a fatia que esta nota devia ter (50% ou 70%/30% do espelho, centavo na primeira) — o MESMO número que o app mostrou na escolha da forma.';
COMMENT ON COLUMN public.driverpay_nota_fiscal_files.read_value IS
  'Valor que a conferência leu nesta nota (o candidato que casou). Nota única antiga fica NULL — nada muda pra ela.';

-- ============================================================================
-- ROLLBACK (se precisar):
--   ALTER TABLE public.driverpay_nota_fiscal_files
--     DROP COLUMN IF EXISTS matched_name, DROP COLUMN IF EXISTS split_expected,
--     DROP COLUMN IF EXISTS split_part,   DROP COLUMN IF EXISTS split_form,
--     DROP COLUMN IF EXISTS split_group,  DROP COLUMN IF EXISTS read_value;
--   DROP TRIGGER IF EXISTS trg_driverpay_nfnames_cap2 ON public.driverpay_driver_nota_names;
--   DROP FUNCTION IF EXISTS public.driverpay_nfnames_cap2();
--   DROP TABLE IF EXISTS public.driverpay_driver_nota_names CASCADE;
-- ============================================================================
