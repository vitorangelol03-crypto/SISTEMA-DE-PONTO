import { supabase } from '../lib/supabase';

export type ActionType = 'create' | 'update' | 'delete' | 'view' | 'export' | 'import' | 'login' | 'logout' | 'bulk_action';

export interface AuditLogData {
  userId: string;
  actionType: ActionType;
  module: string;
  entityType?: string;
  entityId?: string;
  oldData?: Record<string, any>;
  newData?: Record<string, any>;
  description: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ActivityLogData {
  userId: string;
  activityType: string;
  module: string;
  details?: Record<string, any>;
  durationMs?: number;
}

class AuditService {
  private enabled: boolean = true;

  async checkIfEnabled(): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('monitoring_settings')
        .select('setting_value')
        .eq('setting_key', 'error_tracking_enabled')
        .maybeSingle();

      if (data) {
        this.enabled = data.setting_value === true || data.setting_value === 'true';
      }
      return this.enabled;
    } catch (error) {
      console.error('Erro ao verificar configuração de auditoria:', error);
      return this.enabled;
    }
  }

  async logAction(data: AuditLogData): Promise<void> {
    if (!this.enabled) return;

    try {
      const userAgent = navigator?.userAgent || 'Unknown';

      await supabase.from('audit_logs').insert({
        user_id: data.userId,
        action_type: data.actionType,
        module: data.module,
        entity_type: data.entityType,
        entity_id: data.entityId,
        old_data: data.oldData,
        new_data: data.newData,
        description: data.description,
        ip_address: data.ipAddress,
        user_agent: data.userAgent || userAgent,
      });
    } catch (error) {
      console.error('Erro ao registrar log de auditoria:', error);
    }
  }

  async logCreate(
    userId: string,
    module: string,
    entityType: string,
    entityId: string,
    newData: Record<string, any>,
    description: string
  ): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'create',
      module,
      entityType,
      entityId,
      newData,
      description,
    });
  }

  async logUpdate(
    userId: string,
    module: string,
    entityType: string,
    entityId: string,
    oldData: Record<string, any>,
    newData: Record<string, any>,
    description: string
  ): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'update',
      module,
      entityType,
      entityId,
      oldData,
      newData,
      description,
    });
  }

  async logDelete(
    userId: string,
    module: string,
    entityType: string,
    entityId: string,
    oldData: Record<string, any>,
    description: string
  ): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'delete',
      module,
      entityType,
      entityId,
      oldData,
      description,
    });
  }

  async logView(
    userId: string,
    module: string,
    description: string,
    entityType?: string,
    entityId?: string
  ): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'view',
      module,
      entityType,
      entityId,
      description,
    });
  }

  async logExport(
    userId: string,
    module: string,
    description: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'export',
      module,
      description,
      newData: details,
    });
  }

  async logImport(
    userId: string,
    module: string,
    description: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'import',
      module,
      description,
      newData: details,
    });
  }

  async logLogin(userId: string): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'login',
      module: 'auth',
      description: 'Usuário realizou login no sistema',
    });
  }

  async logLogout(userId: string): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'logout',
      module: 'auth',
      description: 'Usuário realizou logout do sistema',
    });
  }

  async logBulkAction(
    userId: string,
    module: string,
    description: string,
    affectedCount: number,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAction({
      userId,
      actionType: 'bulk_action',
      module,
      description: `${description} (${affectedCount} registros)`,
      newData: { affected_count: affectedCount, ...details },
    });
  }

  async logActivity(data: ActivityLogData): Promise<void> {
    if (!this.enabled) return;

    try {
      await supabase.from('activity_logs').insert({
        user_id: data.userId,
        activity_type: data.activityType,
        module: data.module,
        details: data.details,
        duration_ms: data.durationMs,
      });
    } catch (error) {
      console.error('Erro ao registrar log de atividade:', error);
    }
  }

  async logPageView(userId: string, module: string, durationMs?: number): Promise<void> {
    await this.logActivity({
      userId,
      activityType: 'page_view',
      module,
      durationMs,
    });
  }

  async logSearch(
    userId: string,
    module: string,
    searchTerm: string,
    resultsCount: number
  ): Promise<void> {
    await this.logActivity({
      userId,
      activityType: 'search',
      module,
      details: {
        search_term: searchTerm,
        results_count: resultsCount,
      },
    });
  }

  async logFilter(
    userId: string,
    module: string,
    filterCriteria: Record<string, any>
  ): Promise<void> {
    await this.logActivity({
      userId,
      activityType: 'filter',
      module,
      details: filterCriteria,
    });
  }

  async getAuditLogs(filters: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    module?: string;
    actionType?: ActionType;
    limit?: number;
  }) {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters.module) {
      query = query.eq('module', filters.module);
    }

    if (filters.actionType) {
      query = query.eq('action_type', filters.actionType);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar logs de auditoria:', error);
      throw error;
    }

    return data;
  }

  async getActivityLogs(filters: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    module?: string;
    limit?: number;
  }) {
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters.module) {
      query = query.eq('module', filters.module);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar logs de atividade:', error);
      throw error;
    }

    return data;
  }

  async getAuditStats(startDate?: string, endDate?: string) {
    let query = supabase.from('audit_logs').select('action_type, module, created_at');

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar estatísticas de auditoria:', error);
      throw error;
    }

    const stats = {
      totalActions: data?.length || 0,
      actionsByType: {} as Record<string, number>,
      actionsByModule: {} as Record<string, number>,
    };

    data?.forEach((log) => {
      stats.actionsByType[log.action_type] = (stats.actionsByType[log.action_type] || 0) + 1;
      stats.actionsByModule[log.module] = (stats.actionsByModule[log.module] || 0) + 1;
    });

    return stats;
  }
}

export const auditService = new AuditService();
