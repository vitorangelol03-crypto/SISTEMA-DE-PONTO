-- ============================================================================
-- LIVRO-CAIXA DO DESCONTO DE VALE/PERDA  (07/08/2026)
--
-- POR QUÊ: pagando por plataforma (paga a Shopee, depois paga a eMile), o "Descontar vales
-- e perdas" era um interruptor só, pra planilha inteira — e as DUAS posições erram:
--   · marcado   -> desconta de quem já foi descontado na Shopee (cobrança em dobro);
--   · desmarcado-> não desconta de quem só entrega eMile e nunca foi descontado.
-- Medido em produção na 1a quinzena de julho no dia do pedido: 25 pessoas com vale/perda
-- somando R$ 1.885,14, TODAS já descontadas — marcar a caixa cobraria tudo de novo.
--
-- Pedido do Victor: "aplicar os descontos sem que o cara que entrega shopee e eMile tome
-- desconto duas vezes e o cara que entrega eMile tome seu desconto".
--
-- COMO: o desconto vira SALDO, igual conta a pagar. Cada pessoa deve (vales + perdas) na
-- quinzena; cada pagamento abate um pedaço e grava a linha aqui. O que falta abater é
-- (total devido - soma do que já foi abatido).
--
-- 🔑 DECISÃO DELE ("guardar o que sobrou"): nunca se abate mais do que a pessoa RECEBE
-- naquele pagamento. Quem deve R$ 97,89 e recebe R$ 28,00 da plataforma sendo paga tem
-- R$ 28,00 abatidos agora e continua devendo R$ 69,89 — antes disso a linha dele sairia
-- -R$ 69,89 numa planilha de PAGAMENTO. (Casos reais medidos: JOAO PEDRO DA SILVEIRA
-- SILVA 97,89 x 28,00 e Bruno Eduardo Silva 59,99 x 34,00.)
--
-- ⚠️ ESTE É O REGISTRO DE QUANTO JÁ FOI COBRADO DE CADA PESSOA. Errar aqui significa
-- cobrar duas vezes ou nunca cobrar. Por isso a tabela só CRESCE (uma linha por evento de
-- abate, nunca um saldo mutável): dá pra auditar de onde veio cada centavo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.driverpay_deduction_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id   uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  driver_id   uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  -- Quanto foi abatido NESTE evento (nunca o acumulado). Positivo sempre: estorno se faz
  -- apagando a linha do evento (ex.: despublicar espelho), não lançando valor negativo.
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  -- De onde veio o abate:
  --   'relatorio' = planilha de pagamento marcada como "este é o pagamento de verdade";
  --   'espelho'   = publicação de espelho que abateu vale/perda;
  --   'backfill'  = o que já havia sido abatido antes desta tabela existir.
  source      text NOT NULL CHECK (source IN ('relatorio', 'espelho', 'backfill')),
  -- Identidade do evento, pro mesmo evento não abater duas vezes:
  --   'relatorio' -> id da rodada (uuid gerado ao gerar o arquivo);
  --   'espelho'   -> platform_key da publicação (despublicar apaga esta linha);
  --   'backfill'  -> o rótulo da carga inicial.
  source_ref  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (company_id, period_id, driver_id, source, source_ref)
);

COMMENT ON TABLE public.driverpay_deduction_ledger IS
  'Livro-caixa do desconto de vale/perda: uma linha por EVENTO de abate (quinzena, '
  'entregador, quanto, de onde veio). O que a pessoa ainda deve = (vales + perdas do '
  'pagamento) - (soma das linhas dela nesta quinzena). So cresce; estorno = apagar a linha.';
COMMENT ON COLUMN public.driverpay_deduction_ledger.amount IS
  'Quanto foi abatido NESTE evento, em R$. Nunca o acumulado.';
COMMENT ON COLUMN public.driverpay_deduction_ledger.source_ref IS
  'Identidade do evento (rodada do relatorio / platform_key do espelho). Com o UNIQUE, '
  'repetir o MESMO evento nao abate de novo.';

CREATE INDEX IF NOT EXISTS idx_driverpay_ded_ledger_periodo
  ON public.driverpay_deduction_ledger (company_id, period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_ded_ledger_driver
  ON public.driverpay_deduction_ledger (period_id, driver_id);

-- RLS: mesmo padrão das outras tabelas driverpay (empresa + mestres 9999/2626).
ALTER TABLE public.driverpay_deduction_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_deduction_ledger;
CREATE POLICY driverpay_rls ON public.driverpay_deduction_ledger FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ============================================================================
-- CARGA INICIAL (backfill) — OBRIGATÓRIA, e no MESMO passo da criação da tabela.
--
-- Sem isso o sistema esqueceria tudo que já foi descontado e cobraria de novo de todo
-- mundo no próximo relatório. Quem já teve o abate (marca de pagamento com desconto OU
-- espelho publicado com desconto, sendo que espelho de GRUPO cobre os membros) entra aqui
-- com o valor devido de hoje = tratado como QUITADO.
--
-- ⚠️ Escolha consciente: usa o valor de HOJE porque o valor da época não foi guardado
-- (a coluna antiga era só um sim/não). Efeito: no instante da migration ninguém muda de
-- situação — é exatamente o comportamento atual. Vale/perda lançado DEPOIS daqui aparece
-- como saldo devedor, que é o certo.
--
-- CRITÉRIO DE ACEITE (medido antes de aplicar, na 1a quinzena de julho):
--   25 pessoas com vale/perda · R$ 1.885,14 · 25 já descontadas · 0 pendentes.
--   Depois desta carga, a mesma conta tem que dar 25 quitadas e 0 pendentes.
-- ============================================================================

INSERT INTO public.driverpay_deduction_ledger
  (company_id, period_id, driver_id, amount, source, source_ref)
WITH devido AS (
  SELECT pay.company_id, pay.period_id, pay.driver_id,
         ROUND((COALESCE(pay.total_vales, 0) + COALESCE(pay.total_discounts, 0))::numeric, 2) AS valor
  FROM public.driverpay_payments pay
  WHERE COALESCE(pay.total_vales, 0) + COALESCE(pay.total_discounts, 0) > 0
),
-- Coberto por espelho publicado COM abate. `IS DISTINCT FROM false` = NULL conta como
-- true, igual o painel faz (`include_deductions !== false`).
por_espelho AS (
  SELECT mp.company_id, mp.period_id, mp.driver_id
  FROM public.driverpay_mirror_publications mp
  WHERE mp.include_deductions IS DISTINCT FROM false
  UNION
  -- Espelho de GRUPO é publicado no líder mas cobre todos os membros.
  SELECT mp.company_id, mp.period_id, gm.driver_id
  FROM public.driverpay_mirror_publications mp
  JOIN public.driverpay_group_members gm ON gm.group_id = mp.group_id
  WHERE mp.include_deductions IS DISTINCT FROM false
    AND mp.scope = 'group'
    AND mp.group_id IS NOT NULL
),
por_marca AS (
  SELECT DISTINCT m.company_id, m.period_id, m.driver_id
  FROM public.driverpay_payment_marks m
  WHERE m.deductions_applied IS TRUE
)
SELECT d.company_id, d.period_id, d.driver_id, d.valor, 'backfill', 'inicial-2026-08-07'
FROM devido d
WHERE EXISTS (
        SELECT 1 FROM por_espelho e
        WHERE e.company_id = d.company_id AND e.period_id = d.period_id AND e.driver_id = d.driver_id)
   OR EXISTS (
        SELECT 1 FROM por_marca m
        WHERE m.company_id = d.company_id AND m.period_id = d.period_id AND m.driver_id = d.driver_id)
ON CONFLICT (company_id, period_id, driver_id, source, source_ref) DO NOTHING;

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.driverpay_deduction_ledger CASCADE;
--   (a tabela é aditiva: derrubá-la volta o sistema ao comportamento de 06/08/2026,
--    porque nenhuma tabela existente foi alterada por esta migration.)
-- ============================================================================
