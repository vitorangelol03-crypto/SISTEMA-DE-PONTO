import React, { useState, useEffect } from 'react';
import { Clock, Users, BarChart3, Settings, UserCog, DollarSign, AlertTriangle, FileSpreadsheet, Database, BookOpen, Shield, Menu, X } from 'lucide-react';

export type TabType = 'attendance' | 'employees' | 'reports' | 'settings' | 'users' | 'financial' | 'errors' | 'c6payment' | 'datamanagement' | 'tutorial' | 'admin';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  userRole: 'admin' | 'supervisor';
  hasPermission: (permission: string) => boolean;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  hasPermission
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    { id: 'admin' as TabType, name: 'Admin', icon: Shield, permission: null }
  ];

  const tabs = allTabs.filter(tab => !tab.permission || hasPermission(tab.permission));
  const activeTabObj = tabs.find(t => t.id === activeTab);

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const handleSelect = (id: TabType) => {
    onTabChange(id);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* MOBILE: barra com hamburguer + nome da aba ativa */}
      <div className="md:hidden bg-white shadow-sm mb-4 sticky top-14 z-30 border-b border-gray-200">
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
          aria-label="Abrir menu"
        >
          <span className="flex items-center gap-2 text-blue-600 font-semibold">
            {activeTabObj && <activeTabObj.icon className="w-5 h-5" />}
            {activeTabObj?.name ?? 'Menu'}
          </span>
          <Menu className="w-6 h-6 text-gray-600" />
        </button>
      </div>

      {/* DRAWER mobile */}
      {drawerOpen && (
        <>
          {/* Overlay: fixed full-screen, z-50 */}
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer: fixed à direita, z-60 (acima do overlay) */}
          <aside className="md:hidden fixed top-0 right-0 h-full w-4/5 max-w-[280px] bg-white shadow-xl flex flex-col z-[60]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Menu</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleSelect(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 min-h-[48px] text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      {/* DESKTOP: navegação horizontal */}
      <div className="hidden md:block bg-white shadow-sm mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-4 lg:gap-8 px-4 overflow-x-auto">
            {tabs.map(tab => {
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
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors min-h-[44px]`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
};
