import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Search, CreditCard as Edit2, Trash2, RefreshCw, TrendingUp, TrendingDown, Calendar, Users, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getAllEmployees, getAttendanceHistory, getErrorRecords, upsertErrorRecord, deleteErrorRecord, getErrorStatistics, Employee, Attendance, ErrorRecord } from '../../services/database';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import { formatCPF } from '../../utils/validation';
import toast from 'react-hot-toast';

interface ErrorsTabProps {
  userId: string;
}

interface EmployeeWithErrors {
  employee: Employee;
  workDays: number;
  totalErrors: number;
  errorRate: number;
  errorRecords: ErrorRecord[];
}

export const ErrorsTab: React.FC<ErrorsTabProps> = ({ userId }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [errorRecords, setErrorRecords] = useState<ErrorRecord[]>([]);
  const [employeesWithErrors, setEmployeesWithErrors] = useState<EmployeeWithErrors[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeWithErrors[]>([]);
  
  const [filters, setFilters] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
    employeeId: ''
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
    errorCount: '',
    observations: ''
  });

  const [statistics, setStatistics] = useState({
    totalErrors: 0,
    employeeStats: [] as Array<{
      employee: Employee;
      totalErrors: number;
      workDays: number;
      errorRate: number;
    }>
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [employeesData, attendancesData, errorRecordsData, statsData] = await Promise.all([
        getAllEmployees(),
        getAttendanceHistory(filters.startDate, filters.endDate, filters.employeeId),
        getErrorRecords(filters.startDate, filters.endDate, filters.employeeId),
        getErrorStatistics(filters.startDate, filters.endDate)
      ]);
      
      setEmployees(employeesData);
      setAttendances(attendancesData);
      setErrorRecords(errorRecordsData);
      setStatistics(statsData);
      
      // Processar dados dos funcionários com erros
      processEmployeeErrorData(employeesData, attendancesData, errorRecordsData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de erros');
    } finally {
      setLoading(false);
    }
  };

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
  }, [filters, isEditingDate]);

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
      errorCount: '',
      observations: ''
    });
    setEditingError(null);
    setShowErrorForm(false);
  };

  const handleAddError = (employeeId?: string, date?: string) => {
    setErrorFormData({
      employeeId: employeeId || '',
      date: date || getBrazilDate(),
      errorCount: '',
      observations: ''
    });
    setShowErrorForm(true);
  };

  const handleEditError = (employeeId: string, date: string) => {
    const errorRecord = errorRecords.find(err => 
      err.employee_id === employeeId && err.date === date
    );
    
    if (errorRecord) {
      setEditingError({ employeeId, date });
      setErrorFormData({
        employeeId,
        date,
        errorCount: errorRecord.error_count.toString(),
        observations: errorRecord.observations || ''
      });
      setShowErrorForm(true);
    }
  };

  const handleSubmitError = async (e: React.FormEvent) => {
    e.preventDefault();

    const errorCount = parseInt(errorFormData.errorCount);
    if (isNaN(errorCount) || errorCount < 0) {
      toast.error('Quantidade de erros inválida');
      return;
    }

    if (!errorFormData.employeeId) {
      toast.error('Selecione um funcionário');
      return;
    }

    try {
      await upsertErrorRecord(
        errorFormData.employeeId,
        errorFormData.date,
        errorCount,
        errorFormData.observations.trim() || null,
        userId
      );

      toast.success(editingError ? 'Erro atualizado com sucesso!' : 'Erro registrado com sucesso!');
      resetErrorForm();
      loadData();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast.error(error.message || 'Erro ao salvar registro');
    }
  };

  const handleDeleteError = async (errorId: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro de erro?')) return;

    try {
      await deleteErrorRecord(errorId);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
            Gestão de Erros
          </h2>
          
          <div className="flex space-x-3">
            <button
              onClick={loadData}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Atualizar</span>
            </button>
            
            <button
              onClick={() => handleAddError()}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Erro</span>
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Funcionário
            </label>
            <select
              value={filters.employeeId}
              onChange={(e) => setFilters(prev => ({ ...prev, employeeId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">Todos</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center justify-between">
              <span className="text-red-800 font-medium">Total de Erros</span>
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600">{statistics.totalErrors}</div>
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
          
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <div className="flex items-center justify-between">
              <span className="text-amber-800 font-medium">Taxa Média</span>
              <Target className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-600">
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
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-medium text-gray-900">
              Funcionários e Erros ({filteredEmployees.length})
            </h3>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 sm:w-64"
              />
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
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
                        <button
                          onClick={() => handleAddError(employeeData.employee.id, filters.startDate)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                          title="Adicionar Erro"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
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
                            {employeeData.errorRecords.map((errorRecord) => (
                              <div key={errorRecord.id} className="bg-white p-3 rounded border">
                                <div className="text-sm font-medium">{formatDateBR(errorRecord.date)}</div>
                                <div className="text-sm text-red-600 font-medium">
                                  {errorRecord.error_count} erro(s)
                                </div>
                                {errorRecord.observations && (
                                  <div className="text-xs text-gray-600 mt-1">
                                    {errorRecord.observations}
                                  </div>
                                )}
                                <div className="flex space-x-1 mt-2">
                                  <button
                                    onClick={() => handleEditError(employeeData.employee.id, errorRecord.date)}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteError(errorRecord.id)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
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

        {filteredEmployees.length === 0 && (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum funcionário encontrado</h3>
            <p className="text-gray-500">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
                {editingError ? 'Editar Erro' : 'Registrar Erro'}
              </h3>
              <button
                onClick={resetErrorForm}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmitError} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Funcionário *
                </label>
                <select
                  value={errorFormData.employeeId}
                  onChange={(e) => setErrorFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                  required
                  disabled={!!editingError}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantidade de Erros *
                </label>
                <input
                  type="number"
                  min="0"
                  value={errorFormData.errorCount}
                  onChange={(e) => setErrorFormData(prev => ({ ...prev, errorCount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                  placeholder="0"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observações (opcional)
                </label>
                <textarea
                  value={errorFormData.observations}
                  onChange={(e) => setErrorFormData(prev => ({ ...prev, observations: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                  rows={3}
                  placeholder="Descreva os erros ou observações..."
                />
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                >
                  {editingError ? 'Atualizar' : 'Registrar'}
                </button>
                <button
                  type="button"
                  onClick={resetErrorForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
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