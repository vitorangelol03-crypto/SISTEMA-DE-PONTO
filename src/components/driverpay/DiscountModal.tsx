import React, { useState } from 'react';
import { Minus, Trash2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { addDiscount, removeDiscount } from '../../services/driverPay';
import { ModalShell } from './ModalShell';
import { DriverRowData, formatBRL } from './driverPayShared';

interface DiscountModalProps {
  row: DriverRowData;
  companyId: string;
  userId: string;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const parseAmount = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

export const DiscountModal: React.FC<DiscountModalProps> = ({
  row,
  companyId,
  userId,
  readOnly,
  onClose,
  onChanged,
}) => {
  const [amount, setAmount] = useState('');
  const [packageCode, setPackageCode] = useState('');
  const [observation, setObservation] = useState('');
  const [busy, setBusy] = useState(false);

  const total = row.discounts.reduce((s, d) => s + d.amount, 0);

  const handleAdd = async () => {
    const value = parseAmount(amount);
    if (value <= 0) {
      toast.error('Informe um valor de desconto maior que zero');
      return;
    }
    setBusy(true);
    try {
      await addDiscount(companyId, row.paymentId, value, packageCode.trim() || null, observation.trim() || null, userId);
      setAmount('');
      setPackageCode('');
      setObservation('');
      toast.success('Desconto lançado');
      await onChanged();
    } catch (e) {
      console.error('Erro ao lançar desconto:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao lançar desconto');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    try {
      await removeDiscount(id, row.paymentId, userId);
      toast.success('Desconto removido');
      await onChanged();
    } catch (e) {
      console.error('Erro ao remover desconto:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao remover desconto');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      icon={<Minus className="w-5 h-5" />}
      title="Descontos"
      subtitle={row.name}
      onClose={onClose}
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
      <div className="space-y-4">
        {row.discounts.length > 0 ? (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
            {row.discounts.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-red-600">− {formatBRL(d.amount)}</div>
                  <div className="text-xs text-gray-500 break-words">
                    {d.package_code ? `Pacote ${d.package_code}` : 'Sem ID de pacote'}
                    {d.observation ? ` · ${d.observation}` : ''}
                  </div>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemove(d.id)}
                    disabled={busy}
                    className="text-red-600 hover:text-red-800 disabled:opacity-40"
                    title="Remover desconto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
              <span className="text-xs font-medium text-gray-500">Total de descontos</span>
              <span className="text-sm font-bold text-red-600">− {formatBRL(total)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum desconto lançado.</p>
        )}

        {!readOnly && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">ID do pacote (opcional)</label>
                <input
                  type="text"
                  value={packageCode}
                  onChange={(e) => setPackageCode(e.target.value)}
                  placeholder="Ex.: 741412525252"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Observação (opcional)</label>
              <input
                type="text"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Motivo do desconto"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Lançar desconto
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
