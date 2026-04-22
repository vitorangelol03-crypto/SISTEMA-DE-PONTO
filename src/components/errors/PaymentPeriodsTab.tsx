import React, { useEffect, useState } from 'react';
import { Calendar, Plus, CheckCircle2, Lock, RefreshCw, Settings } from 'lucide-react';
import {
  getPaymentPeriods,
  createPaymentPeriod,
  closePaymentPeriod,
  getPaymentPeriodConfig,
  setPaymentPeriodAutoWeekly,
  autoCreateWeeklyPeriod,
  PaymentPeriod,
} from '../../services/database';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import toast from 'react-hot-toast';

interface PaymentPeriodsTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

export const PaymentPeriodsTab: React.FC<PaymentPeriodsTabProps> = ({ userId }) => {
  const [periods, setPeriods] = useState<PaymentPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoWeekly, setAutoWeekly] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
    paymentDate: getBrazilDate(),
    label: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [list, cfg] = await Promise.all([getPaymentPeriods(), getPaymentPeriodConfig()]);
      setPeriods(list);
      setAutoWeekly(cfg.auto_weekly);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar períodos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.startDate > formData.endDate) {
      toast.error('Data inicial deve ser anterior à final');
      return;
    }
    setSaving(true);
    try {
      await createPaymentPeriod(
        formData.startDate,
        formData.endDate,
        formData.paymentDate,
        formData.label.trim() || null,
        userId
      );
      toast.success('Período criado');
      setShowForm(false);
      setFormData({ startDate: getBrazilDate(), endDate: getBrazilDate(), paymentDate: getBrazilDate(), label: '' });
      load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao criar período');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (periodId: string) => {
    if (!confirm('Fechar este período? Status passará a "Pago".')) return;
    try {
      await closePaymentPeriod(periodId);
      toast.success('Período fechado');
      load();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao fechar período');
    }
  };

  const handleCloseCurrent = async () => {
    const today = getBrazilDate();
    const current = periods.find(p => p.status === 'open' && p.start_date <= today && p.end_date >= today);
    if (!current) {
      toast.error('Não há período aberto para hoje');
      return;
    }
    if (!confirm(`Fechar o período atual (${formatDateBR(current.start_date)} a ${formatDateBR(current.end_date)})?`)) return;
    try {
      await closePaymentPeriod(current.id);
      toast.success('Período atual fechado');
      load();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao fechar');
    }
  };

  const handleToggleAuto = async () => {
    try {
      const next = !autoWeekly;
      await setPaymentPeriodAutoWeekly(next, userId);
      setAutoWeekly(next);
      toast.success(next ? 'Criação automática ativada' : 'Criação automática desativada');
      if (next) {
        await autoCreateWeeklyPeriod();
        load();
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar configuração');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-base sm:text-lg font-semibold flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-purple-600" />
            Períodos de Pagamento
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleCloseCurrent}
              className="px-3 py-2 text-sm bg-orange-50 text-orange-700 rounded-md hover:bg-orange-100 flex items-center justify-center gap-1 min-h-[44px]"
            >
              <Lock className="w-4 h-4" />
              Fechar período atual
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center justify-center gap-1 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Novo Período
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-md mb-4">
          <Settings className="w-5 h-5 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Criar períodos semanais automaticamente</p>
            <p className="text-xs text-blue-700">Segunda a domingo; fecha períodos vencidos ao abrir o sistema.</p>
          </div>
          <button
            onClick={handleToggleAuto}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
              autoWeekly ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block w-5 h-5 transform bg-white rounded-full transition-transform ${
                autoWeekly ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {periods.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">Nenhum período criado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Período</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pagamento</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {periods.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-800">{p.label || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {formatDateBR(p.start_date)} a {formatDateBR(p.end_date)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{formatDateBR(p.payment_date)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {p.status === 'open' ? '🟡 Aberto' : '✅ Pago'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.status === 'open' && (
                        <button
                          onClick={() => handleClose(p.id)}
                          className="text-sm text-orange-600 hover:text-orange-800 flex items-center gap-1 ml-auto"
                          title="Fechar período"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Fechar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl max-w-[95vw] sm:max-w-md w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-medium flex items-center">
                <Plus className="w-5 h-5 mr-2 text-purple-600" />
                Novo Período de Pagamento
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Início *</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={e => setFormData(p => ({ ...p, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fim *</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={e => setFormData(p => ({ ...p, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data do Pagamento *</label>
                <input
                  type="date"
                  value={formData.paymentDate}
                  onChange={e => setFormData(p => ({ ...p, paymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label (opcional)</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={e => setFormData(p => ({ ...p, label: e.target.value }))}
                  placeholder="Ex: Semana 16"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 min-h-[44px]"
                >
                  {saving ? 'Salvando...' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 min-h-[44px]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
