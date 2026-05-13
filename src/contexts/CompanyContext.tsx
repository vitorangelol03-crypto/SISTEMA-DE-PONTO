import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCompanyById, getCompanies, DEFAULT_COMPANY_ID, type Company } from '../services/database';
import { COMPANY_STORAGE_KEY } from './companyHelpers';

const STORAGE_KEY = COMPANY_STORAGE_KEY;

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

// Sub-fase 14.4.3: valida UUID antes de query. localStorage poluído com
// string não-UUID fazia getCompanyById lançar PostgREST 22P02 (invalid_text_
// representation), bloqueando o init inteiro e deixando company=null →
// EmployeesTab.early-return → lista vazia silenciosa. Reportado por Victor
// em UI manual test.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s: string | null): s is string {
  return Boolean(s && UUID_RE.test(s));
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompanyState] = useState<Company | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar empresa inicial: localStorage → DEFAULT (com validação UUID
  // pra evitar crash em getCompanyById quando localStorage está poluído).
  useEffect(() => {
    const init = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const companyId = isValidUuid(stored) ? stored : DEFAULT_COMPANY_ID;
        // Se localStorage tinha lixo, persistir DEFAULT imediatamente pra
        // evitar bug repetir no próximo init.
        if (stored && !isValidUuid(stored)) {
          console.warn('CompanyContext: localStorage tinha company_id inválido', stored, '→ DEFAULT');
          localStorage.setItem(STORAGE_KEY, DEFAULT_COMPANY_ID);
        }
        // Paraleliza as duas chamadas iniciais — reduz tempo de boot e
        // janela de flake em testes E2E que disparam imediatamente após mount.
        const [c, all] = await Promise.all([
          getCompanyById(companyId),
          getCompanies(),
        ]);
        if (c) {
          setCompanyState(c);
        } else {
          // Fallback: stored ID valid-format mas inexistente no DB → usa DEFAULT
          const fallback = await getCompanyById(DEFAULT_COMPANY_ID);
          setCompanyState(fallback);
          if (fallback) localStorage.setItem(STORAGE_KEY, fallback.id);
        }
        setAvailableCompanies(all);
      } catch (e) {
        console.error('CompanyContext init error', e);
        // Último fallback: tenta DEFAULT mesmo após erro
        try {
          const fallback = await getCompanyById(DEFAULT_COMPANY_ID);
          if (fallback) {
            setCompanyState(fallback);
            localStorage.setItem(STORAGE_KEY, fallback.id);
          }
        } catch (e2) {
          console.error('CompanyContext fallback também falhou', e2);
        }
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

// Sub-fase 14.4.9: getCurrentCompanyId movido pra ./companyHelpers.ts
// (export incompatível com React Fast Refresh estava invalidando HMR
// → page reload → module duplication → useCompany lançava "must be
// used inside Provider" mesmo com Provider montado). Import direto:
//   import { getCurrentCompanyId } from './contexts/companyHelpers';
