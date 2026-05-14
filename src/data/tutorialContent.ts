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
      },
      {
        title: 'Resetar marcações',
        description: 'Se uma marcação foi feita incorretamente, você pode resetar o registro individual clicando no botão "Reset" ao lado do funcionário, ou resetar todos os registros do dia usando o botão "Reset Geral".',
        tips: ['O reset remove completamente o registro de ponto', 'Use com cuidado pois a ação não pode ser desfeita', 'O funcionário voltará ao status "Não marcado"']
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
      },
      {
        title: 'Correção de erro',
        description: 'Quando marcar presença para o funcionário errado, use o botão Reset para remover a marcação e poder marcar corretamente.',
        example: 'Exemplo: Você marcou João Silva como presente, mas era João Santos. Clique em "Reset" ao lado de João Silva e depois marque João Santos corretamente.'
      },
      {
        title: 'Reset geral do dia',
        description: 'Se houve um problema generalizado nas marcações do dia, você pode resetar todos os registros de uma vez.',
        example: 'Exemplo: Sistema registrou horários incorretos para todos. Use "Reset Geral" para limpar todas as marcações e refazer.'
      }
    ],
    tips: [
      'Sempre verifique o horário exibido no topo da tela para garantir precisão',
      'Use o filtro de busca para encontrar funcionários rapidamente em listas grandes',
      'As marcações são permanentes e criam registros no histórico',
      'Use a função Reset quando marcar o funcionário errado - é mais rápido que editar',
      'O Reset Geral só aparece quando há pelo menos uma marcação no dia'
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
    id: 'attendance-bonus-removal',
    category: 'attendance',
    title: 'Remoção de Bonificações',
    description: 'Como remover bonificações individuais ou em massa com registro de auditoria',
    icon: 'Trash2',
    requiredPermission: 'financial.removeBonus',
    steps: [
      {
        title: 'Identificar bonificação aplicada',
        description: 'Na aba de Ponto, selecione a data que tem bonificação aplicada. Funcionários com bônus mostrarão o valor em verde ao lado do nome.',
      },
      {
        title: 'Remover bonificação individual',
        description: 'Clique no ícone de lixeira ao lado do valor da bonificação do funcionário. Um modal de confirmação será exibido.',
        tips: ['Apenas funcionários com bonificação aplicada terão o botão de remover', 'O botão aparece em vermelho para chamar atenção']
      },
      {
        title: 'Digite observação obrigatória',
        description: 'No modal, digite uma observação explicando o motivo da remoção. A observação deve ter entre 10 e 500 caracteres.',
        tips: ['Seja específico sobre o motivo', 'A observação ficará registrada permanentemente para auditoria', 'Exemplos: "Bonificação aplicada por engano", "Funcionário não cumpriu meta"']
      },
      {
        title: 'Confirmar remoção',
        description: 'Revise o valor que será removido e clique em "Confirmar Remoção". O bônus será removido e o pagamento recalculado automaticamente.',
      },
      {
        title: 'Remoção em massa',
        description: 'Para remover todas as bonificações do dia de uma vez, clique em "Remover Todas Bonificações" no card de informações do bônus.',
        tips: ['Esta opção aparece apenas se houver bonificações aplicadas no dia', 'Também requer observação obrigatória', 'Use com cuidado pois afeta todos os funcionários']
      },
      {
        title: 'Verificar remoção',
        description: 'Após a remoção, o valor do bônus desaparecerá da visualização do funcionário. O registro da remoção fica no histórico.',
      }
    ],
    useCases: [
      {
        title: 'Correção de erro',
        description: 'Quando um bônus foi aplicado incorretamente ou para o funcionário errado.',
        example: 'Exemplo: Bônus de R$ 50,00 foi aplicado para João, mas deveria ser para José. Remova de João com observação "Aplicado para funcionário errado" e aplique para José.'
      },
      {
        title: 'Não cumprimento de meta',
        description: 'Se descobrir que um funcionário não cumpriu os requisitos para o bônus.',
        example: 'Exemplo: Pedro recebeu bônus de produtividade, mas análise posterior mostrou que não bateu a meta. Remova com observação "Meta não atingida conforme auditoria".'
      },
      {
        title: 'Ajuste de valores',
        description: 'Quando o valor do bônus está incorreto e precisa ser corrigido.',
        example: 'Exemplo: Bônus de R$ 100,00 foi aplicado, mas o correto seria R$ 50,00. Remova com observação "Valor incorreto - será reaplicado com valor correto".'
      },
      {
        title: 'Cancelamento geral',
        description: 'Quando todos os bônus do dia precisam ser cancelados.',
        example: 'Exemplo: Bônus foi aplicado no dia errado. Use remoção em massa com observação "Aplicado na data incorreta - será reaplicado na data correta".'
      },
      {
        title: 'Mudança de política',
        description: 'Quando houver mudança na política de bonificação que afeta bônus já aplicados.',
        example: 'Exemplo: Nova diretriz cancela bônus para determinada situação. Remova com observação "Cancelado conforme nova política empresarial de 15/11/2024".'
      }
    ],
    tips: [
      'SEMPRE forneça uma observação clara e detalhada do motivo da remoção',
      'A observação é permanente e será vista em auditorias - seja profissional',
      'Verifique duas vezes antes de confirmar a remoção',
      'Para remoções em massa, certifique-se que realmente quer remover de todos',
      'O histórico de remoções fica disponível na aba Financeiro > Histórico de Remoções',
      'Remoções não podem ser desfeitas - se precisar reaplicar, use a função de bonificação novamente',
      'Seu ID de usuário fica registrado junto com a remoção para rastreabilidade'
    ]
  },
  {
    id: 'financial-bonus-history',
    category: 'financial',
    title: 'Histórico de Remoções de Bonificação',
    description: 'Como visualizar e exportar o histórico completo de remoções de bonificação',
    icon: 'History',
    requiredPermission: 'financial.viewHistory',
    steps: [
      {
        title: 'Acessar aba Financeiro',
        description: 'Clique na aba "Financeiro" no menu principal.',
      },
      {
        title: 'Acessar histórico de remoções',
        description: 'Clique no botão "Histórico de Remoções" que fica no topo da página, ao lado do botão "Pagamentos".',
      },
      {
        title: 'Visualizar estatísticas',
        description: 'No topo da página de histórico, você verá cards com estatísticas: total de remoções, valor total removido e funcionários afetados.',
      },
      {
        title: 'Filtrar por período',
        description: 'Use os campos de "Data Inicial" e "Data Final" para filtrar remoções de um período específico.',
        tips: ['Por padrão, mostra apenas o dia atual', 'Ajuste as datas para ver histórico mais amplo']
      },
      {
        title: 'Filtrar por funcionário',
        description: 'Use o dropdown "Funcionário" para ver apenas remoções de um funcionário específico.',
      },
      {
        title: 'Analisar detalhes',
        description: 'A tabela mostra todas as informações: data da bonificação, funcionário, valor removido, observação, quem removeu e quando.',
      },
      {
        title: 'Exportar para Excel',
        description: 'Clique no botão "Exportar Excel" no canto superior direito para baixar o histórico filtrado em formato Excel.',
        tips: ['O arquivo inclui todas as colunas visíveis na tela', 'Nome do arquivo inclui o período filtrado para fácil organização']
      }
    ],
    useCases: [
      {
        title: 'Auditoria mensal',
        description: 'Revise todas as remoções de bonificação feitas durante o mês para auditoria.',
        example: 'Exemplo: No final do mês, filtre por período de 01 a 30 e exporte para Excel. Analise os motivos e verifique conformidade.'
      },
      {
        title: 'Análise de funcionário específico',
        description: 'Investigue remoções de bonificação de um funcionário particular.',
        example: 'Exemplo: RH precisa entender por que Pedro teve 3 bonificações removidas. Filtre por "Pedro Silva" e analise as observações.'
      },
      {
        title: 'Relatório para gestão',
        description: 'Gere relatórios de remoções para apresentar à gestão.',
        example: 'Exemplo: Gestor solicitou relatório de remoções do trimestre. Filtre janeiro a março e exporte para incluir na apresentação.'
      },
      {
        title: 'Investigação de inconsistência',
        description: 'Quando houver discrepância nos pagamentos, use o histórico para rastrear remoções.',
        example: 'Exemplo: Funcionário questiona pagamento menor. Consulte histórico para verificar se houve remoção de bônus e o motivo.'
      },
      {
        title: 'Controle de qualidade',
        description: 'Monitore padrões de remoção para identificar problemas sistemáticos.',
        example: 'Exemplo: Muitas remoções por "engano" podem indicar necessidade de treinamento ou melhoria no processo.'
      }
    ],
    tips: [
      'Use o histórico regularmente para manter controle de qualidade',
      'Exporte e arquive relatórios mensais para registros permanentes',
      'Preste atenção em padrões: muitas remoções podem indicar problemas no processo',
      'As observações são a chave para entender o motivo - leia com atenção',
      'Verifique se as remoções estão sendo justificadas adequadamente',
      'Use filtros combinados (período + funcionário) para análises específicas',
      'O histórico é imutável - não pode ser editado ou excluído, garantindo auditoria confiável'
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
  },
  {
    id: 'company-multi-tenant',
    category: 'datamanagement',
    title: 'Alternar entre Empresas (Multi-Empresa)',
    description: 'Como o admin master escolhe a empresa após login e troca de empresa pelo header',
    icon: 'Building2',
    requiredPermission: 'datamanagement.view',
    steps: [
      {
        title: 'Entrar como admin master',
        description: 'Faça login normalmente com seu usuário admin master. Diferente de supervisores, você não fica preso em uma única empresa.',
        tips: ['Apenas usuários com perfil admin master veem o seletor de empresas', 'Supervisores entram já dentro da empresa em que estão vinculados']
      },
      {
        title: 'Escolher empresa no seletor pós-login',
        description: 'Logo após o login, o CompanySelector exibe os cards das empresas cadastradas (ex: Caratinga, Ponte Nova). Clique no card da empresa em que deseja operar.',
        tips: ['A escolha define o tenant ativo para todas as queries da sessão', 'O nome da empresa selecionada aparece destacado no header']
      },
      {
        title: 'Conferir empresa ativa no header',
        description: 'O CompanySwitcher fica no topo da página, sempre visível. Mostra o nome da empresa atual e um ícone de troca rápida.',
      },
      {
        title: 'Trocar de empresa sem deslogar',
        description: 'Clique no CompanySwitcher do header e escolha a outra empresa. O sistema recarrega os dados do novo tenant sem precisar refazer login.',
        tips: ['A troca preserva sua sessão JWT', 'Funcionarios, ponto, pagamentos e erros são todos isolados por empresa']
      },
      {
        title: 'Validar isolamento de dados',
        description: 'Após trocar, todos os indicadores (lista de funcionários, marcações, financeiro) refletem apenas a empresa selecionada. Nenhum dado vaza entre tenants.',
      }
    ],
    useCases: [
      {
        title: 'Rodada matinal nas duas filiais',
        description: 'Admin master gerencia ponto nas duas cidades sem precisar de dois usuários distintos.',
        example: 'Exemplo: Às 08:00 abra Caratinga e marque presença. Às 08:30 troque para Ponte Nova pelo header e faça a mesma rotina.'
      },
      {
        title: 'Fechamento financeiro por empresa',
        description: 'Cada empresa tem seu próprio período de pagamento, taxa e bonificações. Alterne para fechar cada uma.',
        example: 'Exemplo: Termine o C6 de Caratinga, troque para Ponte Nova e gere o C6 dessa unidade.'
      },
      {
        title: 'Comparar erros entre filiais',
        description: 'Use o CompanySwitcher para auditar erros de triagem em ambas as unidades no mesmo dia.',
        example: 'Exemplo: Confira erros de carga em Caratinga, alterne para Ponte Nova e verifique se o mesmo padrão se repete.'
      },
      {
        title: 'Onboarding de nova empresa',
        description: 'Após criar a empresa nova no banco, ela aparece automaticamente no seletor pós-login.',
        example: 'Exemplo: Ponte Nova foi cadastrada. No próximo login o admin master já vê o card e pode operar a unidade.'
      }
    ],
    tips: [
      'Mantenha a empresa correta sempre visível no header antes de qualquer ação crítica',
      'Em caso de dúvida sobre o tenant ativo, troque e volte para forçar refresh',
      'Supervisores não veem o CompanySwitcher — segurança garantida por permissões',
      'Cada empresa tem domínio, raio de geolocalização e schedule próprios'
    ]
  },
  {
    id: 'employee-clock-app',
    category: 'attendance',
    title: 'Marcação de Ponto pelo Celular (App do Funcionário)',
    description: 'Como o funcionário usa a URL pública /clock para registrar entrada e saída',
    icon: 'Smartphone',
    requiredPermission: 'attendance.view',
    steps: [
      {
        title: 'Acessar a URL pública',
        description: 'No navegador do celular, abra o link /clock divulgado pela empresa. Não é necessário login — é uma tela pública por empresa.',
        tips: ['Salve o link como atalho na tela inicial do celular para acesso rápido', 'A URL é a mesma para todos os funcionários da unidade']
      },
      {
        title: 'Informar CPF',
        description: 'Digite o CPF cadastrado pela empresa. O sistema verifica se o funcionário existe e está ativo antes de avançar.',
      },
      {
        title: 'Digitar PIN pessoal',
        description: 'Informe o PIN de 4 dígitos. O PIN é entregue pelo admin no momento do cadastro e pode ser resetado pela aba Funcionários.',
        tips: ['Nunca compartilhe o PIN com colegas', 'Se esquecer, peça reset ao supervisor']
      },
      {
        title: 'Tirar foto facial (se ativada)',
        description: 'Se a empresa exige reconhecimento facial, a câmera abre automaticamente. Posicione o rosto no quadro e aguarde a validação.',
        tips: ['Boa iluminação melhora a precisão', 'Tire o boné ou óculos escuros para o cadastro inicial']
      },
      {
        title: 'Liberar geolocalização',
        description: 'O navegador pede permissão de localização. O sistema valida se o funcionário está dentro do raio configurado para a empresa antes de aceitar o ponto.',
        tips: ['Negar a localização bloqueia o ponto', 'Em ambientes fechados, espere uns segundos para o GPS estabilizar']
      },
      {
        title: 'Confirmar entrada ou saída',
        description: 'O botão muda conforme o status: "Marcar entrada" no início e "Marcar saída" depois. Toque e aguarde a mensagem de sucesso.',
      }
    ],
    useCases: [
      {
        title: 'Entrada no início do expediente',
        description: 'O funcionário marca o próprio ponto ao chegar na unidade, sem depender do supervisor.',
        example: 'Exemplo: Carlos chega às 07:55 em Caratinga, abre /clock no celular, digita CPF + PIN, libera GPS e marca entrada.'
      },
      {
        title: 'Saída ao final do turno',
        description: 'Mesma URL, mesmo fluxo. O botão já entende que é saída quando há ponto aberto.',
        example: 'Exemplo: Às 17:02 o funcionário toca em "Marcar saída", o sistema fecha o registro e mostra horas trabalhadas.'
      },
      {
        title: 'Trabalho em rota com checkpoint',
        description: 'Funcionários de logística marcam ponto direto do pátio da filial via celular, sem precisar voltar à sala da supervisão.',
        example: 'Exemplo: Motorista chega no pátio de Ponte Nova, abre /clock e marca entrada antes de pegar o caminhão.'
      },
      {
        title: 'Substituir folha de ponto física',
        description: 'A empresa elimina assinatura manual usando a URL pública como ponto oficial.',
        example: 'Exemplo: Toda equipe usa /clock no celular pessoal — o supervisor só audita pelo painel.'
      }
    ],
    tips: [
      'A URL é pública mas o acesso individual depende de CPF + PIN — guarde os dois com cuidado',
      'Se o ponto travar, verifique GPS, conexão e horário do celular',
      'Foto facial é validada por similaridade — repita o cadastro se a aparência mudou muito',
      'Em caso de falha de geo, contate o supervisor para registro manual',
      'O ponto pelo app gera o mesmo registro do ponto feito pelo painel admin'
    ]
  },
  {
    id: 'employee-errors-app',
    category: 'errors',
    title: 'Consulta de Erros pelo Funcionário (/erros)',
    description: 'Como o funcionário usa a URL pública /erros para ver seus erros individuais e de triagem',
    icon: 'AlertCircle',
    requiredPermission: 'errors.view',
    steps: [
      {
        title: 'Abrir a URL /erros',
        description: 'No celular, acesse o link /erros divulgado pela empresa. É uma tela pública, sem necessidade de login completo.',
      },
      {
        title: 'Identificar com CPF',
        description: 'Digite o mesmo CPF usado para marcar ponto. O sistema confirma se você está ativo na empresa.',
      },
      {
        title: 'Confirmar com PIN',
        description: 'Informe o PIN pessoal. As mesmas credenciais do /clock valem aqui.',
        tips: ['Se o PIN não funciona em /erros, também não funciona em /clock — peça reset', 'PIN errado três vezes força aguardar antes da próxima tentativa']
      },
      {
        title: 'Escolher período de consulta',
        description: 'Selecione semana, quinzena ou mês. A lista carrega apenas erros do intervalo escolhido para evitar excesso de dados.',
      },
      {
        title: 'Ver erros individuais',
        description: 'Aparecem os erros lançados diretamente para você: data, descrição, valor e tipo. Cada linha mostra o impacto financeiro.',
      },
      {
        title: 'Ver erros de triagem',
        description: 'Em outra seção, aparecem os erros de triagem distribuídos ao seu nome — o sistema mostra a fatia que sobrou na sua escala.',
        tips: ['Erros de triagem são divididos pelos funcionários do grupo no dia', 'O valor por pessoa é proporcional à participação na triagem']
      }
    ],
    useCases: [
      {
        title: 'Conferência pré-pagamento',
        description: 'Antes do dia do pagamento, o funcionário entra em /erros para conferir descontos já lançados.',
        example: 'Exemplo: Sexta antes do C6, abre /erros e vê R$ 25,00 em triagem na quarta. Pode questionar o supervisor antes do fechamento.'
      },
      {
        title: 'Contestação rápida',
        description: 'Funcionário identifica um erro lançado por engano e leva para o supervisor com data e descrição em mãos.',
        example: 'Exemplo: Aparece erro de carga em dia de folga. Vai até a supervisão com print do /erros e pede revisão.'
      },
      {
        title: 'Acompanhamento mensal',
        description: 'O time usa /erros para entender padrões e melhorar performance no mês seguinte.',
        example: 'Exemplo: Conferente vê 4 erros no mês, todos do mesmo tipo, e pede treinamento adicional.'
      },
      {
        title: 'Auditoria pessoal',
        description: 'Funcionário guarda histórico próprio dos erros para arquivamento ou reuniões de avaliação.',
        example: 'Exemplo: Antes da reunião de feedback trimestral, baixa print das telas de /erros nos três meses.'
      }
    ],
    tips: [
      'O /erros só mostra erros do funcionário logado — ele não vê erros de colegas',
      'Se a lista vier vazia, confira o período selecionado',
      'Erros editados ou apagados pelo supervisor desaparecem da consulta',
      'O total exibido no rodapé já considera erros individuais + fatia de triagem',
      'Senha (PIN) é a mesma do app de ponto — mantenha sigilo'
    ]
  },
  {
    id: 'geolocation-clockin',
    category: 'attendance',
    title: 'Geolocalização no Ponto',
    description: 'Como o sistema bloqueia marcações fora do raio da empresa e como o admin configura',
    icon: 'MapPin',
    requiredPermission: 'attendance.mark',
    steps: [
      {
        title: 'Entender o raio da empresa',
        description: 'Cada empresa tem latitude, longitude e raio (em metros) configurados. Se o funcionário está fora dessa área, o ponto é recusado.',
        tips: ['O raio padrão sugerido é 150-300 metros, suficiente para cobrir pátio + entrada', 'Raio muito amplo facilita fraude; raio muito pequeno frustra funcionários']
      },
      {
        title: 'Permitir GPS no celular',
        description: 'Quando o funcionário acessa /clock, o navegador pede permissão de geolocalização. Sem permissão, o sistema não consegue calcular distância.',
      },
      {
        title: 'Validação automática no clock-in',
        description: 'Ao tocar em "Marcar entrada", o sistema mede a distância entre o GPS do celular e o ponto cadastrado da empresa. Se for maior que o raio, retorna erro "Fora da área".',
      },
      {
        title: 'Registro de coordenadas para auditoria',
        description: 'Cada marcação bem-sucedida grava as coordenadas do funcionário. O admin pode revisar pontos suspeitos pela aba de Ponto.',
        tips: ['Coordenadas ficam armazenadas com o registro e não podem ser editadas pelo funcionário', 'Padrão repetido fora do raio indica tentativa de fraude']
      },
      {
        title: 'Configurar lat/lng/raio (admin)',
        description: 'Na aba Admin > Configurações da Empresa, edite latitude, longitude e raio. Use o Google Maps para pegar as coordenadas exatas da entrada da filial.',
      },
      {
        title: 'Testar com funcionário real',
        description: 'Após salvar, peça a um funcionário no local para marcar ponto. Se funcionou, ajuste só se houver reclamação de borda.',
      }
    ],
    useCases: [
      {
        title: 'Bloqueio de ponto em casa',
        description: 'Funcionário tenta marcar entrada deitado na cama. O sistema retorna "Você está a 8 km do local de trabalho — ponto recusado".',
        example: 'Exemplo: João tenta abrir /clock às 06:30 de casa em Caratinga. Sistema bloqueia porque a casa está a 6 km da filial.'
      },
      {
        title: 'Ajuste de raio para filial nova',
        description: 'Ao abrir Ponte Nova, o admin marca o pátio no mapa, define raio de 200m e habilita a empresa.',
        example: 'Exemplo: Lat -20.4127, Lng -42.8723, raio 200m. Pessoal do pátio marca sem problema; quem está na cidade não consegue.'
      },
      {
        title: 'Auditoria de fraude',
        description: 'Admin filtra marcações com coordenadas distantes do centro para investigar.',
        example: 'Exemplo: Carlos marcou três vezes na semana com coordenada idêntica a 50m do raio limite. Pode indicar GPS falso — investigar.'
      },
      {
        title: 'Equipe externa autorizada',
        description: 'Para motoristas que entram direto na rota, o admin amplia o raio ou cria exceção pontual no horário.',
        example: 'Exemplo: Motorista sai direto da garagem 5 km à frente. Admin marca manualmente o ponto após confirmar via WhatsApp.'
      }
    ],
    tips: [
      'Use Google Maps em Satélite para pegar coordenadas precisas da entrada da filial',
      'Comece com raio 200m e ajuste após uma semana de feedback',
      'GPS de celulares antigos oscila — não defina raio menor que 100m',
      'Sempre registre quando o sistema bloqueou ponto legítimo — pode indicar ajuste necessário',
      'Coordenadas suspeitas + mesma rede WiFi de outro funcionário indicam compartilhamento de PIN'
    ]
  },
  {
    id: 'face-recognition',
    category: 'attendance',
    title: 'Reconhecimento Facial',
    description: 'Cadastro inicial, validação no clock-in e reset facial pelo admin',
    icon: 'Camera',
    requiredPermission: 'attendance.mark',
    steps: [
      {
        title: 'Ativar reconhecimento facial na empresa',
        description: 'Na aba Admin > Configurações da Empresa, marque a opção "Exigir reconhecimento facial". A partir daí, novos pontos exigem foto.',
        tips: ['Você pode ativar/desativar a qualquer momento', 'Empresas com câmera ruim no celular podem deixar desligado']
      },
      {
        title: 'Cadastro inicial pelo funcionário',
        description: 'No primeiro acesso ao /clock após ativação, o sistema abre a câmera e pede para o funcionário tirar a foto base. Essa imagem fica como referência.',
        tips: ['Tire em local iluminado, rosto frontal e sem acessórios escuros', 'Sorria de leve mas mantenha rosto neutro para padronizar']
      },
      {
        title: 'Validação a cada marcação',
        description: 'Em todo clock-in seguinte, o funcionário tira uma nova foto e o sistema compara via similaridade com a base cadastrada.',
      },
      {
        title: 'Falha de validação',
        description: 'Se a similaridade ficar abaixo do limite, o sistema recusa e instrui a tentar novamente com melhor iluminação. Após várias falhas, o supervisor precisa intervir.',
        tips: ['Mudança radical (barba, óculos novos) pode falhar — peça reset facial', 'Iluminação ruim é a causa mais comum']
      },
      {
        title: 'Reset facial pelo admin',
        description: 'Na aba Funcionários, clique no ícone de câmera ao lado do nome. Confirme o reset. No próximo /clock, o funcionário refaz o cadastro base.',
        tips: ['Use quando o funcionário muda visualmente (corte, barba, óculos)', 'Não confunda com reset de PIN — são botões separados']
      }
    ],
    useCases: [
      {
        title: 'Reforço anti-fraude',
        description: 'Empresa adota facial para evitar que colegas marquem ponto uns pelos outros.',
        example: 'Exemplo: Ponte Nova ativa facial. Tentativa do colega usando PIN do João é bloqueada porque a foto não bate.'
      },
      {
        title: 'Cadastro inicial em massa',
        description: 'Após ativar a feature, todos os funcionários precisam cadastrar foto base no próximo ponto.',
        example: 'Exemplo: Supervisor avisa que segunda às 07h será obrigatório, libera 5 minutos extras para cada um cadastrar.'
      },
      {
        title: 'Reset por mudança de visual',
        description: 'Funcionário começou a usar barba grande e o sistema passa a recusar.',
        example: 'Exemplo: Pedro deixou a barba crescer durante férias. Admin clica no botão de reset facial e Pedro refaz cadastro.'
      },
      {
        title: 'Desligar em filial com câmera ruim',
        description: 'Empresa com celulares antigos prefere deixar facial desligado para evitar trava no ponto.',
        example: 'Exemplo: Filial onde 30% dos celulares são modelos antigos — admin desativa facial e mantém só CPF + PIN + GPS.'
      }
    ],
    tips: [
      'A foto fica salva em storage seguro, não exposta publicamente',
      'Reset facial é uma ação de confiança — só faça com motivo claro',
      'Reconhecimento depende de boa luz; oriente a equipe',
      'Em última instância, supervisor pode marcar manualmente pelo painel',
      'Combine facial + GPS para reduzir fraude a quase zero'
    ]
  },
  {
    id: 'bank-hours-apply',
    category: 'financial',
    title: 'Aplicar Banco de Horas',
    description: 'Como compensar crédito ou débito de horas nos pagamentos com preview e cálculo dia/noite',
    icon: 'Clock',
    requiredPermission: 'financial.editBonus',
    steps: [
      {
        title: 'Abrir aba Financeiro',
        description: 'Acesse Financeiro e localize o funcionário com saldo de banco de horas a aplicar.',
      },
      {
        title: 'Clicar em "Aplicar Banco de Horas"',
        description: 'No card do funcionário, clique no botão dedicado. Um modal abre com o saldo atual (crédito ou débito).',
      },
      {
        title: 'Conferir multiplicadores dia/noite',
        description: 'O sistema separa horas diurnas (06:00-22:00) e noturnas (22:00-06:00) e aplica o multiplicador configurado. Veja o cálculo detalhado antes de confirmar.',
        tips: ['Multiplicador noturno padrão é 1.20 — confirme com RH', 'Crédito vira valor positivo somado; débito vira desconto']
      },
      {
        title: 'Selecionar período de aplicação',
        description: 'Escolha em qual payment_period o ajuste será lançado. Normalmente o aberto atual.',
      },
      {
        title: 'Revisar o preview',
        description: 'O modal mostra: saldo antes, valor calculado, novo total do pagamento, número de horas consumidas. Confira tudo antes de confirmar.',
        tips: ['Se o número parecer estranho, cancele e investigue o saldo de origem', 'O preview é meramente informativo — só persiste após o clique final']
      },
      {
        title: 'Confirmar aplicação atômica',
        description: 'Clique em "Confirmar". O sistema grava a movimentação, recalcula o pagamento e zera (ou ajusta) o saldo numa única transação.',
      }
    ],
    useCases: [
      {
        title: 'Compensação de horas extras',
        description: 'Funcionário fez 10h extras no mês. Empresa converte em valor no pagamento.',
        example: 'Exemplo: 8h diurnas × R$ 15 + 2h noturnas × R$ 18 = R$ 156,00 somados ao pagamento do C6.'
      },
      {
        title: 'Desconto de horas faltadas',
        description: 'Funcionário ficou devendo 3h no mês anterior. Sistema desconta no pagamento atual.',
        example: 'Exemplo: 3h × R$ 12 = R$ 36,00 descontados do total bruto do funcionário.'
      },
      {
        title: 'Fechamento mensal limpo',
        description: 'Ao final do mês, supervisor aplica banco de horas de todos para zerar saldos antes do próximo período.',
        example: 'Exemplo: 12 funcionários com saldo positivo — aplicar um por um leva 5 minutos e fecha o mês limpo.'
      },
      {
        title: 'Acerto antes de demissão',
        description: 'Funcionário será desligado e tem saldo positivo. Aplica antes de gerar rescisão.',
        example: 'Exemplo: Maria sai sexta. Aplica 15h de banco antes da rescisão para o valor entrar no acerto.'
      }
    ],
    tips: [
      'Confira sempre o preview — a operação é transacional mas irreversível em produção',
      'Não confunda banco de horas com bonificação — são fluxos diferentes',
      'Multiplicador dia/noite vem da configuração da empresa; mude com cuidado',
      'Guarde o saldo histórico para auditoria — não delete movimentações',
      'Aplique antes do fechamento do payment_period para evitar reabertura'
    ]
  },
  {
    id: 'admin-tab-access',
    category: 'datamanagement',
    title: 'Acesso à Aba Admin',
    description: 'Como desbloquear a aba Admin com senha interna e o que cada seção faz',
    icon: 'ShieldCheck',
    requiredPermission: 'datamanagement.view',
    steps: [
      {
        title: 'Localizar a aba Admin',
        description: 'No menu superior, clique na aba "Admin". Ela só fica visível para usuários com permissão datamanagement.view.',
      },
      {
        title: 'Inserir senha interna',
        description: 'Mesmo com a permissão, o sistema pede uma senha extra: "Clayton2024". É uma trava adicional para evitar acesso acidental.',
        tips: ['A senha é fixa e conhecida pelo admin master', 'Não compartilhe com supervisores comuns']
      },
      {
        title: 'Navegar pelas seções',
        description: 'Após desbloquear, aparecem as seções: Configurações da Empresa, Gestor de Bonificações, Reset Geral, Auditoria. Clique para entrar em cada uma.',
      },
      {
        title: 'Configurações da Empresa',
        description: 'Edite endereço, cidade, lat/lng, raio de geolocalização, schedule padrão e flags como facial obrigatório. Salvar persiste no banco.',
      },
      {
        title: 'Gestor de Bonificações',
        description: 'Crie, edite ou inative tipos de bonificação (B, C1, C2, customizados). Define rótulo, valor padrão e categoria.',
      },
      {
        title: 'Reset Geral / Auditoria',
        description: 'Reset Geral apaga marcações de um dia inteiro (ação destrutiva). Auditoria mostra log de ações sensíveis: remoções, resets, edições.',
        tips: ['Reset Geral pede dupla confirmação', 'Auditoria não pode ser editada — é append-only']
      }
    ],
    useCases: [
      {
        title: 'Onboarding de filial nova',
        description: 'Após cadastrar Ponte Nova no banco, admin entra na aba Admin para configurar lat/lng, raio e schedule.',
        example: 'Exemplo: Abre Configurações, preenche -20.4127 / -42.8723 / 200m, schedule 07:00-17:00 e salva.'
      },
      {
        title: 'Criação de bonificação sazonal',
        description: 'Para uma campanha de fim de ano, admin cria novo tipo "Bonus Natal" pelo Gestor de Bonificações.',
        example: 'Exemplo: ID natal_2026, label "Bônus Natal", valor R$ 200, categoria sazonal — disponível na aba Ponto.'
      },
      {
        title: 'Auditoria após reclamação',
        description: 'Funcionário questiona desconto. Admin entra em Auditoria e localiza o evento original com usuário e timestamp.',
        example: 'Exemplo: Pedro reclama de R$ 50 removidos — auditoria mostra supervisora Ana removendo com observação clara.'
      },
      {
        title: 'Limpeza de dia errado',
        description: 'Sistema registrou ponto errado por bug. Admin usa Reset Geral do dia para limpar e refaz manualmente.',
        example: 'Exemplo: 12/04 todas as marcações vieram com horário UTC errado — Reset Geral do dia e refaz tudo.'
      }
    ],
    tips: [
      'Trate a aba Admin como zona crítica — ações afetam dados financeiros e fiscais',
      'Mantenha a senha interna em local seguro e troque-a se vazar',
      'Sempre revise a auditoria antes de aplicar Reset Geral',
      'Não use Reset Geral como atalho para correção pontual — prefira reset individual',
      'Documente cada mudança de configuração para passar o conhecimento adiante'
    ]
  },
  {
    id: 'mirror-mass-generation',
    category: 'reports',
    title: 'Geração de Espelhos de Ponto em Massa',
    description: 'Como gerar PDFs de espelho para vários funcionários de uma vez na aba Ponto',
    icon: 'FileText',
    requiredPermission: 'reports.generate',
    steps: [
      {
        title: 'Acessar a aba Ponto',
        description: 'O botão "Gerar Espelhos" fica no topo da aba Ponto, ao lado dos demais controles. Só aparece para usuários com a permissão correspondente.',
      },
      {
        title: 'Selecionar período',
        description: 'Escolha datas de início e fim. O sistema costuma usar semana ou mês, mas aceita intervalos customizados.',
        tips: ['Períodos muito grandes geram PDF pesado — prefira mensal', 'Datas precisam estar dentro do mesmo payment_period para coerência']
      },
      {
        title: 'Escolher funcionários',
        description: 'Marque os checkboxes dos funcionários alvo. Há opção "Selecionar todos" para gerar a unidade inteira.',
      },
      {
        title: 'Gerar PDFs',
        description: 'Clique em "Gerar". O sistema processa em lote — pode levar 10-30 segundos dependendo do volume.',
        tips: ['Não recarregue a página durante o processamento', 'Mantenha o navegador aberto até concluir']
      },
      {
        title: 'Baixar e distribuir',
        description: 'Ao final, baixe o arquivo (ZIP com um PDF por funcionário ou PDF único compilado). Compartilhe via e-mail ou WhatsApp.',
      },
      {
        title: 'Conferir conteúdo do espelho',
        description: 'Cada PDF mostra: nome, CPF, função, lista de marcações com data/hora entrada e saída, total de horas, bônus e descontos do período.',
      }
    ],
    useCases: [
      {
        title: 'Fechamento mensal padrão',
        description: 'Todo dia 1 do mês, supervisor gera espelhos do mês anterior para todos os funcionários da filial.',
        example: 'Exemplo: 1 de junho — gera espelhos de maio para os 18 funcionários de Caratinga em um clique.'
      },
      {
        title: 'Auditoria por exigência fiscal',
        description: 'Contabilidade pede espelhos retroativos para auditoria. Gere em massa o trimestre.',
        example: 'Exemplo: Auditoria pede Q1 — gera Jan/Fev/Mar com seleção total e entrega ZIP.'
      },
      {
        title: 'Acerto pré-rescisão',
        description: 'Funcionário pede desligamento. Gera o espelho do período não pago para anexar à rescisão.',
        example: 'Exemplo: João sai dia 20 — gera espelho do período 1-20 para o RH.'
      },
      {
        title: 'Atendimento a fiscalização',
        description: 'Em uma fiscalização do MTE, gerar espelhos da equipe inteira no período fiscalizado é obrigatório.',
        example: 'Exemplo: Fiscal pede últimos 6 meses de toda a equipe — selecionar todos e usar intervalo de 6 meses.'
      }
    ],
    tips: [
      'Para times grandes (>30 pessoas), gere em duas levas para evitar timeout',
      'Confira se o período cobre exatamente o que você precisa antes de gerar',
      'Guarde os PDFs gerados em pasta com nome padrão (ex: espelhos_2026-05_caratinga)',
      'Se um espelho vier sem marcação, confirme se o funcionário realmente faltou',
      'A geração em massa não altera dados — é apenas leitura formatada em PDF'
    ]
  },
  {
    id: 'reset-pin-face',
    category: 'employees',
    title: 'Resetar PIN e Reset Facial do Funcionário',
    description: 'Como o supervisor zera PIN ou foto base pela aba Funcionários',
    icon: 'KeyRound',
    requiredPermission: 'employees.edit',
    steps: [
      {
        title: 'Abrir aba Funcionários',
        description: 'Acesse a aba "Funcionários" no menu superior. A lista carrega todos os colaboradores da empresa ativa.',
      },
      {
        title: 'Localizar o funcionário',
        description: 'Use a busca por nome ou CPF para encontrar a pessoa. Os ícones de ação aparecem à direita do nome.',
      },
      {
        title: 'Reset de PIN',
        description: 'Clique no ícone de chave (KeyRound). Um modal pede confirmação. Após confirmar, o PIN do funcionário é zerado e ele precisa cadastrar novo no próximo /clock.',
        tips: ['Avise o funcionário antes — ele não conseguirá marcar ponto até cadastrar', 'O novo PIN é digitado por ele, nunca compartilhado']
      },
      {
        title: 'Reset Facial',
        description: 'Clique no ícone de câmera. Confirme. A foto base é apagada e o sistema pede cadastro novo no próximo acesso ao /clock.',
        tips: ['Use quando aparência mudou significativamente', 'Reset facial não mexe em PIN — são botões separados']
      },
      {
        title: 'Confirmar mudança',
        description: 'O modal mostra o resumo da ação. Confirme apenas quando tiver certeza — não há desfazer.',
      },
      {
        title: 'Comunicar o funcionário',
        description: 'Após o reset, mande mensagem para a pessoa explicar o novo procedimento (cadastrar PIN ou foto no próximo ponto).',
      }
    ],
    useCases: [
      {
        title: 'PIN esquecido',
        description: 'Funcionário tentou várias vezes e travou o ponto. Supervisor reseta para destravar.',
        example: 'Exemplo: Carlos errou PIN 5x, conta bloqueou. Supervisor clica no ícone de chave, confirma, e Carlos cria novo PIN.'
      },
      {
        title: 'Suspeita de compartilhamento',
        description: 'Colega de trabalho marcou ponto por outro usando PIN — reset força mudança imediata.',
        example: 'Exemplo: João descobre que Pedro sabia seu PIN. Supervisor reseta e João cria novo sozinho.'
      },
      {
        title: 'Mudança de aparência',
        description: 'Funcionário cortou barba e cabelo. Sistema passa a recusar facial — admin reseta foto base.',
        example: 'Exemplo: Ana mudou visual no fim de semana. Reset facial pela aba Funcionários, ela tira nova foto na segunda.'
      },
      {
        title: 'Onboarding refeito',
        description: 'Funcionário voltou após longa licença. Garante credenciais limpas com reset duplo.',
        example: 'Exemplo: Maria volta após 6 meses — reset PIN + reset facial e ela inicia tudo de novo.'
      }
    ],
    tips: [
      'Use os dois resets em conjunto após longas ausências para limpar credenciais',
      'Reset não apaga histórico de pontos — só zera credenciais futuras',
      'Confirme com o funcionário antes para evitar surpresa no próximo expediente',
      'Cada reset fica registrado na auditoria com data, usuário e funcionário alvo',
      'Nunca compartilhe PIN — o reset é para o próprio funcionário cadastrar de novo'
    ]
  },
  {
    id: 'company-settings',
    category: 'datamanagement',
    title: 'Configurações da Empresa',
    description: 'Editar cidade, endereço, lat/lng, raio geo e schedule padrão dentro da aba Admin',
    icon: 'Settings',
    requiredPermission: 'datamanagement.view',
    steps: [
      {
        title: 'Entrar na aba Admin',
        description: 'Acesse Admin, informe a senha interna e clique em "Configurações da Empresa".',
      },
      {
        title: 'Editar cidade e endereço',
        description: 'Preencha cidade, rua e número. Esses campos aparecem em relatórios e espelhos de ponto.',
        tips: ['Use o nome oficial da cidade para alinhamento com documentos', 'Endereço completo facilita auditoria']
      },
      {
        title: 'Definir latitude e longitude',
        description: 'Use Google Maps para pegar coordenadas exatas da entrada da filial. Cole os números nos campos correspondentes.',
        tips: ['Formato esperado: -19.7892, -42.1391 (com ponto, sem aspas)', 'Confira no Maps que o ponto cai no portão de entrada']
      },
      {
        title: 'Configurar raio de geolocalização',
        description: 'Defina o raio em metros que delimita a área válida para ponto. Padrão 150-300m.',
      },
      {
        title: 'Definir schedule padrão',
        description: 'Configure horário de entrada e saída padrão da unidade. É usado como referência em relatórios e cálculos.',
        tips: ['Use 24h: 07:00 / 17:00', 'Aplica a maioria do time; exceções são manuais']
      },
      {
        title: 'Salvar e validar',
        description: 'Clique em "Salvar". O sistema persiste no banco e refresca dados. Faça um teste de ponto para confirmar.',
      }
    ],
    useCases: [
      {
        title: 'Cadastro inicial da filial',
        description: 'Após criar empresa nova no banco, primeiro passo é preencher tudo nesta tela.',
        example: 'Exemplo: Ponte Nova criada — admin abre Configurações, preenche endereço, coordenadas, raio 200m, horário 07:00-17:00.'
      },
      {
        title: 'Mudança de endereço',
        description: 'Empresa mudou de prédio na mesma cidade — atualizar coordenadas para o novo local.',
        example: 'Exemplo: Caratinga muda para Av. Industrial. Pega nova coordenada e atualiza, mantendo raio.'
      },
      {
        title: 'Ajuste de raio após reclamação',
        description: 'Funcionários reclamam de bloqueio na portaria. Admin amplia raio em 50m.',
        example: 'Exemplo: Raio 150m bloqueia quem está no portão externo — aumenta para 200m.'
      },
      {
        title: 'Mudança de horário padrão',
        description: 'Filial muda turno de 08:00-18:00 para 07:00-17:00 — atualizar schedule padrão.',
        example: 'Exemplo: Acordo coletivo mudou jornada — admin edita schedule e a empresa toda se ajusta automaticamente.'
      }
    ],
    tips: [
      'Sempre teste após salvar — uma vírgula errada em lat/lng quebra geolocalização',
      'Não use vírgula como separador decimal nas coordenadas — só ponto',
      'Documente cada mudança em um log interno para histórico',
      'Mudança de schedule deve ser comunicada à equipe com antecedência',
      'Não confunda raio em metros com km — sempre metros'
    ]
  },
  {
    id: 'bonus-types-manager',
    category: 'datamanagement',
    title: 'Gestor de Tipos de Bonificação',
    description: 'Criar, editar e inativar tipos de bônus na aba Admin com valor padrão e categoria',
    icon: 'Gift',
    requiredPermission: 'datamanagement.view',
    steps: [
      {
        title: 'Abrir Gestor pelo painel Admin',
        description: 'Na aba Admin, clique em "Gestor de Bonificações". A lista mostra tipos atuais: B, C1, C2 e customizados.',
      },
      {
        title: 'Criar novo tipo',
        description: 'Clique em "+ Novo Tipo". Preencha ID (kebab-case), label exibido, valor padrão em reais e categoria (produtividade, sazonal, etc).',
        tips: ['ID precisa ser único na empresa', 'Label aparece nos botões da aba Ponto e nos relatórios']
      },
      {
        title: 'Definir valor padrão',
        description: 'Valor padrão é pré-preenchido quando o supervisor aplica o bônus. Pode ser sobrescrito no momento da aplicação.',
      },
      {
        title: 'Editar tipo existente',
        description: 'Clique no lápis ao lado do tipo. Mude label, valor ou categoria. Salvar atualiza globalmente.',
        tips: ['Edição não retroage — bônus já aplicados continuam com valor antigo', 'Renomear label não muda histórico financeiro']
      },
      {
        title: 'Inativar tipo',
        description: 'Toggle "Ativo" para off. O tipo deixa de aparecer nos botões mas o histórico fica intacto.',
        tips: ['Prefira inativar a deletar — deletar quebra histórico', 'Tipos inativos podem ser reativados depois']
      },
      {
        title: 'Conferir aplicação',
        description: 'Volte à aba Ponto e cheque se o novo tipo aparece nos botões de bonificação. Aplique de teste em um funcionário.',
      }
    ],
    useCases: [
      {
        title: 'Campanha sazonal de Natal',
        description: 'Empresa quer aplicar bônus único de fim de ano sem misturar com produtividade.',
        example: 'Exemplo: Novo tipo "natal_2026", label "Bônus Natal", valor R$ 200, categoria sazonal — aparece nos botões da equipe inteira.'
      },
      {
        title: 'Bônus de assiduidade',
        description: 'Recompensa por presença sem faltas no mês.',
        example: 'Exemplo: Cria tipo "assiduidade", valor R$ 80, aplica no primeiro dia do mês seguinte para quem teve presença total.'
      },
      {
        title: 'Inativação de bônus descontinuado',
        description: 'Bônus C1 não é mais usado mas histórico precisa ficar.',
        example: 'Exemplo: Toggle C1 off — botão some da aba Ponto mas pagamentos antigos continuam com C1 visível.'
      },
      {
        title: 'Ajuste de valor padrão',
        description: 'Bônus B passa de R$ 50 para R$ 70 — basta editar o valor padrão.',
        example: 'Exemplo: Edita B, troca valor 50 para 70, salva — próximas aplicações já usam 70 como sugestão.'
      }
    ],
    tips: [
      'ID do tipo é imutável após criação — escolha com cuidado',
      'Valor padrão é apenas sugestão; o supervisor pode mudar no momento da aplicação',
      'Inativar é seguro, deletar não',
      'Categoria ajuda em relatórios — use produtividade, sazonal, assiduidade etc',
      'Cada mudança fica registrada na auditoria'
    ]
  },
  {
    id: 'triage-errors',
    category: 'errors',
    title: 'Triagem de Erros (Distribuição em Grupo)',
    description: 'Como criar erros de triagem com valor por erro e distribuir entre vários funcionários',
    icon: 'ClipboardList',
    requiredPermission: 'errors.viewTriage',
    steps: [
      {
        title: 'Abrir aba Erros > Triagem',
        description: 'Na aba Erros, clique na subaba "Triagem". A tela mostra erros de triagem do período aberto.',
      },
      {
        title: 'Registrar novo erro de triagem',
        description: 'Clique em "Novo Erro de Triagem". Informe data, descrição, quantidade de itens errados e valor unitário.',
        tips: ['A descrição é compartilhada entre todos do grupo — seja claro', 'Valor unitário multiplicado pela quantidade gera o total']
      },
      {
        title: 'Selecionar funcionários envolvidos',
        description: 'Marque os checkboxes dos funcionários que estavam na triagem do dia. O sistema distribui o valor proporcionalmente.',
        tips: ['Quem não estava na escala não deve ser marcado', 'Conferir antes de salvar — distribuição é automática mas os nomes vêm de você']
      },
      {
        title: 'Conferir distribuição automática',
        description: 'O preview mostra quanto vai sair de cada funcionário. Total dividido pela quantidade de pessoas.',
      },
      {
        title: 'Salvar e distribuir',
        description: 'Clique em "Salvar". O sistema cria registros individuais por funcionário, vinculados ao erro raiz.',
      },
      {
        title: 'Auditar lançamento',
        description: 'A lista atualiza mostrando o novo erro e os funcionários envolvidos. Pode editar ou apagar enquanto o período estiver aberto.',
        tips: ['Após fechamento do period, edição fica bloqueada', 'Use a descrição como pista para encontrar depois']
      }
    ],
    useCases: [
      {
        title: 'Erros de separação de carga',
        description: 'Equipe de triagem deixou 5 caixas erradas. Cada caixa custa R$ 8.',
        example: 'Exemplo: 5 caixas × R$ 8 = R$ 40 distribuídos entre 4 funcionários da escala — R$ 10 cada.'
      },
      {
        title: 'Avarias coletivas',
        description: 'Mercadorias avariadas durante turno coletivo — divisão proporcional.',
        example: 'Exemplo: R$ 120 em avarias na escala de 6 pessoas — R$ 20 por funcionário.'
      },
      {
        title: 'Erros de conferência em lote',
        description: 'Conferência divergente em pallet — três conferentes presentes.',
        example: 'Exemplo: R$ 90 de divergência ÷ 3 = R$ 30 cada, lançados como triagem.'
      },
      {
        title: 'Distribuição justa em equipes',
        description: 'Quando o erro não tem responsável único identificado, divisão proporcional é o caminho.',
        example: 'Exemplo: Turno noturno tem 8 erros sem dono — distribui entre os 5 presentes.'
      }
    ],
    tips: [
      'Triagem só faz sentido quando a culpa é coletiva — culpa individual usa "Erro Individual"',
      'O funcionário vê sua fatia em /erros como categoria "triagem"',
      'Edite antes do fechamento — depois fica bloqueado',
      'Documente bem a descrição para audit trail',
      'Sempre confira escala do dia antes de marcar funcionários'
    ]
  },
  {
    id: 'permissions-granular',
    category: 'users',
    title: 'Permissões Granulares por Usuário',
    description: 'Visualizar e editar a matriz de permissões por categoria no modal de Permissões',
    icon: 'Lock',
    requiredPermission: 'users.managePermissions',
    steps: [
      {
        title: 'Acessar aba Usuários',
        description: 'Na aba "Usuários" (visível apenas para admin master), localize o supervisor cuja permissão você quer ajustar.',
      },
      {
        title: 'Abrir modal de Permissões',
        description: 'Clique no ícone de cadeado ao lado do nome. O modal Permissões Granulares abre mostrando a matriz por categoria.',
      },
      {
        title: 'Navegar pelas categorias',
        description: 'As categorias são: Ponto, Funcionários, Relatórios, Financeiro, Pagamento C6, Erros, Configurações, Usuários, Gerenciamento de Dados. Cada uma tem várias permissões.',
        tips: ['Ative apenas o necessário — princípio do menor privilégio', 'Use os presets DEFAULT_SUPERVISOR ou DEFAULT_READONLY como ponto de partida']
      },
      {
        title: 'Marcar/desmarcar checkboxes',
        description: 'Cada permissão é um checkbox. Marque para liberar, desmarque para bloquear. Mudanças são visuais até salvar.',
      },
      {
        title: 'Conferir presets',
        description: 'Botões "Aplicar preset Supervisor" e "Aplicar preset Read-only" preenchem a matriz inteira de uma vez.',
        tips: ['Use preset como base e ajuste pontos específicos', 'Não tem preset admin — admin master tem tudo por padrão']
      },
      {
        title: 'Salvar mudanças',
        description: 'Clique em "Salvar". O sistema grava no banco, registra no permission_logs e o supervisor passa a ver/não ver abas de imediato.',
        tips: ['Mudança crítica pode exigir o supervisor relogar para refresh do JWT', 'Sempre comunique o supervisor antes de cortar permissões']
      }
    ],
    useCases: [
      {
        title: 'Onboarding de novo supervisor',
        description: 'Aplicar preset Supervisor e ajustar 2-3 itens conforme função específica.',
        example: 'Exemplo: Novo supervisor de turno noturno — preset Supervisor + desativa "Aplicar bônus C1/C2" e "Limpar período".'
      },
      {
        title: 'Promoção de read-only para supervisor',
        description: 'Auxiliar administrativo passa a operar — troca preset Read-only por Supervisor.',
        example: 'Exemplo: Carla agora gerencia equipe — aplica preset Supervisor e libera "Importar planilha".'
      },
      {
        title: 'Restrição temporária',
        description: 'Supervisor cometeu erro grave — corta permissão de "Excluir pagamentos" temporariamente.',
        example: 'Exemplo: Apagou pagamento errado por engano — admin desmarca financial.delete por 30 dias.'
      },
      {
        title: 'Permissão sob demanda',
        description: 'Supervisor precisa importar planilha mensal — libera só "Importar planilha".',
        example: 'Exemplo: João pede para fazer carga mensal — admin marca employees.import só pra ele.'
      }
    ],
    tips: [
      'Comece sempre pelo preset mais restritivo e libere conforme necessário',
      'Toda mudança fica em permission_logs com before/after para auditoria',
      'Permissões dinâmicas de bonificação (applyBonus_<id>) podem ser ativadas por tipo',
      'Não dê managePermissions a supervisores — só admin master',
      'Revogue acessos imediatamente em caso de desligamento'
    ]
  },
  {
    id: 'payment-period-auto',
    category: 'errors',
    title: 'Toggle Auto-Weekly em Períodos de Pagamento',
    description: 'Como ativar criação automática semanal ou criar períodos manuais',
    icon: 'CalendarClock',
    requiredPermission: 'errors.view',
    steps: [
      {
        title: 'Abrir tela de Períodos de Pagamento',
        description: 'Na aba Erros (ou Financeiro, dependendo da configuração), localize a seção "Períodos de Pagamento".',
      },
      {
        title: 'Identificar o toggle auto_weekly',
        description: 'No topo da seção, há um switch "Criação automática semanal". Quando ON, o sistema cria um novo período toda segunda-feira automaticamente.',
        tips: ['ON é o padrão para empresas com pagamento semanal', 'OFF permite criação manual com qualquer cadência (quinzenal, mensal)']
      },
      {
        title: 'Modo automático (ON)',
        description: 'Com toggle ligado, todo início de semana o sistema gera um payment_period com janela seg-dom. Pagamentos, bônus e erros caem automaticamente nele.',
        tips: ['Não precisa fazer nada — o cron interno cuida', 'O período anterior fica fechado e pronto para C6']
      },
      {
        title: 'Modo manual (OFF)',
        description: 'Com toggle desligado, o botão "Criar Período" aparece. Você define data inicial, data final e nome.',
        tips: ['Use para quinzena (1-15, 16-fim) ou mensal (1-fim)', 'Pode coexistir com períodos antigos automáticos']
      },
      {
        title: 'Criar período manual',
        description: 'Clique em "Criar Período". Preencha datas e clique em salvar. Ele aparece no topo da lista como aberto.',
      },
      {
        title: 'Fechar período',
        description: 'Quando terminar a janela, clique em "Fechar". O período passa para read-only e libera espaço para o próximo.',
      }
    ],
    useCases: [
      {
        title: 'Empresa com pagamento semanal',
        description: 'Cadência fixa toda segunda — deixa toggle ON e esquece.',
        example: 'Exemplo: Caratinga paga toda sexta a semana anterior — toggle ON, sistema cuida sozinho.'
      },
      {
        title: 'Empresa quinzenal',
        description: 'Pagamento dia 5 e dia 20 — toggle OFF e criação manual.',
        example: 'Exemplo: Ponte Nova paga quinzena — OFF, cria período 1-15 manualmente, depois 16-fim.'
      },
      {
        title: 'Mudança de cadência',
        description: 'Empresa migra de semanal para mensal — desliga toggle e cria período mensal único.',
        example: 'Exemplo: Acordo coletivo mudou para mensal — desliga toggle dia 1 e cria período do mês inteiro.'
      },
      {
        title: 'Período especial (rescisão)',
        description: 'Cria período curto para acerto de demissão fora do ciclo normal.',
        example: 'Exemplo: João sai dia 22 — cria período 16-22 manualmente para fechar acerto.'
      }
    ],
    tips: [
      'Toggle é por empresa — uma pode ser automática e outra manual',
      'Nunca mude o toggle no meio de um período aberto sem fechar antes',
      'Período fechado fica imutável — toda nova movimentação cai no próximo',
      'O C6 só gera com período fechado',
      'Documente a cadência da empresa em algum lugar interno'
    ]
  },
  {
    id: 'security-overview',
    category: 'settings',
    title: 'Visão Geral de Segurança',
    description: 'RLS multi-empresa, JWT custom HS256, bcrypt + PIN e fluxo público via edge function',
    icon: 'ShieldCheck',
    requiredPermission: 'settings.view',
    steps: [
      {
        title: 'Entender o multi-tenant',
        description: 'Cada empresa tem company_id próprio. Todas as tabelas críticas têm essa coluna e o RLS do Supabase garante que ninguém leia/escreva fora do tenant ativo.',
        tips: ['RLS é a primeira camada — não confie só em filtros de aplicação', 'O company_id do JWT é a fonte da verdade']
      },
      {
        title: 'JWT customizado HS256',
        description: 'O login gera um JWT assinado com HS256 contendo user_id, company_id, role e permissões. O front guarda em sessionStorage e envia em cada request.',
        tips: ['Segredo do HS256 fica apenas em variável de ambiente do backend', 'Token expira em 8h e exige novo login']
      },
      {
        title: 'Senhas com bcrypt + PIN',
        description: 'Senhas de supervisor são bcrypt (cost 12). PIN de funcionário também passa por bcrypt na sub-fase 11.9 — não há armazenamento em texto plano.',
        tips: ['Bcrypt protege contra rainbow tables e brute force lento', 'Mesmo o admin master não consegue ver senhas — só resetar']
      },
      {
        title: 'Fluxo público sem RLS',
        description: 'URLs /clock e /erros são públicas. Não passam por RLS direto — vão a uma edge function que valida CPF + PIN e devolve dados específicos do funcionário.',
        tips: ['A edge function tem service_role mas filtra rigorosamente por CPF + company', 'Tentativa de força bruta no PIN dispara rate limit']
      },
      {
        title: 'Auditoria de ações sensíveis',
        description: 'Toda remoção de bonificação, mudança de permissão e reset gera registro em logs append-only. Não há delete em log — só insert.',
      },
      {
        title: 'Boas práticas operacionais',
        description: 'Nunca compartilhe credenciais, troque a senha interna do Admin periodicamente, revogue acessos no desligamento e revise logs mensalmente.',
        tips: ['Use gerenciador de senhas para a senha interna', 'Habilite facial + GPS para defesa em profundidade']
      }
    ],
    useCases: [
      {
        title: 'Investigação de acesso suspeito',
        description: 'Movimentação fora do horário — admin consulta logs e identifica quem fez o quê e quando.',
        example: 'Exemplo: R$ 200 removidos às 23:30 — auditoria mostra o user_id, IP e observação registrada.'
      },
      {
        title: 'Desligamento de supervisor',
        description: 'Após desligar, admin invalida senha e zera permissões no mesmo dia.',
        example: 'Exemplo: Carla saiu — admin reseta senha, desmarca todas permissões e remove acesso ao C6.'
      },
      {
        title: 'Resposta a incidente',
        description: 'Funcionário relata que o ponto foi marcado sem ele saber — admin checa logs, IP e foto.',
        example: 'Exemplo: João alega não ter marcado quinta. Auditoria mostra GPS distante e similaridade facial baixa — reset PIN imediato.'
      },
      {
        title: 'Onboarding de admin secundário',
        description: 'Novo admin recebe acesso master mas é orientado a usar 2FA do gestor de senhas e nunca compartilhar credenciais.',
        example: 'Exemplo: Cris vira admin secundário — recebe credenciais via cofre, lê este tutorial e ativa autenticação extra no PC.'
      }
    ],
    tips: [
      'RLS + JWT + bcrypt + edge function compõem defesa em profundidade — não fragilize nenhuma camada',
      'Revise logs de remoção e permissões pelo menos uma vez por mês',
      'Reset facial + reset PIN juntos limpam credenciais comprometidas',
      'Senha interna da aba Admin deve ser rotacionada periodicamente',
      'Documente o playbook de incidente em local seguro mas acessível'
    ]
  }
];
