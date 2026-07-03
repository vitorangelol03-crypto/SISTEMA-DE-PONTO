import React from 'react';
import { History, Check, Lock, ChevronRight } from 'lucide-react';
import type { DriverPaymentPeriod } from '../../services/driverPay';
import { formatDateBR } from '../../utils/dateUtils';
import { ModalShell } from './ModalShell';

interface DriverPaymentHistoryProps {
  periods: DriverPaymentPeriod[];
  selectedPeriodId: string | null;
  onSelect: (periodId: string) => void;
  onClose: () => void;
}

export const DriverPaymentHistory: React.FC<DriverPaymentHistoryProps> = ({
  periods,
  selectedPeriodId,
  onSelect,
  onClose,
}) => {
  return (
    <ModalShell
      icon={<History className="w-5 h-5" />}
      title="Histórico de períodos"
      subtitle="Abrir uma quinzena para visualizar. As concluídas ficam somente leitura."
      onClose={onClose}
      maxWidth="sm:max-w-xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
        >
          Fechar
        </button>
      }
    >
      {periods.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum período registrado ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {periods.map((p) => {
            const isConcluded = p.status === 'concluido';
            const isSelected = p.id === selectedPeriodId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    onClose();
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 break-words">{p.label}</div>
                    <div className="text-xs text-gray-500">
                      {p.start_date ? formatDateBR(p.start_date) : '—'} a {p.end_date ? formatDateBR(p.end_date) : '—'}
                    </div>
                  </div>
                  {isConcluded ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 flex-shrink-0">
                      <Lock className="w-3.5 h-3.5" /> Concluído
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 flex-shrink-0">
                      <Check className="w-3.5 h-3.5" /> Aberto
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
};
