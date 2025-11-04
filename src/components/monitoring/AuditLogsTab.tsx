import React, { useState, useEffect } from 'react';
import { FileText, Calendar, User, Filter, Download, Search } from 'lucide-react';
import { auditService, ActionType } from '../../services/auditService';
import { getUsers } from '../../services/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface AuditLogsTabProps {
  userId: string;
}

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
  view: 'Visualização',
  export: 'Exportação',
  import: 'Importação',
  login: 'Login',
  logout: 'Logout',
  bulk_action: 'Ação em Massa',
};

const MODULE_LABELS: Record<string, string> = {
  attendance: 'Ponto',
  employees: 'Funcionários',
  financial: 'Financeiro',
  users: 'Usuários',
  errors: 'Erros',
  reports: 'Relatórios',
  settings: 'Configurações',
  auth: 'Autenticação',
  c6payment: 'Pagamento C6',
  datamanagement: 'Gerenciamento de Dados',
};

export function AuditLogsTab({ userId }: AuditLogsTabProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    userId: '',
    module: '',
    actionType: '' as ActionType | '',
  });

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadUsers();
    loadData();
  }, [filters]);

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsData, statsData] = await Promise.all([
        auditService.getAuditLogs({
          startDate: filters.startDate,
          endDate: filters.endDate,
          userId: filters.userId || undefined,
          module: filters.module || undefined,
          actionType: (filters.actionType as ActionType) || undefined,
          limit: 100,
        }),
        auditService.getAuditStats(filters.startDate, filters.endDate),
      ]);
      setLogs(logsData);
      setStats(statsData);
    } catch (error: any) {
      toast.error('Erro ao carregar logs de auditoria');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.description?.toLowerCase().includes(term) ||
      log.module?.toLowerCase().includes(term) ||
      log.action_type?.toLowerCase().includes(term)
    );
  });

  const handleExport = () => {
    const exportData = filteredLogs.map((log) => ({
      'Data/Hora': format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }),
      Usuário: users.find((u) => u.id === log.user_id)?.id || 'Desconhecido',
      Ação: ACTION_TYPE_LABELS[log.action_type as ActionType] || log.action_type,
      Módulo: MODULE_LABELS[log.module] || log.module,
      Descrição: log.description,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    ws['!cols'] = [
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 50 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Logs de Auditoria');
    XLSX.writeFile(wb, `logs-auditoria-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    toast.success('Logs exportados com sucesso!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Logs de Auditoria</h2>
            <p className="text-sm text-gray-600">Registro completo de todas as ações do sistema</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Total de Ações</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalActions}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Módulos Ativos</p>
            <p className="text-2xl font-bold text-gray-900">
              {Object.keys(stats.actionsByModule).length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Tipos de Ação</p>
            <p className="text-2xl font-bold text-gray-900">
              {Object.keys(stats.actionsByType).length}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Data Inicial
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Data Final
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Usuário
            </label>
            <select
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Todos</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="w-4 h-4 inline mr-1" />
              Módulo
            </label>
            <select
              value={filters.module}
              onChange={(e) => setFilters({ ...filters, module: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Todos</option>
              {Object.entries(MODULE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="w-4 h-4 inline mr-1" />
              Tipo de Ação
            </label>
            <select
              value={filters.actionType}
              onChange={(e) => setFilters({ ...filters, actionType: e.target.value as ActionType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Todos</option>
              {Object.entries(ACTION_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descrição, módulo ou ação..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Carregando logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Nenhum log encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Data/Hora
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Usuário
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Ação
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Módulo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Descrição
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {users.find((u) => u.id === log.user_id)?.id || 'Desconhecido'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {ACTION_TYPE_LABELS[log.action_type as ActionType] || log.action_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {MODULE_LABELS[log.module] || log.module}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
