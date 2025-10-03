import { AuthUser } from './authService';

const MOCK_USERS: Record<string, { password: string; user: AuthUser }> = {
  '9999': {
    password: '684171',
    user: {
      id: '9999',
      auth_user_id: 'mock-admin-id',
      email: '9999@sistema.local',
      password: '',
      role: 'admin',
      created_by: 'system',
      created_at: new Date().toISOString(),
    },
  },
};

export const mockSignIn = async (matricula: string, password: string): Promise<AuthUser> => {
  await new Promise(resolve => setTimeout(resolve, 500));

  const mockUser = MOCK_USERS[matricula];

  if (!mockUser || mockUser.password !== password) {
    throw new Error('Credenciais inválidas');
  }

  return mockUser.user;
};

export const mockGetCurrentSession = async (): Promise<AuthUser | null> => {
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
