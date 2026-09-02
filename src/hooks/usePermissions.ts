import { useState, useEffect, useCallback } from 'react';
import { UserPermissions, DEFAULT_ADMIN_PERMISSIONS } from '../types/permissions';
import { getUserPermissions, hasPermission as checkPermission } from '../services/permissions';
import { PONTO_EDITOR_ID } from '../config/masters';

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

      // 02/09/2026: só o 2626 continua com bypass incondicional (líder único e fixo).
      // 9999/8888 passaram a ser configuráveis — usam a permissão real salva no banco
      // (nasce com tudo true via migration, mas fica de fato limitável depois).
      if (userId === PONTO_EDITOR_ID) {
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
      // 02/09/2026: as travas exclusivas de Ponto/Driverpay/Aprovação de Cadastro
      // foram removidas — viraram permissão normal, checada como qualquer outra.
      // Só o 2626 continua com bypass incondicional (líder único e fixo).
      if (userId === PONTO_EDITOR_ID) {
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
