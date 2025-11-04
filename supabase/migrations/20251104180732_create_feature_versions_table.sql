/*
  # Criar tabela de versões de funcionalidades

  1. Nova Tabela
    - `feature_versions`
      - `id` (uuid, primary key) - Identificador único
      - `feature_key` (text, unique) - Chave única da funcionalidade (ex: 'attendance', 'employees')
      - `version` (text) - Versão da funcionalidade (ex: '1.0.0', '1.1.0')
      - `release_date` (timestamptz) - Data de lançamento da funcionalidade
      - `description` (text) - Descrição das mudanças/melhorias
      - `is_new` (boolean) - Flag calculada automaticamente (novos últimos 30 dias)
      - `created_at` (timestamptz) - Data de criação do registro
      - `updated_at` (timestamptz) - Data de atualização do registro

  2. Segurança
    - Habilitar RLS na tabela `feature_versions`
    - Permitir leitura para todos os usuários autenticados
    - Apenas admins (role admin) podem inserir/atualizar

  3. Índices
    - Criar índice em `feature_key` para buscas rápidas
    - Criar índice em `release_date` para ordenação

  4. Dados Iniciais
    - Inserir versões atuais de todas as funcionalidades do sistema
    - Marcar todas como lançadas há mais de 30 dias (não são novas)
*/

CREATE TABLE IF NOT EXISTS feature_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  release_date timestamptz NOT NULL DEFAULT now(),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE feature_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ler versões de funcionalidades"
  ON feature_versions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Apenas admins podem inserir versões"
  ON feature_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id::text = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Apenas admins podem atualizar versões"
  ON feature_versions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id::text = auth.uid()::text
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id::text = auth.uid()::text
      AND users.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_feature_versions_key ON feature_versions(feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_versions_release_date ON feature_versions(release_date);

INSERT INTO feature_versions (feature_key, version, release_date, description)
VALUES
  ('attendance', '1.0.0', now() - interval '60 days', 'Sistema de controle de ponto com marcação de entrada e saída'),
  ('employees', '1.0.0', now() - interval '60 days', 'Gerenciamento completo de funcionários com importação de planilhas'),
  ('reports', '1.0.0', now() - interval '60 days', 'Geração de relatórios com exportação em Excel e PDF'),
  ('financial', '1.0.0', now() - interval '60 days', 'Gestão financeira com controle de pagamentos e bonificações'),
  ('c6payment', '1.0.0', now() - interval '60 days', 'Geração de arquivos para pagamento via Banco C6'),
  ('errors', '1.0.0', now() - interval '60 days', 'Registro e acompanhamento de erros do sistema'),
  ('settings', '1.0.0', now() - interval '60 days', 'Configurações gerais do sistema'),
  ('users', '1.0.0', now() - interval '60 days', 'Gerenciamento de usuários e permissões'),
  ('datamanagement', '1.0.0', now() - interval '60 days', 'Gerenciamento e limpeza de dados do sistema')
ON CONFLICT (feature_key) DO NOTHING;