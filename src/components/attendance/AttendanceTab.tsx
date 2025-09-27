import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Calendar, RefreshCw, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getAllEmployees, getTodayAttendance, markAttendance, Employee, Attendance } from '../../services/database';
import { getBrazilDate, getBrazilDateTime, formatDateBR } from '../../utils/dateUtils';
import toast from 'react-hot-toast';

interface AttendanceTabProps {
  userId: string;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({ userId }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getBrazilDate());
  const [exitTimes, setExitTimes] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [employeesData, attendancesData] = await Promise.all([
        getAllEmployees(),
        getTodayAttendance()
      ]);
      
      setEmployees(employeesData);
      setFilteredEmployees(employeesData);
      setAttendances(attendancesData);
      
      // Inicializar horários de saída
      const exitTimesMap: Record<string, string> = {};
      attendancesData.forEach(att => {
        if (att.exit_time) {
          exitTimesMap[att.employee_id] = att.exit_time;
        }
      });
      setExitTimes(exitTimesMap);
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
    const filtered = employees.filter(employee =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.cpf.includes(searchTerm.replace(/\D/g, ''))
    );
    setFilteredEmployees(filtered);
  }, [searchTerm, employees]);

  const getAttendanceStatus = (employeeId: string) => {
    const attendance = attendances.find(att => att.employee_id === employeeId);
    return attendance?.status || null;
  };

  const handleMarkAttendance = async (employeeId: string, status: 'present' | 'absent') => {
    try {
      const exitTime = exitTimes[employeeId] || null;
      await markAttendance(employeeId, selectedDate, status, exitTime, userId);
      await loadData();
      toast.success(`Presença marcada como ${status === 'present' ? 'presente' : 'falta'}`);
    } catch (error) {
      console.error('Erro ao marcar presença:', error);
      toast.error('Erro ao marcar presença');
    }
  };

  const handleExitTimeChange = (employeeId: string, time: string) => {
    setExitTimes(prev => ({
      ...prev,
      [employeeId]: time
    }));
  };

  const updateExitTime = async (employeeId: string) => {
    try {
      const currentStatus = getAttendanceStatus(employeeId);
      if (currentStatus) {
        const exitTime = exitTimes[employeeId] || null;
        await markAttendance(employeeId, selectedDate, currentStatus, exitTime, userId);
        toast.success('Horário de saída atualizado');
      }
    } catch (error) {
      console.error('Erro ao atualizar horário:', error);
      toast.error('Erro ao atualizar horário');
    }
  };

  const getStatusCounts = () => {
    const filteredAttendances = attendances.filter(att => 
      filteredEmployees.some(emp => emp.id === att.employee_id)
    );
    const present = filteredAttendances.filter(att => att.status === 'present').length;
    const absent = filteredAttendances.filter(att => att.status === 'absent').length;
    const notMarked = filteredEmployees.length - filteredAttendances.length;
    
    return { present, absent, notMarked };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  const { present, absent, notMarked } = getStatusCounts();
  
  const today = format(getBrazilDateTime(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Clock className="w-5 h-5 mr-2 text-blue-600" />
            Controle de Ponto
          </h2>
          <button
            onClick={loadData}
            className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
        </div>
        
        <div className="flex items-center space-x-4 mb-4 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span className="font-medium">{today}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <span className="text-green-800 font-medium">Presentes</span>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-600">{present}</div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center justify-between">
              <span className="text-red-800 font-medium">Faltas</span>
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600">{absent}</div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <div className="flex items-center justify-between">
              <span className="text-yellow-800 font-medium">Não Marcados</span>
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-2xl font-bold text-yellow-600">{notMarked}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-medium text-gray-900">
              Funcionários ({filteredEmployees.length})
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
                  Funcionário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Horário de Saída
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => {
                const status = getAttendanceStatus(employee.id);
                
                return (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                        <div className="text-sm text-gray-500">CPF: {employee.cpf}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {status === 'present' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Presente
                        </span>
                      )}
                      {status === 'absent' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <XCircle className="w-3 h-3 mr-1" />
                          Falta
                        </span>
                      )}
                      {!status && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Não marcado
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleMarkAttendance(employee.id, 'present')}
                          className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white transition-colors ${
                            status === 'present'
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-green-500 hover:bg-green-600'
                          }`}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Presente
                        </button>
                        <button
                          onClick={() => handleMarkAttendance(employee.id, 'absent')}
                          className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white transition-colors ${
                            status === 'absent'
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-red-500 hover:bg-red-600'
                          }`}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Falta
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          value={exitTimes[employee.id] || ''}
                          onChange={(e) => handleExitTimeChange(employee.id, e.target.value)}
                          onBlur={() => updateExitTime(employee.id)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredEmployees.length === 0 && employees.length > 0 && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum funcionário encontrado</h3>
            <p className="text-gray-500">Tente ajustar os termos de busca.</p>
          </div>
        )}

        {employees.length === 0 && (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum funcionário cadastrado</h3>
            <p className="text-gray-500">Cadastre funcionários na aba "Funcionários" para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
};