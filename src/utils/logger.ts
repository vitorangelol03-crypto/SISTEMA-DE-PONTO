/**
 * Sistema de Logging Seguro
 *
 * - NÃO loga dados sensíveis (senhas, tokens, CPF completo, etc.)
 * - Logs são desabilitados em produção por padrão
 * - Suporta diferentes níveis de log
 */

const IS_PRODUCTION = import.meta.env.PROD;
const IS_DEV = import.meta.env.DEV;

// Configuração de níveis de log
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// Nível de log atual (apenas ERROR em produção)
const CURRENT_LOG_LEVEL: LogLevel = IS_PRODUCTION ? 'ERROR' : 'DEBUG';

/**
 * Sanitiza dados sensíveis antes de logar
 */
function sanitizeData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  const sanitized: any = {};
  const sensitiveKeys = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'auth',
    'authorization',
  ];

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();

    // Ocultar dados sensíveis
    if (sensitiveKeys.some(sensitive => keyLower.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Mascarar CPF parcialmente
    if (keyLower === 'cpf' && typeof value === 'string') {
      sanitized[key] = value.replace(/(\d{3})\d{6}(\d{2})/, '$1.***.**$2');
      continue;
    }

    // Recursivamente sanitizar objetos aninhados
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Verifica se deve logar baseado no nível
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[CURRENT_LOG_LEVEL];
}

/**
 * Formata a mensagem de log
 */
function formatMessage(level: LogLevel, message: string, context?: string): string {
  const timestamp = new Date().toISOString();
  const ctx = context ? `[${context}]` : '';
  return `[${timestamp}] [${level}] ${ctx} ${message}`;
}

/**
 * Logger principal
 */
export const logger = {
  /**
   * Log de erro - sempre habilitado
   */
  error(message: string, error?: any, context?: string): void {
    if (!shouldLog('ERROR')) return;

    const formatted = formatMessage('ERROR', message, context);

    if (error instanceof Error) {
      console.error(formatted, {
        name: error.name,
        message: error.message,
        stack: IS_DEV ? error.stack : undefined,
      });
    } else if (error) {
      console.error(formatted, sanitizeData(error));
    } else {
      console.error(formatted);
    }
  },

  /**
   * Log de aviso - apenas em desenvolvimento
   */
  warn(message: string, data?: any, context?: string): void {
    if (!shouldLog('WARN')) return;

    const formatted = formatMessage('WARN', message, context);
    if (data) {
      console.warn(formatted, sanitizeData(data));
    } else {
      console.warn(formatted);
    }
  },

  /**
   * Log de informação - apenas em desenvolvimento
   */
  info(message: string, data?: any, context?: string): void {
    if (!shouldLog('INFO')) return;

    const formatted = formatMessage('INFO', message, context);
    if (data) {
      console.info(formatted, sanitizeData(data));
    } else {
      console.info(formatted);
    }
  },

  /**
   * Log de debug - apenas em desenvolvimento
   */
  debug(message: string, data?: any, context?: string): void {
    if (!shouldLog('DEBUG')) return;

    const formatted = formatMessage('DEBUG', message, context);
    if (data) {
      console.log(formatted, sanitizeData(data));
    } else {
      console.log(formatted);
    }
  },
};

/**
 * Logger específico para operações de autenticação
 */
export const authLogger = {
  loginAttempt(userId: string): void {
    logger.info(`Login attempt`, { userId: sanitizeData({ userId }) }, 'AUTH');
  },

  loginSuccess(userId: string): void {
    logger.info(`Login successful`, { userId }, 'AUTH');
  },

  loginFailure(userId: string, reason: string): void {
    logger.warn(`Login failed`, { userId, reason }, 'AUTH');
  },

  logout(userId: string): void {
    logger.info(`User logged out`, { userId }, 'AUTH');
  },

  sessionExpired(): void {
    logger.info(`Session expired`, undefined, 'AUTH');
  },
};

/**
 * Logger específico para operações de banco de dados
 */
export const dbLogger = {
  query(operation: string, table: string): void {
    logger.debug(`Database ${operation}`, { table }, 'DB');
  },

  queryError(operation: string, table: string, error: any): void {
    logger.error(`Database ${operation} failed`, error, `DB:${table}`);
  },

  querySuccess(operation: string, table: string, count?: number): void {
    logger.debug(`Database ${operation} successful`, { table, count }, 'DB');
  },
};
