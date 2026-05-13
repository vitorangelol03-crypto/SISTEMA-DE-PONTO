// Sub-fase 14.4.9: helpers de empresa em arquivo dedicado pra permitir
// React Fast Refresh de CompanyContext.tsx (que agora exporta apenas
// CompanyProvider + useCompany — ambos compatíveis com Fast Refresh).
//
// Bug que motivou split: HMR detectava export non-component
// (getCurrentCompanyId) e invalidava o módulo inteiro → full reload com
// lazy components cacheando refs antigas do React context → useCompany
// lançava "must be used inside <CompanyProvider>" mesmo com Provider
// renderizado (refs de contextos diferentes).

import { DEFAULT_COMPANY_ID } from '../services/database';

const STORAGE_KEY = 'sistema_ponto_company_id';

/** Helper para uso em código que não pode ser hook (ex: handlers async,
 *  ErrorBoundary class component). Lê direto do localStorage com fallback. */
export function getCurrentCompanyId(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_COMPANY_ID;
}

export const COMPANY_STORAGE_KEY = STORAGE_KEY;
