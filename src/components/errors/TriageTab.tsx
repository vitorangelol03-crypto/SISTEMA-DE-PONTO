import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Trash2, RefreshCw, Calculator, CheckCircle2 } from 'lucide-react';
import {
  getTriageErrors,
  upsertTriageError,
  deleteTriageError,
  computeTriageDistribution,
  distributeTriageErrors,
  TriageError,
  TriageDistributionPreview,
} from '../../services/database';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import toast from 'react-hot-toast';

interface TriageTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

interface Preview extends TriageDistributionPreview {
  valuePerError: number;
}

export const TriageTab: React.FC<TriageTabProps> = ({ userId, hasPermission }) => {
  const [records, setRecords] = useState<TriageError[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    date: getBrazilDate(),
    errorCount: '',
    observations: '',
  });
  const [saving, setSaving] = useState(false);

  const [distRange, setDistRange] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
  });
  const [valuePerError, setValuePerError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadRecords = React.useCallback(async () => {
    try {
      setLoading(true);
      const today = getBrazilDate();
      const [y, m] = today.split('-').map(Number);
      const first = `${today.slice(0, 7)}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const last = `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
      const data = await getTriageErrors(first, last);
      setRecords(data);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar registros de triagem');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('errors.createTriage')) {
      toast.error('Sem permissão para registrar erros de triagem');
      return;
    }
    const count = parseInt(formData.errorCount);
    if (isNaN(count) || count < 0) {
      toast.error('Quantidade inválida');
      return;
    }
    setSaving(true);
    try {
      await upsertTriageError(
        formData.date,
        count,
        formData.observations.trim() || null,
        userId
      );
      toast.success('Erro de triagem registrado');
      setFormData({ date: getBrazilDate(), errorCount: '', observations: '' });
      loadRecords();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission('errors.createTriage')) {
      toast.error('Sem permissão para excluir');
      return;
    }
    if (!confirm('Excluir este registro de triagem?')) return;
    try {
      await deleteTriageError(id, userId);
      toast.success('Registro excluído');
      loadRecords();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir');
    }
  };

  const handleCalculate = async () => {
    if (!hasPermission('errors.distributeTriage')) {
      toast.error('Sem permissão para distribuir erros');
      return;
    }
    if (distRange.startDate > distRange.endDate) {
      toast.error('Data inicial deve ser anterior à final');
      return;
    }
    const value = parseFloat(valuePerError.replace(',', '.'));
    if (isNaN(value) || value <= 0) {
      toast.error('Informe um valor por erro válido');
      return;
    }

    setCalculating(true);
    try {
      const result = await computeTriageDistribution(distRange.startDate, distRange.endDate, value);

      if (result.totalErrors <= 0) {
        toast.error('Nenhum erro de triagem no período');
        setPreview(null);
        return;
      }
      if (result.perEmployee.length === 0) {
        toast.error('Nenhum funcionário presente nos dias com erro');
        setPreview(null);
        return;
      }

      setPreview({ ...result, valuePerError: value });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao calcular');
    } finally {
      setCalculating(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    if (!hasPermission('errors.distributeTriage')) {
      toast.error('Sem permissão para distribuir erros');
      return;
    }
    if (!confirm(`Confirmar distribuição? R$ ${preview.totalDeducted.toFixed(2).replace('.', ',')} serão descontados de ${preview.perEmployee.length} funcionários.`)) {
      return;
    }
    setConfirming(true);
    try {
      const result = await distributeTriageErrors(
        distRange.startDate,
        distRange.endDate,
        preview.valuePerError,
        userId
      );
      toast.success(
        `Distribuição realizada! R$ ${result.totalDeducted.toFixed(2).replace('.', ',')} descontados de ${result.totalEmployees} funcionários`
      );
      setPreview(null);
      setValuePerError('');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao distribuir');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-orange-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Plus className="w-5 h-5 mr-2 text-orange-600" />
          Registrar Erros de Triagem
        </h3>

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade *</label>
            <input
              type="number"
              min="0"
              value={formData.errorCount}
              onChange={(e) => setFormData(p => ({ ...p, errorCount: e.target.value }))}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
            <input
              type="text"
              value={formData.observations}
              onChange={(e) => setFormData(p => ({ ...p, observations: e.target.value }))}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={saving || !hasPermission('errors.createTriage')}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <h4 className="font-medium text-gray-900 mb-2">Registros do mês atual:</h4>
          {records.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum registro neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Erros</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Observação</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {records.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">{formatDateBR(r.date)}</td>
                      <td className="px-4 py-2 text-sm font-medium text-red-600">{r.error_count}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{r.observations || '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {hasPermission('errors.createTriage') && (
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
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
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Calculator className="w-5 h-5 mr-2 text-blue-600" />
          Distribuição de Erros
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
            <input
              type="date"
              value={distRange.startDate}
              onChange={(e) => { setDistRange(p => ({ ...p, startDate: e.target.value })); setPreview(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
            <input
              type="date"
              value={distRange.endDate}
              onChange={(e) => { setDistRange(p => ({ ...p, endDate: e.target.value })); setPreview(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor por erro (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={valuePerError}
              onChange={(e) => { setValuePerError(e.target.value); setPreview(null); }}
              placeholder="0,00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <button
              onClick={handleCalculate}
              disabled={calculating || !hasPermission('errors.distributeTriage')}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {calculating ? 'Calculando...' : 'Calcular'}
            </button>
          </div>
        </div>

        {preview && (
          <div className="mt-6 border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 text-sm">
              <div>
                <div className="text-gray-600">Total de erros</div>
                <div className="text-xl font-bold text-red-600">{preview.totalErrors}</div>
              </div>
              <div>
                <div className="text-gray-600">Dias com registro</div>
                <div className="text-xl font-bold text-gray-900">{preview.days}</div>
              </div>
              <div>
                <div className="text-gray-600">Funcionários atingidos</div>
                <div className="text-xl font-bold text-gray-900">{preview.totalEmployees}</div>
              </div>
              <div>
                <div className="text-gray-600">Valor por erro</div>
                <div className="text-xl font-bold text-orange-600">R$ {preview.valuePerError.toFixed(2).replace('.', ',')}</div>
              </div>
            </div>

            <div className="bg-white rounded-md p-3 mb-4 max-h-48 overflow-y-auto">
              <div className="text-sm font-medium mb-2">Detalhamento por dia:</div>
              <div className="space-y-1">
                {preview.perDay.map(d => {
                  const dateBR = d.date.split('-').reverse().join('/');
                  return (
                    <div key={d.date} className="text-sm py-1 border-b border-gray-100 last:border-b-0 flex justify-between">
                      <span className="text-gray-800">Dia {dateBR}</span>
                      <span className="text-gray-600">
                        {d.errors} erros ÷ {d.present} presentes = <span className="font-semibold text-orange-600">{d.errorsPerPerson} erros/pessoa</span>
                        {d.remainder > 0 && <span className="text-xs text-gray-500 ml-1">(resto: {d.remainder})</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-md p-3 mb-4 max-h-64 overflow-y-auto">
              <div className="text-sm font-medium mb-2">Preview da distribuição:</div>
              <div className="space-y-1">
                {preview.perEmployee.map(emp => (
                  <div key={emp.employee_id} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-b-0">
                    <span className="text-gray-800">{emp.name}</span>
                    <span className="text-gray-600">
                      {emp.days_present} dias · {emp.total_errors} erros · <span className="font-semibold text-red-600">-R$ {emp.value_deducted.toFixed(2).replace('.', ',')}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-gray-600">Total a descontar: </span>
                <span className="text-xl font-bold text-red-600">
                  R$ {preview.totalDeducted.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {confirming ? 'Distribuindo...' : 'Confirmar Distribuição'}
              </button>
            </div>
          </div>
        )}

        {!preview && !hasPermission('errors.distributeTriage') && (
          <div className="mt-4 text-sm text-gray-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Você não tem permissão para distribuir erros de triagem.
          </div>
        )}
      </div>
    </div>
  );
};
