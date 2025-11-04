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

export interface ErrorRecord {
  id: string;
  employee_id: string;
  date: string;
  error_count: number;
  observations: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  employees?: Employee;
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
    const { data } = await supabase
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

export const clearEmployeePayments = async (
  employeeId: string,
  startDate?: string,
  endDate?: string
): Promise<void> => {
  let query = supabase
    .from('payments')
    .delete()
    .eq('employee_id', employeeId);

  if (startDate) {
    query = query.gte('date', startDate);
  }
  
  if (endDate) {
    query = query.lte('date', endDate);
  }

  const { error } = await query;
  if (error) throw error;
};

export const clearAllPayments = async (
  startDate?: string,
  endDate?: string
): Promise<void> => {
  let query = supabase.from('payments').delete();

  if (startDate) {
    query = query.gte('date', startDate);
  }
  
  if (endDate) {
    query = query.lte('date', endDate);
  }

  // Se não há filtros de data, limpa tudo
  if (!startDate && !endDate) {
    query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // Condição sempre verdadeira
  }

  const { error } = await query;
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

// Error functions
export const getErrorRecords = async (
  startDate?: string,
  endDate?: string,
  employeeId?: string
): Promise<ErrorRecord[]> => {
  let query = supabase
    .from('error_records')
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

export const upsertErrorRecord = async (
  employeeId: string,
  date: string,
  errorCount: number,
  observations: string | null,
  createdBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('error_records')
    .upsert([{
      employee_id: employeeId,
      date,
      error_count: errorCount,
      observations,
      created_by: createdBy,
      updated_at: new Date().toISOString()
    }], { 
      onConflict: 'employee_id,date'
    });

  if (error) throw error;
};

export const deleteErrorRecord = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('error_records')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const getErrorStatistics = async (
  startDate?: string,
  endDate?: string
): Promise<{
  totalErrors: number;
  employeeStats: Array<{
    employee: Employee;
    totalErrors: number;
    workDays: number;
    errorRate: number;
  }>;
}> => {
  const errorRecords = await getErrorRecords(startDate, endDate);

  const attendances = await getAttendanceHistory(startDate, endDate);
  const presentAttendances = attendances.filter(att => att.status === 'present');

  const employeeMap = new Map<string, {
    employee: Employee;
    totalErrors: number;
    workDays: number;
  }>();

  presentAttendances.forEach(att => {
    if (att.employees) {
      const key = att.employee_id;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employee: att.employees,
          totalErrors: 0,
          workDays: 0
        });
      }
      employeeMap.get(key)!.workDays++;
    }
  });

  errorRecords.forEach(error => {
    if (error.employees) {
      const key = error.employee_id;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employee: error.employees,
          totalErrors: 0,
          workDays: 0
        });
      }
      employeeMap.get(key)!.totalErrors += error.error_count;
    }
  });

  const employeeStats = Array.from(employeeMap.values()).map(stat => ({
    ...stat,
    errorRate: stat.workDays > 0 ? (stat.totalErrors / stat.workDays) : 0
  }));

  const totalErrors = errorRecords.reduce((sum, record) => sum + record.error_count, 0);

  return {
    totalErrors,
    employeeStats
  };
};

export interface DataRetentionSettings {
  id: string;
  data_type: 'attendance' | 'payments' | 'error_records' | 'bonuses' | 'collective_errors';
  retention_months: number;
  is_active: boolean;
  updated_by: string;
  updated_at: string;
}

export interface AutoCleanupConfig {
  id: string;
  is_enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  preferred_time: string;
  last_run: string | null;
  next_run: string | null;
  updated_by: string;
  updated_at: string;
}

export interface CleanupLog {
  id: string;
  user_id: string;
  cleanup_type: 'manual' | 'automatic';
  data_types_cleaned: string[];
  start_date: string | null;
  end_date: string | null;
  records_deleted: Record<string, number>;
  backup_generated: boolean;
  backup_filename: string | null;
  status: 'success' | 'error' | 'partial';
  error_message: string | null;
  execution_time_ms: number | null;
  created_at: string;
}

export interface DataStatistics {
  attendance: { count: number; oldestDate: string | null; newestDate: string | null };
  payments: { count: number; oldestDate: string | null; newestDate: string | null };
  error_records: { count: number; oldestDate: string | null; newestDate: string | null };
  bonuses: { count: number; oldestDate: string | null; newestDate: string | null };
  totalRecords: number;
}

export const getDataRetentionSettings = async (): Promise<DataRetentionSettings[]> => {
  const { data, error } = await supabase
    .from('data_retention_settings')
    .select('*')
    .order('data_type');

  if (error) throw error;
  return data || [];
};

export const updateDataRetentionSettings = async (
  dataType: string,
  retentionMonths: number,
  updatedBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('data_retention_settings')
    .update({
      retention_months: retentionMonths,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    })
    .eq('data_type', dataType);

  if (error) throw error;
};

export const getAutoCleanupConfig = async (): Promise<AutoCleanupConfig | null> => {
  const { data, error } = await supabase
    .from('auto_cleanup_config')
    .select('*')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

export const updateAutoCleanupConfig = async (
  config: Partial<AutoCleanupConfig>,
  updatedBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('auto_cleanup_config')
    .update({
      ...config,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    })
    .eq('id', config.id);

  if (error) throw error;
};

export const getDataStatistics = async (): Promise<DataStatistics> => {
  const [attendance, payments, errorRecords, bonuses] = await Promise.all([
    supabase.from('attendance').select('date', { count: 'exact' }).order('date', { ascending: true }),
    supabase.from('payments').select('date', { count: 'exact' }).order('date', { ascending: true }),
    supabase.from('error_records').select('date', { count: 'exact' }).order('date', { ascending: true }),
    supabase.from('bonuses').select('date', { count: 'exact' }).order('date', { ascending: true })
  ]);

  return {
    attendance: {
      count: attendance.count || 0,
      oldestDate: attendance.data && attendance.data.length > 0 ? attendance.data[0].date : null,
      newestDate: attendance.data && attendance.data.length > 0 ? attendance.data[attendance.data.length - 1].date : null
    },
    payments: {
      count: payments.count || 0,
      oldestDate: payments.data && payments.data.length > 0 ? payments.data[0].date : null,
      newestDate: payments.data && payments.data.length > 0 ? payments.data[payments.data.length - 1].date : null
    },
    error_records: {
      count: errorRecords.count || 0,
      oldestDate: errorRecords.data && errorRecords.data.length > 0 ? errorRecords.data[0].date : null,
      newestDate: errorRecords.data && errorRecords.data.length > 0 ? errorRecords.data[errorRecords.data.length - 1].date : null
    },
    bonuses: {
      count: bonuses.count || 0,
      oldestDate: bonuses.data && bonuses.data.length > 0 ? bonuses.data[0].date : null,
      newestDate: bonuses.data && bonuses.data.length > 0 ? bonuses.data[bonuses.data.length - 1].date : null
    },
    totalRecords: (attendance.count || 0) + (payments.count || 0) + (errorRecords.count || 0) + (bonuses.count || 0)
  };
};

export const previewCleanupData = async (
  dataTypes: string[],
  startDate?: string,
  endDate?: string,
  employeeId?: string
): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};

  for (const dataType of dataTypes) {
    let query = supabase.from(dataType).select('id', { count: 'exact', head: true });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (employeeId && dataType !== 'bonuses') query = query.eq('employee_id', employeeId);

    const { count } = await query;
    counts[dataType] = count || 0;
  }

  return counts;
};

export const deleteOldRecords = async (
  dataType: string,
  startDate?: string,
  endDate?: string,
  employeeId?: string
): Promise<number> => {
  let query = supabase.from(dataType).delete();

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);
  if (employeeId && dataType !== 'bonuses') query = query.eq('employee_id', employeeId);

  const { data, error, count } = await query.select('id');

  if (error) throw error;
  return count || data?.length || 0;
};

export const createCleanupLog = async (log: Omit<CleanupLog, 'id' | 'created_at'>): Promise<void> => {
  const { error } = await supabase
    .from('cleanup_logs')
    .insert([log]);

  if (error) throw error;
};

export const getCleanupLogs = async (limit: number = 50): Promise<CleanupLog[]> => {
  const { data, error } = await supabase
    .from('cleanup_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};