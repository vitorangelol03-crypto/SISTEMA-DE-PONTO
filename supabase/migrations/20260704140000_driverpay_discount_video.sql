-- Pagamentos Driver: prova de desconto tambem por VIDEO (filmagem das cameras).
-- Aditivo: 1 coluna de caminho de video + ajuste do bucket para aceitar video
-- (limite 50 MB, mime image/* e video/*). Nao muda formula/totais.
ALTER TABLE public.driverpay_discounts
  ADD COLUMN IF NOT EXISTS proof_video_path text;
COMMENT ON COLUMN public.driverpay_discounts.proof_video_path IS 'Caminho no bucket driverpay-discount-proofs do video de prova (filmagem das cameras).';

UPDATE storage.buckets
  SET file_size_limit = 52428800,               -- 50 MB
      allowed_mime_types = ARRAY['image/*','video/*']
  WHERE id = 'driverpay-discount-proofs';
