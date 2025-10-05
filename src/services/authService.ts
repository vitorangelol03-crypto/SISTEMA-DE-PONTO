import { supabase } from '../lib/supabase';
import { User } from './database';
import { saveSession, clearSession, getSession } from '../utils/sessionManager';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const signUp = async (
  matricula: string,
  password: string,
  role: 'admin' | 'supervisor',
  createdBy: string
): Promise<User> => {
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', matricula)
    .maybeSingle();

  if (existingUser) {
    throw new Error('Matrícula já existe');
  }

  const hashedPassword = await hashPassword(password);

  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert({
      id: matricula,
      password: hashedPassword,
      role: role,
      created_by: createdBy
    })
    .select()
    .single();

  if (userError) {
    throw new Error(userError.message);
  }

  saveSession(userData);

  return userData as User;
};

export const signIn = async (matricula: string, password: string): Promise<User> => {
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', matricula)
    .maybeSingle();

  if (userError || !userData) {
    throw new Error('Credenciais inválidas');
  }

  const isPasswordValid = await verifyPassword(password, userData.password);

  if (!isPasswordValid) {
    throw new Error('Credenciais inválidas');
  }

  saveSession(userData);

  return userData as User;
};

export const signOut = async (): Promise<void> => {
  clearSession();
};

export const getCurrentSession = async (): Promise<User | null> => {
  return getSession();
};

export const resetPassword = async (matricula: string): Promise<void> => {
  throw new Error('Reset de senha não implementado');
};

export const updatePassword = async (newPassword: string): Promise<void> => {
  throw new Error('Atualização de senha não implementada');
};
