import { useState, useEffect } from 'react';
import { User } from '../services/database';
import { getAuthToken, clearAuthToken } from '../lib/supabase';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sub-fase 14.4.7: detectar inconsistência localStorage user vs
    // sessionStorage JWT custom. localStorage persiste entre sessions;
    // sessionStorage é per-tab. Cenários onde a inconsistência aparece:
    //   - Nova aba (sessionStorage começa vazio, localStorage preserved)
    //   - Vite dev server restart (sessionStorage perdido em reload)
    //   - JWT 24h expirou e clearAuthToken foi chamado
    //
    // Sintoma: app pensa que está logado, mas Supabase client sem JWT custom
    // faz queries como anon → RLS retorna `[]` silenciosamente (sem erro).
    // Funcionários "somem", listas vazias, sem feedback ao usuário.
    //
    // Fix: se localStorage tem user MAS sessionStorage não tem token,
    // limpa user state pra forçar exibição do LoginForm.
    const savedUser = localStorage.getItem('timecard_user');
    const hasJwt = !!getAuthToken();

    if (savedUser && !hasJwt) {
       
      console.warn(
        '[useAuth] localStorage tem user mas sessionStorage não tem JWT — ' +
        'forçando re-login (sessão expirada ou nova aba/dev restart).',
      );
      localStorage.removeItem('timecard_user');
      setLoading(false);
      return;
    }

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error('Erro ao recuperar usuário:', error);
        localStorage.removeItem('timecard_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('timecard_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('timecard_user');
    // Limpa também o JWT custom em sessionStorage pra evitar resíduo.
    clearAuthToken();
  };

  return { user, loading, login, logout };
};