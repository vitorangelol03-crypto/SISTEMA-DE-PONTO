-- Pagamentos Driver: PROVA de desconto (ate 2 imagens) + busca de pacotes descontados.
-- Aditivo: 2 colunas de caminho de imagem em driverpay_discounts + bucket publico
-- de Storage (escrita so 2626/9999; leitura via URL publica). Nao muda formula/totais.

-- 1. Colunas de caminho das imagens de prova (no Storage). NULL = sem imagem.
ALTER TABLE public.driverpay_discounts
  ADD COLUMN IF NOT EXISTS proof1_path text,
  ADD COLUMN IF NOT EXISTS proof2_path text;
COMMENT ON COLUMN public.driverpay_discounts.proof1_path IS 'Caminho no bucket driverpay-discount-proofs (prova 1 do desconto).';

-- 2. Bucket publico das provas (idempotente).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('driverpay-discount-proofs', 'driverpay-discount-proofs', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. RLS no storage.objects escopado a este bucket: escrita/gestao so mestre 2626/9999.
--    Leitura de exibicao e via URL publica (bucket public=true nao passa por RLS de SELECT).
DROP POLICY IF EXISTS driverpay_proof_insert ON storage.objects;
CREATE POLICY driverpay_proof_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driverpay-discount-proofs' AND (SELECT auth.jwt() ->> 'sub') IN ('9999','2626'));

DROP POLICY IF EXISTS driverpay_proof_select ON storage.objects;
CREATE POLICY driverpay_proof_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'driverpay-discount-proofs' AND (SELECT auth.jwt() ->> 'sub') IN ('9999','2626'));

DROP POLICY IF EXISTS driverpay_proof_delete ON storage.objects;
CREATE POLICY driverpay_proof_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'driverpay-discount-proofs' AND (SELECT auth.jwt() ->> 'sub') IN ('9999','2626'));
