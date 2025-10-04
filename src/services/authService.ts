import { User } from './database';
import { saveSession, clearSession, getSession } from '../utils/sessionManager';

export interface AuthUser extends User {
  auth_user_id: string;
  email: string;
}

const API_BASE = '/api';

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

  const response = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      matricula,
      email,
      password,
      role,
      createdBy
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao criar usuário');
  }

  const data = await response.json();

  saveSession(data.user, data.session?.access_token);

  return data.user;
};

export const signIn = async (matricula: string, password: string): Promise<AuthUser> => {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: matricula,
      password
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Credenciais inválidas');
  }

  const data = await response.json();

  saveSession(data.user, data.session?.access_token);

  return data.user;
};

export const signOut = async (): Promise<void> => {
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
