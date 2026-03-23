import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, CheckCheck } from 'lucide-react';
import {
  getPendingApprovals,
  approveAttendance,
  rejectAttendance,
  bulkApproveAttendance,
  Attendance,
} from '../../services/database';
import toast from 'react-hot-toast';

interface AttendanceApprovalPanelProps {
  userId: string;
}

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'manual';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:  { label: '🟡 Pendente',  cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '✅ Aprovado',  cls: 'bg-green-100 text-green-800' },
  rejected: { label: '❌ Rejeitado', cls: 'bg-red-100 text-red-800' },
  manual:   { label: '📝 Manual',    cls: 'bg-gray-100 text-gray-700' },
};

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatHours(h: number | null): string {
  if (h == null) return '-';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins.toString().padStart(2, '0')}min`;
}

function formatDateBR(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** Verifica alertas de fraude num registro */
function fraudAlerts(att: Attendance): string[] {
  const alerts: string[] = [];
  if (att.entry_time) {
    // Converte UTC para Brasília (UTC-3) antes de checar o horário
    const utcH = new Date(att.entry_time).getUTCHours();
    const hBRT = (utcH - 3 + 24) % 24;
    if (hBRT < 5 || hBRT >= 23) alerts.push('Entrada fora do horário esperado (antes das 05h ou depois das 23h)');
  }
  if (att.hours_worked != null) {
    if (att.hours_worked < 4) alerts.push('Menos de 4h trabalhadas');
    if (att.hours_worked > 14) alerts.push('Mais de 14h trabalhadas');
  }
  return alerts;
}

export const AttendanceApprovalPanel: React.FC<AttendanceApprovalPanelProps> = ({ userId }) => {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getPendingApprovals(dateFilter || undefined);
      setRecords(data);
      setSelected(new Set());
    } catch {
      toast.error('Erro ao carregar registros pendentes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dateFilter]);

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      await approveAttendance(id, userId);
      toast.success('Registro aprovado!');
      load();
    } catch {
      toast.error('Erro ao aprovar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal || rejectReason.trim().length < 5) {
      toast.error('Informe um motivo (mínimo 5 caracteres)');
      return;
    }
    setActionLoading(true);
    try {
      await rejectAttendance(rejectModal.id, userId, rejectReason.trim());
      toast.success('Registro rejeitado');
      setRejectModal(null);
      setRejectReason('');
      load();
    } catch {
      toast.error('Erro ao rejeitar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      await bulkApproveAttendance(Array.from(selected), userId);
      toast.success(`${selected.size} registro(s) aprovado(s)!`);
      load();
    } catch {
      toast.error('Erro ao aprovar em lote');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map(r => r.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            Aprovações Pendentes
            {records.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                {records.length}
              </span>
            )}
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Limpar filtro
              </button>
            )}
            <button
              onClick={load}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <span className="text-sm text-green-800 font-medium">
              {selected.size} selecionado(s)
            </span>
            <button
              onClick={handleBulkApprove}
              disabled={actionLoading}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Aprovar Todos
            </button>
          </div>
        )}
      </div>

      {/* Lista de registros */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">Carregando...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-lg shadow text-center py-12">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Nenhum registro pendente</p>
          <p className="text-gray-400 text-sm mt-1">Tudo em dia!</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === records.length && records.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Funcionário</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entrada</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saída</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Noturnas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alertas</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map(att => {
                  const alerts = fraudAlerts(att);
                  const statusKey = (att.approval_status ?? 'pending') as ApprovalStatus;
                  const badge = STATUS_BADGE[statusKey] ?? STATUS_BADGE.pending;

                  return (
                    <tr key={att.id} className={`hover:bg-gray-50 ${selected.has(att.id) ? 'bg-green-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(att.id)}
                          onChange={() => toggleSelect(att.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {formatDateBR(att.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{att.employees?.name ?? '-'}</div>
                        <div className="text-xs text-gray-400">{att.employees?.cpf ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {formatTime(att.entry_time)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {formatTime(att.exit_time_full)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {formatHours(att.hours_worked)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {att.night_hours ? `${formatHours(att.night_hours)}` : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {alerts.length > 0 ? (
                          <div className="flex items-start gap-1">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              {alerts.map((a, i) => (
                                <p key={i} className="text-xs text-amber-700">{a}</p>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(att.id)}
                            disabled={actionLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-md hover:bg-green-200 disabled:opacity-50 transition-colors"
                            title="Aprovar"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Aprovar
                          </button>
                          <button
                            onClick={() => {
                              setRejectModal({ id: att.id, name: att.employees?.name ?? 'Funcionário' });
                              setRejectReason('');
                            }}
                            disabled={actionLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-md hover:bg-red-200 disabled:opacity-50 transition-colors"
                            title="Rejeitar"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Rejeitar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de rejeição */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Rejeitar registro — {rejectModal.name}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo da rejeição *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Descreva o motivo (mínimo 5 caracteres)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500 text-sm resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRejectConfirm}
                  disabled={actionLoading || rejectReason.trim().length < 5}
                  className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Rejeitando...' : 'Confirmar Rejeição'}
                </button>
                <button
                  onClick={() => setRejectModal(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
