import { supabase } from '../lib/supabase';
import { User } from './database';

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
        role
      },
      emailRedirectTo: undefined
    }
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      throw new Error('Usuário já existe');
    }
    throw authError;
  }

  if (!authData.user) {
    throw new Error('Erro ao criar usuário');
  }

  const { error: dbError } = await supabase
    .from('users')
    .insert([{
      id: matricula,
      auth_user_id: authData.user.id,
      email,
      password: null,
      role,
      created_by: createdBy
    }]);

  if (dbError) {
    await supabase.auth.admin.deleteUser(authData.user.id);

    if (dbError.code === '23505') {
      throw new Error('Matrícula já cadastrada');
    }
    throw dbError;
  }

  return {
    id: matricula,
    auth_user_id: authData.user.id,
    email,
    password: '',
    role,
    created_by: createdBy,
    created_at: new Date().toISOString()
  };
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
    await supabase.auth.signOut();
    throw new Error('Usuário não encontrado no sistema');
  }

  return {
    id: userData.id,
    auth_user_id: userData.auth_user_id!,
    email: userData.email!,
    password: '',
    role: userData.role,
    created_by: userData.created_by,
    created_at: userData.created_at
  };
};

export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
};

export const getCurrentSession = async (): Promise<AuthUser | null> => {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    return null;
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (userError || !userData) {
    return null;
  }

  return {
    id: userData.id,
    auth_user_id: userData.auth_user_id!,
    email: userData.email!,
    password: '',
    role: userData.role,
    created_by: userData.created_by,
    created_at: userData.created_at
  };
};

export const resetPassword = async (matricula: string): Promise<void> => {
  const email = generateEmail(matricula);

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    throw error;
  }
};

export const updatePassword = async (newPassword: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    throw error;
  }
};
