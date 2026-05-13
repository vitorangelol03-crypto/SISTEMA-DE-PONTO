import React, { useState } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useCompany } from '../../contexts/CompanyContext';

interface CompanySwitcherProps {
  onCompanyChange?: () => void;
}

export const CompanySwitcher: React.FC<CompanySwitcherProps> = ({ onCompanyChange }) => {
  const { company, availableCompanies } = useCompany();
  const [open, setOpen] = useState(false);

  if (!company || availableCompanies.length <= 1) {
    return null;
  }

  const handleSelect = (id: string) => {
    if (id === company.id) {
      setOpen(false);
      return;
    }
    // Sub-fase 14.4.2: bypass setCompany async pra evitar tela-branca quando
    // getCompanyById lança (network/race). Salva direto no localStorage que é
    // a source-of-truth do CompanyContext init, e o reload garante state
    // limpo. Antes: `await setCompany(id)` podia lançar e bloquear
    // `onCompanyChange()` → app ficava com state stale sem reload.
    try {
      localStorage.setItem('sistema_ponto_company_id', id);
    } catch (err) {
      console.error('CompanySwitcher: falha ao persistir company_id', err);
    }
    setOpen(false);
    onCompanyChange?.();
    // Não usa setCompany — onCompanyChange (window.location.reload no Layout)
    // re-monta CompanyProvider que lê localStorage e carrega corretamente.
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors min-h-[44px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline truncate max-w-[160px]">{company.display_name}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50 overflow-hidden"
            role="listbox"
          >
            {availableCompanies.map((c) => {
              const current = c.id === company.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-sm text-left hover:bg-gray-50 transition-colors ${
                    current ? 'bg-blue-50' : ''
                  }`}
                  role="option"
                  aria-selected={current}
                >
                  <span className={`truncate ${current ? 'font-medium text-blue-700' : 'text-gray-700'}`}>
                    {c.display_name}
                  </span>
                  {current && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
