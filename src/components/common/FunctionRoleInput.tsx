import React, { useEffect, useId, useState } from 'react';
import { getFunctionRoles } from '../../services/database';

interface FunctionRoleInputProps {
  value: string;
  onChange: (value: string) => void;
  companyId: string | undefined;
  placeholder?: string;
  className?: string;
}

/**
 * Input de função com autocomplete via <datalist> nativo.
 *
 * Comportamento:
 * - Carrega lista distinta de function_role da empresa no mount
 * - Permite digitar valor novo (não fecha o conjunto)
 * - Sugere conforme o usuário digita (handled pelo browser)
 *
 * Sem mudança de schema: funcao continua salva como text livre em
 * employees.function_role.
 */
export const FunctionRoleInput: React.FC<FunctionRoleInputProps> = ({
  value,
  onChange,
  companyId,
  placeholder,
  className,
}) => {
  const [options, setOptions] = useState<string[]>([]);
  const datalistId = useId();

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getFunctionRoles(companyId)
      .then((roles) => {
        if (!cancelled) setOptions(roles);
      })
      .catch((err) => {
        console.error('Erro ao carregar funções existentes:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return (
    <>
      <input
        type="text"
        list={datalistId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      <datalist id={datalistId}>
        {options.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
    </>
  );
};
