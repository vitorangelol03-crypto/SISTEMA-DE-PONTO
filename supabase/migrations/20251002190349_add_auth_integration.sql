/*
  # Integração com Supabase Auth

  1. Modificações
    - Adiciona coluna `auth_user_id` na tabela `users` para vincular com auth.users
    - Torna a coluna `password` nullable (senhas serão gerenciadas pelo Supabase Auth)
    - Adiciona coluna `email` para armazenar o email gerado
    
  2. Segurança
    - Mantém RLS habilitado
    - Atualiza políticas para usar auth.uid() quando possível
    - Admin e supervisores autenticados terão acesso baseado em seus roles
*/

-- Adicionar coluna auth_user_id à tabela users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE users ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Adicionar coluna email à tabela users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    ALTER TABLE users ADD COLUMN email text UNIQUE;
  END IF;
END $$;

-- Tornar password nullable (será migrado para Supabase Auth)
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- Criar função para obter role do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Criar função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Atualizar políticas RLS para users (mantendo compatibilidade)
DROP POLICY IF EXISTS "Permitir acesso total a users" ON users;

CREATE POLICY "Users podem ver todos os usuários se autenticados"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Apenas admin pode inserir usuários"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Apenas admin pode atualizar usuários"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Apenas admin pode deletar usuários"
  ON users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Atualizar políticas para employees
DROP POLICY IF EXISTS "Permitir acesso total a employees" ON employees;

CREATE POLICY "Usuários autenticados podem ver funcionários"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir funcionários"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar funcionários"
  ON employees FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Apenas admin pode deletar funcionários"
  ON employees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Atualizar políticas para attendance
DROP POLICY IF EXISTS "Permitir acesso total a attendance" ON attendance;

CREATE POLICY "Usuários autenticados podem ver attendance"
  ON attendance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir attendance"
  ON attendance FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar attendance"
  ON attendance FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar attendance"
  ON attendance FOR DELETE
  TO authenticated
  USING (true);

-- Atualizar políticas para payments
DROP POLICY IF EXISTS "Permitir acesso total a payments" ON payments;

CREATE POLICY "Usuários autenticados podem ver payments"
  ON payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar payments"
  ON payments FOR DELETE
  TO authenticated
  USING (true);

-- Atualizar políticas para bonuses
DROP POLICY IF EXISTS "Permitir acesso total a bonuses" ON bonuses;

CREATE POLICY "Usuários autenticados podem ver bonuses"
  ON bonuses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir bonuses"
  ON bonuses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar bonuses"
  ON bonuses FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar bonuses"
  ON bonuses FOR DELETE
  TO authenticated
  USING (true);

-- Atualizar políticas para error_records
DROP POLICY IF EXISTS "Permitir acesso total a error_records" ON error_records;

CREATE POLICY "Usuários autenticados podem ver error_records"
  ON error_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir error_records"
  ON error_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar error_records"
  ON error_records FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar error_records"
  ON error_records FOR DELETE
  TO authenticated
  USING (true);

-- Atualizar políticas para collective_errors
DROP POLICY IF EXISTS "Permitir acesso total a collective_errors" ON collective_errors;

CREATE POLICY "Usuários autenticados podem ver collective_errors"
  ON collective_errors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir collective_errors"
  ON collective_errors FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar collective_errors"
  ON collective_errors FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar collective_errors"
  ON collective_errors FOR DELETE
  TO authenticated
  USING (true);

-- Atualizar políticas para collective_error_applications
DROP POLICY IF EXISTS "Permitir acesso total a collective_error_applications" ON collective_error_applications;

CREATE POLICY "Usuários autenticados podem ver collective_error_applications"
  ON collective_error_applications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir collective_error_applications"
  ON collective_error_applications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar collective_error_applications"
  ON collective_error_applications FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar collective_error_applications"
  ON collective_error_applications FOR DELETE
  TO authenticated
  USING (true);