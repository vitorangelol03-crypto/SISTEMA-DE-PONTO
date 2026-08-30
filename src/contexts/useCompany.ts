// Contexto de empresa + hook useCompany em arquivo SEM componentes.
// Motivo (30/08/2026, mesma família da sub-fase 14.4.9): a regra
// react-refresh/only-export-components exige que CompanyContext.tsx exporte
// só componentes — export de hook invalidava o Fast Refresh do módulo
// inteiro (full reload → duplicação de módulo → useCompany lançando
// "must be used inside <CompanyProvider>" com o Provider montado).
// CompanyContext.tsx fica só com o <CompanyProvider>; consumidores importam
// useCompany daqui.
import { createContext, useContext } from 'react';
import type { Company } from '../services/database';

export interface CompanyContextValue {
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

export const CompanyContext = createContext<CompanyContextValue | null>(null);

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error('useCompany must be used inside <CompanyProvider>');
  }
  return ctx;
}
