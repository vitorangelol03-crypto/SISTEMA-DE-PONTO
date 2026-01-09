/*
  # Adicionar Campos de Endereço e PIX aos Funcionários

  1. Alterações na Tabela `employees`
    - Adiciona campo `pix_key` (chave PIX do funcionário)
    - Adiciona campo `pix_type` (tipo de chave PIX: CPF, Email, Telefone, Aleatória)
    - Adiciona campo `address` (endereço completo)
    - Adiciona campo `neighborhood` (bairro)
    - Adiciona campo `city` (cidade)
    - Adiciona campo `state` (estado/UF)
    - Adiciona campo `zip_code` (CEP)

  2. Observações
    - Todos os campos são opcionais (NULL permitido)
    - Campos do tipo TEXT para flexibilidade
    - Suporte a diferentes formatos de endereço
*/

-- Adicionar campos de PIX
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'pix_key'
  ) THEN
    ALTER TABLE employees ADD COLUMN pix_key TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'pix_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN pix_type TEXT;
  END IF;
END $$;

-- Adicionar campos de endereço
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'address'
  ) THEN
    ALTER TABLE employees ADD COLUMN address TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'neighborhood'
  ) THEN
    ALTER TABLE employees ADD COLUMN neighborhood TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'city'
  ) THEN
    ALTER TABLE employees ADD COLUMN city TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'state'
  ) THEN
    ALTER TABLE employees ADD COLUMN state TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'zip_code'
  ) THEN
    ALTER TABLE employees ADD COLUMN zip_code TEXT;
  END IF;
END $$;
