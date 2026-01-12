/*
  # Adicionar Campos Faltantes na Tabela Employees

  ## Descrição
  Esta migration adiciona os campos de tipo de vínculo (CLT/PJ), endereço completo e 
  informações de PIX que estavam faltando na tabela employees.

  ## Modificações
  1. Adicionar coluna `employment_type` (CLT ou PJ)
  2. Adicionar coluna `pix_type` (tipo de chave PIX: CPF, E-mail, Telefone, Chave Aleatória)
  3. Adicionar coluna `address` (endereço completo)
  4. Adicionar coluna `neighborhood` (bairro)
  5. Adicionar coluna `city` (cidade)
  6. Adicionar coluna `state` (estado - UF)
  7. Adicionar coluna `zip_code` (CEP)

  ## Notas Importantes
  - Todas as colunas são opcionais (nullable) para não quebrar dados existentes
  - Os valores padrão são NULL, permitindo que funcionários existentes continuem sem problemas
  - Os campos são do tipo TEXT para flexibilidade
*/

-- Adicionar coluna employment_type (tipo de vínculo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'employment_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN employment_type TEXT;
  END IF;
END $$;

-- Adicionar coluna pix_type (tipo de chave PIX)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'pix_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN pix_type TEXT;
  END IF;
END $$;

-- Adicionar coluna address (endereço)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'address'
  ) THEN
    ALTER TABLE employees ADD COLUMN address TEXT;
  END IF;
END $$;

-- Adicionar coluna neighborhood (bairro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'neighborhood'
  ) THEN
    ALTER TABLE employees ADD COLUMN neighborhood TEXT;
  END IF;
END $$;

-- Adicionar coluna city (cidade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'city'
  ) THEN
    ALTER TABLE employees ADD COLUMN city TEXT;
  END IF;
END $$;

-- Adicionar coluna state (estado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'state'
  ) THEN
    ALTER TABLE employees ADD COLUMN state TEXT;
  END IF;
END $$;

-- Adicionar coluna zip_code (CEP)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'zip_code'
  ) THEN
    ALTER TABLE employees ADD COLUMN zip_code TEXT;
  END IF;
END $$;

-- Criar índices para melhorar performance das consultas
CREATE INDEX IF NOT EXISTS idx_employees_employment_type ON employees(employment_type);
CREATE INDEX IF NOT EXISTS idx_employees_city ON employees(city);
CREATE INDEX IF NOT EXISTS idx_employees_state ON employees(state);