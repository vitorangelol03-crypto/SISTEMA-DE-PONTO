import { db } from './databaseWrapper';
import type { Employee, Attendance, Payment, ErrorRecord, CollectiveError, Bonus, User } from './database';

export * from './database';

export const getAllEmployees = async (): Promise<Employee[]> => {
  return db.employees.getAll();
};

export const createEmployee = async (name: string, cpf: string, pixKey: string | null, createdBy: string): Promise<void> => {
  await db.employees.create({ name, cpf, pix_key: pixKey, created_by: createdBy });
};

export const updateEmployee = async (id: string, name: string, cpf: string, pixKey: string | null): Promise<void> => {
  await db.employees.update(id, { name, cpf, pix_key: pixKey });
};

export const deleteEmployee = async (id: string): Promise<void> => {
  await db.employees.delete(id);
};

export const getTodayAttendance = async (): Promise<Attendance[]> => {
  const today = new Date().toISOString().split('T')[0];
  const all = await db.attendance.getAll();
  return all.filter(a => a.date === today);
};

export const getAttendanceHistory = async (startDate: string, endDate: string): Promise<Attendance[]> => {
  return db.attendance.getByDateRange(startDate, endDate);
};

export const markAttendance = async (
  employeeId: string,
  date: string,
  status: 'present' | 'absent',
  markedBy: string,
  exitTime?: string
): Promise<void> => {
  await db.attendance.create({
    employee_id: employeeId,
    date,
    status,
    exit_time: exitTime || null,
    marked_by: markedBy,
  });
};

export const getPayments = async (startDate: string, endDate: string): Promise<Payment[]> => {
  return db.payments.getByDateRange(startDate, endDate);
};

export const clearAllPayments = async (): Promise<void> => {
  await db.payments.deleteAll();
};

export const upsertPayment = async (
  employeeId: string,
  date: string,
  dailyRate: number,
  bonus: number,
  createdBy: string
): Promise<void> => {
  const total = dailyRate + bonus;
  await db.payments.create({
    employee_id: employeeId,
    date,
    daily_rate: dailyRate,
    bonus,
    total,
    created_by: createdBy,
  });
};

export const getErrorRecords = async (startDate: string, endDate: string): Promise<ErrorRecord[]> => {
  return db.errorRecords.getByDateRange(startDate, endDate);
};

export const upsertErrorRecord = async (
  employeeId: string,
  date: string,
  errorCount: number,
  observations: string | null,
  createdBy: string
): Promise<void> => {
  await db.errorRecords.create({
    employee_id: employeeId,
    date,
    error_count: errorCount,
    observations,
    created_by: createdBy,
  });
};

export const deleteErrorRecord = async (id: string): Promise<void> => {
  await db.errorRecords.delete(id);
};

export const getCollectiveErrors = async (startDate: string, endDate: string): Promise<CollectiveError[]> => {
  return db.collectiveErrors.getByDateRange(startDate, endDate);
};

export const createCollectiveError = async (
  date: string,
  totalErrors: number,
  valuePerError: number,
  observations: string | null,
  createdBy: string
): Promise<void> => {
  const totalAmount = totalErrors * valuePerError;
  await db.collectiveErrors.create({
    date,
    total_errors: totalErrors,
    value_per_error: valuePerError,
    total_amount: totalAmount,
    observations,
    created_by: createdBy,
  });
};

export const getBonuses = async (): Promise<Bonus[]> => {
  return db.bonuses.getAll();
};

export const createBonus = async (date: string, amount: number, createdBy: string): Promise<void> => {
  await db.bonuses.create({ date, amount, created_by: createdBy });
};

export const getAllUsers = async (): Promise<User[]> => {
  return [];
};

export const createUser = async (): Promise<void> => {
  throw new Error('Criação de usuários não disponível no modo mock');
};

export const deleteUser = async (): Promise<void> => {
  throw new Error('Exclusão de usuários não disponível no modo mock');
};

export const initializeSystem = async (): Promise<void> => {
  console.log('Sistema mock inicializado');
};

export const createTables = async (): Promise<void> => {};
export const createDefaultAdmin = async (): Promise<void> => {};

export const deletePayment = async (id: string): Promise<void> => {
  throw new Error('deletePayment não implementado');
};

export const clearEmployeePayments = async (employeeId: string, date: string): Promise<void> => {
  throw new Error('clearEmployeePayments não implementado');
};

export const applyBonusToAllPresent = async (date: string, amount: number, createdBy: string): Promise<void> => {
  throw new Error('applyBonusToAllPresent não implementado');
};

export const getErrorStatistics = async (startDate: string, endDate: string): Promise<any> => {
  const records = await db.errorRecords.getByDateRange(startDate, endDate);
  return { records: [] };
};

export const getCollectiveErrorApplications = async (collectiveErrorId: string): Promise<any[]> => {
  return [];
};
