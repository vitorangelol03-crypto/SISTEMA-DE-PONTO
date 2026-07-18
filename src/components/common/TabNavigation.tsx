import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Users,
  BarChart3,
  Settings,
  UserCog,
  DollarSign,
  AlertTriangle,
  FileSpreadsheet,
  Truck,
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
  | 'driverpay'
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
  const { t } = useTranslation();
  // Sub-fase 17.5.1: name traduzido via i18n. data-test mantém nome pt-BR
  // pra compat com specs E2E (que usam getByRole({name:/Ponto/}) etc.).
  const allTabs = [
    { id: 'attendance' as TabType, name: t('tab.attendance'), icon: Clock, permission: 'attendance.view' },
    { id: 'employees' as TabType, name: t('tab.employees'), icon: Users, permission: 'employees.view' },
    { id: 'reports' as TabType, name: t('tab.reports'), icon: BarChart3, permission: 'reports.view' },
    { id: 'financial' as TabType, name: t('tab.financial'), icon: DollarSign, permission: 'financial.view' },
    { id: 'c6payment' as TabType, name: t('tab.c6payment'), icon: FileSpreadsheet, permission: 'c6payment.view' },
    { id: 'driverpay' as TabType, name: t('tab.driverpay'), icon: Truck, permission: 'driverpay.view' },
    { id: 'errors' as TabType, name: t('tab.errors'), icon: AlertTriangle, permission: 'errors.view' },
    { id: 'settings' as TabType, name: t('tab.settings'), icon: Settings, permission: 'settings.view' },
    { id: 'users' as TabType, name: t('tab.users'), icon: UserCog, permission: 'users.view' },
    { id: 'datamanagement' as TabType, name: t('tab.datamanagement'), icon: Database, permission: 'datamanagement.view' },
    { id: 'tutorial' as TabType, name: t('tab.tutorial'), icon: BookOpen, permission: null },
    { id: 'admin' as TabType, name: t('tab.admin'), icon: Shield, permission: null },
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
