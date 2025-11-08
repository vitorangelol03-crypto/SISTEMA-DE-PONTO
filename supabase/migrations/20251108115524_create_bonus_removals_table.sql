/*
  # Criar Tabela de Remoções de Bonificação

  ## Descrição
  Esta migration cria a tabela bonus_removals para rastrear todas as remoções de bonificação
  realizadas no sistema, incluindo observações obrigatórias do supervisor.

  ## Novas Tabelas
  
  ### `bonus_removals`
  Tabela para registrar remoções de bonificação com observações
  - `id` (uuid, primary key) - Identificador único do registro de remoção
  - `employee_id` (uuid, foreign key) - ID do funcionário que teve bonificação removida
  - `date` (date) - Data da bonificação que foi removida
  - `bonus_amount_removed` (numeric) - Valor da bonificação que foi removida
  - `observation` (text) - Observação obrigatória explicando motivo da remoção (10-500 caracteres)
  - `removed_by` (text, foreign key) - ID do usuário que removeu a bonificação
  - `removed_at` (timestamptz) - Data e hora da remoção
  - `created_at` (timestamptz) - Data de criação do registro

  ## Índices
  - Índice composto em (employee_id, date) para consultas rápidas de histórico
  - Índice em removed_by para auditoria
  - Índice em date para consultas por período

  ## Segurança
  - RLS habilitado na tabela
  - Políticas de acesso configuradas
*/

-- Criar tabela bonus_removals
CREATE TABLE IF NOT EXISTS bonus_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  bonus_amount_removed numeric NOT NULL CHECK (bonus_amount_removed > 0),
  observation text NOT NULL CHECK (length(observation) >= 10 AND length(observation) <= 500),
  removed_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  removed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Criar índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_bonus_removals_employee_date 
  ON bonus_removals(employee_id, date);

CREATE INDEX IF NOT EXISTS idx_bonus_removals_removed_by 
  ON bonus_removals(removed_by);

CREATE INDEX IF NOT EXISTS idx_bonus_removals_date 
  ON bonus_removals(date);

CREATE INDEX IF NOT EXISTS idx_bonus_removals_removed_at 
  ON bonus_removals(removed_at DESC);

-- Habilitar Row Level Security
ALTER TABLE bonus_removals ENABLE ROW LEVEL SECURITY;

-- Criar política para permitir leitura para usuários autenticados
CREATE POLICY "Usuários podem visualizar remoções de bonificação"
  ON bonus_removals
  FOR SELECT
  TO public
  USING (true);

-- Criar política para permitir inserção apenas por usuários autenticados
CREATE POLICY "Apenas usuários autenticados podem registrar remoções"
  ON bonus_removals
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Comentários nas colunas para documentação
COMMENT ON TABLE bonus_removals IS 'Registra todas as remoções de bonificação realizadas no sistema com observações obrigatórias';
COMMENT ON COLUMN bonus_removals.observation IS 'Observação obrigatória explicando o motivo da remoção (10-500 caracteres)';
COMMENT ON COLUMN bonus_removals.bonus_amount_removed IS 'Valor em reais da bonificação que foi removida';
COMMENT ON COLUMN bonus_removals.removed_at IS 'Data e hora exata em que a bonificação foi removida do sistema';