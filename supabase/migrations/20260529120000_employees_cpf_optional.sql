-- Sub-fase: permitir cadastrar funcionários SEM CPF (gestão manual pelo supervisor).
--
-- Contexto: alguns funcionários podem não ter CPF (ainda não tiraram, etc.).
-- Eles são cadastrados e controlados manualmente pelo supervisor — NÃO fazem
-- login no /clock (o login é por CPF+PIN), então o CPF deixa de ser obrigatório.
--
-- A regra UNIQUE(cpf, company_id) PERMANECE e continua válida: no PostgreSQL,
-- múltiplos valores NULL NÃO conflitam numa constraint UNIQUE (NULLs são
-- considerados distintos). Logo, vários funcionários sem CPF na mesma empresa
-- são permitidos, e CPFs preenchidos continuam únicos por empresa.
--
-- No app, "sem CPF" é gravado como NULL (não string vazia).

ALTER TABLE public.employees ALTER COLUMN cpf DROP NOT NULL;
