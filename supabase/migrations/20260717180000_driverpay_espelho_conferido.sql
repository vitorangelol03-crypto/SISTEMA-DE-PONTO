-- Espelho conferido por driver/pagamento: check do operador de que o driver enviou
-- o espelho e a quantidade bate com a planilha. Espelha o padrao da Nota Fiscal
-- (nota_fiscal_recebida/_at/_by). Aditivo: ADD COLUMN com DEFAULT false e instantaneo.
-- Aplicada em prod via MCP apply_migration (2026-07-17).
ALTER TABLE public.driverpay_payments
  ADD COLUMN IF NOT EXISTS espelho_conferido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS espelho_conferido_at timestamptz,
  ADD COLUMN IF NOT EXISTS espelho_conferido_by text;
