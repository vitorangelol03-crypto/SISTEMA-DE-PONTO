import { User } from './database';
import { mockSignIn, mockGetCurrentSession } from './mockAuth';

export interface AuthUser extends User {
  auth_user_id: string;
  email: string;
}

const USE_MOCK = true;
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

  localStorage.setItem('auth-session', JSON.stringify({
    user: data.user,
    access_token: data.session?.access_token,
  }));

  return data.user;
};

export const signIn = async (matricula: string, password: string): Promise<AuthUser> => {
  if (USE_MOCK) {
    const user = await mockSignIn(matricula, password);
    localStorage.setItem('auth-session', JSON.stringify({ user }));
    return user;
  }

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

  localStorage.setItem('auth-session', JSON.stringify({
    user: data.user,
    access_token: data.session?.access_token,
  }));

  return data.user;
};

export const signOut = async (): Promise<void> => {
  localStorage.removeItem('auth-session');
};

export const getCurrentSession = async (): Promise<AuthUser | null> => {
  if (USE_MOCK) {
    return mockGetCurrentSession();
  }

  const sessionStr = localStorage.getItem('auth-session');

  if (!sessionStr) {
    return null;
  }

  try {
    const session = JSON.parse(sessionStr);
    return session.user;
  } catch {
    return null;
  }
};

export const resetPassword = async (matricula: string): Promise<void> => {
  throw new Error('Reset de senha não implementado');
};

export const updatePassword = async (newPassword: string): Promise<void> => {
  throw new Error('Atualização de senha não implementada');
};
