import { supabase } from '../lib/supabase';
import { UserPermissions, UserPermissionRecord, PermissionLog, DEFAULT_ADMIN_PERMISSIONS, DEFAULT_SUPERVISOR_PERMISSIONS } from '../types/permissions';

function mergePermissionsWithDefaults(existingPermissions: UserPermissions | null): UserPermissions {
  if (!existingPermissions) {
    return DEFAULT_SUPERVISOR_PERMISSIONS;
  }

  const merged: UserPermissions = { ...DEFAULT_SUPERVISOR_PERMISSIONS };

  for (const module in merged) {
    if (module in existingPermissions) {
      merged[module as keyof UserPermissions] = {
        ...merged[module as keyof UserPermissions],
        ...existingPermissions[module as keyof UserPermissions]
      };
    }
  }

  return merged;
}

export async function getUserPermissions(userId: string): Promise<UserPermissions | null> {
  try {
    const { data, error } = await supabase
      .from('user_permissions')
      .select('permissions')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar permissões:', error);
      return null;
    }

    const permissions = data?.permissions || null;
    return mergePermissionsWithDefaults(permissions);
  } catch (error) {
    console.error('Erro ao buscar permissões:', error);
    return null;
  }
}

export async function saveUserPermissions(
  userId: string,
  permissions: UserPermissions,
  changedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: existing } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const permissionsBefore = existing?.permissions || null;

    if (existing) {
      const { error } = await supabase
        .from('user_permissions')
        .update({
          permissions,
          updated_by: changedBy,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao atualizar permissões:', error);
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await supabase
        .from('user_permissions')
        .insert({
          user_id: userId,
          permissions,
          updated_by: changedBy
        });

      if (error) {
        console.error('Erro ao inserir permissões:', error);
        return { success: false, error: error.message };
      }
    }

    await logPermissionChange(userId, changedBy, permissionsBefore, permissions);

    return { success: true };
  } catch (error) {
    console.error('Erro ao salvar permissões:', error);
    return { success: false, error: String(error) };
  }
}

export async function getAllUserPermissions(): Promise<UserPermissionRecord[]> {
  try {
    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar todas as permissões:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar todas as permissões:', error);
    return [];
  }
}

export async function deleteUserPermissions(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Erro ao deletar permissões:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Erro ao deletar permissões:', error);
    return { success: false, error: String(error) };
  }
}

export async function logPermissionChange(
  userId: string,
  changedBy: string,
  permissionsBefore: UserPermissions | null,
  permissionsAfter: UserPermissions
): Promise<void> {
  try {
    const changeSummary = generateChangeSummary(permissionsBefore, permissionsAfter);

    await supabase
      .from('permission_logs')
      .insert({
        user_id: userId,
        changed_by: changedBy,
        permissions_before: permissionsBefore,
        permissions_after: permissionsAfter,
        change_summary: changeSummary
      });
  } catch (error) {
    console.error('Erro ao registrar log de permissões:', error);
  }
}

export async function getPermissionLogs(userId: string): Promise<PermissionLog[]> {
  try {
    const { data, error } = await supabase
      .from('permission_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Erro ao buscar logs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar logs:', error);
    return [];
  }
}

function generateChangeSummary(before: UserPermissions | null, after: UserPermissions): string {
  if (!before) {
    return 'Permissões criadas';
  }

  const changes: string[] = [];

  Object.entries(after).forEach(([section, permissions]) => {
    const beforeSection = before[section as keyof UserPermissions];

    Object.entries(permissions).forEach(([key, value]) => {
      const beforeValue = beforeSection?.[key as keyof typeof permissions];

      if (beforeValue !== value) {
        const status = value ? 'ativada' : 'desativada';
        changes.push(`${section}.${key} ${status}`);
      }
    });
  });

  return changes.length > 0 ? changes.join(', ') : 'Nenhuma alteração';
}

export async function duplicatePermissions(
  fromUserId: string,
  toUserId: string,
  changedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const permissions = await getUserPermissions(fromUserId);

    if (!permissions) {
      return { success: false, error: 'Permissões de origem não encontradas' };
    }

    return await saveUserPermissions(toUserId, permissions, changedBy);
  } catch (error) {
    console.error('Erro ao duplicar permissões:', error);
    return { success: false, error: String(error) };
  }
}

export async function resetToDefault(
  userId: string,
  role: 'admin' | 'supervisor',
  changedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const defaultPermissions = role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_ADMIN_PERMISSIONS;

    return await saveUserPermissions(userId, defaultPermissions, changedBy);
  } catch (error) {
    console.error('Erro ao resetar permissões:', error);
    return { success: false, error: String(error) };
  }
}

export function hasPermission(
  userPermissions: UserPermissions | null,
  permission: string
): boolean {
  if (!userPermissions) {
    return false;
  }

  const [section, action] = permission.split('.');

  if (!section || !action) {
    return false;
  }

  const sectionPermissions = userPermissions[section as keyof UserPermissions];

  if (!sectionPermissions) {
    return false;
  }

  return sectionPermissions[action as keyof typeof sectionPermissions] === true;
}
