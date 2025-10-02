/*
  # Resetar Senha do Admin

  ## Objetivo
  - Garantir que a senha do admin (9999) esteja correta: 684171
  - Usar bcrypt para criptografar a senha

  ## Mudanças
  1. Atualiza a senha criptografada do usuário admin no auth.users
*/

-- Atualizar senha do admin para 684171
UPDATE auth.users
SET 
  encrypted_password = crypt('684171', gen_salt('bf')),
  updated_at = now()
WHERE email = '9999@sistema.local';
