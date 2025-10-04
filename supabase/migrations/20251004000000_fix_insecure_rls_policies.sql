/*
  # Corrigir Políticas RLS Inseguras

  ## Problema Crítico de Segurança
  - TODAS as tabelas tinham políticas USING(true) que permitem acesso SEM autenticação
  - Qualquer pessoa poderia acessar/modificar TODOS os dados
  - Senha de admin estava hardcoded em migração anterior

  ## Solução
  1. Remover TODAS as políticas inseguras USING(true)
  2. Criar políticas restritivas que requerem autenticação válida
  3. Implementar controle de acesso baseado em roles (admin/supervisor)
  4. Garantir que cada operação valide auth.uid() contra users.auth_user_id

  ## Segurança Implementada
  - SELECT: Apenas usuários autenticados podem ler dados
  - INSERT: Apenas usuários autenticados podem criar registros
  - UPDATE: Apenas usuários autenticados podem atualizar
  - DELETE: Apenas admins podem deletar (exceto próprios registros)
*/

-- ============================================================
-- USERS TABLE - Controle Total de Acesso
-- ============================================================

DROP POLICY IF EXISTS "Permitir acesso total a users" ON users;
DROP POLICY IF EXISTS "Authenticated users can read users" ON users;
DROP POLICY IF EXISTS "Authenticated users can insert users" ON users;
DROP POLICY IF EXISTS "Authenticated users can update users" ON users;
DROP POLICY IF EXISTS "Only admins can delete users" ON users;

-- Usuários autenticados podem ler próprio perfil ou se forem admin
CREATE POLICY "Users can read own profile or admin can read all"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT auth_user_id FROM users WHERE id = users.id)
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
    )
  );

-- Apenas admins podem criar novos usuários
CREATE POLICY "Only admins can create users"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Admins podem atualizar qualquer usuário, outros só podem atualizar a si mesmos
CREATE POLICY "Users can update own profile or admin can update all"
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT auth_user_id FROM users WHERE id = users.id)
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (SELECT auth_user_id FROM users WHERE id = users.id)
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
    )
  );

-- Apenas admins podem deletar usuários (exceto eles mesmos)
CREATE POLICY "Only admins can delete users"
  ON users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND u.id != users.id
    )
  );

-- ============================================================
-- ATTENDANCE, PAYMENTS, BONUSES, ERROR_RECORDS
-- Políticas Restritivas para Dados Sensíveis
-- ============================================================

-- ATTENDANCE
DROP POLICY IF EXISTS "Permitir acesso total a attendance" ON attendance;

CREATE POLICY "Authenticated users can read attendance"
  ON attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert attendance"
  ON attendance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can update attendance"
  ON attendance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Only admins can delete attendance"
  ON attendance FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'));

-- PAYMENTS
DROP POLICY IF EXISTS "Permitir acesso total a payments" ON payments;

CREATE POLICY "Authenticated users can read payments"
  ON payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can update payments"
  ON payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Only admins can delete payments"
  ON payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'));

-- BONUSES
DROP POLICY IF EXISTS "Permitir acesso total a bonuses" ON bonuses;

CREATE POLICY "Authenticated users can read bonuses"
  ON bonuses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert bonuses"
  ON bonuses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can update bonuses"
  ON bonuses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Only admins can delete bonuses"
  ON bonuses FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'));

-- ERROR_RECORDS
DROP POLICY IF EXISTS "Permitir acesso total a error_records" ON error_records;

CREATE POLICY "Authenticated users can read error_records"
  ON error_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert error_records"
  ON error_records FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can update error_records"
  ON error_records FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Only admins can delete error_records"
  ON error_records FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'));

-- ============================================================
-- COLLECTIVE_ERRORS E COLLECTIVE_ERROR_APPLICATIONS
-- ============================================================

DROP POLICY IF EXISTS "Permitir acesso total a collective_errors" ON collective_errors;
DROP POLICY IF EXISTS "Permitir acesso total a collective_error_applications" ON collective_error_applications;

-- COLLECTIVE_ERRORS
CREATE POLICY "Authenticated users can read collective_errors"
  ON collective_errors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert collective_errors"
  ON collective_errors FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can update collective_errors"
  ON collective_errors FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Only admins can delete collective_errors"
  ON collective_errors FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'));

-- COLLECTIVE_ERROR_APPLICATIONS
CREATE POLICY "Authenticated users can read collective_error_applications"
  ON collective_error_applications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert collective_error_applications"
  ON collective_error_applications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authenticated users can update collective_error_applications"
  ON collective_error_applications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Only admins can delete collective_error_applications"
  ON collective_error_applications FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'));
