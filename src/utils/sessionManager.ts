import { User } from '../services/database';

const SESSION_KEY = 'auth-session';
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000;

interface SessionData {
  user: User;
  access_token?: string;
  timestamp: number;
}

export const saveSession = (user: User, accessToken?: string): void => {
  const sessionData: SessionData = {
    user,
    access_token: accessToken,
    timestamp: Date.now()
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.error('Error saving session:', error);
  }
};

export const getSession = (): User | null => {
  try {
    const sessionStr = sessionStorage.getItem(SESSION_KEY);

    if (!sessionStr) {
      return null;
    }

    const sessionData: SessionData = JSON.parse(sessionStr);

    if (!sessionData.timestamp) {
      clearSession();
      return null;
    }

    const now = Date.now();
    const sessionAge = now - sessionData.timestamp;

    if (sessionAge > SESSION_TIMEOUT) {
      clearSession();
      return null;
    }

    return sessionData.user;
  } catch (error) {
    console.error('Error reading session:', error);
    clearSession();
    return null;
  }
};

export const clearSession = (): void => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Error clearing session:', error);
  }
};

export const isSessionValid = (): boolean => {
  return getSession() !== null;
};
