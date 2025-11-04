/*
  # Sistema Completo de Monitoramento e Logs de Auditoria

  ## 1. Novas Tabelas
  
  ### audit_logs
  Registra todas as ações importantes do sistema para auditoria completa
  - `id` (uuid, primary key)
  - `user_id` (text, referência para users) - Quem executou a ação
  - `action_type` (text) - Tipo de ação: create, update, delete, view, export, import, login, logout
  - `module` (text) - Módulo do sistema: attendance, employees, financial, users, etc
  - `entity_type` (text) - Tipo de entidade afetada: employee, payment, user, etc
  - `entity_id` (uuid, nullable) - ID da entidade afetada
  - `old_data` (jsonb, nullable) - Dados antes da alteração (para updates e deletes)
  - `new_data` (jsonb, nullable) - Dados depois da alteração (para creates e updates)
  - `description` (text) - Descrição legível da ação
  - `ip_address` (text, nullable) - Endereço IP do usuário
  - `user_agent` (text, nullable) - Navegador/dispositivo usado
  - `created_at` (timestamptz) - Quando a ação ocorreu

  ### activity_logs
  Registra atividades gerais do sistema (navegação, visualizações)
  - `id` (uuid, primary key)
  - `user_id` (text, referência para users)
  - `activity_type` (text) - Tipo: page_view, search, filter, export, etc
  - `module` (text) - Módulo acessado
  - `details` (jsonb, nullable) - Detalhes adicionais da atividade
  - `duration_ms` (integer, nullable) - Duração da atividade em milissegundos
  - `created_at` (timestamptz)

  ### error_logs
  Registra erros técnicos do sistema para monitoramento
  - `id` (uuid, primary key)
  - `user_id` (text, referência para users, nullable) - Usuário que encontrou o erro
  - `error_type` (text) - Tipo: js_error, api_error, database_error, network_error
  - `severity` (text) - Severidade: critical, high, medium, low
  - `message` (text) - Mensagem de erro
  - `stack_trace` (text, nullable) - Stack trace do erro
  - `component` (text, nullable) - Componente onde ocorreu o erro
  - `module` (text, nullable) - Módulo do sistema
  - `error_context` (jsonb, nullable) - Contexto adicional do erro
  - `user_agent` (text, nullable) - Navegador/dispositivo
  - `resolved` (boolean) - Se o erro foi marcado como resolvido
  - `resolved_by` (text, nullable) - Quem marcou como resolvido
  - `resolved_at` (timestamptz, nullable) - Quando foi resolvido
  - `occurrence_count` (integer) - Quantas vezes ocorreu
  - `first_occurred_at` (timestamptz) - Primeira ocorrência
  - `last_occurred_at` (timestamptz) - Última ocorrência
  - `created_at` (timestamptz)

  ### usage_metrics
  Armazena métricas de uso do sistema
  - `id` (uuid, primary key)
  - `user_id` (text, referência para users, nullable)
  - `metric_type` (text) - Tipo: session_duration, page_load_time, action_count, etc
  - `module` (text, nullable) - Módulo relacionado
  - `metric_value` (numeric) - Valor da métrica
  - `metric_unit` (text) - Unidade: ms, seconds, count, etc
  - `metadata` (jsonb, nullable) - Metadados adicionais
  - `recorded_at` (timestamptz) - Quando foi registrado
  - `created_at` (timestamptz)

  ### performance_metrics
  Armazena métricas técnicas de performance
  - `id` (uuid, primary key)
  - `metric_name` (text) - Nome da métrica: LCP, FID, CLS, query_time, etc
  - `metric_value` (numeric) - Valor da métrica
  - `module` (text, nullable) - Módulo relacionado
  - `operation` (text, nullable) - Operação específica
  - `metadata` (jsonb, nullable) - Dados adicionais
  - `recorded_at` (timestamptz)
  - `created_at` (timestamptz)

  ### monitoring_settings
  Configurações do sistema de monitoramento
  - `id` (uuid, primary key)
  - `setting_key` (text, unique) - Chave da configuração
  - `setting_value` (jsonb) - Valor da configuração
  - `description` (text) - Descrição da configuração
  - `updated_by` (text, referência para users)
  - `updated_at` (timestamptz)

  ## 2. Índices para Performance
  Otimização de consultas frequentes em logs

  ## 3. Segurança (RLS)
  - Todas as tabelas de logs restritas a administradores
  - Políticas de SELECT, INSERT para diferentes tipos de logs
  - Apenas admins podem marcar erros como resolvidos
*/

-- ===========================================
-- 1. TABELA: audit_logs
-- ===========================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('create', 'update', 'delete', 'view', 'export', 'import', 'login', 'logout', 'bulk_action')),
  module text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  description text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Índices para audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ===========================================
-- 2. TABELA: activity_logs
-- ===========================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  module text NOT NULL,
  details jsonb,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Índices para activity_logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module);

-- ===========================================
-- 3. TABELA: error_logs
-- ===========================================
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  error_type text NOT NULL CHECK (error_type IN ('js_error', 'api_error', 'database_error', 'network_error', 'auth_error', 'validation_error')),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  message text NOT NULL,
  stack_trace text,
  component text,
  module text,
  error_context jsonb,
  user_agent text,
  resolved boolean DEFAULT false,
  resolved_by text REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  occurrence_count integer DEFAULT 1,
  first_occurred_at timestamptz DEFAULT now(),
  last_occurred_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Índices para error_logs
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_module ON error_logs(module);

-- ===========================================
-- 4. TABELA: usage_metrics
-- ===========================================
CREATE TABLE IF NOT EXISTS usage_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  metric_type text NOT NULL,
  module text,
  metric_value numeric NOT NULL,
  metric_unit text NOT NULL,
  metadata jsonb,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Índices para usage_metrics
CREATE INDEX IF NOT EXISTS idx_usage_metrics_recorded_at ON usage_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_metric_type ON usage_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_module ON usage_metrics(module);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_user_id ON usage_metrics(user_id);

-- ===========================================
-- 5. TABELA: performance_metrics
-- ===========================================
CREATE TABLE IF NOT EXISTS performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  module text,
  operation text,
  metadata jsonb,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Índices para performance_metrics
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded_at ON performance_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_metric_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_module ON performance_metrics(module);

-- ===========================================
-- 6. TABELA: monitoring_settings
-- ===========================================
CREATE TABLE IF NOT EXISTS monitoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  description text NOT NULL,
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

-- Inserir configurações padrão
INSERT INTO monitoring_settings (setting_key, setting_value, description, updated_by)
VALUES 
  ('log_retention_days', '90', 'Período de retenção de logs em dias', NULL),
  ('log_level', '"detailed"', 'Nível de detalhamento dos logs: basic, detailed, debug', NULL),
  ('error_tracking_enabled', 'true', 'Habilitar rastreamento automático de erros', NULL),
  ('performance_tracking_enabled', 'true', 'Habilitar coleta de métricas de performance', NULL),
  ('critical_error_notifications', 'true', 'Enviar notificações para erros críticos', NULL),
  ('auto_cleanup_enabled', 'false', 'Habilitar limpeza automática de logs antigos', NULL)
ON CONFLICT (setting_key) DO NOTHING;

-- ===========================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ===========================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para audit_logs
CREATE POLICY "Admins podem visualizar todos os logs de auditoria"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Sistema pode inserir logs de auditoria"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas para activity_logs
CREATE POLICY "Admins podem visualizar logs de atividade"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Sistema pode inserir logs de atividade"
  ON activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas para error_logs
CREATE POLICY "Admins podem visualizar logs de erros"
  ON error_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Sistema pode inserir logs de erros"
  ON error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins podem atualizar logs de erros"
  ON error_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

-- Políticas para usage_metrics
CREATE POLICY "Admins podem visualizar métricas de uso"
  ON usage_metrics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Sistema pode inserir métricas de uso"
  ON usage_metrics FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas para performance_metrics
CREATE POLICY "Admins podem visualizar métricas de performance"
  ON performance_metrics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Sistema pode inserir métricas de performance"
  ON performance_metrics FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas para monitoring_settings
CREATE POLICY "Admins podem visualizar configurações de monitoramento"
  ON monitoring_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins podem atualizar configurações de monitoramento"
  ON monitoring_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role = 'admin'
    )
  );

-- ===========================================
-- 8. FUNÇÃO PARA LIMPEZA AUTOMÁTICA DE LOGS
-- ===========================================
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  retention_days integer;
BEGIN
  -- Obter período de retenção das configurações
  SELECT (setting_value::text)::integer 
  INTO retention_days
  FROM monitoring_settings 
  WHERE setting_key = 'log_retention_days';

  -- Se não encontrar, usar 90 dias como padrão
  IF retention_days IS NULL THEN
    retention_days := 90;
  END IF;

  -- Deletar logs de auditoria antigos
  DELETE FROM audit_logs 
  WHERE created_at < now() - (retention_days || ' days')::interval;

  -- Deletar logs de atividade antigos
  DELETE FROM activity_logs 
  WHERE created_at < now() - (retention_days || ' days')::interval;

  -- Deletar logs de erros resolvidos antigos
  DELETE FROM error_logs 
  WHERE resolved = true 
  AND resolved_at < now() - (retention_days || ' days')::interval;

  -- Deletar métricas antigas
  DELETE FROM usage_metrics 
  WHERE recorded_at < now() - (retention_days || ' days')::interval;

  DELETE FROM performance_metrics 
  WHERE recorded_at < now() - (retention_days || ' days')::interval;
END;
$$;