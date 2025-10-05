import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Usar IIFE para evitar deadlock com async callbacks
        (async () => {
          if (event === 'SIGNED_IN' && session) {
            const currentUser = await getCurrentSession();
            setUser(currentUser);
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
          } else if (event === 'TOKEN_REFRESHED' && session) {
            const currentUser = await getCurrentSession();
            setUser(currentUser);
          }
        })();
      }
    );

    return () => {
      subscription.unsubscribe();
    };
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