import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Calendar, RefreshCw, Search, Gift, RotateCcw, ChevronLeft, ChevronRight, Home, Trash2 } from 'lucide-react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  getAllEmployees,
  getAttendanceHistory,
  markAttendance,
  setManualTime,
  Employee,
  Attendance,
  applyBonusToAllPresent,
  deleteAttendance,
  getBonusInfoForDate,
  removeBonusFromEmployee,
  removeAllBonusesForDate,
  clearBonusRegistryForDate,
  BonusInfo,
  BonusType,
  getPayments,
  Payment,
  getBonusDefaults,
} from '../../services/database';
import { getBrazilDate, getBrazilDateTime, formatDateBR } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import EmploymentTypeFilter, { EmploymentType, EmploymentTypeBadge } from '../common/EmploymentTypeFilter';
import { AttendanceApprovalPanel } from './AttendanceApprovalPanel';

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
  const [manualTimes, setManualTimes] = useState<Record<string, { entry: string; exit: string }>>({});
  const [savingManualTime, setSavingManualTime] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<EmploymentType>('all');
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusAmounts, setBonusAmounts] = useState<Record<BonusType, string>>({ B: '', C1: '', C2: '' });
  const [applyingBonus, setApplyingBonus] = useState<Record<BonusType, boolean>>({ B: false, C1: false, C2: false });
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [bulkMarkingLoading, setBulkMarkingLoading] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetType, setResetType] = useState<'single' | 'all'>('single');
  const [employeeToReset, setEmployeeToReset] = useState<string | null>(null);
  const [showRemoveBonusModal, setShowRemoveBonusModal] = useState(false);
  const [bonusRemovalObservation, setBonusRemovalObservation] = useState('');
  const [employeeToRemoveBonus, setEmployeeToRemoveBonus] = useState<string | null>(null);
  const [bonusTypeToRemove, setBonusTypeToRemove] = useState<BonusType | null>(null);
  const [showRemoveAllBonusModal, setShowRemoveAllBonusModal] = useState(false);
  const [removeAllBonusObservation, setRemoveAllBonusObservation] = useState('');
  const [removingBonus, setRemovingBonus] = useState(false);
  const [activeView, setActiveView] = useState<'attendance' | 'approvals'>('attendance');
  const isViewingToday = selectedDate === getBrazilDate();

  // `silent = true` é usado pelo polling a cada 30s: não liga o spinner
  // de "Carregando..." e só atualiza o state se os dados realmente mudaram.
  // Isso elimina o flash de re-render completo da tela.
  const loadData = useCallback(async (date: string = selectedDate, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const employmentType = employmentTypeFilter === 'all' ? undefined : employmentTypeFilter;
      const [employeesData, attendancesData, bonusData, paymentsData] = await Promise.all([
        getAllEmployees(employmentType),
        getAttendanceHistory(date, date, undefined, undefined, employmentType),
        getBonusInfoForDate(date),
        getPayments(date, date, undefined, employmentType)
      ]);

      // Merge inteligente: compara via JSON.stringify e só atualiza o state
      // se houve mudança real. Assim, no polling sem novidades, as refs dos
      // arrays continuam as mesmas e o React não re-renderiza os filhos.
      setEmployees(prev => JSON.stringify(prev) === JSON.stringify(employeesData) ? prev : employeesData);
      setAttendances(prev => JSON.stringify(prev) === JSON.stringify(attendancesData) ? prev : attendancesData);
      setBonusInfo(prev => JSON.stringify(prev) === JSON.stringify(bonusData) ? prev : bonusData);
      setPayments(prev => JSON.stringify(prev) === JSON.stringify(paymentsData) ? prev : paymentsData);

      const exitTimesMap: Record<string, string> = {};
      const manualTimesMap: Record<string, { entry: string; exit: string }> = {};

      const isoToBrazilHMS = (iso: string): string => {
        const d = new Date(iso);
        // UTC-3: subtract 3 h then read the time part of the ISO string
        const brazil = new Date(d.getTime() - 3 * 60 * 60 * 1000);
        return brazil.toISOString().split('T')[1].substring(0, 8);
      };

      attendancesData.forEach(att => {
        if (att.exit_time) {
          exitTimesMap[att.employee_id] = att.exit_time;
        }
        manualTimesMap[att.employee_id] = {
          entry: att.entry_time    ? isoToBrazilHMS(att.entry_time)    : '',
          exit:  att.exit_time_full ? isoToBrazilHMS(att.exit_time_full) : '',
        };
      });

      setExitTimes(prev => JSON.stringify(prev) === JSON.stringify(exitTimesMap) ? prev : exitTimesMap);
      setManualTimes(prev => JSON.stringify(prev) === JSON.stringify(manualTimesMap) ? prev : manualTimesMap);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      if (!silent) toast.error('Erro ao carregar dados');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedDate, employmentTypeFilter]);

  useEffect(() => {
    if (hasPermission('attendance.viewHistory') || isViewingToday) {
      loadData(selectedDate);
    }
    // loadData é estável via useCallback; depende de selectedDate/employmentTypeFilter
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, employmentTypeFilter]);

  // Polling automático a cada 30s quando está visualizando hoje — silencioso,
  // sem spinner e sem re-render se nada mudou (merge inteligente no loadData).
  useEffect(() => {
    if (!isViewingToday) return;
    const interval = setInterval(() => {
      loadData(selectedDate, true);
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewingToday, selectedDate, employmentTypeFilter]);

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

  const getAttendanceStatus = useCallback((employeeId: string) => {
    const attendance = attendances.find(att => att.employee_id === employeeId);
    return attendance?.status || null;
  }, [attendances]);

  const getEmployeeBonusByType = useCallback((employeeId: string): Record<BonusType, number> => {
    const payment = payments.find(p => p.employee_id === employeeId);
    return {
      B: payment?.bonus_b ? parseFloat(payment.bonus_b.toString()) : 0,
      C1: payment?.bonus_c1 ? parseFloat(payment.bonus_c1.toString()) : 0,
      C2: payment?.bonus_c2 ? parseFloat(payment.bonus_c2.toString()) : 0,
    };
  }, [payments]);

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
    setExitTimes(prev => ({ ...prev, [employeeId]: time }));
  };

  const handleManualTimeChange = (employeeId: string, field: 'entry' | 'exit', value: string) => {
    setManualTimes(prev => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? { entry: '', exit: '' }), [field]: value },
    }));
  };

  const handleSaveManualTime = async (employeeId: string) => {
    if (!hasPermission('attendance.edit')) {
      toast.error('Você não tem permissão para editar horários');
      return;
    }
    const times = manualTimes[employeeId];
    if (!times?.entry || !times?.exit) {
      toast.error('Preencha entrada e saída antes de salvar');
      return;
    }
    setSavingManualTime(prev => ({ ...prev, [employeeId]: true }));
    try {
      await setManualTime(employeeId, selectedDate, times.entry, times.exit);
      toast.success('Horário salvo');
      await loadData(selectedDate);
    } catch (err) {
      console.error('Erro ao salvar horário manual:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar horário');
    } finally {
      setSavingManualTime(prev => ({ ...prev, [employeeId]: false }));
    }
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

  const statusCounts = useMemo(() => {
    const filteredAttendances = attendances.filter(att =>
      filteredEmployees.some(emp => emp.id === att.employee_id)
    );
    // Inclui como presente: status 'present' OU quem bateu entrada via tela de funcionário
    const present = filteredAttendances.filter(att => att.status === 'present' || att.entry_time != null).length;
    const absent = filteredAttendances.filter(att => att.status === 'absent' && att.entry_time == null).length;
    const notMarked = filteredEmployees.length - filteredAttendances.length;

    return { present, absent, notMarked };
  }, [attendances, filteredEmployees]);

  // Abre o modal de Bonificação e pré-preenche com os valores padrão salvos
  // na tabela `bonus_defaults`. Se já houver algo digitado em um campo, não
  // sobrescreve (preserva o que o supervisor pode ter começado a editar).
  const openBonusModal = async () => {
    setShowBonusModal(true);
    try {
      const defaults = await getBonusDefaults();
      setBonusAmounts(prev => ({
        B: prev.B || (defaults.B > 0 ? String(defaults.B) : ''),
        C1: prev.C1 || (defaults.C1 > 0 ? String(defaults.C1) : ''),
        C2: prev.C2 || (defaults.C2 > 0 ? String(defaults.C2) : ''),
      }));
    } catch (error) {
      console.error('Erro ao carregar dados do modal de bonificação:', error);
    }
  };

  const handleApplyBonusType = async (type: BonusType) => {
    const amount = parseFloat(bonusAmounts[type]);
    if (isNaN(amount) || amount <= 0) {
      toast.error(`Valor da bonificação ${type} inválido`);
      return;
    }

    setApplyingBonus(prev => ({ ...prev, [type]: true }));
    try {
      await applyBonusToAllPresent(selectedDate, amount, userId, type);
      toast.success(`Bonificação ${type} aplicada com sucesso.`);
      setBonusAmounts(prev => ({ ...prev, [type]: '' }));
      await loadData(selectedDate);
    } catch (error) {
      console.error('Erro ao aplicar bonificação:', error);
      toast.error((error as Error).message || 'Erro ao aplicar bonificação');
    } finally {
      setApplyingBonus(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleRemoveBonus = (employeeId: string) => {
    const byType = getEmployeeBonusByType(employeeId);
    const availableTypes = (['B', 'C1', 'C2'] as BonusType[]).filter(t => byType[t] > 0);

    if (availableTypes.length === 0) {
      toast.error('Este funcionário não possui bonificação para remover');
      return;
    }

    setEmployeeToRemoveBonus(employeeId);
    setBonusTypeToRemove(availableTypes[0]);
    setBonusRemovalObservation('');
    setShowRemoveBonusModal(true);
  };

  const confirmRemoveBonus = async () => {
    if (!employeeToRemoveBonus || !bonusTypeToRemove) return;

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
        userId,
        bonusTypeToRemove
      );
      toast.success(`Bonificação ${bonusTypeToRemove} removida com sucesso`);
      setShowRemoveBonusModal(false);
      setBonusRemovalObservation('');
      setEmployeeToRemoveBonus(null);
      setBonusTypeToRemove(null);
      await loadData(selectedDate);
    } catch (error) {
      console.error('Erro ao remover bonificação:', error);
      toast.error((error as Error).message || 'Erro ao remover bonificação');
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
      const message = error instanceof Error ? error.message : 'Erro ao remover bonificações';
      toast.error(message);
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
        // Reset geral também apaga as bonificações do dia — sem isso, os cards
        // B/C1/C2 continuam visíveis porque getBonusInfoForDate lê da tabela `bonuses`.
        try {
          await clearBonusRegistryForDate(selectedDate);
        } catch (bonusError) {
          console.error('Erro ao limpar bonuses do dia no reset geral:', bonusError);
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

  const { present, absent, notMarked } = statusCounts;

  const displayDate = format(parseISO(selectedDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      {/* Seletor de sub-aba */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-lg shadow px-4">
        <button
          onClick={() => setActiveView('attendance')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeView === 'attendance'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Controle de Ponto
        </button>
        <button
          onClick={() => setActiveView('approvals')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeView === 'approvals'
              ? 'border-yellow-500 text-yellow-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Aprovações Pendentes
        </button>
      </div>

      {activeView === 'approvals' && (
        <AttendanceApprovalPanel userId={userId} />
      )}

      <div style={{ display: activeView === 'attendance' ? '' : 'none' }}>
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
                  onClick={openBonusModal}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  <Gift className="w-4 h-4" />
                  <span>Bonificação</span>
                </button>
              )}

              {hasPermission('attendance.reset') && attendances.length > 0 && (
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

          {bonusInfo && bonusInfo.hasAny && (
            <div className="border-t pt-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-3">
                      <Gift className="w-5 h-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-green-800">Bonificações Aplicadas</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(['B', 'C1', 'C2'] as BonusType[]).map(type => {
                        const info = bonusInfo[type];
                        return (
                          <div
                            key={type}
                            className={`rounded-md border p-3 ${
                              info.hasBonus
                                ? 'bg-white border-green-300'
                                : 'bg-gray-50 border-gray-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-bold text-green-800">Tipo {type}</span>
                              {info.hasBonus && <Gift className="w-4 h-4 text-green-600" />}
                            </div>
                            {info.hasBonus ? (
                              <div className="text-xs text-green-700 space-y-0.5">
                                <p><strong>R$ {info.amount.toFixed(2)}</strong></p>
                                <p>{info.employeesCount} funcionário(s)</p>
                                <p className="text-gray-500">
                                  {format(parseISO(info.appliedAt), "dd/MM HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">Não aplicada</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {hasPermission('financial.removeBonusBulk') && (
                    <button
                      onClick={handleRemoveAllBonus}
                      className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors whitespace-nowrap self-start"
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
                  Entrada / Saída
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
                        const byType = getEmployeeBonusByType(employee.id);
                        const total = byType.B + byType.C1 + byType.C2;
                        if (total === 0) {
                          return <span className="text-sm text-gray-400">-</span>;
                        }
                        return (
                          <div className="flex items-center space-x-2">
                            <div className="text-xs space-y-0.5">
                              {byType.B > 0 && (
                                <div className="text-green-700"><strong>B:</strong> R$ {byType.B.toFixed(2)}</div>
                              )}
                              {byType.C1 > 0 && (
                                <div className="text-green-700"><strong>C1:</strong> R$ {byType.C1.toFixed(2)}</div>
                              )}
                              {byType.C2 > 0 && (
                                <div className="text-green-700"><strong>C2:</strong> R$ {byType.C2.toFixed(2)}</div>
                              )}
                            </div>
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      {hasPermission('attendance.edit') ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            step="1"
                            value={manualTimes[employee.id]?.entry ?? ''}
                            onChange={(e) => handleManualTimeChange(employee.id, 'entry', e.target.value)}
                            className="w-[100px] border border-gray-300 rounded px-1 py-1 text-xs focus:ring-blue-500 focus:border-blue-500"
                            title="Horário de entrada"
                          />
                          <span className="text-gray-400 text-xs">→</span>
                          <input
                            type="time"
                            step="1"
                            value={manualTimes[employee.id]?.exit ?? ''}
                            onChange={(e) => handleManualTimeChange(employee.id, 'exit', e.target.value)}
                            className="w-[100px] border border-gray-300 rounded px-1 py-1 text-xs focus:ring-blue-500 focus:border-blue-500"
                            title="Horário de saída"
                          />
                          <button
                            onClick={() => handleSaveManualTime(employee.id)}
                            disabled={savingManualTime[employee.id] || !manualTimes[employee.id]?.entry || !manualTimes[employee.id]?.exit}
                            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                            title="Salvar horário"
                          >
                            {savingManualTime[employee.id] ? '…' : '💾'}
                          </button>
                        </div>
                      ) : (
                        (() => {
                          const att = attendances.find(a => a.employee_id === employee.id);
                          const fmt = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          if (att?.entry_time && att?.exit_time_full) {
                            return (
                              <div className="text-xs font-mono">
                                <span className="text-green-700">{fmt(att.entry_time)}</span>
                                <span className="text-gray-400 mx-1">→</span>
                                <span className="text-orange-600">{fmt(att.exit_time_full)}</span>
                              </div>
                            );
                          }
                          if (att?.entry_time) {
                            return <div className="text-xs font-mono text-green-700">{fmt(att.entry_time)}</div>;
                          }
                          return <span className="text-xs text-gray-400">-</span>;
                        })()
                      )}
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
                      const byType = getEmployeeBonusByType(employee.id);
                      const total = byType.B + byType.C1 + byType.C2;
                      if (total === 0) return null;
                      return (
                        <div className="flex items-center space-x-2">
                          <div className="text-xs text-green-700 space-y-0.5 text-right">
                            {byType.B > 0 && <div>B: R$ {byType.B.toFixed(2)}</div>}
                            {byType.C1 > 0 && <div>C1: R$ {byType.C1.toFixed(2)}</div>}
                            {byType.C2 > 0 && <div>C2: R$ {byType.C2.toFixed(2)}</div>}
                          </div>
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

                  {hasPermission('attendance.edit') ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Entrada / Saída</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          step="1"
                          value={manualTimes[employee.id]?.entry ?? ''}
                          onChange={(e) => handleManualTimeChange(employee.id, 'entry', e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                          title="Entrada"
                        />
                        <span className="text-gray-400 text-xs">→</span>
                        <input
                          type="time"
                          step="1"
                          value={manualTimes[employee.id]?.exit ?? ''}
                          onChange={(e) => handleManualTimeChange(employee.id, 'exit', e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                          title="Saída"
                        />
                        <button
                          onClick={() => handleSaveManualTime(employee.id)}
                          disabled={savingManualTime[employee.id] || !manualTimes[employee.id]?.entry || !manualTimes[employee.id]?.exit}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm min-h-[44px]"
                          title="Salvar horário"
                        >
                          {savingManualTime[employee.id] ? '…' : '💾'}
                        </button>
                      </div>
                    </div>
                  ) : (() => {
                    const att = attendances.find(a => a.employee_id === employee.id);
                    const fmt = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    if (att?.entry_time && att?.exit_time_full) {
                      return (
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm font-mono">
                          <span className="text-green-700">{fmt(att.entry_time)}</span>
                          <span className="text-gray-400 mx-2">→</span>
                          <span className="text-orange-600">{fmt(att.exit_time_full)}</span>
                        </div>
                      );
                    }
                    if (att?.entry_time) {
                      return (
                        <div className="bg-green-50 rounded-lg px-3 py-2 text-sm font-mono text-green-700">
                          Entrada: {fmt(att.entry_time)}
                        </div>
                      );
                    }
                    return null;
                  })()}
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

      {/* Modal de Bonificação — 3 tipos independentes */}
      {showBonusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 sm:p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-medium flex items-center">
                  <Gift className="w-5 h-5 mr-2 text-green-600" />
                  Bonificação do Dia — {formatDateBR(selectedDate)}
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
              <p className="text-sm text-gray-600">
                Funcionários presentes: <strong>{present}</strong>
              </p>

              {(['B', 'C1', 'C2'] as BonusType[]).map(type => {
                const currentInfo = bonusInfo?.[type];
                const applied = currentInfo?.hasBonus ? currentInfo.amount : 0;
                const busy = applyingBonus[type];
                return (
                  <div key={type} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-800">Tipo {type}</span>
                      {applied > 0 && (
                        <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                          Já aplicada: R$ {applied.toFixed(2)} ({currentInfo?.employeesCount ?? 0} func.)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={bonusAmounts[type]}
                        onChange={(e) => setBonusAmounts(prev => ({ ...prev, [type]: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500 text-base min-h-[44px]"
                        placeholder="R$ 0.00"
                        disabled={busy}
                      />
                      <button
                        onClick={() => handleApplyBonusType(type)}
                        disabled={busy || !bonusAmounts[type] || present === 0}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] font-medium whitespace-nowrap"
                      >
                        {busy ? 'Aplicando...' : `Aplicar ${type}`}
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800">
                  Cada tipo é aplicado separadamente para os {present} funcionário(s) presente(s).
                  Aplicar o mesmo tipo novamente substitui o valor anterior.
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 p-4 sm:p-6 border-t">
              <button
                onClick={() => setShowBonusModal(false)}
                className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[48px] font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      </div> {/* fim wrapper activeView attendance */}

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
                    Você está prestes a resetar <strong>TODOS</strong> os registros de ponto de hoje ({attendances.length} registro{attendances.length !== 1 ? 's' : ''}).
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
                    setBonusTypeToRemove(null);
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

              {employeeToRemoveBonus && (() => {
                const byType = getEmployeeBonusByType(employeeToRemoveBonus);
                const availableTypes = (['B', 'C1', 'C2'] as BonusType[]).filter(t => byType[t] > 0);
                return (
                  <>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">
                        <strong>Funcionário:</strong> {employees.find(e => e.id === employeeToRemoveBonus)?.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong>Data:</strong> {formatDateBR(selectedDate)}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de bonificação a remover <span className="text-red-600">*</span>
                      </label>
                      <div className="space-y-2">
                        {availableTypes.map(t => (
                          <label
                            key={t}
                            className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                              bonusTypeToRemove === t
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="bonusTypeToRemove"
                                value={t}
                                checked={bonusTypeToRemove === t}
                                onChange={() => setBonusTypeToRemove(t)}
                                className="text-red-600 focus:ring-red-500"
                                disabled={removingBonus}
                              />
                              <span className="font-medium text-gray-800">Tipo {t}</span>
                            </div>
                            <span className="text-sm font-semibold text-green-700">
                              R$ {byType[t].toFixed(2)}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}

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
                  disabled={bonusRemovalObservation.trim().length < 10 || bonusRemovalObservation.length > 500 || removingBonus || !bonusTypeToRemove}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px] font-medium"
                >
                  {removingBonus ? 'Removendo...' : 'Confirmar Remoção'}
                </button>
                <button
                  onClick={() => {
                    setShowRemoveBonusModal(false);
                    setBonusRemovalObservation('');
                    setEmployeeToRemoveBonus(null);
                    setBonusTypeToRemove(null);
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

              {bonusInfo && bonusInfo.hasAny && (() => {
                const types: BonusType[] = ['B', 'C1', 'C2'];
                const active = types.filter(t => bonusInfo[t].hasBonus);
                const totalValue = active.reduce(
                  (sum, t) => sum + bonusInfo[t].amount * bonusInfo[t].employeesCount,
                  0
                );
                return (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-gray-600">
                      <strong>Data:</strong> {formatDateBR(selectedDate)}
                    </p>
                    {active.map(t => (
                      <p key={t} className="text-sm text-gray-600">
                        <strong>Tipo {t}:</strong> R$ {bonusInfo[t].amount.toFixed(2)} × {bonusInfo[t].employeesCount} func. = R$ {(bonusInfo[t].amount * bonusInfo[t].employeesCount).toFixed(2)}
                      </p>
                    ))}
                    <p className="text-sm font-semibold text-gray-900 pt-2 border-t border-gray-200">
                      <strong>Total a Remover:</strong> R$ {totalValue.toFixed(2)}
                    </p>
                  </div>
                );
              })()}

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