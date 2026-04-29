import React from 'react';
import { Building2, MapPin, LogOut } from 'lucide-react';
import { useCompany } from '../../contexts/CompanyContext';
import type { User } from '../../services/database';

interface CompanySelectorProps {
  user: User;
  onSelected: (companyId: string) => void;
  onLogout: () => void;
}

export const CompanySelector: React.FC<CompanySelectorProps> = ({ user, onSelected, onLogout }) => {
  const { availableCompanies, setCompany, loading } = useCompany();

  const handlePick = async (companyId: string) => {
    await setCompany(companyId);
    onSelected(companyId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="text-white">
          <h1 className="text-lg font-medium">Olá, {user.id}!</h1>
          <p className="text-blue-100 text-sm">Selecione a empresa</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl">
          {loading || availableCompanies.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-white">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mb-4"></div>
              <p>Carregando empresas...</p>
            </div>
          ) : (
            <>
              <h2 className="text-white text-2xl font-bold text-center mb-8">
                Em qual empresa você vai trabalhar agora?
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableCompanies.map(company => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => handlePick(company.id)}
                    className="bg-white rounded-2xl shadow-xl p-6 text-left hover:scale-[1.02] hover:shadow-2xl transition-all cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/40"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate">
                          {company.display_name}
                        </h3>
                        <p className="text-sm text-gray-500 truncate" title={company.legal_name}>
                          {company.legal_name}
                        </p>
                        <p className="mt-2 flex items-center gap-1 text-sm text-gray-600">
                          <MapPin className="w-3.5 h-3.5" />
                          <span className="truncate">{company.city}</span>
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
