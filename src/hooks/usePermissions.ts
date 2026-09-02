import { useState, useEffect, useCallback } from 'react';
import { UserPermissions, DEFAULT_ADMIN_PERMISSIONS } from '../types/permissions';
import { getUserPermissions, hasPermission as checkPermission } from '../services/permissions';
import { PONTO_EDITOR_ID, isPontoEditPermission, canEditPonto, isDriverpayPermission, canAccessDriverpay, isEmployeeApprovalPermission, canAccessEmployeeApproval } from '../config/masters';

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
      // Edição de ponto (data/horário) e reset são EXCLUSIVOS do editor de ponto (2626),
      // acima de qualquer bypass de mestre — nem o 9999 pode. Espelha o trigger no banco.
      if (isPontoEditPermission(permission)) {
        return canEditPonto(userId);
      }

      // Pagamentos Driver: módulo inteiro EXCLUSIVO do 2626 (nem 9999 vê a aba). Acima do bypass.
      if (isDriverpayPermission(permission)) {
        return canAccessDriverpay(userId);
      }

      // Aprovação de Cadastro: módulo inteiro EXCLUSIVO do 2626 (nem 9999 vê a aba). Acima do bypass.
      if (isEmployeeApprovalPermission(permission)) {
        return canAccessEmployeeApproval(userId);
      }

      // Só o 2626 continua com bypass incondicional pro resto (ver comentário acima).
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
