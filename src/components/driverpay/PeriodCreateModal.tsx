import React, { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPeriod } from '../../services/driverPay';
import { ModalShell } from './ModalShell';

interface PeriodCreateModalProps {
  companyId: string;
  userId: string;
  onClose: () => void;
  onCreated: (periodId: string) => void | Promise<void>;
}

export const PeriodCreateModal: React.FC<PeriodCreateModalProps> = ({ companyId, userId, onClose, onCreated }) => {
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [preload, setPreload] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!label.trim()) {
      toast.error('Informe o rótulo do período (ex.: 1ª Quinzena de Junho / 2026)');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast.error('Data inicial deve ser anterior ou igual à final');
      return;
    }
    setSaving(true);
    try {
      const periodId = await createPeriod(companyId, userId, label.trim(), startDate || null, endDate || null, preload);
      toast.success('Período criado');
      await onCreated(periodId);
      onClose();
    } catch (e) {
      console.error('Erro ao criar período:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao criar período');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      icon={<CalendarPlus className="w-5 h-5" />}
      title="Novo período"
      subtitle="Abrir uma nova quinzena de pagamentos"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium min-h-[40px] disabled:opacity-50"
          >
            {saving ? 'Criando…' : 'Criar período'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Rótulo do período</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex.: 1ª Quinzena de Junho / 2026"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Data inicial (opcional)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Data final (opcional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={preload}
            onChange={(e) => setPreload(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded border-gray-300"
          />
          Carregar automaticamente todos os drivers ativos neste período
        </label>
      </div>
    </ModalShell>
  );
};
