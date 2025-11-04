import React from 'react';
import { User, LogOut } from 'lucide-react';
import { User as UserType } from '../../services/database';

interface LayoutProps {
  user: UserType;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
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
                <span>ID: {user.id}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                  {user.role === 'admin' ? 'Administrador' : 'Supervisor'}
                </span>
              </div>

              {/* Mobile Badge */}
              <div className="sm:hidden">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                  {user.role === 'admin' ? 'Admin' : 'Super'}
                </span>
              </div>

              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
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