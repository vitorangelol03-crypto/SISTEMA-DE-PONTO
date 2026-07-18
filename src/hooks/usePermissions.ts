import { useState, useEffect, useCallback } from 'react';
import { UserPermissions, DEFAULT_ADMIN_PERMISSIONS } from '../types/permissions';
import { getUserPermissions, hasPermission as checkPermission } from '../services/permissions';
import { isMaster, isPontoEditPermission, canEditPonto, isDriverpayPermission, canAccessDriverpay } from '../config/masters';

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

      if (isMaster(userId)) {
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
      // Edição de ponto (data/horário) e reset são EXCLUSIVOS do editor de ponto (2626),
      // acima de qualquer bypass de mestre — nem o 9999 pode. Espelha o trigger no banco.
      if (isPontoEditPermission(permission)) {
        return canEditPonto(userId);
      }

      // Pagamentos Driver: módulo inteiro EXCLUSIVO do 2626 (nem 9999 vê a aba). Acima do bypass.
      if (isDriverpayPermission(permission)) {
        return canAccessDriverpay(userId);
      }

      if (isMaster(userId)) {
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
