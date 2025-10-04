import { Employee, Attendance, Payment, ErrorRecord, CollectiveError, Bonus } from './database';

const STORAGE_KEYS = {
  EMPLOYEES: 'mock-employees',
  ATTENDANCE: 'mock-attendance',
  PAYMENTS: 'mock-payments',
  ERROR_RECORDS: 'mock-error-records',
  COLLECTIVE_ERRORS: 'mock-collective-errors',
  BONUSES: 'mock-bonuses',
};

const getFromStorage = <T>(key: string): T[] => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

const saveToStorage = <T>(key: string, data: T[]): void => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const mockDatabase = {
  employees: {
    getAll: async (): Promise<Employee[]> => {
      return getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);
    },

    getById: async (id: string): Promise<Employee | null> => {
      const employees = getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);
      return employees.find(e => e.id === id) || null;
    },

    create: async (employee: Omit<Employee, 'id' | 'created_at'>): Promise<Employee> => {
      const employees = getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);
      const newEmployee: Employee = {
        ...employee,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
      };
      employees.push(newEmployee);
      saveToStorage(STORAGE_KEYS.EMPLOYEES, employees);
      return newEmployee;
    },

    update: async (id: string, updates: Partial<Employee>): Promise<Employee> => {
      const employees = getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);
      const index = employees.findIndex(e => e.id === id);
      if (index === -1) throw new Error('Funcionário não encontrado');

      employees[index] = { ...employees[index], ...updates };
      saveToStorage(STORAGE_KEYS.EMPLOYEES, employees);
      return employees[index];
    },

    delete: async (id: string): Promise<void> => {
      const employees = getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);
      const filtered = employees.filter(e => e.id !== id);
      saveToStorage(STORAGE_KEYS.EMPLOYEES, filtered);
    },
  },

  attendance: {
    getAll: async (): Promise<Attendance[]> => {
      const attendance = getFromStorage<Attendance>(STORAGE_KEYS.ATTENDANCE);
      const employees = getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);

      return attendance.map(a => ({
        ...a,
        employees: employees.find(e => e.id === a.employee_id),
      }));
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<Attendance[]> => {
      const all = await mockDatabase.attendance.getAll();
      return all.filter(a => a.date >= startDate && a.date <= endDate);
    },

    create: async (attendance: Omit<Attendance, 'id' | 'created_at'>): Promise<Attendance> => {
      const attendances = getFromStorage<Attendance>(STORAGE_KEYS.ATTENDANCE);
      const newAttendance: Attendance = {
        ...attendance,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
      };
      attendances.push(newAttendance);
      saveToStorage(STORAGE_KEYS.ATTENDANCE, attendances);
      return newAttendance;
    },

    update: async (id: string, updates: Partial<Attendance>): Promise<Attendance> => {
      const attendances = getFromStorage<Attendance>(STORAGE_KEYS.ATTENDANCE);
      const index = attendances.findIndex(a => a.id === id);
      if (index === -1) throw new Error('Registro não encontrado');

      attendances[index] = { ...attendances[index], ...updates };
      saveToStorage(STORAGE_KEYS.ATTENDANCE, attendances);
      return attendances[index];
    },
  },

  payments: {
    getAll: async (): Promise<Payment[]> => {
      const payments = getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
      const employees = getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);

      return payments.map(p => ({
        ...p,
        employees: employees.find(e => e.id === p.employee_id),
      }));
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<Payment[]> => {
      const all = await mockDatabase.payments.getAll();
      return all.filter(p => p.date >= startDate && p.date <= endDate);
    },

    create: async (payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> => {
      const payments = getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
      const now = new Date().toISOString();
      const newPayment: Payment = {
        ...payment,
        id: Date.now().toString(),
        created_at: now,
        updated_at: now,
      };
      payments.push(newPayment);
      saveToStorage(STORAGE_KEYS.PAYMENTS, payments);
      return newPayment;
    },

    deleteAll: async (): Promise<void> => {
      saveToStorage(STORAGE_KEYS.PAYMENTS, []);
    },
  },

  errorRecords: {
    getAll: async (): Promise<ErrorRecord[]> => {
      const records = getFromStorage<ErrorRecord>(STORAGE_KEYS.ERROR_RECORDS);
      const employees = getFromStorage<Employee>(STORAGE_KEYS.EMPLOYEES);

      return records.map(r => ({
        ...r,
        employees: employees.find(e => e.id === r.employee_id),
      }));
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<ErrorRecord[]> => {
      const all = await mockDatabase.errorRecords.getAll();
      return all.filter(r => r.date >= startDate && r.date <= endDate);
    },

    create: async (record: Omit<ErrorRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ErrorRecord> => {
      const records = getFromStorage<ErrorRecord>(STORAGE_KEYS.ERROR_RECORDS);
      const now = new Date().toISOString();
      const newRecord: ErrorRecord = {
        ...record,
        id: Date.now().toString(),
        created_at: now,
        updated_at: now,
      };
      records.push(newRecord);
      saveToStorage(STORAGE_KEYS.ERROR_RECORDS, records);
      return newRecord;
    },

    update: async (id: string, updates: Partial<ErrorRecord>): Promise<ErrorRecord> => {
      const records = getFromStorage<ErrorRecord>(STORAGE_KEYS.ERROR_RECORDS);
      const index = records.findIndex(r => r.id === id);
      if (index === -1) throw new Error('Registro não encontrado');

      records[index] = { ...records[index], ...updates, updated_at: new Date().toISOString() };
      saveToStorage(STORAGE_KEYS.ERROR_RECORDS, records);
      return records[index];
    },

    delete: async (id: string): Promise<void> => {
      const records = getFromStorage<ErrorRecord>(STORAGE_KEYS.ERROR_RECORDS);
      const filtered = records.filter(r => r.id !== id);
      saveToStorage(STORAGE_KEYS.ERROR_RECORDS, filtered);
    },

    clearByDate: async (date: string): Promise<void> => {
      const records = getFromStorage<ErrorRecord>(STORAGE_KEYS.ERROR_RECORDS);
      const filtered = records.filter(r => r.date !== date);
      saveToStorage(STORAGE_KEYS.ERROR_RECORDS, filtered);
    },
  },

  collectiveErrors: {
    getAll: async (): Promise<CollectiveError[]> => {
      return getFromStorage<CollectiveError>(STORAGE_KEYS.COLLECTIVE_ERRORS);
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<CollectiveError[]> => {
      const all = await mockDatabase.collectiveErrors.getAll();
      return all.filter(ce => ce.date >= startDate && ce.date <= endDate);
    },

    create: async (error: Omit<CollectiveError, 'id' | 'created_at' | 'updated_at'>): Promise<CollectiveError> => {
      const errors = getFromStorage<CollectiveError>(STORAGE_KEYS.COLLECTIVE_ERRORS);
      const now = new Date().toISOString();
      const newError: CollectiveError = {
        ...error,
        id: Date.now().toString(),
        created_at: now,
        updated_at: now,
      };
      errors.push(newError);
      saveToStorage(STORAGE_KEYS.COLLECTIVE_ERRORS, errors);
      return newError;
    },

    clearByDate: async (date: string): Promise<void> => {
      const errors = getFromStorage<CollectiveError>(STORAGE_KEYS.COLLECTIVE_ERRORS);
      const filtered = errors.filter(e => e.date !== date);
      saveToStorage(STORAGE_KEYS.COLLECTIVE_ERRORS, filtered);
    },
  },

  bonuses: {
    getAll: async (): Promise<Bonus[]> => {
      return getFromStorage<Bonus>(STORAGE_KEYS.BONUSES);
    },

    getByDate: async (date: string): Promise<Bonus | null> => {
      const bonuses = getFromStorage<Bonus>(STORAGE_KEYS.BONUSES);
      return bonuses.find(b => b.date === date) || null;
    },

    create: async (bonus: Omit<Bonus, 'id' | 'created_at'>): Promise<Bonus> => {
      const bonuses = getFromStorage<Bonus>(STORAGE_KEYS.BONUSES);
      const newBonus: Bonus = {
        ...bonus,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
      };
      bonuses.push(newBonus);
      saveToStorage(STORAGE_KEYS.BONUSES, bonuses);
      return newBonus;
    },

    update: async (id: string, updates: Partial<Bonus>): Promise<Bonus> => {
      const bonuses = getFromStorage<Bonus>(STORAGE_KEYS.BONUSES);
      const index = bonuses.findIndex(b => b.id === id);
      if (index === -1) throw new Error('Bônus não encontrado');

      bonuses[index] = { ...bonuses[index], ...updates };
      saveToStorage(STORAGE_KEYS.BONUSES, bonuses);
      return bonuses[index];
    },
  },
};
