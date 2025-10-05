import { supabase } from '../lib/supabase';
import { User } from './database';
import { saveSession, clearSession, getSession } from '../utils/sessionManager';

export interface AuthUser extends User {
  auth_user_id: string;
  email: string;
}

const generateEmail = (matricula: string): string => {
  return `${matricula}@sistema.local`;
};

export const signUp = async (
  matricula: string,
  password: string,
  role: 'admin' | 'supervisor',
  createdBy: string
): Promise<AuthUser> => {
  const email = generateEmail(matricula);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        matricula,
        role,
        created_by: createdBy
      }
    }
  });

  if (authError) {
    throw new Error(authError.message);
  }

  if (!authData.user) {
    throw new Error('Erro ao criar usuário');
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert({
      id: matricula,
      auth_user_id: authData.user.id,
      email: email,
      role: role,
      created_by: createdBy
    })
    .select()
    .single();

  if (userError) {
    // NOTA: Não podemos usar admin.deleteUser no Bolt Database
    // O usuário ficará no auth mas sem registro na tabela users
    await supabase.auth.signOut();
    throw new Error(userError.message);
  }

  saveSession(userData, authData.session?.access_token || '');

  return userData as AuthUser;
};

export const signIn = async (matricula: string, password: string): Promise<AuthUser> => {
  const email = generateEmail(matricula);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    throw new Error('Credenciais inválidas');
  }

  if (!authData.user) {
    throw new Error('Erro ao fazer login');
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (userError || !userData) {
    throw new Error('Usuário não encontrado');
  }

  saveSession(userData, authData.session?.access_token || '');

  return userData as AuthUser;
};

export const signOut = async (): Promise<void> => {
  await supabase.auth.signOut();
  clearSession();
};

export const getCurrentSession = async (): Promise<AuthUser | null> => {
  return getSession();
};

export const resetPassword = async (matricula: string): Promise<void> => {
  throw new Error('Reset de senha não implementado');
};

export const updatePassword = async (newPassword: string): Promise<void> => {
  throw new Error('Atualização de senha não implementada');
};
