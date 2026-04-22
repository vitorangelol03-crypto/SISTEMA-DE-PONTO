import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Search, CreditCard as Edit2, Trash2, RefreshCw, TrendingUp, TrendingDown, Calendar, Users, Target, Package, FileSearch } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getAllEmployees, getAttendanceHistory, getErrorRecords, upsertErrorRecord, deleteErrorRecord, getErrorStatistics, Employee, Attendance, ErrorRecord, ErrorType } from '../../services/database';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import { formatCPF } from '../../utils/validation';
import toast from 'react-hot-toast';
import EmploymentTypeFilter, { EmploymentType, EmploymentTypeBadge } from '../common/EmploymentTypeFilter';
import { TriageTab } from './TriageTab';
import { PaymentPeriodsTab } from './PaymentPeriodsTab';

interface ErrorsTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

interface EmployeeWithErrors {
  employee: Employee;
  workDays: number;
  totalErrors: number;
  errorRate: number;
  errorRecords: ErrorRecord[];
}

export const ErrorsTab: React.FC<ErrorsTabProps> = ({ userId, hasPermission }) => {
  const [activeSubTab, setActiveSubTab] = useState<'individual' | 'triage' | 'periods'>('individual');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [errorRecords, setErrorRecords] = useState<ErrorRecord[]>([]);
  const [employeesWithErrors, setEmployeesWithErrors] = useState<EmployeeWithErrors[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeWithErrors[]>([]);
  
  const [filters, setFilters] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
    employeeId: '',
    employmentType: 'all' as EmploymentType
  });
  
  const [isEditingDate, setIsEditingDate] = useState({
    startDate: false,
    endDate: false
  });
  
  const [showErrorForm, setShowErrorForm] = useState(false);
  const [editingError, setEditingError] = useState<{employeeId: string, date: string} | null>(null);
  const [errorFormData, setErrorFormData] = useState({
    employeeId: '',
    date: getBrazilDate(),
    errorType: 'quantity' as ErrorType,
    errorCount: '',
    errorValue: '',
    observations: ''
  });

  const [statistics, setStatistics] = useState({
    totalErrors: 0,
    totalQuantityErrors: 0,
    totalValueErrors: 0,
    employeeStats: [] as Array<{
      employee: Employee;
      totalErrors: number;
      workDays: number;
      errorRate: number;
    }>
  });

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const employmentType = filters.employmentType === 'all' ? undefined : filters.employmentType;
      const [employeesData, attendancesData, errorRecordsData, statsData] = await Promise.all([
        getAllEmployees(employmentType),
        getAttendanceHistory(filters.startDate, filters.endDate, filters.employeeId, undefined, employmentType),
        getErrorRecords(filters.startDate, filters.endDate, filters.employeeId, employmentType),
        getErrorStatistics(filters.startDate, filters.endDate)
      ]);

      setEmployees(employeesData);
      setErrorRecords(errorRecordsData);
      setStatistics(statsData);

      processEmployeeErrorData(employeesData, attendancesData, errorRecordsData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de erros');
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.employeeId, filters.employmentType]);

  const processEmployeeErrorData = (
    employeesData: Employee[], 
    attendancesData: Attendance[], 
    errorRecordsData: ErrorRecord[]
  ) => {
    // Filtrar apenas funcionários que trabalharam no período
    const workingEmployees = employeesData.filter(employee => 
      attendancesData.some(att => att.employee_id === employee.id && att.status === 'present')
    );

    const employeesWithErrorsData: EmployeeWithErrors[] = workingEmployees.map(employee => {
      const employeeAttendances = attendancesData.filter(att => 
        att.employee_id === employee.id && att.status === 'present'
      );
      const employeeErrors = errorRecordsData.filter(err => err.employee_id === employee.id);
      const totalErrors = employeeErrors.reduce((sum, err) => sum + err.error_count, 0);
      const workDays = employeeAttendances.length;
      const errorRate = workDays > 0 ? (totalErrors / workDays) : 0;

      return {
        employee,
        workDays,
        totalErrors,
        errorRate,
        errorRecords: employeeErrors
      };
    });

    // Ordenar por taxa de erro (maior para menor)
    employeesWithErrorsData.sort((a, b) => b.errorRate - a.errorRate);
    
    setEmployeesWithErrors(employeesWithErrorsData);
    setFilteredEmployees(employeesWithErrorsData);
  };

  useEffect(() => {
    if (!isEditingDate.startDate && !isEditingDate.endDate) {
      loadData();
    }
  }, [filters, isEditingDate, loadData]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredEmployees(employeesWithErrors);
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const searchNumbers = searchTerm.replace(/\D/g, '');
    
    const filtered = employeesWithErrors.filter(item => {
      const nameMatch = item.employee.name.toLowerCase().includes(searchLower);
      const cpfMatch = searchNumbers && item.employee.cpf.includes(searchNumbers);
      return nameMatch || cpfMatch;
    });
    
    setFilteredEmployees(filtered);
  }, [searchTerm, employeesWithErrors]);

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleDateFocus = (field: 'startDate' | 'endDate') => {
    setIsEditingDate(prev => ({ ...prev, [field]: true }));
  };

  const handleDateBlur = (field: 'startDate' | 'endDate') => {
    setIsEditingDate(prev => ({ ...prev, [field]: false }));
  };

  const resetErrorForm = () => {
    setErrorFormData({
      employeeId: '',
      date: getBrazilDate(),
      errorType: 'quantity',
      errorCount: '',
      errorValue: '',
      observations: ''
    });
    setEditingError(null);
    setShowErrorForm(false);
  };

  const handleAddError = (employeeId?: string, date?: string) => {
    if (!hasPermission('errors.create')) {
      toast.error('Você não tem permissão para criar registros de erro');
      return;
    }

    setErrorFormData({
      employeeId: employeeId || '',
      date: date || getBrazilDate(),
      errorType: 'quantity',
      errorCount: '',
      errorValue: '',
      observations: ''
    });
    setShowErrorForm(true);
  };

  const handleEditError = (employeeId: string, date: string) => {
    if (!hasPermission('errors.edit')) {
      toast.error('Você não tem permissão para editar registros de erro');
      return;
    }

    const errorRecord = errorRecords.find(err =>
      err.employee_id === employeeId && err.date === date
    );

    if (errorRecord) {
      const type: ErrorType = (errorRecord.error_type ?? 'quantity');
      setEditingError({ employeeId, date });
      setErrorFormData({
        employeeId,
        date,
        errorType: type,
        errorCount: type === 'quantity' ? errorRecord.error_count.toString() : '',
        errorValue: type === 'value' ? Number(errorRecord.error_value ?? 0).toFixed(2) : '',
        observations: errorRecord.observations || ''
      });
      setShowErrorForm(true);
    }
  };

  const handleSubmitError = async (e: React.FormEvent) => {
    e.preventDefault();

    const permission = editingError ? 'errors.edit' : 'errors.create';
    if (!hasPermission(permission)) {
      toast.error('Você não tem permissão para salvar registros de erro');
      return;
    }

    if (!errorFormData.employeeId) {
      toast.error('Selecione um funcionário');
      return;
    }

    let errorCount = 0;
    let errorValue = 0;

    if (errorFormData.errorType === 'quantity') {
      errorCount = parseInt(errorFormData.errorCount);
      if (isNaN(errorCount) || errorCount < 0) {
        toast.error('Quantidade de erros inválida');
        return;
      }
    } else {
      errorValue = parseFloat(errorFormData.errorValue.replace(',', '.'));
      if (isNaN(errorValue) || errorValue <= 0) {
        toast.error('Valor do erro inválido (deve ser maior que zero)');
        return;
      }
    }

    if (!errorFormData.observations.trim()) {
      toast.error('Observação é obrigatória');
      return;
    }

    try {
      await upsertErrorRecord(
        errorFormData.employeeId,
        errorFormData.date,
        errorCount,
        errorFormData.observations.trim(),
        userId,
        errorFormData.errorType,
        errorValue
      );

      toast.success(editingError ? 'Erro atualizado com sucesso!' : 'Erro registrado com sucesso!');
      resetErrorForm();
      loadData();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar registro';
      toast.error(errorMessage);
    }
  };

  const handleDeleteError = async (errorId: string) => {
    if (!hasPermission('errors.delete')) {
      toast.error('Você não tem permissão para excluir registros de erro');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este registro de erro?')) return;

    try {
      await deleteErrorRecord(errorId, userId);
      toast.success('Registro de erro excluído com sucesso!');
      loadData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir registro');
    }
  };

  const getBestAndWorstEmployees = () => {
    if (filteredEmployees.length === 0) return { best: [], worst: [] };
    
    const sorted = [...filteredEmployees].sort((a, b) => a.errorRate - b.errorRate);
    const best = sorted.slice(0, 3);
    const worst = sorted.slice(-3).reverse();
    
    return { best, worst };
  };

  const getChartData = () => {
    return filteredEmployees.slice(0, 10).map(item => ({
      name: item.employee.name.split(' ')[0],
      erros: item.totalErrors,
      taxa: parseFloat(item.errorRate.toFixed(2))
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  const { best, worst } = getBestAndWorstEmployees();
  const chartData = getChartData();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-2 rounded-lg shadow overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setActiveSubTab('individual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] whitespace-nowrap ${
              activeSubTab === 'individual'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Package className="w-4 h-4" />
            Erros Individuais
          </button>
          {hasPermission('errors.viewTriage') && (
            <button
              onClick={() => setActiveSubTab('triage')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] whitespace-nowrap ${
                activeSubTab === 'triage'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <FileSearch className="w-4 h-4" />
              Triagem
            </button>
          )}
          <button
            onClick={() => setActiveSubTab('periods')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] whitespace-nowrap ${
              activeSubTab === 'periods'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Períodos de Pagamento
          </button>
        </div>
      </div>

      {activeSubTab === 'triage' ? (
        <TriageTab userId={userId} hasPermission={hasPermission} />
      ) : activeSubTab === 'periods' ? (
        <PaymentPeriodsTab userId={userId} hasPermission={hasPermission} />
      ) : (
      <>
      {/* Header */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
            Gestão de Erros
          </h2>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={loadData}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors min-h-[44px] w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Atualizar</span>
            </button>

            <button
              onClick={() => handleAddError()}
              disabled={!hasPermission('errors.create')}
              title={!hasPermission('errors.create') ? 'Você não tem permissão para criar registros de erro' : ''}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Erro</span>
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              onFocus={() => handleDateFocus('startDate')}
              onBlur={() => handleDateBlur('startDate')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              onFocus={() => handleDateFocus('endDate')}
              onBlur={() => handleDateBlur('endDate')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Funcionário
            </label>
            <select
              value={filters.employeeId}
              onChange={(e) => setFilters(prev => ({ ...prev, employeeId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
            >
              <option value="">Todos</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <EmploymentTypeFilter
            value={filters.employmentType}
            onChange={(value) => setFilters(prev => ({ ...prev, employmentType: value }))}
            showLabel={true}
          />
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center justify-between">
              <span className="text-red-800 font-medium">Total de Erros</span>
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600">{statistics.totalQuantityErrors}</div>
            {statistics.totalValueErrors > 0 && (
              <div className="text-xs text-red-700 mt-1 font-semibold">
                + R$ {statistics.totalValueErrors.toFixed(2).replace('.', ',')} em valor
              </div>
            )}
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 font-medium">Funcionários</span>
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-600">{filteredEmployees.length}</div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <span className="text-green-800 font-medium">Dias Trabalhados</span>
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-600">
              {filteredEmployees.reduce((sum, emp) => sum + emp.workDays, 0)}
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between">
              <span className="text-purple-800 font-medium">Taxa Média</span>
              <Target className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {filteredEmployees.length > 0 
                ? (filteredEmployees.reduce((sum, emp) => sum + emp.errorRate, 0) / filteredEmployees.length).toFixed(2)
                : '0.00'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium mb-4">Erros por Funcionário</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="erros" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium mb-4">Taxa de Erros</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="taxa" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Melhores e Piores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4 flex items-center text-green-600">
            <TrendingUp className="w-5 h-5 mr-2" />
            Melhores Funcionários (Menos Erros)
          </h3>
          <div className="space-y-3">
            {best.map((employee, index) => (
              <div key={employee.employee.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{employee.employee.name}</div>
                    <div className="text-sm text-gray-500">{employee.workDays} dias trabalhados</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">{employee.totalErrors}</div>
                  <div className="text-sm text-gray-500">Taxa: {employee.errorRate.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4 flex items-center text-red-600">
            <TrendingDown className="w-5 h-5 mr-2" />
            Funcionários com Mais Erros
          </h3>
          <div className="space-y-3">
            {worst.map((employee, index) => (
              <div key={employee.employee.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{employee.employee.name}</div>
                    <div className="text-sm text-gray-500">{employee.workDays} dias trabalhados</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600">{employee.totalErrors}</div>
                  <div className="text-sm text-gray-500">Taxa: {employee.errorRate.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de Funcionários */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900">
              Funcionários e Erros ({filteredEmployees.length})
            </h3>

            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
              />
            </div>
          </div>
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Funcionário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dias Trabalhados
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total de Erros
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Taxa de Erros
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employeeData) => (
                <React.Fragment key={employeeData.employee.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{employeeData.employee.name}</div>
                        <div className="text-sm text-gray-500">{formatCPF(employeeData.employee.cpf)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {employeeData.workDays} dias
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        employeeData.totalErrors === 0 
                          ? 'bg-green-100 text-green-800'
                          : employeeData.totalErrors <= 5
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {employeeData.totalErrors} erros
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {employeeData.errorRate.toFixed(2)} por dia
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {hasPermission('errors.create') && (
                          <button
                            onClick={() => handleAddError(employeeData.employee.id, filters.startDate)}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                            title="Adicionar Erro"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const row = document.getElementById(`errors-${employeeData.employee.id}`);
                            if (row) {
                              row.style.display = row.style.display === 'none' ? '' : 'none';
                            }
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Ver Detalhes
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Detalhes dos Erros */}
                  <tr id={`errors-${employeeData.employee.id}`} style={{ display: 'none' }}>
                    <td colSpan={5} className="px-6 py-4 bg-gray-50">
                      <div className="space-y-2">
                        <h4 className="font-medium text-gray-900">Registros de Erros:</h4>
                        {employeeData.errorRecords.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {employeeData.errorRecords.map((errorRecord) => {
                              const type: ErrorType = (errorRecord.error_type ?? 'quantity');
                              const isValue = type === 'value';
                              return (
                              <div key={errorRecord.id} className="bg-white p-3 rounded border">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="text-sm font-medium">{formatDateBR(errorRecord.date)}</div>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    isValue
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {isValue ? '💰 Valor' : '📦 Quantidade'}
                                  </span>
                                </div>
                                <div className="text-sm text-red-600 font-bold">
                                  {isValue
                                    ? `R$ ${Number(errorRecord.error_value ?? 0).toFixed(2).replace('.', ',')}`
                                    : `${errorRecord.error_count} erro(s)`}
                                </div>
                                {errorRecord.observations && (
                                  <div className="text-xs text-gray-600 mt-1">
                                    {errorRecord.observations}
                                  </div>
                                )}
                                <div className="flex space-x-1 mt-2">
                                  {hasPermission('errors.edit') && (
                                    <button
                                      onClick={() => handleEditError(employeeData.employee.id, errorRecord.date)}
                                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                      title="Editar registro de erro"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  )}
                                  {hasPermission('errors.delete') && (
                                    <button
                                      onClick={() => handleDeleteError(errorRecord.id)}
                                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                                      title="Excluir registro de erro"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Nenhum erro registrado para este período.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredEmployees.map((employeeData) => (
            <div key={employeeData.employee.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{employeeData.employee.name}</div>
                  <div className="text-xs text-gray-500">{formatCPF(employeeData.employee.cpf)}</div>
                </div>
                {hasPermission('errors.create') && (
                  <button
                    onClick={() => handleAddError(employeeData.employee.id, filters.startDate)}
                    className="p-2 text-orange-600 hover:bg-orange-50 rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Adicionar Erro"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-blue-50 rounded p-2">
                  <span className="text-xs text-blue-800 block">Dias</span>
                  <span className="text-sm font-semibold text-blue-700">{employeeData.workDays}</span>
                </div>
                <div className={`rounded p-2 ${
                  employeeData.totalErrors === 0
                    ? 'bg-green-50'
                    : employeeData.totalErrors <= 5
                    ? 'bg-yellow-50'
                    : 'bg-red-50'
                }`}>
                  <span className="text-xs block opacity-80">Erros</span>
                  <span className={`text-sm font-semibold ${
                    employeeData.totalErrors === 0
                      ? 'text-green-700'
                      : employeeData.totalErrors <= 5
                      ? 'text-yellow-700'
                      : 'text-red-700'
                  }`}>{employeeData.totalErrors}</span>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-xs text-gray-500 block">Taxa</span>
                  <span className="text-sm font-semibold text-gray-700">{employeeData.errorRate.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  const row = document.getElementById(`errors-m-${employeeData.employee.id}`);
                  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
                }}
                className="w-full px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors text-sm font-medium min-h-[44px]"
              >
                Ver Detalhes
              </button>

              <div id={`errors-m-${employeeData.employee.id}`} style={{ display: 'none' }} className="mt-3 space-y-2">
                {employeeData.errorRecords.length > 0 ? (
                  employeeData.errorRecords.map((errorRecord) => {
                    const type: ErrorType = (errorRecord.error_type ?? 'quantity');
                    const isValue = type === 'value';
                    return (
                      <div key={errorRecord.id} className="bg-gray-50 p-3 rounded border">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-medium">{formatDateBR(errorRecord.date)}</div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isValue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {isValue ? '💰 Valor' : '📦 Qtd'}
                          </span>
                        </div>
                        <div className="text-sm text-red-600 font-bold">
                          {isValue
                            ? `R$ ${Number(errorRecord.error_value ?? 0).toFixed(2).replace('.', ',')}`
                            : `${errorRecord.error_count} erro(s)`}
                        </div>
                        {errorRecord.observations && (
                          <div className="text-xs text-gray-600 mt-1">{errorRecord.observations}</div>
                        )}
                        <div className="flex gap-2 mt-2">
                          {hasPermission('errors.edit') && (
                            <button
                              onClick={() => handleEditError(employeeData.employee.id, errorRecord.date)}
                              className="flex-1 py-2 bg-blue-50 text-blue-600 rounded text-xs font-medium min-h-[40px]"
                            >
                              <Edit2 className="w-3 h-3 inline mr-1" /> Editar
                            </button>
                          )}
                          {hasPermission('errors.delete') && (
                            <button
                              onClick={() => handleDeleteError(errorRecord.id)}
                              className="flex-1 py-2 bg-red-50 text-red-600 rounded text-xs font-medium min-h-[40px]"
                            >
                              <Trash2 className="w-3 h-3 inline mr-1" /> Excluir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-500 px-2">Nenhum erro registrado.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredEmployees.length === 0 && (
          <div className="text-center py-8 px-4">
            <AlertTriangle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Nenhum funcionário encontrado</h3>
            <p className="text-sm text-gray-500">
              {searchTerm
                ? 'Tente ajustar os termos de busca.'
                : 'Nenhum funcionário trabalhou no período selecionado.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Modal de Registro de Erro */}
      {showErrorForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-md w-full max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b">
              <h3 className="text-base sm:text-lg font-medium flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
                {editingError ? 'Editar Erro' : 'Registrar Erro'}
              </h3>
              <button
                onClick={resetErrorForm}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitError} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Funcionário *
                </label>
                <select
                  value={errorFormData.employeeId}
                  onChange={(e) => setErrorFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
                  required
                  disabled={!!editingError}
                >
                  <option value="">Selecione um funcionário</option>
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data *
                </label>
                <input
                  type="date"
                  value={errorFormData.date}
                  onChange={(e) => setErrorFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
                  required
                  disabled={!!editingError}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Erro *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { v: 'quantity', label: '📦 Por Quantidade' },
                    { v: 'value', label: '💰 Por Valor (R$)' },
                  ] as const).map(opt => (
                    <label
                      key={opt.v}
                      className={`flex items-center justify-center gap-2 px-3 py-2 border-2 rounded-md cursor-pointer transition-colors text-sm font-medium ${
                        errorFormData.errorType === opt.v
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="errorType"
                        value={opt.v}
                        checked={errorFormData.errorType === opt.v}
                        onChange={() => setErrorFormData(prev => ({ ...prev, errorType: opt.v }))}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {errorFormData.errorType === 'quantity' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantidade de Erros *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={errorFormData.errorCount}
                    onChange={(e) => setErrorFormData(prev => ({ ...prev, errorCount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
                    placeholder="0"
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor do Erro (R$) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={errorFormData.errorValue}
                    onChange={(e) => setErrorFormData(prev => ({ ...prev, errorValue: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
                    placeholder="0,00"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Este valor será descontado diretamente do pagamento.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observações *
                </label>
                <textarea
                  value={errorFormData.observations}
                  onChange={(e) => setErrorFormData(prev => ({ ...prev, observations: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
                  rows={3}
                  placeholder="Descreva os erros ou observações..."
                  required
                />
              </div>
              
            </div>
            <div className="p-4 sm:p-6 border-t bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors min-h-[44px]"
                >
                  {editingError ? 'Atualizar' : 'Registrar'}
                </button>
                <button
                  type="button"
                  onClick={resetErrorForm}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};