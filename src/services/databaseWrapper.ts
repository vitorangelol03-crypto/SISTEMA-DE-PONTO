import { mockDatabase } from './mockDatabase';
import type { Employee, Attendance, Payment, ErrorRecord, CollectiveError, Bonus } from './database';

const USE_MOCK = true;

export const db = {
  employees: {
    getAll: async (): Promise<Employee[]> => {
      if (USE_MOCK) return mockDatabase.employees.getAll();
      throw new Error('Supabase não disponível');
    },

    getById: async (id: string): Promise<Employee | null> => {
      if (USE_MOCK) return mockDatabase.employees.getById(id);
      throw new Error('Supabase não disponível');
    },

    create: async (employee: Omit<Employee, 'id' | 'created_at'>): Promise<Employee> => {
      if (USE_MOCK) return mockDatabase.employees.create(employee);
      throw new Error('Supabase não disponível');
    },

    update: async (id: string, updates: Partial<Employee>): Promise<Employee> => {
      if (USE_MOCK) return mockDatabase.employees.update(id, updates);
      throw new Error('Supabase não disponível');
    },

    delete: async (id: string): Promise<void> => {
      if (USE_MOCK) return mockDatabase.employees.delete(id);
      throw new Error('Supabase não disponível');
    },
  },

  attendance: {
    getAll: async (): Promise<Attendance[]> => {
      if (USE_MOCK) return mockDatabase.attendance.getAll();
      throw new Error('Supabase não disponível');
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<Attendance[]> => {
      if (USE_MOCK) return mockDatabase.attendance.getByDateRange(startDate, endDate);
      throw new Error('Supabase não disponível');
    },

    create: async (attendance: Omit<Attendance, 'id' | 'created_at'>): Promise<Attendance> => {
      if (USE_MOCK) return mockDatabase.attendance.create(attendance);
      throw new Error('Supabase não disponível');
    },

    update: async (id: string, updates: Partial<Attendance>): Promise<Attendance> => {
      if (USE_MOCK) return mockDatabase.attendance.update(id, updates);
      throw new Error('Supabase não disponível');
    },
  },

  payments: {
    getAll: async (): Promise<Payment[]> => {
      if (USE_MOCK) return mockDatabase.payments.getAll();
      throw new Error('Supabase não disponível');
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<Payment[]> => {
      if (USE_MOCK) return mockDatabase.payments.getByDateRange(startDate, endDate);
      throw new Error('Supabase não disponível');
    },

    create: async (payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> => {
      if (USE_MOCK) return mockDatabase.payments.create(payment);
      throw new Error('Supabase não disponível');
    },

    deleteAll: async (): Promise<void> => {
      if (USE_MOCK) return mockDatabase.payments.deleteAll();
      throw new Error('Supabase não disponível');
    },
  },

  errorRecords: {
    getAll: async (): Promise<ErrorRecord[]> => {
      if (USE_MOCK) return mockDatabase.errorRecords.getAll();
      throw new Error('Supabase não disponível');
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<ErrorRecord[]> => {
      if (USE_MOCK) return mockDatabase.errorRecords.getByDateRange(startDate, endDate);
      throw new Error('Supabase não disponível');
    },

    create: async (record: Omit<ErrorRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ErrorRecord> => {
      if (USE_MOCK) return mockDatabase.errorRecords.create(record);
      throw new Error('Supabase não disponível');
    },

    update: async (id: string, updates: Partial<ErrorRecord>): Promise<ErrorRecord> => {
      if (USE_MOCK) return mockDatabase.errorRecords.update(id, updates);
      throw new Error('Supabase não disponível');
    },

    delete: async (id: string): Promise<void> => {
      if (USE_MOCK) return mockDatabase.errorRecords.delete(id);
      throw new Error('Supabase não disponível');
    },

    clearByDate: async (date: string): Promise<void> => {
      if (USE_MOCK) return mockDatabase.errorRecords.clearByDate(date);
      throw new Error('Supabase não disponível');
    },
  },

  collectiveErrors: {
    getAll: async (): Promise<CollectiveError[]> => {
      if (USE_MOCK) return mockDatabase.collectiveErrors.getAll();
      throw new Error('Supabase não disponível');
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<CollectiveError[]> => {
      if (USE_MOCK) return mockDatabase.collectiveErrors.getByDateRange(startDate, endDate);
      throw new Error('Supabase não disponível');
    },

    create: async (error: Omit<CollectiveError, 'id' | 'created_at' | 'updated_at'>): Promise<CollectiveError> => {
      if (USE_MOCK) return mockDatabase.collectiveErrors.create(error);
      throw new Error('Supabase não disponível');
    },

    clearByDate: async (date: string): Promise<void> => {
      if (USE_MOCK) return mockDatabase.collectiveErrors.clearByDate(date);
      throw new Error('Supabase não disponível');
    },
  },

  bonuses: {
    getAll: async (): Promise<Bonus[]> => {
      if (USE_MOCK) return mockDatabase.bonuses.getAll();
      throw new Error('Supabase não disponível');
    },

    getByDate: async (date: string): Promise<Bonus | null> => {
      if (USE_MOCK) return mockDatabase.bonuses.getByDate(date);
      throw new Error('Supabase não disponível');
    },

    create: async (bonus: Omit<Bonus, 'id' | 'created_at'>): Promise<Bonus> => {
      if (USE_MOCK) return mockDatabase.bonuses.create(bonus);
      throw new Error('Supabase não disponível');
    },

    update: async (id: string, updates: Partial<Bonus>): Promise<Bonus> => {
      if (USE_MOCK) return mockDatabase.bonuses.update(id, updates);
      throw new Error('Supabase não disponível');
    },
  },
};
