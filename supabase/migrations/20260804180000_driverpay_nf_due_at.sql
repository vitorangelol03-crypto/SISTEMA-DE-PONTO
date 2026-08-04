-- ============================================================================
-- PRAZO DA NOTA FISCAL, POR ESPELHO  (04/08/2026)
--
-- POR QUÊ: hoje não existe hora combinada pra nota chegar, então não dá pra dizer quem
-- atrasou. O Victor quer que cada espelho publicado carregue o SEU prazo ("manda a nota
-- até dia 3 às 18h") e que o painel separe as notas que chegaram depois.
--
-- COMO: uma coluna de data+hora na publicação do espelho. A comparação com o
-- `uploaded_at` da nota é feita NA HORA DE MOSTRAR, não gravada — se o prazo for
-- corrigido depois, a tela se ajusta sozinha em vez de guardar um "atrasada" que virou
-- mentira.
--
-- ⚠️ POR QUE A COLUNA É NULLABLE, mesmo o Victor tendo escolhido "prazo OBRIGATÓRIO":
-- os espelhos JÁ PUBLICADOS não têm prazo e não dá pra inventar um pra eles — cobrar
-- alguém por um horário que ninguém combinou seria errado. Então: o painel EXIGE o prazo
-- pra publicar daqui pra frente (botão travado sem ele), e as publicações antigas ficam
-- com NULL, que a tela mostra como "sem prazo" e nunca conta como atraso.
-- Um NOT NULL aqui quebraria as linhas existentes; um DEFAULT inventaria dado.
-- ============================================================================

ALTER TABLE public.driverpay_mirror_publications
  ADD COLUMN IF NOT EXISTS nf_due_at timestamptz;

COMMENT ON COLUMN public.driverpay_mirror_publications.nf_due_at IS
  'Prazo (data + hora, com fuso) pra o entregador mandar a nota fiscal DESTE espelho. '
  'NULL = espelho publicado antes de 04/08/2026, sem prazo combinado: a nota nunca conta '
  'como atrasada. O painel exige o preenchimento nas publicacoes novas.';

-- O painel filtra "notas atrasadas" varrendo as publicações da quinzena.
CREATE INDEX IF NOT EXISTS idx_driverpay_mirror_pub_nf_due
  ON public.driverpay_mirror_publications (period_id, nf_due_at)
  WHERE nf_due_at IS NOT NULL;

-- RLS: a policy da tabela já é por company_id (+ mestres 9999/2626) e vale pra coluna
-- nova sem alteração — não há policy por coluna aqui.

-- ============================================================================
-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_driverpay_mirror_pub_nf_due;
-- ALTER TABLE public.driverpay_mirror_publications DROP COLUMN IF EXISTS nf_due_at;
-- ============================================================================
