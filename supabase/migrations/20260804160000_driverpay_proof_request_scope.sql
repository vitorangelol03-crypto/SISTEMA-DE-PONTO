-- ============================================================================
-- Pedido de espelho POR ENTREGADOR / POR GRUPO  (04/08/2026)
--
-- POR QUÊ: hoje o pedido é gravado por (empresa, quinzena, plataforma) e pronto —
-- quem tem pacote naquela plataforma é cobrado. O Victor precisa poder pedir o print
-- de UM entregador ou de UM grupo só, e não existia onde guardar essa informação.
--
-- COMO: uma coluna `driver_id` que pode ficar VAZIA.
--   · VAZIA        = todo mundo com pacote (exatamente o comportamento de hoje);
--   · PREENCHIDA   = só aquele entregador.
-- Um GRUPO é simplesmente uma linha por membro — sem conceito novo no banco.
--
-- ADITIVA E SEGURA: as linhas que já existem ficam com driver_id vazio, ou seja,
-- continuam significando "todo mundo". Enquanto a edge function `driver-public-api`
-- não for reenviada, NADA muda de comportamento — ela ignora a coluna nova.
-- ============================================================================

ALTER TABLE public.driverpay_proof_requests
  ADD COLUMN IF NOT EXISTS driver_id uuid
    REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.driverpay_proof_requests.driver_id IS
  'NULL = pedido vale pra TODOS os entregadores com pacote nesta plataforma (comportamento '
  'original). Preenchido = o pedido vale SÓ pra este entregador. Um grupo vira N linhas, '
  'uma por membro. ON DELETE CASCADE: apagou o driver, some o pedido dele.';

-- A UNIQUE antiga só permitia UMA linha por (empresa, quinzena, plataforma) — com ela
-- seria impossível pedir de dois entregadores na mesma plataforma. Trocada por dois
-- índices parciais, que mantêm a mesma proteção nos dois mundos:
--   · no máximo um pedido "pra todos" por plataforma;
--   · no máximo um pedido por (plataforma, entregador).
-- (UNIQUE comum não serviria: no Postgres NULLs são distintos entre si, então caberiam
--  várias linhas "pra todos" duplicadas.)
ALTER TABLE public.driverpay_proof_requests
  DROP CONSTRAINT IF EXISTS driverpay_proof_requests_company_id_period_id_platform_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_driverpay_proof_req_todos
  ON public.driverpay_proof_requests (company_id, period_id, platform_name)
  WHERE driver_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_driverpay_proof_req_driver
  ON public.driverpay_proof_requests (company_id, period_id, platform_name, driver_id)
  WHERE driver_id IS NOT NULL;

-- O portal do entregador consulta por driver o tempo todo.
CREATE INDEX IF NOT EXISTS idx_driverpay_proof_req_driver
  ON public.driverpay_proof_requests (driver_id);

-- RLS: a policy da tabela já é por company_id (+ mestres 9999/2626) e vale pra coluna
-- nova sem alteração — não há policy por coluna aqui.

-- ============================================================================
-- ROLLBACK (se precisar desfazer; roda na ordem):
--
-- DROP INDEX IF EXISTS public.idx_driverpay_proof_req_driver;
-- DROP INDEX IF EXISTS public.uq_driverpay_proof_req_driver;
-- DROP INDEX IF EXISTS public.uq_driverpay_proof_req_todos;
-- -- ⚠️ antes de recriar a UNIQUE antiga, apague os pedidos por entregador:
-- --    DELETE FROM public.driverpay_proof_requests WHERE driver_id IS NOT NULL;
-- ALTER TABLE public.driverpay_proof_requests
--   ADD CONSTRAINT driverpay_proof_requests_company_id_period_id_platform_name_key
--   UNIQUE (company_id, period_id, platform_name);
-- ALTER TABLE public.driverpay_proof_requests DROP COLUMN IF EXISTS driver_id;
-- ============================================================================
