import React from 'react';
import { Users } from 'lucide-react';

export type EmploymentType = 'all' | 'Diarista' | 'Carteira Assinada';

interface EmploymentTypeFilterProps {
  value: EmploymentType;
  onChange: (value: EmploymentType) => void;
  className?: string;
  showLabel?: boolean;
}

export default function EmploymentTypeFilter({
  value,
  onChange,
  className = '',
  showLabel = true,
}: EmploymentTypeFilterProps) {
  return (
    <div className={className}>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <Users className="inline w-4 h-4 mr-1" />
          Tipo de Vínculo
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as EmploymentType)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">Todos os Funcionários</option>
        <option value="Diarista">Diaristas</option>
        <option value="Carteira Assinada">Carteira Assinada</option>
      </select>
    </div>
  );
}

export function EmploymentTypeBadge({ type }: { type?: string }) {
  if (!type) return null;

  const isDiarist = type === 'Diarista';
  const bgColor = isDiarist ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${bgColor} font-medium`}>
      {type}
    </span>
  );
}
