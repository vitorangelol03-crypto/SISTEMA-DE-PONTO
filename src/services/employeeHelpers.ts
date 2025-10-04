import { supabase } from '../lib/supabase';
import { validateCPF } from '../utils/validation';
import { trimAndSanitize } from '../utils/sanitization';

export interface EmployeeValidation {
  isValid: boolean;
  error?: string;
}

export const validateEmployeeName = (name: string): EmployeeValidation => {
  const trimmed = name.trim();

  if (!trimmed || trimmed.length < 3) {
    return {
      isValid: false,
      error: 'Nome deve ter pelo menos 3 caracteres'
    };
  }

  if (trimmed.length > 100) {
    return {
      isValid: false,
      error: 'Nome não pode ter mais de 100 caracteres'
    };
  }

  if (!/^[a-zA-ZÀ-ÿ\s]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Nome deve conter apenas letras e espaços'
    };
  }

  return { isValid: true };
};

export const validatePixKey = (pixKey: string): EmployeeValidation => {
  if (!pixKey || !pixKey.trim()) {
    return { isValid: true };
  }

  const trimmed = pixKey.trim();

  if (trimmed.length > 200) {
    return {
      isValid: false,
      error: 'Chave PIX não pode ter mais de 200 caracteres'
    };
  }

  return { isValid: true };
};

export const validateEmployeeData = async (
  name: string,
  cpf: string,
  pixKey: string | null,
  excludeId?: string
): Promise<EmployeeValidation> => {
  const nameValidation = validateEmployeeName(name);
  if (!nameValidation.isValid) {
    return nameValidation;
  }

  if (!validateCPF(cpf)) {
    return {
      isValid: false,
      error: 'CPF inválido'
    };
  }

  if (pixKey) {
    const pixValidation = validatePixKey(pixKey);
    if (!pixValidation.isValid) {
      return pixValidation;
    }
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
  const validation = await validateEmployeeData(name, cpf, pixKey);

  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const cpfNumbers = cpf.replace(/\D/g, '');
  const sanitizedName = trimAndSanitize(name);
  const sanitizedPixKey = pixKey ? trimAndSanitize(pixKey) : null;

  const { data, error } = await supabase
    .from('employees')
    .insert([{
      name: sanitizedName,
      cpf: cpfNumbers,
      pix_key: sanitizedPixKey,
      created_by: createdBy
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('CPF já cadastrado');
    }
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
  const validation = await validateEmployeeData(name, cpf, pixKey, id);

  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const cpfNumbers = cpf.replace(/\D/g, '');
  const sanitizedName = trimAndSanitize(name);
  const sanitizedPixKey = pixKey ? trimAndSanitize(pixKey) : null;

  const { data, error } = await supabase
    .from('employees')
    .update({
      name: sanitizedName,
      cpf: cpfNumbers,
      pix_key: sanitizedPixKey
    })
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
};
