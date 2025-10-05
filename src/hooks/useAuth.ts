import { useState, useEffect } from 'react';
import { getCurrentSession, signOut as authSignOut } from '../services/authService';
import { User } from '../services/database';
import { authLogger } from '../utils/logger';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentSession()
      .then((session) => {
        setUser(session);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  const login = (userData: User) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await authSignOut();
      setUser(null);
      if (user) authLogger.logout(user.id);
    } catch (error) {
      authLogger.loginFailure(user?.id || 'unknown', 'Erro ao fazer logout');
      setUser(null);
    }
  };

  return { user, loading, login, logout };
};