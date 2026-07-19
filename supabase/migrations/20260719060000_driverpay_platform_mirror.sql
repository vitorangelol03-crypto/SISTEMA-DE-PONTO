-- Destaque amarelo + aviso por plataforma nos espelhos (pedido do Victor, 2026-07-19).
-- Regra de presença: a UI/PDF só destaca/avisa em espelhos com pacotes>0 da plataforma.
ALTER TABLE public.driverpay_platforms
  ADD COLUMN IF NOT EXISTS highlight_mirror boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mirror_notice text;

COMMENT ON COLUMN public.driverpay_platforms.highlight_mirror IS
  'Espelhos: coluna (grupo) / linha (individual) da plataforma destacada em amarelo — só onde há pacotes.';
COMMENT ON COLUMN public.driverpay_platforms.mirror_notice IS
  'Espelhos: aviso grande/chamativo da plataforma (acoplado ao destaque; com setas) — só onde há pacotes.';
