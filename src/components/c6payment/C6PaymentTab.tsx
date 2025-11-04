import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, RefreshCw, Download, Calendar, Edit2, Save, X, Trash2, Plus, Check } from 'lucide-react';
import { getAllEmployees, getPayments, Employee, Payment } from '../../services/database';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import { exportC6PaymentSheet } from '../../utils/c6Export';
import toast from 'react-hot-toast';

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
    endDate: getBrazilDate()
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
    if (!filters.startDate || !filters.endDate) {
      toast.error('Selecione o período para importação');
      return;
    }

    try {
      setLoading(true);
      const paymentsData = await getPayments(filters.startDate, filters.endDate, '');

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
    setEditingRowId(row.id);
    setEditValues({ ...row });
  };

  const handleSaveEdit = () => {
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
    if (!confirm('Tem certeza que deseja remover esta linha?')) return;
    setPaymentRows(prev => prev.filter(row => row.id !== id));
    toast.success('Linha removida');
  };

  const handleAddRow = () => {
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
    if (paymentRows.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }

    const invalidRows = paymentRows.filter(
      row => !row.employeeName.trim() || !row.pixKey.trim() || row.amount <= 0
    );

    if (invalidRows.length > 0) {
      toast.error('Existem linhas com dados inválidos. Corrija antes de exportar.');
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

  const totalAmount = paymentRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <FileSpreadsheet className="w-5 h-5 mr-2 text-blue-600" />
            Pagamento C6 Bank
          </h2>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Como usar:</strong> Selecione o período dos pagamentos já configurados na aba Financeiro,
            importe os dados, revise e edite conforme necessário, e baixe a planilha formatada para o Banco C6.
          </p>
        </div>

        {!dataImported ? (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">1. Importar Dados Financeiros</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div className="flex items-end">
                <button
                  onClick={importFinancialData}
                  disabled={loading || isEditingDate.startDate || isEditingDate.endDate}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
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
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">2. Revisar e Editar Pagamentos</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowBulkDateModal(true)}
                  disabled={selectedRows.size === 0}
                  className="px-3 py-2 text-sm bg-orange-50 text-orange-600 rounded-md hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Alterar Datas</span>
                </button>
                <button
                  onClick={handleAddRow}
                  className="px-3 py-2 text-sm bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors flex items-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar</span>
                </button>
                <button
                  onClick={handleClearData}
                  className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                >
                  Limpar Dados
                </button>
                <button
                  onClick={() => setDataImported(false)}
                  className="px-3 py-2 text-sm bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 transition-colors flex items-center space-x-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Reimportar</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={selectedRows.size === paymentRows.length && paymentRows.length > 0}
                          onChange={selectAllRows}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
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
                        <td className="px-4 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        {editingRowId === row.id ? (
                          <>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editValues?.employeeName || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, employeeName: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editValues?.pixKey || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, pixKey: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editValues?.amount || 0}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, amount: parseFloat(e.target.value) || 0 } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="date"
                                value={editValues?.paymentDate || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, paymentDate: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editValues?.description || ''}
                                onChange={(e) => setEditValues(prev => prev ? { ...prev, description: e.target.value } : null)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
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
                                <button
                                  onClick={() => handleEditRow(row)}
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRow(row.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleExportSpreadsheet}
                className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center space-x-2 text-lg font-medium"
              >
                <Download className="w-5 h-5" />
                <span>Baixar Planilha C6</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showBulkDateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center text-orange-600">
                <Calendar className="w-5 h-5 mr-2" />
                Alterar Data de Pagamento
              </h3>
              <button
                onClick={() => setShowBulkDateModal(false)}
                className="text-gray-400 hover:text-gray-600"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
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
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Alterar Selecionados
                </button>
                <button
                  onClick={handleChangeAllDates}
                  disabled={!bulkDate}
                  className="w-full px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Alterar Todos
                </button>
                <button
                  onClick={() => setShowBulkDateModal(false)}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center text-green-600">
                <Check className="w-5 h-5 mr-2" />
                Confirmar Exportação
              </h3>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-gray-400 hover:text-gray-600"
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

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={confirmExport}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Confirmar e Baixar</span>
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
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
