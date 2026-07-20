-- Valor da plataforma SEPARADO do total nos espelhos (pedido do Victor, 2026-07-20).
-- Acoplado ao destaque (highlight_mirror): so plataforma destacada pode separar valor.
-- Efeito so nos ESPELHOS (PDF/previa): o valor bruto (pacotes x taxa) da plataforma sai
-- numa faixa propria e NAO entra no TOTAL A RECEBER exibido; a aba continua com o total cheio.
ALTER TABLE public.driverpay_platforms
  ADD COLUMN IF NOT EXISTS mirror_separate_value boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.driverpay_platforms.mirror_separate_value IS
  'Espelhos: valor da plataforma sai numa faixa separada e fora do TOTAL A RECEBER exibido (acoplado ao destaque; so onde ha pacotes).';
