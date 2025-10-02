/*
  # Adicionar coluna email à tabela users

  1. Modificações
    - Adiciona coluna email à tabela public.users
    - Atualiza email do admin existente se houver
*/

-- Adicionar coluna email
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text UNIQUE;

-- Atualizar email do admin se existir
UPDATE public.users 
SET email = '9999@sistema.local'
WHERE id = '9999' AND email IS NULL;
