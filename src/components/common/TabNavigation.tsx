import React from 'react';
import {
  Clock,
  Users,
  BarChart3,
  Settings,
  UserCog,
  DollarSign,
  AlertTriangle,
  FileSpreadsheet,
  Database,
  BookOpen,
  Shield,
} from 'lucide-react';

export type TabType =
  | 'attendance'
  | 'employees'
  | 'reports'
  | 'settings'
  | 'users'
  | 'financial'
  | 'errors'
  | 'c6payment'
  | 'datamanagement'
  | 'tutorial'
  | 'admin';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  userRole: 'admin' | 'supervisor';
  hasPermission: (permission: string) => boolean;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  hasPermission,
}) => {
  const allTabs = [
    { id: 'attendance' as TabType, name: 'Ponto', icon: Clock, permission: 'attendance.view' },
    { id: 'employees' as TabType, name: 'Funcionários', icon: Users, permission: 'employees.view' },
    { id: 'reports' as TabType, name: 'Relatórios', icon: BarChart3, permission: 'reports.view' },
    { id: 'financial' as TabType, name: 'Financeiro', icon: DollarSign, permission: 'financial.view' },
    { id: 'c6payment' as TabType, name: 'Pagamento C6', icon: FileSpreadsheet, permission: 'c6payment.view' },
    { id: 'errors' as TabType, name: 'Erros', icon: AlertTriangle, permission: 'errors.view' },
    { id: 'settings' as TabType, name: 'Configurações', icon: Settings, permission: 'settings.view' },
    { id: 'users' as TabType, name: 'Usuários', icon: UserCog, permission: 'users.view' },
    { id: 'datamanagement' as TabType, name: 'Gerenciamento', icon: Database, permission: 'datamanagement.view' },
    { id: 'tutorial' as TabType, name: 'Ajuda', icon: BookOpen, permission: null },
    { id: 'admin' as TabType, name: 'Admin', icon: Shield, permission: null },
  ];

  const tabs = allTabs.filter((tab) => !tab.permission || hasPermission(tab.permission));

  /*
    Nav horizontal sempre visível (mobile + desktop). Em mobile fica scrollable
    horizontalmente — todas as tabs presentes no DOM e clicáveis por
    getByRole('button', { name: 'NomeAba' }) sem dependência de hamburger.
    Desktop ganha gaps maiores via classes responsivas.
  */
  return (
    <div className="bg-white shadow-sm mb-4 sm:mb-6 sticky top-14 sm:top-16 z-30 border-b border-gray-200">
      <nav
        className="-mb-px flex gap-1 sm:gap-4 lg:gap-8 px-2 sm:px-4 overflow-x-auto"
        aria-label="Navegação principal"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.name}
              aria-current={isActive ? 'page' : undefined}
              className={`${
                isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 transition-colors min-h-[44px] flex-shrink-0`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
