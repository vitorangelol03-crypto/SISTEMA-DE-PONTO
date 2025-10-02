/*
  # Criar Esquema Completo do Sistema de Gestão

  1. Novas Tabelas
    - `users` - Usuários do sistema (admin e supervisores)
    - `employees` - Funcionários da empresa
    - `attendance` - Registro de presença
    - `payments` - Pagamentos aos funcionários
    - `bonuses` - Bonificações do dia
    - `error_records` - Registros de erros individuais

  2. Segurança
    - RLS habilitado em todas as tabelas
    - Políticas permitindo acesso total para funcionamento da aplicação
*/

-- Criar tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'supervisor')),
  created_by text,
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de funcionários
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpf text UNIQUE NOT NULL,
  pix_key text,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de presença
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent')),
  exit_time text,
  marked_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Criar tabela de pagamentos
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  daily_rate numeric NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  bonus numeric NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  total numeric NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Criar tabela de bonificações
CREATE TABLE IF NOT EXISTS bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date UNIQUE NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de registros de erros
CREATE TABLE IF NOT EXISTS error_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  error_count integer NOT NULL CHECK (error_count >= 0),
  observations text,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_records ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem e criar novas
DO $$ 
BEGIN
  -- Users policies
  DROP POLICY IF EXISTS "Permitir acesso total a users" ON users;
  CREATE POLICY "Permitir acesso total a users" ON users FOR ALL USING (true) WITH CHECK (true);
  
  -- Employees policies
  DROP POLICY IF EXISTS "Permitir acesso total a employees" ON employees;
  CREATE POLICY "Permitir acesso total a employees" ON employees FOR ALL USING (true) WITH CHECK (true);
  
  -- Attendance policies
  DROP POLICY IF EXISTS "Permitir acesso total a attendance" ON attendance;
  CREATE POLICY "Permitir acesso total a attendance" ON attendance FOR ALL USING (true) WITH CHECK (true);
  
  -- Payments policies
  DROP POLICY IF EXISTS "Permitir acesso total a payments" ON payments;
  CREATE POLICY "Permitir acesso total a payments" ON payments FOR ALL USING (true) WITH CHECK (true);
  
  -- Bonuses policies
  DROP POLICY IF EXISTS "Permitir acesso total a bonuses" ON bonuses;
  CREATE POLICY "Permitir acesso total a bonuses" ON bonuses FOR ALL USING (true) WITH CHECK (true);
  
  -- Error Records policies
  DROP POLICY IF EXISTS "Permitir acesso total a error_records" ON error_records;
  CREATE POLICY "Permitir acesso total a error_records" ON error_records FOR ALL USING (true) WITH CHECK (true);
  
  -- Collective Errors policies
  DROP POLICY IF EXISTS "Permitir acesso total a collective_errors" ON collective_errors;
  CREATE POLICY "Permitir acesso total a collective_errors" ON collective_errors FOR ALL USING (true) WITH CHECK (true);
  
  -- Collective Error Applications policies
  DROP POLICY IF EXISTS "Permitir acesso total a collective_error_applications" ON collective_error_applications;
  CREATE POLICY "Permitir acesso total a collective_error_applications" ON collective_error_applications FOR ALL USING (true) WITH CHECK (true);
END $$;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_payments_employee_id ON payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);
CREATE INDEX IF NOT EXISTS idx_error_records_employee_id ON error_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_error_records_date ON error_records(date);
CREATE INDEX IF NOT EXISTS idx_collective_error_applications_employee_id ON collective_error_applications(employee_id);
CREATE INDEX IF NOT EXISTS idx_collective_error_applications_collective_error_id ON collective_error_applications(collective_error_id);

-- Inserir usuário admin padrão se não existir
INSERT INTO users (id, password, role, created_by, created_at)
VALUES ('9999', '684171', 'admin', NULL, now())
ON CONFLICT (id) DO NOTHING;