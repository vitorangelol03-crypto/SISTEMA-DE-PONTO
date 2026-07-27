-- =============================================================================
-- ESPELHO PUBLICADO — o pagamento ABATEU os vales/perdas? (pagamento parcial)
-- =============================================================================
-- Pedido do Victor (27/07): pagando só uma plataforma (ex.: ANJUN) o espelho já
-- descontava vales e perdas; ao pagar as demais plataformas o mesmo valor seria
-- descontado DE NOVO. Agora a geração do espelho (e dos relatórios) tem a opção
-- "Descontar vales e perdas": marcada (padrão) = como sempre foi; desmarcada =
-- o espelho LISTA os vales/perdas mas NÃO abate do total.
--
-- A escolha precisa ficar GRAVADA na publicação porque a conferência automática
-- da nota fiscal (edge fn driver-public-api) calcula o valor esperado a partir
-- do espelho publicado: espelho sem abate => o driver emite a nota pelo valor
-- cheio da(s) plataforma(s); com abate => pelo valor já descontado.
--
-- ADITIVO: coluna nova com DEFAULT true = exatamente o comportamento atual.
-- As publicações que já existem continuam valendo igual (nenhuma linha é tocada;
-- conferido em 27/07: nenhum driver com espelho publicado tem vale/perda, então
-- o valor esperado da conferência não muda pra ninguém).
--
-- Rollback: ALTER TABLE public.driverpay_mirror_publications DROP COLUMN include_deductions;
-- =============================================================================

ALTER TABLE public.driverpay_mirror_publications
  ADD COLUMN IF NOT EXISTS include_deductions boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.driverpay_mirror_publications.include_deductions IS
  'true (padrão): o espelho publicado abateu vales/perdas do total. false: pagamento PARCIAL por plataforma — os vales/perdas saem listados mas fora do total (serão abatidos no pagamento das demais plataformas). A conferência automática da NF usa esta coluna pra calcular o valor esperado.';
