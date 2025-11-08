import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, Users, Calculator, CreditCard as Edit2, Save, X, Trash2, RefreshCw, AlertTriangle, Minus, History, Download, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAllEmployees, getPayments, upsertPayment, deletePayment, Employee, Payment, getAttendanceHistory, Attendance, clearEmployeePayments, clearAllPayments, getErrorRecords, ErrorRecord, getBonusRemovalHistory, BonusRemoval } from '../../services/database';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import { formatCPF } from '../../utils/validation';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface FinancialTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

interface EmployeeFinancialData {
  employee: Employee;
  workDays: number;
  absences: number;
  customExitDays: number;
  payments: Payment[];
  errorRecords: ErrorRecord[];
  totalErrors: number;
  totalEarned: number;
}

export const FinancialTab: React.FC<FinancialTabProps> = ({ userId, hasPermission }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [financialData, setFinancialData] = useState<EmployeeFinancialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'financial' | 'history'>('financial');

  const [filters, setFilters] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
    employeeId: ''
  });

  const [isEditingDate, setIsEditingDate] = useState({
    startDate: false,
    endDate: false
  });

  const [bulkDailyRate, setBulkDailyRate] = useState<string>('');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [editingPayment, setEditingPayment] = useState<{employeeId: string, date: string} | null>(null);
  const [editValues, setEditValues] = useState({ dailyRate: '', bonus: '' });
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearType, setClearType] = useState<'all' | 'selected'>('selected');
  const [showErrorDiscountModal, setShowErrorDiscountModal] = useState(false);
  const [errorDiscountValue, setErrorDiscountValue] = useState<string>('');

  const [bonusRemovals, setBonusRemovals] = useState<BonusRemoval[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
    employeeId: ''
  });

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [employeesData, paymentsData, attendancesData, errorRecordsData] = await Promise.all([
        getAllEmployees(),
        getPayments(filters.startDate, filters.endDate, filters.employeeId),
        getAttendanceHistory(filters.startDate, filters.endDate, filters.employeeId),
        getErrorRecords(filters.startDate, filters.endDate, filters.employeeId)
      ]);

      setEmployees(employeesData);
      setPayments(paymentsData);
      setAttendances(attendancesData);

      processFinancialData(employeesData, paymentsData, attendancesData, errorRecordsData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.employeeId]);

  const processFinancialData = (employeesData: Employee[], paymentsData: Payment[], attendancesData: Attendance[], errorRecordsData: ErrorRecord[]) => {
    const data: EmployeeFinancialData[] = employeesData.map(employee => {
      const employeeAttendances = attendancesData.filter(att => att.employee_id === employee.id);
      const employeePayments = paymentsData.filter(pay => pay.employee_id === employee.id);
      const employeeErrors = errorRecordsData.filter(err => err.employee_id === employee.id);
      
      const workDays = employeeAttendances.filter(att => att.status === 'present').length;
      const absences = employeeAttendances.filter(att => att.status === 'absent').length;
      const customExitDays = employeeAttendances.filter(att => att.status === 'present' && att.exit_time).length;
      const totalErrors = employeeErrors.reduce((sum, err) => sum + err.error_count, 0);
      const totalEarned = employeePayments.reduce((sum, pay) => sum + (pay.total || 0), 0);
      
      return {
        employee,
        workDays,
        absences,
        customExitDays,
        payments: employeePayments,
        errorRecords: employeeErrors,
        totalErrors,
        totalEarned
      };
    });
    
    setFinancialData(data);
  };

  useEffect(() => {
    if (!isEditingDate.startDate && !isEditingDate.endDate) {
      loadData();
    }
  }, [filters, isEditingDate, loadData]);

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleDateFocus = (field: 'startDate' | 'endDate') => {
    setIsEditingDate(prev => ({ ...prev, [field]: true }));
  };

  const handleDateBlur = (field: 'startDate' | 'endDate') => {
    setIsEditingDate(prev => ({ ...prev, [field]: false }));
  };

  const handleBulkApply = async () => {
    if (!hasPermission('financial.applyPayment')) {
      toast.error('Você não tem permissão para aplicar valores de pagamento');
      return;
    }

    if (!bulkDailyRate || selectedEmployees.size === 0) {
      toast.error('Selecione funcionários e defina um valor diário');
      return;
    }

    const dailyRate = parseFloat(bulkDailyRate);
    if (isNaN(dailyRate) || dailyRate < 0) {
      toast.error('Valor diário inválido');
      return;
    }

    try {
      
      for (const employeeId of selectedEmployees) {
        const employeeAttendances = attendances.filter(att => 
          att.employee_id === employeeId && att.status === 'present'
        );
        
        for (const attendance of employeeAttendances) {
          const existingPayment = payments.find(pay => 
            pay.employee_id === employeeId && pay.date === attendance.date
          );
          
          const currentBonus = existingPayment?.bonus || 0;
          await upsertPayment(employeeId, attendance.date, dailyRate, currentBonus, userId);
        }
      }
      
      toast.success('Valores aplicados com sucesso!');
      setBulkDailyRate('');
      setSelectedEmployees(new Set());
      loadData();
    } catch (error) {
      console.error('Erro ao aplicar valores:', error);
      toast.error('Erro ao aplicar valores');
    }
  };

  const handleEditPayment = (employeeId: string, date: string) => {
    const payment = payments.find(pay => pay.employee_id === employeeId && pay.date === date);
    setEditingPayment({ employeeId, date });
    setEditValues({
      dailyRate: payment?.daily_rate?.toString() || '0',
      bonus: payment?.bonus?.toString() || '0'
    });
  };

  const handleSaveEdit = async () => {
    if (!hasPermission('financial.editPayment')) {
      toast.error('Você não tem permissão para editar pagamentos');
      return;
    }

    if (!editingPayment) return;

    const dailyRate = parseFloat(editValues.dailyRate) || 0;
    const bonus = parseFloat(editValues.bonus) || 0;

    try {
      await upsertPayment(editingPayment.employeeId, editingPayment.date, dailyRate, bonus, userId);
      toast.success('Pagamento atualizado com sucesso!');
      setEditingPayment(null);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar pagamento');
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!hasPermission('financial.deletePayment')) {
      toast.error('Você não tem permissão para excluir pagamentos');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este pagamento?')) return;

    try {
      await deletePayment(paymentId, userId);
      toast.success('Pagamento excluído com sucesso!');
      loadData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir pagamento');
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
    if (selectedEmployees.size === financialData.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(financialData.map(data => data.employee.id)));
    }
  };

  const handleClearPayments = async () => {
    if (!hasPermission('financial.clearPayments')) {
      toast.error('Você não tem permissão para limpar pagamentos');
      return;
    }

    if (clearType === 'all') {
      if (!confirm('⚠️ ATENÇÃO: Tem certeza que deseja limpar TODOS os pagamentos do período selecionado?\n\nEsta ação não pode ser desfeita!')) {
        return;
      }
    } else {
      if (selectedEmployees.size === 0) {
        toast.error('Selecione pelo menos um funcionário');
        return;
      }
      
      if (!confirm(`⚠️ ATENÇÃO: Tem certeza que deseja limpar os pagamentos de ${selectedEmployees.size} funcionário(s) selecionado(s)?\n\nEsta ação não pode ser desfeita!`)) {
        return;
      }
    }

    try {
      if (clearType === 'all') {
        await clearAllPayments(filters.startDate, filters.endDate, userId);
        toast.success('Todos os pagamentos foram limpos com sucesso!');
      } else {
        for (const employeeId of selectedEmployees) {
          await clearEmployeePayments(employeeId, filters.startDate, filters.endDate);
        }
        toast.success(`Pagamentos de ${selectedEmployees.size} funcionário(s) foram limpos com sucesso!`);
        setSelectedEmployees(new Set());
      }
      
      setShowClearModal(false);
      loadData();
    } catch (error) {
      console.error('Erro ao limpar pagamentos:', error);
      toast.error('Erro ao limpar pagamentos');
    }
  };

  const handleErrorDiscount = async () => {
    if (!hasPermission('financial.applyDiscount')) {
      toast.error('Você não tem permissão para aplicar descontos');
      return;
    }

    const discountValue = parseFloat(errorDiscountValue);
    if (isNaN(discountValue) || discountValue < 0) {
      toast.error('Valor de desconto inválido');
      return;
    }

    if (selectedEmployees.size === 0) {
      toast.error('Selecione pelo menos um funcionário');
      return;
    }

    try {
      for (const employeeId of selectedEmployees) {
        const employeeData = financialData.find(data => data.employee.id === employeeId);
        if (!employeeData) continue;

        // Para cada erro registrado, aplicar desconto
        for (const errorRecord of employeeData.errorRecords) {
          const discountAmount = errorRecord.error_count * discountValue;

          // Buscar pagamento existente
          const existingPayment = payments.find(pay =>
            pay.employee_id === employeeId && pay.date === errorRecord.date
          );

          if (existingPayment) {
            // Aplicar desconto mantendo a diária original, mas reduzindo o total
            const originalDailyRate = existingPayment.daily_rate || 0;
            const originalBonus = existingPayment.bonus || 0;
            const newTotal = Math.max(0, originalDailyRate + originalBonus - discountAmount);

            await upsertPayment(
              employeeId,
              errorRecord.date,
              originalDailyRate,
              originalBonus,
              userId
            );

            // Atualizar o total manualmente no banco
            const { error: updateError } = await supabase
              .from('payments')
              .update({ total: newTotal })
              .eq('employee_id', employeeId)
              .eq('date', errorRecord.date);

            if (updateError) {
              console.error('Erro ao atualizar total:', updateError);
            }
          } else {
            // Se não existe pagamento, criar um com desconto
            const discountedTotal = Math.max(0, -discountAmount);
            await upsertPayment(employeeId, errorRecord.date, 0, 0, userId);

            // Atualizar o total para refletir o desconto
            const { error: updateError } = await supabase
              .from('payments')
              .update({ total: discountedTotal })
              .eq('employee_id', employeeId)
              .eq('date', errorRecord.date);

            if (updateError) {
              console.error('Erro ao criar pagamento com desconto:', updateError);
            }
          }
        }
      }

      toast.success(`Desconto de R$ ${discountValue.toFixed(2)} por erro aplicado com sucesso!`);
      setShowErrorDiscountModal(false);
      setErrorDiscountValue('');
      setSelectedEmployees(new Set());
      loadData();
    } catch (error) {
      console.error('Erro ao aplicar desconto:', error);
      toast.error('Erro ao aplicar desconto por erros');
    }
  };

  const loadBonusRemovalHistory = async () => {
    if (!hasPermission('financial.viewHistory')) {
      toast.error('Você não tem permissão para visualizar o histórico');
      return;
    }

    try {
      setLoadingHistory(true);
      const history = await getBonusRemovalHistory(
        historyFilters.employeeId || undefined,
        historyFilters.startDate,
        historyFilters.endDate
      );
      setBonusRemovals(history);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      toast.error('Erro ao carregar histórico de remoções');
    } finally {
      setLoadingHistory(false);
    }
  };

  const exportHistoryToExcel = () => {
    if (bonusRemovals.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }

    const data = bonusRemovals.map(removal => ({
      'Data': formatDateBR(removal.date),
      'Funcionário': removal.employees?.name || 'N/A',
      'CPF': formatCPF(removal.employees?.cpf || ''),
      'Valor Removido (R$)': removal.bonus_amount_removed.toFixed(2),
      'Observação': removal.observation,
      'Removido Por': removal.removed_by,
      'Data da Remoção': formatDateBR(removal.removed_at.split('T')[0])
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico de Remoções');

    const fileName = `historico_remocoes_${historyFilters.startDate}_${historyFilters.endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Histórico exportado com sucesso!');
  };

  useEffect(() => {
    if (activeView === 'history') {
      loadBonusRemovalHistory();
    }
  }, [activeView, historyFilters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  const totalEarnings = financialData.reduce((sum, data) => sum + data.totalEarned, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <DollarSign className="w-5 h-5 mr-2 text-green-600" />
            Gestão Financeira
          </h2>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadData}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Navegação entre visualizações */}
        <div className="flex space-x-2 mb-4">
          <button
            onClick={() => setActiveView('financial')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
              activeView === 'financial'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Pagamentos</span>
          </button>
          <button
            onClick={() => setActiveView('history')}
            disabled={!hasPermission('financial.viewHistory')}
            title={!hasPermission('financial.viewHistory') ? 'Você não tem permissão para visualizar o histórico' : ''}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              activeView === 'history'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Histórico de Remoções</span>
          </button>
        </div>

        {/* Filtros - Pagamentos */}
        {activeView === 'financial' && (
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
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                onFocus={() => handleDateFocus('endDate')}
                onBlur={() => handleDateBlur('endDate')}
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
          </div>
        )}

        {/* Filtros - Histórico */}
        {activeView === 'history' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={historyFilters.startDate}
                onChange={(e) => setHistoryFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={historyFilters.endDate}
                onChange={(e) => setHistoryFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Funcionário
              </label>
              <select
                value={historyFilters.employeeId}
                onChange={(e) => setHistoryFilters(prev => ({ ...prev, employeeId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Todos</option>
                {employees.map(employee => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={exportHistoryToExcel}
                disabled={bonusRemovals.length === 0}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>
        )}

        {/* Estatísticas - Pagamentos */}
        {activeView === 'financial' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center justify-between">
                <span className="text-green-800 font-medium">Total Ganho</span>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-green-600">
                R$ {totalEarnings.toFixed(2)}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-blue-800 font-medium">Funcionários</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-600">{financialData.length}</div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="text-purple-800 font-medium">Dias Trabalhados</span>
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {financialData.reduce((sum, data) => sum + data.workDays, 0)}
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between">
                <span className="text-orange-800 font-medium">Pagamentos</span>
                <Calculator className="w-5 h-5 text-orange-600" />
              </div>
              <div className="text-2xl font-bold text-orange-600">{payments.length}</div>
            </div>
          </div>
        )}

        {/* Estatísticas - Histórico */}
        {activeView === 'history' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="text-purple-800 font-medium">Total de Remoções</span>
                <History className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-600">{bonusRemovals.length}</div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <div className="flex items-center justify-between">
                <span className="text-red-800 font-medium">Valor Total Removido</span>
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-2xl font-bold text-red-600">
                R$ {bonusRemovals.reduce((sum, r) => sum + Number(r.bonus_amount_removed), 0).toFixed(2)}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-blue-800 font-medium">Funcionários Afetados</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {new Set(bonusRemovals.map(r => r.employee_id)).size}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Aplicação em Lote - apenas na visualização de pagamentos */}
      {activeView === 'financial' && (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4 flex items-center">
          <Calculator className="w-5 h-5 mr-2 text-blue-600" />
          Aplicar Valor em Lote
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Valor por Dia (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={bulkDailyRate}
              onChange={(e) => setBulkDailyRate(e.target.value)}
              disabled={!hasPermission('financial.applyPayment')}
              title={!hasPermission('financial.applyPayment') ? 'Você não tem permissão para aplicar valores' : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="0.00"
            />
          </div>
          
          <div className="flex items-end">
            <button
              onClick={selectAllEmployees}
              disabled={!hasPermission('financial.applyPayment')}
              title={!hasPermission('financial.applyPayment') ? 'Você não tem permissão para selecionar funcionários' : ''}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selectedEmployees.size === financialData.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={handleBulkApply}
              disabled={!hasPermission('financial.applyPayment') || !bulkDailyRate || selectedEmployees.size === 0}
              title={!hasPermission('financial.applyPayment') ? 'Você não tem permissão para aplicar valores' : ''}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors disabled:bg-gray-300"
            >
              Aplicar ({selectedEmployees.size} selecionados)
            </button>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => setShowClearModal(true)}
              disabled={!hasPermission('financial.clearPayments')}
              title={!hasPermission('financial.clearPayments') ? 'Você não tem permissão para limpar pagamentos' : ''}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpar Pagamentos</span>
            </button>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => setShowErrorDiscountModal(true)}
              disabled={!hasPermission('financial.applyDiscount') || selectedEmployees.size === 0}
              title={!hasPermission('financial.applyDiscount') ? 'Você não tem permissão para aplicar descontos' : ''}
              className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-300"
            >
              <Minus className="w-4 h-4" />
              <span>Descontar Erros</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Lista de Funcionários - apenas na visualização de pagamentos */}
      {activeView === 'financial' && (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Funcionários e Pagamentos
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {hasPermission('financial.applyPayment') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.size === financialData.length && financialData.length > 0}
                      onChange={selectAllEmployees}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Funcionário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dias Trabalhados
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Faltas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saídas Personalizadas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total de Erros
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Ganho
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {financialData.map((data) => (
                <React.Fragment key={data.employee.id}>
                  <tr className="hover:bg-gray-50">
                    {hasPermission('financial.applyPayment') && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedEmployees.has(data.employee.id)}
                          onChange={() => toggleEmployeeSelection(data.employee.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{data.employee.name}</div>
                        <div className="text-sm text-gray-500">{formatCPF(data.employee.cpf)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        {data.workDays} dias
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                        {data.absences} faltas
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {data.customExitDays} dias
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        data.totalErrors === 0 
                          ? 'bg-green-100 text-green-800'
                          : data.totalErrors <= 5
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {data.totalErrors} erros
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-green-600">
                        R$ {data.totalEarned.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          const row = document.getElementById(`payments-${data.employee.id}`);
                          if (row) {
                            row.style.display = row.style.display === 'none' ? '' : 'none';
                          }
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-2"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                  
                  {/* Detalhes dos Pagamentos */}
                  <tr id={`payments-${data.employee.id}`} style={{ display: 'none' }}>
                    <td colSpan={8} className="px-6 py-4 bg-gray-50">
                      <div className="space-y-2">
                        <h4 className="font-medium text-gray-900">Pagamentos Detalhados:</h4>
                        {data.payments.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {data.payments.map((payment) => (
                              <div key={payment.id} className="bg-white p-3 rounded border">
                                {editingPayment?.employeeId === data.employee.id && editingPayment?.date === payment.date ? (
                                  <div className="space-y-2">
                                    <div className="text-sm font-medium">{formatDateBR(payment.date)}</div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editValues.dailyRate}
                                        onChange={(e) => setEditValues(prev => ({ ...prev, dailyRate: e.target.value }))}
                                        className="px-2 py-1 text-xs border rounded"
                                        placeholder="Diária"
                                      />
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editValues.bonus}
                                        onChange={(e) => setEditValues(prev => ({ ...prev, bonus: e.target.value }))}
                                        className="px-2 py-1 text-xs border rounded"
                                        placeholder="Bônus"
                                      />
                                    </div>
                                    <div className="flex space-x-1">
                                      <button
                                        onClick={handleSaveEdit}
                                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                                      >
                                        <Save className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => setEditingPayment(null)}
                                        className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-sm font-medium">{formatDateBR(payment.date)}</div>
                                    <div className="text-xs text-gray-600">
                                      Diária: R$ {payment.daily_rate?.toFixed(2) || '0.00'}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Bônus: R$ {payment.bonus?.toFixed(2) || '0.00'}
                                    </div>
                                    {(() => {
                                      const errorRecord = data.errorRecords.find(err => err.date === payment.date);
                                      if (!errorRecord || errorRecord.error_count === 0) return null;
                                      
                                      // Calcular valor real do desconto por erro
                                      // Valor esperado (diária + bônus) - valor real pago = desconto total
                                      // Desconto total / quantidade de erros = valor por erro
                                      const expectedValue = (payment.daily_rate || 0) + (payment.bonus || 0);
                                      const actualValue = payment.total || 0;
                                      const totalDiscount = expectedValue - actualValue;
                                      const valuePerError = totalDiscount > 0 ? totalDiscount / errorRecord.error_count : 0;
                                      
                                     return valuePerError > 0 ? (
                                        <div className="text-xs text-red-600">
                                          Erros: -{errorRecord.error_count} × R$ {valuePerError.toFixed(2)} = -R$ {totalDiscount.toFixed(2)}
                                        </div>
                                      ) : null;
                                    })()}
                                    <div className="text-sm font-medium text-green-600">
                                      Total: R$ {payment.total?.toFixed(2) || '0.00'}
                                    </div>
                                    <div className="flex space-x-1 mt-2">
                                      {hasPermission('financial.editPayment') && (
                                        <button
                                          onClick={() => handleEditPayment(data.employee.id, payment.date)}
                                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                          title="Editar pagamento"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                      )}
                                      {hasPermission('financial.deletePayment') && (
                                        <button
                                          onClick={() => handleDeletePayment(payment.id)}
                                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                                          title="Excluir pagamento"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Nenhum pagamento registrado para este período.</p>
                        )}
                        
                        {data.errorRecords.length > 0 && (
                          <div className="mt-4">
                            <h4 className="font-medium text-gray-900 mb-2">Erros Registrados:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {data.errorRecords.map((errorRecord) => (
                                <div key={errorRecord.id} className="bg-red-50 p-3 rounded border border-red-200">
                                  <div className="text-sm font-medium">{formatDateBR(errorRecord.date)}</div>
                                  <div className="text-sm text-red-600 font-medium">
                                    {errorRecord.error_count} erro(s)
                                  </div>
                                  {errorRecord.observations && (
                                    <div className="text-xs text-gray-600 mt-1">
                                      {errorRecord.observations}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {financialData.length === 0 && (
          <div className="text-center py-8">
            <DollarSign className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum dado financeiro encontrado</h3>
            <p className="text-gray-500">Ajuste os filtros ou aguarde mais registros serem criados.</p>
          </div>
        )}
      </div>
      )}

      {/* Histórico de Remoções de Bonificação */}
      {activeView === 'history' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <History className="w-5 h-5 mr-2 text-purple-600" />
              Histórico de Remoções de Bonificação
            </h3>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
              <span className="ml-2">Carregando histórico...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data da Bonificação
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Funcionário
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor Removido
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Observação
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Removido Por
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data da Remoção
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bonusRemovals.map((removal) => (
                    <tr key={removal.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatDateBR(removal.date)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {removal.employees?.name || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {removal.employees?.cpf ? formatCPF(removal.employees.cpf) : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          R$ {Number(removal.bonus_amount_removed).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-md">
                        <div className="text-sm text-gray-900 break-words">
                          {removal.observation}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {removal.removed_by}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {formatDateBR(removal.removed_at.split('T')[0])}
                        </div>
                        <div className="text-xs text-gray-400">
                          {removal.removed_at.split('T')[1]?.substring(0, 5) || ''}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {bonusRemovals.length === 0 && (
                <div className="text-center py-8">
                  <History className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nenhuma remoção de bonificação encontrada
                  </h3>
                  <p className="text-gray-500">
                    Ajuste os filtros ou aguarde remoções serem registradas no período selecionado.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Limpeza de Pagamentos */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center text-red-600">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Limpar Pagamentos
              </h3>
              <button
                onClick={() => setShowClearModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-800">
                  <strong>⚠️ ATENÇÃO:</strong> Esta ação irá remover permanentemente os pagamentos selecionados e não pode ser desfeita!
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  <strong>Período:</strong> {formatDateBR(filters.startDate)} até {formatDateBR(filters.endDate)}
                </p>
                
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="clearType"
                      value="selected"
                      checked={clearType === 'selected'}
                      onChange={(e) => setClearType(e.target.value as 'all' | 'selected')}
                      className="mr-2"
                    />
                    <span className="text-sm">
                      Limpar funcionários selecionados ({selectedEmployees.size} selecionados)
                    </span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="clearType"
                      value="all"
                      checked={clearType === 'all'}
                      onChange={(e) => setClearType(e.target.value as 'all' | 'selected')}
                      className="mr-2"
                    />
                    <span className="text-sm text-red-600 font-medium">
                      Limpar TODOS os funcionários do período
                    </span>
                  </label>
                </div>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleClearPayments}
                  disabled={clearType === 'selected' && selectedEmployees.size === 0}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Confirmar Limpeza</span>
                </button>
                <button
                  onClick={() => setShowClearModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Desconto por Erros */}
      {showErrorDiscountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center text-orange-600">
                <Minus className="w-5 h-5 mr-2" />
                Descontar por Erros
              </h3>
              <button
                onClick={() => setShowErrorDiscountModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                <p className="text-sm text-orange-800">
                  <strong>Período:</strong> {formatDateBR(filters.startDate)} até {formatDateBR(filters.endDate)}
                </p>
                <p className="text-sm text-orange-800">
                  <strong>Funcionários selecionados:</strong> {selectedEmployees.size}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor do Desconto por Erro (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={errorDiscountValue}
                  onChange={(e) => setErrorDiscountValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Como funciona:</strong> O valor será multiplicado pela quantidade de erros de cada funcionário e descontado dos pagamentos correspondentes.
                </p>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleErrorDiscount}
                  disabled={!errorDiscountValue || selectedEmployees.size === 0}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Aplicar Desconto
                </button>
                <button
                  onClick={() => setShowErrorDiscountModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
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