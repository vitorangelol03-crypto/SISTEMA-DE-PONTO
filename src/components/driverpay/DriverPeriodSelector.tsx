import React from 'react';
import { Check, Lock, History, Plus, ChevronDown } from 'lucide-react';
import type { DriverPaymentPeriod } from '../../services/driverPay';

interface DriverPeriodSelectorProps {
  periods: DriverPaymentPeriod[];
  selectedPeriodId: string | null;
  onSelect: (periodId: string) => void;
  onNewPeriod: () => void;
  onConclude: () => void;
  onHistory: () => void;
  canManagePeriods: boolean;
  canComplete: boolean;
  canViewHistory: boolean;
}

export const DriverPeriodSelector: React.FC<DriverPeriodSelectorProps> = ({
  periods,
  selectedPeriodId,
  onSelect,
  onNewPeriod,
  onConclude,
  onHistory,
  canManagePeriods,
  canComplete,
  canViewHistory,
}) => {
  const selected = periods.find((p) => p.id === selectedPeriodId) ?? null;
  const isConcluded = selected?.status === 'concluido';

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-wrap">
      <div className="inline-flex items-center gap-2 bg-white border border-gray-300 rounded-md px-3 py-2 min-h-[40px]">
        <span className="text-[11px] font-semibold text-gray-500">PERÍODO</span>
        <div className="relative inline-flex items-center">
          <select
            value={selectedPeriodId ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            disabled={periods.length === 0}
            className="appearance-none bg-transparent font-semibold text-gray-900 text-sm pr-6 focus:outline-none cursor-pointer disabled:text-gray-400"
          >
            {periods.length === 0 && <option value="">Nenhum período</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-0 pointer-events-none" />
        </div>
        {selected &&
          (isConcluded ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
              <Lock className="w-3.5 h-3.5" /> Concluído
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
              <Check className="w-3.5 h-3.5" /> Aberto
            </span>
          ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {canViewHistory && (
          <button
            type="button"
            onClick={onHistory}
            className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-2 min-h-[40px]"
          >
            <History className="w-4 h-4" /> Histórico
          </button>
        )}
        {canManagePeriods && (
          <button
            type="button"
            onClick={onNewPeriod}
            className="px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 inline-flex items-center gap-2 min-h-[40px]"
          >
            <Plus className="w-4 h-4" /> Novo período
          </button>
        )}
        {canComplete && (
          <button
            type="button"
            onClick={onConclude}
            disabled={!selected || isConcluded}
            title={isConcluded ? 'Período já concluído' : ''}
            className="px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 inline-flex items-center gap-2 min-h-[40px] disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" /> Concluir
          </button>
        )}
      </div>
    </div>
  );
};
