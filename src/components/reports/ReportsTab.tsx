import React, { useState, useEffect } from 'react';
import { BarChart3, Download, Filter, FileText, RefreshCw, Search, Printer } from 'lucide-react';
import { getAllEmployees, getAttendanceHistory, getPayments, Employee, Attendance, Payment } from '../../services/database';
import { formatDateBR } from '../../utils/dateUtils';
import * as XLSX from 'xlsx-js-style';
import toast from 'react-hot-toast';
import EmploymentTypeFilter, { EmploymentType, EmploymentTypeBadge } from '../common/EmploymentTypeFilter';

interface ReportsTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ hasPermission }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filteredAttendances, setFilteredAttendances] = useState<Attendance[]>([]);
  const [displayedAttendances, setDisplayedAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRejected, setShowRejected] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    employeeId: '',
    status: '' as '' | 'present' | 'absent',
    employmentType: 'all' as EmploymentType,
    approvalStatus: '' as '' | 'pending' | 'approved' | 'rejected' | 'manual'
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const employmentType = filters.employmentType === 'all' ? undefined : filters.employmentType;
      const [employeesData, attendancesData, paymentsData] = await Promise.all([
        getAllEmployees(employmentType),
        getAttendanceHistory(undefined, undefined, undefined, undefined, employmentType),
        getPayments(undefined, undefined, undefined, employmentType)
      ]);

      setEmployees(employeesData);
      setAttendances(attendancesData);
      setPayments(paymentsData);
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
  }, [filters.employmentType]);

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

    if (filters.approvalStatus) {
      filtered = filtered.filter(att => (att.approval_status ?? null) === filters.approvalStatus);
    }

    if (!showRejected) {
      filtered = filtered.filter(att => att.approval_status !== 'rejected');
    }

    setFilteredAttendances(filtered);
  }, [filters, attendances, showRejected]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setDisplayedAttendances(filteredAttendances);
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const searchNumbers = searchTerm.replace(/\D/g, '');
    
    const searched = filteredAttendances.filter(attendance => {
      if (!attendance.employees) return false;
      
      const nameMatch = attendance.employees.name.toLowerCase().includes(searchLower);
      const cpfMatch = searchNumbers && attendance.employees.cpf.includes(searchNumbers);
      return nameMatch || cpfMatch;
    });
    
    setDisplayedAttendances(searched);
  }, [searchTerm, filteredAttendances]);

  const getStatistics = () => {
    const total = displayedAttendances.length;
    const present = displayedAttendances.filter(att => att.status === 'present').length;
    const absent = displayedAttendances.filter(att => att.status === 'absent').length;
    const presenceRate = total > 0 ? ((present / total) * 100).toFixed(1) : '0';

    return { total, present, absent, presenceRate };
  };

  // Mapa rápido payment por "employeeId|date" para o dataset atual
  const paymentIndex = React.useMemo(() => {
    const map = new Map<string, Payment>();
    payments.forEach(p => map.set(`${p.employee_id}|${p.date}`, p));
    return map;
  }, [payments]);

  const getBonusForAttendance = (att: Attendance): { b: number; c1: number; c2: number } => {
    const payment = paymentIndex.get(`${att.employee_id}|${att.date}`);
    return {
      b: payment?.bonus_b ? parseFloat(payment.bonus_b.toString()) : 0,
      c1: payment?.bonus_c1 ? parseFloat(payment.bonus_c1.toString()) : 0,
      c2: payment?.bonus_c2 ? parseFloat(payment.bonus_c2.toString()) : 0,
    };
  };

  // Resumo do período agregado por funcionário (considera os attendances filtrados não-rejeitados)
  interface EmployeeSummary {
    employeeId: string;
    name: string;
    cpf: string;
    presentDays: number;
    bCount: number;
    bTotal: number;
    c1Count: number;
    c1Total: number;
    c2Count: number;
    c2Total: number;
  }

  const periodSummary = React.useMemo((): EmployeeSummary[] => {
    const rows = displayedAttendances.filter(att => att.approval_status !== 'rejected');
    const map = new Map<string, EmployeeSummary>();

    rows.forEach(att => {
      const key = att.employee_id;
      if (!map.has(key)) {
        map.set(key, {
          employeeId: att.employee_id,
          name: att.employees?.name ?? 'N/A',
          cpf: att.employees?.cpf ?? '',
          presentDays: 0,
          bCount: 0, bTotal: 0,
          c1Count: 0, c1Total: 0,
          c2Count: 0, c2Total: 0,
        });
      }
      const entry = map.get(key)!;
      if (att.status === 'present') entry.presentDays++;

      const { b, c1, c2 } = getBonusForAttendance(att);
      if (b > 0) { entry.bCount++; entry.bTotal += b; }
      if (c1 > 0) { entry.c1Count++; entry.c1Total += c1; }
      if (c2 > 0) { entry.c2Count++; entry.c2Total += c2; }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [displayedAttendances, paymentIndex]);

  const exportToPDF = () => {
    if (!hasPermission('reports.export')) {
      toast.error('Você não tem permissão para exportar relatórios');
      return;
    }

    const rows = displayedAttendances.filter(att => att.approval_status !== 'rejected');
    if (rows.length === 0) {
      toast.error('Nenhum registro para exportar');
      return;
    }

    const formatT = (iso: string | null | undefined) =>
      iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
    const formatH = (h: number | null | undefined) => {
      if (h == null) return '-';
      const hrs = Math.floor(h);
      const mins = Math.round((h - hrs) * 60);
      return `${hrs}h ${mins.toString().padStart(2, '0')}min`;
    };
    const approvalLabel: Record<string, string> = {
      pending: 'Pendente', approved: 'Aprovado', manual: 'Manual',
    };

    const formatMoney = (v: number) => v > 0 ? `R$ ${v.toFixed(2)}` : '-';

    const tableRows = rows.map(att => {
      const { b, c1, c2 } = getBonusForAttendance(att);
      return `
      <tr>
        <td>${formatDateBR(att.date)}</td>
        <td>${att.employees?.name ?? 'N/A'}</td>
        <td>${att.status === 'present' ? 'Presente' : 'Falta'}</td>
        <td>${formatT(att.entry_time)}</td>
        <td>${formatT(att.exit_time_full)}</td>
        <td>${formatH(att.hours_worked)}</td>
        <td>${formatH(att.night_hours)}</td>
        <td>${formatMoney(b)}</td>
        <td>${formatMoney(c1)}</td>
        <td>${formatMoney(c2)}</td>
        <td>${att.approval_status ? (approvalLabel[att.approval_status] ?? att.approval_status) : '-'}</td>
      </tr>`;
    }).join('');

    const summaryRows = periodSummary.map(s => `
      <tr>
        <td>${s.name}</td>
        <td>${s.presentDays}</td>
        <td>${s.bCount} / R$ ${s.bTotal.toFixed(2)}</td>
        <td>${s.c1Count} / R$ ${s.c1Total.toFixed(2)}</td>
        <td>${s.c2Count} / R$ ${s.c2Total.toFixed(2)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Ponto</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 20px; color: #111; }
    h1 { font-size: 14px; margin-bottom: 4px; }
    h2 { font-size: 12px; margin-top: 20px; margin-bottom: 6px; }
    p { font-size: 10px; color: #555; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { background: #2563EB; color: #fff; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
    td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10px; }
    tr:nth-child(even) td { background: #f9fafb; }
    table.summary th { background: #7C3AED; }
    @media print { @page { margin: 15mm; } }
  </style>
</head>
<body>
  <h1>Relatório de Ponto</h1>
  <p>Gerado em ${new Date().toLocaleString('pt-BR')} — ${rows.length} registro(s)</p>
  <table>
    <thead>
      <tr>
        <th>Data</th><th>Funcionário</th><th>Status</th>
        <th>Entrada</th><th>Saída</th><th>Horas</th>
        <th>Hs Noturnas</th><th>Bon. B</th><th>Bon. C1</th><th>Bon. C2</th><th>Aprovação</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <h2>Resumo do Período</h2>
  <table class="summary">
    <thead>
      <tr>
        <th>Funcionário</th>
        <th>Dias Presentes</th>
        <th>B (qtd / total)</th>
        <th>C1 (qtd / total)</th>
        <th>C2 (qtd / total)</th>
      </tr>
    </thead>
    <tbody>${summaryRows}</tbody>
  </table>
  <script>window.addEventListener('load', () => { window.print(); });<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Permita popups para exportar PDF');
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  const exportToExcel = () => {
    if (!hasPermission('reports.export')) {
      toast.error('Você não tem permissão para exportar relatórios');
      return;
    }

    try {
      const formatHoursExcel = (h: number | null) => {
        if (h == null) return '-';
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return `${hrs}h ${mins.toString().padStart(2, '0')}min`;
      };
      const formatTimeExcel = (iso: string | null) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      };
      const approvalLabel: Record<string, string> = {
        pending: 'Pendente', approved: 'Aprovado', manual: 'Manual'
      };

      // Excluir rejected do export
      const exportRows = displayedAttendances.filter(att => att.approval_status !== 'rejected');

      const headers = [
        'Data', 'Funcionário', 'CPF', 'Status', 'Entrada', 'Saída',
        'Horas Trabalhadas', 'Horas Noturnas', 'Adicional Noturno',
        'Bon. B', 'Bon. C1', 'Bon. C2',
        'Aprovação',
        'Horário Saída (legado)', 'Marcado por'
      ];

      // Índice da coluna "Aprovação" (0-based)
      const approvalColIdx = headers.indexOf('Aprovação');

      const wb = XLSX.utils.book_new();
      const ws: XLSX.WorkSheet = {};

      // Estilos do cabeçalho
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '2563EB' } },
        alignment: { horizontal: 'center' as const },
        border: {
          bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
          right:  { style: 'thin', color: { rgb: 'CCCCCC' } },
        },
      };

      // Escreve cabeçalho
      headers.forEach((h, c) => {
        const cell = XLSX.utils.encode_cell({ r: 0, c });
        ws[cell] = { v: h, t: 's', s: headerStyle };
      });

      // Escreve dados com estilos condicionais na coluna Aprovação
      exportRows.forEach((att, rowIdx) => {
        const r = rowIdx + 1;
        const approvalStatus = att.approval_status ?? '';
        const { b, c1, c2 } = getBonusForAttendance(att);
        const values = [
          formatDateBR(att.date),
          att.employees?.name || 'N/A',
          att.employees?.cpf || 'N/A',
          att.status === 'present' ? 'Presente' : 'Falta',
          formatTimeExcel(att.entry_time ?? null),
          formatTimeExcel(att.exit_time_full ?? null),
          formatHoursExcel(att.hours_worked ?? null),
          formatHoursExcel(att.night_hours ?? null),
          att.night_additional != null ? `R$ ${Number(att.night_additional).toFixed(2)}` : '-',
          b > 0 ? `R$ ${b.toFixed(2)}` : '-',
          c1 > 0 ? `R$ ${c1.toFixed(2)}` : '-',
          c2 > 0 ? `R$ ${c2.toFixed(2)}` : '-',
          approvalLabel[approvalStatus] ?? (approvalStatus || '-'),
          att.exit_time || '-',
          att.marked_by || '-',
        ];

        values.forEach((val, c) => {
          const cell = XLSX.utils.encode_cell({ r, c });
          const baseStyle = {
            border: {
              bottom: { style: 'thin', color: { rgb: 'EEEEEE' } },
              right:  { style: 'thin', color: { rgb: 'EEEEEE' } },
            },
          };

          if (c === approvalColIdx) {
            const approvalFill: Record<string, string> = {
              pending:  'FFF176',
              approved: 'C8E6C9',
              manual:   'F5F5F5',
            };
            const bgColor = approvalFill[approvalStatus];
            ws[cell] = {
              v: val, t: 's',
              s: bgColor
                ? { ...baseStyle, fill: { fgColor: { rgb: bgColor } }, alignment: { horizontal: 'center' as const } }
                : { ...baseStyle, alignment: { horizontal: 'center' as const } },
            };
          } else {
            ws[cell] = { v: val, t: 's', s: baseStyle };
          }
        });
      });

      // Define range da sheet
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: exportRows.length, c: headers.length - 1 } });

      ws['!cols'] = [
        { wch: 12 }, { wch: 28 }, { wch: 15 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
        { wch: 16 },
        { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 16 }, { wch: 12 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Ponto');

      // Segunda aba: Resumo do Período
      const summaryHeaders = [
        'Funcionário', 'CPF', 'Dias Presentes',
        'Qtd B', 'Total B (R$)',
        'Qtd C1', 'Total C1 (R$)',
        'Qtd C2', 'Total C2 (R$)'
      ];
      const wsSummary: XLSX.WorkSheet = {};
      summaryHeaders.forEach((h, c) => {
        const cell = XLSX.utils.encode_cell({ r: 0, c });
        wsSummary[cell] = {
          v: h, t: 's',
          s: {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '7C3AED' } },
            alignment: { horizontal: 'center' as const },
            border: {
              bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
              right:  { style: 'thin', color: { rgb: 'CCCCCC' } },
            },
          },
        };
      });

      periodSummary.forEach((s, rowIdx) => {
        const r = rowIdx + 1;
        const values = [
          s.name,
          s.cpf,
          s.presentDays,
          s.bCount,
          Number(s.bTotal.toFixed(2)),
          s.c1Count,
          Number(s.c1Total.toFixed(2)),
          s.c2Count,
          Number(s.c2Total.toFixed(2)),
        ];
        values.forEach((val, c) => {
          const cell = XLSX.utils.encode_cell({ r, c });
          const isNumeric = typeof val === 'number';
          wsSummary[cell] = {
            v: val, t: isNumeric ? 'n' : 's',
            s: {
              border: {
                bottom: { style: 'thin', color: { rgb: 'EEEEEE' } },
                right:  { style: 'thin', color: { rgb: 'EEEEEE' } },
              },
            },
          };
        });
      });

      wsSummary['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: periodSummary.length, c: summaryHeaders.length - 1 }
      });
      wsSummary['!cols'] = [
        { wch: 28 }, { wch: 15 }, { wch: 14 },
        { wch: 8 }, { wch: 14 },
        { wch: 8 }, { wch: 14 },
        { wch: 8 }, { wch: 14 }
      ];

      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

      const fileName = `relatorio-ponto-${new Date().toISOString().split('T')[0]}.xlsx`;
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
      status: '',
      employmentType: 'all',
      approvalStatus: ''
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
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as '' | 'present' | 'absent' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              <option value="present">Presente</option>
              <option value="absent">Falta</option>
            </select>
          </div>

          <EmploymentTypeFilter
            value={filters.employmentType}
            onChange={(value) => setFilters(prev => ({ ...prev, employmentType: value }))}
            showLabel={true}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aprovação
            </label>
            <select
              value={filters.approvalStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, approvalStatus: e.target.value as typeof filters.approvalStatus }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              <option value="pending">🟡 Pendente</option>
              <option value="approved">✅ Aprovado</option>
              <option value="rejected">❌ Rejeitado</option>
              <option value="manual">📝 Manual</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={clearFilters}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Limpar Filtros
          </button>

          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showRejected}
              onChange={(e) => setShowRejected(e.target.checked)}
              className="w-4 h-4 accent-red-500"
            />
            Mostrar rejeitados
          </label>

          <button
            onClick={exportToExcel}
            disabled={!hasPermission('reports.export') || displayedAttendances.length === 0}
            title={!hasPermission('reports.export') ? 'Você não tem permissão para exportar relatórios' : ''}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors disabled:bg-gray-300"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Excel</span>
          </button>

          <button
            onClick={exportToPDF}
            disabled={!hasPermission('reports.export') || displayedAttendances.length === 0}
            title={!hasPermission('reports.export') ? 'Você não tem permissão para exportar relatórios' : ''}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors disabled:bg-gray-300"
          >
            <Printer className="w-4 h-4" />
            <span>Exportar PDF</span>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Funcionário</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saída</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hs Noturnas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adic. Noturno</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bon. B</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bon. C1</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bon. C2</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aprovação</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 text-sm">
              {displayedAttendances.map((attendance) => {
                const formatT = (iso: string | null | undefined) =>
                  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                const formatH = (h: number | null | undefined) => {
                  if (h == null) return '-';
                  const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60);
                  return `${hrs}h ${mins.toString().padStart(2, '0')}min`;
                };
                const approvalBadge: Record<string, { label: string; cls: string }> = {
                  pending:  { label: '🟡 Pendente',  cls: 'bg-yellow-100 text-yellow-800' },
                  approved: { label: '✅ Aprovado',  cls: 'bg-green-100 text-green-800' },
                  rejected: { label: '❌ Rejeitado', cls: 'bg-red-100 text-red-800' },
                  manual:   { label: '📝 Manual',    cls: 'bg-gray-100 text-gray-700' },
                };
                const ab = attendance.approval_status ? approvalBadge[attendance.approval_status] : null;
                const { b: bonusB, c1: bonusC1, c2: bonusC2 } = getBonusForAttendance(attendance);

                return (
                  <tr key={attendance.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                      {formatDateBR(attendance.date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{attendance.employees?.name || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{attendance.employees?.cpf || ''}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                        attendance.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {attendance.status === 'present' ? 'Presente' : 'Falta'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatT(attendance.entry_time)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatT(attendance.exit_time_full)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatH(attendance.hours_worked)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatH(attendance.night_hours)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {attendance.night_additional != null && attendance.night_additional > 0
                        ? `R$ ${Number(attendance.night_additional).toFixed(2)}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {bonusB > 0 ? `R$ ${bonusB.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {bonusC1 > 0 ? `R$ ${bonusC1.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {bonusC2 > 0 ? `R$ ${bonusC2.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ab ? (
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${ab.cls}`}>
                          {ab.label}
                        </span>
                      ) : <span className="text-gray-400 text-xs">-</span>}
                    </td>
                  </tr>
                );
              })}
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

      {periodSummary.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-purple-50">
            <h3 className="text-lg font-medium text-purple-900 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-purple-600" />
              Resumo do Período ({periodSummary.length} funcionário{periodSummary.length !== 1 ? 's' : ''})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-purple-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Funcionário</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Dias Presentes</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">B (qtd / total)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">C1 (qtd / total)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">C2 (qtd / total)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                {periodSummary.map((s) => (
                  <tr key={s.employeeId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-500">{s.cpf}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-gray-900">
                      {s.presentDays}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                      {s.bCount > 0 ? (
                        <span>
                          <span className="font-medium text-gray-900">{s.bCount}</span>
                          <span className="text-gray-500"> / </span>
                          <span className="font-medium text-green-700">R$ {s.bTotal.toFixed(2)}</span>
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                      {s.c1Count > 0 ? (
                        <span>
                          <span className="font-medium text-gray-900">{s.c1Count}</span>
                          <span className="text-gray-500"> / </span>
                          <span className="font-medium text-green-700">R$ {s.c1Total.toFixed(2)}</span>
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                      {s.c2Count > 0 ? (
                        <span>
                          <span className="font-medium text-gray-900">{s.c2Count}</span>
                          <span className="text-gray-500"> / </span>
                          <span className="font-medium text-green-700">R$ {s.c2Total.toFixed(2)}</span>
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-purple-50">
                <tr>
                  <td className="px-4 py-3 font-semibold text-purple-900">TOTAL</td>
                  <td className="px-4 py-3 text-center font-semibold text-purple-900">
                    {periodSummary.reduce((sum, s) => sum + s.presentDays, 0)}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-purple-900">
                    {periodSummary.reduce((sum, s) => sum + s.bCount, 0)}
                    <span className="text-purple-700"> / </span>
                    R$ {periodSummary.reduce((sum, s) => sum + s.bTotal, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-purple-900">
                    {periodSummary.reduce((sum, s) => sum + s.c1Count, 0)}
                    <span className="text-purple-700"> / </span>
                    R$ {periodSummary.reduce((sum, s) => sum + s.c1Total, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-purple-900">
                    {periodSummary.reduce((sum, s) => sum + s.c2Count, 0)}
                    <span className="text-purple-700"> / </span>
                    R$ {periodSummary.reduce((sum, s) => sum + s.c2Total, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};