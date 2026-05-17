import React from 'react';
import { User, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { User as UserType } from '../../services/database';
import { CompanySwitcher } from '../layout/CompanySwitcher';
import { LanguageSwitcher } from './LanguageSwitcher';

interface LayoutProps {
  user: UserType;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, children }) => {
  const { t } = useTranslation();
  const roleLabel = user.role === 'admin' ? t('header.role.admin') : t('header.role.supervisor');
  const roleColors =
    user.role === 'admin'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-green-100 text-green-800';

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="px-3 sm:px-4 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center flex-1 min-w-0">
              <div className="flex-shrink-0">
                <h1 className="text-base sm:text-xl font-bold text-blue-600 truncate">Sistema de Ponto</h1>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{t('header.user_id')}: {user.id}</span>
              </div>

              {/*
                Badge único responsivo: texto completo ("Administrador"/"Supervisor")
                vive no DOM em todos viewports. Em mobile aplicamos truncate +
                max-w pra reduzir visualmente, mantendo o texto acessível
                para screen readers e seletores E2E (getByText, .first()).
              */}
              <span
                aria-label={roleLabel}
                className={`inline-block px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[64px] sm:max-w-none ${roleColors}`}
                title={roleLabel}
              >
                {roleLabel}
              </span>

              {user.role === 'admin' && (
                <CompanySwitcher onCompanyChange={() => window.location.reload()} />
              )}

              <LanguageSwitcher />

              <button
                onClick={onLogout}
                aria-label={t('header.logout')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.logout')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
};
