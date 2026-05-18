import React, { useEffect, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { getFunctionRoles } from '../../services/database';

// Sentinelas pra evitar colisão com nomes reais de função
export const FUNCTION_ROLE_ALL = '__all__';
export const FUNCTION_ROLE_NONE = '__none__';

export type FunctionRoleFilterValue = string; // '__all__' | '__none__' | nome real

interface FunctionRoleFilterProps {
  value: FunctionRoleFilterValue;
  onChange: (value: FunctionRoleFilterValue) => void;
  companyId: string | undefined;
  className?: string;
  showLabel?: boolean;
}

/**
 * Dropdown que filtra por função (function_role).
 *
 * Opções:
 * - "Todas as funções" (default) — não filtra
 * - Cada função existente na empresa
 * - "Sem função" — funcionários sem function_role
 *
 * Carrega lista via getFunctionRoles. Multi-empresa: cada company vê só
 * suas funções.
 */
export default function FunctionRoleFilter({
  value,
  onChange,
  companyId,
  className = '',
  showLabel = true,
}: FunctionRoleFilterProps) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    getFunctionRoles(companyId)
      .then((roles) => {
        if (!cancelled) setOptions(roles);
      })
      .catch((err) => {
        console.error('Erro ao carregar funções:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return (
    <div className={className}>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <Briefcase className="inline w-4 h-4 mr-1" />
          Função
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="function-role-filter"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value={FUNCTION_ROLE_ALL}>Todas as funções</option>
        {options.map((role) => (
          <option key={role} value={role}>{role}</option>
        ))}
        <option value={FUNCTION_ROLE_NONE}>Sem função</option>
      </select>
    </div>
  );
}
