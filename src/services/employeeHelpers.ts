import { supabase } from '../lib/supabase';
import { validateCPF } from '../utils/validation';

export interface EmployeeValidation {
  isValid: boolean;
  error?: string;
}

export const validateEmployeeData = async (
  name: string,
  cpf: string,
  excludeId?: string
): Promise<EmployeeValidation> => {
  if (!name.trim() || name.trim().length < 3) {
    return {
      isValid: false,
      error: 'Nome deve ter pelo menos 3 caracteres'
    };
  }

  if (!validateCPF(cpf)) {
    return {
      isValid: false,
      error: 'CPF inválido'
    };
  }

  const cpfNumbers = cpf.replace(/\D/g, '');

  let query = supabase
    .from('employees')
    .select('id')
    .eq('cpf', cpfNumbers);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data: existingEmployee } = await query.maybeSingle();

  if (existingEmployee) {
    return {
      isValid: false,
      error: 'CPF já cadastrado'
    };
  }

  return { isValid: true };
};

export const createEmployeeWithValidation = async (
  name: string,
  cpf: string,
  pixKey: string | null,
  createdBy: string
) => {
  const validation = await validateEmployeeData(name, cpf);

  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const cpfNumbers = cpf.replace(/\D/g, '');

  const { data, error } = await supabase
    .from('employees')
    .insert([{
      name: name.trim(),
      cpf: cpfNumbers,
      pix_key: pixKey?.trim() || null,
      created_by: createdBy
    }])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const updateEmployeeWithValidation = async (
  id: string,
  name: string,
  cpf: string,
  pixKey: string | null
) => {
  const validation = await validateEmployeeData(name, cpf, id);

  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const cpfNumbers = cpf.replace(/\D/g, '');

  const { data, error } = await supabase
    .from('employees')
    .update({
      name: name.trim(),
      cpf: cpfNumbers,
      pix_key: pixKey?.trim() || null
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};
