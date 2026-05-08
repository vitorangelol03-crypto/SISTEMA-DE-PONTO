/**
 * Sub-fase 2.15: dialog que permite supervisor gerar espelhos em massa.
 *
 * Filtros: período (date range com atalhos) + funcionários (multi-select com "todos").
 * Saída: 1 PDF único com 1 página por funcionário, gerado client-side via jsPDF.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, FileText, X, Download } from 'lucide-react';
import {
  getAllEmployees,
  getAttendanceHistory,
  Employee,
  Company,
} from '../../services/database';
import { buildMirrorData } from '../../utils/mirrorGenerator';
import { downloadMirrorsBatchPdf } from '../../utils/mirrorPdf';
import toast from 'react-hot-toast';

interface MirrorMassDialogProps {
  open: boolean;
  onClose: () => void;
  company: Company;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function brtNow(): { y: number; m: number } {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return { y: brt.getUTCFullYear(), m: brt.getUTCMonth() + 1 };
}

function rangeFor(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

function currentMonthRange(): { start: string; end: string } {
  const { y, m } = brtNow();
  return rangeFor(y, m);
}

function previousMonthRange(): { start: string; end: string } {
  const { y, m } = brtNow();
  return m === 1 ? rangeFor(y - 1, 12) : rangeFor(y, m - 1);
}

export const MirrorMassDialog: React.FC<MirrorMassDialogProps> = ({ open, onClose, company }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const initial = currentMonthRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingEmployees(true);
    getAllEmployees(undefined, company.id)
      .then(emps => {
        if (cancelled) return;
        setEmployees(emps);
      })
      .catch(err => {
        console.error('Erro ao carregar funcionários:', err);
        toast.error('Erro ao carregar funcionários.');
      })
      .finally(() => { if (!cancelled) setLoadingEmployees(false); });
    return () => { cancelled = true; };
  }, [open, company.id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase().trim();
    const qDigits = search.replace(/\D/g, '');
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) || (qDigits && e.cpf.includes(qDigits)),
    );
  }, [employees, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(e => selected.has(e.id));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const e of filtered) next.delete(e.id);
      } else {
        for (const e of filtered) next.add(e.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleQuickRange = (range: { start: string; end: string }) => {
    setStart(range.start);
    setEnd(range.end);
  };

  const handleGenerate = async () => {
    if (selected.size === 0) {
      toast.error('Selecione ao menos 1 funcionário.');
      return;
    }
    if (start > end) {
      toast.error('Data inicial deve ser ≤ data final.');
      return;
    }
    setGenerating(true);
    setProgress({ done: 0, total: selected.size });
    try {
      const targetEmployees = employees.filter(e => selected.has(e.id));
      const dataList = [];
      for (let i = 0; i < targetEmployees.length; i++) {
        const emp = targetEmployees[i];
        const attendances = await getAttendanceHistory(start, end, emp.id, undefined, undefined, company.id);
        const data = buildMirrorData({
          employee: emp,
          company,
          period: { start, end },
          attendances,
        });
        dataList.push(data);
        setProgress({ done: i + 1, total: targetEmployees.length });
      }
      const filename = `espelhos-${company.display_name.replace(/\s+/g, '_')}-${start}-a-${end}.pdf`;
      await downloadMirrorsBatchPdf(dataList, filename);
      toast.success(`${dataList.length} espelho(s) gerado(s).`);
      onClose();
    } catch (err) {
      console.error('Erro ao gerar espelhos:', err);
      toast.error('Erro ao gerar espelhos.');
    } finally {
      setGenerating(false);
      setProgress({ done: 0, total: 0 });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Gerar espelhos em massa</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Período</p>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => handleQuickRange(currentMonthRange())}
                className="flex-1 px-3 py-2 text-xs font-medium border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                Mês atual
              </button>
              <button
                type="button"
                onClick={() => handleQuickRange(previousMonthRange())}
                className="flex-1 px-3 py-2 text-xs font-medium border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                Mês anterior
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">De</label>
                <input
                  type="date"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Até</label>
                <input
                  type="date"
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">
                Funcionários ({selected.size} de {employees.length})
              </p>
              <button
                type="button"
                onClick={toggleAll}
                disabled={filtered.length === 0}
                className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
              >
                {allFilteredSelected ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
              </button>
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm mb-2"
            />
            <div className="border-2 border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {loadingEmployees ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center py-4 text-sm text-gray-500">Nenhum funcionário encontrado.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filtered.map(emp => (
                    <li key={emp.id}>
                      <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(emp.id)}
                          onChange={() => toggleOne(emp.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{emp.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{emp.cpf}</p>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 min-w-0 flex-1">
            {generating && progress.total > 0 && (
              <span>
                Gerando {progress.done}/{progress.total}…
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="px-4 py-2 border-2 border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || selected.size === 0}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-bold flex items-center gap-2"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><Download className="w-4 h-4" /> Gerar PDF ({selected.size})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
