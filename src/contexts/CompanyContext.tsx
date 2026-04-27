import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCompanyById, getCompanies, DEFAULT_COMPANY_ID, type Company } from '../services/database';

const STORAGE_KEY = 'sistema_ponto_company_id';

interface CompanyContextValue {
  // Empresa atual (null durante carregamento inicial)
  company: Company | null;
  // Lista de empresas disponíveis (apenas usado por admin)
  availableCompanies: Company[];
  // Trocar empresa (apenas admin pode chamar)
  setCompany: (companyId: string) => Promise<void>;
  // Loading state
  loading: boolean;
  // Indica se está pronto para uso
  ready: boolean;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompanyState] = useState<Company | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar empresa inicial: localStorage → DEFAULT
  useEffect(() => {
    const init = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const companyId = stored || DEFAULT_COMPANY_ID;
        // Paraleliza as duas chamadas iniciais — reduz tempo de boot e
        // janela de flake em testes E2E que disparam imediatamente após mount.
        const [c, all] = await Promise.all([
          getCompanyById(companyId),
          getCompanies(),
        ]);
        if (c) {
          setCompanyState(c);
        } else {
          // Fallback: stored ID inválido, usa DEFAULT
          const fallback = await getCompanyById(DEFAULT_COMPANY_ID);
          setCompanyState(fallback);
          if (fallback) localStorage.setItem(STORAGE_KEY, fallback.id);
        }
        setAvailableCompanies(all);
      } catch (e) {
        console.error('CompanyContext init error', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const setCompany = async (companyId: string) => {
    const c = await getCompanyById(companyId);
    if (c) {
      setCompanyState(c);
      localStorage.setItem(STORAGE_KEY, c.id);
    }
  };

  return (
    <CompanyContext.Provider value={{
      company,
      availableCompanies,
      setCompany,
      loading,
      ready: !loading && company !== null,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error('useCompany must be used inside <CompanyProvider>');
  }
  return ctx;
}

// Helper para uso em código que não pode ser hook
// (ex: handlers async). Lê direto do localStorage com fallback.
export function getCurrentCompanyId(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_COMPANY_ID;
}
