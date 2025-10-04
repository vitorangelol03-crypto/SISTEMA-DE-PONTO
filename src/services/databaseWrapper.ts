import { supabase } from '../lib/supabase';
import type { Employee, Attendance, Payment, ErrorRecord, CollectiveError, Bonus } from './database';

export const db = {
  employees: {
    getAll: async (): Promise<Employee[]> => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    getById: async (id: string): Promise<Employee | null> => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    create: async (employee: Omit<Employee, 'id' | 'created_at'>): Promise<Employee> => {
      const { data, error } = await supabase
        .from('employees')
        .insert([employee])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('CPF já cadastrado');
        }
        throw error;
      }
      return data;
    },

    update: async (id: string, updates: Partial<Employee>): Promise<Employee> => {
      const { data, error } = await supabase
        .from('employees')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('CPF já cadastrado');
        }
        throw error;
      }
      return data;
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
  },

  attendance: {
    getAll: async (): Promise<Attendance[]> => {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          employees (
            id,
            name,
            cpf,
            pix_key,
            created_by,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<Attendance[]> => {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          employees (
            id,
            name,
            cpf,
            pix_key,
            created_by,
            created_at
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    create: async (attendance: Omit<Attendance, 'id' | 'created_at'>): Promise<Attendance> => {
      const { data, error } = await supabase
        .from('attendance')
        .upsert([attendance], { onConflict: 'employee_id,date' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    update: async (id: string, updates: Partial<Attendance>): Promise<Attendance> => {
      const { data, error } = await supabase
        .from('attendance')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  },

  payments: {
    getAll: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          employees (
            id,
            name,
            cpf,
            pix_key,
            created_by,
            created_at
          )
        `)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          employees (
            id,
            name,
            cpf,
            pix_key,
            created_by,
            created_at
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    create: async (payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('payments')
        .insert([{ ...payment, updated_at: now }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    deleteAll: async (): Promise<void> => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
    },
  },

  errorRecords: {
    getAll: async (): Promise<ErrorRecord[]> => {
      const { data, error } = await supabase
        .from('error_records')
        .select(`
          *,
          employees (
            id,
            name,
            cpf,
            pix_key,
            created_by,
            created_at
          )
        `)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<ErrorRecord[]> => {
      const { data, error } = await supabase
        .from('error_records')
        .select(`
          *,
          employees (
            id,
            name,
            cpf,
            pix_key,
            created_by,
            created_at
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    create: async (record: Omit<ErrorRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ErrorRecord> => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('error_records')
        .upsert([{ ...record, updated_at: now }], { onConflict: 'employee_id,date' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    update: async (id: string, updates: Partial<ErrorRecord>): Promise<ErrorRecord> => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('error_records')
        .update({ ...updates, updated_at: now })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('error_records')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },

    clearByDate: async (date: string): Promise<void> => {
      const { error } = await supabase
        .from('error_records')
        .delete()
        .eq('date', date);

      if (error) throw error;
    },
  },

  collectiveErrors: {
    getAll: async (): Promise<CollectiveError[]> => {
      const { data, error } = await supabase
        .from('collective_errors')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    getByDateRange: async (startDate: string, endDate: string): Promise<CollectiveError[]> => {
      const { data, error } = await supabase
        .from('collective_errors')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    create: async (error: Omit<CollectiveError, 'id' | 'created_at' | 'updated_at'>): Promise<CollectiveError> => {
      const now = new Date().toISOString();
      const { data, error: dbError } = await supabase
        .from('collective_errors')
        .insert([{ ...error, updated_at: now }])
        .select()
        .single();

      if (dbError) throw dbError;
      return data;
    },

    clearByDate: async (date: string): Promise<void> => {
      const { error } = await supabase
        .from('collective_errors')
        .delete()
        .eq('date', date);

      if (error) throw error;
    },
  },

  bonuses: {
    getAll: async (): Promise<Bonus[]> => {
      const { data, error } = await supabase
        .from('bonuses')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    getByDate: async (date: string): Promise<Bonus | null> => {
      const { data, error } = await supabase
        .from('bonuses')
        .select('*')
        .eq('date', date)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    create: async (bonus: Omit<Bonus, 'id' | 'created_at'>): Promise<Bonus> => {
      const { data, error } = await supabase
        .from('bonuses')
        .upsert([bonus], { onConflict: 'date' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    update: async (id: string, updates: Partial<Bonus>): Promise<Bonus> => {
      const { data, error } = await supabase
        .from('bonuses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  },
};
