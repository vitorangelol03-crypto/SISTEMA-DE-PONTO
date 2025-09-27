import React, { useState, useEffect } from 'react';
import { BarChart3, Download, Filter, Calendar, User, FileText, RefreshCw, Search } from 'lucide-react';
import { format } from 'date-fns';
import { getAllEmployees, getAttendanceHistory, Employee, Attendance } from '../../services/database';
import { formatDateBR, formatTimestampForExcel } from '../../utils/dateUtils';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

interface ReportsTabProps {
  userId: string;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ userId }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [filteredAttendances, setFilteredAttendances] = useState<Attendance[]>([]);
  const [displayedAttendances, setDisplayedAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    employeeId: '',
    status: '' as '' | 'present' | 'absent'
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [employeesData, attendancesData] = await Promise.all([
        getAllEmployees(),
        getAttendanceHistory()
      ]);
      
      setEmployees(employeesData);
      setAttendances(attendancesData);
      setFilteredAttendances(attendancesData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let filtered = [...attendances];

    if (filters.startDate) {
      filtered = filtered.filter(att => att.date >= filters.startDate);
    }

    if (filters.endDate) {
      filtered = filtered.filter(att => att.date <= filters.endDate);
    }

    if (filters.employeeId) {
      filtered = filtered.filter(att => att.employee_id === filters.employeeId);
    }

    if (filters.status) {
      filtered = filtered.filter(att => att.status === filters.status);
    }

    setFilteredAttendances(filtered);
  }, [filters, attendances]);

  useEffect(() => {
    const searched = filteredAttendances.filter(attendance =>
      attendance.employees?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attendance.employees?.cpf.includes(searchTerm.replace(/\D/g, ''))
    );
    setDisplayedAttendances(searched);
  }, [searchTerm, filteredAttendances]);

  const getStatistics = () => {
    const total = displayedAttendances.length;
    const present = displayedAttendances.filter(att => att.status === 'present').length;
    const absent = displayedAttendances.filter(att => att.status === 'absent').length;
    const presenceRate = total > 0 ? ((present / total) * 100).toFixed(1) : '0';

    return { total, present, absent, presenceRate };
  };

  const exportToExcel = () => {
    try {
      const data = displayedAttendances.map(att => ({
        'Data': formatDateBR(att.date),
        'Funcionário': att.employees?.name || 'N/A',
        'CPF': att.employees?.cpf || 'N/A',
        'Status': att.status === 'present' ? 'Presente' : 'Falta',
        'Horário Saída': att.exit_time || '-',
        'Marcado por': att.marked_by
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Ajustar largura das colunas
      const colWidths = [
        { wch: 12 }, // Data
        { wch: 25 }, // Funcionário
        { wch: 15 }, // CPF
        { wch: 10 }, // Status
        { wch: 12 }, // Horário Saída
        { wch: 12 }  // Marcado por
      ];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Ponto');
      
      const fileName = `relatorio-ponto-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar relatório');
    }
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      employeeId: '',
      status: ''
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  const stats = getStatistics();

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
            Relatórios e Estatísticas
          </h2>
          
          <button
            onClick={loadData}
            className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 font-medium">Total</span>
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <span className="text-green-800 font-medium">Presentes</span>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.present}</div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center justify-between">
              <span className="text-red-800 font-medium">Faltas</span>
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between">
              <span className="text-purple-800 font-medium">Taxa Presença</span>
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            </div>
            <div className="text-2xl font-bold text-purple-600">{stats.presenceRate}%</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-medium">Filtros</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Funcionário
            </label>
            <select
              value={filters.employeeId}
              onChange={(e) => setFilters(prev => ({ ...prev, employeeId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              <option value="present">Presente</option>
              <option value="absent">Falta</option>
            </select>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={clearFilters}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Limpar Filtros
          </button>
          
          <button
            onClick={exportToExcel}
            disabled={displayedAttendances.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-medium text-gray-900">
              Registros de Ponto ({displayedAttendances.length})
            </h3>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:w-64"
              />
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Funcionário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Horário Saída
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Marcado por
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedAttendances.map((attendance) => (
                <tr key={attendance.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatDateBR(attendance.date)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {attendance.employees?.name || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {attendance.employees?.cpf || 'N/A'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      attendance.status === 'present'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {attendance.status === 'present' ? 'Presente' : 'Falta'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {attendance.exit_time || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{attendance.marked_by}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {displayedAttendances.length === 0 && filteredAttendances.length > 0 && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum registro encontrado</h3>
            <p className="text-gray-500">Tente ajustar os termos de busca.</p>
          </div>
        )}

        {filteredAttendances.length === 0 && (
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum registro encontrado</h3>
            <p className="text-gray-500">Tente ajustar os filtros ou aguarde mais registros serem criados.</p>
          </div>
        )}
      </div>
    </div>
  );
};