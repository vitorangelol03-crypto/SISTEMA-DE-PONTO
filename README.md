# Sistema de Ponto

Sistema completo de controle de ponto e gestão de funcionários desenvolvido para uso interno empresarial. Permite registro de presença, controle de horários, bonificações, relatórios financeiros e gerenciamento de erros operacionais.

## Funcionalidades Principais

### Controle de Presença
- Registro diário de presença e faltas
- Registro de horários de saída
- Marcação em massa de presença/falta
- Busca por nome ou CPF
- Visualização de estatísticas diárias (presentes, faltas, não marcados)

### Gestão de Funcionários
- Cadastro completo de funcionários (nome, CPF, cargo, salário)
- Edição e exclusão de funcionários
- Listagem com busca e filtros
- Controle de usuários do sistema

### Bonificações
- Aplicação de bonificações para funcionários presentes
- Remoção individual de bonificações com observação obrigatória
- Remoção em massa de bonificações com justificativa
- Histórico completo de remoções com auditoria
- Exportação do histórico para Excel
- Cálculo automático no relatório financeiro

### Relatórios Financeiros
- Relatório mensal detalhado por funcionário
- Cálculo de:
  - Dias trabalhados
  - Dias de falta
  - Valor por dia
  - Bonificações recebidas
  - Total a receber
- Histórico de remoções de bonificação com:
  - Filtros por período e funcionário
  - Detalhamento completo de cada remoção
  - Observações obrigatórias para auditoria
  - Identificação do responsável pela remoção
- Exportação para Excel e PDF
- Visualização gráfica de presença vs faltas

### Registro de Erros
- Registro de problemas operacionais
- Categorização por tipo (falha de equipamento, erro humano, etc.)
- Controle de status (pendente, resolvido, em andamento)
- Priorização (baixa, média, alta, crítica)

### Autenticação
- Sistema de login seguro
- Controle de acesso por usuário
- Gestão de sessões

## Tecnologias Utilizadas

- **React 18** - Framework JavaScript para interface
- **TypeScript** - Tipagem estática
- **Vite** - Build tool e dev server
- **Tailwind CSS** - Framework CSS utilitário
- **Supabase** - Backend-as-a-Service (banco de dados PostgreSQL)
- **date-fns** - Manipulação de datas
- **Lucide React** - Ícones
- **Recharts** - Gráficos e visualizações
- **jsPDF** - Geração de PDFs
- **XLSX** - Exportação para Excel
- **React Hot Toast** - Notificações

## Estrutura do Projeto

```
src/
├── components/           # Componentes React
│   ├── attendance/      # Controle de ponto
│   ├── auth/           # Autenticação
│   ├── common/         # Componentes compartilhados
│   ├── employees/      # Gestão de funcionários
│   ├── errors/         # Registro de erros
│   ├── financial/      # Relatórios financeiros
│   ├── reports/        # Relatórios gerais
│   ├── settings/       # Configurações
│   └── users/          # Gestão de usuários
├── hooks/              # Custom React hooks
├── lib/                # Configurações de bibliotecas
├── services/           # Serviços de banco de dados
├── utils/              # Utilitários e helpers
├── App.tsx            # Componente principal
└── main.tsx           # Entry point
```

## Configuração

### Pré-requisitos

- Node.js 18+ instalado
- Conta Supabase configurada
- npm ou yarn

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_supabase
```

### Instalação

1. Clone o repositório
2. Instale as dependências:

```bash
npm install
```

3. Configure as variáveis de ambiente no arquivo `.env`

4. Execute o projeto em modo de desenvolvimento:

```bash
npm run dev
```

## Comandos Disponíveis

```bash
npm run dev      # Inicia servidor de desenvolvimento
npm run build    # Gera build de produção
npm run preview  # Preview do build de produção
npm run lint     # Executa linter
```

## Estrutura do Banco de Dados

O sistema utiliza as seguintes tabelas no Supabase:

### Tabelas Principais
- **users** - Usuários do sistema
- **employees** - Funcionários cadastrados
- **attendance** - Registro de presença
- **bonuses** - Bonificações aplicadas
- **payments** - Pagamentos realizados
- **error_records** - Registro de problemas operacionais
- **bonus_removals** - Histórico de remoções de bonificação com observações

### Tabelas de Permissões
- **user_permissions** - Permissões granulares por usuário
- **permission_logs** - Histórico de mudanças em permissões

### Tabelas de Auditoria e Monitoramento
- **audit_logs** - Registros de auditoria de todas as ações
- **activity_logs** - Logs de atividades do sistema
- **error_logs** - Logs de erros técnicos
- **usage_metrics** - Métricas de uso do sistema
- **performance_metrics** - Métricas de performance

### Tabelas de Configuração
- **feature_versions** - Versionamento de funcionalidades
- **data_retention_settings** - Configurações de retenção de dados
- **auto_cleanup_config** - Configuração de limpeza automática
- **cleanup_logs** - Histórico de limpezas realizadas
- **monitoring_settings** - Configurações de monitoramento

## Segurança

- Sistema de autenticação integrado com Supabase
- Row Level Security (RLS) habilitado em todas as tabelas
- Validação de dados no frontend e backend
- Senhas armazenadas de forma segura
- Acesso restrito por usuário autenticado

## Notas Importantes

- Sistema desenvolvido para uso interno empresarial
- Acesso restrito ao supervisor da empresa
- Timezone configurado para Brasil (UTC-3)
- Todos os valores monetários em Real (R$)

## Suporte

Sistema desenvolvido para uso interno. Para suporte, entre em contato com o administrador do sistema.

## Funcionalidades de Remoção de Bonificação

### Como Funciona
O sistema permite a remoção de bonificações já aplicadas, mantendo registro completo para auditoria.

### Remoção Individual
1. Acesse a aba "Ponto"
2. Selecione a data desejada
3. Localize o funcionário com bonificação aplicada
4. Clique no botão de remover bonificação (ícone de lixeira ao lado do valor)
5. Digite uma observação obrigatória (10-500 caracteres) explicando o motivo
6. Confirme a remoção

### Remoção em Massa
1. Na aba "Ponto", com bonificações aplicadas na data
2. Clique em "Remover Todas Bonificações"
3. Digite uma observação obrigatória explicando o motivo da remoção em massa
4. Confirme a operação

### Visualização do Histórico
1. Acesse a aba "Financeiro"
2. Clique no botão "Histórico de Remoções"
3. Use os filtros para:
   - Selecionar período (data inicial e final)
   - Filtrar por funcionário específico
   - Ver todas as remoções ou de um funcionário
4. Exporte o histórico para Excel clicando em "Exportar Excel"

### Informações Registradas
Cada remoção de bonificação registra:
- Data da bonificação removida
- Funcionário afetado
- Valor da bonificação removida
- Observação obrigatória (motivo)
- Usuário responsável pela remoção
- Data e hora exata da remoção

### Permissões Necessárias
- **Remover bonificação individual**: `financial.removeBonus`
- **Remover bonificação em massa**: `financial.removeBonusBulk`
- **Visualizar histórico**: `financial.viewHistory`

## Versão

2.7.0
