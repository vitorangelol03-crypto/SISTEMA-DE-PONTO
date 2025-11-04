import { supabase } from '../lib/supabase';

export type ErrorType = 'js_error' | 'api_error' | 'database_error' | 'network_error' | 'auth_error' | 'validation_error';
export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ErrorLogData {
  userId?: string;
  errorType: ErrorType;
  severity: ErrorSeverity;
  message: string;
  stackTrace?: string;
  component?: string;
  module?: string;
  errorContext?: Record<string, any>;
  userAgent?: string;
}

class ErrorTrackingService {
  private enabled: boolean = true;
  private errorCache: Map<string, { count: number; lastOccurrence: Date }> = new Map();
  private readonly DEBOUNCE_TIME_MS = 5000; // 5 segundos

  constructor() {
    this.initializeGlobalErrorHandlers();
    this.checkIfEnabled();
  }

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
      console.error('Erro ao verificar configuração de rastreamento:', error);
      return this.enabled;
    }
  }

  private initializeGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.captureError({
        errorType: 'js_error',
        severity: 'high',
        message: event.message,
        stackTrace: event.error?.stack,
        errorContext: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        errorType: 'js_error',
        severity: 'high',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stackTrace: event.reason?.stack,
        errorContext: {
          reason: event.reason,
        },
      });
    });
  }

  private getErrorHash(data: ErrorLogData): string {
    return `${data.errorType}-${data.message}-${data.component || 'unknown'}`;
  }

  private shouldLogError(data: ErrorLogData): boolean {
    const errorHash = this.getErrorHash(data);
    const cached = this.errorCache.get(errorHash);

    if (cached) {
      const timeSinceLastOccurrence = Date.now() - cached.lastOccurrence.getTime();
      if (timeSinceLastOccurrence < this.DEBOUNCE_TIME_MS) {
        this.errorCache.set(errorHash, {
          count: cached.count + 1,
          lastOccurrence: new Date(),
        });
        return false;
      }
    }

    this.errorCache.set(errorHash, {
      count: 1,
      lastOccurrence: new Date(),
    });

    return true;
  }

  async captureError(data: ErrorLogData): Promise<void> {
    if (!this.enabled) return;

    if (!this.shouldLogError(data)) {
      return;
    }

    try {
      const userAgent = navigator?.userAgent || 'Unknown';
      const errorHash = this.getErrorHash(data);
      const cached = this.errorCache.get(errorHash);

      const { data: existingError } = await supabase
        .from('error_logs')
        .select('id, occurrence_count')
        .eq('error_type', data.errorType)
        .eq('message', data.message)
        .eq('component', data.component || '')
        .eq('resolved', false)
        .maybeSingle();

      if (existingError) {
        await supabase
          .from('error_logs')
          .update({
            occurrence_count: existingError.occurrence_count + (cached?.count || 1),
            last_occurred_at: new Date().toISOString(),
            user_id: data.userId,
          })
          .eq('id', existingError.id);
      } else {
        await supabase.from('error_logs').insert({
          user_id: data.userId,
          error_type: data.errorType,
          severity: data.severity,
          message: data.message,
          stack_trace: data.stackTrace,
          component: data.component,
          module: data.module,
          error_context: data.errorContext,
          user_agent: data.userAgent || userAgent,
          occurrence_count: cached?.count || 1,
          first_occurred_at: new Date().toISOString(),
          last_occurred_at: new Date().toISOString(),
        });
      }

      if (data.severity === 'critical') {
        this.notifyCriticalError(data);
      }
    } catch (error) {
      console.error('Erro ao registrar erro no sistema:', error);
    }
  }

  async captureJSError(
    error: Error,
    component?: string,
    module?: string,
    severity: ErrorSeverity = 'medium',
    userId?: string
  ): Promise<void> {
    await this.captureError({
      userId,
      errorType: 'js_error',
      severity,
      message: error.message,
      stackTrace: error.stack,
      component,
      module,
    });
  }

  async captureAPIError(
    message: string,
    statusCode: number,
    endpoint: string,
    module?: string,
    userId?: string
  ): Promise<void> {
    const severity: ErrorSeverity = statusCode >= 500 ? 'high' : 'medium';

    await this.captureError({
      userId,
      errorType: 'api_error',
      severity,
      message,
      component: endpoint,
      module,
      errorContext: {
        status_code: statusCode,
        endpoint,
      },
    });
  }

  async captureDatabaseError(
    message: string,
    operation: string,
    module?: string,
    userId?: string
  ): Promise<void> {
    await this.captureError({
      userId,
      errorType: 'database_error',
      severity: 'high',
      message,
      component: operation,
      module,
    });
  }

  async captureNetworkError(
    message: string,
    url: string,
    module?: string,
    userId?: string
  ): Promise<void> {
    await this.captureError({
      userId,
      errorType: 'network_error',
      severity: 'medium',
      message,
      component: url,
      module,
      errorContext: {
        url,
      },
    });
  }

  async captureAuthError(
    message: string,
    module?: string,
    userId?: string
  ): Promise<void> {
    await this.captureError({
      userId,
      errorType: 'auth_error',
      severity: 'high',
      message,
      module,
    });
  }

  async captureValidationError(
    message: string,
    field: string,
    component?: string,
    module?: string,
    userId?: string
  ): Promise<void> {
    await this.captureError({
      userId,
      errorType: 'validation_error',
      severity: 'low',
      message,
      component,
      module,
      errorContext: {
        field,
      },
    });
  }

  private async notifyCriticalError(data: ErrorLogData): Promise<void> {
    try {
      const { data: settings } = await supabase
        .from('monitoring_settings')
        .select('setting_value')
        .eq('setting_key', 'critical_error_notifications')
        .maybeSingle();

      if (settings?.setting_value === true || settings?.setting_value === 'true') {
        console.error('🚨 ERRO CRÍTICO DETECTADO:', data.message);
      }
    } catch (error) {
      console.error('Erro ao notificar erro crítico:', error);
    }
  }

  async getErrorLogs(filters: {
    startDate?: string;
    endDate?: string;
    errorType?: ErrorType;
    severity?: ErrorSeverity;
    module?: string;
    resolved?: boolean;
    limit?: number;
  }) {
    let query = supabase
      .from('error_logs')
      .select('*')
      .order('last_occurred_at', { ascending: false });

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    if (filters.errorType) {
      query = query.eq('error_type', filters.errorType);
    }

    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }

    if (filters.module) {
      query = query.eq('module', filters.module);
    }

    if (filters.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar logs de erros:', error);
      throw error;
    }

    return data;
  }

  async resolveError(errorId: string, resolvedBy: string): Promise<void> {
    const { error } = await supabase
      .from('error_logs')
      .update({
        resolved: true,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', errorId);

    if (error) {
      console.error('Erro ao marcar erro como resolvido:', error);
      throw error;
    }
  }

  async unresolveError(errorId: string): Promise<void> {
    const { error } = await supabase
      .from('error_logs')
      .update({
        resolved: false,
        resolved_by: null,
        resolved_at: null,
      })
      .eq('id', errorId);

    if (error) {
      console.error('Erro ao reabrir erro:', error);
      throw error;
    }
  }

  async getErrorStats(startDate?: string, endDate?: string) {
    let query = supabase.from('error_logs').select('error_type, severity, resolved, occurrence_count');

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar estatísticas de erros:', error);
      throw error;
    }

    const stats = {
      totalErrors: data?.length || 0,
      totalOccurrences: data?.reduce((sum, log) => sum + (log.occurrence_count || 1), 0) || 0,
      resolvedErrors: data?.filter((log) => log.resolved).length || 0,
      unresolvedErrors: data?.filter((log) => !log.resolved).length || 0,
      criticalErrors: data?.filter((log) => log.severity === 'critical' && !log.resolved).length || 0,
      errorsByType: {} as Record<string, number>,
      errorsBySeverity: {} as Record<string, number>,
    };

    data?.forEach((log) => {
      stats.errorsByType[log.error_type] = (stats.errorsByType[log.error_type] || 0) + 1;
      stats.errorsBySeverity[log.severity] = (stats.errorsBySeverity[log.severity] || 0) + 1;
    });

    return stats;
  }

  clearCache(): void {
    this.errorCache.clear();
  }
}

export const errorTracking = new ErrorTrackingService();
