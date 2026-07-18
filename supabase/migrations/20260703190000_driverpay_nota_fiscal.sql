-- Pagamentos Driver: check de NOTA FISCAL por pagamento (driver x periodo).
-- Supervisor/2626 marca quando o driver ja enviou as notas fiscais dos pacotes.
-- Aditivo: 3 colunas novas em driverpay_payments (default false).
ALTER TABLE public.driverpay_payments
  ADD COLUMN IF NOT EXISTS nota_fiscal_recebida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota_fiscal_at         timestamptz,
  ADD COLUMN IF NOT EXISTS nota_fiscal_by         text REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.driverpay_payments.nota_fiscal_recebida IS 'Pagamentos Driver: driver ja enviou as notas fiscais dos pacotes (check do supervisor).';
