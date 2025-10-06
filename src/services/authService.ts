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
  console.log('[AuthService] Attempting login for:', matricula);

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', matricula)
    .maybeSingle();

  console.log('[AuthService] User query result:', { userData, userError });

  if (userError) {
    console.error('[AuthService] Database error:', userError);
    throw new Error('Erro ao buscar usuário: ' + userError.message);
  }

  if (!userData) {
    console.error('[AuthService] User not found');
    throw new Error('Usuário não encontrado');
  }

  console.log('[AuthService] User found, verifying password...');
  const isPasswordValid = await verifyPassword(password, userData.password);
  console.log('[AuthService] Password valid:', isPasswordValid);

  if (!isPasswordValid) {
    throw new Error('Senha inválida');
  }

  saveSession(userData);
  console.log('[AuthService] Login successful');

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
