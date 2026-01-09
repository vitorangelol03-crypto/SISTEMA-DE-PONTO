/*
  Script para adicionar todos os campos necessários à tabela employees
  Execute este script no Supabase Dashboard > SQL Editor
*/

-- Adicionar campos de PIX (se não existirem)
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

-- Adicionar campo de tipo de vínculo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'employment_type'
  ) THEN
    ALTER TABLE employees ADD COLUMN employment_type TEXT;
  END IF;
END $$;

-- Adicionar campos de endereço (se não existirem)
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

-- Verificar se as colunas foram criadas
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'employees'
  AND column_name IN ('pix_key', 'pix_type', 'employment_type', 'address', 'neighborhood', 'city', 'state', 'zip_code')
ORDER BY column_name;
