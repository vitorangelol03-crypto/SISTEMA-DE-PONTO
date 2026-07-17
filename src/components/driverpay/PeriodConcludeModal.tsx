import React, { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { DriverPaymentPeriod, concludePeriod, concludePeriodOnly } from '../../services/driverPay';
import { ModalShell } from './ModalShell';
import { formatBRL } from './driverPayShared';

interface PeriodConcludeModalProps {
  period: DriverPaymentPeriod;
  companyId: string;
  userId: string;
  totalNet: number;
  driverCount: number;
  onClose: () => void;
  onConcluded: (nextPeriodId: string) => void | Promise<void>;
  onConcludedOnly: () => void | Promise<void>;
}

export const PeriodConcludeModal: React.FC<PeriodConcludeModalProps> = ({
  period,
  companyId,
  userId,
  totalNet,
  driverCount,
  onClose,
  onConcluded,
  onConcludedOnly,
}) => {
  const [nextLabel, setNextLabel] = useState('');
  const [nextStart, setNextStart] = useState('');
  const [nextEnd, setNextEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConclude = async () => {
    if (!nextLabel.trim()) {
      toast.error('Informe o rótulo da próxima quinzena');
      return;
    }
    if (nextStart && nextEnd && nextStart > nextEnd) {
      toast.error('Data inicial da próxima quinzena deve ser anterior ou igual à final');
      return;
    }
    setSaving(true);
    try {
      const nextId = await concludePeriod(
        period.id,
        companyId,
        userId,
        nextLabel.trim(),
        nextStart || null,
        nextEnd || null,
      );
      toast.success('Período concluído e próxima quinzena aberta');
      await onConcluded(nextId);
      onClose();
    } catch (e) {
      console.error('Erro ao concluir período:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao concluir período');
    } finally {
      setSaving(false);
    }
  };

  const handleConcludeOnly = async () => {
    setSaving(true);
    try {
      await concludePeriodOnly(period.id, companyId, userId);
      toast.success('Quinzena concluída (sem abrir a próxima)');
      await onConcludedOnly();
      onClose();
    } catch (e) {
      console.error('Erro ao concluir período:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao concluir período');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      icon={<Check className="w-5 h-5" />}
      title="Concluir pagamento"
      subtitle={period.label}
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
            onClick={handleConcludeOnly}
            disabled={saving}
            className="px-4 py-2 border border-green-600 text-green-700 rounded-md hover:bg-green-50 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            Concluir sem abrir próxima
          </button>
          <button
            type="button"
            onClick={handleConclude}
            disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Concluindo…' : 'Concluir e abrir próxima'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md p-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <span>
            Ao concluir, esta quinzena fica <b>salva e travada</b> (não pode mais ser editada) e o sistema <b>abre a
            próxima</b> automaticamente com todos os drivers já carregados. Fica tudo no <b>histórico</b>.
          </span>
        </div>

        <div className="text-sm text-gray-700">
          Total desta quinzena:{' '}
          <b className={totalNet < 0 ? 'text-red-600' : 'text-green-600'}>{formatBRL(totalNet)}</b> · {driverCount}{' '}
          driver(s)
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Próxima quinzena</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Rótulo</label>
            <input
              type="text"
              value={nextLabel}
              onChange={(e) => setNextLabel(e.target.value)}
              placeholder="Ex.: 2ª Quinzena de Junho / 2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Data inicial (opcional)</label>
              <input
                type="date"
                value={nextStart}
                onChange={(e) => setNextStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Data final (opcional)</label>
              <input
                type="date"
                value={nextEnd}
                onChange={(e) => setNextEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
              />
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
