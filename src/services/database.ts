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

export interface Payment {
  id: string;
  employee_id: string;
  date: string;
  daily_rate: number;
  bonus: number;
  total: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  employees?: Employee;
}

export interface Bonus {
  id: string;
  date: string;
  amount: number;
  created_by: string;
  created_at: string;
}

export const createTables = async () => {
  try {
    // Verificar se as tabelas existem, se não existir o Supabase já as criou automaticamente
    console.log('Verificando estrutura do banco de dados...');
  } catch (error) {
    console.log('Estrutura do banco verificada:', error);
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

// Payment functions
export const getPayments = async (
  startDate?: string,
  endDate?: string,
  employeeId?: string
): Promise<Payment[]> => {
  let query = supabase
    .from('payments')
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

export const upsertPayment = async (
  employeeId: string,
  date: string,
  dailyRate: number,
  bonus: number,
  createdBy: string
): Promise<void> => {
  const total = dailyRate + bonus;
  
  const { error } = await supabase
    .from('payments')
    .upsert([{
      employee_id: employeeId,
      date,
      daily_rate: dailyRate,
      bonus,
      total,
      created_by: createdBy,
      updated_at: new Date().toISOString()
    }], { 
      onConflict: 'employee_id,date'
    });

  if (error) throw error;
};

export const deletePayment = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Bonus functions
export const getBonuses = async (): Promise<Bonus[]> => {
  const { data, error } = await supabase
    .from('bonuses')
    .select('*')
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createBonus = async (
  date: string,
  amount: number,
  createdBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('bonuses')
    .upsert([{
      date,
      amount,
      created_by: createdBy
    }], { 
      onConflict: 'date'
    });

  if (error) throw error;
};

export const applyBonusToAllPresent = async (
  date: string,
  bonusAmount: number,
  createdBy: string
): Promise<void> => {
  // Buscar todos os funcionários presentes no dia
  const { data: attendances, error: attendanceError } = await supabase
    .from('attendance')
    .select('employee_id')
    .eq('date', date)
    .eq('status', 'present');

  if (attendanceError) throw attendanceError;
  
  if (!attendances || attendances.length === 0) {
    throw new Error('Nenhum funcionário presente encontrado para este dia');
  }

  // Aplicar bonificação para cada funcionário presente
  for (const attendance of attendances) {
    // Buscar pagamento existente ou criar novo
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('employee_id', attendance.employee_id)
      .eq('date', date)
      .single();

    const currentDailyRate = existingPayment?.daily_rate || 0;
    const newTotal = currentDailyRate + bonusAmount;

    await supabase
      .from('payments')
      .upsert([{
        employee_id: attendance.employee_id,
        date,
        daily_rate: currentDailyRate,
        bonus: bonusAmount,
        total: newTotal,
        created_by: createdBy,
        updated_at: new Date().toISOString()
      }], { 
        onConflict: 'employee_id,date'
      });
  }
};