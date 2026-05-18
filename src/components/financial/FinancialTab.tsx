import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Calendar, Users, Calculator, CreditCard as Edit2, Save, X, Trash2, RefreshCw, AlertTriangle, Minus, History, Download, Search, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  getAllEmployees, getPayments, upsertPayment, deletePayment, Employee, Payment, getAttendanceHistory, Attendance,
  clearEmployeePayments, clearAllPayments, getErrorRecords, ErrorRecord, getBonusRemovalHistory, BonusRemoval,
  getTriageDistributionsForEmployees, getBonusTypes, BonusTypeRecord,
  getPaymentPeriods, PaymentPeriod,
  applyBankHoursToPayment, previewBankHoursForPeriod, createBankHoursOverride,
  type BankHoursPreviewItem,
} from '../../services/database';
import { useCompany } from '../../contexts/CompanyContext';
import {
  shouldShowAllAppliedBanner,
  selectAllPendingState,
  toggleAllPending,
} from '../../utils/bankHoursUiHelpers';
import { getBonusValueForType } from '../../utils/bonusHelpers';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import { formatCPF } from '../../utils/validation';
import toast from 'react-hot-toast';
import EmploymentTypeFilter, { EmploymentType, EmploymentTypeBadge } from '../common/EmploymentTypeFilter';
import FunctionRoleFilter, { FUNCTION_ROLE_ALL, FUNCTION_ROLE_NONE } from '../common/FunctionRoleFilter';
import * as XLSX from 'xlsx';

interface FinancialTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

interface TriageDiscount {
  period_start: string;
  period_end: string;
  value_deducted: number;
  errors_share: number;
}

interface EmployeeFinancialData {
  employee: Employee;
  workDays: number;
  absences: number;
  customExitDays: number;
  payments: Payment[];
  errorRecords: ErrorRecord[];
  totalErrors: number;
  totalErrorValue: number;
  totalTriageDiscount: number;
  totalEarnedGross: number;
  totalEarned: number;
  triageDiscounts: TriageDiscount[];
}

const FALLBACK_BONUS_TYPES: BonusTypeRecord[] = [
  { id: 'fallback-B',  company_id: '', code: 'B',  name: 'Bônus B',  default_value: 0, order_index: 1, active: true, created_at: '', updated_at: '' },
  { id: 'fallback-C1', company_id: '', code: 'C1', name: 'Bônus C1', default_value: 0, order_index: 2, active: true, created_at: '', updated_at: '' },
  { id: 'fallback-C2', company_id: '', code: 'C2', name: 'Bônus C2', default_value: 0, order_index: 3, active: true, created_at: '', updated_at: '' },
];

export const FinancialTab: React.FC<FinancialTabProps> = ({ userId, hasPermission }) => {
  const { company } = useCompany();
  const [bonusTypes, setBonusTypes] = useState<BonusTypeRecord[]>(FALLBACK_BONUS_TYPES);
  const [_employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [financialData, setFinancialData] = useState<EmployeeFinancialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'financial' | 'history'>('financial');

  const [filters, setFilters] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
    employeeId: '',
    employmentType: 'all' as EmploymentType,
    functionRole: FUNCTION_ROLE_ALL,
  });

  const [isEditingDate, setIsEditingDate] = useState({
    startDate: false,
    endDate: false
  });

  // ─── Banco de horas (combo G — sub-fase 2.17) ──────────────────────────
  // Dropdown de payment_periods da empresa atual + modal de preview/apply.
  // Quando um period é selecionado, filters.startDate/endDate são derivados
  // dele e os inputs date ficam read-only. Botão "Aplicar banco de horas"
  // só fica visível quando company.bank_hours_apply_in_payment=true.
  const [periods, setPeriods] = useState<PaymentPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [showApplyModal, setShowApplyModal] = useState(false);

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

  // Busca em tempo real por nome do funcionário (filtragem client-side)
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [historyEmployeeSearch, setHistoryEmployeeSearch] = useState('');

  const displayedFinancialData = React.useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const role = filters.functionRole;
    let data = financialData;
    if (role !== FUNCTION_ROLE_ALL) {
      if (role === FUNCTION_ROLE_NONE) {
        data = data.filter(d => !d.employee.function_role || !d.employee.function_role.trim());
      } else {
        data = data.filter(d => d.employee.function_role === role);
      }
    }
    if (q) data = data.filter(d => d.employee.name.toLowerCase().includes(q));
    return data;
  }, [financialData, employeeSearch, filters.functionRole]);

  const displayedBonusRemovals = React.useMemo(() => {
    const q = historyEmployeeSearch.trim().toLowerCase();
    if (!q) return bonusRemovals;
    return bonusRemovals.filter(r => (r.employees?.name ?? '').toLowerCase().includes(q));
  }, [bonusRemovals, historyEmployeeSearch]);

  const loadData = React.useCallback(async () => {
    if (!company?.id) return;
    try {
      setLoading(true);
      const employmentTypeFilter = filters.employmentType === 'all' ? undefined : filters.employmentType;
      const [employeesData, paymentsData, attendancesData, errorRecordsData] = await Promise.all([
        getAllEmployees(employmentTypeFilter, company.id),
        getPayments(filters.startDate, filters.endDate, filters.employeeId, employmentTypeFilter, company.id),
        getAttendanceHistory(filters.startDate, filters.endDate, filters.employeeId, undefined, employmentTypeFilter, company.id),
        getErrorRecords(filters.startDate, filters.endDate, filters.employeeId, employmentTypeFilter, company.id)
      ]);

      const triageData = employeesData.length > 0
        ? await getTriageDistributionsForEmployees(
            employeesData.map(e => e.id),
            filters.startDate,
            filters.endDate,
            company.id
          )
        : [];

      setEmployees(employeesData);
      setPayments(paymentsData);
      setAttendances(attendancesData);

      processFinancialData(employeesData, paymentsData, attendancesData, errorRecordsData, triageData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.employeeId, filters.employmentType, company?.id]);

  const processFinancialData = (
    employeesData: Employee[],
    paymentsData: Payment[],
    attendancesData: Attendance[],
    errorRecordsData: ErrorRecord[],
    triageData: Array<{ employee_id: string; period_start: string; period_end: string; value_deducted: number; errors_share: number }>
  ) => {
    const data: EmployeeFinancialData[] = employeesData.map(employee => {
      const employeeAttendances = attendancesData.filter(att => att.employee_id === employee.id);
      const employeePayments = paymentsData.filter(pay => pay.employee_id === employee.id);
      const employeeErrors = errorRecordsData.filter(err => err.employee_id === employee.id);
      const triageDiscounts = triageData
        .filter(t => t.employee_id === employee.id)
        .map(t => ({
          period_start: t.period_start,
          period_end: t.period_end,
          value_deducted: t.value_deducted,
          errors_share: t.errors_share,
        }));

      const workDays = employeeAttendances.filter(att => att.status === 'present').length;
      const absences = employeeAttendances.filter(att => att.status === 'absent').length;
      const customExitDays = employeeAttendances.filter(att => att.status === 'present' && att.exit_time).length;
      const totalErrors = employeeErrors
        .filter(e => (e.error_type ?? 'quantity') === 'quantity')
        .reduce((sum, err) => sum + (err.error_count ?? 0), 0);
      const totalErrorValue = employeeErrors
        .filter(e => e.error_type === 'value')
        .reduce((sum, err) => sum + Number(err.error_value ?? 0), 0);
      const totalTriageDiscount = triageDiscounts.reduce((s, t) => s + t.value_deducted, 0);
      // payments.total já reflete desconto manual de erros quantidade aplicados
      // via botão "Descontar Erros". Erros tipo value e triagem não tocam
      // payments.total — são deduzidos aqui na exibição.
      const totalEarnedGross = employeePayments.reduce((sum, pay) => sum + (pay.total || 0), 0);
      const totalEarned = Math.max(0, totalEarnedGross - totalErrorValue - totalTriageDiscount);

      return {
        employee,
        workDays,
        absences,
        customExitDays,
        payments: employeePayments,
        errorRecords: employeeErrors,
        totalErrors,
        totalErrorValue,
        totalTriageDiscount,
        totalEarnedGross,
        totalEarned,
        triageDiscounts
      };
    });

    setFinancialData(data);
  };

  useEffect(() => {
    if (!isEditingDate.startDate && !isEditingDate.endDate) {
      loadData();
    }
  }, [filters, isEditingDate, loadData]);

  // Carrega tipos de bonificação da empresa atual.
  // Substitui o fallback (B/C1/C2) só se o banco retornar tipos. Se vier vazio, mantém fallback.
  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    getBonusTypes(company.id)
      .then(types => { if (!cancelled && types.length > 0) setBonusTypes(types); })
      .catch(err => console.error('Erro ao carregar bonus_types:', err));
    return () => { cancelled = true; };
  }, [company?.id]);

  // Carrega payment_periods da empresa atual (combo G).
  // Ordenados por end_date DESC pra "mais recente primeiro" no dropdown.
  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    getPaymentPeriods(company.id)
      .then(pp => {
        if (!cancelled) {
          const sorted = [...pp].sort((a, b) => b.end_date.localeCompare(a.end_date));
          setPeriods(sorted);
        }
      })
      .catch(err => console.error('Erro ao carregar payment_periods:', err));
    return () => { cancelled = true; };
  }, [company?.id]);

  // Auto-fill startDate/endDate quando period é selecionado.
  // Inputs de data ficam read-only enquanto period selecionado (ver UI).
  useEffect(() => {
    if (!selectedPeriodId) return;
    const p = periods.find(x => x.id === selectedPeriodId);
    if (!p) return;
    setFilters(prev => ({ ...prev, startDate: p.start_date, endDate: p.end_date }));
  }, [selectedPeriodId, periods]);

  // Sub-fase 14.25 (TECH_DEBT 6.22 Sev Alta): troca de empresa zera estados
  // locais ID-based (Set/objeto com employee_id), fecha modais abertos e
  // limpa inputs/filtros referenciando dados da empresa anterior.
  // payments/attendances/financialData são refetchados pelo useEffect L211
  // (loadData) quando company.id muda via loadData closure.
  useEffect(() => {
    setSelectedEmployees(new Set());
    setEditingPayment(null);
    setEditValues({ dailyRate: '', bonus: '' });
    setSelectedPeriodId('');
    setBulkDailyRate('');
    setErrorDiscountValue('');
    setEmployeeSearch('');
    setHistoryEmployeeSearch('');
    setShowApplyModal(false);
    setShowClearModal(false);
    setShowErrorDiscountModal(false);
    setBonusRemovals([]);
    setHistoryFilters(prev => ({ ...prev, employeeId: '' }));
  }, [company?.id]);

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
    if (!hasPermission('financial.editRate')) {
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

    if (!company?.id) return;
    const companyId = company.id;
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
          await upsertPayment(employeeId, attendance.date, dailyRate, currentBonus, userId, companyId);
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
    if (!hasPermission('financial.editRate')) {
      toast.error('Você não tem permissão para editar pagamentos');
      return;
    }

    if (!editingPayment) return;
    if (!company?.id) return;

    const dailyRate = parseFloat(editValues.dailyRate) || 0;
    const bonus = parseFloat(editValues.bonus) || 0;

    try {
      await upsertPayment(editingPayment.employeeId, editingPayment.date, dailyRate, bonus, userId, company.id);
      toast.success('Pagamento atualizado com sucesso!');
      setEditingPayment(null);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar pagamento');
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!hasPermission('financial.delete')) {
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
    if (selectedEmployees.size === displayedFinancialData.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(displayedFinancialData.map(data => data.employee.id)));
    }
  };

  const handleClearPayments = async () => {
    if (!hasPermission('financial.clear')) {
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

    if (!company?.id) return;
    try {
      if (clearType === 'all') {
        await clearAllPayments(filters.startDate, filters.endDate, userId, company.id);
        toast.success('Todos os pagamentos foram limpos com sucesso!');
      } else {
        for (const employeeId of selectedEmployees) {
          await clearEmployeePayments(employeeId, filters.startDate, filters.endDate, company.id);
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

    // Valor por erro (aplicado só aos registros tipo 'quantity').
    // Para registros tipo 'value', o desconto sai do próprio error_value.
    const discountValue = errorDiscountValue.trim() === '' ? 0 : parseFloat(errorDiscountValue);
    if (isNaN(discountValue) || discountValue < 0) {
      toast.error('Valor de desconto inválido');
      return;
    }

    if (selectedEmployees.size === 0) {
      toast.error('Selecione pelo menos um funcionário');
      return;
    }

    if (!company?.id) return;
    const companyId = company.id;
    try {
      for (const employeeId of selectedEmployees) {
        const employeeData = financialData.find(data => data.employee.id === employeeId);
        if (!employeeData) continue;

        // Para cada erro, aplicar desconto em payments.total APENAS para tipo
        // 'quantity' (valor/unidade × quantidade). Erros tipo 'value' são
        // deduzidos automaticamente na exibição — modificar payments.total
        // aqui causaria dupla contagem.
        for (const errorRecord of employeeData.errorRecords) {
          const isValueType = (errorRecord.error_type ?? 'quantity') === 'value';
          if (isValueType) continue;

          const discountAmount = errorRecord.error_count * discountValue;
          if (discountAmount <= 0) continue;

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
              userId,
              companyId
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
            await upsertPayment(employeeId, errorRecord.date, 0, 0, userId, companyId);

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

    if (!company?.id) return;
    try {
      setLoadingHistory(true);
      const history = await getBonusRemovalHistory(
        historyFilters.employeeId || undefined,
        historyFilters.startDate,
        historyFilters.endDate,
        company.id
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
    if (displayedBonusRemovals.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }

    const data = displayedBonusRemovals.map(removal => ({
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

  const totalEarnings = displayedFinancialData.reduce((sum, data) => sum + data.totalEarned, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center">
            <DollarSign className="w-5 h-5 mr-2 text-green-600" />
            Gestão Financeira
          </h2>

          <div className="flex items-center gap-2">
            {company?.bank_hours_apply_in_payment && (
              <button
                onClick={() => setShowApplyModal(true)}
                disabled={!selectedPeriodId}
                title={selectedPeriodId
                  ? 'Aplica saldo do banco de horas no líquido conforme configuração'
                  : 'Selecione um período primeiro'}
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-amber-50 text-amber-700 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] w-full sm:w-auto"
              >
                <Wallet className="w-4 h-4" />
                <span>Aplicar banco de horas</span>
              </button>
            )}
            <button
              onClick={loadData}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors min-h-[44px] w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Navegação entre visualizações */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4 overflow-x-auto">
          <button
            onClick={() => setActiveView('financial')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors min-h-[44px] whitespace-nowrap ${
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
            data-testid="financial-history-btn"
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] whitespace-nowrap ${
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
          <>
            {/* Dropdown de período (combo G — pré-requisito do botão de banco horas).
                Quando period selecionado, datas são derivadas e inputs ficam read-only. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-3">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Período de pagamento
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm"
                  >
                    <option value="">— Sem período (datas livres) —</option>
                    {periods.map(p => (
                      <option key={p.id} value={p.id}>
                        {formatDateBR(p.start_date)} a {formatDateBR(p.end_date)}
                        {p.label ? ` · ${p.label}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedPeriodId && (
                    <button
                      type="button"
                      onClick={() => setSelectedPeriodId('')}
                      className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 min-h-[44px]"
                      title="Limpar período (libera edição livre das datas)"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            </div>

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
                readOnly={!!selectedPeriodId}
                title={selectedPeriodId ? 'Datas vêm do período selecionado' : ''}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm ${selectedPeriodId ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
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
                readOnly={!!selectedPeriodId}
                title={selectedPeriodId ? 'Datas vêm do período selecionado' : ''}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm ${selectedPeriodId ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Funcionário
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Buscar funcionário..."
                  data-testid="financial-search-input"
                  className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm"
                />
                {employeeSearch && (
                  <button
                    type="button"
                    onClick={() => setEmployeeSearch('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <EmploymentTypeFilter
              value={filters.employmentType}
              onChange={(value) => setFilters(prev => ({ ...prev, employmentType: value }))}
              showLabel={true}
            />

            <FunctionRoleFilter
              value={filters.functionRole}
              onChange={(value) => setFilters(prev => ({ ...prev, functionRole: value }))}
              companyId={company?.id}
              showLabel={true}
            />
          </div>
          </>
        )}

        {/* Filtros - Histórico */}
        {activeView === 'history' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={historyFilters.startDate}
                onChange={(e) => setHistoryFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 min-h-[44px] text-sm"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 min-h-[44px] text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Funcionário
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  value={historyEmployeeSearch}
                  onChange={(e) => setHistoryEmployeeSearch(e.target.value)}
                  placeholder="Buscar funcionário..."
                  className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 min-h-[44px] text-sm"
                />
                {historyEmployeeSearch && (
                  <button
                    type="button"
                    onClick={() => setHistoryEmployeeSearch('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={exportHistoryToExcel}
                disabled={displayedBonusRemovals.length === 0}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>
        )}

        {/* Estatísticas - Pagamentos */}
        {activeView === 'financial' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
              <div className="text-2xl font-bold text-blue-600">{displayedFinancialData.length}</div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="text-purple-800 font-medium">Dias Trabalhados</span>
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {displayedFinancialData.reduce((sum, data) => sum + data.workDays, 0)}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="text-purple-800 font-medium">Total de Remoções</span>
                <History className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-600">{displayedBonusRemovals.length}</div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <div className="flex items-center justify-between">
                <span className="text-red-800 font-medium">Valor Total Removido</span>
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-2xl font-bold text-red-600">
                R$ {displayedBonusRemovals.reduce((sum, r) => sum + Number(r.bonus_amount_removed), 0).toFixed(2)}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-blue-800 font-medium">Funcionários Afetados</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {new Set(displayedBonusRemovals.map(r => r.employee_id)).size}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Aplicação em Lote - apenas na visualização de pagamentos */}
      {activeView === 'financial' && (
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <h3 className="text-base sm:text-lg font-medium mb-4 flex items-center">
          <Calculator className="w-5 h-5 mr-2 text-blue-600" />
          Aplicar Valor em Lote
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
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
              disabled={!hasPermission('financial.editRate')}
              title={!hasPermission('financial.editRate') ? 'Você não tem permissão para aplicar valores' : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[44px] text-sm"
              placeholder="0.00"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={selectAllEmployees}
              disabled={!hasPermission('financial.editRate')}
              title={!hasPermission('financial.editRate') ? 'Você não tem permissão para selecionar funcionários' : ''}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
            >
              {selectedEmployees.size === displayedFinancialData.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleBulkApply}
              disabled={!hasPermission('financial.editRate') || !bulkDailyRate || selectedEmployees.size === 0}
              title={!hasPermission('financial.editRate') ? 'Você não tem permissão para aplicar valores' : ''}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors disabled:bg-gray-300 min-h-[44px]"
            >
              Aplicar ({selectedEmployees.size} selecionados)
            </button>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setShowClearModal(true)}
              disabled={!hasPermission('financial.clear')}
              title={!hasPermission('financial.clear') ? 'Você não tem permissão para limpar pagamentos' : ''}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpar Pagamentos</span>
            </button>
          </div>

          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              onClick={() => setShowErrorDiscountModal(true)}
              disabled={!hasPermission('financial.applyDiscount') || selectedEmployees.size === 0}
              title={!hasPermission('financial.applyDiscount') ? 'Você não tem permissão para aplicar descontos' : ''}
              className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300 min-h-[44px]"
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
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">
            Funcionários e Pagamentos
          </h3>
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {hasPermission('financial.editRate') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.size === displayedFinancialData.length && displayedFinancialData.length > 0}
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
              {displayedFinancialData.map((data) => (
                <React.Fragment key={data.employee.id}>
                  <tr className="hover:bg-gray-50">
                    {hasPermission('financial.editRate') && (
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
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">{data.employee.name}</span>
                          <EmploymentTypeBadge type={data.employee.employment_type || undefined} />
                        </div>
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
                      {(() => {
                        const hasQty = data.totalErrors > 0;
                        const hasVal = data.totalErrorValue > 0;
                        const empty = !hasQty && !hasVal;
                        const severity = hasVal || data.totalErrors > 5 ? 'red' : hasQty ? 'yellow' : 'green';
                        const cls = severity === 'green'
                          ? 'bg-green-100 text-green-800'
                          : severity === 'yellow'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800';
                        const valStr = `R$ ${data.totalErrorValue.toFixed(2).replace('.', ',')}`;
                        const label = empty
                          ? '0 erros'
                          : hasQty && hasVal
                          ? `${data.totalErrors} erros + ${valStr}`
                          : hasVal
                          ? valStr
                          : `${data.totalErrors} erros`;
                        return (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${cls}`}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-green-600">
                        R$ {data.totalEarned.toFixed(2).replace('.', ',')}
                      </div>
                      {(data.totalErrorValue > 0 || data.totalTriageDiscount > 0) && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          Bruto: R$ {data.totalEarnedGross.toFixed(2).replace('.', ',')}
                        </div>
                      )}
                      {data.totalErrorValue > 0 && (
                        <div className="text-xs text-red-600">
                          -R$ {data.totalErrorValue.toFixed(2).replace('.', ',')} erro valor
                        </div>
                      )}
                      {data.totalTriageDiscount > 0 && (
                        <div className="text-xs text-red-600">
                          -R$ {data.totalTriageDiscount.toFixed(2).replace('.', ',')} triagem
                        </div>
                      )}
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
                      <button
                        onClick={async () => {
                          // Sub-fase 17.2: gera holerite PDF MVP do funcionário no período atual
                          const { downloadHoleritePdf } = await import('../../utils/holeritePdf');
                          await downloadHoleritePdf({
                            company: { name: company?.display_name || company?.legal_name || 'Empresa', cnpj: company?.cnpj || undefined },
                            employee: {
                              name: data.employee.name,
                              cpf: data.employee.cpf,
                              employmentType: data.employee.employment_type || undefined,
                              functionRole: data.employee.function_role || undefined,
                              hireDate: data.employee.hire_date || undefined,
                            },
                            period: { start: filters.startDate, end: filters.endDate },
                            payments: data.payments.map((p) => ({
                              date: p.date,
                              dailyRate: p.daily_rate || 0,
                              bonusB: p.bonus_b || 0,
                              bonusC1: p.bonus_c1 || 0,
                              bonusC2: p.bonus_c2 || 0,
                            })),
                            errorDiscount: data.totalErrorValue || 0,
                            triageDiscount: data.totalTriageDiscount || 0,
                            totalDailyRate: data.totalDailyRate || 0,
                            totalBonusB: data.totalBonusB || 0,
                            totalBonusC1: data.totalBonusC1 || 0,
                            totalBonusC2: data.totalBonusC2 || 0,
                            totalGross: data.totalEarnedGross || 0,
                            totalNet: data.totalEarned || 0,
                          });
                          toast.success('Holerite PDF gerado');
                        }}
                        className="text-green-600 hover:text-green-900"
                        title="Exportar holerite PDF"
                      >
                        Holerite PDF
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
                                    {(() => {
                                      const perType = bonusTypes.map(bt => ({
                                        bt,
                                        value: getBonusValueForType(payment, bt),
                                      }));
                                      const bonusTotal = Number(payment.bonus ?? 0);
                                      const sumParts = perType.reduce((s, p) => s + p.value, 0);
                                      const mismatch = Math.abs(bonusTotal - sumParts) > 0.009;

                                      return (
                                        <>
                                          {perType.map(({ bt, value }) => (
                                            <div key={bt.id} className="text-xs text-gray-600">
                                              Bônus {bt.code}: R$ {value.toFixed(2)}
                                            </div>
                                          ))}
                                          <div className="text-xs text-gray-700 font-medium border-t border-gray-200 mt-1 pt-1">
                                            Bônus Total: R$ {bonusTotal.toFixed(2)}
                                          </div>
                                          {mismatch && (
                                            <div
                                              className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1"
                                              title={`Soma por tipo = R$ ${sumParts.toFixed(2)} / Bônus salvo = R$ ${bonusTotal.toFixed(2)}`}
                                            >
                                              ⚠️ Valor editado manualmente
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                    {(() => {
                                      const errorRecord = data.errorRecords.find(err => err.date === payment.date);
                                      if (!errorRecord) return null;
                                      const isValueType = (errorRecord.error_type ?? 'quantity') === 'value';

                                      // Desconto total aplicado = diária + bônus - total pago
                                      const expectedValue = (payment.daily_rate || 0) + (payment.bonus || 0);
                                      const actualValue = payment.total || 0;
                                      const totalDiscount = expectedValue - actualValue;

                                      if (isValueType) {
                                        const valueDiscount = Number(errorRecord.error_value ?? 0);
                                        if (valueDiscount <= 0) return null;
                                        return (
                                          <div className="text-xs text-red-600">
                                            Desconto por erro (valor): -R$ {valueDiscount.toFixed(2)}
                                          </div>
                                        );
                                      }

                                      // quantity
                                      if (errorRecord.error_count === 0) return null;
                                      const valuePerError = totalDiscount > 0 ? totalDiscount / errorRecord.error_count : 0;
                                      return valuePerError > 0 ? (
                                        <div className="text-xs text-red-600">
                                          Desconto por erro ({errorRecord.error_count} unidades): -{errorRecord.error_count} × R$ {valuePerError.toFixed(2)} = -R$ {totalDiscount.toFixed(2)}
                                        </div>
                                      ) : null;
                                    })()}
                                    {(() => {
                                      const errForDay = data.errorRecords.find(err => err.date === payment.date);
                                      const valueDiscountForDay = errForDay?.error_type === 'value' ? Number(errForDay.error_value ?? 0) : 0;
                                      const rawTotal = Number(payment.total ?? 0);
                                      const displayTotal = Math.max(0, rawTotal - valueDiscountForDay);
                                      return (
                                        <div className="text-sm font-medium text-green-600">
                                          Total: R$ {displayTotal.toFixed(2).replace('.', ',')}
                                          {valueDiscountForDay > 0 && (
                                            <span className="text-[11px] text-gray-500 ml-2">
                                              (bruto R$ {rawTotal.toFixed(2).replace('.', ',')})
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    <div className="flex space-x-1 mt-2">
                                      {hasPermission('financial.editRate') && (
                                        <button
                                          onClick={() => handleEditPayment(data.employee.id, payment.date)}
                                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                          title="Editar pagamento"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                      )}
                                      {hasPermission('financial.delete') && (
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
                        
                        {data.triageDiscounts.length > 0 && (
                          <div className="mt-4">
                            <h4 className="font-medium text-gray-900 mb-2">Descontos de Triagem:</h4>
                            <div className="space-y-1">
                              {data.triageDiscounts.map((t, idx) => (
                                <div key={idx} className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                                  Desconto triagem (período {formatDateBR(t.period_start)} a {formatDateBR(t.period_end)}): <span className="font-semibold">-R$ {t.value_deducted.toFixed(2).replace('.', ',')}</span>
                                  <span className="text-xs text-gray-600 ml-2">({t.errors_share} erros)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {data.errorRecords.length > 0 && (
                          <div className="mt-4">
                            <h4 className="font-medium text-gray-900 mb-2">Erros Registrados:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {data.errorRecords.map((errorRecord) => {
                                const isValue = (errorRecord.error_type ?? 'quantity') === 'value';
                                return (
                                <div key={errorRecord.id} className="bg-red-50 p-3 rounded border border-red-200">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="text-sm font-medium">{formatDateBR(errorRecord.date)}</div>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      isValue ? 'bg-red-200 text-red-800' : 'bg-blue-100 text-blue-700'
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
                                </div>
                                );
                              })}
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

        {/* Mobile: cards */}
        <div className="md:hidden divide-y divide-gray-200">
          {displayedFinancialData.map((data) => (
            <div key={data.employee.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start gap-3 mb-3">
                {hasPermission('financial.editRate') && (
                  <input
                    type="checkbox"
                    checked={selectedEmployees.has(data.employee.id)}
                    onChange={() => toggleEmployeeSelection(data.employee.id)}
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{data.employee.name}</span>
                    <EmploymentTypeBadge type={data.employee.employment_type || undefined} />
                  </div>
                  <div className="text-xs text-gray-500">{formatCPF(data.employee.cpf)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-green-50 rounded p-2">
                  <span className="text-xs text-green-800 block">Dias Trab.</span>
                  <span className="text-sm font-semibold text-green-700">{data.workDays}</span>
                </div>
                <div className="bg-red-50 rounded p-2">
                  <span className="text-xs text-red-800 block">Faltas</span>
                  <span className="text-sm font-semibold text-red-700">{data.absences}</span>
                </div>
                <div className="bg-blue-50 rounded p-2">
                  <span className="text-xs text-blue-800 block">Saídas Pers.</span>
                  <span className="text-sm font-semibold text-blue-700">{data.customExitDays}</span>
                </div>
                <div className="bg-yellow-50 rounded p-2">
                  <span className="text-xs text-yellow-800 block">Erros</span>
                  <span className="text-sm font-semibold text-yellow-700">
                    {data.totalErrors > 0 || data.totalErrorValue > 0
                      ? `${data.totalErrors}${data.totalErrorValue > 0 ? ` + R$${data.totalErrorValue.toFixed(2)}` : ''}`
                      : '0'}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 rounded p-2 mb-3">
                <span className="text-xs text-gray-500 block">Total Ganho</span>
                <span className="text-base font-bold text-green-600">
                  R$ {data.totalEarned.toFixed(2).replace('.', ',')}
                </span>
                {(data.totalErrorValue > 0 || data.totalTriageDiscount > 0) && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Bruto: R$ {data.totalEarnedGross.toFixed(2).replace('.', ',')}
                    {data.totalErrorValue > 0 && <div className="text-red-600">-R$ {data.totalErrorValue.toFixed(2).replace('.', ',')} erro valor</div>}
                    {data.totalTriageDiscount > 0 && <div className="text-red-600">-R$ {data.totalTriageDiscount.toFixed(2).replace('.', ',')} triagem</div>}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  const row = document.getElementById(`payments-m-${data.employee.id}`);
                  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
                }}
                className="w-full px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors text-sm font-medium min-h-[44px]"
              >
                Ver Detalhes
              </button>

              <div id={`payments-m-${data.employee.id}`} style={{ display: 'none' }} className="mt-3 p-3 bg-gray-50 rounded-lg space-y-2">
                {data.payments.length > 0 ? (
                  data.payments.map((payment) => {
                    const bonusTotal = Number(payment.bonus ?? 0);
                    const perType = bonusTypes.map(bt => ({
                      bt,
                      value: getBonusValueForType(payment, bt),
                    }));
                    const inlineLabel = perType.length === 0
                      ? null
                      : perType
                          .map((p, i) => `${i === 0 ? `Bônus ${p.bt.code}` : p.bt.code}: R$ ${p.value.toFixed(2)}`)
                          .join(' · ');
                    return (
                      <div key={payment.id} className="bg-white p-3 rounded border text-sm">
                        <div className="font-medium mb-1">{formatDateBR(payment.date)}</div>
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <div>Diária: R$ {payment.daily_rate?.toFixed(2) || '0.00'}</div>
                          {inlineLabel && <div>{inlineLabel}</div>}
                          <div className="font-medium border-t border-gray-200 mt-1 pt-1">Bônus Total: R$ {bonusTotal.toFixed(2)}</div>
                        </div>
                        <div className="text-sm font-medium text-green-600 mt-1">
                          Total: R$ {Number(payment.total ?? 0).toFixed(2).replace('.', ',')}
                        </div>
                        <div className="flex gap-2 mt-2">
                          {hasPermission('financial.editRate') && (
                            <button
                              onClick={() => handleEditPayment(data.employee.id, payment.date)}
                              className="flex-1 py-2 bg-blue-50 text-blue-600 rounded text-xs font-medium min-h-[40px]"
                            >
                              <Edit2 className="w-3 h-3 inline mr-1" /> Editar
                            </button>
                          )}
                          {hasPermission('financial.delete') && (
                            <button
                              onClick={() => handleDeletePayment(payment.id)}
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
                  <p className="text-sm text-gray-500">Nenhum pagamento registrado.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {displayedFinancialData.length === 0 && (
          <div className="text-center py-8 px-4">
            <DollarSign className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Nenhum dado financeiro encontrado</h3>
            <p className="text-sm text-gray-500">
              {employeeSearch
                ? 'Tente ajustar o termo de busca.'
                : 'Ajuste os filtros ou aguarde mais registros serem criados.'}
            </p>
          </div>
        )}
      </div>
      )}

      {/* Histórico de Remoções de Bonificação */}
      {activeView === 'history' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 flex items-center">
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
            <>
            <div className="hidden md:block overflow-x-auto">
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
                  {displayedBonusRemovals.map((removal) => (
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

            </div>

            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-200">
              {displayedBonusRemovals.map((removal) => (
                <div key={removal.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{removal.employees?.name || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{removal.employees?.cpf ? formatCPF(removal.employees.cpf) : 'N/A'}</div>
                    </div>
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 whitespace-nowrap">
                      R$ {Number(removal.bonus_amount_removed).toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                    <div className="bg-gray-50 rounded p-2">
                      <span className="text-gray-500 block">Data Bonificação</span>
                      <span className="text-gray-800 font-medium">{formatDateBR(removal.date)}</span>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <span className="text-gray-500 block">Data Remoção</span>
                      <span className="text-gray-800 font-medium">{formatDateBR(removal.removed_at.split('T')[0])}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-700 mb-1"><strong>Removido por:</strong> {removal.removed_by}</div>
                  <div className="text-xs text-gray-700 break-words"><strong>Obs:</strong> {removal.observation}</div>
                </div>
              ))}
            </div>

            {displayedBonusRemovals.length === 0 && (
              <div className="text-center py-8 px-4">
                <History className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                  Nenhuma remoção de bonificação encontrada
                </h3>
                <p className="text-sm text-gray-500">
                  {historyEmployeeSearch
                    ? 'Tente ajustar o termo de busca.'
                    : 'Ajuste os filtros ou aguarde remoções serem registradas no período selecionado.'}
                </p>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Modal de Limpeza de Pagamentos */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl max-w-[95vw] sm:max-w-md w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-medium flex items-center text-red-600">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Limpar Pagamentos
              </h3>
              <button
                onClick={() => setShowClearModal(false)}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <button
                  onClick={handleClearPayments}
                  disabled={clearType === 'selected' && selectedEmployees.size === 0}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Confirmar Limpeza</span>
                </button>
                <button
                  onClick={() => setShowClearModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl max-w-[95vw] sm:max-w-md w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-medium flex items-center text-orange-600">
                <Minus className="w-5 h-5 mr-2" />
                Descontar por Erros
              </h3>
              <button
                onClick={() => setShowErrorDiscountModal(false)}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                  Valor do Desconto por Erro (R$) — apenas tipo Quantidade
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
                <p className="mt-1 text-xs text-gray-500">
                  Pode deixar vazio se os funcionários selecionados só têm erros tipo "Valor".
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Como funciona:</strong>
                </p>
                <ul className="text-sm text-yellow-800 list-disc pl-5 mt-1 space-y-0.5">
                  <li><strong>Tipo Quantidade:</strong> valor acima × quantidade de erros do dia.</li>
                  <li><strong>Tipo Valor:</strong> usa direto o valor em R$ registrado no erro.</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <button
                  onClick={handleErrorDiscount}
                  disabled={selectedEmployees.size === 0}
                  className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                >
                  Aplicar Desconto
                </button>
                <button
                  onClick={() => setShowErrorDiscountModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: aplicar banco de horas (combo G — sub-fase 2.17) */}
      {showApplyModal && selectedPeriodId && company && (
        <BankHoursApplyModal
          companyId={company.id}
          companyLabel={company.legal_name}
          paymentPeriodId={selectedPeriodId}
          period={periods.find(p => p.id === selectedPeriodId) ?? null}
          supervisorId={userId}
          onClose={() => setShowApplyModal(false)}
          onApplied={() => { setShowApplyModal(false); loadData(); }}
        />
      )}
    </div>
  );
};

// ─── Modal de aplicação de banco de horas ──────────────────────────────────
//
// Pré-popula preview ao abrir (chama previewBankHoursForPeriod no useEffect).
// Cada linha tem checkbox apply (default ON pra status='pending', OFF pra os
// outros). Override "Pular" exige motivo (textarea), e gera INSERT em
// bank_hours_overrides ANTES de aplicar.
//
// Submit em LOOP SEQUENCIAL (não paralelo) — evita race conditions sobre o
// mesmo payment row e mantém ordem dos logs de auditoria.

interface BankHoursApplyModalProps {
  companyId: string;
  companyLabel: string;
  paymentPeriodId: string;
  period: PaymentPeriod | null;
  supervisorId: string;
  onClose: () => void;
  onApplied: () => void;
}

const STATUS_LABELS: Record<BankHoursPreviewItem['status'], { label: string; cls: string }> = {
  pending:           { label: 'Pendente',          cls: 'text-blue-700 bg-blue-50' },
  already_applied:   { label: 'Já aplicado',       cls: 'text-gray-500 bg-gray-100' },
  no_payment:        { label: 'Sem pagamento',     cls: 'text-red-700 bg-red-50' },
  zero_balance:      { label: 'Saldo zero',        cls: 'text-amber-700 bg-amber-50' },
  override_skip:     { label: 'Override OFF',      cls: 'text-purple-700 bg-purple-50' },
  toggle_off:        { label: 'Desligado',         cls: 'text-gray-500 bg-gray-100' },
};

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BankHoursApplyModal: React.FC<BankHoursApplyModalProps> = ({
  companyId, companyLabel, paymentPeriodId, period, supervisorId, onClose, onApplied,
}) => {
  const [items, setItems] = useState<BankHoursPreviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Por-employee: aplicar (default ON pra pending), motivo do skip
  const [applyFlags, setApplyFlags] = useState<Record<string, boolean>>({});
  const [skipReasons, setSkipReasons] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    previewBankHoursForPeriod({ companyId, paymentPeriodId })
      .then((res) => {
        if (cancelled) return;
        setItems(res);
        // Default: aplicar só os 'pending' (status que muda valor de fato).
        const flags: Record<string, boolean> = {};
        for (const item of res) {
          flags[item.employeeId] = item.status === 'pending';
        }
        setApplyFlags(flags);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, paymentPeriodId]);

  // COMBO I FIX #1: contar skips com/sem motivo separadamente. Isso permite
  // habilitar o botão quando o usuário quer só salvar overrides (sem aplicar
  // nada), e bloquear submit enquanto há motivo pendente.
  const aggregated = useMemo(() => {
    let selected = 0, totalCredit = 0, totalDebit = 0;
    let skipsWithReason = 0, skipsWithoutReason = 0;
    for (const item of items) {
      if (item.status !== 'pending') continue;
      if (applyFlags[item.employeeId]) {
        selected++;
        if (item.valorAplicar > 0) totalCredit += item.valorAplicar;
        if (item.valorAplicar < 0) totalDebit += Math.abs(item.valorAplicar);
      } else {
        const reason = (skipReasons[item.employeeId] || '').trim();
        if (reason) skipsWithReason++;
        else skipsWithoutReason++;
      }
    }
    return { selected, totalCredit, totalDebit, net: totalCredit - totalDebit, skipsWithReason, skipsWithoutReason };
  }, [items, applyFlags, skipReasons]);

  const handleApply = async () => {
    const toApply = items.filter(i => applyFlags[i.employeeId] && i.status === 'pending');
    const toSkip = items.filter(i => !applyFlags[i.employeeId] && i.status === 'pending');

    // Validação: itens com skip precisam ter motivo
    for (const item of toSkip) {
      const reason = (skipReasons[item.employeeId] ?? '').trim();
      if (!reason) {
        toast.error(`Funcionário "${item.employeeName}": motivo do skip é obrigatório`);
        return;
      }
    }

    setProgress({ current: 0, total: toApply.length + toSkip.length });
    let success = 0, errors = 0, skipped = 0;

    // Skips primeiro: cria override OFF com motivo, NÃO aplica.
    for (const item of toSkip) {
      try {
        await createBankHoursOverride({
          companyId,
          employeeId: item.employeeId,
          paymentPeriodId,
          applyBankHours: false,
          reason: skipReasons[item.employeeId] ?? '',
          createdBy: supervisorId,
        });
        skipped++;
      } catch (err) {
        errors++;
        console.error(`Erro ao criar override pra ${item.employeeName}:`, err);
      }
      setProgress({ current: success + errors + skipped, total: toApply.length + toSkip.length });
    }

    // Apply em loop sequencial (evita race no mesmo payment).
    for (const item of toApply) {
      try {
        const res = await applyBankHoursToPayment({
          employeeId: item.employeeId,
          paymentPeriodId,
          supervisorId,
        });
        if (res.success && res.applied) success++;
        else errors++;
      } catch (err) {
        errors++;
        console.error(`Erro ao aplicar pra ${item.employeeName}:`, err);
      }
      setProgress({ current: success + errors + skipped, total: toApply.length + toSkip.length });
    }

    setProgress(null);
    if (errors === 0) {
      toast.success(`✅ ${success} aplicados${skipped > 0 ? ` · ${skipped} pulados` : ''}`);
    } else {
      toast.error(`⚠ ${success} aplicados · ${skipped} pulados · ${errors} erros`);
    }
    onApplied();
  };

  const periodLabel = period
    ? `${formatDateBR(period.start_date)} a ${formatDateBR(period.end_date)}`
    : '—';

  // COMBO I FIX #2: estado tri-state do checkbox "marcar todos pendentes" no header.
  const headerSelectAll = selectAllPendingState(items, applyFlags);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl max-w-[95vw] sm:max-w-5xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-600" />
              Aplicar Banco de Horas — Período {periodLabel}
            </h2>
            <p className="text-sm text-gray-600 mt-1">Empresa: {companyLabel}</p>
          </div>
          <button
            onClick={onClose}
            disabled={!!progress}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
            <span>Calculando preview…</span>
          </div>
        )}

        {!loading && errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
            Erro ao calcular preview: {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && items.length === 0 && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
            Nenhum funcionário ativo encontrado nesta empresa.
          </div>
        )}

        {!loading && !errorMessage && items.length > 0 && (
          <>
            {/* COMBO I FIX #3: banner quando 100% dos items já foram aplicados */}
            {shouldShowAllAppliedBanner(items) && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-3 text-sm text-amber-800 flex items-start gap-2">
                <span className="text-base leading-none">✓</span>
                <span>
                  Todos os {items.length} funcionário(s) deste período já tiveram banco de horas aplicado.
                  Não há nada a fazer aqui.
                </span>
              </div>
            )}

            {/* Tabela */}
            <div className="overflow-x-auto border border-gray-200 rounded-md">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700" aria-label="Aplicar">
                      {/* COMBO I FIX #2: checkbox tri-state pra marcar/desmarcar todos pendentes */}
                      <div className="flex items-center gap-2">
                        <input
                          ref={(el) => {
                            if (el) el.indeterminate = headerSelectAll.indeterminate;
                          }}
                          type="checkbox"
                          checked={headerSelectAll.checked}
                          disabled={!headerSelectAll.hasPending || !!progress}
                          onChange={(e) => {
                            setApplyFlags(prev => toggleAllPending(items, prev, e.target.checked));
                          }}
                          title="Marcar/desmarcar todos pendentes"
                          aria-label="Marcar todos pendentes"
                          className="w-4 h-4 rounded"
                        />
                        <span>Aplicar</span>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Funcionário</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Saldo</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Valor</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Líq. antes</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Líq. depois</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => {
                    const isPending = item.status === 'pending';
                    const isSelected = !!applyFlags[item.employeeId];
                    const statusInfo = STATUS_LABELS[item.status];
                    return (
                      <React.Fragment key={item.employeeId}>
                        <tr className={item.status === 'already_applied' ? 'bg-gray-50' : ''}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => setApplyFlags(prev => ({ ...prev, [item.employeeId]: e.target.checked }))}
                              disabled={!!progress || !isPending}
                              className="w-4 h-4 rounded"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">{item.employeeName}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${item.saldoMinutes > 0 ? 'text-green-700' : item.saldoMinutes < 0 ? 'text-red-700' : 'text-gray-500'}`}>
                            {item.saldoLabel}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {item.valorAplicar !== 0 ? formatBRL(item.valorAplicar) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                            {item.liquidoAntes ? formatBRL(item.liquidoAntes) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {item.liquidoDepois ? formatBRL(item.liquidoDepois) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs ${statusInfo.cls}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                        </tr>
                        {/* Linha de motivo do skip — aparece quando pending sem checkbox */}
                        {isPending && !isSelected && (
                          <tr className="bg-amber-50 border-t-0">
                            <td colSpan={7} className="px-3 py-2">
                              <label className="block text-xs text-amber-800 mb-1">
                                Motivo do skip <span className="text-red-600">*obrigatório</span>
                              </label>
                              <textarea
                                value={skipReasons[item.employeeId] ?? ''}
                                onChange={(e) => setSkipReasons(prev => ({ ...prev, [item.employeeId]: e.target.value }))}
                                placeholder="Ex: férias antecipadas, banco será aplicado em outro período, etc."
                                rows={2}
                                disabled={!!progress}
                                className="w-full px-2 py-1 text-sm border border-amber-300 rounded-md bg-white"
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Resumo agregado */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <div className="text-xs text-gray-600">Selecionados</div>
                  <div className="font-semibold">{aggregated.selected} / {items.length}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Total a creditar</div>
                  <div className="font-semibold text-green-700">{formatBRL(aggregated.totalCredit)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Total a debitar</div>
                  <div className="font-semibold text-red-700">-{formatBRL(aggregated.totalDebit)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Líquido geral</div>
                  <div className={`font-semibold ${aggregated.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {aggregated.net >= 0 ? '+' : ''}{formatBRL(aggregated.net)}
                  </div>
                </div>
              </div>
            </div>

            {/* Progresso durante apply */}
            {progress && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Aplicando {progress.current}/{progress.total}…</span>
              </div>
            )}
          </>
        )}

        {/* Botões */}
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          {/* COMBO I FIX #1: habilita quando há ações válidas (selected ou
              skips_com_motivo); bloqueia enquanto há skip sem motivo
              preenchido pra forçar fluxo correto na UI. */}
          <button
            onClick={handleApply}
            disabled={
              loading ||
              !!progress ||
              (aggregated.selected === 0 && aggregated.skipsWithReason === 0) ||
              aggregated.skipsWithoutReason > 0
            }
            className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            {progress
              ? 'Aplicando…'
              : (() => {
                  const sel = aggregated.selected;
                  const skip = aggregated.skipsWithReason;
                  const pending = aggregated.skipsWithoutReason;
                  let main: string;
                  if (sel === 0 && skip === 0) main = 'Aplicar selecionados (0)';
                  else if (sel > 0 && skip === 0) main = `Aplicar selecionados (${sel})`;
                  else if (sel === 0 && skip > 0) main = `Salvar overrides (${skip})`;
                  else main = `Aplicar (${sel}) + Salvar overrides (${skip})`;
                  return pending > 0 ? `${main} — preencha ${pending} motivo(s)` : main;
                })()}
          </button>
          <button
            onClick={onClose}
            disabled={!!progress}
            className="flex-1 sm:flex-none px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};