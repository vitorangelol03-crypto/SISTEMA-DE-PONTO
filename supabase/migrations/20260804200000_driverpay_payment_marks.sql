-- ============================================================================
-- TAG DE PAGAMENTO CONCLUÍDO  (04/08/2026)
--
-- POR QUÊ: hoje o sistema não sabe quem já recebeu. O relatório é gerado, o dinheiro sai,
-- e na próxima planilha o mesmo entregador pode entrar de novo sem ninguém perceber.
--
-- COMO: ao gerar o relatório, o operador marca "esta planilha é o pagamento de verdade" —
-- e todo mundo que saiu nela ganha uma linha aqui. Se depois ele entrar noutra planilha
-- nas MESMAS plataformas, a tela avisa (e oferece tirar o driver do relatório).
--
-- ⚠️ ISTO É O REGISTRO DE QUEM JÁ RECEBEU. Se errar, alguém é pago duas vezes ou fica sem
-- receber. Por isso:
--   · a marca é por (quinzena, entregador, PLATAFORMA) — decisão do Victor: pagar só a
--     SHOPEE marca só a SHOPEE, e as outras plataformas continuam podendo ser pagas;
--   · guarda QUEM marcou e QUANDO (é a data que a tela mostra no aviso);
--   · num GRUPO, o dinheiro sai numa linha só do líder mas cobre os N membros, então a
--     marcação grava UMA LINHA POR MEMBRO (decisão dele) — senão os membros ficariam
--     eternamente "pendentes" mesmo já tendo sido pagos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.driverpay_payment_marks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id     uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  driver_id     uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  -- string, igual driverpay_payment_packages.platform_name (não é FK de propósito:
  -- plataforma renomeada não pode apagar o registro de que alguém foi pago).
  platform_name text NOT NULL CHECK (length(btrim(platform_name)) > 0),
  paid_at       timestamptz NOT NULL DEFAULT now(),
  paid_by       text REFERENCES public.users(id) ON DELETE SET NULL,
  /** 'geral' | 'simples' — de qual relatório saiu, pra auditoria. */
  report_kind   text,
  UNIQUE (company_id, period_id, driver_id, platform_name)
);

COMMENT ON TABLE public.driverpay_payment_marks IS
  'Quem JA RECEBEU, por (quinzena, entregador, plataforma). Criado quando o operador marca '
  '"esta planilha e o pagamento de verdade" ao gerar o relatorio. Num grupo, grava uma linha '
  'por MEMBRO, porque o dinheiro da linha do lider cobre todos eles.';
COMMENT ON COLUMN public.driverpay_payment_marks.paid_at IS
  'Data que a tela mostra no aviso "este entregador ja foi pago em DD/MM".';

CREATE INDEX IF NOT EXISTS idx_driverpay_pay_marks_periodo
  ON public.driverpay_payment_marks (company_id, period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_pay_marks_driver
  ON public.driverpay_payment_marks (driver_id);

-- RLS: mesmo padrão das outras tabelas driverpay (empresa + mestres 9999/2626).
ALTER TABLE public.driverpay_payment_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_payment_marks;
CREATE POLICY driverpay_rls ON public.driverpay_payment_marks FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.driverpay_payment_marks CASCADE;
-- ============================================================================

-- ---------- ADITIVO (04/08/2026, mesmo dia): o desconto saiu ou não? ----------
-- POR QUÊ: quando o operador DESMARCA "Descontar vales e perdas neste relatório", o
-- pagamento sai PARCIAL — o desconto fica pra sair no pagamento das demais plataformas.
-- Sem registrar isso, é fácil esquecer e o vale nunca ser descontado de ninguém.
ALTER TABLE public.driverpay_payment_marks
  ADD COLUMN IF NOT EXISTS deductions_applied boolean;

COMMENT ON COLUMN public.driverpay_payment_marks.deductions_applied IS
  'Neste pagamento os vales e perdas foram DESCONTADOS? true = sim (o normal). false = '
  'pagamento PARCIAL: as colunas mostraram os valores mas o total NAO abateu, entao o '
  'desconto ainda esta pendente. NULL = marca criada antes desta coluna existir.';
