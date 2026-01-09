import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Search, CreditCard as Edit2, Trash2, RefreshCw, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react';
import { getAllEmployees, createEmployee, updateEmployee, deleteEmployee, Employee, bulkCreateEmployees } from '../../services/database';
import { validateCPF, formatCPF } from '../../utils/validation';
import { generateEmployeeTemplate, parseEmployeeSpreadsheet, generateErrorReport, generateImportReport, ImportValidationResult } from '../../utils/employeeImport';
import toast from 'react-hot-toast';

interface EmployeesTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

export const EmployeesTab: React.FC<EmployeesTabProps> = ({ userId, hasPermission }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    pixKey: '',
    pixType: '',
    address: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: ''
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importValidation, setImportValidation] = useState<ImportValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await getAllEmployees();
      setEmployees(data);
      setFilteredEmployees(data);
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
      toast.error('Erro ao carregar funcionários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    const filtered = employees.filter(employee => {
      const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.cpf.includes(searchTerm.replace(/\D/g, ''));

      const matchesCity = !cityFilter || employee.city?.toLowerCase().includes(cityFilter.toLowerCase());
      const matchesState = !stateFilter || employee.state === stateFilter;

      return matchesSearch && matchesCity && matchesState;
    });
    setFilteredEmployees(filtered);
  }, [searchTerm, cityFilter, stateFilter, employees]);

  const resetForm = () => {
    setFormData({
      name: '',
      cpf: '',
      pixKey: '',
      pixType: '',
      address: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: ''
    });
    setEditingEmployee(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || formData.name.trim().length < 3) {
      toast.error('Nome deve ter pelo menos 3 caracteres');
      return;
    }

    if (!validateCPF(formData.cpf)) {
      toast.error('CPF inválido');
      return;
    }

    try {
      const cpfNumbers = formData.cpf.replace(/\D/g, '');

      if (editingEmployee) {
        await updateEmployee(
          editingEmployee.id,
          formData.name.trim(),
          cpfNumbers,
          formData.pixKey.trim() || null,
          userId,
          formData.pixType.trim() || null,
          formData.address.trim() || null,
          formData.neighborhood.trim() || null,
          formData.city.trim() || null,
          formData.state.trim() || null,
          formData.zipCode.trim() || null
        );
        toast.success('Funcionário atualizado com sucesso!');
      } else {
        await createEmployee(
          formData.name.trim(),
          cpfNumbers,
          formData.pixKey.trim() || null,
          userId,
          formData.pixType.trim() || null,
          formData.address.trim() || null,
          formData.neighborhood.trim() || null,
          formData.city.trim() || null,
          formData.state.trim() || null,
          formData.zipCode.trim() || null
        );
        toast.success('Funcionário cadastrado com sucesso!');
      }

      resetForm();
      loadEmployees();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar funcionário';
      toast.error(errorMessage);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      cpf: formatCPF(employee.cpf),
      pixKey: employee.pix_key || '',
      pixType: employee.pix_type || '',
      address: employee.address || '',
      neighborhood: employee.neighborhood || '',
      city: employee.city || '',
      state: employee.state || '',
      zipCode: employee.zip_code || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (employee: Employee) => {
    if (!confirm(`Tem certeza que deseja excluir ${employee.name}?\n\nEsta ação também removerá todo o histórico de ponto deste funcionário.`)) {
      return;
    }

    try {
      await deleteEmployee(employee.id, userId);
      toast.success('Funcionário excluído com sucesso!');
      loadEmployees();
    } catch (error) {
      console.error('Erro ao excluir funcionário:', error);
      toast.error('Erro ao excluir funcionário');
    }
  };

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    setFormData(prev => ({ ...prev, cpf: formatted }));
  };

  const handleDownloadTemplate = () => {
    try {
      generateEmployeeTemplate();
      toast.success('Template baixado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar template:', error);
      toast.error('Erro ao gerar template');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Formato inválido. Use arquivos .xlsx ou .xls');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Tamanho máximo: 5MB');
      return;
    }

    setImportFile(file);
  };

  const handleProcessFile = async () => {
    if (!importFile) return;

    try {
      setImporting(true);
      const result = await parseEmployeeSpreadsheet(importFile);

      if (result.valid.length === 0 && result.errors.length === 0) {
        toast.error('Planilha vazia ou sem dados válidos');
        return;
      }

      setImportValidation(result);
      setImportStep('preview');

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} erro(s) encontrado(s) na planilha`);
      } else {
        toast.success(`${result.valid.length} funcionário(s) válido(s) encontrado(s)`);
      }
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao processar arquivo');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadErrors = () => {
    if (!importValidation) return;
    try {
      generateErrorReport(importValidation.errors, importValidation.duplicateCPFs);
      toast.success('Relatório de erros baixado!');
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro ao gerar relatório de erros');
    }
  };

  const handleConfirmImport = async () => {
    if (!importValidation || importValidation.valid.length === 0) return;

    try {
      setImporting(true);
      const result = await bulkCreateEmployees(importValidation.valid, userId);

      setImportResult({
        success: result.success.length,
        errors: result.errors.length
      });

      setImportStep('result');

      if (result.success.length > 0) {
        toast.success(`${result.success.length} funcionário(s) importado(s) com sucesso!`);
        loadEmployees();
      }

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} erro(s) durante a importação`);
        const successData = result.success.map(emp => ({ name: emp.name, cpf: emp.cpf }));
        generateImportReport(result.success.length, result.errors.length, successData, result.errors);
      }
    } catch (error) {
      console.error('Erro na importação:', error);
      toast.error('Erro ao importar funcionários');
    } finally {
      setImporting(false);
    }
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportValidation(null);
    setImportStep('upload');
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-600" />
              Funcionários ({employees.length})
            </h2>
          </div>

          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por nome ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Filtrar por cidade..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
              />
            </div>

            <div className="relative w-full">
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
              >
                <option value="">Todos os estados</option>
                <option value="AC">Acre</option>
                <option value="AL">Alagoas</option>
                <option value="AP">Amapá</option>
                <option value="AM">Amazonas</option>
                <option value="BA">Bahia</option>
                <option value="CE">Ceará</option>
                <option value="DF">Distrito Federal</option>
                <option value="ES">Espírito Santo</option>
                <option value="GO">Goiás</option>
                <option value="MA">Maranhão</option>
                <option value="MT">Mato Grosso</option>
                <option value="MS">Mato Grosso do Sul</option>
                <option value="MG">Minas Gerais</option>
                <option value="PA">Pará</option>
                <option value="PB">Paraíba</option>
                <option value="PR">Paraná</option>
                <option value="PE">Pernambuco</option>
                <option value="PI">Piauí</option>
                <option value="RJ">Rio de Janeiro</option>
                <option value="RN">Rio Grande do Norte</option>
                <option value="RS">Rio Grande do Sul</option>
                <option value="RO">Rondônia</option>
                <option value="RR">Roraima</option>
                <option value="SC">Santa Catarina</option>
                <option value="SP">São Paulo</option>
                <option value="SE">Sergipe</option>
                <option value="TO">Tocantins</option>
              </select>
            </div>
          </div>

          {(cityFilter || stateFilter) && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Filtros ativos:</span>
              {cityFilter && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  Cidade: {cityFilter}
                  <button
                    onClick={() => setCityFilter('')}
                    className="hover:text-blue-900"
                  >
                    ✕
                  </button>
                </span>
              )}
              {stateFilter && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  Estado: {stateFilter}
                  <button
                    onClick={() => setStateFilter('')}
                    className="hover:text-blue-900"
                  >
                    ✕
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setCityFilter('');
                  setStateFilter('');
                }}
                className="text-sm text-gray-600 hover:text-gray-800 underline"
              >
                Limpar todos
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {hasPermission('employees.import') && (
              <button
                onClick={() => setShowImportModal(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors min-h-[48px] font-medium"
              >
                <Upload className="w-4 h-4" />
                <span>Importar</span>
              </button>
            )}

            {hasPermission('employees.create') && (
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[48px] font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Funcionário</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">
              {editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
            </h3>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="Digite o nome completo"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CPF *
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => handleCPFChange(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chave PIX (opcional)
                </label>
                <input
                  type="text"
                  value={formData.pixKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, pixKey: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="Digite a chave PIX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Chave PIX (opcional)
                </label>
                <select
                  value={formData.pixType}
                  onChange={(e) => setFormData(prev => ({ ...prev, pixType: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                >
                  <option value="">Selecione o tipo</option>
                  <option value="CPF">CPF</option>
                  <option value="Email">Email</option>
                  <option value="Telefone">Telefone</option>
                  <option value="Aleatória">Chave Aleatória</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Endereço (opcional)
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="Rua, número, complemento"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bairro (opcional)
                </label>
                <input
                  type="text"
                  value={formData.neighborhood}
                  onChange={(e) => setFormData(prev => ({ ...prev, neighborhood: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="Digite o bairro"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cidade (opcional)
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="Digite a cidade"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estado (opcional)
                </label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                >
                  <option value="">Selecione o estado</option>
                  <option value="AC">Acre</option>
                  <option value="AL">Alagoas</option>
                  <option value="AP">Amapá</option>
                  <option value="AM">Amazonas</option>
                  <option value="BA">Bahia</option>
                  <option value="CE">Ceará</option>
                  <option value="DF">Distrito Federal</option>
                  <option value="ES">Espírito Santo</option>
                  <option value="GO">Goiás</option>
                  <option value="MA">Maranhão</option>
                  <option value="MT">Mato Grosso</option>
                  <option value="MS">Mato Grosso do Sul</option>
                  <option value="MG">Minas Gerais</option>
                  <option value="PA">Pará</option>
                  <option value="PB">Paraíba</option>
                  <option value="PR">Paraná</option>
                  <option value="PE">Pernambuco</option>
                  <option value="PI">Piauí</option>
                  <option value="RJ">Rio de Janeiro</option>
                  <option value="RN">Rio Grande do Norte</option>
                  <option value="RS">Rio Grande do Sul</option>
                  <option value="RO">Rondônia</option>
                  <option value="RR">Roraima</option>
                  <option value="SC">Santa Catarina</option>
                  <option value="SP">São Paulo</option>
                  <option value="SE">Sergipe</option>
                  <option value="TO">Tocantins</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CEP (opcional)
                </label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="submit"
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[48px] font-medium"
              >
                {editingEmployee ? 'Atualizar' : 'Cadastrar'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[48px] font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Desktop View - Tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CPF
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chave PIX
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cadastrado em
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{formatCPF(employee.cpf)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {employee.pix_key || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {new Date(employee.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      {hasPermission('employees.edit') && (
                        <button
                          onClick={() => handleEdit(employee)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors min-h-[44px] min-w-[44px]"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {hasPermission('employees.delete') && (
                        <button
                          onClick={() => handleDelete(employee)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors min-h-[44px] min-w-[44px]"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View - Cards */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredEmployees.map((employee) => (
            <div key={employee.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900">{employee.name}</h4>
                  <p className="text-xs text-gray-500 mt-1">CPF: {formatCPF(employee.cpf)}</p>
                  {employee.pix_key && (
                    <p className="text-xs text-gray-500 mt-1">PIX: {employee.pix_key}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Cadastrado em {new Date(employee.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                {hasPermission('employees.edit') && (
                  <button
                    onClick={() => handleEdit(employee)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors min-h-[48px]"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Editar</span>
                  </button>
                )}
                {hasPermission('employees.delete') && (
                  <button
                    onClick={() => handleDelete(employee)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors min-h-[48px]"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredEmployees.length === 0 && (
          <div className="text-center py-8">
            <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}
            </h3>
            <p className="text-gray-500">
              {searchTerm 
                ? 'Tente ajustar os termos de busca.' 
                : 'Clique em "Novo Funcionário" para começar.'
              }
            </p>
          </div>
        )}
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold flex items-center">
                <FileSpreadsheet className="w-5 h-5 mr-2 text-green-600" />
                Importar Funcionários em Massa
              </h3>
              <button
                onClick={handleCloseImportModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {importStep === 'upload' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Como funciona:</h4>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                      <li>Baixe a planilha template clicando no botão abaixo</li>
                      <li>Preencha com os dados dos funcionários (Nome, CPF e PIX opcional)</li>
                      <li>Salve o arquivo Excel</li>
                      <li>Faça o upload da planilha preenchida</li>
                    </ol>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      <span>Baixar Planilha Template</span>
                    </button>
                  </div>

                  <div className="border-t pt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Selecionar Arquivo Excel:
                    </label>

                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="cursor-pointer flex flex-col items-center"
                      >
                        <Upload className="w-12 h-12 text-gray-400 mb-3" />
                        <span className="text-sm text-gray-600 mb-1">
                          Clique para selecionar ou arraste o arquivo aqui
                        </span>
                        <span className="text-xs text-gray-500">
                          Formatos aceitos: .xlsx, .xls (máx. 5MB)
                        </span>
                      </label>
                    </div>

                    {importFile && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <FileSpreadsheet className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{importFile.name}</p>
                            <p className="text-xs text-gray-500">
                              {(importFile.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setImportFile(null)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-900 mb-2 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Atenção:
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                      <li>Nome deve ter pelo menos 3 caracteres</li>
                      <li>CPF deve ser válido e único</li>
                      <li>Chave PIX é opcional</li>
                      <li>CPFs duplicados serão ignorados</li>
                    </ul>
                  </div>
                </div>
              )}

              {importStep === 'preview' && importValidation && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-700">Funcionários Válidos</span>
                        <span className="text-2xl font-bold text-green-600">
                          {importValidation.valid.length}
                        </span>
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-red-700">Erros Encontrados</span>
                        <span className="text-2xl font-bold text-red-600">
                          {importValidation.errors.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {importValidation.valid.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                        Funcionários que serão importados:
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Nome
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  CPF
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Chave PIX
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {importValidation.valid.map((emp, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 text-sm text-gray-900">{emp.name}</td>
                                  <td className="px-4 py-2 text-sm text-gray-600">
                                    {formatCPF(emp.cpf)}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-600">
                                    {emp.pixKey || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {importValidation.errors.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900 flex items-center">
                          <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
                          Erros encontrados na planilha:
                        </h4>
                        <button
                          onClick={handleDownloadErrors}
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                        >
                          <Download className="w-4 h-4" />
                          <span>Baixar Relatório</span>
                        </button>
                      </div>
                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <div className="max-h-48 overflow-y-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-red-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">
                                  Linha
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">
                                  Campo
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">
                                  Erro
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {importValidation.errors.slice(0, 10).map((err, idx) => (
                                <tr key={idx}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{err.row}</td>
                                  <td className="px-4 py-2 text-sm text-gray-600">{err.field}</td>
                                  <td className="px-4 py-2 text-sm text-red-600">{err.message}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {importValidation.errors.length > 10 && (
                          <div className="bg-gray-50 px-4 py-2 text-sm text-gray-600 text-center">
                            ... e mais {importValidation.errors.length - 10} erro(s)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {importStep === 'result' && importResult && (
                <div className="space-y-6">
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                      <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      Importação Concluída!
                    </h3>
                    <p className="text-gray-600">
                      {importResult.success} de {importResult.success + importResult.errors} funcionários importados
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                      <div className="text-3xl font-bold text-green-600 mb-1">
                        {importResult.success}
                      </div>
                      <div className="text-sm text-green-700">Importados com Sucesso</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                      <div className="text-3xl font-bold text-red-600 mb-1">
                        {importResult.errors}
                      </div>
                      <div className="text-sm text-red-700">Erros</div>
                    </div>
                  </div>

                  {importResult.errors > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-sm text-yellow-800">
                        Um relatório detalhado com os erros foi baixado automaticamente.
                        Verifique os erros e tente importar novamente os funcionários que falharam.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t p-6 bg-gray-50">
              <div className="flex justify-end space-x-3">
                {importStep === 'upload' && (
                  <>
                    <button
                      onClick={handleCloseImportModal}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleProcessFile}
                      disabled={!importFile || importing}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
                      <span>{importing ? 'Processando...' : 'Processar Planilha'}</span>
                    </button>
                  </>
                )}

                {importStep === 'preview' && (
                  <>
                    <button
                      onClick={() => setImportStep('upload')}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={!importValidation || importValidation.valid.length === 0 || importing}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
                      <span>
                        {importing
                          ? 'Importando...'
                          : `Importar ${importValidation?.valid.length || 0} Funcionário(s)`}
                      </span>
                    </button>
                  </>
                )}

                {importStep === 'result' && (
                  <button
                    onClick={handleCloseImportModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Concluir
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