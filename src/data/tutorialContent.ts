import { Tutorial } from '../types/tutorial';

export const tutorialsContent: Tutorial[] = [
  {
    id: 'attendance-overview',
    category: 'attendance',
    title: 'Controle de Ponto',
    description: 'Aprenda a usar o sistema de controle de ponto para marcar presença e gerenciar horários',
    icon: 'Clock',
    requiredPermission: 'attendance.view',
    steps: [
      {
        title: 'Acessar a aba de Ponto',
        description: 'Clique na aba "Ponto" no menu de navegação superior para acessar o sistema de controle de presença.',
      },
      {
        title: 'Visualizar funcionários',
        description: 'A lista mostra todos os funcionários cadastrados. Você verá o nome, CPF e status de presença do dia.',
      },
      {
        title: 'Marcar presença',
        description: 'Clique no botão verde "Presente" ao lado do nome do funcionário para registrar sua entrada. O horário será registrado automaticamente.',
        tips: ['O horário registrado é baseado no fuso horário de Brasília', 'Você pode marcar múltiplos funcionários de uma vez usando a seleção em massa']
      },
      {
        title: 'Registrar saída',
        description: 'Para funcionários já marcados como presentes, você pode editar o horário de saída clicando no campo de hora e selecionando o horário desejado.',
      },
      {
        title: 'Buscar histórico',
        description: 'Use o campo de busca no topo para encontrar funcionários específicos por nome ou CPF. Use a seleção de data para consultar presenças de dias anteriores.',
      }
    ],
    useCases: [
      {
        title: 'Registro de presença matinal',
        description: 'Todo dia ao iniciar o expediente, abra a aba de Ponto e marque a presença dos funcionários que chegaram.',
        example: 'Exemplo: João chegou às 08:00. Clique em "Presente" ao lado do nome dele. O sistema registrará automaticamente 08:00 como horário de entrada.'
      },
      {
        title: 'Correção de horário',
        description: 'Se um funcionário foi marcado no horário errado, você pode editar o horário de saída para corrigir.',
        example: 'Exemplo: Maria foi marcada como presente às 08:00, mas na verdade chegou às 08:15. Edite o horário de entrada para refletir o horário correto.'
      },
      {
        title: 'Marcação em massa',
        description: 'Para marcar vários funcionários de uma vez, use as caixas de seleção e clique em "Marcar Selecionados".',
        example: 'Exemplo: Todos os funcionários da equipe A chegaram juntos. Selecione todos e clique no botão de marcação em massa.'
      }
    ],
    tips: [
      'Sempre verifique o horário exibido no topo da tela para garantir precisão',
      'Use o filtro de busca para encontrar funcionários rapidamente em listas grandes',
      'As marcações são permanentes e criam registros no histórico'
    ]
  },
  {
    id: 'attendance-bonus',
    category: 'attendance',
    title: 'Sistema de Bonificação',
    description: 'Como aplicar bonificações para funcionários presentes',
    icon: 'Gift',
    requiredPermission: 'financial.applyBonus',
    steps: [
      {
        title: 'Acessar bonificação',
        description: 'Na aba de Ponto, clique no botão "Bonificar Presentes" no canto superior direito.',
      },
      {
        title: 'Definir valor do bônus',
        description: 'Digite o valor do bônus que deseja aplicar. O sistema aceita valores decimais (ex: 50.00).',
      },
      {
        title: 'Confirmar aplicação',
        description: 'Revise o valor e clique em "Aplicar Bonificação". O bônus será aplicado automaticamente a todos os funcionários marcados como presentes no dia.',
      }
    ],
    useCases: [
      {
        title: 'Bônus de produtividade',
        description: 'Ao final de um dia produtivo, recompense a equipe presente com um bônus.',
        example: 'Exemplo: A equipe bateu a meta do dia. Aplique um bônus de R$ 50,00 para todos os presentes.'
      },
      {
        title: 'Incentivo de pontualidade',
        description: 'Bonifique funcionários que chegaram no horário ou mais cedo.',
        example: 'Exemplo: Todos chegaram antes das 08:00. Aplique um bônus de R$ 30,00 como incentivo.'
      }
    ],
    tips: [
      'O bônus é aplicado apenas aos funcionários marcados como presentes no dia',
      'O valor fica registrado no histórico financeiro do funcionário',
      'Você pode aplicar múltiplos bônus no mesmo dia se necessário'
    ]
  },
  {
    id: 'employees-management',
    category: 'employees',
    title: 'Gerenciamento de Funcionários',
    description: 'Como cadastrar, editar e gerenciar informações de funcionários',
    icon: 'Users',
    requiredPermission: 'employees.view',
    steps: [
      {
        title: 'Acessar aba de Funcionários',
        description: 'Clique na aba "Funcionários" no menu principal.',
      },
      {
        title: 'Adicionar novo funcionário',
        description: 'Clique no botão "Adicionar Funcionário" e preencha o formulário com nome, CPF e chave PIX.',
        tips: ['O CPF deve ser válido e único no sistema', 'A chave PIX é usada para pagamentos via C6 Bank']
      },
      {
        title: 'Editar informações',
        description: 'Clique no ícone de edição ao lado do funcionário para modificar suas informações.',
      },
      {
        title: 'Excluir funcionário',
        description: 'Use o botão de excluir com cuidado. A exclusão remove todos os registros relacionados ao funcionário.',
      }
    ],
    useCases: [
      {
        title: 'Cadastro de novo contratado',
        description: 'Quando um novo funcionário é contratado, cadastre-o imediatamente no sistema.',
        example: 'Exemplo: Pedro Silva foi contratado. Cadastre com CPF 123.456.789-00 e chave PIX pedro@email.com.'
      },
      {
        title: 'Atualização de dados',
        description: 'Se um funcionário trocar de chave PIX, atualize o cadastro.',
        example: 'Exemplo: Maria mudou sua chave PIX. Edite o cadastro dela e atualize a chave.'
      },
      {
        title: 'Desligamento',
        description: 'Quando um funcionário é desligado, você pode excluí-lo ou mantê-lo inativo.',
        example: 'Exemplo: João foi desligado. Considere gerar relatórios finais antes de excluir o cadastro.'
      }
    ],
    tips: [
      'Sempre valide o CPF antes de cadastrar',
      'Mantenha as chaves PIX atualizadas para evitar erros de pagamento',
      'Use a busca para encontrar funcionários rapidamente'
    ]
  },
  {
    id: 'employees-import',
    category: 'employees',
    title: 'Importação em Massa',
    description: 'Como importar múltiplos funcionários usando planilha Excel',
    icon: 'FileSpreadsheet',
    requiredPermission: 'employees.import',
    steps: [
      {
        title: 'Baixar template',
        description: 'Clique em "Importar Planilha" e depois em "Baixar Template" para obter o modelo Excel.',
      },
      {
        title: 'Preencher planilha',
        description: 'Abra o template no Excel e preencha com os dados dos funcionários seguindo o formato especificado.',
        tips: ['Coluna A: Nome completo', 'Coluna B: CPF (apenas números)', 'Coluna C: Chave PIX']
      },
      {
        title: 'Fazer upload',
        description: 'Arraste o arquivo preenchido para a área de upload ou clique para selecionar.',
      },
      {
        title: 'Validar dados',
        description: 'O sistema validará automaticamente os dados e mostrará erros se houver.',
      },
      {
        title: 'Confirmar importação',
        description: 'Revise os dados na prévia e clique em "Confirmar Importação" para adicionar os funcionários.',
      }
    ],
    useCases: [
      {
        title: 'Cadastro inicial em massa',
        description: 'Ao implementar o sistema, importe todos os funcionários existentes de uma vez.',
        example: 'Exemplo: Sua empresa tem 50 funcionários. Preencha o template com todos os dados e importe de uma vez.'
      },
      {
        title: 'Contratação em lote',
        description: 'Quando múltiplos funcionários são contratados ao mesmo tempo.',
        example: 'Exemplo: Contratação de 10 novos funcionários para um projeto. Importe todos via planilha.'
      }
    ],
    tips: [
      'Sempre use o template fornecido para evitar erros de formatação',
      'Verifique os CPFs antes de importar para evitar duplicidades',
      'O sistema não importa linhas com dados inválidos'
    ]
  },
  {
    id: 'reports-generation',
    category: 'reports',
    title: 'Geração de Relatórios',
    description: 'Como gerar e exportar relatórios de presença e pagamentos',
    icon: 'BarChart3',
    requiredPermission: 'reports.view',
    steps: [
      {
        title: 'Acessar aba de Relatórios',
        description: 'Clique na aba "Relatórios" no menu principal.',
      },
      {
        title: 'Selecionar período',
        description: 'Use os seletores de data para definir o período do relatório (data inicial e final).',
      },
      {
        title: 'Filtrar funcionário (opcional)',
        description: 'Se desejar relatório de um funcionário específico, selecione-o na lista suspensa.',
      },
      {
        title: 'Gerar relatório',
        description: 'Clique em "Gerar Relatório" para processar os dados e exibir o resultado na tela.',
      },
      {
        title: 'Exportar',
        description: 'Use os botões "Exportar Excel" ou "Exportar PDF" para salvar o relatório.',
      }
    ],
    useCases: [
      {
        title: 'Relatório mensal',
        description: 'Gere relatórios mensais para acompanhamento de presença e pagamentos.',
        example: 'Exemplo: Selecione 01/10/2024 a 31/10/2024 para gerar relatório de outubro.'
      },
      {
        title: 'Análise individual',
        description: 'Verifique o desempenho e pagamentos de um funcionário específico.',
        example: 'Exemplo: Selecione "João Silva" e período de 3 meses para análise detalhada.'
      },
      {
        title: 'Relatório para contabilidade',
        description: 'Exporte relatórios em Excel para enviar ao setor contábil.',
        example: 'Exemplo: Gere relatório do mês e exporte em Excel com todos os pagamentos.'
      }
    ],
    tips: [
      'Relatórios em PDF são ideais para impressão e apresentações',
      'Relatórios em Excel permitem análises e manipulações adicionais',
      'Use filtros de funcionário para relatórios individuais mais rápidos'
    ]
  },
  {
    id: 'financial-management',
    category: 'financial',
    title: 'Gestão Financeira',
    description: 'Como gerenciar pagamentos, taxas e bonificações',
    icon: 'DollarSign',
    requiredPermission: 'financial.view',
    steps: [
      {
        title: 'Acessar aba Financeiro',
        description: 'Clique na aba "Financeiro" no menu principal para visualizar todos os pagamentos.',
      },
      {
        title: 'Visualizar pagamentos',
        description: 'A tabela mostra todos os pagamentos com funcionário, data, dias trabalhados, valor base e bônus.',
      },
      {
        title: 'Editar taxa diária',
        description: 'Clique no ícone de edição na coluna "Taxa Diária" para alterar o valor da diária de um funcionário específico.',
      },
      {
        title: 'Editar bônus',
        description: 'Clique no ícone de edição na coluna "Bônus" para ajustar o valor de bonificação.',
      },
      {
        title: 'Limpar período',
        description: 'Use o botão "Limpar Período" com cuidado para remover pagamentos de um intervalo de datas.',
      }
    ],
    useCases: [
      {
        title: 'Ajuste de taxa individual',
        description: 'Altere a taxa diária de funcionários que têm valores diferenciados.',
        example: 'Exemplo: Pedro é líder de equipe e recebe R$ 150,00/dia. Edite sua taxa individual.'
      },
      {
        title: 'Correção de bônus',
        description: 'Corrija valores de bônus aplicados incorretamente.',
        example: 'Exemplo: Bônus de R$ 50,00 foi aplicado por engano. Edite e corrija para R$ 30,00.'
      },
      {
        title: 'Limpeza de dados',
        description: 'Remova registros de pagamento de um período para recalcular.',
        example: 'Exemplo: Houve erro nos cálculos de outubro. Limpe o período e refaça os registros.'
      }
    ],
    tips: [
      'Sempre revise valores antes de aplicar mudanças em massa',
      'Mantenha backup dos dados antes de limpar períodos',
      'Use relatórios para validar cálculos financeiros'
    ]
  },
  {
    id: 'c6payment-export',
    category: 'c6payment',
    title: 'Pagamento via C6 Bank',
    description: 'Como gerar arquivos de pagamento para o Banco C6',
    icon: 'FileSpreadsheet',
    requiredPermission: 'c6payment.view',
    steps: [
      {
        title: 'Acessar aba Pagamento C6',
        description: 'Clique na aba "Pagamento C6" no menu principal.',
      },
      {
        title: 'Selecionar período',
        description: 'Use os seletores de data para definir o período dos pagamentos a serem exportados.',
      },
      {
        title: 'Revisar lista',
        description: 'Verifique a lista de funcionários e valores antes de gerar o arquivo. Confirme que todas as chaves PIX estão corretas.',
      },
      {
        title: 'Gerar arquivo',
        description: 'Clique em "Gerar Arquivo C6" para criar o arquivo Excel formatado para importação no sistema do C6 Bank.',
      },
      {
        title: 'Fazer upload no C6',
        description: 'Acesse o internet banking do C6, vá até a área de pagamentos em lote e faça upload do arquivo gerado.',
      }
    ],
    useCases: [
      {
        title: 'Pagamento mensal',
        description: 'Ao final do mês, gere o arquivo com todos os pagamentos para processar via C6.',
        example: 'Exemplo: Dia 30 de cada mês, gere o arquivo com período de 01 a 30 e processe os pagamentos.'
      },
      {
        title: 'Pagamento semanal',
        description: 'Para pagamentos semanais, gere arquivos a cada 7 dias.',
        example: 'Exemplo: Segunda-feira, gere arquivo da semana anterior e efetue os pagamentos.'
      }
    ],
    tips: [
      'Sempre verifique as chaves PIX antes de gerar o arquivo',
      'Mantenha backup dos arquivos gerados',
      'Confira os totais antes de processar no banco',
      'O arquivo gerado segue o padrão específico do C6 Bank'
    ]
  },
  {
    id: 'errors-tracking',
    category: 'errors',
    title: 'Registro de Erros',
    description: 'Como registrar e acompanhar erros e problemas do sistema',
    icon: 'AlertTriangle',
    requiredPermission: 'errors.view',
    steps: [
      {
        title: 'Acessar aba de Erros',
        description: 'Clique na aba "Erros" no menu principal.',
      },
      {
        title: 'Registrar novo erro',
        description: 'Clique em "Registrar Erro" e preencha os campos: funcionário afetado, descrição do problema e severidade.',
      },
      {
        title: 'Acompanhar status',
        description: 'A lista mostra todos os erros registrados com status (pendente, em análise, resolvido).',
      },
      {
        title: 'Atualizar erro',
        description: 'Clique em "Editar" para atualizar o status ou adicionar observações sobre a resolução.',
      },
      {
        title: 'Visualizar estatísticas',
        description: 'Use o painel de estatísticas para ver gráficos de erros por tipo, severidade e período.',
      }
    ],
    useCases: [
      {
        title: 'Registro de inconsistência',
        description: 'Quando detectar erro nos dados de um funcionário, registre para acompanhamento.',
        example: 'Exemplo: Pagamento de João aparece duplicado. Registre o erro com severidade alta.'
      },
      {
        title: 'Problema técnico',
        description: 'Registre erros técnicos do sistema para análise futura.',
        example: 'Exemplo: Sistema não gerou relatório corretamente. Registre com detalhes para investigação.'
      }
    ],
    tips: [
      'Seja específico na descrição do erro',
      'Sempre indique o funcionário afetado quando aplicável',
      'Use a severidade adequada para priorização',
      'Atualize o status conforme resolver os problemas'
    ]
  },
  {
    id: 'settings-configuration',
    category: 'settings',
    title: 'Configurações do Sistema',
    description: 'Como ajustar configurações gerais e taxa diária padrão',
    icon: 'Settings',
    requiredPermission: 'settings.view',
    steps: [
      {
        title: 'Acessar Configurações',
        description: 'Clique na aba "Configurações" no menu principal.',
      },
      {
        title: 'Configurar taxa diária padrão',
        description: 'Altere o valor da taxa diária padrão que será aplicada a novos funcionários.',
        tips: ['Este valor é aplicado automaticamente a novos cadastros', 'Funcionários existentes mantêm suas taxas individuais']
      },
      {
        title: 'Ajustar outras configurações',
        description: 'Modifique outras preferências do sistema conforme necessário.',
      },
      {
        title: 'Salvar alterações',
        description: 'Sempre clique em "Salvar" após fazer modificações nas configurações.',
      }
    ],
    useCases: [
      {
        title: 'Atualização de valor padrão',
        description: 'Quando houver reajuste salarial geral, atualize a taxa diária padrão.',
        example: 'Exemplo: Reajuste de 10%. Aumente a taxa diária de R$ 100,00 para R$ 110,00.'
      },
      {
        title: 'Configuração inicial',
        description: 'Ao implementar o sistema, configure a taxa diária padrão da empresa.',
        example: 'Exemplo: Empresa paga R$ 120,00/dia. Configure este valor como padrão.'
      }
    ],
    tips: [
      'Alterações na taxa padrão não afetam funcionários já cadastrados',
      'Mantenha as configurações revisadas periodicamente',
      'Documente mudanças importantes de configuração'
    ]
  },
  {
    id: 'users-management',
    category: 'users',
    title: 'Gerenciamento de Usuários',
    description: 'Como criar e gerenciar usuários supervisores do sistema',
    icon: 'UserCog',
    requiredPermission: 'users.view',
    steps: [
      {
        title: 'Acessar aba de Usuários',
        description: 'Clique na aba "Usuários" no menu principal.',
      },
      {
        title: 'Criar novo supervisor',
        description: 'Clique em "Criar Supervisor", preencha nome de usuário e senha, e defina as permissões iniciais.',
      },
      {
        title: 'Gerenciar permissões',
        description: 'Clique no ícone de permissões para abrir o modal de gerenciamento detalhado de permissões do usuário.',
      },
      {
        title: 'Configurar permissões granulares',
        description: 'No modal, marque/desmarque permissões específicas para cada módulo do sistema.',
        tips: ['Permissões são organizadas por módulo', 'Cada módulo tem permissões específicas como visualizar, criar, editar, excluir']
      },
      {
        title: 'Excluir usuário',
        description: 'Use o botão de excluir com cuidado. Usuários excluídos não podem mais acessar o sistema.',
      }
    ],
    useCases: [
      {
        title: 'Criar supervisor de área',
        description: 'Crie um usuário supervisor com permissões limitadas para uma área específica.',
        example: 'Exemplo: Supervisor do setor A pode apenas marcar presença e ver relatórios, sem acesso financeiro.'
      },
      {
        title: 'Ajuste de permissões',
        description: 'Modifique permissões conforme mudanças de responsabilidade.',
        example: 'Exemplo: Supervisor foi promovido e agora precisa de acesso ao módulo financeiro.'
      },
      {
        title: 'Desligamento de supervisor',
        description: 'Remova acesso de usuários que não trabalham mais na empresa.',
        example: 'Exemplo: Supervisor saiu da empresa. Exclua seu usuário para bloquear acesso.'
      }
    ],
    tips: [
      'Sempre use senhas fortes para novos usuários',
      'Revise permissões periodicamente',
      'Não compartilhe credenciais de acesso',
      'Mantenha registro de quem tem acesso a cada módulo'
    ]
  },
  {
    id: 'datamanagement-overview',
    category: 'datamanagement',
    title: 'Gerenciamento de Dados',
    description: 'Como gerenciar, limpar e configurar retenção de dados do sistema',
    icon: 'Database',
    requiredPermission: 'datamanagement.view',
    steps: [
      {
        title: 'Acessar aba de Gerenciamento',
        description: 'Clique na aba "Gerenciamento" no menu principal.',
      },
      {
        title: 'Visualizar estatísticas',
        description: 'O painel mostra quantidade de registros em cada tabela do sistema e uso de espaço.',
      },
      {
        title: 'Configurar retenção',
        description: 'Defina políticas de retenção de dados especificando por quanto tempo cada tipo de dado deve ser mantido.',
      },
      {
        title: 'Limpeza manual',
        description: 'Use a ferramenta de limpeza manual para remover dados antigos de períodos específicos.',
        tips: ['Sempre faça backup antes de limpezas manuais', 'Dados excluídos não podem ser recuperados']
      },
      {
        title: 'Configurar limpeza automática',
        description: 'Ative e configure tarefas de limpeza automática baseadas nas políticas de retenção.',
      }
    ],
    useCases: [
      {
        title: 'Limpeza de dados antigos',
        description: 'Remova registros muito antigos que não são mais necessários.',
        example: 'Exemplo: Registros de presença de mais de 2 anos podem ser arquivados ou removidos.'
      },
      {
        title: 'Otimização de espaço',
        description: 'Libere espaço no banco de dados removendo dados desnecessários.',
        example: 'Exemplo: Sistema está ficando lento. Limpe dados antigos para melhorar performance.'
      },
      {
        title: 'Conformidade com LGPD',
        description: 'Configure retenção de dados conforme requisitos legais.',
        example: 'Exemplo: Lei exige manter dados por 5 anos. Configure retenção automática de 5 anos.'
      }
    ],
    tips: [
      'Sempre mantenha backups antes de limpezas',
      'Configure retenção baseada em requisitos legais',
      'Monitore o uso de espaço regularmente',
      'Documente políticas de retenção da empresa'
    ]
  }
];
