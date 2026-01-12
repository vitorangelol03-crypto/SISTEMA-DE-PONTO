import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Calendar, RefreshCw, Search, Gift, RotateCcw, ChevronLeft, ChevronRight, Home, Trash2 } from 'lucide-react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  getAllEmployees,
  getAttendanceHistory,
  markAttendance,
  Employee,
  Attendance,
  createBonus,
  applyBonusToAllPresent,
  deleteAttendance,
  getBonusInfoForDate,
  removeBonusFromEmployee,
  removeAllBonusesForDate,
  BonusInfo,
  getPayments,
  Payment
} from '../../services/database';
import { getBrazilDate, getBrazilDateTime, formatDateBR } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import EmploymentTypeFilter, { EmploymentType, EmploymentTypeBadge } from '../common/EmploymentTypeFilter';

interface AttendanceTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({ userId, hasPermission }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bonusInfo, setBonusInfo] = useState<BonusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getBrazilDate());
  const [exitTimes, setExitTimes] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<EmploymentType>('all');
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusAmount, setBonusAmount] = useState<string>('');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [bulkMarkingLoading, setBulkMarkingLoading] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetType, setResetType] = useState<'single' | 'all'>('single');
  const [employeeToReset, setEmployeeToReset] = useState<string | null>(null);
  const [showRemoveBonusModal, setShowRemoveBonusModal] = useState(false);
  const [bonusRemovalObservation, setBonusRemovalObservation] = useState('');
  const [employeeToRemoveBonus, setEmployeeToRemoveBonus] = useState<string | null>(null);
  const [showRemoveAllBonusModal, setShowRemoveAllBonusModal] = useState(false);
  const [removeAllBonusObservation, setRemoveAllBonusObservation] = useState('');
  const [removingBonus, setRemovingBonus] = useState(false);

  const isViewingToday = selectedDate === getBrazilDate();

  const loadData = async (date: string = selectedDate) => {
    try {
      setLoading(true);
      const employmentType = employmentTypeFilter === 'all' ? undefined : employmentTypeFilter;
      const [employeesData, attendancesData, bonusData, paymentsData] = await Promise.all([
        getAllEmployees(employmentType),
        getAttendanceHistory(date, date, undefined, undefined, employmentType),
        getBonusInfoForDate(date),
        getPayments(date, date, undefined, employmentType)
      ]);

      setEmployees(employeesData);
      setFilteredEmployees(employeesData);
      setAttendances(attendancesData);
      setBonusInfo(bonusData);
      setPayments(paymentsData);

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
    if (hasPermission('attendance.viewHistory') || isViewingToday) {
      loadData(selectedDate);
    }
  }, [selectedDate, employmentTypeFilter]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredEmployees(employees);
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const searchNumbers = searchTerm.replace(/\D/g, '');
    
    const filtered = employees.filter(employee => {
      const nameMatch = employee.name.toLowerCase().includes(searchLower);
      const cpfMatch = searchNumbers && employee.cpf.includes(searchNumbers);
      return nameMatch || cpfMatch;
    });
    
    setFilteredEmployees(filtered);
  }, [searchTerm, employees]);

  const handleDateChange = (newDate: string) => {
    if (!hasPermission('attendance.viewHistory') && newDate !== getBrazilDate()) {
      toast.error('Você não tem permissão para visualizar dias anteriores');
      return;
    }
    setSelectedDate(newDate);
    setSearchTerm('');
    setSelectedEmployees(new Set());
  };

  const goToPreviousDay = () => {
    const prevDate = format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd');
    handleDateChange(prevDate);
  };

  const goToNextDay = () => {
    const nextDate = format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd');
    const today = getBrazilDate();
    if (nextDate <= today) {
      handleDateChange(nextDate);
    }
  };

  const goToToday = () => {
    handleDateChange(getBrazilDate());
  };

  const getAttendanceStatus = (employeeId: string) => {
    const attendance = attendances.find(att => att.employee_id === employeeId);
    return attendance?.status || null;
  };

  const getEmployeeBonus = (employeeId: string): number => {
    const payment = payments.find(p => p.employee_id === employeeId);
    return payment?.bonus ? parseFloat(payment.bonus.toString()) : 0;
  };

  const handleMarkAttendance = async (employeeId: string, status: 'present' | 'absent') => {
    if (!isViewingToday && !hasPermission('attendance.editHistory')) {
      toast.error('Você não tem permissão para editar registros de dias anteriores');
      return;
    }

    try {
      const exitTime = exitTimes[employeeId] || null;
      await markAttendance(employeeId, selectedDate, status, exitTime, userId);
      await loadData(selectedDate);
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
    if (!isViewingToday && !hasPermission('attendance.editHistory')) {
      toast.error('Você não tem permissão para editar registros de dias anteriores');
      return;
    }

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

  const handleBonus = async () => {
    const amount = parseFloat(bonusAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Valor de bonificação inválido');
      return;
    }

    try {
      await createBonus(selectedDate, amount, userId);
      await applyBonusToAllPresent(selectedDate, amount, userId);

      toast.success(`Bonificação de R$ ${amount.toFixed(2)} aplicada para todos os funcionários presentes!`);
      setShowBonusModal(false);
      setBonusAmount('');
      await loadData(selectedDate);
    } catch (error) {
      console.error('Erro ao aplicar bonificação:', error);
      toast.error(error.message || 'Erro ao aplicar bonificação');
    }
  };

  const handleRemoveBonus = (employeeId: string) => {
    setEmployeeToRemoveBonus(employeeId);
    setBonusRemovalObservation('');
    setShowRemoveBonusModal(true);
  };

  const confirmRemoveBonus = async () => {
    if (!employeeToRemoveBonus) return;

    if (bonusRemovalObservation.trim().length < 10) {
      toast.error('Observação deve ter no mínimo 10 caracteres');
      return;
    }

    setRemovingBonus(true);
    try {
      await removeBonusFromEmployee(
        employeeToRemoveBonus,
        selectedDate,
        bonusRemovalObservation,
        userId
      );
      toast.success('Bonificação removida com sucesso');
      setShowRemoveBonusModal(false);
      setBonusRemovalObservation('');
      setEmployeeToRemoveBonus(null);
      await loadData(selectedDate);
    } catch (error) {
      console.error('Erro ao remover bonificação:', error);
      toast.error(error.message || 'Erro ao remover bonificação');
    } finally {
      setRemovingBonus(false);
    }
  };

  const handleRemoveAllBonus = () => {
    setRemoveAllBonusObservation('');
    setShowRemoveAllBonusModal(true);
  };

  const confirmRemoveAllBonus = async () => {
    if (removeAllBonusObservation.trim().length < 10) {
      toast.error('Observação deve ter no mínimo 10 caracteres');
      return;
    }

    setRemovingBonus(true);
    try {
      const count = await removeAllBonusesForDate(
        selectedDate,
        removeAllBonusObservation,
        userId
      );
      toast.success(`${count} bonificação(ões) removida(s) com sucesso`);
      setShowRemoveAllBonusModal(false);
      setRemoveAllBonusObservation('');
      await loadData(selectedDate);
    } catch (error) {
      console.error('Erro ao remover bonificações:', error);
      toast.error(error.message || 'Erro ao remover bonificações');
    } finally {
      setRemovingBonus(false);
    }
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    const newSelected = new Set(selectedEmployees);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedEmployees(newSelected);
  };

  const selectAllEmployees = () => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map(emp => emp.id)));
    }
  };

  const handleBulkMarkAttendance = async (status: 'present' | 'absent') => {
    if (selectedEmployees.size === 0) {
      toast.error('Selecione pelo menos um funcionário');
      return;
    }

    if (!isViewingToday && !hasPermission('attendance.editHistory')) {
      toast.error('Você não tem permissão para editar registros de dias anteriores');
      return;
    }

    setBulkMarkingLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const employeeId of selectedEmployees) {
        try {
          const exitTime = exitTimes[employeeId] || null;
          await markAttendance(employeeId, selectedDate, status, exitTime, userId);
          successCount++;
        } catch (error) {
          console.error(`Erro ao marcar presença para funcionário ${employeeId}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} funcionário(s) marcado(s) como ${status === 'present' ? 'presente' : 'falta'}`);
      }

      if (errorCount > 0) {
        toast.error(`Erro ao marcar ${errorCount} funcionário(s)`);
      }

      setSelectedEmployees(new Set());
      await loadData();
    } catch (error) {
      console.error('Erro na marcação em massa:', error);
      toast.error('Erro na marcação em massa');
    } finally {
      setBulkMarkingLoading(false);
    }
  };

  const handleResetAttendance = async (employeeId: string) => {
    if (!isViewingToday && !hasPermission('attendance.editHistory')) {
      toast.error('Você não tem permissão para editar registros de dias anteriores');
      return;
    }

    setEmployeeToReset(employeeId);
    setResetType('single');
    setShowResetConfirmModal(true);
  };

  const handleResetAllAttendance = () => {
    if (!isViewingToday && !hasPermission('attendance.editHistory')) {
      toast.error('Você não tem permissão para editar registros de dias anteriores');
      return;
    }

    setResetType('all');
    setShowResetConfirmModal(true);
  };

  const confirmReset = async () => {
    try {
      if (resetType === 'single' && employeeToReset) {
        await deleteAttendance(employeeToReset, selectedDate);
        toast.success('Registro de ponto resetado com sucesso');
      } else if (resetType === 'all') {
        const attendanceIds = attendances.map(att => att.employee_id);
        for (const empId of attendanceIds) {
          await deleteAttendance(empId, selectedDate);
        }
        toast.success('Todos os registros de ponto foram resetados');
      }
      await loadData(selectedDate);
    } catch (error) {
      console.error('Erro ao resetar presença:', error);
      toast.error('Erro ao resetar presença');
    } finally {
      setShowResetConfirmModal(false);
      setEmployeeToReset(null);
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

  const { present, absent, notMarked } = getStatusCounts();

  const displayDate = format(parseISO(selectedDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center">
              <Clock className="w-5 h-5 mr-2 text-blue-600" />
              Controle de Ponto
            </h2>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => loadData(selectedDate)}
                className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Atualizar</span>
              </button>

              {hasPermission('financial.applyBonus') && isViewingToday && (
                <button
                  onClick={() => setShowBonusModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  <Gift className="w-4 h-4" />
                  <span>Bonificação</span>
                </button>
              )}

              {hasPermission('attendance.reset') && present > 0 && (
                <button
                  onClick={handleResetAllAttendance}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset Geral</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 border-t pt-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={goToPreviousDay}
                disabled={!hasPermission('attendance.viewHistory')}
                className="flex items-center space-x-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Dia Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                max={getBrazilDate()}
                disabled={!hasPermission('attendance.viewHistory')}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />

              <button
                onClick={goToNextDay}
                disabled={!hasPermission('attendance.viewHistory') || isViewingToday}
                className="flex items-center space-x-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Próximo Dia"
              >
                <span className="hidden sm:inline">Próximo</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              {!isViewingToday && (
                <button
                  onClick={goToToday}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Home className="w-4 h-4" />
                  <span>Hoje</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2 text-sm">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-gray-700">{displayDate}</span>
              {!isViewingToday && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                  VISUALIZANDO HISTÓRICO
                </span>
              )}
            </div>
          </div>

          {bonusInfo && bonusInfo.hasBonus && (
            <div className="border-t pt-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Gift className="w-5 h-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-green-800">Bonificação Aplicada</h3>
                    </div>
                    <div className="space-y-1 text-sm text-green-700">
                      <p><strong>Valor:</strong> R$ {bonusInfo.amount.toFixed(2)}</p>
                      <p><strong>Funcionários:</strong> {bonusInfo.employeesCount}</p>
                      <p><strong>Aplicada em:</strong> {format(parseISO(bonusInfo.appliedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                  </div>
                  {hasPermission('financial.removeBonusBulk') && (
                    <button
                      onClick={handleRemoveAllBonus}
                      className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Remover Todas</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
          <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs sm:text-sm text-green-800 font-medium mb-1 sm:mb-0">Presentes</span>
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-600">{present}</div>
          </div>

          <div className="bg-red-50 p-3 sm:p-4 rounded-lg border border-red-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs sm:text-sm text-red-800 font-medium mb-1 sm:mb-0">Faltas</span>
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-red-600">{absent}</div>
          </div>

          <div className="bg-yellow-50 p-3 sm:p-4 rounded-lg border border-yellow-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs sm:text-sm text-yellow-800 font-medium mb-1 sm:mb-0">Pendentes</span>
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-yellow-600">{notMarked}</div>
          </div>
        </div>
      </div>

      {/* Ações em Massa */}
      {selectedEmployees.size > 0 && hasPermission('attendance.mark') && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg shadow">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-blue-800 font-medium">
                {selectedEmployees.size} funcionário(s) selecionado(s)
              </span>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => handleBulkMarkAttendance('present')}
                disabled={bulkMarkingLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{bulkMarkingLoading ? 'Marcando...' : 'Marcar como Presente'}</span>
              </button>

              <button
                onClick={() => handleBulkMarkAttendance('absent')}
                disabled={bulkMarkingLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>{bulkMarkingLoading ? 'Marcando...' : 'Marcar como Falta'}</span>
              </button>

              <button
                onClick={() => setSelectedEmployees(new Set())}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar Seleção
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-medium text-gray-900">
              Funcionários ({filteredEmployees.length})
            </h3>

            <div className="flex flex-col sm:flex-row gap-3">
              <EmploymentTypeFilter
                value={employmentTypeFilter}
                onChange={setEmploymentTypeFilter}
                showLabel={false}
                className="w-full sm:w-48"
              />

              {hasPermission('attendance.search') && (
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou CPF..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-base"
                  />
                </div>
              )}
            </div>
          </div>

          {filteredEmployees.length > 0 && hasPermission('attendance.mark') && (
            <div className="mt-4 flex items-center space-x-4">
              <button
                onClick={selectAllEmployees}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium min-h-[44px] flex items-center"
              >
                {selectedEmployees.size === filteredEmployees.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>

              {selectedEmployees.size > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedEmployees.size} de {filteredEmployees.length} selecionados
                </span>
              )}
            </div>
          )}
        </div>

        {/* Desktop View - Tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {hasPermission('attendance.mark') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0}
                      onChange={selectAllEmployees}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Funcionário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bonificação
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
                    {hasPermission('attendance.mark') && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedEmployees.has(employee.id)}
                          onChange={() => toggleEmployeeSelection(employee.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">{employee.name}</span>
                          <EmploymentTypeBadge type={employee.employment_type || undefined} />
                        </div>
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
                      {(() => {
                        const bonus = getEmployeeBonus(employee.id);
                        if (bonus > 0) {
                          return (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-green-600">
                                R$ {bonus.toFixed(2)}
                              </span>
                              {hasPermission('financial.removeBonus') && (
                                <button
                                  onClick={() => handleRemoveBonus(employee.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remover bonificação"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        }
                        return <span className="text-sm text-gray-400">-</span>;
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleMarkAttendance(employee.id, 'present')}
                          disabled={!hasPermission('attendance.mark')}
                          className={`inline-flex items-center px-3 py-2 border border-transparent text-xs font-medium rounded-md text-white transition-colors min-h-[44px] ${
                            !hasPermission('attendance.mark')
                              ? 'bg-gray-300 cursor-not-allowed opacity-50'
                              : status === 'present'
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-green-500 hover:bg-green-600'
                          }`}
                          title={!hasPermission('attendance.mark') ? 'Você não tem permissão para marcar presença' : ''}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Presente
                        </button>
                        <button
                          onClick={() => handleMarkAttendance(employee.id, 'absent')}
                          disabled={!hasPermission('attendance.mark')}
                          className={`inline-flex items-center px-3 py-2 border border-transparent text-xs font-medium rounded-md text-white transition-colors min-h-[44px] ${
                            !hasPermission('attendance.mark')
                              ? 'bg-gray-300 cursor-not-allowed opacity-50'
                              : status === 'absent'
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-red-500 hover:bg-red-600'
                          }`}
                          title={!hasPermission('attendance.mark') ? 'Você não tem permissão para marcar presença' : ''}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Falta
                        </button>
                        {status && hasPermission('attendance.reset') && (
                          <button
                            onClick={() => handleResetAttendance(employee.id)}
                            className="inline-flex items-center px-3 py-2 border border-orange-300 text-xs font-medium rounded-md text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors min-h-[44px]"
                            title="Resetar marcação"
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          value={exitTimes[employee.id] || ''}
                          onChange={(e) => handleExitTimeChange(employee.id, e.target.value)}
                          onBlur={() => updateExitTime(employee.id)}
                          disabled={!hasPermission('attendance.edit')}
                          className={`border rounded-md px-3 py-2 text-base min-h-[44px] ${
                            !hasPermission('attendance.edit')
                              ? 'bg-gray-100 cursor-not-allowed opacity-50 border-gray-200'
                              : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                          }`}
                          title={!hasPermission('attendance.edit') ? 'Você não tem permissão para editar horário de saída' : ''}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View - Cards */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredEmployees.map((employee) => {
            const status = getAttendanceStatus(employee.id);

            return (
              <div key={employee.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3 flex-1">
                    {hasPermission('attendance.mark') && (
                      <input
                        type="checkbox"
                        checked={selectedEmployees.has(employee.id)}
                        onChange={() => toggleEmployeeSelection(employee.id)}
                        className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="text-sm font-medium text-gray-900">{employee.name}</h4>
                        <EmploymentTypeBadge type={employee.employment_type || undefined} />
                      </div>
                      <p className="text-xs text-gray-500">CPF: {employee.cpf}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-2">
                    {status === 'present' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Presente
                      </span>
                    )}
                    {status === 'absent' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="w-3 h-3 mr-1" />
                        Falta
                      </span>
                    )}
                    {!status && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Pendente
                      </span>
                    )}
                    {(() => {
                      const bonus = getEmployeeBonus(employee.id);
                      if (bonus > 0) {
                        return (
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-green-600">
                              Bônus: R$ {bonus.toFixed(2)}
                            </span>
                            {hasPermission('financial.removeBonus') && (
                              <button
                                onClick={() => handleRemoveBonus(employee.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Remover bonificação"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                <div className="space-y-3">
                  {hasPermission('attendance.mark') && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMarkAttendance(employee.id, 'present')}
                        className={`flex-1 inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white transition-colors min-h-[48px] ${
                          status === 'present'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-green-500 hover:bg-green-600'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Presente
                      </button>
                      <button
                        onClick={() => handleMarkAttendance(employee.id, 'absent')}
                        className={`flex-1 inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white transition-colors min-h-[48px] ${
                          status === 'absent'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-red-500 hover:bg-red-600'
                        }`}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Falta
                      </button>
                    </div>
                  )}

                  {status && hasPermission('attendance.reset') && (
                    <button
                      onClick={() => handleResetAttendance(employee.id)}
                      className="w-full inline-flex items-center justify-center px-4 py-3 border border-orange-300 text-sm font-medium rounded-lg text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors min-h-[48px]"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Resetar Marcação
                    </button>
                  )}

                  {hasPermission('attendance.edit') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Horário de Saída
                      </label>
                      <input
                        type="time"
                        value={exitTimes[employee.id] || ''}
                        onChange={(e) => handleExitTimeChange(employee.id, e.target.value)}
                        onBlur={() => updateExitTime(employee.id)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:ring-blue-500 focus:border-blue-500 min-h-[48px]"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

      {/* Modal de Bonificação */}
      {showBonusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 sm:p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-medium flex items-center">
                  <Gift className="w-5 h-5 mr-2 text-green-600" />
                  Aplicar Bonificação
                </h3>
                <button
                  onClick={() => setShowBonusModal(false)}
                  className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  Data: <strong>{formatDateBR(selectedDate)}</strong>
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  Funcionários presentes: <strong>{present}</strong>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor da Bonificação (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 text-base min-h-[48px]"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Atenção:</strong> A bonificação será aplicada para todos os {present} funcionários que estão presentes hoje.
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 p-4 sm:p-6 border-t">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleBonus}
                  disabled={!bonusAmount || present === 0}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px] font-medium"
                >
                  Confirmar Bonificação
                </button>
                <button
                  onClick={() => setShowBonusModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[48px] font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Reset */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium flex items-center text-orange-600">
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Confirmar Reset
                </h3>
                <button
                  onClick={() => setShowResetConfirmModal(false)}
                  className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 font-medium">
                    ⚠️ Atenção: Esta ação não pode ser desfeita!
                  </p>
                </div>

                {resetType === 'single' ? (
                  <p className="text-sm text-gray-600">
                    Você está prestes a resetar o registro de ponto deste funcionário para hoje.
                    O registro será completamente removido e o status voltará para "Não marcado".
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    Você está prestes a resetar <strong>TODOS</strong> os registros de ponto de hoje ({present} funcionário{present !== 1 ? 's' : ''}).
                    Todos os registros serão completamente removidos.
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={confirmReset}
                  className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors min-h-[48px] font-medium"
                >
                  Confirmar Reset
                </button>
                <button
                  onClick={() => setShowResetConfirmModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[48px] font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Remoção de Bonificação Individual */}
      {showRemoveBonusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 sm:p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-medium flex items-center text-red-600">
                  <Trash2 className="w-5 h-5 mr-2" />
                  Remover Bonificação
                </h3>
                <button
                  onClick={() => {
                    setShowRemoveBonusModal(false);
                    setBonusRemovalObservation('');
                    setEmployeeToRemoveBonus(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  disabled={removingBonus}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800 font-medium mb-2">
                  ⚠️ Atenção: Esta ação não pode ser desfeita!
                </p>
                <p className="text-sm text-yellow-700">
                  Você está prestes a remover a bonificação deste funcionário. A ação será registrada no histórico de auditoria.
                </p>
              </div>

              {employeeToRemoveBonus && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">
                    <strong>Funcionário:</strong> {employees.find(e => e.id === employeeToRemoveBonus)?.name}
                  </p>
                  <p className="text-sm text-gray-600 mb-1">
                    <strong>Valor:</strong> R$ {getEmployeeBonus(employeeToRemoveBonus).toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Data:</strong> {formatDateBR(selectedDate)}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Observação <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={bonusRemovalObservation}
                  onChange={(e) => setBonusRemovalObservation(e.target.value)}
                  placeholder="Descreva o motivo da remoção da bonificação (mínimo 10 caracteres)"
                  rows={4}
                  disabled={removingBonus}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-base resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={`${
                    bonusRemovalObservation.length < 10
                      ? 'text-red-600'
                      : bonusRemovalObservation.length > 500
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {bonusRemovalObservation.length < 10
                      ? `Faltam ${10 - bonusRemovalObservation.length} caracteres`
                      : bonusRemovalObservation.length > 500
                      ? `Excedeu ${bonusRemovalObservation.length - 500} caracteres`
                      : 'Observação válida'}
                  </span>
                  <span className={`${bonusRemovalObservation.length > 500 ? 'text-red-600' : 'text-gray-500'}`}>
                    {bonusRemovalObservation.length}/500
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 p-4 sm:p-6 border-t">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={confirmRemoveBonus}
                  disabled={bonusRemovalObservation.trim().length < 10 || bonusRemovalObservation.length > 500 || removingBonus}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px] font-medium"
                >
                  {removingBonus ? 'Removendo...' : 'Confirmar Remoção'}
                </button>
                <button
                  onClick={() => {
                    setShowRemoveBonusModal(false);
                    setBonusRemovalObservation('');
                    setEmployeeToRemoveBonus(null);
                  }}
                  disabled={removingBonus}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[48px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Remoção de Todas as Bonificações */}
      {showRemoveAllBonusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 sm:p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-medium flex items-center text-red-600">
                  <Trash2 className="w-5 h-5 mr-2" />
                  Remover Todas as Bonificações
                </h3>
                <button
                  onClick={() => {
                    setShowRemoveAllBonusModal(false);
                    setRemoveAllBonusObservation('');
                  }}
                  className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  disabled={removingBonus}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-bold mb-2">
                  ⚠️ ATENÇÃO: AÇÃO IRREVERSÍVEL!
                </p>
                <p className="text-sm text-red-700">
                  Você está prestes a remover <strong>TODAS</strong> as bonificações do dia. Esta ação afetará múltiplos funcionários e será registrada no histórico de auditoria.
                </p>
              </div>

              {bonusInfo && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-gray-600">
                    <strong>Data:</strong> {formatDateBR(selectedDate)}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Funcionários Afetados:</strong> {bonusInfo.employeesCount}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Valor por Funcionário:</strong> R$ {bonusInfo.amount.toFixed(2)}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 pt-2 border-t border-gray-200">
                    <strong>Total a Remover:</strong> R$ {(bonusInfo.amount * bonusInfo.employeesCount).toFixed(2)}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Observação <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={removeAllBonusObservation}
                  onChange={(e) => setRemoveAllBonusObservation(e.target.value)}
                  placeholder="Descreva o motivo da remoção em massa das bonificações (mínimo 10 caracteres)"
                  rows={4}
                  disabled={removingBonus}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-base resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={`${
                    removeAllBonusObservation.length < 10
                      ? 'text-red-600'
                      : removeAllBonusObservation.length > 500
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {removeAllBonusObservation.length < 10
                      ? `Faltam ${10 - removeAllBonusObservation.length} caracteres`
                      : removeAllBonusObservation.length > 500
                      ? `Excedeu ${removeAllBonusObservation.length - 500} caracteres`
                      : 'Observação válida'}
                  </span>
                  <span className={`${removeAllBonusObservation.length > 500 ? 'text-red-600' : 'text-gray-500'}`}>
                    {removeAllBonusObservation.length}/500
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 p-4 sm:p-6 border-t">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={confirmRemoveAllBonus}
                  disabled={removeAllBonusObservation.trim().length < 10 || removeAllBonusObservation.length > 500 || removingBonus}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px] font-medium"
                >
                  {removingBonus ? 'Removendo...' : 'Confirmar Remoção em Massa'}
                </button>
                <button
                  onClick={() => {
                    setShowRemoveAllBonusModal(false);
                    setRemoveAllBonusObservation('');
                  }}
                  disabled={removingBonus}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[48px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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