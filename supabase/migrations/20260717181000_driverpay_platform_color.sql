-- Cor da plataforma (escolhida na criacao) para exibir o nome em negrito colorido no
-- cabecalho da grade. Guarda o HEX (ex.: '#ea580c'); null = cor padrao (cinza). Aditivo.
-- Aplicada em prod via MCP apply_migration (2026-07-17).
ALTER TABLE public.driverpay_platforms ADD COLUMN IF NOT EXISTS color text;
