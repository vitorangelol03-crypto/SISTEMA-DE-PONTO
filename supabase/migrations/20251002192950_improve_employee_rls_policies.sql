/*
  # Improve Employee RLS Policies

  ## Problem
  - The previous policies still require auth.uid() which may not work in all contexts
  - Need to ensure authenticated users with valid sessions can access employee data
  
  ## Solution
  - Simplify policies to check if auth.uid() exists and corresponds to a valid user
  - This ensures only logged-in users can access data
  
  ## Security
  - RLS is enabled on the table
  - Only authenticated users (those with valid Supabase Auth sessions) can access data
  - Admin-only operations remain restricted to admin role
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read employees" ON employees;
DROP POLICY IF EXISTS "Allow authenticated users to insert employees" ON employees;
DROP POLICY IF EXISTS "Allow authenticated users to update employees" ON employees;
DROP POLICY IF EXISTS "Only admins can delete employees" ON employees;

-- Create simplified policies that require valid authentication
CREATE POLICY "Authenticated users can read employees"
  ON employees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert employees"
  ON employees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can update employees"
  ON employees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Only admins can delete employees"
  ON employees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
      AND users.role = 'admin'
    )
  );
