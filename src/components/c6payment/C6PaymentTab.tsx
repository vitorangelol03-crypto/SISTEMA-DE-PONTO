import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, RefreshCw, Download, Calendar, Edit2, Save, X, Trash2, Plus, Check, AlertTriangle, DollarSign, KeyRound, CheckCircle2 } from 'lucide-react';
import { getAllEmployees, getPayments, Employee, Payment } from '../../services/database';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import { exportC6PaymentSheet } from '../../utils/c6Export';
import toast from 'react-hot-toast';
import EmploymentTypeFilter, { EmploymentType, EmploymentTypeBadge } from '../common/EmploymentTypeFilter';

interface C6PaymentTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

interface PaymentRow {
  id: string;
  employeeName: string;
  pixKey: string;
  amount: number;
  paymentDate: string;
  description: string;
}

export const C6PaymentTab: React.FC<C6PaymentTabProps> = ({ userId, hasPermission }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataImported, setDataImported] = useState(false);

  const [filters, setFilters] = useState({
    startDate: getBrazilDate(),
    endDate: getBrazilDate(),
    employmentType: 'all' as EmploymentType
  });

  const [isEditingDate, setIsEditingDate] = useState({
    startDate: false,
    endDate: false
  });

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<PaymentRow | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showBulkDateModal, setShowBulkDateModal] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Modal de validação antes de gerar a planilha
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ rowId: string; field: 'amount' | 'pixKey' } | null>(null);
  const [inlineValue, setInlineValue] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const employeesData = await getAllEmployees();
      setEmployees(employeesData);
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
      toast.error('Erro ao carregar funcionários');
    }
  };

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleDateFocus = (field: 'startDate' | 'endDate') => {
    setIsEditingDate(prev => ({ ...prev, [field]: true }));
  };

  const handleDateBlur = (field: 'startDate' | 'endDate') => {
    setIsEditingDate(prev => ({ ...prev, [field]: false }));
  };

  const getNextDay = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  };

  const importFinancialData = async () => {
    if (!hasPermission('c6payment.import')) {
      toast.error('Você não tem permissão para importar dados financeiros');
      return;
    }

    if (!filters.startDate || !filters.endDate) {
      toast.error('Selecione o período para importação');
      return;
    }

    try {
      setLoading(true);
      const employmentType = filters.employmentType === 'all' ? undefined : filters.employmentType;
      const paymentsData = await getPayments(filters.startDate, filters.endDate, '', employmentType);

      if (paymentsData.length === 0) {
        toast.error('Nenhum pagamento encontrado no período selecionado');
        return;
      }

      const employeePaymentMap = new Map<string, { employee: Employee; total: number; }>();

      paymentsData.forEach(payment => {
        const employee = employees.find(e => e.id === payment.employee_id);
        if (!employee) return;

        if (!employeePaymentMap.has(employee.id)) {
          employeePaymentMap.set(employee.id, {
            employee,
            total: 0
          });
        }

        const current = employeePaymentMap.get(employee.id)!;
        current.total += payment.total || 0;
      });

      const missingPixKeys: string[] = [];
      const rows: PaymentRow[] = [];
      const nextDay = getNextDay(getBrazilDate());

      employeePaymentMap.forEach(({ employee, total }) => {
        if (!employee.pix_key) {
          missingPixKeys.push(employee.name);
          return;
        }

        rows.push({
          id: employee.id,
          employeeName: employee.name,
          pixKey: employee.pix_key,
          amount: total,
          paymentDate: nextDay,
          description: `Pagamento ref. ${formatDateBR(filters.startDate)} a ${formatDateBR(filters.endDate)}`
        });
      });

      if (missingPixKeys.length > 0) {
        toast.error(
          `Funcionários sem chave PIX cadastrada: ${missingPixKeys.join(', ')}`,
          { duration: 5000 }
        );
      }

      if (rows.length === 0) {
        toast.error('Nenhum funcionário com chave PIX cadastrada encontrado');
        return;
      }

      setPaymentRows(rows);
      setDataImported(true);
      toast.success(`${rows.length} pagamento(s) importado(s) com sucesso!`);
    } catch (error) {
      console.error('Erro ao importar dados:', error);
      toast.error('Erro ao importar dados financeiros');
    } finally {
      setLoading(false);
    }
  };

  const handleEditRow = (row: PaymentRow) => {
    if (!hasPermission('c6payment.edit')) {
      toast.error('Você não tem permissão para editar linhas de pagamento');
      return;
    }

    setEditingRowId(row.id);
    setEditValues({ ...row });
  };

  const handleSaveEdit = () => {
    if (!hasPermission('c6payment.edit')) {
      toast.error('Você não tem permissão para salvar alterações');
      return;
    }

    if (!editValues) return;

    if (!editValues.employeeName.trim()) {
      toast.error('Nome do funcionário é obrigatório');
      return;
    }

    if (!editValues.pixKey.trim()) {
      toast.error('Chave PIX é obrigatória');
      return;
    }

    if (editValues.amount <= 0) {
      toast.error('Valor deve ser maior que zero');
      return;
    }

    setPaymentRows(prev =>
      prev.map(row => (row.id === editingRowId ? editValues : row))
    );
    setEditingRowId(null);
    setEditValues(null);
    toast.success('Linha atualizada com sucesso!');
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditValues(null);
  };

  const handleDeleteRow = (id: string) => {
    if (!hasPermission('c6payment.delete')) {
      toast.error('Você não tem permissão para excluir linhas de pagamento');
      return;
    }

    if (!confirm('Tem certeza que deseja remover esta linha?')) return;
    setPaymentRows(prev => prev.filter(row => row.id !== id));
    toast.success('Linha removida');
  };

  const handleAddRow = () => {
    if (!hasPermission('c6payment.edit')) {
      toast.error('Você não tem permissão para adicionar linhas de pagamento');
      return;
    }

    const newRow: PaymentRow = {
      id: `manual-${Date.now()}`,
      employeeName: '',
      pixKey: '',
      amount: 0,
      paymentDate: getNextDay(getBrazilDate()),
      description: ''
    };
    setPaymentRows(prev => [...prev, newRow]);
    setEditingRowId(newRow.id);
    setEditValues(newRow);
  };

  const toggleRowSelection = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const selectAllRows = () => {
    if (selectedRows.size === paymentRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paymentRows.map(row => row.id)));
    }
  };

  const handleBulkDateChange = () => {
    if (!hasPermission('c6payment.bulkEdit')) {
      toast.error('Você não tem permissão para alterar datas em lote');
      return;
    }

    if (selectedRows.size === 0) {
      toast.error('Selecione pelo menos uma linha');
      return;
    }

    if (!bulkDate) {
      toast.error('Selecione uma data');
      return;
    }

    setPaymentRows(prev =>
      prev.map(row =>
        selectedRows.has(row.id) ? { ...row, paymentDate: bulkDate } : row
      )
    );

    setShowBulkDateModal(false);
    setBulkDate('');
    setSelectedRows(new Set());
    toast.success(`Data alterada para ${selectedRows.size} linha(s)`);
  };

  const handleChangeAllDates = () => {
    if (!hasPermission('c6payment.bulkEdit')) {
      toast.error('Você não tem permissão para alterar datas em lote');
      return;
    }

    if (!bulkDate) {
      toast.error('Selecione uma data');
      return;
    }

    setPaymentRows(prev =>
      prev.map(row => ({ ...row, paymentDate: bulkDate }))
    );

    setShowBulkDateModal(false);
    setBulkDate('');
    toast.success(`Data alterada para todas as linhas`);
  };

  const handleClearData = () => {
    if (!confirm('Tem certeza que deseja limpar todos os dados importados?')) return;
    setPaymentRows([]);
    setDataImported(false);
    setSelectedRows(new Set());
    toast.success('Dados limpos');
  };

  const handleExportSpreadsheet = () => {
    if (!hasPermission('c6payment.export')) {
      toast.error('Você não tem permissão para exportar planilhas C6');
      return;
    }

    if (paymentRows.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }

    const hasInvalid = paymentRows.some(
      row => !row.pixKey.trim() || row.amount <= 0
    );

    if (hasInvalid) {
      setInlineEdit(null);
      setInlineValue('');
      setShowValidationModal(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmExport = async () => {
    try {
      await exportC6PaymentSheet(paymentRows, filters.startDate, filters.endDate);
      setShowConfirmModal(false);
      toast.success('Planilha gerada com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar planilha:', error);
      toast.error('Erro ao gerar planilha');
    }
  };

  // ── Validation modal helpers ─────────────────────────────────────────────
  const invalidIssues = paymentRows
    .map(row => {
      const reasons: Array<'zero' | 'pix'> = [];
      if (row.amount <= 0) reasons.push('zero');
      if (!row.pixKey.trim()) reasons.push('pix');
      return reasons.length > 0 ? { row, reasons } : null;
    })
    .filter((x): x is { row: PaymentRow; reasons: Array<'zero' | 'pix'> } => x !== null);

  const openInlineEdit = (rowId: string, field: 'amount' | 'pixKey') => {
    const row = paymentRows.find(r => r.id === rowId);
    if (!row) return;
    setInlineEdit({ rowId, field });
    setInlineValue(field === 'amount' ? (row.amount > 0 ? row.amount.toString() : '') : row.pixKey);
  };

  const confirmInlineEdit = () => {
    if (!inlineEdit) return;
    if (inlineEdit.field === 'amount') {
      const parsed = parseFloat(inlineValue.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error('Valor deve ser maior que zero');
        return;
      }
      setPaymentRows(prev => prev.map(r => r.id === inlineEdit.rowId ? { ...r, amount: parsed } : r));
    } else {
      const trimmed = inlineValue.trim();
      if (!trimmed) {
        toast.error('Chave PIX não pode ficar vazia');
        return;
      }
      setPaymentRows(prev => prev.map(r => r.id === inlineEdit.rowId ? { ...r, pixKey: trimmed } : r));
    }
    setInlineEdit(null);
    setInlineValue('');
  };

  const cancelInlineEdit = () => {
    setInlineEdit(null);
    setInlineValue('');
  };

  const removeFromBatch = (rowId: string) => {
    setPaymentRows(prev => prev.filter(r => r.id !== rowId));
    if (inlineEdit?.rowId === rowId) cancelInlineEdit();
  };

  const handleGenerateAnyway = async () => {
    const validRows = paymentRows.filter(r => r.amount > 0 && r.pixKey.trim());
    if (validRows.length === 0) {
      toast.error('Nenhum funcionário válido para exportar');
      return;
    }
    try {
      await exportC6PaymentSheet(validRows, filters.startDate, filters.endDate);
      setShowValidationModal(false);
      toast.success(`Planilha gerada com ${validRows.length} funcionário(s) válido(s)`);
    } catch (error) {
      console.error('Erro ao gerar planilha:', error);
      toast.error('Erro ao gerar planilha');
    }
  };

  const handleGenerateClean = async () => {
    try {
      await exportC6PaymentSheet(paymentRows, filters.startDate, filters.endDate);
      setShowValidationModal(false);
      toast.success('Planilha gerada com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar planilha:', error);
      toast.error('Erro ao gerar planilha');
    }
  };

  const totalAmount = paymentRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center">
            <FileSpreadsheet className="w-5 h-5 mr-2 text-blue-600 flex-shrink-0" />
            <span className="break-words">Pagamento C6 Bank</span>
          </h2>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 sm:p-4 mb-4">
          <p className="text-sm text-blue-800 break-words">
            <strong>Como usar:</strong> Selecione o período dos pagamentos já configurados na aba Financeiro,
            importe os dados, revise e edite conforme necessário, e baixe a planilha formatada para o Banco C6.
          </p>
        </div>

        {!dataImported ? (
          <div className="space-y-4">
            <h3 className="text-base sm:text-lg font-medium">1. Importar Dados Financeiros</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm"
                />
              </div>

              <EmploymentTypeFilter
                value={filters.employmentType}
                onChange={(value) => setFilters(prev => ({ ...prev, employmentType: value }))}
                showLabel={true}
              />

              <div className="flex items-end">
                <button
                  onClick={importFinancialData}
                  disabled={!hasPermission('c6payment.import') || loading || isEditingDate.startDate || isEditingDate.endDate}
                  title={!hasPermission('c6payment.import') ? 'Você não tem permissão para importar dados financeiros' : ''}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300 min-h-[44px]"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Importando...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Importar Dados</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <h3 className="text-base sm:text-lg font-medium break-words">2. Revisar e Editar Pagamentos</h3>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <button
                  onClick={() => setShowBulkDateModal(true)}
                  disabled={!hasPermission('c6payment.bulkEdit') || selectedRows.size === 0}
                  title={!hasPermission('c6payment.bulkEdit') ? 'Você não tem permissão para alterar datas em lote' : ''}
                  className="w-full sm:w-auto px-3 py-2 text-sm bg-orange-50 text-orange-600 rounded-md hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 min-h-[44px]"
                >
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>Alterar Datas</span>
                </button>
                <button
                  onClick={handleAddRow}
                  disabled={!hasPermission('c6payment.edit')}
                  title={!hasPermission('c6payment.edit') ? 'Você não tem permissão para adicionar linhas' : ''}
                  className="w-full sm:w-auto px-3 py-2 text-sm bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors flex items-center justify-center gap-1 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span>Adicionar</span>
                </button>
                <button
                  onClick={handleClearData}
                  disabled={!hasPermission('c6payment.delete')}
                  title={!hasPermission('c6payment.delete') ? 'Você não tem permissão para limpar dados' : ''}
                  className="w-full sm:w-auto px-3 py-2 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] flex items-center justify-center"
                >
                  Limpar Dados
                </button>
                <button
                  onClick={() => setDataImported(false)}
                  disabled={!hasPermission('c6payment.import')}
                  title={!hasPermission('c6payment.import') ? 'Você não tem permissão para reimportar dados' : ''}
                  className="w-full sm:w-auto px-3 py-2 text-sm bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  <RefreshCw className="w-4 h-4 flex-shrink-0" />
                  <span>Reimportar</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Desktop: tabela */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {hasPermission('c6payment.bulkEdit') && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={selectedRows.size === paymentRows.length && paymentRows.length > 0}
                            onChange={selectAllRows}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nome do Funcionário
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Chave PIX
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor (R$)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data Pagamento
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paymentRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        {hasPermission('c6payment.bulkEdit') && (
                          <td className="px-4 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.id)}
                              onChange={() => toggleRowSelection(row.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        {editingRowId === row.id ? (
                          <>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editValues?.employeeName || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, employeeName: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded min-h-[36px]"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editValues?.pixKey || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, pixKey: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded min-h-[36px]"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editValues?.amount || 0}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, amount: parseFloat(e.target.value) || 0 } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded min-h-[36px]"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="date"
                                value={editValues?.paymentDate || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, paymentDate: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded min-h-[36px]"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editValues?.description || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, description: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded min-h-[36px]"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex justify-end space-x-2">
                                <button
                                  onClick={handleSaveEdit}
                                  className="text-green-600 hover:text-green-900"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="text-gray-600 hover:text-gray-900"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {row.employeeName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {row.pixKey}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              R$ {row.amount.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDateBR(row.paymentDate)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {row.description}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex justify-end space-x-2">
                                {hasPermission('c6payment.edit') && (
                                  <button
                                    onClick={() => handleEditRow(row)}
                                    className="text-blue-600 hover:text-blue-900"
                                    title="Editar linha"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {hasPermission('c6payment.delete') && (
                                  <button
                                    onClick={() => handleDeleteRow(row.id)}
                                    className="text-red-600 hover:text-red-900"
                                    title="Excluir linha"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-sm font-medium text-gray-900">
                        Total: {paymentRows.length} pagamento(s)
                      </td>
                      <td colSpan={4} className="px-6 py-4 text-sm font-bold text-green-600 text-right">
                        R$ {totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile: cards */}
              <div className="md:hidden divide-y divide-gray-200">
                {paymentRows.map((row) => (
                  <div key={row.id} className="p-4 hover:bg-gray-50 overflow-hidden">
                    {editingRowId === row.id ? (
                      <div className="space-y-3">
                        {hasPermission('c6payment.bulkEdit') && (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.id)}
                              onChange={() => toggleRowSelection(row.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                            />
                            <span className="text-xs text-gray-500">Selecionar</span>
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
                          <input
                            type="text"
                            value={editValues?.employeeName || ''}
                            onChange={(e) => setEditValues(prev => prev ? { ...prev, employeeName: e.target.value } : null)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded min-h-[44px]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Chave PIX</label>
                          <input
                            type="text"
                            value={editValues?.pixKey || ''}
                            onChange={(e) => setEditValues(prev => prev ? { ...prev, pixKey: e.target.value } : null)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded min-h-[44px]"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Valor (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editValues?.amount || 0}
                              onChange={(e) => setEditValues(prev => prev ? { ...prev, amount: parseFloat(e.target.value) || 0 } : null)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded min-h-[44px]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
                            <input
                              type="date"
                              value={editValues?.paymentDate || ''}
                              onChange={(e) => setEditValues(prev => prev ? { ...prev, paymentDate: e.target.value } : null)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded min-h-[44px]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                          <input
                            type="text"
                            value={editValues?.description || ''}
                            onChange={(e) => setEditValues(prev => prev ? { ...prev, description: e.target.value } : null)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded min-h-[44px]"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={handleSaveEdit}
                            className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-green-50 text-green-700 rounded-md hover:bg-green-100 text-sm font-medium min-h-[44px]"
                          >
                            <Save className="w-4 h-4" />
                            Salvar
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium min-h-[44px]"
                          >
                            <X className="w-4 h-4" />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-2 mb-3">
                          {hasPermission('c6payment.bulkEdit') && (
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.id)}
                              onChange={() => toggleRowSelection(row.id)}
                              className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5 flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 break-words">{row.employeeName}</div>
                            <div className="text-xs text-gray-500 break-all mt-0.5">{row.pixKey}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-green-50 rounded p-2">
                            <span className="text-xs text-green-800 block">Valor</span>
                            <span className="text-sm font-semibold text-green-700">R$ {row.amount.toFixed(2)}</span>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <span className="text-xs text-gray-500 block">Data</span>
                            <span className="text-sm text-gray-800">{formatDateBR(row.paymentDate)}</span>
                          </div>
                        </div>

                        {row.description && (
                          <div className="text-xs text-gray-600 mb-3 break-words">
                            <strong>Descrição:</strong> {row.description}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          {hasPermission('c6payment.edit') && (
                            <button
                              onClick={() => handleEditRow(row)}
                              className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 text-sm font-medium min-h-[44px]"
                            >
                              <Edit2 className="w-4 h-4 flex-shrink-0" />
                              Editar
                            </button>
                          )}
                          {hasPermission('c6payment.delete') && (
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 text-sm font-medium min-h-[44px]"
                            >
                              <Trash2 className="w-4 h-4 flex-shrink-0" />
                              Excluir
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <div className="p-4 bg-gray-50 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">Total: {paymentRows.length} pagamento(s)</span>
                  <span className="text-sm font-bold text-green-600">R$ {totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-stretch sm:justify-end">
              <button
                onClick={handleExportSpreadsheet}
                disabled={!hasPermission('c6payment.export')}
                title={!hasPermission('c6payment.export') ? 'Você não tem permissão para exportar planilhas C6' : ''}
                className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2 text-base sm:text-lg font-medium disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
              >
                <Download className="w-5 h-5" />
                <span>Baixar Planilha C6</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showBulkDateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl max-w-[95vw] sm:max-w-md w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-medium flex items-center text-orange-600">
                <Calendar className="w-5 h-5 mr-2" />
                Alterar Data de Pagamento
              </h3>
              <button
                onClick={() => setShowBulkDateModal(false)}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nova Data de Pagamento
                </label>
                <input
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 min-h-[44px] text-sm"
                  autoFocus
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  {selectedRows.size > 0
                    ? `${selectedRows.size} linha(s) selecionada(s)`
                    : 'Nenhuma linha selecionada'}
                </p>
              </div>

              <div className="flex flex-col space-y-2">
                <button
                  onClick={handleBulkDateChange}
                  disabled={!bulkDate || selectedRows.size === 0}
                  className="w-full px-4 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                >
                  Alterar Selecionados
                </button>
                <button
                  onClick={handleChangeAllDates}
                  disabled={!bulkDate}
                  className="w-full px-4 py-3 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                >
                  Alterar Todos
                </button>
                <button
                  onClick={() => setShowBulkDateModal(false)}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl max-w-[95vw] sm:max-w-md w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-medium flex items-center text-green-600">
                <Check className="w-5 h-5 mr-2" />
                Confirmar Exportação
              </h3>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-sm text-green-800 mb-2">
                  <strong>Resumo da Exportação:</strong>
                </p>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Pagamentos: {paymentRows.length}</li>
                  <li>• Valor Total: R$ {totalAmount.toFixed(2)}</li>
                  <li>• Período: {formatDateBR(filters.startDate)} a {formatDateBR(filters.endDate)}</li>
                </ul>
              </div>

              <p className="text-sm text-gray-600">
                A planilha será gerada no formato exato do Banco C6 e o download iniciará automaticamente.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <button
                  onClick={confirmExport}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Download className="w-4 h-4" />
                  <span>Confirmar e Baixar</span>
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showValidationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-xl w-full max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b">
              <h3 className="text-base sm:text-lg font-semibold flex items-center text-amber-700">
                <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                {invalidIssues.length > 0 ? 'Atenção — Dados Inválidos' : 'Tudo pronto para exportar'}
              </h3>
              <button
                onClick={() => { setShowValidationModal(false); cancelInlineEdit(); }}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
              {invalidIssues.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-sm text-gray-700">
                    Todos os problemas foram resolvidos. Clique em <strong>Gerar Planilha</strong> para baixar.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    Os seguintes funcionários têm problemas:
                  </p>
                  <div className="space-y-2">
                    {invalidIssues.map(({ row, reasons }) => {
                      const zero = reasons.includes('zero');
                      const noPix = reasons.includes('pix');
                      const reasonLabel = zero && noPix
                        ? 'Valor zerado e sem chave PIX'
                        : zero
                        ? 'Valor zerado'
                        : 'Sem chave PIX';
                      const isEditingThis = inlineEdit?.rowId === row.id;
                      return (
                        <div key={row.id} className="border border-amber-200 bg-amber-50 rounded-md p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 break-words">
                                {row.employeeName || '(Sem nome)'}
                              </p>
                              <p className="text-xs text-amber-700 mt-0.5">{reasonLabel}</p>
                              {!noPix && (
                                <p className="text-xs text-gray-500 mt-0.5 break-all">PIX: {row.pixKey}</p>
                              )}
                              {!zero && (
                                <p className="text-xs text-gray-500 mt-0.5">Valor: R$ {row.amount.toFixed(2)}</p>
                              )}
                            </div>
                          </div>

                          {isEditingThis ? (
                            <div className="mt-2 space-y-2">
                              <label className="block text-xs font-medium text-gray-700">
                                {inlineEdit.field === 'amount' ? 'Novo valor (R$)' : 'Nova chave PIX'}
                              </label>
                              <div className="flex gap-2">
                                <input
                                  autoFocus
                                  type={inlineEdit.field === 'amount' ? 'number' : 'text'}
                                  step={inlineEdit.field === 'amount' ? '0.01' : undefined}
                                  min={inlineEdit.field === 'amount' ? '0.01' : undefined}
                                  value={inlineValue}
                                  onChange={(e) => setInlineValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') confirmInlineEdit(); }}
                                  placeholder={inlineEdit.field === 'amount' ? '0.00' : 'Chave PIX'}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[44px]"
                                />
                                <button
                                  onClick={confirmInlineEdit}
                                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium min-h-[44px] flex items-center gap-1"
                                >
                                  <Save className="w-4 h-4" />
                                  Salvar
                                </button>
                                <button
                                  onClick={cancelInlineEdit}
                                  className="px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm min-h-[44px] flex items-center"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row gap-2 mt-2">
                              {zero && (
                                <button
                                  onClick={() => openInlineEdit(row.id, 'amount')}
                                  className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-green-50 text-green-700 rounded-md hover:bg-green-100 text-sm font-medium min-h-[44px] w-full sm:w-auto"
                                >
                                  <DollarSign className="w-4 h-4" />
                                  Inserir Valor
                                </button>
                              )}
                              {noPix && (
                                <button
                                  onClick={() => openInlineEdit(row.id, 'pixKey')}
                                  className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 text-sm font-medium min-h-[44px] w-full sm:w-auto"
                                >
                                  <KeyRound className="w-4 h-4" />
                                  Editar PIX
                                </button>
                              )}
                              <button
                                onClick={() => removeFromBatch(row.id)}
                                className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 text-sm font-medium min-h-[44px] w-full sm:w-auto"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remover
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 pt-2">
                    Resolva os problemas para continuar ou gere ignorando os funcionários com dados inválidos.
                  </p>
                </>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={() => { setShowValidationModal(false); cancelInlineEdit(); }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Cancelar
                </button>
                {invalidIssues.length === 0 ? (
                  <button
                    onClick={handleGenerateClean}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2 min-h-[44px] font-medium"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Gerar Planilha
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAnyway}
                    disabled={paymentRows.filter(r => r.amount > 0 && r.pixKey.trim()).length === 0}
                    className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 min-h-[44px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-5 h-5" />
                    Gerar mesmo assim
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
