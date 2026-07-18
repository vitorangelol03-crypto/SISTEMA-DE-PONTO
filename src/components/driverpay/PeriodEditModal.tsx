import React, { useState } from 'react';
import { Pencil, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { updatePeriod, deletePeriod, type DriverPaymentPeriod } from '../../services/driverPay';
import { ModalShell } from './ModalShell';

interface PeriodEditModalProps {
  period: DriverPaymentPeriod;
  companyId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  /** Abre ja na confirmacao de exclusao (quando veio pelo botao "Excluir"). */
  initialConfirmDelete?: boolean;
}

/** Editar (rotulo/datas) e Excluir uma quinzena. So o mestre 2626 chega aqui. */
export const PeriodEditModal: React.FC<PeriodEditModalProps> = ({
  period,
  companyId,
  userId,
  onClose,
  onSaved,
  onDeleted,
  initialConfirmDelete,
}) => {
  const [label, setLabel] = useState(period.label);
  const [start, setStart] = useState(period.start_date ?? '');
  const [end, setEnd] = useState(period.end_date ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(initialConfirmDelete ?? false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error('Informe o rótulo da quinzena');
      return;
    }
    if (start && end && start > end) {
      toast.error('Data inicial deve ser anterior ou igual à final');
      return;
    }
    setSaving(true);
    try {
      await updatePeriod(period.id, companyId, userId, { label: label.trim(), start: start || null, end: end || null });
      toast.success('Quinzena atualizada');
      await onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar quinzena');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePeriod(period.id, companyId, userId);
      toast.success('Quinzena excluída');
      await onDeleted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir quinzena');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell
      icon={<Pencil className="w-5 h-5" />}
      title="Editar quinzena"
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
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium min-h-[40px] disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Rótulo</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Rótulo da quinzena"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Data inicial (opcional)</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Data final (opcional)</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
            />
          </div>
        </div>

        {/* Zona de exclusão */}
        <div className="border-t border-gray-200 pt-4">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" /> Excluir esta quinzena
            </button>
          ) : (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-red-800">
                  Excluir <b>"{period.label}"</b> apaga a quinzena e <b>todos os lançamentos</b> dela (pacotes,
                  descontos, vales). Não dá pra desfazer.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Excluir definitivamente
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
