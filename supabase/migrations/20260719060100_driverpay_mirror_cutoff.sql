-- Aviso de corte das notas nos espelhos (pedido do Victor, 2026-07-19):
-- "as notas deverão ser enviadas até as {cutoff_time} do dia {cutoff_date}…
--  Caso exceda o horário de corte seu pagamento vai ocorrer dia {late_payment_date}"
-- Valores salvos automaticamente ao gerar espelho; 1 linha por empresa.
CREATE TABLE IF NOT EXISTS public.driverpay_mirror_notice (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  cutoff_time text NOT NULL,
  cutoff_date text NOT NULL,
  late_payment_date text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driverpay_mirror_notice ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão das demais driverpay_*: empresa do JWT OU mestres 9999/2626.
CREATE POLICY driverpay_rls ON public.driverpay_mirror_notice
  FOR ALL
  USING (
    (company_id)::text = COALESCE((SELECT (auth.jwt() ->> 'company_id')), '')
    OR (SELECT (auth.jwt() ->> 'sub')) = ANY (ARRAY['9999','2626'])
  )
  WITH CHECK (
    (company_id)::text = COALESCE((SELECT (auth.jwt() ->> 'company_id')), '')
    OR (SELECT (auth.jwt() ->> 'sub')) = ANY (ARRAY['9999','2626'])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driverpay_mirror_notice TO anon, authenticated;
