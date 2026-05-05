-- ============================================================================
-- COMBO I — Push final (sub-fase 1.21)
-- ============================================================================
--
-- Migra constraint UNIQUE(date) GLOBAL → UNIQUE(date, company_id) MULTI-EMPRESA.
--
-- MOTIVO:
-- A tabela triage_errors registra erros de triagem por dia. Cada empresa
-- pode ter seu próprio registro de erros, então 2 empresas podem ter erro
-- na mesma data (independente). A constraint global UNIQUE(date) bloqueava
-- esse cenário. UNIQUE(date, company_id) permite mesma data em empresas
-- diferentes, mas mantém 1 registro por dia POR empresa.
--
-- PRE-CHECK CONFIRMADO (Supabase MCP):
-- - Zero duplicatas em triage_errors(date, company_id)
-- - Zero foreign keys apontando pra triage_errors.date
-- - Índice composto idx_triage_errors_company_date (BTREE) já existe
--
-- IMPACTO:
-- - Reabilita teste fixme #9 em tests/25-multi-company-isolation.spec.ts
--
-- ============================================================================

ALTER TABLE public.triage_errors
  DROP CONSTRAINT IF EXISTS triage_errors_date_unique;

ALTER TABLE public.triage_errors
  ADD CONSTRAINT triage_errors_date_company_id_unique
  UNIQUE (date, company_id);

COMMENT ON CONSTRAINT triage_errors_date_company_id_unique ON public.triage_errors IS
  'Erro de triagem único POR empresa POR data. Cada empresa tem seu próprio registro diário.';
