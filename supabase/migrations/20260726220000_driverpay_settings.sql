-- =============================================================================
-- DRIVERPAY SETTINGS — chave liga/desliga da AUTO-VALIDAÇÃO de NF (por empresa)
-- =============================================================================
-- Pedido do Victor (26/07, print do modal): botão pra desligar a auto-validação.
-- Desligada, a conferência CONTINUA integral (selos + recusa automática de nota
-- errada) — só a nota certa deixa de entrar 'validada' sozinha: fica 'recebida'
-- pra validação manual. Sem linha na tabela = ligada (padrão).
--
-- Tabela nova e vazia — nenhum dado existente é tocado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driverpay_settings (
  company_id       uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  nf_auto_validate boolean NOT NULL DEFAULT true,
  updated_by       text REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driverpay_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_settings;
CREATE POLICY driverpay_rls ON public.driverpay_settings FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), ''))
         OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), ''))
              OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

COMMENT ON COLUMN public.driverpay_settings.nf_auto_validate IS
  'true (padrão): nota com os 3 checks verdes entra validada sozinha. false: conferência continua (inclusive recusa automática), mas a nota certa fica recebida pra validação manual.';
