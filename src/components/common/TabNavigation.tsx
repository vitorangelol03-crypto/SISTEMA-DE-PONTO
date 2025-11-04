import React from 'react';
import { Clock, Users, BarChart3, Settings, UserCog, DollarSign, AlertTriangle, FileSpreadsheet, Database, BookOpen } from 'lucide-react';

export type TabType = 'attendance' | 'employees' | 'reports' | 'settings' | 'users' | 'financial' | 'errors' | 'c6payment' | 'datamanagement' | 'tutorial';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  userRole: 'admin' | 'supervisor';
  hasPermission: (permission: string) => boolean;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  userRole,
  hasPermission
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
    { id: 'tutorial' as TabType, name: 'Ajuda', icon: BookOpen, permission: null }
  ];

  const tabs = allTabs.filter(tab => !tab.permission || hasPermission(tab.permission));

  return (
    <div className="bg-white shadow-sm mb-4 sm:mb-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4 sm:gap-8 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } snap-start whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-2 transition-colors min-h-[44px]`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline sm:inline">{tab.name}</span>
                <span className="xs:hidden sm:hidden">{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};