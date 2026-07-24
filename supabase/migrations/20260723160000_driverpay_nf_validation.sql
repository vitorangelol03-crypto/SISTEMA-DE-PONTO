-- ============================================================================
-- App do Entregador — VALIDAÇÃO de notas fiscais.
-- Status ganha 'validada' (além de 'recebida'/'rejeitada') + auditoria de validação
-- e motivo da recusa (aparece pro driver no app). A coluna NF do painel passa a mostrar
-- "validadas/esperadas" (verde só quando todas as CNPJs esperadas estão VALIDADAS).
-- 100% ADITIVO: amplia o CHECK (não invalida nenhuma linha — 'recebida'/'rejeitada'
-- continuam válidas) e adiciona 3 colunas NULL. Aplicar com OK do Victor. Rollback no rodapé.
-- ============================================================================

ALTER TABLE public.driverpay_nota_fiscal_files
  DROP CONSTRAINT IF EXISTS driverpay_nota_fiscal_files_status_check;
ALTER TABLE public.driverpay_nota_fiscal_files
  ADD CONSTRAINT driverpay_nota_fiscal_files_status_check
  CHECK (status IN ('recebida','validada','rejeitada'));

ALTER TABLE public.driverpay_nota_fiscal_files ADD COLUMN IF NOT EXISTS validated_at  timestamptz;
ALTER TABLE public.driverpay_nota_fiscal_files ADD COLUMN IF NOT EXISTS validated_by  text REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.driverpay_nota_fiscal_files ADD COLUMN IF NOT EXISTS reject_reason text;

COMMENT ON COLUMN public.driverpay_nota_fiscal_files.status IS
  'recebida (pendente de conferência) | validada (conferida OK, conta pra NF) | rejeitada (errada — driver reenvia)';
COMMENT ON COLUMN public.driverpay_nota_fiscal_files.reject_reason IS
  'Motivo da recusa mostrado pro driver no app (ex.: "foto cortada, envie de novo").';

-- ============================================================================
-- ROLLBACK (se precisar):
--   ALTER TABLE public.driverpay_nota_fiscal_files DROP COLUMN IF EXISTS reject_reason;
--   ALTER TABLE public.driverpay_nota_fiscal_files DROP COLUMN IF EXISTS validated_by;
--   ALTER TABLE public.driverpay_nota_fiscal_files DROP COLUMN IF EXISTS validated_at;
--   ALTER TABLE public.driverpay_nota_fiscal_files DROP CONSTRAINT IF EXISTS driverpay_nota_fiscal_files_status_check;
--   ALTER TABLE public.driverpay_nota_fiscal_files ADD CONSTRAINT driverpay_nota_fiscal_files_status_check
--     CHECK (status IN ('recebida','rejeitada'));  -- (só volte se não houver linha 'validada')
-- ============================================================================
