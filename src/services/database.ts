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
  pin: string | null;
  pin_configured: boolean | null;
  pix_key: string | null;
  pix_type: string | null;
  employment_type: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_by: string;
  created_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  status: 'present' | 'absent';
  exit_time: string | null;
  entry_time: string | null;
  exit_time_full: string | null;
  hours_worked: number | null;
  night_hours: number | null;
  night_additional: number | null;
  approval_status: 'pending' | 'approved' | 'rejected' | 'manual' | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  clock_source: 'manual' | 'employee_self' | null;
  marked_by: string;
  created_at: string;
  entry_latitude?: number | null;
  entry_longitude?: number | null;
  entry_accuracy?: number | null;
  exit_latitude?: number | null;
  exit_longitude?: number | null;
  geo_valid?: boolean | null;
  geo_distance_meters?: number | null;
  employees?: Employee;
}

export type BonusType = 'B' | 'C1' | 'C2';

export interface Payment {
  id: string;
  employee_id: string;
  date: string;
  daily_rate: number;
  bonus: number;
  bonus_b: number;
  bonus_c1: number;
  bonus_c2: number;
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
  bonus_type: BonusType;
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
  bonus_type: BonusType | null;
  observation: string;
  removed_by: string;
  removed_at: string;
  created_at: string;
  employees?: Employee;
}

export interface BonusTypeInfo {
  hasBonus: boolean;
  amount: number;
  appliedBy: string;
  appliedAt: string;
  employeesCount: number;
}

export interface BonusInfo {
  hasAny: boolean;
  B: BonusTypeInfo;
  C1: BonusTypeInfo;
  C2: BonusTypeInfo;
}

const BONUS_COLUMNS: Record<BonusType, 'bonus_b' | 'bonus_c1' | 'bonus_c2'> = {
  B: 'bonus_b',
  C1: 'bonus_c1',
  C2: 'bonus_c2',
};

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
export const getAllEmployees = async (employmentType?: string): Promise<Employee[]> => {
  let query = supabase
    .from('employees')
    .select('*');

  if (employmentType && employmentType !== 'all') {
    query = query.eq('employment_type', employmentType);
  }

  const { data, error } = await query.order('name');

  if (error) throw error;
  return data || [];
};

export const createEmployee = async (
  name: string,
  cpf: string,
  pixKey: string | null,
  createdBy: string,
  pixType?: string | null,
  employmentType?: string | null,
  address?: string | null,
  neighborhood?: string | null,
  city?: string | null,
  state?: string | null,
  zipCode?: string | null
): Promise<void> => {
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
      pix_type: pixType,
      employment_type: employmentType,
      address,
      neighborhood,
      city,
      state,
      zip_code: zipCode,
      created_by: createdBy
    }]);

  if (error) {
    if (error.code === '23505') {
      throw new Error('CPF já cadastrado');
    }
    throw error;
  }
};

export const updateEmployee = async (
  id: string,
  name: string,
  cpf: string,
  pixKey: string | null,
  userId: string,
  pixType?: string | null,
  employmentType?: string | null,
  address?: string | null,
  neighborhood?: string | null,
  city?: string | null,
  state?: string | null,
  zipCode?: string | null
): Promise<void> => {
  const permissionCheck = await validatePermission(userId, 'employees.edit');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

  const { error } = await supabase
    .from('employees')
    .update({
      name,
      cpf,
      pix_key: pixKey,
      pix_type: pixType,
      employment_type: employmentType,
      address,
      neighborhood,
      city,
      state,
      zip_code: zipCode
    })
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
  employees: Array<{
    name: string;
    cpf: string;
    pixKey: string | null;
    pixType?: string | null;
    address?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  }>,
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
          pix_type: employee.pixType,
          address: employee.address,
          neighborhood: employee.neighborhood,
          city: employee.city,
          state: employee.state,
          zip_code: employee.zipCode,
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
  userId?: string,
  employmentType?: string
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
        cpf,
        employment_type
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

  if (employmentType && employmentType !== 'all' && data) {
    return data.filter(attendance =>
      attendance.employees?.employment_type === employmentType
    );
  }

  return data || [];
};

// Payment functions
export const getPayments = async (
  startDate?: string,
  endDate?: string,
  employeeId?: string,
  employmentType?: string
): Promise<Payment[]> => {
  let query = supabase
    .from('payments')
    .select(`
      *,
      employees (
        id,
        name,
        cpf,
        employment_type
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

  if (employmentType && employmentType !== 'all' && data) {
    return data.filter(payment =>
      payment.employees?.employment_type === employmentType
    );
  }

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
  createdBy: string,
  type: BonusType
): Promise<void> => {
  const { error } = await supabase
    .from('bonuses')
    .upsert([{
      date,
      amount,
      bonus_type: type,
      created_by: createdBy
    }], {
      onConflict: 'date,bonus_type'
    });

  if (error) throw error;
};

export const applyBonusToAllPresent = async (
  date: string,
  bonusAmount: number,
  createdBy: string,
  type: BonusType,
  excludeEmployeeIds?: string[]
): Promise<{ applied: number; skipped: number }> => {
  const permissionCheck = await validatePermission(createdBy, 'financial.applyBonus');
  if (!permissionCheck.allowed) {
    throw new Error(permissionCheck.error || 'Permissão negada');
  }

  const { data: attendances, error: attendanceError } = await supabase
    .from('attendance')
    .select('employee_id')
    .eq('date', date)
    .eq('status', 'present');

  if (attendanceError) throw attendanceError;

  if (!attendances || attendances.length === 0) {
    throw new Error('Nenhum funcionário presente encontrado para este dia');
  }

  let applied = 0;
  let skipped = 0;

  for (const attendance of attendances) {
    if (excludeEmployeeIds?.includes(attendance.employee_id)) {
      skipped++;
      continue;
    }

    const { data: existingPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('employee_id', attendance.employee_id)
      .eq('date', date)
      .maybeSingle();

    const currentDailyRate = parseFloat((existingPayment?.daily_rate ?? 0).toString());
    const currentB = parseFloat((existingPayment?.bonus_b ?? 0).toString());
    const currentC1 = parseFloat((existingPayment?.bonus_c1 ?? 0).toString());
    const currentC2 = parseFloat((existingPayment?.bonus_c2 ?? 0).toString());

    const newB = type === 'B' ? bonusAmount : currentB;
    const newC1 = type === 'C1' ? bonusAmount : currentC1;
    const newC2 = type === 'C2' ? bonusAmount : currentC2;
    const newBonus = newB + newC1 + newC2;
    const newTotal = currentDailyRate + newBonus;

    await supabase
      .from('payments')
      .upsert([{
        employee_id: attendance.employee_id,
        date,
        daily_rate: currentDailyRate,
        bonus_b: newB,
        bonus_c1: newC1,
        bonus_c2: newC2,
        bonus: newBonus,
        total: newTotal,
        created_by: createdBy,
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'employee_id,date'
      });

    applied++;
  }

  await supabase
    .from('bonuses')
    .upsert([{
      date,
      amount: bonusAmount,
      bonus_type: type,
      created_by: createdBy
    }], {
      onConflict: 'date,bonus_type'
    });

  return { applied, skipped };
};

// Bonus info and removal functions
export const getBonusInfoForDate = async (date: string): Promise<BonusInfo> => {
  const empty = (): BonusTypeInfo => ({
    hasBonus: false,
    amount: 0,
    appliedBy: '',
    appliedAt: '',
    employeesCount: 0,
  });

  const info: BonusInfo = {
    hasAny: false,
    B: empty(),
    C1: empty(),
    C2: empty(),
  };

  // Buscar bonuses do dia (pode ter até 3: B, C1, C2)
  const { data: bonuses } = await supabase
    .from('bonuses')
    .select('*')
    .eq('date', date);

  if (!bonuses || bonuses.length === 0) {
    return info;
  }

  for (const bonus of bonuses) {
    const type = bonus.bonus_type as BonusType | null;
    if (!type || !(type in BONUS_COLUMNS)) continue;

    const column = BONUS_COLUMNS[type];
    const { data: payments } = await supabase
      .from('payments')
      .select('employee_id')
      .eq('date', date)
      .gt(column, 0);

    info[type] = {
      hasBonus: true,
      amount: parseFloat(bonus.amount.toString()),
      appliedBy: bonus.created_by,
      appliedAt: bonus.created_at,
      employeesCount: payments?.length || 0,
    };
    info.hasAny = true;
  }

  return info;
};

export const removeBonusFromEmployee = async (
  employeeId: string,
  date: string,
  observation: string,
  userId: string,
  type: BonusType
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

  const column = BONUS_COLUMNS[type];

  // Buscar pagamento do funcionário
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .maybeSingle();

  const typeAmount = payment ? parseFloat((payment[column] ?? 0).toString()) : 0;
  if (!payment || typeAmount === 0) {
    throw new Error(`Este funcionário não possui bonificação ${type} para remover`);
  }

  // Registrar remoção
  const { error: removalError } = await supabase
    .from('bonus_removals')
    .insert([{
      employee_id: employeeId,
      date,
      bonus_amount_removed: typeAmount,
      bonus_type: type,
      observation: observation.trim(),
      removed_by: userId
    }]);

  if (removalError) throw removalError;

  // Zerar apenas a coluna do tipo removido e recalcular bonus/total
  const currentB = parseFloat((payment.bonus_b ?? 0).toString());
  const currentC1 = parseFloat((payment.bonus_c1 ?? 0).toString());
  const currentC2 = parseFloat((payment.bonus_c2 ?? 0).toString());
  const newB = type === 'B' ? 0 : currentB;
  const newC1 = type === 'C1' ? 0 : currentC1;
  const newC2 = type === 'C2' ? 0 : currentC2;
  const newBonus = newB + newC1 + newC2;
  const newTotal = parseFloat(payment.daily_rate.toString()) + newBonus;

  const { error: updateError } = await supabase
    .from('payments')
    .update({
      bonus_b: newB,
      bonus_c1: newC1,
      bonus_c2: newC2,
      bonus: newBonus,
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
      old_data: { [column]: typeAmount },
      new_data: { [column]: 0 },
      description: `Bonificação ${type} removida: R$ ${typeAmount.toFixed(2)} - ${observation}`
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
  const types: BonusType[] = ['B', 'C1', 'C2'];

  // Remover todas as bonificações (B, C1 e C2) de cada funcionário
  for (const payment of payments) {
    const perTypeAmount: Record<BonusType, number> = {
      B: parseFloat((payment.bonus_b ?? 0).toString()),
      C1: parseFloat((payment.bonus_c1 ?? 0).toString()),
      C2: parseFloat((payment.bonus_c2 ?? 0).toString()),
    };

    // Registrar remoção — uma linha por tipo não-zero
    const removalsToInsert = types
      .filter((t) => perTypeAmount[t] > 0)
      .map((t) => ({
        employee_id: payment.employee_id,
        date,
        bonus_amount_removed: perTypeAmount[t],
        bonus_type: t,
        observation: observation.trim(),
        removed_by: userId,
      }));

    if (removalsToInsert.length > 0) {
      await supabase.from('bonus_removals').insert(removalsToInsert);
    }

    // Atualizar pagamento zerando tudo
    const newTotal = parseFloat(payment.daily_rate.toString());
    await supabase
      .from('payments')
      .update({
        bonus_b: 0,
        bonus_c1: 0,
        bonus_c2: 0,
        bonus: 0,
        total: newTotal,
        updated_at: new Date().toISOString()
      })
      .eq('employee_id', payment.employee_id)
      .eq('date', date);

    removedCount++;
  }

  // Remover as linhas da tabela `bonuses` (registry do dia) — sem isso,
  // getBonusInfoForDate continua enxergando as bonificações e os cards
  // B/C1/C2 permanecem visíveis na UI mesmo após zerar os payments.
  const { error: bonusRegistryError } = await supabase
    .from('bonuses')
    .delete()
    .eq('date', date);

  if (bonusRegistryError) {
    console.error('Erro ao limpar registry de bonuses:', bonusRegistryError);
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

// Helper: limpa os registros da tabela `bonuses` para um dia específico.
// Usado no Reset Geral do ponto para garantir que os cards B/C1/C2 sumam.
export const clearBonusRegistryForDate = async (date: string): Promise<void> => {
  const { error } = await supabase
    .from('bonuses')
    .delete()
    .eq('date', date);

  if (error) throw error;
};

// ─── Valores padrão de Bonificação (tabela bonus_defaults) ──────────────
// Retorna um mapa { B, C1, C2 } com os valores padrão persistidos.
// Se algum tipo não existir na tabela, retorna 0 para esse tipo.
export const getBonusDefaults = async (): Promise<{ B: number; C1: number; C2: number }> => {
  const { data, error } = await supabase
    .from('bonus_defaults')
    .select('bonus_type, default_amount');

  if (error) throw error;

  const defaults: { B: number; C1: number; C2: number } = { B: 0, C1: 0, C2: 0 };
  for (const row of data || []) {
    const type = row.bonus_type as BonusType;
    if (type === 'B' || type === 'C1' || type === 'C2') {
      defaults[type] = Number(row.default_amount) || 0;
    }
  }
  return defaults;
};

// Atualiza o valor padrão de um tipo. Restrito ao admin (ID 9999).
export const updateBonusDefault = async (
  type: BonusType,
  amount: number,
  updatedBy: string
): Promise<void> => {
  if (updatedBy !== '9999') {
    throw new Error('Apenas o administrador pode alterar os valores padrão de bonificação');
  }

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Valor inválido');
  }

  const { error } = await supabase
    .from('bonus_defaults')
    .update({
      default_amount: amount,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('bonus_type', type);

  if (error) throw error;
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
  employeeId?: string,
  employmentType?: string
): Promise<ErrorRecord[]> => {
  let query = supabase
    .from('error_records')
    .select(`
      *,
      employees (
        id,
        name,
        cpf,
        employment_type
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

  if (employmentType && employmentType !== 'all' && data) {
    return data.filter(errorRecord =>
      errorRecord.employees?.employment_type === employmentType
    );
  }

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

// ─── Clock-in / Clock-out functions ───────────────────────────────────────────

/** Retorna a data atual no fuso horário do Brasil (UTC-3) como string YYYY-MM-DD */
export function getBrazilDateString(): string {
  const now = new Date();
  const brazilOffset = -3 * 60;
  const local = new Date(now.getTime() + brazilOffset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

/**
 * Calcula horas noturnas (22h–05h) de um intervalo entry → exit.
 * Retorna { hoursWorked, nightHours } em horas decimais.
 */
function calcHours(entry: Date, exit: Date): { hoursWorked: number; nightHours: number } {
  const diffMs = exit.getTime() - entry.getTime();
  const hoursWorked = diffMs / (1000 * 60 * 60);

  // Verifica minuto a minuto quais partes caem no horário noturno (22h–05h) no fuso de Brasília (UTC-3).
  // Os timestamps são UTC, então convertemos: hBRT = (utcHour - 3 + 24) % 24
  // Noite em BRT: hBRT >= 22 OU hBRT < 5
  let nightMinutes = 0;
  const step = 60 * 1000; // 1 minuto
  for (let t = entry.getTime(); t < exit.getTime(); t += step) {
    const utcHour = new Date(t).getUTCHours();
    const hBRT = (utcHour - 3 + 24) % 24;
    if (hBRT >= 22 || hBRT < 5) nightMinutes++;
  }
  const nightHours = nightMinutes / 60;

  return { hoursWorked: Math.round(hoursWorked * 100) / 100, nightHours: Math.round(nightHours * 100) / 100 };
}

/** Busca o histórico de attendance de um funcionário nos últimos N dias. */
export const getEmployeeAttendanceHistory = async (
  employeeId: string,
  days: number = 30
): Promise<Attendance[]> => {
  const endDate = getBrazilDateString();
  const startMs = new Date(endDate).getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  const startDate = new Date(startMs).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
};

/** Busca funcionário por CPF. Retorna null se não encontrar. */
export const getEmployeeByCpf = async (cpf: string): Promise<Employee | null> => {
  const cpfNumbers = cpf.replace(/\D/g, '');
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('cpf', cpfNumbers)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/** Busca o registro de attendance de hoje para um funcionário específico. */
export const getEmployeeTodayAttendance = async (employeeId: string): Promise<Attendance | null> => {
  const today = getBrazilDateString();
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', today)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/** Funcionário registra entrada. */
export const clockIn = async (
  employeeId: string,
  geoData?: { latitude: number; longitude: number; accuracy: number; geo_valid: boolean; geo_distance_meters: number }
): Promise<Attendance> => {
  const today = getBrazilDateString();
  const now = new Date().toISOString();

  const record: Record<string, unknown> = {
    employee_id: employeeId,
    date: today,
    status: 'present',
    entry_time: now,
    clock_source: 'employee_self',
    approval_status: 'pending',
  };

  if (geoData) {
    record.entry_latitude = geoData.latitude;
    record.entry_longitude = geoData.longitude;
    record.entry_accuracy = geoData.accuracy;
    record.geo_valid = geoData.geo_valid;
    record.geo_distance_meters = geoData.geo_distance_meters;
  }

  const { data, error } = await supabase
    .from('attendance')
    .upsert([record], { onConflict: 'employee_id,date' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/** Funcionário registra saída. Calcula horas trabalhadas e horas noturnas. */
export const clockOut = async (
  employeeId: string,
  dailyRate?: number,
  geoData?: { latitude: number; longitude: number; accuracy: number; geo_valid: boolean; geo_distance_meters: number }
): Promise<Attendance> => {
  const today = getBrazilDateString();
  const now = new Date();

  const existing = await getEmployeeTodayAttendance(employeeId);
  if (!existing || !existing.entry_time) {
    throw new Error('Nenhuma entrada registrada hoje para calcular a saída');
  }

  const entry = new Date(existing.entry_time);
  const { hoursWorked, nightHours } = calcHours(entry, now);

  let nightAdditional = 0;
  if (nightHours > 0 && hoursWorked > 0 && dailyRate && dailyRate > 0) {
    const hourlyRate = dailyRate / hoursWorked;
    nightAdditional = Math.round(nightHours * hourlyRate * 0.2 * 100) / 100;
  }

  const updateRecord: Record<string, unknown> = {
    exit_time_full: now.toISOString(),
    hours_worked: hoursWorked,
    night_hours: nightHours,
    night_additional: nightAdditional,
  };

  if (geoData) {
    updateRecord.exit_latitude = geoData.latitude;
    updateRecord.exit_longitude = geoData.longitude;
    updateRecord.geo_valid = geoData.geo_valid;
    updateRecord.geo_distance_meters = geoData.geo_distance_meters;
  }

  const { data, error } = await supabase
    .from('attendance')
    .update(updateRecord)
    .eq('employee_id', employeeId)
    .eq('date', today)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Supervisor insere / edita horário manualmente.
 * entryTime e exitTime chegam como "HH:MM:SS" no horário de Brasília (UTC-3).
 * Se exitTime < entryTime, assume turno que passa da meia-noite (acrescenta 1 dia).
 */
export const setManualTime = async (
  employeeId: string,
  date: string,
  entryTime: string,
  exitTime: string,
): Promise<Attendance> => {
  const entry = new Date(`${date}T${entryTime}-03:00`);
  let exit  = new Date(`${date}T${exitTime}-03:00`);

  if (exit <= entry) {
    // turno noturno que passa da meia-noite
    exit = new Date(exit.getTime() + 24 * 60 * 60 * 1000);
  }

  const { hoursWorked, nightHours } = calcHours(entry, exit);

  const { data, error } = await supabase
    .from('attendance')
    .upsert([{
      employee_id: employeeId,
      date,
      status: 'present',
      entry_time: entry.toISOString(),
      exit_time_full: exit.toISOString(),
      hours_worked: hoursWorked,
      night_hours: nightHours,
      clock_source: 'manual',
      approval_status: 'manual',
    }], { onConflict: 'employee_id,date' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/** Busca registros pendentes de aprovação, opcionalmente filtrados por data. */
export const getPendingApprovals = async (date?: string): Promise<Attendance[]> => {
  let query = supabase
    .from('attendance')
    .select(`
      *,
      employees (
        id,
        name,
        cpf,
        employment_type
      )
    `)
    .eq('approval_status', 'pending')
    .order('date', { ascending: false });

  if (date) {
    query = query.eq('date', date);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

/** Aprova um registro de attendance. */
export const approveAttendance = async (attendanceId: string, supervisorId: string): Promise<void> => {
  const { error } = await supabase
    .from('attendance')
    .update({
      approval_status: 'approved',
      approved_by: supervisorId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', attendanceId);

  if (error) throw error;
};

/** Rejeita um registro de attendance com motivo. */
export const rejectAttendance = async (
  attendanceId: string,
  supervisorId: string,
  reason: string
): Promise<void> => {
  const { error } = await supabase
    .from('attendance')
    .update({
      approval_status: 'rejected',
      approved_by: supervisorId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', attendanceId);

  if (error) throw error;
};

/** Aprova em lote uma lista de IDs de attendance, processando em chunks de 50. */
export const bulkApproveAttendance = async (ids: string[], supervisorId: string): Promise<void> => {
  const chunkSize = 50;
  const approvedAt = new Date().toISOString();

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('attendance')
      .update({
        approval_status: 'approved',
        approved_by: supervisorId,
        approved_at: approvedAt,
      })
      .in('id', chunk);

    if (error) throw error;
  }
};

// ─── PIN functions ─────────────────────────────────────────────────────────────

/** Define ou altera o PIN de um funcionário e marca como configurado. */
export const setEmployeePin = async (employeeId: string, pin: string): Promise<void> => {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN deve ser numérico com 4 a 6 dígitos');
  }

  const { error } = await supabase
    .from('employees')
    .update({ pin, pin_configured: true })
    .eq('id', employeeId);

  if (error) throw error;
};

/** Reseta o PIN do funcionário — exige nova criação no próximo acesso. */
export const resetEmployeePin = async (employeeId: string): Promise<void> => {
  const { error } = await supabase
    .from('employees')
    .update({ pin: null, pin_configured: false })
    .eq('id', employeeId);

  if (error) throw error;
};

/** Verifica se o PIN fornecido corresponde ao PIN do funcionário. */
export const verifyEmployeePin = async (employeeId: string, pin: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('employees')
    .select('pin')
    .eq('id', employeeId)
    .single();

  if (error) throw error;
  if (!data?.pin) return false;
  return data.pin === pin;
};

// ─── Geolocation & Fraud functions ───────────────────────────────────────────

export const getGeoConfig = async (): Promise<{
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  block_outside: boolean;
}> => {
  const { data, error } = await supabase
    .from('geolocation_config')
    .select('latitude, longitude, allowed_radius_meters, block_outside')
    .limit(1)
    .single();

  if (error) throw error;
  return data;
};

export function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const registerFraudAttempt = async (
  employeeId: string,
  date: string,
  lat: number | null,
  lon: number | null,
  distanceMeters: number | null,
  clockType: 'entry' | 'exit'
): Promise<void> => {
  const { error } = await supabase.from('geo_fraud_attempts').insert([{
    employee_id: employeeId,
    date,
    latitude: lat,
    longitude: lon,
    distance_meters: distanceMeters,
    clock_type: clockType,
  }]);
  if (error) throw error;
};

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const brazilOffset = -3 * 60;
  const local = new Date(now.getTime() + brazilOffset * 60 * 1000);
  const day = local.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

export const blockEmployeeBonus = async (
  employeeId: string,
  reason: string
): Promise<void> => {
  const { weekStart, weekEnd } = getWeekBounds();
  const { error } = await supabase
    .from('bonus_blocks')
    .upsert([{
      employee_id: employeeId,
      week_start: weekStart,
      week_end: weekEnd,
      reason,
    }], { onConflict: 'employee_id,week_start' });
  if (error) throw error;
};

export const isEmployeeBonusBlocked = async (
  employeeId: string
): Promise<{ blocked: boolean; reason?: string }> => {
  const { weekStart } = getWeekBounds();
  const { data, error } = await supabase
    .from('bonus_blocks')
    .select('reason')
    .eq('employee_id', employeeId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { blocked: false };
  return { blocked: true, reason: data.reason };
};

export const getBlockedEmployeesThisWeek = async (): Promise<
  { employee_id: string; name: string; reason: string; blocked_since: string }[]
> => {
  const { weekStart } = getWeekBounds();
  const { data, error } = await supabase
    .from('bonus_blocks')
    .select('employee_id, reason, created_at, employees (name)')
    .eq('week_start', weekStart);
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    employee_id: row.employee_id as string,
    name: (row.employees as Record<string, unknown>)?.name as string ?? 'Desconhecido',
    reason: row.reason as string,
    blocked_since: row.created_at as string,
  }));
};

export const unblockEmployeeBonus = async (
  employeeId: string,
  adminId: string
): Promise<void> => {
  if (adminId !== '9999') {
    throw new Error('Apenas o administrador pode desbloquear bonificação');
  }
  const { weekStart } = getWeekBounds();
  const { error } = await supabase
    .from('bonus_blocks')
    .delete()
    .eq('employee_id', employeeId)
    .eq('week_start', weekStart);
  if (error) throw error;
};

export const saveFlaggedGeoAttempt = async (
  employeeId: string,
  clockType: 'entry' | 'exit',
  latitude: number,
  longitude: number,
  accuracy: number,
  distanceMeters: number
): Promise<void> => {
  const today = getBrazilDateString();
  const now = new Date().toISOString();

  if (clockType === 'entry') {
    await supabase
      .from('attendance')
      .upsert([{
        employee_id: employeeId,
        date: today,
        status: 'present',
        entry_time: now,
        entry_latitude: latitude,
        entry_longitude: longitude,
        entry_accuracy: accuracy,
        geo_valid: false,
        geo_distance_meters: distanceMeters,
        approval_status: 'pending',
        clock_source: 'employee_self',
      }], { onConflict: 'employee_id,date' });
  } else {
    await supabase
      .from('attendance')
      .update({
        exit_latitude: latitude,
        exit_longitude: longitude,
        geo_valid: false,
        geo_distance_meters: distanceMeters,
      })
      .eq('employee_id', employeeId)
      .eq('date', today);
  }
};