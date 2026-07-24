-- ============================================================================
-- App do Entregador — FASE 4: líder de grupo. Só o líder recebe o PDF do grupo no app.
-- 100% ADITIVO e IDEMPOTENTE. Aplicar SOMENTE com OK do Victor.
-- ============================================================================

ALTER TABLE public.driverpay_groups
  ADD COLUMN IF NOT EXISTS leader_driver_id uuid REFERENCES public.driverpay_drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_driverpay_groups_leader ON public.driverpay_groups(leader_driver_id);

COMMENT ON COLUMN public.driverpay_groups.leader_driver_id
  IS 'App do Entregador (Fase 4): lider do grupo — so ele recebe o PDF do grupo publicado no app.';

-- ============================================================================
-- ROLLBACK: ALTER TABLE public.driverpay_groups DROP COLUMN IF EXISTS leader_driver_id;
-- ============================================================================
