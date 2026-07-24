-- ============================================================================
-- App do Entregador — RESET DE SENHA pelo mestre (9999/2626).
-- Apaga a linha de auth do driver -> no proximo login ele volta pra senha inicial
-- 1234 (com troca obrigatoria) e o lockout por tentativas e destravado.
-- 100% ADITIVO: adiciona SO uma policy de DELETE em driverpay_driver_auth.
-- NAO adiciona SELECT/UPDATE -> o hash das senhas continua protegido (deny-all de leitura).
-- Aplicar SOMENTE com OK do Victor (regra do projeto). Rollback no rodape.
-- ============================================================================

ALTER TABLE public.driverpay_driver_auth ENABLE ROW LEVEL SECURITY; -- idempotente (ja ligada na fundacao)

-- Permite ao mestre (mesma escopo do modulo: empresa OU 9999/2626) APAGAR a credencial
-- do driver. Sem policy de SELECT: o painel nunca le o hash; o delete usa return=minimal.
DROP POLICY IF EXISTS driverpay_driver_auth_master_delete ON public.driverpay_driver_auth;
CREATE POLICY driverpay_driver_auth_master_delete ON public.driverpay_driver_auth FOR DELETE TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

COMMENT ON POLICY driverpay_driver_auth_master_delete ON public.driverpay_driver_auth IS
  'Reset de senha do app: mestre apaga a auth do driver -> volta pro 1234 (troca obrigatoria) e destrava lockout. SO DELETE; sem SELECT/UPDATE (hash continua protegido).';

-- ============================================================================
-- ROLLBACK (se precisar):
--   DROP POLICY IF EXISTS driverpay_driver_auth_master_delete ON public.driverpay_driver_auth;
-- ============================================================================
