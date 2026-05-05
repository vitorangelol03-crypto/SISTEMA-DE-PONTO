-- ============================================================================
-- COMBO I — Push final (sub-fase 1.21)
-- ============================================================================
--
-- Migra constraint UNIQUE(cpf) GLOBAL → UNIQUE(cpf, company_id) MULTI-EMPRESA.
--
-- MOTIVO:
-- O sistema agora suporta 2 empresas (Caratinga + Ponte Nova). Funcionários
-- podem trabalhar em ambas com o MESMO CPF (ex: contratação dupla,
-- transferência sem demissão). A constraint global UNIQUE(cpf) bloqueia
-- esse cenário legítimo. UNIQUE(cpf, company_id) permite mesmo CPF em
-- empresas diferentes, mas mantém unicidade dentro de cada empresa.
--
-- PRE-CHECK CONFIRMADO (Supabase MCP):
-- - Zero duplicatas em employees(cpf, company_id) → migration aplica limpa
-- - Zero foreign keys apontando pra employees.cpf → drop é seguro
-- - Índice composto idx_employees_company_cpf (BTREE) já existe →
--   query performance preservada
--
-- IMPACTO:
-- - INSERT existente continua funcionando (nenhum CPF duplicado em prod hoje)
-- - Permite cenário multi-empresa que estava bloqueado
-- - Reabilita teste fixme #3 em tests/25-multi-company-isolation.spec.ts
--
-- ============================================================================

-- 1. Drop a constraint antiga
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_cpf_key;

-- 2. Adicionar nova UNIQUE(cpf, company_id)
ALTER TABLE public.employees
  ADD CONSTRAINT employees_cpf_company_id_key
  UNIQUE (cpf, company_id);

-- 3. Comentário no schema pra documentar
COMMENT ON CONSTRAINT employees_cpf_company_id_key ON public.employees IS
  'CPF único POR empresa (multi-empresa). Mesmo CPF pode existir em 2 empresas.';
