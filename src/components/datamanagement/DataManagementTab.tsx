import React, { useState, useEffect } from 'react';
import { Database, TrendingUp, Settings, Trash2, Download, AlertTriangle, CheckCircle, Clock, Calendar, Filter, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  getDataStatistics,
  getDataRetentionSettings,
  updateDataRetentionSettings,
  getAutoCleanupConfig,
  updateAutoCleanupConfig,
  previewCleanupData,
  deleteOldRecords,
  createCleanupLog,
  getCleanupLogs,
  getAllEmployees,
  getAttendanceHistory,
  getPayments,
  getErrorRecords,
  getBonuses,
  DataStatistics,
  DataRetentionSettings,
  AutoCleanupConfig,
  CleanupLog,
  Employee
} from '../../services/database';
import { format, subMonths } from 'date-fns';

interface DataManagementTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

export const DataManagementTab: React.FC<DataManagementTabProps> = ({ userId, hasPermission }) => {
  const [statistics, setStatistics] = useState<DataStatistics | null>(null);
  const [retentionSettings, setRetentionSettings] = useState<DataRetentionSettings[]>([]);
  const [autoCleanupConfig, setAutoCleanupConfig] = useState<AutoCleanupConfig | null>(null);
  const [cleanupLogs, setCleanupLogs] = useState<CleanupLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [previewCounts, setPreviewCounts] = useState<Record<string, number> | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [confirmStep, setConfirmStep] = useState(0);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generateBackup, setGenerateBackup] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [activeSection, setActiveSection] = useState<'overview' | 'retention' | 'manual' | 'automatic' | 'logs'>('overview');

  const dataTypeLabels: Record<string, string> = {
    attendance: 'Presenças',
    payments: 'Pagamentos',
    error_records: 'Registros de Erros',
    bonuses: 'Bonificações'
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [stats, retention, cleanup, logs, emps] = await Promise.all([
        getDataStatistics(),
        getDataRetentionSettings(),
        getAutoCleanupConfig(),
        getCleanupLogs(20),
        getAllEmployees()
      ]);

      setStatistics(stats);
      setRetentionSettings(retention);
      setAutoCleanupConfig(cleanup);
      setCleanupLogs(logs);
      setEmployees(emps);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar informações');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRetention = async (dataType: string, months: number) => {
    try {
      await updateDataRetentionSettings(dataType, months, userId);
      toast.success('Configuração atualizada com sucesso');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar configuração');
    }
  };

  const handleToggleAutoCleanup = async (enabled: boolean) => {
    if (!autoCleanupConfig) return;

    try {
      await updateAutoCleanupConfig({ ...autoCleanupConfig, is_enabled: enabled }, userId);
      toast.success(enabled ? 'Limpeza automática ativada' : 'Limpeza automática desativada');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar configuração');
    }
  };

  const handleUpdateAutoCleanup = async (frequency: string, time: string) => {
    if (!autoCleanupConfig) return;

    try {
      await updateAutoCleanupConfig(
        { ...autoCleanupConfig, frequency: frequency as any, preferred_time: time },
        userId
      );
      toast.success('Configuração atualizada com sucesso');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar configuração');
    }
  };

  const handlePreview = async () => {
    if (selectedDataTypes.length === 0) {
      toast.error('Selecione pelo menos um tipo de dado');
      return;
    }

    try {
      const counts = await previewCleanupData(
        selectedDataTypes,
        startDate,
        endDate,
        selectedEmployee
      );
      setPreviewCounts(counts);
      setShowPreview(true);
    } catch (error) {
      console.error('Erro ao gerar prévia:', error);
      toast.error('Erro ao gerar prévia');
    }
  };

  const handleGenerateBackup = async () => {
    try {
      const workbook = XLSX.utils.book_new();

      for (const dataType of selectedDataTypes) {
        let rawData: any[] = [];
        let formattedData: any[] = [];

        if (dataType === 'attendance') {
          rawData = await getAttendanceHistory(startDate, endDate, selectedEmployee);
          formattedData = rawData.map(item => ({
            'Nome do Funcionário': item.employees?.name || 'N/A',
            'CPF': item.employees?.cpf || 'N/A',
            'Data': format(new Date(item.date + 'T00:00:00'), 'dd/MM/yyyy'),
            'Status': item.status === 'present' ? 'Presente' : 'Falta',
            'Horário de Saída': item.exit_time || '-',
            'Marcado por': item.marked_by,
            'Data de Criação': format(new Date(item.created_at), 'dd/MM/yyyy HH:mm:ss')
          }));
        } else if (dataType === 'payments') {
          rawData = await getPayments(startDate, endDate, selectedEmployee);
          formattedData = rawData.map(item => ({
            'Nome do Funcionário': item.employees?.name || 'N/A',
            'CPF': item.employees?.cpf || 'N/A',
            'Data': format(new Date(item.date + 'T00:00:00'), 'dd/MM/yyyy'),
            'Taxa Diária (R$)': item.daily_rate.toFixed(2).replace('.', ','),
            'Bônus (R$)': item.bonus.toFixed(2).replace('.', ','),
            'Total (R$)': item.total.toFixed(2).replace('.', ','),
            'Criado por': item.created_by,
            'Data de Criação': format(new Date(item.created_at), 'dd/MM/yyyy HH:mm:ss'),
            'Última Atualização': format(new Date(item.updated_at), 'dd/MM/yyyy HH:mm:ss')
          }));
        } else if (dataType === 'error_records') {
          rawData = await getErrorRecords(startDate, endDate, selectedEmployee);
          formattedData = rawData.map(item => ({
            'Nome do Funcionário': item.employees?.name || 'N/A',
            'CPF': item.employees?.cpf || 'N/A',
            'Data': format(new Date(item.date + 'T00:00:00'), 'dd/MM/yyyy'),
            'Quantidade de Erros': item.error_count,
            'Observações': item.observations || '-',
            'Criado por': item.created_by,
            'Data de Criação': format(new Date(item.created_at), 'dd/MM/yyyy HH:mm:ss'),
            'Última Atualização': format(new Date(item.updated_at), 'dd/MM/yyyy HH:mm:ss')
          }));
        } else if (dataType === 'bonuses') {
          rawData = await getBonuses();
          if (startDate) {
            rawData = rawData.filter(b => b.date >= startDate);
          }
          if (endDate) {
            rawData = rawData.filter(b => b.date <= endDate);
          }
          formattedData = rawData.map(item => ({
            'Data': format(new Date(item.date + 'T00:00:00'), 'dd/MM/yyyy'),
            'Valor (R$)': item.amount.toFixed(2).replace('.', ','),
            'Criado por': item.created_by,
            'Data de Criação': format(new Date(item.created_at), 'dd/MM/yyyy HH:mm:ss')
          }));
        }

        if (formattedData.length > 0) {
          const worksheet = XLSX.utils.json_to_sheet(formattedData);

          // Ajustar largura das colunas
          const colWidths = Object.keys(formattedData[0]).map(key => {
            if (key.includes('Nome')) return { wch: 30 };
            if (key.includes('CPF')) return { wch: 15 };
            if (key.includes('Data')) return { wch: 12 };
            if (key.includes('Observações')) return { wch: 40 };
            return { wch: 18 };
          });
          worksheet['!cols'] = colWidths;

          XLSX.utils.book_append_sheet(workbook, worksheet, dataTypeLabels[dataType]);
        }
      }

      const filename = `backup_limpeza_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.xlsx`;
      XLSX.writeFile(workbook, filename);

      return filename;
    } catch (error) {
      console.error('Erro ao gerar backup:', error);
      throw error;
    }
  };

  const handleCleanup = async () => {
    if (confirmStep === 0) {
      setConfirmStep(1);
      return;
    }

    if (confirmStep === 1) {
      if (generateBackup) {
        try {
          await handleGenerateBackup();
          toast.success('Backup gerado com sucesso');
        } catch (error) {
          toast.error('Erro ao gerar backup');
          return;
        }
      }
      setConfirmStep(2);
      return;
    }

    if (confirmStep === 2) {
      if (confirmPassword !== userId) {
        toast.error('Senha incorreta');
        return;
      }

      try {
        setIsProcessing(true);
        const startTime = Date.now();
        const recordsDeleted: Record<string, number> = {};

        for (const dataType of selectedDataTypes) {
          const count = await deleteOldRecords(dataType, startDate, endDate, selectedEmployee, userId);
          recordsDeleted[dataType] = count;
        }

        const executionTime = Date.now() - startTime;
        const backupFilename = generateBackup ? `backup_limpeza_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.xlsx` : null;

        await createCleanupLog({
          user_id: userId,
          cleanup_type: 'manual',
          data_types_cleaned: selectedDataTypes,
          start_date: startDate || null,
          end_date: endDate || null,
          records_deleted: recordsDeleted,
          backup_generated: generateBackup,
          backup_filename: backupFilename,
          status: 'success',
          error_message: null,
          execution_time_ms: executionTime
        });

        const totalDeleted = Object.values(recordsDeleted).reduce((a, b) => a + b, 0);
        toast.success(`Limpeza concluída! ${totalDeleted} registros removidos`);

        setConfirmStep(0);
        setConfirmPassword('');
        setSelectedDataTypes([]);
        setStartDate('');
        setEndDate('');
        setSelectedEmployee('');
        setShowPreview(false);
        setPreviewCounts(null);

        loadData();
      } catch (error) {
        console.error('Erro ao executar limpeza:', error);
        toast.error('Erro ao executar limpeza');

        await createCleanupLog({
          user_id: userId,
          cleanup_type: 'manual',
          data_types_cleaned: selectedDataTypes,
          start_date: startDate || null,
          end_date: endDate || null,
          records_deleted: {},
          backup_generated: false,
          backup_filename: null,
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Erro desconhecido',
          execution_time_ms: null
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-6 h-6" />
            Gerenciamento de Dados
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Controle e otimize o armazenamento do banco de dados
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 pb-4">
        <button
          onClick={() => setActiveSection('overview')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
            activeSection === 'overview'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Visão Geral
        </button>
        <button
          onClick={() => setActiveSection('retention')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
            activeSection === 'retention'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Retenção de Dados
        </button>
        <button
          onClick={() => setActiveSection('manual')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
            activeSection === 'manual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Limpeza Manual
        </button>
        <button
          onClick={() => setActiveSection('automatic')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
            activeSection === 'automatic'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          Limpeza Automática
        </button>
        <button
          onClick={() => setActiveSection('logs')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
            activeSection === 'logs'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Histórico
        </button>
      </div>

      {activeSection === 'overview' && statistics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total de Registros</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {statistics.totalRecords.toLocaleString()}
                  </p>
                </div>
                <Database className="w-10 h-10 text-blue-600" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Presenças</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {statistics.attendance.count.toLocaleString()}
                  </p>
                  {statistics.attendance.oldestDate && (
                    <p className="text-xs text-gray-500 mt-1">
                      Mais antigo: {format(new Date(statistics.attendance.oldestDate), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
                <Clock className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pagamentos</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {statistics.payments.count.toLocaleString()}
                  </p>
                  {statistics.payments.oldestDate && (
                    <p className="text-xs text-gray-500 mt-1">
                      Mais antigo: {format(new Date(statistics.payments.oldestDate), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
                <Database className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Registros de Erros</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {statistics.error_records.count.toLocaleString()}
                  </p>
                  {statistics.error_records.oldestDate && (
                    <p className="text-xs text-gray-500 mt-1">
                      Mais antigo: {format(new Date(statistics.error_records.oldestDate), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Bonificações</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {statistics.bonuses.count.toLocaleString()}
                  </p>
                  {statistics.bonuses.oldestDate && (
                    <p className="text-xs text-gray-500 mt-1">
                      Mais antigo: {format(new Date(statistics.bonuses.oldestDate), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'retention' && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Configurações de Retenção de Dados
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            Defina por quanto tempo cada tipo de dado deve ser mantido no sistema
          </p>

          <div className="space-y-4">
            {retentionSettings.map((setting) => (
              <div key={setting.data_type} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{dataTypeLabels[setting.data_type]}</p>
                  <p className="text-sm text-gray-600">
                    Registros mantidos por {setting.retention_months} meses
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={setting.retention_months}
                    onChange={(e) => handleUpdateRetention(setting.data_type, parseInt(e.target.value))}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">meses</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'manual' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Limpeza Manual de Dados
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipos de Dados
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(dataTypeLabels).map(([key, label]) => (
                    <label key={key} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDataTypes.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDataTypes([...selectedDataTypes, key]);
                          } else {
                            setSelectedDataTypes(selectedDataTypes.filter(t => t !== key));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Inicial
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Final
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Funcionário Específico (opcional)
                </label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os funcionários</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handlePreview}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Visualizar Prévia
              </button>
            </div>
          </div>

          {showPreview && previewCounts && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Prévia da Limpeza
              </h3>

              <div className="space-y-2 mb-4">
                {Object.entries(previewCounts).map(([type, count]) => (
                  <div key={type} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{dataTypeLabels[type]}</span>
                    <span className="text-sm font-bold text-red-600">{count} registros serão removidos</span>
                  </div>
                ))}
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
                  <span className="text-sm font-bold text-gray-900">Total</span>
                  <span className="text-sm font-bold text-blue-600">
                    {Object.values(previewCounts).reduce((a, b) => a + b, 0)} registros
                  </span>
                </div>
              </div>

              {confirmStep === 0 && (
                <div className="space-y-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={generateBackup}
                      onChange={(e) => setGenerateBackup(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Gerar backup antes de excluir</span>
                  </label>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-900">Atenção!</p>
                        <p className="text-sm text-yellow-700 mt-1">
                          Esta ação é irreversível. Os dados serão permanentemente removidos do sistema.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCleanup}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Continuar
                  </button>
                </div>
              )}

              {confirmStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <Download className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">Backup e Confirmação</p>
                        <p className="text-sm text-blue-700 mt-1">
                          {generateBackup
                            ? 'Um backup será gerado automaticamente antes da exclusão.'
                            : 'Você optou por não gerar backup. Continue apenas se tiver certeza.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmStep(0)}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleCleanup}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              )}

              {confirmStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-900">Confirmação Final</p>
                        <p className="text-sm text-red-700 mt-1">
                          Digite seu ID de usuário para confirmar a operação
                        </p>
                      </div>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Digite seu ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setConfirmStep(0);
                        setConfirmPassword('');
                      }}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                      disabled={isProcessing}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCleanup}
                      disabled={isProcessing}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          Processando...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Confirmar Exclusão
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === 'automatic' && autoCleanupConfig && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Limpeza Automática
          </h3>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Status da Limpeza Automática</p>
                <p className="text-sm text-gray-600">
                  {autoCleanupConfig.is_enabled ? 'Ativada' : 'Desativada'}
                </p>
              </div>
              <button
                onClick={() => handleToggleAutoCleanup(!autoCleanupConfig.is_enabled)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  autoCleanupConfig.is_enabled
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {autoCleanupConfig.is_enabled ? 'Desativar' : 'Ativar'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frequência
              </label>
              <select
                value={autoCleanupConfig.frequency}
                onChange={(e) => handleUpdateAutoCleanup(e.target.value, autoCleanupConfig.preferred_time)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={!autoCleanupConfig.is_enabled}
              >
                <option value="daily">Diariamente</option>
                <option value="weekly">Semanalmente</option>
                <option value="monthly">Mensalmente</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Horário Preferencial
              </label>
              <input
                type="time"
                value={autoCleanupConfig.preferred_time}
                onChange={(e) => handleUpdateAutoCleanup(autoCleanupConfig.frequency, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={!autoCleanupConfig.is_enabled}
              />
            </div>

            {autoCleanupConfig.last_run && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900">Última execução</p>
                <p className="text-sm text-blue-700 mt-1">
                  {format(new Date(autoCleanupConfig.last_run), "dd/MM/yyyy 'às' HH:mm")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'logs' && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Histórico de Limpezas
          </h3>

          {cleanupLogs.length === 0 ? (
            <p className="text-gray-600 text-center py-8">Nenhuma limpeza realizada ainda</p>
          ) : (
            <div className="space-y-3">
              {cleanupLogs.map((log) => (
                <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {log.status === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                        )}
                        <span className="font-medium text-gray-900">
                          Limpeza {log.cleanup_type === 'manual' ? 'Manual' : 'Automática'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          log.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {log.status === 'success' ? 'Sucesso' : 'Erro'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {log.data_types_cleaned.map((type) => (
                          <span key={type} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                            {dataTypeLabels[type]}: {log.records_deleted[type] || 0} registros
                          </span>
                        ))}
                      </div>
                      {log.backup_generated && (
                        <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          Backup gerado: {log.backup_filename}
                        </p>
                      )}
                      {log.execution_time_ms && (
                        <p className="text-xs text-gray-500 mt-1">
                          Tempo de execução: {(log.execution_time_ms / 1000).toFixed(2)}s
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
