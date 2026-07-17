import React, { useState } from 'react';
import { Wallet, Trash2, Plus, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { addVale, updateVale, removeVale } from '../../services/driverPay';
import { getBrazilDate, formatDateBR } from '../../utils/dateUtils';
import { ModalShell } from './ModalShell';
import { DriverRowData, formatBRL } from './driverPayShared';

interface ValeModalProps {
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

export const ValeModal: React.FC<ValeModalProps> = ({ row, companyId, userId, readOnly, onClose, onChanged }) => {
  const [amount, setAmount] = useState('');
  const [valeDate, setValeDate] = useState(getBrazilDate());
  const [observation, setObservation] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const total = row.vales.reduce((s, v) => s + v.amount, 0);

  const resetForm = () => {
    setAmount('');
    setValeDate(getBrazilDate());
    setObservation('');
    setEditingId(null);
  };

  const startEdit = (v: (typeof row.vales)[number]) => {
    setEditingId(v.id);
    setAmount(String(v.amount).replace('.', ','));
    setValeDate(v.vale_date ?? getBrazilDate());
    setObservation(v.observation ?? '');
  };

  const handleAdd = async () => {
    const value = parseAmount(amount);
    if (value <= 0) {
      toast.error('Informe um valor de vale maior que zero');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updateVale(editingId, companyId, row.paymentId, userId, {
          amount: value,
          valeDate: valeDate || null,
          observation: observation.trim() || null,
        });
        toast.success('Vale atualizado');
      } else {
        await addVale(companyId, row.paymentId, value, valeDate || null, observation.trim() || null, userId);
        toast.success('Vale lançado');
      }
      resetForm();
      await onChanged();
    } catch (e) {
      console.error('Erro ao salvar vale:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar vale');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    try {
      await removeVale(id, row.paymentId, userId);
      toast.success('Vale removido');
      await onChanged();
    } catch (e) {
      console.error('Erro ao remover vale:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao remover vale');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      icon={<Wallet className="w-5 h-5" />}
      title="Vales / adiantamentos"
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
        {row.vales.length > 0 ? (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
            {row.vales.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-600">− {formatBRL(v.amount)}</div>
                  <div className="text-xs text-gray-500 break-words">
                    {v.vale_date ? formatDateBR(v.vale_date) : 'Sem data'}
                    {v.observation ? ` · ${v.observation}` : ''}
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(v)}
                      disabled={busy}
                      className="text-blue-600 hover:text-blue-800 disabled:opacity-40"
                      title="Editar vale"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(v.id)}
                      disabled={busy}
                      className="text-red-600 hover:text-red-800 disabled:opacity-40"
                      title="Remover vale"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
              <span className="text-xs font-medium text-gray-500">Total de vales</span>
              <span className="text-sm font-bold text-amber-600">− {formatBRL(total)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum vale lançado.</p>
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
                <label className="text-sm font-medium text-gray-700">Data</label>
                <input
                  type="date"
                  value={valeDate}
                  onChange={(e) => setValeDate(e.target.value)}
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
                placeholder="Ex.: Adiantamento combustível"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={busy}
                className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> {editingId ? 'Salvar edição' : 'Lançar vale'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={busy}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
