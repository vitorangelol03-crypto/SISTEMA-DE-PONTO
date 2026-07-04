-- Pagamentos Driver: marca do pacote no desconto — PNR ou LOST (opcional).
-- Aditivo: 1 coluna com CHECK. NULL = sem marca. Nao muda formula/totais.
ALTER TABLE public.driverpay_discounts
  ADD COLUMN IF NOT EXISTS package_status text
  CHECK (package_status IN ('PNR', 'LOST'));
COMMENT ON COLUMN public.driverpay_discounts.package_status IS 'Marca do pacote no desconto: PNR ou LOST (NULL = sem marca).';
