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
- Histórico de bonificações
- Cálculo automático no relatório financeiro

### Relatórios Financeiros
- Relatório mensal detalhado por funcionário
- Cálculo de:
  - Dias trabalhados
  - Dias de falta
  - Valor por dia
  - Bonificações recebidas
  - Total a receber
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

- **users** - Usuários do sistema
- **employees** - Funcionários cadastrados
- **attendance** - Registro de presença
- **bonuses** - Bonificações aplicadas
- **employee_bonuses** - Bonificações por funcionário
- **errors** - Registro de problemas

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

## Versão

1.0.0
