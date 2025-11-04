import { useState, useEffect, useCallback } from 'react';
import { UserPermissions, DEFAULT_ADMIN_PERMISSIONS } from '../types/permissions';
import { getUserPermissions, hasPermission as checkPermission } from '../services/permissions';

export function usePermissions(userId: string | null) {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!userId) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const userPermissions = await getUserPermissions(userId);

      if (userId === '9999') {
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
      } else {
        setPermissions(userPermissions);
      }
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (userId === '9999') {
        return true;
      }

      return checkPermission(permissions, permission);
    },
    [permissions, userId]
  );

  const refreshPermissions = useCallback(() => {
    loadPermissions();
  }, [loadPermissions]);

  return {
    permissions,
    loading,
    hasPermission,
    refreshPermissions
  };
}
