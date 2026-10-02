-- ============================================================================
-- DÍVIDA DE QUINZENA FECHADA RELANÇADA COMO DESCONTO NORMAL (02/10/2026)
--
-- POR QUÊ: na 2ª quinzena de agosto, 16 entregadores tiveram perda que saiu no
-- ESPELHO mas não no DINHEIRO (o rombo de 21/09 — espelho publicado antes da planilha
-- de pagamento; consertado em 22/09, `75a0a15`). O Victor mandou cobrar na quinzena
-- aberta "normal, como se não tivesse sido descontado antes e foi agora porque
-- realmente não descontado antes": DESCONTO de verdade (driverpay_discounts, com o
-- código do pacote, aparecendo no espelho igual aos outros) — e não "saldo herdado".
--
-- O BURACO QUE ISTO FECHA: sem um registro na ORIGEM, a tela "Saldo de quinzenas
-- fechadas" continuaria mostrando essas dívidas como pendentes — e um clique em
-- "levar pra quinzena" cobraria tudo DE NOVO. O registro de "esta dívida saiu daqui e
-- foi cobrada em outra quinzena" já existe (driverpay_deduction_carryover, 15/08). Só
-- faltava dizer COMO ela é cobrada no destino:
--   'saldo'     = como sempre: soma no total do destino (selo "herdado" no painel);
--   'descontos' = relançada como descontos normais no destino — os itens já estão em
--                 driverpay_discounts de lá. Este registro só marca a ORIGEM como
--                 resolvida e NÃO pode somar de novo no destino (cobraria em dobro).
--
-- COMO O DESTINO DEIXA DE SOMAR: a RPC que o painel usa pelo DESTINO (`listCarryoverTo`
-- → p_to_period_id preenchido) passa a devolver só 'saldo'. Pela ORIGEM
-- (`listCarryoverFrom`) devolve tudo. Fica no SERVIDOR de propósito: aba velha aberta no
-- navegador (que não recarregou o código) também deixa de somar — sem janela de cobrança
-- em dobro e sem precisar de deploy do painel.
--
-- ENSAIADO antes de aplicar (02/10, transação desfeita): 30 itens / R$ 1.274,79
-- relançados; RPC pelo destino = 0 linhas; pela origem = 16 linhas / R$ 1.274,79; a 2ª
-- de agosto passa a ter pendentes só os 4 que ficaram de fora por decisão (Winglison,
-- Gessiley) ou por não ter o que receber (Fernando, Othon).
-- ============================================================================

ALTER TABLE public.driverpay_deduction_carryover
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'saldo'
  CONSTRAINT driverpay_deduction_carryover_modo_check CHECK (modo IN ('saldo', 'descontos'));

COMMENT ON COLUMN public.driverpay_deduction_carryover.modo IS
  '''saldo'' = soma no total da quinzena de destino (selo "herdado"). ''descontos'' = a '
  'dívida foi relançada como descontos normais no destino (driverpay_discounts); este '
  'registro só marca a origem como resolvida e não soma de novo no destino.';

CREATE OR REPLACE FUNCTION public.get_driverpay_deduction_carryover_masked(
  p_company_id uuid, p_from_period_id uuid, p_to_period_id uuid)
RETURNS TABLE(driver_id uuid, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  )
  SELECT c.driver_id, CASE WHEN cv.ok THEN c.amount ELSE NULL END
  FROM public.driverpay_deduction_carryover c, can_view cv
  WHERE c.company_id = p_company_id
    AND (p_from_period_id IS NULL OR c.from_period_id = p_from_period_id)
    AND (p_to_period_id IS NULL OR c.to_period_id = p_to_period_id)
    -- Pelo DESTINO, só o que soma lá: 'descontos' já está em driverpay_discounts (02/10/2026).
    AND (p_to_period_id IS NULL OR c.modo = 'saldo')
    AND public.driverpay_pode((c.company_id)::uuid, 'view');
$function$;

-- CREATE OR REPLACE mantém os GRANTs; reafirma o fechamento (regra de 31/08: RPC nunca pro anon/PUBLIC).
REVOKE ALL ON FUNCTION public.get_driverpay_deduction_carryover_masked(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driverpay_deduction_carryover_masked(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_driverpay_deduction_carryover_masked(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- ROLLBACK (na ordem):
--   1) recriar a função SEM a linha `AND (p_to_period_id IS NULL OR c.modo = 'saldo')`
--      (corpo igual ao da 20260904013558_driverpay_leva3_functions_discounts_ledger_carryover);
--   2) se já houver linhas 'descontos', apagar os descontos relançados no destino ANTES
--      de apagar a coluna — senão a origem volta a aparecer como pendente E o destino
--      mantém os descontos: cobrança em dobro;
--   3) ALTER TABLE public.driverpay_deduction_carryover DROP COLUMN modo;
-- ============================================================================
