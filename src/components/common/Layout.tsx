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
  // 06/08/2026 — no cabeçalho colorido, a etiqueta vira vidro (branco translúcido):
  // legível sobre o gradiente, sem perder a diferença admin × supervisor.
  const roleColors =
    user.role === 'admin'
      ? 'bg-white/20 text-white ring-1 ring-white/30'
      : 'bg-emerald-400/25 text-white ring-1 ring-emerald-200/40';

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/*
        06/08/2026 — barra de cima com gradiente vivo (pedido dele: "cores vivas").
        ⚠️ O layout foi arrumado junto: o título agora encolhe de verdade
        (`min-w-0` + `truncate`) e o bloco da direita não encolhe — antes, no
        celular, saía "Sistema de Pon" com a etiqueta "Administrador" POR CIMA.
      */}
      <header className="ui-appbar shadow-lg sticky top-0 z-40">
        <div className="px-3 sm:px-4 lg:px-8">
          <div className="flex justify-between items-center gap-2 h-14 sm:h-16">
            <div className="flex items-center min-w-0 flex-1">
              <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-white truncate">
                Sistema de Ponto
              </h1>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center space-x-2 text-sm text-white/90">
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
                className="flex items-center gap-2 px-3 py-2 text-sm text-white/90 hover:text-white hover:bg-white/15 rounded-lg transition-colors min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.logout')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/*
        sm:pb-24 (96px) reserva espaço pra última linha não ficar coberta pelo
        HelpButton (FAB hidden sm:flex fixed bottom-6 right-6 w-14 h-14 =
        ocupa ~80px do bottom em sm+). Mobile (sem FAB visível) mantém pb-4.
      */}
      <main className="px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 pb-4 sm:pb-24">
        {children}
      </main>
    </div>
  );
};
