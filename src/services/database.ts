import { supabase } from '../lib/supabase';

export interface User {
  id: string;
  password: string;
  role: 'admin' | 'supervisor';
  created_by: string | null;
  created_at: string;
}

export interface Employee {
  id: string;
  name: string;
  cpf: string;
  pix_key: string | null;
  created_by: string;
  created_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  status: 'present' | 'absent';
  exit_time: string | null;
  marked_by: string;
  created_at: string;
  employees?: Employee;
}

export const createTables = async () => {
  try {
    // Criar tabela users
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          password TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor')),
          created_by TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `
    });

    // Criar tabela employees
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS employees (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          cpf TEXT UNIQUE NOT NULL,
          pix_key TEXT,
          created_by TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `
    });

    // Criar tabela attendance
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS attendance (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
          exit_time TEXT,
          marked_by TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(employee_id, date)
        );
      `
    });

    console.log('Tabelas criadas com sucesso!');
  } catch (error) {
    console.error('Erro ao criar tabelas:', error);
    // Fallback: usar consultas diretas
    try {
      const { error: userTableError } = await supabase
        .from('users')
        .select('id')
        .limit(1);
        
      if (userTableError && userTableError.code === '42P01') {
        console.log('Tabelas não existem, mas continuando...');
      }
    } catch (e) {
      console.log('Continuando sem verificação de tabelas...');
    }
  }
};

export const createDefaultAdmin = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', '9999')
      .single();

    if (!data) {
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          id: '9999',
          password: '684171',
          role: 'admin',
          created_by: null
        }]);

      if (insertError) {
        console.error('Erro ao criar admin padrão:', insertError);
      } else {
        console.log('Admin padrão criado com sucesso!');
      }
    }
  } catch (error) {
    console.error('Erro ao verificar admin padrão:', error);
  }
};

export const initializeSystem = async () => {
  try {
    await createTables();
    await createDefaultAdmin();
    console.log('Sistema inicializado com sucesso!');
  } catch (error) {
    console.error('Erro na inicialização:', error);
  }
};

// Auth functions
export const loginUser = async (id: string, password: string): Promise<User | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .eq('password', password)
    .single();

  if (error || !data) {
    throw new Error('Credenciais inválidas');
  }

  return data;
};

// User functions
export const getAllUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createUser = async (id: string, password: string, role: 'supervisor', createdBy: string): Promise<void> => {
  const { error } = await supabase
    .from('users')
    .insert([{
      id,
      password,
      role,
      created_by: createdBy
    }]);

  if (error) {
    if (error.code === '23505') {
      throw new Error('ID já existe');
    }
    throw error;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Employee functions
export const getAllEmployees = async (): Promise<Employee[]> => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
};

export const createEmployee = async (name: string, cpf: string, pixKey: string | null, createdBy: string): Promise<void> => {
  const { error } = await supabase
    .from('employees')
    .insert([{
      name,
      cpf,
      pix_key: pixKey,
      created_by: createdBy
    }]);

  if (error) {
    if (error.code === '23505') {
      throw new Error('CPF já cadastrado');
    }
    throw error;
  }
};

export const updateEmployee = async (id: string, name: string, cpf: string, pixKey: string | null): Promise<void> => {
  const { error } = await supabase
    .from('employees')
    .update({ name, cpf, pix_key: pixKey })
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      throw new Error('CPF já cadastrado');
    }
    throw error;
  }
};

export const deleteEmployee = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Attendance functions
export const getTodayAttendance = async (): Promise<Attendance[]> => {
  // Usar data local do Brasil (UTC-3)
  const today = new Date();
  const brazilOffset = -3 * 60; // UTC-3 em minutos
  const localTime = new Date(today.getTime() + (brazilOffset * 60 * 1000));
  const todayString = localTime.toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('attendance')
    .select(`
      *,
      employees (
        id,
        name,
        cpf
      )
    `)
    .eq('date', todayString)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const markAttendance = async (
  employeeId: string, 
  date: string, 
  status: 'present' | 'absent', 
  exitTime: string | null, 
  markedBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('attendance')
    .upsert([{
      employee_id: employeeId,
      date,
      status,
      exit_time: exitTime,
      marked_by: markedBy
    }], { 
      onConflict: 'employee_id,date'
    });

  if (error) throw error;
};

export const getAttendanceHistory = async (
  startDate?: string,
  endDate?: string,
  employeeId?: string
): Promise<Attendance[]> => {
  let query = supabase
    .from('attendance')
    .select(`
      *,
      employees (
        id,
        name,
        cpf
      )
    `);

  if (startDate) {
    query = query.gte('date', startDate);
  }
  
  if (endDate) {
    query = query.lte('date', endDate);
  }
  
  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query.order('date', { ascending: false });

  if (error) throw error;
  return data || [];
};