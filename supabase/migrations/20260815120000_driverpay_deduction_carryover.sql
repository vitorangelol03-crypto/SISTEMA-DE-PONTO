-- ============================================================================
-- SALDO HERDADO ENTRE QUINZENAS (14/08/2026, pedido do Victor)
--
-- POR QUÊ: vale/perda que não foi descontado quando a quinzena fecha fica preso pra
-- sempre — hoje não existe nenhum jeito de "empurrar" essa dívida pra próxima quinzena.
-- A sub-fase A (commit 4a73238) já mostra ONDE está o buraco (tela "Saldo de quinzenas
-- fechadas"); esta migration é a PARTE B: o registro de que um saldo foi migrado.
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO UM VALE/DESCONTO FAKE (driverpay_vales/discounts):
-- essas duas tabelas têm campos de negócio (código do pacote, foto/vídeo de prova) que não
-- fazem sentido pra "sobra de dinheiro" — e um saldo herdado misturado com vale de verdade
-- quebraria a busca por código de pacote (searchDiscounts) e confundiria auditoria ("por
-- que ele tem 2 vales de R$ 70?"). Decisão do Victor (AskUserQuestion, 15/08): conceito
-- próprio, rastreável, aparece separado na tela ("trazido da quinzena de 01/07").
--
-- COMO ENTRA NA CONTA: o app soma o saldo herdado dentro de `deductionsOf()`
-- (driverPayShared.ts) — a MESMA função que já alimenta relatório, espelho, o selo "vale a
-- descontar" e o "marcar pago" — então nenhuma dessas telas precisa saber que carryover
-- existe; ele entra de graça, sem duplicar lógica.
--
-- IDEMPOTÊNCIA: UNIQUE (company_id, from_period_id, driver_id) — o saldo de uma quinzena
-- de origem só pode ser migrado UMA VEZ por driver, pra qualquer destino. Clicar duas vezes
-- ou tentar mandar pra dois lugares diferentes não duplica a dívida.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.driverpay_deduction_carryover (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- A quinzena FECHADA de onde o saldo devedor veio.
  from_period_id uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  -- A quinzena (aberta, escolhida pelo operador) que passa a cobrar esse saldo.
  to_period_id   uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  driver_id      uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  -- Quanto foi herdado, em R$. Sempre positivo — estorno é apagar a linha, não gravar negativo.
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (from_period_id <> to_period_id),
  UNIQUE (company_id, from_period_id, driver_id)
);

COMMENT ON TABLE public.driverpay_deduction_carryover IS
  'Saldo de vale/perda que ficou sem descontar numa quinzena FECHADA e foi migrado pra '
  'outra (aberta, escolhida pelo operador). Uma linha por evento de herança — nunca '
  'mutável; estorno = apagar a linha. Entra na conta de quem deve via deductionsOf().';
COMMENT ON COLUMN public.driverpay_deduction_carryover.amount IS
  'Quanto foi herdado NESTE evento, em R$. Nunca o acumulado de várias quinzenas.';

CREATE INDEX IF NOT EXISTS idx_driverpay_carryover_to
  ON public.driverpay_deduction_carryover (company_id, to_period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_carryover_from
  ON public.driverpay_deduction_carryover (company_id, from_period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_carryover_driver
  ON public.driverpay_deduction_carryover (driver_id);

-- RLS: mesmo padrão das outras tabelas driverpay (empresa + mestres 9999/2626).
ALTER TABLE public.driverpay_deduction_carryover ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_deduction_carryover;
CREATE POLICY driverpay_rls ON public.driverpay_deduction_carryover FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.driverpay_deduction_carryover CASCADE;
-- ============================================================================
