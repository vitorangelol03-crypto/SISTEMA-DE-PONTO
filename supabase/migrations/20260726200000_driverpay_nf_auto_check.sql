-- =============================================================================
-- CONFERÊNCIA AUTOMÁTICA DE NOTA FISCAL — colunas de resultado (Fase 1)
-- =============================================================================
-- Pedido do Victor (26/07): quando a nota chega, o sistema lê o PDF e confere
-- valor (contra o ESPELHO PUBLICADO — regra provada na Fase 0 com 18 notas
-- reais), CNPJ do tomador e nome do emitente (driver OU recebedor cadastrado).
-- Decisão do Victor: não bateu → RECUSA automática com motivo (reusa o fluxo
-- 'rejeitada' + reject_reason, que já reabre o slot no app).
--
-- Aditivo: colunas novas anuláveis em driverpay_nota_fiscal_files.
-- NULL em check_status = nota anterior à feature (nunca conferida).
-- 'pendente' = erro interno na conferência (upload NUNCA falha por causa dela).
-- RLS: tabela já coberta pela policy driverpay_rls — nada muda.
-- =============================================================================

ALTER TABLE public.driverpay_nota_fiscal_files
  ADD COLUMN IF NOT EXISTS check_status text
    CHECK (check_status IN ('ok','divergente','ilegivel','pendente')),
  ADD COLUMN IF NOT EXISTS check_valor boolean,
  ADD COLUMN IF NOT EXISTS check_cnpj boolean,
  ADD COLUMN IF NOT EXISTS check_nome boolean,
  ADD COLUMN IF NOT EXISTS check_details jsonb,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz;

COMMENT ON COLUMN public.driverpay_nota_fiscal_files.check_status IS
  'Conferência automática: ok | divergente | ilegivel | pendente (erro interno). NULL = nunca conferida (anterior à feature).';
COMMENT ON COLUMN public.driverpay_nota_fiscal_files.check_details IS
  'JSON: valores/CNPJs achados no PDF, candidatos esperados, qual bateu, motivos de recusa.';
