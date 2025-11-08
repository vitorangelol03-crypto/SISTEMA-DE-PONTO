import { supabase } from '../lib/supabase';
import { getUserPermissions, hasPermission as checkPermission } from './permissions';

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

export interface BonusRemoval {
  id: string;
  employee_id: string;
  date: string;
  bonus_amount_removed: number;
  observation: string;
  removed_by: string;
  removed_at: string;
  created_at: string;
  employees?: Employee;
}

export interface BonusInfo {
  hasBonus: boolean;
  amount: number;
  appliedBy: string;
  appliedAt: string;
  employeesCount: number;
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

// Permission validation helper
interface PermissionCheckResult {
  allowed: boolean;
  error?: string;
}

async function validatePermission(
  userId: string,
  permission: string
): Promise<PermissionCheckResult> {
  // Admin (ID 9999) always has all permissions
  if (userId === '9999') {
    return { allowed: true };
  }

  const userPermissions = await getUserPermissions(userId);

  if (!userPermissions) {
    return {
      allowed: false,
      error: 'Permissões não encontradas para este usuário'
    };
  }

  const hasAccess = checkPermission(userPermissions, permission);

  if (!hasAccess) {
    return {
      allowed: false,
      error: `Você não tem permissão para: ${permission}`
    };
  }

  return { allowed: true };
}

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
  const permissionCheck = await validatePermission(createdBy, 'users.create');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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

export const deleteUser = async (id: string, userId: string): Promise<void> => {
  const permissionCheck = await validatePermission(userId, 'users.delete');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

  if (id === '9999') {
    throw new Error('Não é possível excluir o administrador principal');
  }

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
  const permissionCheck = await validatePermission(createdBy, 'employees.create');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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

export const updateEmployee = async (id: string, name: string, cpf: string, pixKey: string | null, userId: string): Promise<void> => {
  const permissionCheck = await validatePermission(userId, 'employees.edit');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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

export const deleteEmployee = async (id: string, userId: string): Promise<void> => {
  const permissionCheck = await validatePermission(userId, 'employees.delete');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export interface BulkEmployeeResult {
  success: Employee[];
  errors: Array<{
    row: number;
    name: string;
    cpf: string;
    error: string;
  }>;
}

export const bulkCreateEmployees = async (
  employees: Array<{ name: string; cpf: string; pixKey: string | null }>,
  createdBy: string
): Promise<BulkEmployeeResult> => {
  const permissionCheck = await validatePermission(createdBy, 'employees.import');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

  const result: BulkEmployeeResult = {
    success: [],
    errors: []
  };

  const existingEmployees = await getAllEmployees();
  const existingCPFs = new Set(existingEmployees.map(emp => emp.cpf));

  for (let i = 0; i < employees.length; i++) {
    const employee = employees[i];
    const rowNumber = i + 2;

    if (existingCPFs.has(employee.cpf)) {
      result.errors.push({
        row: rowNumber,
        name: employee.name,
        cpf: employee.cpf,
        error: 'CPF já cadastrado no sistema'
      });
      continue;
    }

    try {
      const { data, error } = await supabase
        .from('employees')
        .insert([{
          name: employee.name,
          cpf: employee.cpf,
          pix_key: employee.pixKey,
          created_by: createdBy
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          result.errors.push({
            row: rowNumber,
            name: employee.name,
            cpf: employee.cpf,
            error: 'CPF já cadastrado'
          });
        } else {
          result.errors.push({
            row: rowNumber,
            name: employee.name,
            cpf: employee.cpf,
            error: error.message || 'Erro desconhecido'
          });
        }
      } else if (data) {
        result.success.push(data);
        existingCPFs.add(employee.cpf);
      }
    } catch (error) {
      result.errors.push({
        row: rowNumber,
        name: employee.name,
        cpf: employee.cpf,
        error: error instanceof Error ? error.message : 'Erro ao inserir funcionário'
      });
    }
  }

  return result;
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
  const permissionCheck = await validatePermission(markedBy, 'attendance.mark');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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

export const deleteAttendance = async (
  employeeId: string,
  date: string
): Promise<void> => {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('employee_id', employeeId)
    .eq('date', date);

  if (error) throw error;
};

export const getAttendanceHistory = async (
  startDate?: string,
  endDate?: string,
  employeeId?: string,
  userId?: string
): Promise<Attendance[]> => {
  if (userId) {
    const permissionCheck = await validatePermission(userId, 'attendance.search');
    if (!permissionCheck.allowed) {
      throw new Error(permissionCheck.error || 'Permissão negada');
    }
  }

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
  const permissionCheck = await validatePermission(createdBy, 'financial.editRate');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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

export const deletePayment = async (id: string, userId: string): Promise<void> => {
  const permissionCheck = await validatePermission(userId, 'financial.delete');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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
  endDate?: string,
  userId?: string
): Promise<void> => {
  if (userId) {
    const permissionCheck = await validatePermission(userId, 'financial.clear');
    if (!permissionCheck.allowed) {
      throw new Error(permissionCheck.error || 'Permissão negada');
    }
  }

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
  const permissionCheck = await validatePermission(createdBy, 'financial.applyBonus');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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

// Bonus info and removal functions
export const getBonusInfoForDate = async (date: string): Promise<BonusInfo> => {
  // Buscar bonus do dia
  const { data: bonus } = await supabase
    .from('bonuses')
    .select('*')
    .eq('date', date)
    .maybeSingle();

  if (!bonus) {
    return {
      hasBonus: false,
      amount: 0,
      appliedBy: '',
      appliedAt: '',
      employeesCount: 0
    };
  }

  // Contar quantos funcionários receberam a bonificação
  const { data: payments } = await supabase
    .from('payments')
    .select('employee_id')
    .eq('date', date)
    .gt('bonus', 0);

  return {
    hasBonus: true,
    amount: parseFloat(bonus.amount.toString()),
    appliedBy: bonus.created_by,
    appliedAt: bonus.created_at,
    employeesCount: payments?.length || 0
  };
};

export const removeBonusFromEmployee = async (
  employeeId: string,
  date: string,
  observation: string,
  userId: string
): Promise<void> => {
  const permissionCheck = await validatePermission(userId, 'financial.removeBonus');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

  // Validar observação
  if (!observation || observation.trim().length < 10) {
    throw new Error('Observação deve ter no mínimo 10 caracteres');
  }
  if (observation.length > 500) {
    throw new Error('Observação deve ter no máximo 500 caracteres');
  }

  // Buscar pagamento do funcionário
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .maybeSingle();

  if (!payment || payment.bonus === 0) {
    throw new Error('Este funcionário não possui bonificação para remover');
  }

  const bonusAmount = parseFloat(payment.bonus.toString());

  // Registrar remoção
  const { error: removalError } = await supabase
    .from('bonus_removals')
    .insert([{
      employee_id: employeeId,
      date,
      bonus_amount_removed: bonusAmount,
      observation: observation.trim(),
      removed_by: userId
    }]);

  if (removalError) throw removalError;

  // Atualizar pagamento removendo a bonificação
  const newTotal = parseFloat(payment.daily_rate.toString());
  const { error: updateError } = await supabase
    .from('payments')
    .update({
      bonus: 0,
      total: newTotal,
      updated_at: new Date().toISOString()
    })
    .eq('employee_id', employeeId)
    .eq('date', date);

  if (updateError) throw updateError;

  // Registrar no audit log
  try {
    await supabase.from('audit_logs').insert([{
      user_id: userId,
      action_type: 'update',
      module: 'financial',
      entity_type: 'bonus_removal',
      entity_id: employeeId,
      old_data: { bonus: bonusAmount },
      new_data: { bonus: 0 },
      description: `Bonificação removida: R$ ${bonusAmount.toFixed(2)} - ${observation}`
    }]);
  } catch (error) {
    console.error('Erro ao registrar no audit log:', error);
  }
};

export const removeAllBonusesForDate = async (
  date: string,
  observation: string,
  userId: string
): Promise<number> => {
  const permissionCheck = await validatePermission(userId, 'financial.removeBonusBulk');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

  // Validar observação
  if (!observation || observation.trim().length < 10) {
    throw new Error('Observação deve ter no mínimo 10 caracteres');
  }
  if (observation.length > 500) {
    throw new Error('Observação deve ter no máximo 500 caracteres');
  }

  // Buscar todos os pagamentos com bonificação no dia
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .eq('date', date)
    .gt('bonus', 0);

  if (paymentsError) throw paymentsError;

  if (!payments || payments.length === 0) {
    throw new Error('Nenhuma bonificação encontrada para este dia');
  }

  let removedCount = 0;

  // Remover bonificação de cada funcionário
  for (const payment of payments) {
    const bonusAmount = parseFloat(payment.bonus.toString());

    // Registrar remoção
    await supabase.from('bonus_removals').insert([{
      employee_id: payment.employee_id,
      date,
      bonus_amount_removed: bonusAmount,
      observation: observation.trim(),
      removed_by: userId
    }]);

    // Atualizar pagamento
    const newTotal = parseFloat(payment.daily_rate.toString());
    await supabase
      .from('payments')
      .update({
        bonus: 0,
        total: newTotal,
        updated_at: new Date().toISOString()
      })
      .eq('employee_id', payment.employee_id)
      .eq('date', date);

    removedCount++;
  }

  // Registrar no audit log
  try {
    await supabase.from('audit_logs').insert([{
      user_id: userId,
      action_type: 'bulk_action',
      module: 'financial',
      entity_type: 'bonus_removal_bulk',
      description: `Remoção em massa: ${removedCount} bonificações removidas - ${observation}`
    }]);
  } catch (error) {
    console.error('Erro ao registrar no audit log:', error);
  }

  return removedCount;
};

export const getBonusRemovalHistory = async (
  employeeId?: string,
  startDate?: string,
  endDate?: string
): Promise<BonusRemoval[]> => {
  let query = supabase
    .from('bonus_removals')
    .select(`
      *,
      employees (
        id,
        name,
        cpf
      )
    `);

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  if (startDate) {
    query = query.gte('date', startDate);
  }

  if (endDate) {
    query = query.lte('date', endDate);
  }

  const { data, error } = await query.order('removed_at', { ascending: false });

  if (error) throw error;
  return data || [];
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
  const permissionCheck = await validatePermission(createdBy, 'errors.create');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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

export const deleteErrorRecord = async (id: string, userId: string): Promise<void> => {
  const permissionCheck = await validatePermission(userId, 'errors.delete');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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
  const permissionCheck = await validatePermission(updatedBy, 'datamanagement.configRetention');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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
  const permissionCheck = await validatePermission(updatedBy, 'datamanagement.autoCleanup');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

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
  employeeId?: string,
  userId?: string
): Promise<number> => {
  if (userId) {
    const permissionCheck = await validatePermission(userId, 'datamanagement.manualCleanup');
    if (!permissionCheck.allowed) {
      throw new Error(permissionCheck.error || 'Permissão negada');
    }
  }

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

// Monitoring and Audit functions
export interface MonitoringSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string;
  updated_by: string | null;
  updated_at: string;
}

export interface UsageMetric {
  id: string;
  user_id: string | null;
  metric_type: string;
  module: string | null;
  metric_value: number;
  metric_unit: string;
  metadata: Record<string, any> | null;
  recorded_at: string;
  created_at: string;
}

export interface PerformanceMetric {
  id: string;
  metric_name: string;
  metric_value: number;
  module: string | null;
  operation: string | null;
  metadata: Record<string, any> | null;
  recorded_at: string;
  created_at: string;
}

export const getMonitoringSettings = async (): Promise<MonitoringSetting[]> => {
  const { data, error } = await supabase
    .from('monitoring_settings')
    .select('*')
    .order('setting_key');

  if (error) throw error;
  return data || [];
};

export const updateMonitoringSetting = async (
  settingKey: string,
  settingValue: any,
  updatedBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('monitoring_settings')
    .update({
      setting_value: settingValue,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('setting_key', settingKey);

  if (error) throw error;
};

export const recordUsageMetric = async (
  userId: string | null,
  metricType: string,
  module: string | null,
  metricValue: number,
  metricUnit: string,
  metadata?: Record<string, any>
): Promise<void> => {
  const { error } = await supabase.from('usage_metrics').insert({
    user_id: userId,
    metric_type: metricType,
    module,
    metric_value: metricValue,
    metric_unit: metricUnit,
    metadata,
  });

  if (error) throw error;
};

export const recordPerformanceMetric = async (
  metricName: string,
  metricValue: number,
  module?: string,
  operation?: string,
  metadata?: Record<string, any>
): Promise<void> => {
  const { error } = await supabase.from('performance_metrics').insert({
    metric_name: metricName,
    metric_value: metricValue,
    module,
    operation,
    metadata,
  });

  if (error) throw error;
};

export const getUsageMetrics = async (filters: {
  startDate?: string;
  endDate?: string;
  metricType?: string;
  module?: string;
  limit?: number;
}): Promise<UsageMetric[]> => {
  let query = supabase
    .from('usage_metrics')
    .select('*')
    .order('recorded_at', { ascending: false });

  if (filters.startDate) {
    query = query.gte('recorded_at', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('recorded_at', filters.endDate);
  }

  if (filters.metricType) {
    query = query.eq('metric_type', filters.metricType);
  }

  if (filters.module) {
    query = query.eq('module', filters.module);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
};

export const getPerformanceMetrics = async (filters: {
  startDate?: string;
  endDate?: string;
  metricName?: string;
  module?: string;
  limit?: number;
}): Promise<PerformanceMetric[]> => {
  let query = supabase
    .from('performance_metrics')
    .select('*')
    .order('recorded_at', { ascending: false });

  if (filters.startDate) {
    query = query.gte('recorded_at', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('recorded_at', filters.endDate);
  }

  if (filters.metricName) {
    query = query.eq('metric_name', filters.metricName);
  }

  if (filters.module) {
    query = query.eq('module', filters.module);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
};

export const getUsageStats = async (startDate?: string, endDate?: string) => {
  let query = supabase
    .from('usage_metrics')
    .select('metric_type, module, metric_value, metric_unit');

  if (startDate) {
    query = query.gte('recorded_at', startDate);
  }

  if (endDate) {
    query = query.lte('recorded_at', endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  const stats = {
    totalMetrics: data?.length || 0,
    metricsByType: {} as Record<string, number>,
    metricsByModule: {} as Record<string, number>,
    averageValues: {} as Record<string, number>,
  };

  const typeValues: Record<string, number[]> = {};

  data?.forEach((metric) => {
    stats.metricsByType[metric.metric_type] = (stats.metricsByType[metric.metric_type] || 0) + 1;

    if (metric.module) {
      stats.metricsByModule[metric.module] = (stats.metricsByModule[metric.module] || 0) + 1;
    }

    if (!typeValues[metric.metric_type]) {
      typeValues[metric.metric_type] = [];
    }
    typeValues[metric.metric_type].push(metric.metric_value);
  });

  Object.entries(typeValues).forEach(([type, values]) => {
    const sum = values.reduce((a, b) => a + b, 0);
    stats.averageValues[type] = sum / values.length;
  });

  return stats;
};

export const getPerformanceStats = async (startDate?: string, endDate?: string) => {
  let query = supabase
    .from('performance_metrics')
    .select('metric_name, module, metric_value');

  if (startDate) {
    query = query.gte('recorded_at', startDate);
  }

  if (endDate) {
    query = query.lte('recorded_at', endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  const stats = {
    totalMetrics: data?.length || 0,
    metricsByName: {} as Record<string, number>,
    metricsByModule: {} as Record<string, number>,
    averageValues: {} as Record<string, number>,
  };

  const nameValues: Record<string, number[]> = {};

  data?.forEach((metric) => {
    stats.metricsByName[metric.metric_name] = (stats.metricsByName[metric.metric_name] || 0) + 1;

    if (metric.module) {
      stats.metricsByModule[metric.module] = (stats.metricsByModule[metric.module] || 0) + 1;
    }

    if (!nameValues[metric.metric_name]) {
      nameValues[metric.metric_name] = [];
    }
    nameValues[metric.metric_name].push(metric.metric_value);
  });

  Object.entries(nameValues).forEach(([name, values]) => {
    const sum = values.reduce((a, b) => a + b, 0);
    stats.averageValues[name] = sum / values.length;
  });

  return stats;
};