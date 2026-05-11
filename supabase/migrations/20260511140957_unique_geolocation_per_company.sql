-- TECH_DEBT 6.11 (sub-fase 5.3): geolocation_config sem UNIQUE(company_id)
--
-- Tabela funciona como singleton-de-fato (1 row por empresa). Edge function
-- clock-in-validated v5 usa .maybeSingle() assumindo no máximo 1 row por
-- company_id. Sem UNIQUE, INSERT acidental de 2ª row pra mesma empresa
-- geraria comportamento indefinido (pega linha aleatória).
--
-- Pre-check executado em 2026-05-11 via MCP: 0 duplicatas em prod.

ALTER TABLE public.geolocation_config
  ADD CONSTRAINT geolocation_config_company_id_key UNIQUE (company_id);

COMMENT ON CONSTRAINT geolocation_config_company_id_key ON public.geolocation_config IS
  'Garante 1 row por empresa — tabela funciona como singleton-de-fato por company_id. Resolve TECH_DEBT 6.11 (sub-fase 5.3).';
