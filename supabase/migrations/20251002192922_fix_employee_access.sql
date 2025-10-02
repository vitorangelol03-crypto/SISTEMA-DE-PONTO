/*
  # Fix Employee Data Access

  ## Problem
  - Existing employee data cannot be accessed because RLS policies require authentication
  - Users may not have active Supabase Auth sessions
  - The previous policies used `USING (true)` but this requires auth.uid() to exist

  ## Solution
  - Update RLS policies to allow access for any authenticated user OR service role
  - This ensures data is accessible while maintaining security
  - Add policy to allow public read access temporarily for migration

  ## Changes
  1. Drop existing restrictive policies
  2. Create new policies that work with current auth state
  3. Maintain security while allowing data access
*/

-- Drop existing policies on employees table
DROP POLICY IF EXISTS "Usuários autenticados podem ver funcionários" ON employees;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir funcionários" ON employees;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar funcionários" ON employees;
DROP POLICY IF EXISTS "Apenas admin pode deletar funcionários" ON employees;

-- Create new policies that allow authenticated users to access data
CREATE POLICY "Allow authenticated users to read employees"
  ON employees
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

CREATE POLICY "Allow authenticated users to insert employees"
  ON employees
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

CREATE POLICY "Allow authenticated users to update employees"
  ON employees
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

CREATE POLICY "Only admins can delete employees"
  ON employees
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role = 'admin'
    )
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );
