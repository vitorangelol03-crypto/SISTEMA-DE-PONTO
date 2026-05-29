import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Search, CreditCard as Edit2, Trash2, RefreshCw, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X, KeyRound, Clock, Briefcase, Calendar, Hash, Save } from 'lucide-react';
import { getAllEmployees, getAllEmployeesAcrossAllCompanies, createEmployee, updateEmployee, deleteEmployee, Employee, bulkCreateEmployees, setEmployeePin, resetEmployeePin, getCompanies } from '../../services/database';
import { supabase } from '../../lib/supabase';

const SCHEDULE_DAY_LABELS: ReadonlyArray<{ index: number; short: string; long: string }> = [
  { index: 0, short: 'Dom', long: 'Domingo' },
  { index: 1, short: 'Seg', long: 'Segunda' },
  { index: 2, short: 'Ter', long: 'Terça' },
  { index: 3, short: 'Qua', long: 'Quarta' },
  { index: 4, short: 'Qui', long: 'Quinta' },
  { index: 5, short: 'Sex', long: 'Sexta' },
  { index: 6, short: 'Sáb', long: 'Sábado' },
];

function minutesToHHMM(min: number): string {
  const safe = Number.isFinite(min) && min >= 0 ? min : 0;
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function hhmmToMinutes(s: string): number {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return 0;
  const [h, m] = s.split(':').map(Number);
  return (h * 60) + m;
}

function scheduleSum(schedule: number[]): number {
  return schedule.reduce((a, b) => a + (Number(b) || 0), 0);
}
import { validateCPF, formatCPF } from '../../utils/validation';
import { generateEmployeeTemplate, parseEmployeeSpreadsheet, generateErrorReport, generateImportReport, parsedToImportData, ImportValidationResult, EmployeeImportData } from '../../utils/employeeImport';
import { validateImportRow, normalizeCPF, type ValidationContext, type ImportRow } from '../../utils/employeeImportValidation';
import { useCompany } from '../../contexts/CompanyContext';
import { FunctionRoleInput } from '../common/FunctionRoleInput';
import toast from 'react-hot-toast';

interface EmployeesTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

export const EmployeesTab: React.FC<EmployeesTabProps> = ({ userId, hasPermission }) => {
  const { company } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    pixKey: '',
    pixType: '',
    employmentType: '',
    address: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
    // 2.8 — dados de jornada/contrato
    functionRole: '',
    badgeNumber: '',
    pis: '',
    scheduleType: '',
    markingCount: '' as '' | '2' | '4',  // '' = herda do default da empresa
    hireDate: '',
    contractType: '',
    expectedSchedule: null as number[] | null,  // null = herda da empresa
  });

  // Sub-modal de jornada individual do funcionário
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [tempSchedule, setTempSchedule] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  // 2.9 — edição em massa de marking_count
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMarkingModal, setShowBulkMarkingModal] = useState(false);
  const [bulkMarkingValue, setBulkMarkingValue] = useState<2 | 4>(2);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [pinModal, setPinModal] = useState<{ employee: Employee } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const [resetModal, setResetModal] = useState<{ employee: Employee } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importValidation, setImportValidation] = useState<ImportValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Combo H — sub-fase 2.19: contexto salvo pra revalidação após edição inline
  // (4 campos editáveis no preview: nome, cpf, pis, data_admissao).
  const [validationContext, setValidationContext] = useState<ValidationContext | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowNumber: number; field: string } | null>(null);

  const loadEmployees = React.useCallback(async () => {
    if (!company?.id) return;
    try {
      setLoading(true);
      const data = await getAllEmployees(undefined, company.id);
      setEmployees(data);
      setFilteredEmployees(data);
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
      toast.error('Erro ao carregar funcionários');
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Zera estados ID-based ao trocar empresa — evita vazamento de IDs/referências
  // de funcionários da empresa anterior (modais, bulk selection, wizard de import).
  // Resolve TECH_DEBT 6.22 (severidade alta) pra esta tab.
  useEffect(() => {
    setSelectedIds(new Set());
    setEditingEmployee(null);
    setShowForm(false);
    setPinModal(null);
    setPinInput('');
    setResetModal(null);
    setShowImportModal(false);
    setImportFile(null);
    setImportValidation(null);
    setImportStep('upload');
    setImportResult(null);
    setValidationContext(null);
    setEditingCell(null);
    setShowBulkMarkingModal(false);
    setShowScheduleModal(false);
    setTempSchedule([0, 0, 0, 0, 0, 0, 0]);
  }, [company?.id]);

  useEffect(() => {
    const filtered = employees.filter(employee => {
      const searchNumbers = searchTerm.replace(/\D/g, '');
      const nameMatch = searchTerm
        ? employee.name.toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      const cpfMatch = searchNumbers ? (employee.cpf ?? '').includes(searchNumbers) : false;
      const matchesSearch = !searchTerm || nameMatch || cpfMatch;

      const matchesCity = !cityFilter || employee.city?.toLowerCase().includes(cityFilter.toLowerCase());
      const matchesState = !stateFilter || employee.state === stateFilter;
      const matchesEmploymentType = !employmentTypeFilter || employee.employment_type === employmentTypeFilter;

      return matchesSearch && matchesCity && matchesState && matchesEmploymentType;
    });
    setFilteredEmployees(filtered);
  }, [searchTerm, cityFilter, stateFilter, employmentTypeFilter, employees]);

  const resetForm = () => {
    setFormData({
      name: '',
      cpf: '',
      pixKey: '',
      pixType: '',
      employmentType: '',
      address: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
      functionRole: '',
      badgeNumber: '',
      pis: '',
      scheduleType: '',
      markingCount: '',
      hireDate: '',
      contractType: '',
      expectedSchedule: null,
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

    // CPF é opcional. Se preenchido, precisa ser válido.
    const cpfTrimmed = formData.cpf.trim();
    if (cpfTrimmed && !validateCPF(cpfTrimmed)) {
      toast.error('CPF inválido');
      return;
    }

    if (!company?.id) {
      toast.error('Empresa não selecionada');
      return;
    }

    try {
      const cpfNumbers = cpfTrimmed ? formData.cpf.replace(/\D/g, '') : null;

      // Validações específicas dos campos novos (2.8)
      const pisDigits = formData.pis.replace(/\D/g, '');
      if (formData.pis && pisDigits.length === 0) {
        toast.error('PIS deve conter apenas números');
        return;
      }
      if (formData.hireDate) {
        const today = new Date().toISOString().slice(0, 10);
        if (formData.hireDate > today) {
          toast.error('Data de admissão não pode ser futura');
          return;
        }
      }

      const extras = {
        function_role: formData.functionRole.trim() || null,
        badge_number: formData.badgeNumber.trim() || null,
        pis: pisDigits || null,
        schedule_type: formData.scheduleType || null,
        marking_count: formData.markingCount === '' ? null : (Number(formData.markingCount) as 2 | 4),
        hire_date: formData.hireDate || null,
        contract_type: formData.contractType || null,
        expected_schedule: formData.expectedSchedule,
      };

      if (editingEmployee) {
        await updateEmployee(
          editingEmployee.id,
          formData.name.trim(),
          cpfNumbers,
          formData.pixKey.trim() || null,
          userId,
          formData.pixType.trim() || null,
          formData.employmentType.trim() || null,
          formData.address.trim() || null,
          formData.neighborhood.trim() || null,
          formData.city.trim() || null,
          formData.state.trim() || null,
          formData.zipCode.trim() || null,
          extras,
        );
        toast.success('Funcionário atualizado com sucesso!');
      } else {
        await createEmployee(
          formData.name.trim(),
          cpfNumbers,
          formData.pixKey.trim() || null,
          userId,
          formData.pixType.trim() || null,
          formData.employmentType.trim() || null,
          formData.address.trim() || null,
          formData.neighborhood.trim() || null,
          formData.city.trim() || null,
          formData.state.trim() || null,
          formData.zipCode.trim() || null,
          company.id,
          extras,
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
      employmentType: employee.employment_type || '',
      address: employee.address || '',
      neighborhood: employee.neighborhood || '',
      city: employee.city || '',
      state: employee.state || '',
      zipCode: employee.zip_code || '',
      functionRole: employee.function_role || '',
      badgeNumber: employee.badge_number || '',
      pis: employee.pis || '',
      scheduleType: employee.schedule_type || '',
      markingCount: employee.marking_count ? (String(employee.marking_count) as '2' | '4') : '',
      hireDate: employee.hire_date || '',
      contractType: employee.contract_type || '',
      expectedSchedule: employee.expected_schedule ?? null,
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
      // Combo H: passa defaults da empresa pra preencher exemplos no template.
      generateEmployeeTemplate({
        defaultMarkingCount: (company?.default_marking_count as 2 | 4 | undefined) ?? 2,
        defaultSchedule: company?.default_schedule ?? undefined,
        defaultContractType: 'CLT',
      });
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
    if (!company?.id) {
      toast.error('Empresa não selecionada');
      return;
    }

    try {
      setImporting(true);

      // Combo H: monta ValidationContext ANTES de chamar o parser. Cross-check
      // de CPFs e nomes de empresas via getAllEmployees() + getCompanies()
      // em paralelo. Validator novo (validateImportRow) usa esse contexto
      // pra classificar errors/warnings corretamente.
      // getAllEmployeesAcrossAllCompanies: cross-empresa intencional para detectar
      // duplicatas globais de CPF (employee.cpf é UNIQUE globalmente).
      const [thisCompanyEmployees, allEmployees, companies] = await Promise.all([
        getAllEmployees(undefined, company.id),
        getAllEmployeesAcrossAllCompanies(),
        getCompanies(),
      ]);

      const companyIdToName = new Map<string, string>();
      for (const c of companies) {
        companyIdToName.set(c.id, c.display_name || c.legal_name || 'Empresa');
      }

      const existingCpfsInCompany = new Set(
        thisCompanyEmployees.flatMap((e) => (e.cpf ? [normalizeCPF(e.cpf)] : [])),
      );
      const existingCpfsOtherCompanies = new Map<string, string>();
      for (const emp of allEmployees) {
        if (!emp.cpf) continue; // funcionário sem CPF não entra na dedupe por CPF
        const cpfNorm = normalizeCPF(emp.cpf);
        const empCompanyId = (emp as Employee & { company_id?: string }).company_id;
        if (empCompanyId && empCompanyId !== company.id && !existingCpfsInCompany.has(cpfNorm)) {
          existingCpfsOtherCompanies.set(
            cpfNorm,
            companyIdToName.get(empCompanyId) ?? 'Outra empresa',
          );
        }
      }

      const context: ValidationContext = {
        existingCpfsInCompany,
        existingCpfsOtherCompanies,
        companyDefaults: {
          default_marking_count: company.default_marking_count ?? 2,
          default_schedule: company.default_schedule ?? null,
        },
        cpfsInThisFile: new Set(),
      };

      const result = await parseEmployeeSpreadsheet(importFile, context);

      if (result.valid.length === 0 && result.errors.length === 0 && (result.rowDetails?.length ?? 0) === 0) {
        toast.error('Planilha vazia ou sem dados válidos');
        return;
      }

      setValidationContext(context);
      setImportValidation(result);
      setImportStep('preview');

      const blockedCount = result.existingInThisCompany?.length ?? 0;
      if (result.errors.length > 0 || blockedCount > 0) {
        toast.error(`${result.errors.length + blockedCount} linha(s) com problema`);
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

  /**
   * Reclassifica importValidation a partir de uma lista atualizada de rowDetails.
   * Usado após edição inline pra recompor valid/errors/existingInX sem
   * reler o Excel.
   */
  const rebuildValidationFromRowDetails = (details: ImportRow[]): ImportValidationResult => {
    const valid: EmployeeImportData[] = [];
    const rowsWithWarnings: ImportRow[] = [];
    const existingInThisCompany: EmployeeImportData[] = [];
    const existingInOtherCompany: EmployeeImportData[] = [];
    const errors: ImportValidationResult['errors'] = [];
    const duplicateCPFs: string[] = [];

    for (const r of details) {
      for (const err of r.errors) {
        errors.push({ row: r.rowNumber, field: err.field, message: err.message, value: '' });
        if (err.code === 'cpf_duplicate_in_file' && r.parsed.cpf) {
          duplicateCPFs.push(formatCPF(r.parsed.cpf));
        }
      }
      if (r.errors.some((e) => e.code === 'cpf_exists_in_company')) {
        existingInThisCompany.push(parsedToImportData(r.parsed));
        continue;
      }
      if (r.errors.length > 0) continue;

      const data = parsedToImportData(r.parsed);
      if (r.warnings.some((w) => w.code === 'cpf_exists_other_company')) {
        existingInOtherCompany.push(data);
      }
      valid.push(data);
      if (r.warnings.length > 0) rowsWithWarnings.push(r);
    }

    return {
      valid,
      errors,
      duplicateCPFs: Array.from(new Set(duplicateCPFs)),
      existingInThisCompany,
      existingInOtherCompany,
      rowDetails: details,
      rowsWithWarnings,
    };
  };

  /**
   * Edita inline um campo de uma linha e re-valida. Limitado a 4 campos
   * (nome, cpf, pis, data_admissao) pra escopo controlado.
   */
  const handleInlineEdit = (rowNumber: number, field: string, newValue: string) => {
    if (!importValidation?.rowDetails || !validationContext) return;

    const updatedDetails = importValidation.rowDetails.map((d) => {
      if (d.rowNumber !== rowNumber) return d;
      const newRaw = { ...d.rawData, [field]: newValue };
      // Reconstrói cpfsInThisFile EXCLUINDO esta linha — evita que ela acuse
      // "cpf_duplicate_in_file" de si mesma quando o CPF é editado.
      const ctxForThisRow: ValidationContext = {
        ...validationContext,
        cpfsInThisFile: new Set(
          importValidation.rowDetails!
            .filter((x) => x.rowNumber !== rowNumber)
            .map((x) => x.parsed.cpf)
            .filter((cpf): cpf is string => !!cpf),
        ),
      };
      return validateImportRow(newRaw, rowNumber, ctxForThisRow);
    });

    setImportValidation(rebuildValidationFromRowDetails(updatedDetails));
    setEditingCell(null);
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
    if (!company?.id) {
      toast.error('Empresa não selecionada');
      return;
    }

    try {
      setImporting(true);
      const result = await bulkCreateEmployees(importValidation.valid, userId, company.id);

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
    setValidationContext(null);
    setEditingCell(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSetPin = async () => {
    if (!pinModal) return;
    if (!/^\d{4,6}$/.test(pinInput)) {
      toast.error('PIN deve ser numérico com 4 a 6 dígitos');
      return;
    }
    setPinLoading(true);
    try {
      await setEmployeePin(pinModal.employee.id, pinInput);
      toast.success('PIN definido com sucesso!');
      setPinModal(null);
      setPinInput('');
      loadEmployees();
    } catch {
      toast.error('Erro ao definir PIN');
    } finally {
      setPinLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (!resetModal) return;
    setResetLoading(true);
    try {
      await resetEmployeePin(resetModal.employee.id);
      toast.success('PIN resetado com sucesso!');
      setResetModal(null);
      loadEmployees();
    } catch {
      toast.error('Erro ao resetar PIN');
    } finally {
      setResetLoading(false);
    }
  };

  // 2.9 — edição em massa de marking_count
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const allVisibleIds = filteredEmployees.map(e => e.id);
      const allSelected = allVisibleIds.every(id => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of allVisibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of allVisibleIds) next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleApplyBulkMarking = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from('employees')
        .update({ marking_count: bulkMarkingValue })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} funcionário(s) atualizado(s) — ${bulkMarkingValue} marcações`);
      setShowBulkMarkingModal(false);
      clearSelection();
      await loadEmployees();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro: ${msg}`);
    } finally {
      setBulkSaving(false);
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

            <div className="relative w-full">
              <select
                value={employmentTypeFilter}
                onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
              >
                <option value="">Todos os vínculos</option>
                <option value="Diarista">Diarista</option>
                <option value="Carteira Assinada">Carteira Assinada</option>
              </select>
            </div>
          </div>

          {(cityFilter || stateFilter || employmentTypeFilter) && (
            <div className="flex items-center gap-2 flex-wrap">
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
              {employmentTypeFilter && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  Vínculo: {employmentTypeFilter}
                  <button
                    onClick={() => setEmploymentTypeFilter('')}
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
                  setEmploymentTypeFilter('');
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
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-medium">
              {editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
            </h3>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                  CPF (opcional)
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => handleCPFChange(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  placeholder="000.000.000-00 (deixe em branco se não tiver)"
                  maxLength={14}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Vínculo (opcional)
                </label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData(prev => ({ ...prev, employmentType: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                >
                  <option value="">Selecione o tipo</option>
                  <option value="Diarista">Diarista</option>
                  <option value="Carteira Assinada">Carteira Assinada</option>
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

            {/* Sub-fase 2.8: jornada e contrato */}
            <div className="border-t border-gray-200 pt-4 mt-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-gray-500" />
                Jornada e contrato
                <span className="text-xs font-normal text-gray-500">(opcional)</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-gray-400" /> Função
                  </label>
                  <FunctionRoleInput
                    value={formData.functionRole}
                    onChange={(v) => setFormData(prev => ({ ...prev, functionRole: v }))}
                    companyId={company?.id}
                    placeholder={company?.default_function_role ?? 'Função padrão da empresa'}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-gray-400" /> Crachá
                  </label>
                  <input
                    type="text"
                    value={formData.badgeNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, badgeNumber: e.target.value }))}
                    placeholder="Número do crachá"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">PIS</label>
                  <input
                    type="text"
                    value={formData.pis}
                    onChange={(e) => setFormData(prev => ({ ...prev, pis: e.target.value.replace(/\D/g, '') }))}
                    placeholder="Apenas números"
                    inputMode="numeric"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de escala</label>
                  <select
                    value={formData.scheduleType}
                    onChange={(e) => setFormData(prev => ({ ...prev, scheduleType: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  >
                    <option value="">Selecione</option>
                    <option value="Normal">Normal</option>
                    <option value="12x36">12x36</option>
                    <option value="6x1">6x1</option>
                    <option value="Sob demanda">Sob demanda</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de contrato</label>
                  <select
                    value={formData.contractType}
                    onChange={(e) => setFormData(prev => ({ ...prev, contractType: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  >
                    <option value="">Selecione</option>
                    <option value="CLT">CLT</option>
                    <option value="Diarista">Diarista</option>
                    <option value="PJ">PJ</option>
                    <option value="Estagiário">Estagiário</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" /> Data de admissão
                  </label>
                  <input
                    type="date"
                    value={formData.hireDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, hireDate: e.target.value }))}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base min-h-[48px]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Marcações por dia</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['', '2', '4'] as const).map(opt => (
                      <label
                        key={opt || 'default'}
                        className={`flex items-center justify-center gap-2 px-3 py-3 border rounded-lg cursor-pointer min-h-[48px] text-sm ${
                          formData.markingCount === opt ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="employeeMarkingCount"
                          checked={formData.markingCount === opt}
                          onChange={() => setFormData(prev => ({ ...prev, markingCount: opt }))}
                          className="sr-only"
                        />
                        <span>
                          {opt === '' ? `Padrão (${company?.default_marking_count ?? 2})` : `${opt} marcações`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" /> Jornada individual
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const initialSchedule = formData.expectedSchedule
                        ?? (Array.isArray(company?.default_schedule)
                          ? [...(company!.default_schedule as number[])]
                          : [0, 0, 0, 0, 0, 0, 0]);
                      setTempSchedule(initialSchedule.length === 7 ? initialSchedule : [0, 0, 0, 0, 0, 0, 0]);
                      setShowScheduleModal(true);
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-left text-base min-h-[48px] hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className={formData.expectedSchedule ? 'text-gray-800 font-medium' : 'text-gray-500'}>
                      {formData.expectedSchedule
                        ? `Personalizada — ${minutesToHHMM(scheduleSum(formData.expectedSchedule))}/sem`
                        : 'Usar padrão da empresa'}
                    </span>
                    <Clock className="w-4 h-4 text-gray-400" />
                  </button>
                  {formData.expectedSchedule && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, expectedSchedule: null }))}
                      className="mt-1 text-xs text-blue-600 hover:underline"
                    >
                      Voltar ao padrão da empresa
                    </button>
                  )}
                </div>
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
                {hasPermission('employees.edit') && (
                  <th className="px-3 py-3 text-left w-12">
                    <input
                      type="checkbox"
                      checked={
                        filteredEmployees.length > 0 &&
                        filteredEmployees.every(e => selectedIds.has(e.id))
                      }
                      onChange={toggleSelectAllVisible}
                      className="w-4 h-4 rounded"
                      title="Selecionar todos visíveis"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CPF
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo de Vínculo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chave PIX
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PIN
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
                <tr key={employee.id} className={selectedIds.has(employee.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}>
                  {hasPermission('employees.edit') && (
                    <td className="px-3 py-4 w-12">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(employee.id)}
                        onChange={() => toggleSelect(employee.id)}
                        className="w-4 h-4 rounded"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{formatCPF(employee.cpf)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {employee.employment_type ? (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.employment_type === 'Diarista'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {employee.employment_type}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {employee.pix_key || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {employee.pin_configured ? (
                        <span className="text-sm font-medium text-green-700">Configurado ✓</span>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Não configurado</span>
                      )}
                      {hasPermission('employees.edit') && (
                        <>
                          <button
                            onClick={() => { setPinModal({ employee }); setPinInput(''); }}
                            className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                            title="Definir PIN"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {employee.pin_configured && (
                            <button
                              onClick={() => setResetModal({ employee })}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Resetar PIN"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
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
            <div key={employee.id} className="p-4 hover:bg-gray-50 overflow-hidden">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="text-sm font-medium text-gray-900 break-words">{employee.name}</h4>
                    {employee.employment_type && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        employee.employment_type === 'Diarista'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {employee.employment_type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 break-words">CPF: {formatCPF(employee.cpf)}</p>
                  {employee.pix_key && (
                    <p className="text-xs text-gray-500 mt-1 break-words">PIX: {employee.pix_key}</p>
                  )}
                  <p className="text-xs mt-1">
                    PIN:{' '}
                    {employee.pin_configured
                      ? <span className="text-green-700 font-medium">Configurado ✓</span>
                      : <span className="italic text-gray-400">Não configurado</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Cadastrado em {new Date(employee.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                {hasPermission('employees.edit') && (
                  <button
                    onClick={() => handleEdit(employee)}
                    className="w-full inline-flex items-center justify-center gap-1 px-2 py-3 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors min-h-[48px]"
                  >
                    <Edit2 className="w-4 h-4 flex-shrink-0" />
                    <span>Editar</span>
                  </button>
                )}
                {hasPermission('employees.edit') && (
                  <button
                    onClick={() => { setPinModal({ employee }); setPinInput(''); }}
                    className="w-full inline-flex items-center justify-center gap-1 px-2 py-3 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors min-h-[48px]"
                  >
                    <KeyRound className="w-4 h-4 flex-shrink-0" />
                    <span>PIN</span>
                  </button>
                )}
                {hasPermission('employees.edit') && employee.pin_configured && (
                  <button
                    onClick={() => setResetModal({ employee })}
                    className="w-full inline-flex items-center justify-center gap-1 px-2 py-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors min-h-[48px]"
                  >
                    <X className="w-4 h-4 flex-shrink-0" />
                    <span>Reset</span>
                  </button>
                )}
                {hasPermission('employees.delete') && (
                  <button
                    onClick={() => handleDelete(employee)}
                    className="w-full inline-flex items-center justify-center gap-1 px-2 py-3 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors min-h-[48px]"
                  >
                    <Trash2 className="w-4 h-4 flex-shrink-0" />
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

      {/* Modal de PIN */}
      {pinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-purple-600" />
                Definir PIN — {pinModal.employee.name.split(' ')[0]}
              </h3>
              <button onClick={() => setPinModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                O PIN é usado pelo funcionário para registrar o ponto na tela de auto-atendimento.
                Deve ter 4 a 6 dígitos numéricos.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Novo PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d*"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="4 a 6 dígitos"
                  maxLength={6}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-center text-xl font-mono tracking-widest focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSetPin}
                  disabled={pinLoading || pinInput.length < 4}
                  className="flex-1 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {pinLoading ? 'Salvando...' : 'Salvar PIN'}
                </button>
                <button
                  onClick={() => setPinModal(null)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de reset de PIN */}
      {resetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-red-700">
                <X className="w-5 h-5" />
                Resetar PIN
              </h3>
              <button onClick={() => setResetModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Tem certeza que deseja resetar o PIN de <strong>{resetModal.employee.name}</strong>?
                O funcionário precisará definir um novo PIN no próximo acesso.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleResetPin}
                  disabled={resetLoading}
                  className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {resetLoading ? 'Resetando...' : 'Confirmar Reset'}
                </button>
                <button
                  onClick={() => setResetModal(null)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b">
              <h3 className="text-base sm:text-xl font-semibold flex items-center min-w-0">
                <FileSpreadsheet className="w-5 h-5 mr-2 text-green-600 flex-shrink-0" />
                <span className="truncate">
                  Importar Funcionários em Massa
                  {company?.display_name && <span className="text-gray-500 font-normal"> — {company.display_name}</span>}
                </span>
              </h3>
              <button
                onClick={handleCloseImportModal}
                className="text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                          onClick={() => {
                            setImportFile(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
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
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-700">Prontos</span>
                        <span className="text-2xl font-bold text-green-600">
                          {importValidation.valid.length}
                        </span>
                      </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-amber-700">Com avisos</span>
                        <span className="text-2xl font-bold text-amber-600">
                          {importValidation.rowsWithWarnings?.length ?? 0}
                        </span>
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-red-700">Erros</span>
                        <span className="text-2xl font-bold text-red-600">
                          {importValidation.rowDetails
                            ? importValidation.rowDetails.filter((r) => r.errors.length > 0).length
                            : importValidation.errors.length}
                        </span>
                      </div>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-rose-700">Já nesta empresa</span>
                        <span className="text-2xl font-bold text-rose-600">
                          {importValidation.existingInThisCompany?.length ?? 0}
                        </span>
                      </div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-orange-700">Em outra empresa</span>
                        <span className="text-2xl font-bold text-orange-600">
                          {importValidation.existingInOtherCompany?.length ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {importValidation.valid.length === 0 && (importValidation.rowDetails?.length ?? 0) === 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
                      Nenhum funcionário válido para importar.
                    </div>
                  )}

                  {/* Modo combo H — tabela detalhada com cores semânticas + edição inline */}
                  {importValidation.rowDetails && importValidation.rowDetails.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                        Pré-visualização ({importValidation.rowDetails.length} linhas)
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="max-h-96 overflow-y-auto overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">CPF</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Função</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Crachá</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">PIS</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marc.</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Admissão</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {importValidation.rowDetails.map((r) => {
                                const hasError = r.errors.length > 0;
                                const hasWarning = r.warnings.length > 0;
                                const rowCls = hasError
                                  ? 'bg-red-50 border-l-4 border-red-500'
                                  : hasWarning
                                  ? 'bg-amber-50 border-l-4 border-amber-500'
                                  : '';
                                const errFor = (field: string) => r.errors.find((e) => e.field === field);

                                // Helper pra célula editável (escopo: nome, cpf, pis, data_admissao).
                                const renderEditable = (field: string, displayValue: string, currentRaw: string) => {
                                  const isEditing = editingCell?.rowNumber === r.rowNumber && editingCell.field === field;
                                  const err = errFor(field);
                                  if (isEditing) {
                                    return (
                                      <input
                                        type="text"
                                        defaultValue={currentRaw}
                                        autoFocus
                                        onBlur={(e) => handleInlineEdit(r.rowNumber, field, e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                          if (e.key === 'Escape') setEditingCell(null);
                                        }}
                                        className="w-full px-2 py-1 border border-blue-400 rounded text-sm"
                                      />
                                    );
                                  }
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => setEditingCell({ rowNumber: r.rowNumber, field })}
                                      title={err ? `${err.message} — clique para editar` : 'Clique para editar'}
                                      className={`text-left ${err ? 'text-red-700 underline decoration-red-400 decoration-dotted' : 'text-gray-700'}`}
                                    >
                                      {displayValue || <span className="text-gray-400 italic">vazio</span>}
                                    </button>
                                  );
                                };

                                const cpfDisplay = r.parsed.cpf ? formatCPF(r.parsed.cpf) : String(r.rawData['cpf'] ?? '');
                                const dateDisplay = r.parsed.hire_date ?? String(r.rawData['data_admissao'] ?? '');

                                return (
                                  <React.Fragment key={r.rowNumber}>
                                    <tr className={rowCls}>
                                      <td className="px-3 py-2 text-gray-500">{r.rowNumber}</td>
                                      <td className="px-3 py-2">
                                        {hasError ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                                            ❌ Erro
                                          </span>
                                        ) : hasWarning ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">
                                            ⚠️ Aviso
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
                                            ✅ Pronto
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        {renderEditable('nome', r.parsed.name, String(r.rawData['nome'] ?? r.parsed.name ?? ''))}
                                      </td>
                                      <td className="px-3 py-2">
                                        {renderEditable('cpf', cpfDisplay, String(r.rawData['cpf'] ?? r.parsed.cpf ?? ''))}
                                      </td>
                                      <td className="px-3 py-2 text-gray-700">{r.parsed.function_role ?? '-'}</td>
                                      <td className="px-3 py-2 text-gray-700">{r.parsed.badge_number ?? '-'}</td>
                                      <td className="px-3 py-2">
                                        {renderEditable('pis', r.parsed.pis ?? '', String(r.rawData['pis'] ?? r.parsed.pis ?? ''))}
                                      </td>
                                      <td className="px-3 py-2 text-gray-700">{r.parsed.marking_count ?? '-'}</td>
                                      <td className="px-3 py-2">
                                        {renderEditable('data_admissao', dateDisplay, String(r.rawData['data_admissao'] ?? r.parsed.hire_date ?? ''))}
                                      </td>
                                    </tr>
                                    {(hasError || hasWarning) && (
                                      <tr className={rowCls}>
                                        <td colSpan={9} className="px-3 pb-2 pt-0">
                                          <div className="text-xs space-y-0.5">
                                            {r.errors.map((e, i) => (
                                              <div key={`e${i}`} className="text-red-700">
                                                ❌ <strong>{e.field}:</strong> {e.message}
                                              </div>
                                            ))}
                                            {r.warnings.map((w, i) => (
                                              <div key={`w${i}`} className="text-amber-700">
                                                ⚠️ <strong>{w.field}:</strong> {w.message}
                                              </div>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Clique em campos sublinhados (nome, CPF, PIS, data) para corrigir inline. Tab/Enter aplica, Esc cancela.
                      </p>
                    </div>
                  )}

                  {/* Modo legacy — fallback quando rowDetails não foi populado (sem context) */}
                  {!importValidation.rowDetails && importValidation.valid.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                        Funcionários que serão importados:
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="max-h-64 overflow-y-auto overflow-x-auto">
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
                              {importValidation.valid.map((emp, idx) => {
                                const inOther = importValidation.existingInOtherCompany?.some(o => o.cpf === emp.cpf);
                                return (
                                  <tr key={idx} className={inOther ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                                    <td className="px-4 py-2 text-sm text-gray-900">
                                      {emp.name}
                                      {inOther && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 whitespace-nowrap">
                                          em outra empresa
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-600">
                                      {formatCPF(emp.cpf)}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-600">
                                      {emp.pixKey || '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {importValidation.existingInThisCompany && importValidation.existingInThisCompany.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2 text-rose-600" />
                        Já cadastrados nesta empresa (não importarão):
                      </h4>
                      <div className="border border-rose-200 rounded-lg overflow-hidden">
                        <div className="max-h-48 overflow-y-auto overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-rose-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-rose-700 uppercase">Nome</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-rose-700 uppercase">CPF</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {importValidation.existingInThisCompany.map((emp, idx) => (
                                <tr key={idx}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{emp.name}</td>
                                  <td className="px-4 py-2 text-sm text-gray-600">{formatCPF(emp.cpf)}</td>
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
                        <div className="max-h-48 overflow-y-auto overflow-x-auto">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 sm:p-6 text-center">
                      <div className="text-3xl font-bold text-green-600 mb-1">
                        {importResult.success}
                      </div>
                      <div className="text-sm text-green-700">Importados com Sucesso</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-6 text-center">
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

            <div className="border-t p-4 sm:p-6 bg-gray-50">
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                {importStep === 'upload' && (
                  <>
                    <button
                      onClick={handleCloseImportModal}
                      className="w-full sm:w-auto px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleProcessFile}
                      disabled={!importFile || importing}
                      className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
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
                      className="w-full sm:w-auto px-4 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={!importValidation || importValidation.valid.length === 0 || importing}
                      className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
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
                    className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors min-h-[44px]"
                  >
                    Concluir
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-modal: jornada individual do funcionário (sub-fase 2.8) */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-lg font-semibold flex items-center gap-2 text-gray-800">
                <Clock className="w-5 h-5 text-gray-500" />
                Jornada individual
              </h4>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-gray-400 hover:text-gray-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-xs text-gray-600">
                Defina a jornada esperada deste funcionário (HH:MM por dia). Sobrescreve o padrão da empresa.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {SCHEDULE_DAY_LABELS.map(({ index, short, long }) => (
                  <div key={index}>
                    <span className="block text-xs text-gray-600 mb-1">
                      <span className="hidden sm:inline">{long}</span>
                      <span className="sm:hidden">{short}</span>
                    </span>
                    <input
                      type="time"
                      value={minutesToHHMM(tempSchedule[index] ?? 0)}
                      onChange={e => {
                        const next = [...tempSchedule];
                        next[index] = hhmmToMinutes(e.target.value);
                        setTempSchedule(next);
                      }}
                      className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Total semanal: <strong>{minutesToHHMM(scheduleSum(tempSchedule))}</strong>
              </p>
            </div>
            <div className="p-4 sm:p-5 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium min-h-[40px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({ ...prev, expectedSchedule: [...tempSchedule] }));
                  setShowScheduleModal(false);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium min-h-[40px]"
              >
                <Save className="w-4 h-4" /> Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra flutuante de seleção (sub-fase 2.9) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3 max-w-[95vw]">
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="h-5 w-px bg-gray-700" />
          <button
            onClick={() => {
              setBulkMarkingValue(2);
              setShowBulkMarkingModal(true);
            }}
            className="text-sm font-medium hover:text-blue-300 transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <Edit2 className="w-4 h-4" /> Alterar marcações
          </button>
          <div className="h-5 w-px bg-gray-700" />
          <button
            onClick={clearSelection}
            className="text-sm text-gray-400 hover:text-white transition-colors whitespace-nowrap"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Modal: alterar marking_count em massa (sub-fase 2.9) */}
      {showBulkMarkingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-800">Alterar marcações</h4>
              <button
                onClick={() => !bulkSaving && setShowBulkMarkingModal(false)}
                className="text-gray-400 hover:text-gray-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
                disabled={bulkSaving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-sm text-gray-700">
                Definir marcações para <strong>{selectedIds.size}</strong> funcionário{selectedIds.size > 1 ? 's' : ''}:
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([2, 4] as const).map(n => (
                  <label
                    key={n}
                    className={`flex items-center justify-center gap-2 px-3 py-3 border rounded-lg cursor-pointer min-h-[48px] text-sm ${
                      bulkMarkingValue === n ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulkMarking"
                      checked={bulkMarkingValue === n}
                      onChange={() => setBulkMarkingValue(n)}
                      disabled={bulkSaving}
                    />
                    <span>{n} marcações</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="p-4 sm:p-5 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                onClick={() => setShowBulkMarkingModal(false)}
                disabled={bulkSaving}
                className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium disabled:opacity-50 min-h-[40px]"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyBulkMarking}
                disabled={bulkSaving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-50 min-h-[40px]"
              >
                <Save className="w-4 h-4" />
                {bulkSaving ? 'Aplicando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};