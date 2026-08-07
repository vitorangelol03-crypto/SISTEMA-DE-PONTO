-- ============================================================================
-- O ESPELHO PASSA A GUARDAR O QUE FOI IMPRESSO NELE  (07/08/2026)
--
-- POR QUÊ (🔴 achado ao levar o desconto por saldo pro espelho):
-- a conferência automática da nota fiscal NÃO lê o valor do espelho — ela RECALCULA
-- por fórmula (`mirrorExpectedValue`, em driver-public-api/nfCheck.ts):
--     com abate  -> bruto do filtro − vales/perdas
--     sem abate  -> bruto puro
-- Isso funcionava enquanto o abate era tudo-ou-nada. Com o desconto por SALDO
-- (07/08) o espelho pode abater um PEDAÇO — quem deve R$ 97,89 e recebe R$ 28,00
-- tem só R$ 28,00 abatidos. A fórmula continuaria esperando o abate cheio e a fn
-- RECUSARIA a nota certa do entregador, com o motivo errado.
--
-- 🔑 A raiz não é a fórmula estar errada: é ela RECALCULAR em vez de LER. O papel
-- que o entregador tem na mão traz um número; a conferência tem que usar aquele
-- número, não uma reconstituição dele. Guardando o total impresso, espelho e
-- conferência não têm como discordar — nem hoje nem em qualquer regra futura.
--
-- ADITIVO: as duas colunas nascem NULL. Publicação antiga (e o PDF que o driver já
-- baixou) segue conferida pela fórmula de sempre — nenhuma nota já aceita passa a
-- ser recusada.
-- ============================================================================

ALTER TABLE public.driverpay_mirror_publications
  ADD COLUMN IF NOT EXISTS printed_total   numeric(12,2),
  ADD COLUMN IF NOT EXISTS deducted_amount numeric(12,2);

COMMENT ON COLUMN public.driverpay_mirror_publications.printed_total IS
  'O "TOTAL A RECEBER" que saiu IMPRESSO no PDF deste espelho. A conferencia da nota '
  'usa este numero quando ele existe, em vez de recalcular por formula. NULL = publicacao '
  'anterior a 07/08/2026: a fn cai na formula antiga (bruto - vales / bruto puro).';
COMMENT ON COLUMN public.driverpay_mirror_publications.deducted_amount IS
  'Quanto de vale/perda este espelho REALMENTE abateu (pode ser menos que o devido, quando '
  'nao cabia no que a pessoa recebe). Alimenta o livro-caixa driverpay_deduction_ledger: '
  'despublicar o espelho estorna exatamente este valor. NULL = publicacao antiga.';

-- ============================================================================
-- ROLLBACK:
-- ALTER TABLE public.driverpay_mirror_publications
--   DROP COLUMN IF EXISTS printed_total,
--   DROP COLUMN IF EXISTS deducted_amount;
--   (aditiva: derrubar as colunas volta a conferencia da nota pra formula de sempre.)
-- ============================================================================
