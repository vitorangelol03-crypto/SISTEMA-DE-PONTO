-- =============================================================================
-- VÁRIOS ESPELHOS POR QUINZENA — um por conjunto de plataformas
-- =============================================================================
-- Pedido do Victor (28/07): publicando o espelho só da LOGGI e depois só da SHOPEE,
-- o segundo APAGAVA o primeiro — o driver via um espelho só. Agora cada conjunto de
-- plataformas é um espelho próprio, e no app aparecem lado a lado.
--
-- Por que apagava: `publishDriverMirror` gravava o PDF sempre em
-- `<empresa>/<periodo>/<driver>.pdf` (sem a plataforma no nome, então sobrescrevia)
-- e deletava a publicação anterior do mesmo período+driver antes de inserir.
--
-- 1) `platform_key`: o filtro de plataforma normalizado (nomes ORDENADOS unidos por
--    '+'; string vazia = espelho da quinzena inteira). É a identidade do espelho —
--    republicar a LOGGI substitui só a LOGGI e não encosta na SHOPEE (decisão do
--    Victor, 28/07). O índice único garante isso no banco, não só no código.
--
-- 2) `mirror_platform_key` na nota fiscal: amarra cada nota ao espelho que a pediu.
--    Decisão do Victor (28/07): "uma nota por espelho — se tem 2 espelhos, 2 notas".
--    Guarda a CHAVE (não o id da publicação) de propósito: assim a nota sobrevive a
--    uma republicação daquele mesmo espelho, que troca a linha da publicação.
--    NULL = nota antiga (ou enviada sem espelho publicado) — segue a regra velha,
--    por CNPJ, sem quebrar nada do que já existe.
--
-- ADITIVO: as 30 publicações atuais ficam com platform_key preenchido a partir do
-- filtro que já tinham; nenhuma linha muda de comportamento.
--
-- Rollback:
--   drop index if exists driverpay_mirror_pub_unique_filter;
--   alter table public.driverpay_mirror_publications drop column platform_key;
--   alter table public.driverpay_nota_fiscal_files drop column mirror_platform_key;
-- =============================================================================

-- ─── 1. identidade do espelho: o conjunto de plataformas ─────────────────────
ALTER TABLE public.driverpay_mirror_publications
  ADD COLUMN IF NOT EXISTS platform_key text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.driverpay_mirror_publications.platform_key IS
  'Filtro de plataforma normalizado (nomes ordenados unidos por "+"; "" = quinzena inteira). Identidade do espelho: republicar o mesmo conjunto substitui, conjunto diferente vira outro espelho.';

-- backfill do que já está publicado (mesma regra do código: ordenado e unido por +)
UPDATE public.driverpay_mirror_publications
SET platform_key = COALESCE(
  (SELECT string_agg(v, '+' ORDER BY v) FROM jsonb_array_elements_text(platform_filter) AS t(v)),
  ''
)
WHERE platform_key = ''
  AND platform_filter IS NOT NULL
  AND jsonb_typeof(platform_filter) = 'array'
  AND jsonb_array_length(platform_filter) > 0;

-- um espelho por (empresa, periodo, driver, conjunto de plataformas)
CREATE UNIQUE INDEX IF NOT EXISTS driverpay_mirror_pub_unique_filter
  ON public.driverpay_mirror_publications (company_id, period_id, driver_id, platform_key);

-- ─── 2. a nota sabe de qual espelho ela é ────────────────────────────────────
ALTER TABLE public.driverpay_nota_fiscal_files
  ADD COLUMN IF NOT EXISTS mirror_platform_key text;

COMMENT ON COLUMN public.driverpay_nota_fiscal_files.mirror_platform_key IS
  'Espelho que pediu esta nota (mesmo formato de driverpay_mirror_publications.platform_key). NULL = nota enviada sem espelho publicado (regra antiga, por CNPJ). Decisao do Victor 28/07: uma nota por espelho.';

CREATE INDEX IF NOT EXISTS idx_driverpay_nf_mirror_key
  ON public.driverpay_nota_fiscal_files (period_id, driver_id, mirror_platform_key);
