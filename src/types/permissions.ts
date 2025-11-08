export interface TabPermissions {
  view: boolean;
}

export interface AttendancePermissions extends TabPermissions {
  mark: boolean;
  edit: boolean;
  search: boolean;
  reset: boolean;
  viewHistory: boolean;
  editHistory: boolean;
}

export interface EmployeesPermissions extends TabPermissions {
  create: boolean;
  edit: boolean;
  delete: boolean;
  import: boolean;
}

export interface ReportsPermissions extends TabPermissions {
  generate: boolean;
  exportExcel: boolean;
  exportPDF: boolean;
}

export interface FinancialPermissions extends TabPermissions {
  viewPayments: boolean;
  editRate: boolean;
  editBonus: boolean;
  delete: boolean;
  clear: boolean;
  applyBonus: boolean;
  removeBonus: boolean;
  removeBonusBulk: boolean;
}

export interface C6PaymentPermissions extends TabPermissions {
  generate: boolean;
  export: boolean;
}

export interface ErrorsPermissions extends TabPermissions {
  create: boolean;
  edit: boolean;
  delete: boolean;
  viewStats: boolean;
}

export interface SettingsPermissions extends TabPermissions {
  editDailyRate: boolean;
  editOther: boolean;
}

export interface UsersPermissions extends TabPermissions {
  create: boolean;
  delete: boolean;
  managePermissions: boolean;
}

export interface DataManagementPermissions extends TabPermissions {
  viewStats: boolean;
  configRetention: boolean;
  manualCleanup: boolean;
  autoCleanup: boolean;
}

export interface UserPermissions {
  attendance: AttendancePermissions;
  employees: EmployeesPermissions;
  reports: ReportsPermissions;
  financial: FinancialPermissions;
  c6payment: C6PaymentPermissions;
  errors: ErrorsPermissions;
  settings: SettingsPermissions;
  users: UsersPermissions;
  datamanagement: DataManagementPermissions;
}

export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
  attendance: { view: true, mark: true, edit: true, search: true, reset: true, viewHistory: true, editHistory: true },
  employees: { view: true, create: true, edit: true, delete: true, import: true },
  reports: { view: true, generate: true, exportExcel: true, exportPDF: true },
  financial: { view: true, viewPayments: true, editRate: true, editBonus: true, delete: true, clear: true, applyBonus: true, removeBonus: true, removeBonusBulk: true },
  c6payment: { view: true, generate: true, export: true },
  errors: { view: true, create: true, edit: true, delete: true, viewStats: true },
  settings: { view: true, editDailyRate: true, editOther: true },
  users: { view: true, create: true, delete: true, managePermissions: true },
  datamanagement: { view: true, viewStats: true, configRetention: true, manualCleanup: true, autoCleanup: true }
};

export const DEFAULT_SUPERVISOR_PERMISSIONS: UserPermissions = {
  attendance: { view: true, mark: true, edit: false, search: true, reset: false, viewHistory: true, editHistory: true },
  employees: { view: true, create: true, edit: true, delete: false, import: true },
  reports: { view: true, generate: true, exportExcel: true, exportPDF: true },
  financial: { view: true, viewPayments: true, editRate: false, editBonus: true, delete: false, clear: false, applyBonus: true, removeBonus: true, removeBonusBulk: false },
  c6payment: { view: true, generate: true, export: true },
  errors: { view: true, create: true, edit: true, delete: false, viewStats: true },
  settings: { view: false, editDailyRate: false, editOther: false },
  users: { view: false, create: false, delete: false, managePermissions: false },
  datamanagement: { view: false, viewStats: false, configRetention: false, manualCleanup: false, autoCleanup: false }
};

export const DEFAULT_READONLY_PERMISSIONS: UserPermissions = {
  attendance: { view: true, mark: false, edit: false, search: true, reset: false, viewHistory: true, editHistory: false },
  employees: { view: true, create: false, edit: false, delete: false, import: false },
  reports: { view: true, generate: true, exportExcel: true, exportPDF: true },
  financial: { view: true, viewPayments: true, editRate: false, editBonus: false, delete: false, clear: false, applyBonus: false, removeBonus: false, removeBonusBulk: false },
  c6payment: { view: true, generate: false, export: false },
  errors: { view: true, create: false, edit: false, delete: false, viewStats: true },
  settings: { view: false, editDailyRate: false, editOther: false },
  users: { view: false, create: false, delete: false, managePermissions: false },
  datamanagement: { view: false, viewStats: false, configRetention: false, manualCleanup: false, autoCleanup: false }
};

export interface PermissionLog {
  id: string;
  user_id: string;
  changed_by: string;
  permissions_before: UserPermissions | null;
  permissions_after: UserPermissions;
  change_summary: string | null;
  created_at: string;
}

export interface UserPermissionRecord {
  id: string;
  user_id: string;
  permissions: UserPermissions;
  updated_by: string;
  updated_at: string;
  created_at: string;
}

export const PERMISSION_LABELS = {
  attendance: {
    title: 'Ponto',
    view: 'Ver aba',
    mark: 'Marcar presença',
    edit: 'Editar horário de saída',
    search: 'Buscar histórico',
    reset: 'Resetar registros de ponto',
    viewHistory: 'Visualizar dias anteriores',
    editHistory: 'Editar registros de dias anteriores'
  },
  employees: {
    title: 'Funcionários',
    view: 'Ver aba',
    create: 'Criar funcionário',
    edit: 'Editar funcionário',
    delete: 'Excluir funcionário',
    import: 'Importar planilha'
  },
  reports: {
    title: 'Relatórios',
    view: 'Ver aba',
    generate: 'Gerar relatórios',
    exportExcel: 'Exportar Excel',
    exportPDF: 'Exportar PDF'
  },
  financial: {
    title: 'Financeiro',
    view: 'Ver aba',
    viewPayments: 'Visualizar pagamentos',
    editRate: 'Editar taxa diária',
    editBonus: 'Editar bônus',
    delete: 'Excluir pagamentos',
    clear: 'Limpar período',
    applyBonus: 'Aplicar bonificação',
    removeBonus: 'Remover bonificação individual',
    removeBonusBulk: 'Remover todas bonificações de um dia'
  },
  c6payment: {
    title: 'Pagamento C6',
    view: 'Ver aba',
    generate: 'Gerar arquivo',
    export: 'Exportar'
  },
  errors: {
    title: 'Erros',
    view: 'Ver aba',
    create: 'Criar registro',
    edit: 'Editar',
    delete: 'Excluir',
    viewStats: 'Ver estatísticas'
  },
  settings: {
    title: 'Configurações',
    view: 'Ver aba',
    editDailyRate: 'Editar taxa diária padrão',
    editOther: 'Outras configurações'
  },
  users: {
    title: 'Usuários',
    view: 'Ver aba',
    create: 'Criar supervisor',
    delete: 'Excluir supervisor',
    managePermissions: 'Gerenciar permissões'
  },
  datamanagement: {
    title: 'Gerenciamento de Dados',
    view: 'Ver aba',
    viewStats: 'Ver estatísticas',
    configRetention: 'Configurar retenção',
    manualCleanup: 'Limpar dados manualmente',
    autoCleanup: 'Configurar limpeza automática'
  }
};
